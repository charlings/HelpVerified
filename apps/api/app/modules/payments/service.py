"""Placement fees and agency subscriptions through Paystack (database.md §7, ADR 0017).

Value is granted in one place, `_settle_with`, and only after Paystack's own record (a fresh `verify`)
confirms status, amount and currency, whatever a webhook, redirect or customer claims. Every success entry
point (webhook, browser return, reconciliation and watch jobs, retries) goes through `settle`.

Checkout attempts (ADR 0017, "Attempt transitions"): an attempt row and its reference are committed before
Paystack is called, no database lock is held during any Paystack call, and the outcome is recorded by
compare-and-set in a second short transaction. An ambiguous outcome is reconciled by re-initialising the
same reference (one reference never makes two transactions, D1/D2), never by a fresh one.

Settlement applies a payment only while the hold is valid at the database clock (OD1); otherwise, or if
the placement is already paid, the payment becomes `refund_due` with a tracked refund and an admin alert.
A refund is complete only when Paystack confirms `processed` (section D).

Lock order everywhere: placement, then payment, then refund, then alert (section G).
"""

import json
import secrets
import uuid
from contextlib import suppress
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal, NoReturn

from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.dates import add_months
from app.core.errors import (
    AgencyNotActive,
    BadRequest,
    CheckoutAttemptsExhausted,
    CheckoutInProgress,
    HoldExpired,
    IllegalTransition,
    NotFound,
    PaymentProviderError,
    PaymentProviderRejected,
    PaymentProviderUnavailable,
    TransactionNotFound,
    Unauthenticated,
)
from app.core.logging import get_logger
from app.core.pagination import PageParams
from app.db.errors import pg_error
from app.integrations.payments import Checkout
from app.integrations.paystack import (
    DUPLICATE_REFERENCE,
    TRANSACTION_REVERSED,
    Initialized,
    PaystackApi,
    RemoteRefund,
    Verified,
    valid_signature,
)
from app.modules.admin.models import AlertKind
from app.modules.admin.repository import AlertRepository
from app.modules.agencies.models import Agency, AgencyStatus, Subscription, SubscriptionStatus
from app.modules.agencies.repository import AgencyRepository
from app.modules.families.repository import FamilyRepository
from app.modules.notifications import messages
from app.modules.notifications.repository import NotificationRepository
from app.modules.payments.models import (
    SETTLED,
    ClosedReason,
    Payment,
    PaymentKind,
    PaymentRefund,
    PaymentStatus,
    RefundStatus,
)
from app.modules.payments.repository import PaymentRepository, RefundRepository, WebhookEventRepository
from app.modules.payments.schemas import BillingSubscription, PaymentOut, PaymentVerification
from app.modules.placements.models import EndReason, Placement, PlacementStatus
from app.modules.placements.repository import PlacementRepository
from app.modules.placements.service import PlacementService
from app.modules.users.models import User
from app.modules.users.repository import UserRepository

log = get_logger("app.payments")

PROVIDER = "paystack"
PLACEMENT_CALLBACK_PATH = "/family/payments/callback"  # web routes.family.paymentCallback
BILLING_CALLBACK_PATH = "/agency/billing"  # web routes.agency.billing
PLAN_NAME = "Agency monthly"
MAX_ATTEMPTS = 3  # ck_payments_attempt_no: a proposed fixed cap awaiting owner confirmation (OD3 rule 10)
BACKOFF = (30, 60, 120, 300, 600, 1800)  # seconds between reconciliations of an `unknown` attempt (A9)
WATCH_FAST = timedelta(minutes=15)  # first 24 hours of watching, then hourly (section E; provisional)
WATCH_SLOW = timedelta(hours=1)
SETTLE_TRIES = 3  # bounded fresh-transaction retries (section G; provisional)
LIST_PAGE_SIZE = 50
LIST_MAX_PAGES = 20
# Paystack transaction statuses (D7, O2, O5)
PAYING = {"ongoing", "pending", "processing", "queued"}
REVERSING = {"reversal-pending", "reversed"}
UNPAID = {"abandoned", "failed"}
# Paystack refund statuses (D12) → ours
REFUND_STATE = {
    "pending": RefundStatus.pending,
    "processing": RefundStatus.processing,
    "needs-attention": RefundStatus.needs_attention,
    "failed": RefundStatus.provider_failed,
    "processed": RefundStatus.processed,
}
REFUND_EVENTS = {
    "refund.pending",
    "refund.processing",
    "refund.processed",
    "refund.failed",
    "refund.needs-attention",
}
# Paystack subscription statuses → ours
REMOTE_STATUS = {
    "active": SubscriptionStatus.active,
    "non-renewing": SubscriptionStatus.non_renewing,
    "attention": SubscriptionStatus.past_due,
    "completed": SubscriptionStatus.cancelled,
    "cancelled": SubscriptionStatus.cancelled,
}
SUBSCRIPTION_EVENTS = {
    "subscription.create": SubscriptionStatus.active,
    "subscription.enable": SubscriptionStatus.active,
    "subscription.not_renew": SubscriptionStatus.non_renewing,
    "subscription.disable": SubscriptionStatus.cancelled,
    "invoice.payment_failed": SubscriptionStatus.past_due,
}

Outcome = Initialized | PaymentProviderError
DomainErrorLike = HoldExpired | IllegalTransition | PaymentProviderError
ReplayDecision = Literal["replay", "current", "paid", "expired"]


def new_reference(prefix: str) -> str:
    return f"HV-{prefix}-{secrets.token_hex(6).upper()}"


def scrub(event: dict[str, Any]) -> dict[str, Any]:
    """What's stored of an event: no card authorization (its code can charge the card again), no IP."""
    data = dict(event.get("data") or {})
    for key in ("authorization", "ip_address", "log", "fees_split"):
        data.pop(key, None)
    return {"event": event.get("event"), "data": data}


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


@dataclass(frozen=True)
class _Call:
    """An attempt committed in T1, to be initialised outside any transaction."""

    reference: str
    amount_kobo: int
    placement_id: uuid.UUID
    payment_id: uuid.UUID


class PaymentService:
    def __init__(self, session: AsyncSession, settings: Settings, paystack: PaystackApi) -> None:
        self.session = session
        self.settings = settings
        self.paystack = paystack
        self.payments = PaymentRepository(session)
        self.refunds = RefundRepository(session)
        self.alerts = AlertRepository(session)
        self.webhooks = WebhookEventRepository(session)
        self.placements = PlacementRepository(session)
        self.families = FamilyRepository(session)
        self.agencies = AgencyRepository(session)
        self.users = UserRepository(session)
        self.notices = NotificationRepository(session)

    # Placement fee: checkout (PlacementService.accept calls this as its PaymentGateway)

    async def start_placement_checkout(self, placement_id: uuid.UUID, payer_email: str) -> Checkout:
        """The hold's open checkout, or a new attempt (ADR 0017 OD3 rules 7-11, AT1-AT10).

        Bounded: at most a reconciliation pass, a preflight of earlier attempts, and one retry after a
        concurrent conflict, then a decision."""
        preflight_done = reconciled = False
        conflicts = 0
        for _ in range(4):
            try:
                plan = await self._checkout_plan(placement_id, preflight_done=preflight_done)
            except DBAPIError as exc:
                error = pg_error(exc)
                if error.sqlstate == "23514" and error.constraint == "ck_payments_attempt_no":
                    await self._exhausted(placement_id)
                if error.sqlstate == "23505" and conflicts == 0:
                    conflicts += 1  # another request inserted an attempt first: look again
                    continue
                if error.sqlstate == "23505":
                    raise CheckoutInProgress(details={"placement_id": str(placement_id)}) from exc
                raise
            if isinstance(plan, Checkout):
                return plan
            action, value = plan
            if action == "exhausted":
                await self._exhausted(placement_id)
            elif action == "reconcile":
                if reconciled:  # reconciled once already and still unresolved: report it, don't loop
                    raise PaymentProviderUnavailable()
                reconciled = True
                await self.reconcile_attempt(str(value))
            elif action == "preflight":
                verdict = await self._preflight(value)
                if verdict == "blocked":
                    raise PaymentProviderUnavailable()
                preflight_done = verdict == "ok"
            elif action == "call":
                return await self._initialise_and_record(value, payer_email)
        raise PaymentProviderUnavailable()

    async def _checkout_plan(
        self, placement_id: uuid.UUID, *, preflight_done: bool
    ) -> Checkout | tuple[str, Any]:
        """T1: decide under the placement lock. Inserting the attempt happens here, so I4 and the attempt
        cap are checked against the locked placement (the indexes back both up)."""
        async with self.session.begin():
            placement = await self.placements.get(placement_id, for_update=True)
            if placement is None:
                raise NotFound()
            db_now = await self.payments.db_now()
            self._require_payable(placement, db_now)
            active = await self.payments.active_attempt(placement_id, for_update=True)
            if active is not None:
                if active.status is PaymentStatus.open and active.authorization_url:
                    return Checkout(active.authorization_url, active.paystack_reference)
                stale = db_now - timedelta(seconds=self.settings.CHECKOUT_STALE_SECONDS)
                if active.status is PaymentStatus.initiating and active.created_at > stale:
                    raise CheckoutInProgress(details={"placement_id": str(placement_id)})
                return ("reconcile", active.paystack_reference)
            earlier = [
                a.paystack_reference
                for a in await self.payments.attempts(placement_id)
                if a.status in (PaymentStatus.failed, PaymentStatus.rejected, PaymentStatus.orphaned)
            ]
            if earlier and not preflight_done:
                return ("preflight", earlier)
            attempt_no = await self.payments.next_attempt_no(placement_id)
            if attempt_no > MAX_ATTEMPTS:
                return ("exhausted", attempt_no - 1)
            family = await self.families.get(placement.family_id)
            assert family is not None  # noqa: S101  # FK
            payment = await self.payments.add(
                Payment(
                    kind=PaymentKind.placement_fee,
                    status=PaymentStatus.initiating,
                    attempt_no=attempt_no,
                    payer_user_id=family.user_id,
                    placement_id=placement_id,
                    amount_kobo=self.settings.PLACEMENT_FEE_KOBO,
                    paystack_reference=new_reference("PF"),
                )
            )
            return ("call", _Call(payment.paystack_reference, payment.amount_kobo, placement_id, payment.id))

    async def _exhausted(self, placement_id: uuid.UUID) -> NoReturn:
        async with self.session.begin():
            await self._alert(
                AlertKind.checkout_unresolved,
                f"placement:{placement_id}",
                {"reason": "attempt cap reached", "attempts": MAX_ATTEMPTS},
            )
        raise CheckoutAttemptsExhausted(details={"placement_id": str(placement_id), "attempts": MAX_ATTEMPTS})

    async def _preflight(self, references: list[str]) -> Literal["ok", "replan", "blocked"]:
        """OD3 rule 3: before a new reference, every earlier attempt is verified. A success is settled
        (the next plan then sees a paid placement); anything paying or contradictory blocks."""
        for reference in references:
            try:
                verified = await self.paystack.verify(reference)
            except TransactionNotFound:
                continue  # a refused initialise (O3): nothing to pay
            except PaymentProviderError:
                return "blocked"
            await self._record_verify(reference, verified)
            if verified.status == "success":
                await self.settle(reference)
                return "replan"
            if verified.status in PAYING or verified.status in REVERSING:
                async with self.session.begin():
                    payment = await self.payments.by_reference(reference)
                    await self._alert(
                        AlertKind.checkout_unresolved,
                        f"reference:{reference}",
                        {"reason": "earlier attempt still in progress", "provider_status": verified.status},
                        payment.id if payment else None,
                    )
                return "blocked"
        return "ok"

    async def _initialise_and_record(self, call: _Call, payer_email: str) -> Checkout:
        outcome = await self._initialise(call, payer_email)
        if isinstance(outcome, PaymentProviderRejected) and outcome.provider_code != DUPLICATE_REFERENCE:
            # A3: a definite refusal is confirmed once with the same reference before it counts.
            outcome = await self._initialise(call, payer_email)
        result = await self._record_initialise(call.reference, outcome)
        if isinstance(result, Checkout):
            return result
        raise result

    async def _initialise(self, call: _Call, payer_email: str) -> Outcome:
        channels = [c.strip() for c in (self.settings.PAYSTACK_FEE_CHANNELS or "").split(",") if c.strip()]
        try:
            return await self.paystack.initialize(
                email=payer_email,
                amount_kobo=call.amount_kobo,
                reference=call.reference,
                callback_url=f"{self.settings.WEB_BASE_URL.rstrip('/')}{PLACEMENT_CALLBACK_PATH}",
                metadata={
                    "kind": "placement_fee",
                    "placement_id": str(call.placement_id),
                    "payment_id": str(call.payment_id),
                },
                channels=channels or None,
            )
        except PaymentProviderError as error:
            return error

    async def _record_initialise(self, reference: str, outcome: Outcome) -> Checkout | DomainErrorLike:
        """T2 (AT2-AT6, AT10a-c): compare-and-set from the state actually found; a link is returned only
        while the placement is still payable. Returns the checkout, or the error the caller should raise."""
        now = utcnow()
        error: DomainErrorLike
        async with self.session.begin():
            payment, placement = await self._lock_attempt(reference)
            db_now = await self.payments.db_now()
            payable = self._payable(placement, db_now)
            if isinstance(outcome, Initialized):
                if payment.status in (PaymentStatus.initiating, PaymentStatus.unknown) and payable:
                    payment.status = PaymentStatus.open
                    payment.authorization_url = outcome.authorization_url
                    payment.next_reconcile_at = None
                    return Checkout(outcome.authorization_url, reference)
                if payment.status is PaymentStatus.open and payment.authorization_url and payable:
                    return Checkout(payment.authorization_url, reference)
                if payment.status in (PaymentStatus.initiating, PaymentStatus.unknown, PaymentStatus.closed):
                    # AT3 / AT10a: keep the link for monitoring, never hand it out.
                    payment.authorization_url = payment.authorization_url or outcome.authorization_url
                    payment.status = PaymentStatus.closed
                    payment.closed_reason = payment.closed_reason or self._closed_reason(placement, db_now)
                    self._watch(payment, now)
                error = self._not_payable(placement, db_now)
            elif (
                isinstance(outcome, PaymentProviderRejected) and outcome.provider_code == DUPLICATE_REFERENCE
            ):
                if payment.status is PaymentStatus.initiating:  # AT7 follows, in reconciliation
                    payment.status = PaymentStatus.unknown
                    payment.next_reconcile_at = now
                    self._watch(payment, now)
                error = PaymentProviderUnavailable()
            elif isinstance(outcome, PaymentProviderRejected) and not isinstance(
                outcome, TransactionNotFound
            ):
                if payment.status in (PaymentStatus.initiating, PaymentStatus.unknown):  # AT4 / AT8 / AT10b
                    if payment.status is PaymentStatus.unknown and not payable:
                        pass  # AT10b: no confirming retry for an ineligible placement; verify only
                    else:
                        payment.status = PaymentStatus.rejected
                        payment.provider_code = outcome.provider_code
                        self._watch(payment, now)
                error = PaymentProviderRejected()
            else:  # unreachable, timeout, 5xx, unreadable (AT5)
                if payment.status is PaymentStatus.initiating:
                    payment.status = PaymentStatus.unknown
                    payment.next_reconcile_at = now + timedelta(seconds=BACKOFF[0])
                    self._watch(payment, now)
                error = PaymentProviderUnavailable()
        return error

    async def resume_checkout(self, user: User, placement_id: uuid.UUID) -> Checkout:
        """POST /placements/{id}/pay: the same checkout again, never a second charge."""
        async with self.session.begin():
            family = await self.families.for_user(user.id)
            placement = await self.placements.get(placement_id)
            if family is None or placement is None or placement.family_id != family.id:
                raise NotFound()
        return await self.start_placement_checkout(placement_id, user.email)

    async def replay_decision(
        self, user: User, placement_id: uuid.UUID, reference: str | None
    ) -> ReplayDecision:
        """The idempotency replay rule (ADR 0017, OD2): a stored accept or /pay response is replayed only
        while its hold is live and its attempt is still `open`."""
        async with self.session.begin():
            family = await self.families.for_user(user.id)
            placement = await self.placements.get(placement_id)
            if family is None or placement is None or placement.family_id != family.id:
                raise NotFound()
            db_now = await self.payments.db_now()
            if self._payable(placement, db_now):
                payment = await self.payments.by_reference(reference) if reference else None
                live = bool(
                    payment is not None and payment.status is PaymentStatus.open and payment.authorization_url
                )
                return "replay" if live else "current"
            if placement.status in (PlacementStatus.trial, PlacementStatus.confirmed, PlacementStatus.ended):
                return "paid"
            return "expired"

    # Placement fee: reconciliation of ambiguous attempts (AT6-AT8, AT16)

    async def reconcile_attempt(self, reference: str) -> None:
        """An `unknown` (or stale `initiating`) attempt. While the hold is payable, the same reference is
        initialised again (AT6-AT9); afterwards only verify is used (no new payable transactions)."""
        now = utcnow()
        async with self.session.begin():
            payment, placement = await self._lock_attempt(reference)
            db_now = await self.payments.db_now()
            stale = db_now - timedelta(seconds=self.settings.CHECKOUT_STALE_SECONDS)
            if payment.status is PaymentStatus.initiating:
                if payment.created_at > stale:
                    return  # still in flight elsewhere
                payment.status = PaymentStatus.unknown  # A4
                self._watch(payment, now)
            elif payment.status is not PaymentStatus.unknown:
                return
            payable = self._payable(placement, db_now)
            payer = await self.users.get(payment.payer_user_id)
            call = _Call(reference, payment.amount_kobo, placement.id, payment.id)
        if payable and payer is not None:
            outcome = await self._initialise(call, payer.email)
            if isinstance(outcome, PaymentProviderRejected) and outcome.provider_code == DUPLICATE_REFERENCE:
                await self._resolve_existing(reference)
            else:
                await self._record_initialise(reference, outcome)  # the next request returns any link
        else:
            await self._resolve_existing(reference)
        await self._backoff_if_unknown(reference)

    async def _resolve_existing(self, reference: str) -> None:
        """AT7 / AT10c / AT16: a transaction exists (or may). Verify it: a success is settled; unpaid with no
        link stored → `orphaned`; paying or contradictory → stays `unknown` with an alert."""
        try:
            verified = await self.paystack.verify(reference)
        except TransactionNotFound:
            return  # may be a read-after-write delay (U4): changes nothing
        except PaymentProviderError:
            return
        await self._record_verify(reference, verified)
        if verified.status == "success":
            await self.settle(reference)
            return
        async with self.session.begin():
            payment, _ = await self._lock_attempt(reference)
            if payment.status is not PaymentStatus.unknown:
                return
            if verified.status in UNPAID and not payment.authorization_url:
                payment.status = PaymentStatus.orphaned
                payment.next_reconcile_at = utcnow() + WATCH_FAST
            elif verified.status in PAYING or verified.status in REVERSING:
                await self._alert(
                    AlertKind.checkout_unresolved,
                    f"payment:{payment.id}",
                    {
                        "reason": "transaction in progress with no link delivered",
                        "provider_status": verified.status,
                    },
                    payment.id,
                )

    async def _backoff_if_unknown(self, reference: str) -> None:
        async with self.session.begin():
            payment = await self.payments.by_reference(reference, for_update=True)
            if payment is None or payment.status is not PaymentStatus.unknown:
                return
            step = min(payment.reconcile_attempts, len(BACKOFF) - 1)
            payment.reconcile_attempts += 1
            payment.next_reconcile_at = utcnow() + timedelta(seconds=BACKOFF[step])

    # Settlement: the one place value is granted (section B)

    async def settle(self, reference: str) -> None:
        """Verify outside any transaction, then decide under the locks. Retries are bounded and run in a fresh
        transaction (section G): a constraint or trigger refusal forces the refund path on the retry."""
        try:
            verified = await self.paystack.verify(reference)
        except TransactionNotFound:
            log.info("payment.settle_not_found")
            return
        allow_apply = True
        for attempt in range(SETTLE_TRIES):
            try:
                refund_id = await self._settle_with(reference, verified, allow_apply=allow_apply)
            except DBAPIError as exc:
                error = pg_error(exc)
                log.warning("payment.settle_retry", sqlstate=error.sqlstate, hint=error.hint, attempt=attempt)
                if error.sqlstate == "23505" or error.hint in ("HOLD_EXPIRED", "ILLEGAL_TRANSITION"):
                    allow_apply = False  # the database refused to apply: refund it instead
                    continue
                if error.sqlstate in ("40P01", "40001"):
                    continue
                break
            else:
                if refund_id is not None:
                    await self._advance_quietly(refund_id)
                return
        async with self.session.begin():
            payment = await self.payments.by_reference(reference)
            await self._alert(
                AlertKind.settlement_failed,
                f"reference:{reference}",
                {"provider_status": verified.status},
                payment.id if payment else None,
            )
        raise PaymentProviderUnavailable()  # the webhook answers 502, so Paystack redelivers (D9)

    async def _settle_with(
        self, reference: str, verified: Verified, *, allow_apply: bool
    ) -> uuid.UUID | None:
        """Returns the id of a refund it created (so it can be submitted right away)."""
        now = utcnow()
        async with self.session.begin():
            unlocked = await self.payments.by_reference(reference)
            if unlocked is None:
                if verified.status == "success":
                    await self._alert(
                        AlertKind.unmatched_charge,
                        f"reference:{reference}",
                        {"amount_kobo": verified.amount_kobo, "currency": verified.currency},
                    )
                log.info("payment.unknown_reference")  # e.g. a renewal Paystack created itself
                return None
            if unlocked.kind is PaymentKind.subscription:
                await self._settle_subscription(reference, verified, now)
                return None
            assert unlocked.placement_id is not None  # noqa: S101  # ck_payments_kind_target
            placement = await self.placements.get(unlocked.placement_id, for_update=True)
            payment = await self.payments.by_reference(reference, for_update=True)
            assert placement is not None  # noqa: S101
            assert payment is not None  # noqa: S101
            self._apply_verify(payment, verified, now)
            if payment.status in SETTLED:
                return None  # already settled (idempotent)
            if verified.status == "failed" and payment.status is PaymentStatus.open:
                payment.status = PaymentStatus.failed  # AT9: authoritative failure (OD3 rules 1-2)
                self._watch(payment, now)
                return None
            if verified.status != "success":
                return None
            if verified.amount_kobo != payment.amount_kobo or verified.currency != "NGN":
                log.warning("payment.mismatch", payment_id=str(payment.id))
                return None
            payment.paid_at = verified.paid_at or now
            db_now = await self.payments.db_now()
            paid_already = await self.payments.has_succeeded(placement.id, other_than=payment.id) or (
                placement.status in (PlacementStatus.trial, PlacementStatus.confirmed, PlacementStatus.ended)
            )
            if allow_apply and self._payable(placement, db_now) and not paid_already:
                payment.status = PaymentStatus.succeeded  # AT11
                payment.next_reconcile_at = None
                payment.watch_until = None
                await self.payments.deactivate_attempts(
                    placement.id, ClosedReason.superseded, self._watch_end(now), now, except_id=payment.id
                )  # AT14
                await self.session.flush()
                await self._placements().begin_trial_locked(placement, now)
                log.info("payment.settled", payment_id=str(payment.id), status="succeeded")
                return None
            payment.status = PaymentStatus.refund_due  # AT12 / AT13
            payment.next_reconcile_at = None
            await self.session.flush()
            refund = await self.refunds.add(
                PaymentRefund(payment_id=payment.id, amount_kobo=payment.amount_kobo, next_check_at=now)
            )
            late = not paid_already
            await self._alert(
                AlertKind.late_payment if late else AlertKind.duplicate_charge,
                f"payment:{payment.id}",
                {"placement_id": str(placement.id), "amount_kobo": payment.amount_kobo},
                payment.id,
            )
            parties = await self.notices.placement_parties(placement.id)
            await self.notices.add(
                parties.family_user_id,
                messages.payment_refunded(parties.worker_name, payment.amount_kobo)
                if late
                else messages.duplicate_payment_refunding(parties.worker_name, payment.amount_kobo),
            )
            log.info("payment.settled", payment_id=str(payment.id), status="refund_due")
            return refund.id

    async def _settle_subscription(self, reference: str, verified: Verified, now: datetime) -> None:
        payment = await self.payments.by_reference(reference, for_update=True)
        assert payment is not None  # noqa: S101
        if payment.status in SETTLED or verified.status != "success":
            return
        if verified.amount_kobo != payment.amount_kobo or verified.currency != "NGN":
            log.warning("payment.mismatch", payment_id=str(payment.id))
            return
        payment.status = PaymentStatus.success
        payment.paid_at = verified.paid_at or now
        assert payment.agency_id is not None  # noqa: S101
        await self._activate(payment.agency_id, payment.paid_at)

    # Watching for late payments (section E)

    async def watch_checkouts(self) -> int:
        """Inactive attempts are verified until `watch_until`; a success goes through `settle`. A backstop
        for missed webhooks, not proof that a link stopped being payable (OD5)."""
        now = utcnow()
        async with self.session.begin():
            due = await self.payments.due_for_watch(now)
        checked = 0
        for reference in due:
            try:
                verified = await self.paystack.verify(reference)
            except PaymentProviderError:
                await self._next_watch(reference, now)
                continue
            await self._record_verify(reference, verified)
            if verified.status == "success":
                with suppress(PaymentProviderError):  # settle raised its own alert; try again next run
                    await self.settle(reference)
            await self._next_watch(reference, now)
            checked += 1
        return checked

    async def _next_watch(self, reference: str, now: datetime) -> None:
        async with self.session.begin():
            payment = await self.payments.by_reference(reference, for_update=True)
            if payment is None or payment.watch_until is None:
                return
            started = payment.watch_until - timedelta(days=self.settings.CHECKOUT_WATCH_DAYS)
            payment.next_reconcile_at = now + (
                WATCH_FAST if now - started < timedelta(hours=24) else WATCH_SLOW
            )

    async def reconcile_checkouts(self) -> int:
        """`unknown` and stale `initiating` attempts (section A); at the end of the window, an attempt still
        `unknown` stays so and raises `checkout_unresolved`."""
        now = utcnow()
        stale_before = now - timedelta(seconds=self.settings.CHECKOUT_STALE_SECONDS)
        async with self.session.begin():
            due = await self.payments.due_for_reconcile(now, stale_before)
        for reference in due:
            try:
                await self.reconcile_attempt(reference)
            except PaymentProviderError:
                await self._backoff_if_unknown(reference)
        async with self.session.begin():
            for payment in await self.payments.unknown_past_window(now):
                await self._alert(
                    AlertKind.checkout_unresolved,
                    f"payment:{payment.id}",
                    {"reason": "still unknown at the end of the watch window"},
                    payment.id,
                )
        return len(due)

    # Refunds (section D)

    async def retry_refunds(self) -> int:
        """The refund_retry job: advances every refund that's due a step (RT2-RT13)."""
        async with self.session.begin():
            due = await self.refunds.due(utcnow())
        advanced = 0
        for refund_id in due:
            advanced += int(await self._advance_quietly(refund_id))
        return advanced

    async def _advance_quietly(self, refund_id: uuid.UUID) -> bool:
        try:
            return await self.advance_refund(refund_id)
        except PaymentProviderError:
            return False

    async def advance_refund(self, refund_id: uuid.UUID) -> bool:
        """One step of a refund. Locks payment, then refund (no path locks a refund first)."""
        now = utcnow()
        action: str | None = None
        async with self.session.begin():
            payment, refund = await self._lock_refund(refund_id)
            if refund.status is RefundStatus.requested:
                refund.status = RefundStatus.submitting  # RT2: committed before the call
                refund.submitted_at = now
                action = "submit"
            elif refund.status is RefundStatus.submitting:
                limit = timedelta(minutes=self.settings.REFUND_RECHECK_MINUTES)
                if refund.submitted_at is None or now - refund.submitted_at >= limit:
                    refund.status = RefundStatus.uncertain  # RT4: the process died mid-call
                    refund.next_check_at = now
                return False
            elif refund.status is RefundStatus.uncertain:
                action = "reconcile"
            elif refund.status in (
                RefundStatus.pending,
                RefundStatus.processing,
                RefundStatus.needs_attention,
            ):
                action = "fetch" if refund.paystack_refund_id else "reconcile"
            else:
                return False
            reference, amount = payment.paystack_reference, refund.amount_kobo
        if action == "submit":
            return await self._submit_refund(refund_id, reference, amount)
        if action == "fetch":
            return await self._fetch_refund(refund_id)
        return await self._reconcile_refund(refund_id)

    async def _submit_refund(self, refund_id: uuid.UUID, reference: str, amount_kobo: int) -> bool:
        try:
            remote = await self.paystack.refund(reference, amount_kobo)
        except PaymentProviderRejected as error:
            async with self.session.begin():
                payment, refund = await self._lock_refund(refund_id)
                if refund.status is not RefundStatus.submitting:
                    return False
                refund.provider_code = error.provider_code
                if error.provider_code == TRANSACTION_REVERSED:
                    refund.status = RefundStatus.uncertain  # RT5: a refund may already exist (O6)
                    refund.next_check_at = utcnow()
                else:
                    refund.status = RefundStatus.provider_declined  # RT6
                    await self._refund_attention(payment, refund)
            return False
        except PaymentProviderError:
            async with self.session.begin():
                _, refund = await self._lock_refund(refund_id)
                if refund.status is RefundStatus.submitting:
                    refund.status = RefundStatus.uncertain  # RT4: maybe processed; never re-sent blindly
                    refund.next_check_at = utcnow()
            return False
        return await self._mirror(refund_id, remote, expected=(RefundStatus.submitting,))

    async def _fetch_refund(self, refund_id: uuid.UUID) -> bool:
        async with self.session.begin():
            refund = await self.refunds.get(refund_id)
            assert refund is not None  # noqa: S101
            paystack_id = refund.paystack_refund_id
        assert paystack_id is not None  # noqa: S101
        remote = await self.paystack.fetch_refund(paystack_id)
        return await self._mirror(
            refund_id,
            remote,
            expected=(
                RefundStatus.pending,
                RefundStatus.processing,
                RefundStatus.needs_attention,
                RefundStatus.uncertain,
            ),
        )

    async def _reconcile_refund(self, refund_id: uuid.UUID) -> bool:
        """The recovery algorithm for an `uncertain` refund (section D). Never resubmits blindly."""
        now = utcnow()
        async with self.session.begin():
            payment, refund = await self._lock_refund(refund_id)
            if refund.paystack_refund_id is not None:
                paystack_id: int | None = refund.paystack_refund_id
            else:
                paystack_id = None
            reference = payment.paystack_reference
            transaction_id = payment.paystack_transaction_id
            amount = refund.amount_kobo
            since = (refund.submitted_at or refund.created_at).date() - timedelta(days=1)
            known = await self.refunds.known_paystack_ids()
            age = now - (refund.submitted_at or refund.created_at)
        if paystack_id is not None:
            return await self._fetch_refund(refund_id)
        try:
            candidates = await self._find_refunds(reference, transaction_id, amount, since, known)
        except PaymentProviderError:
            await self._escalate_if_old(refund_id, age)
            return False
        if len(candidates) == 1:
            return await self._mirror(refund_id, candidates[0], expected=(RefundStatus.uncertain,))
        if len(candidates) > 1:
            await self._to_review(refund_id, {"reason": "several matching refunds", "count": len(candidates)})
            return False
        try:
            verified = await self.paystack.verify(reference)
        except PaymentProviderError:
            verified = None
        if verified is not None and verified.status in REVERSING:
            # A reversal shows, but no refund matched: contradictory, so a person checks.
            await self._to_review(refund_id, {"reason": "transaction reversing but no refund matched"})
            return False
        async with self.session.begin():
            payment, refund = await self._lock_refund(refund_id)
            if refund.status is not RefundStatus.uncertain:
                return False
            refund.clean_checks += 1
            refund.next_check_at = now + timedelta(minutes=self.settings.REFUND_RECHECK_MINUTES)
            resubmit = (
                refund.clean_checks >= 2 and refund.resubmissions == 0 and self.settings.REFUND_AUTO_RESUBMIT
            )
            if resubmit:
                refund.status = RefundStatus.submitting  # RT9 (gate open only after owner approval)
                refund.resubmissions = 1
                refund.submitted_at = now
                reference_now, amount_now = payment.paystack_reference, refund.amount_kobo
        if resubmit:
            return await self._submit_refund(refund_id, reference_now, amount_now)
        await self._escalate_if_old(refund_id, age)
        return False

    async def _find_refunds(
        self, reference: str, transaction_id: int | None, amount_kobo: int, since: date, known: set[int]
    ) -> list[RemoteRefund]:
        """Candidates from Paystack's refund list, matched on our side: same transaction (reference or id),
        same amount, not already linked to another refund row (section D step 3). Paging, timestamps and
        filtering are subject to provider verification (#13a), so every page is read."""
        until = utcnow().date() + timedelta(days=1)
        found: list[RemoteRefund] = []
        page = 1
        while page <= LIST_MAX_PAGES:
            result = await self.paystack.list_refunds(
                transaction_id=transaction_id, since=since, until=until, page=page, per_page=LIST_PAGE_SIZE
            )
            for item in result.items:
                same_transaction = item.transaction_reference == reference or (
                    transaction_id is not None and item.transaction_id == transaction_id
                )
                if same_transaction and item.amount_kobo == amount_kobo and item.id not in known:
                    found.append(item)
            if page >= result.page_count:
                break
            page += 1
        return found

    async def _mirror(
        self, refund_id: uuid.UUID, remote: RemoteRefund, *, expected: tuple[RefundStatus, ...]
    ) -> bool:
        """Records Paystack's refund state (RT3, RT7, RT10). Only `processed` completes a refund (R-f)."""
        now = utcnow()
        state = REFUND_STATE.get(remote.status)
        async with self.session.begin():
            payment, refund = await self._lock_refund(refund_id)
            if refund.status not in expected:
                return False
            refund.paystack_refund_id = refund.paystack_refund_id or remote.id
            refund.provider_status = remote.status
            refund.provider_checked_at = now
            refund.next_check_at = now + timedelta(minutes=self.settings.REFUND_RECHECK_MINUTES)
            if state is None:
                log.warning("refund.unknown_status")
                return False
            refund.status = state
            if state is RefundStatus.processed:
                refund.processed_at = now
                refund.next_check_at = None
                await self.session.flush()
                await self._complete_if_refunded(payment, now)
            elif state in (RefundStatus.provider_failed, RefundStatus.needs_attention):
                if state is RefundStatus.provider_failed:
                    refund.next_check_at = None
                await self._refund_attention(payment, refund)
            else:
                age = now - (refund.submitted_at or refund.created_at)
                if age > timedelta(days=self.settings.REFUND_PENDING_ESCALATE_DAYS):
                    await self._alert(
                        AlertKind.refund_stuck,
                        f"refund:{refund.id}",
                        {"provider_status": remote.status},
                        payment.id,
                    )
            return True

    async def _complete_if_refunded(self, payment: Payment, now: datetime) -> None:
        """AT18: `refunded` only when every refund owed back is confirmed `processed`."""
        if payment.status is not PaymentStatus.refund_due:
            return
        if await self.refunds.processed_total(payment.id) < payment.amount_kobo:
            return
        payment.status = PaymentStatus.refunded
        payment.refunded_at = now
        await self.alerts.resolve_by_system(
            [
                AlertKind.late_payment,
                AlertKind.duplicate_charge,
                AlertKind.refund_attention,
                AlertKind.refund_stuck,
                AlertKind.refund_admin_review,
                AlertKind.legacy_unresolved,
            ],
            f"payment:{payment.id}",
            "Resolved by the system: Paystack confirmed the refund processed.",
            now,
        )
        await self.notices.add(
            payment.payer_user_id,
            messages.refund_completed(payment.amount_kobo),
            f"refund_completed:{payment.id}",
        )

    async def _refund_attention(self, payment: Payment, refund: PaymentRefund) -> None:
        await self._alert(
            AlertKind.refund_attention,
            f"payment:{payment.id}",
            {
                "refund_id": str(refund.id),
                "status": refund.status.value,
                "provider_code": refund.provider_code,
            },
            payment.id,
        )
        await self.notices.add(
            payment.payer_user_id,
            messages.refund_needs_attention(refund.amount_kobo),
            f"refund_attention:{refund.id}:{refund.status.value}",
        )

    async def _to_review(self, refund_id: uuid.UUID, details: dict[str, Any]) -> None:
        async with self.session.begin():
            payment, refund = await self._lock_refund(refund_id)
            if refund.status is not RefundStatus.uncertain:
                return
            refund.status = RefundStatus.admin_review  # RT8
            refund.next_check_at = None
            await self._alert(AlertKind.refund_admin_review, f"payment:{payment.id}", details, payment.id)

    async def _escalate_if_old(self, refund_id: uuid.UUID, age: timedelta) -> None:
        if age > timedelta(hours=self.settings.REFUND_UNCERTAIN_ESCALATE_HOURS):
            await self._to_review(refund_id, {"reason": "uncertain past the escalation threshold"})

    async def attach_refund(self, payment_id: uuid.UUID, paystack_refund_id: int) -> None:
        """RT12(a): an admin names the refund they found or made in the Paystack dashboard. It's confirmed
        with Paystack first and must belong to this payment."""
        remote = await self.paystack.fetch_refund(paystack_refund_id)
        async with self.session.begin():
            payment = await self.payments.get(payment_id, for_update=True)
            if payment is None:
                raise NotFound()
            if remote.transaction_reference != payment.paystack_reference and not (
                payment.paystack_transaction_id is not None
                and remote.transaction_id == payment.paystack_transaction_id
            ):
                raise BadRequest("That refund belongs to a different payment.")
            if await self.refunds.by_paystack_id(remote.id) is not None:
                return  # already linked
            waiting = [
                r
                for r in await self.refunds.for_payment(payment.id)
                if r.status in (RefundStatus.admin_review, RefundStatus.uncertain, RefundStatus.requested)
                and r.amount_kobo == remote.amount_kobo
            ]
            if waiting:
                waiting[0].paystack_refund_id = remote.id
                waiting[0].status = RefundStatus.pending
                refund_id = waiting[0].id
            else:
                try:
                    refund = await self.refunds.add(
                        PaymentRefund(
                            payment_id=payment.id,
                            amount_kobo=remote.amount_kobo,
                            status=RefundStatus.pending,
                            paystack_refund_id=remote.id,
                            submitted_at=utcnow(),
                        )
                    )
                except DBAPIError as exc:
                    if pg_error(exc).constraint == "ck_payments_refund_committed":
                        raise BadRequest(
                            "That refund would exceed the amount captured for this payment."
                        ) from exc
                    raise
                refund_id = refund.id
        await self._mirror(
            refund_id,
            remote,
            expected=(RefundStatus.pending, RefundStatus.processing, RefundStatus.needs_attention),
        )

    # Subscriptions

    async def start_subscription(self, user: User, agency: Agency) -> Checkout:
        if not self.settings.PAYSTACK_AGENCY_PLAN_CODE:
            raise PaymentProviderUnavailable("Subscriptions aren't set up yet.")
        async with self.session.begin():
            current = await self.agencies.get(agency.id)
            if current is None or current.status is not AgencyStatus.approved:
                raise AgencyNotActive("Your agency must be approved before it can subscribe.")
            subscription = await self.agencies.subscription(agency.id)
            if subscription is not None and subscription.status is SubscriptionStatus.active:
                raise IllegalTransition("Your subscription is already active.")
            payment = await self.payments.add(
                Payment(
                    kind=PaymentKind.subscription,
                    status=PaymentStatus.pending,
                    payer_user_id=user.id,
                    agency_id=agency.id,
                    amount_kobo=self.settings.AGENCY_SUBSCRIPTION_KOBO,
                    paystack_reference=new_reference("SUB"),
                )
            )
        initialized = await self.paystack.initialize(
            email=user.email,
            amount_kobo=payment.amount_kobo,
            reference=payment.paystack_reference,
            callback_url=f"{self.settings.WEB_BASE_URL.rstrip('/')}{BILLING_CALLBACK_PATH}",
            metadata={"kind": "subscription", "agency_id": str(agency.id), "payment_id": str(payment.id)},
            plan=self.settings.PAYSTACK_AGENCY_PLAN_CODE,
        )
        async with self.session.begin():
            stored = await self.payments.get(payment.id, for_update=True)
            assert stored is not None  # noqa: S101
            stored.authorization_url = initialized.authorization_url
        return Checkout(initialized.authorization_url, payment.paystack_reference)

    async def subscription(self, agency: Agency) -> BillingSubscription | None:
        async with self.session.begin():
            sub = await self.agencies.subscription(agency.id)
        if sub is None:
            return None
        return BillingSubscription(
            plan_name=PLAN_NAME,
            plan_code=sub.plan_code,
            status=sub.status.value,
            current_period_end=sub.current_period_end,
        )

    async def reconcile_subscriptions(self) -> int:
        """Brings each Paystack-linked subscription in line with Paystack. The subscription_sync job runs
        this hourly."""
        async with self.session.begin():
            linked = await self.agencies.linked_subscriptions()
        changed = 0
        for sub in linked:
            assert sub.paystack_subscription_code is not None  # noqa: S101  # filtered by the query
            try:
                remote = await self.paystack.fetch_subscription(sub.paystack_subscription_code)
            except PaymentProviderError:
                log.warning("subscription.reconcile_failed", agency_id=str(sub.agency_id))
                continue
            status = REMOTE_STATUS.get(remote.status)
            async with self.session.begin():
                current = await self.agencies.subscription(sub.agency_id, for_update=True)
                if current is None or status is None:
                    continue
                # Paystack may omit the next payment date (e.g. a failed renewal); keep the one we have.
                period_end = remote.next_payment_date or current.current_period_end
                if (current.status, current.current_period_end) != (status, period_end):
                    await self._notify_lapse(current, status)
                    current.status = status
                    current.current_period_end = period_end
                    changed += 1
        return changed

    async def _notify_lapse(self, sub: Subscription, to: SubscriptionStatus) -> None:
        """The agency hears when its subscription stops being active (it can't list or propose then)."""
        if to in (SubscriptionStatus.past_due, SubscriptionStatus.cancelled) and sub.status is not to:
            await self.notices.add_many(
                await self.notices.agency_user_ids(sub.agency_id),
                messages.subscription_lapsed(ended=to is SubscriptionStatus.cancelled),
            )

    # Reading

    async def verify_for_payer(self, user: User, reference: str) -> PaymentVerification:
        """The callback page's question. The redirect is only a prompt: Paystack is asked on the spot through
        the shared settlement (its query parameters are never trusted), so the family sees the result even
        if the webhook hasn't arrived yet."""
        async with self.session.begin():
            payment = await self.payments.by_reference(reference)
            if payment is None or payment.payer_user_id != user.id:
                raise NotFound()
            unsettled = payment.status not in SETTLED and payment.status is not PaymentStatus.initiating
        if unsettled:
            try:
                await self.settle(reference)
            except PaymentProviderError:
                log.warning("payment.verify_unavailable")
        async with self.session.begin():
            payment = await self.payments.by_reference(reference)
            assert payment is not None  # noqa: S101
            await self.session.refresh(payment)
            placement = await self.placements.get(payment.placement_id) if payment.placement_id else None
            out = PaymentOut.of(payment, await self.refunds.for_payment(payment.id))
            return PaymentVerification(
                reference=payment.paystack_reference,
                status=out.status,
                refund_status=out.refund_status,
                amount_kobo=payment.amount_kobo,
                placement_id=payment.placement_id,
                placement_status=placement.status.value if placement else None,
            )

    async def page(self, user: User, params: PageParams) -> tuple[list[PaymentOut], int]:
        async with self.session.begin():
            agency = await self.agencies.for_user(user.id)
            rows, total = await self.payments.page_for(user.id, agency.id if agency else None, params)
            return [PaymentOut.of(p, await self.refunds.for_payment(p.id)) for p in rows], total

    async def fees_paid_since(self, since: datetime) -> int:
        async with self.session.begin():
            return await self.payments.fees_paid_since(since)

    # Webhook

    async def handle_webhook(self, raw_body: bytes, signature: str | None) -> None:
        """Signature first (401 otherwise), then once per event. If processing fails (Paystack can't be
        reached to re-verify) the error propagates, so Paystack delivers the event again. Two simultaneous
        deliveries can both get past the event table; settlement's checks under row locks make the second
        a no-op (section C), so nothing relies on the event table alone."""
        if not valid_signature(raw_body, signature, self.settings.PAYSTACK_SECRET_KEY.get_secret_value()):
            log.warning("paystack.bad_signature")
            raise Unauthenticated("Invalid signature.")
        try:
            event = json.loads(raw_body)
        except ValueError as exc:
            raise BadRequest() from exc
        event_type = str(event.get("event", ""))
        data: dict[str, Any] = event.get("data") or {}
        key = (
            data.get("id")
            or data.get("reference")
            or data.get("subscription_code")
            or data.get("invoice_code")
        )
        event_id = f"{event_type}:{key}"
        async with self.session.begin():
            stored = await self.webhooks.record(PROVIDER, event_id, event_type, scrub(event))
            if stored.processed_at is not None:
                log.info("paystack.duplicate", event_type=event_type)
                return
        if event_type == "charge.success" and data.get("reference"):
            await self.settle(str(data["reference"]))
        elif event_type in REFUND_EVENTS and data.get("id"):
            await self._refund_event(data)
        elif event_type in SUBSCRIPTION_EVENTS or event_type == "invoice.update":
            await self._subscription_event(event_type, data)
        async with self.session.begin():
            stored = await self.webhooks.record(PROVIDER, event_id, event_type, scrub(event))
            stored.processed_at = utcnow()
        log.info("paystack.processed", event_type=event_type)

    async def _refund_event(self, data: dict[str, Any]) -> None:
        """A `refund.*` event is only a prompt: the refund is fetched from Paystack before anything changes
        (its body isn't verified, U6). Matched by refund id, else by transaction reference and amount."""
        try:
            paystack_id = int(data["id"])
        except TypeError, ValueError:
            return
        remote = await self.paystack.fetch_refund(paystack_id)
        async with self.session.begin():
            row = await self.refunds.by_paystack_id(remote.id)
            refund_id = row.id if row else None
            if refund_id is None and remote.transaction_reference:
                payment = await self.payments.by_reference(remote.transaction_reference)
                if payment is not None:
                    waiting = [
                        r
                        for r in await self.refunds.for_payment(payment.id)
                        if r.status in (RefundStatus.submitting, RefundStatus.uncertain)
                        and r.paystack_refund_id is None
                        and r.amount_kobo == remote.amount_kobo
                    ]
                    if len(waiting) == 1:
                        refund_id = waiting[0].id
        if refund_id is None:
            log.info("refund.unmatched_event")
            return
        await self._mirror(
            refund_id,
            remote,
            expected=(
                RefundStatus.submitting,
                RefundStatus.uncertain,
                RefundStatus.pending,
                RefundStatus.processing,
                RefundStatus.needs_attention,
            ),
        )

    async def _activate(self, agency_id: uuid.UUID, paid_at: datetime) -> None:
        sub = await self.agencies.subscription(agency_id, for_update=True)
        period_end = add_months(paid_at, 1)
        if sub is None:
            await self.agencies.add_subscription(
                Subscription(
                    agency_id=agency_id,
                    plan_code=self.settings.PAYSTACK_AGENCY_PLAN_CODE or "",
                    status=SubscriptionStatus.active,
                    current_period_end=period_end,
                )
            )
        else:
            sub.status = SubscriptionStatus.active
            if sub.current_period_end is None or sub.current_period_end < period_end:
                sub.current_period_end = period_end

    async def _subscription_event(self, event_type: str, data: dict[str, Any]) -> None:
        """Keeps the agency's subscription in step with Paystack's lifecycle events."""
        sub_data: dict[str, Any] = data.get("subscription") or data
        code = sub_data.get("subscription_code")
        email = ((data.get("customer") or {}).get("email") or "").strip()
        next_payment = _parse_time(sub_data.get("next_payment_date"))
        if event_type == "invoice.update":
            status = SubscriptionStatus.active if data.get("paid") else None
        else:
            status = SUBSCRIPTION_EVENTS[event_type]
        async with self.session.begin():
            sub = await self.agencies.subscription_by_code(code) if code else None
            if sub is None and email:
                user = await self.users.get_by_email(email)
                agency = await self.agencies.for_user(user.id) if user else None
                if agency is not None:
                    sub = await self.agencies.subscription(agency.id, for_update=True)
                    if sub is None:
                        sub = await self.agencies.add_subscription(
                            Subscription(
                                agency_id=agency.id,
                                plan_code=(data.get("plan") or {}).get("plan_code")
                                or self.settings.PAYSTACK_AGENCY_PLAN_CODE
                                or "",
                                status=status or SubscriptionStatus.active,
                            )
                        )
            if sub is None:
                log.warning("subscription.unmatched_event", event_type=event_type)
                return
            if code:
                sub.paystack_subscription_code = code
            customer_code = (data.get("customer") or {}).get("customer_code")
            if customer_code:
                sub.paystack_customer_code = customer_code
            if status is not None:
                await self._notify_lapse(sub, status)
                sub.status = status
            if next_payment is not None:
                sub.current_period_end = next_payment

    # Helpers

    async def _lock_attempt(self, reference: str) -> tuple[Payment, Placement]:
        """Placement, then payment (the lock order)."""
        unlocked = await self.payments.by_reference(reference)
        if unlocked is None or unlocked.placement_id is None:
            raise NotFound()
        placement = await self.placements.get(unlocked.placement_id, for_update=True)
        payment = await self.payments.by_reference(reference, for_update=True)
        assert placement is not None  # noqa: S101
        assert payment is not None  # noqa: S101
        return payment, placement

    async def _lock_refund(self, refund_id: uuid.UUID) -> tuple[Payment, PaymentRefund]:
        """Payment, then refund (section D's lock order); the payment id is read without a lock first."""
        payment_id = await self.refunds.payment_id_of(refund_id)
        if payment_id is None:
            raise NotFound()
        payment = await self.payments.get(payment_id, for_update=True)
        refund = await self.refunds.get(refund_id, for_update=True)
        assert payment is not None  # noqa: S101
        assert refund is not None  # noqa: S101
        return payment, refund

    async def _record_verify(self, reference: str, verified: Verified) -> None:
        async with self.session.begin():
            payment = await self.payments.by_reference(reference, for_update=True)
            if payment is not None:
                self._apply_verify(payment, verified, utcnow())

    @staticmethod
    def _apply_verify(payment: Payment, verified: Verified, now: datetime) -> None:
        payment.provider_status = verified.status
        payment.provider_checked_at = now
        if verified.transaction_id is not None:
            payment.paystack_transaction_id = verified.transaction_id

    def _watch_end(self, now: datetime) -> datetime:
        return now + timedelta(days=self.settings.CHECKOUT_WATCH_DAYS)

    def _watch(self, payment: Payment, now: datetime) -> None:
        end = self._watch_end(now)
        if payment.watch_until is None or payment.watch_until < end:
            payment.watch_until = end
        if payment.next_reconcile_at is None:
            payment.next_reconcile_at = now + WATCH_FAST

    @staticmethod
    def _payable(placement: Placement, db_now: datetime) -> bool:
        """OD1: awaiting payment, with the hold still valid at the database clock."""
        return (
            placement.status is PlacementStatus.pending_payment
            and placement.hold_expires_at is not None
            and placement.hold_expires_at > db_now
        )

    def _require_payable(self, placement: Placement, db_now: datetime) -> None:
        if not self._payable(placement, db_now):
            raise self._not_payable(placement, db_now)

    @staticmethod
    def _not_payable(placement: Placement, db_now: datetime) -> HoldExpired | IllegalTransition:
        """OD2: an expired hold is HOLD_EXPIRED; anything else unpayable keeps ILLEGAL_TRANSITION."""
        expired = placement.status is PlacementStatus.pending_payment or (
            placement.status is PlacementStatus.cancelled
            and placement.end_reason is EndReason.payment_expired
        )
        if expired:
            return HoldExpired(details={"placement_id": str(placement.id), "status": placement.status.value})
        return IllegalTransition("Nothing to pay.", details={"placement_id": str(placement.id)})

    @staticmethod
    def _closed_reason(placement: Placement, db_now: datetime) -> str:
        if placement.status in (PlacementStatus.trial, PlacementStatus.confirmed, PlacementStatus.ended):
            return ClosedReason.superseded.value
        if placement.status is PlacementStatus.cancelled or (
            placement.hold_expires_at is not None and placement.hold_expires_at <= db_now
        ):
            return ClosedReason.hold_ended.value
        return ClosedReason.ineligible.value

    async def _alert(
        self, kind: AlertKind, subject_key: str, details: dict[str, Any], payment_id: uuid.UUID | None = None
    ) -> None:
        """Opens a persistent alert (idempotent) and, when it's new, tells the super admins."""
        if await self.alerts.raise_alert(kind, subject_key, details, payment_id):
            for admin_id in await self.notices.super_admin_ids():
                await self.notices.add(admin_id, messages.admin_alert(kind.value))
            log.warning("admin.alert_opened", kind=kind.value)

    def _placements(self) -> PlacementService:
        return PlacementService(self.session, self.settings, self)
