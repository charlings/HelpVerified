"""Placement fees and agency subscriptions through Paystack (database.md §7, security-and-compliance.md §5).

Value is granted in one place, `_settle`, and only after Paystack's own record confirms status, amount and
currency, whatever a webhook or redirect claims. Settling is idempotent: a payment leaves `pending` once.
A payment for a hold that is no longer waiting (it lapsed and was cancelled) is refunded and never creates
a placement, so rule 2 can't be broken by a late payment.

Locks are taken placement first, then payment, the same order as cancelling a hold, so they can't deadlock.
"""

import json
import secrets
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.dates import add_months
from app.core.errors import (
    AgencyNotActive,
    BadRequest,
    IllegalTransition,
    NotFound,
    PaymentProviderError,
    Unauthenticated,
)
from app.core.logging import get_logger
from app.core.pagination import PageParams
from app.integrations.payments import Checkout
from app.integrations.paystack import PaystackApi, valid_signature
from app.modules.agencies.models import Agency, AgencyStatus, Subscription, SubscriptionStatus
from app.modules.agencies.repository import AgencyRepository
from app.modules.families.repository import FamilyRepository
from app.modules.notifications import messages
from app.modules.notifications.repository import NotificationRepository
from app.modules.payments.models import Payment, PaymentKind, PaymentStatus
from app.modules.payments.repository import PaymentRepository, WebhookEventRepository
from app.modules.payments.schemas import BillingSubscription, PaymentOut, PaymentVerification
from app.modules.placements.models import PlacementStatus
from app.modules.placements.repository import PlacementRepository
from app.modules.placements.service import PlacementService
from app.modules.users.models import User
from app.modules.users.repository import UserRepository

log = get_logger("app.payments")

PROVIDER = "paystack"
PLACEMENT_CALLBACK_PATH = "/family/payments/callback"  # web routes.family.paymentCallback
BILLING_CALLBACK_PATH = "/agency/billing"  # web routes.agency.billing
PLAN_NAME = "Agency monthly"
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


class PaymentService:
    def __init__(self, session: AsyncSession, settings: Settings, paystack: PaystackApi) -> None:
        self.session = session
        self.settings = settings
        self.paystack = paystack
        self.payments = PaymentRepository(session)
        self.webhooks = WebhookEventRepository(session)
        self.placements = PlacementRepository(session)
        self.families = FamilyRepository(session)
        self.agencies = AgencyRepository(session)
        self.users = UserRepository(session)
        self.notices = NotificationRepository(session)

    # Placement fee (PlacementService.accept calls this as its PaymentGateway)

    async def start_placement_checkout(self, placement_id: uuid.UUID, payer_email: str) -> Checkout:
        """Creates the fee's payment row and Paystack checkout, or returns the one already open."""
        async with self.session.begin():
            placement = await self.placements.get(placement_id)
            if placement is None:
                raise NotFound()
            family = await self.families.get(placement.family_id)
            assert family is not None  # noqa: S101  # FK
            payment = await self.payments.pending_fee(placement_id, for_update=True)
            if payment is not None and payment.authorization_url:
                return Checkout(payment.authorization_url, payment.paystack_reference)
            if payment is not None:  # an earlier attempt never reached Paystack: start afresh
                payment.status = PaymentStatus.failed
                await self.session.flush()
            payment = await self.payments.add(
                Payment(
                    kind=PaymentKind.placement_fee,
                    payer_user_id=family.user_id,
                    placement_id=placement_id,
                    amount_kobo=self.settings.PLACEMENT_FEE_KOBO,
                    paystack_reference=new_reference("PF"),
                )
            )
        return await self._open_checkout(
            payment,
            payer_email,
            PLACEMENT_CALLBACK_PATH,
            {"kind": "placement_fee", "placement_id": str(placement_id)},
        )

    async def resume_checkout(self, user: User, placement_id: uuid.UUID) -> Checkout:
        """POST /placements/{id}/pay: the same checkout again, never a second charge."""
        async with self.session.begin():
            family = await self.families.for_user(user.id)
            placement = await self.placements.get(placement_id)
            if family is None or placement is None or placement.family_id != family.id:
                raise NotFound()
            if placement.status is not PlacementStatus.pending_payment:
                raise IllegalTransition("Nothing to pay.")
        return await self.start_placement_checkout(placement_id, user.email)

    # Subscriptions

    async def start_subscription(self, user: User, agency: Agency) -> Checkout:
        if not self.settings.PAYSTACK_AGENCY_PLAN_CODE:
            raise PaymentProviderError("Subscriptions aren't set up yet.")
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
                    payer_user_id=user.id,
                    agency_id=agency.id,
                    amount_kobo=self.settings.AGENCY_SUBSCRIPTION_KOBO,
                    paystack_reference=new_reference("SUB"),
                )
            )
        return await self._open_checkout(
            payment,
            user.email,
            BILLING_CALLBACK_PATH,
            {"kind": "subscription", "agency_id": str(agency.id)},
            plan=self.settings.PAYSTACK_AGENCY_PLAN_CODE,
        )

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
        """The callback page's question. A pending payment is checked with Paystack on the spot, so the
        family sees the result even if the webhook hasn't arrived yet."""
        async with self.session.begin():
            payment = await self.payments.by_reference(reference)
            if payment is None or payment.payer_user_id != user.id:
                raise NotFound()
        if payment.status is PaymentStatus.pending:
            try:
                await self._settle(reference)
            except PaymentProviderError:
                log.warning("payment.verify_unavailable", reference=reference)
        async with self.session.begin():
            payment = await self.payments.by_reference(reference)
            assert payment is not None  # noqa: S101
            await self.session.refresh(payment)
            placement = await self.placements.get(payment.placement_id) if payment.placement_id else None
            return PaymentVerification(
                reference=payment.paystack_reference,
                status=payment.status.value,
                amount_kobo=payment.amount_kobo,
                placement_id=payment.placement_id,
                placement_status=placement.status.value if placement else None,
            )

    async def page(self, user: User, params: PageParams) -> tuple[list[PaymentOut], int]:
        async with self.session.begin():
            agency = await self.agencies.for_user(user.id)
            rows, total = await self.payments.page_for(user.id, agency.id if agency else None, params)
        return [PaymentOut.of(p) for p in rows], total

    async def fees_paid_since(self, since: datetime) -> int:
        async with self.session.begin():
            return await self.payments.fees_paid_since(since)

    # Webhook

    async def handle_webhook(self, raw_body: bytes, signature: str | None) -> None:
        """Signature first (401 otherwise), then once per event. If processing fails (Paystack can't be
        reached to re-verify) the error propagates, so Paystack delivers the event again."""
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
            await self._settle(str(data["reference"]))
        elif event_type in SUBSCRIPTION_EVENTS or event_type == "invoice.update":
            await self._subscription_event(event_type, data)
        async with self.session.begin():
            stored = await self.webhooks.record(PROVIDER, event_id, event_type, scrub(event))
            stored.processed_at = utcnow()
        log.info("paystack.processed", event_type=event_type)

    # Settling (the only place value is granted)

    async def _settle(self, reference: str) -> None:
        verified = await self.paystack.verify(reference)  # outside any transaction
        refund = False
        async with self.session.begin():
            unlocked = await self.payments.by_reference(reference)
            if unlocked is None:
                log.info("payment.unknown_reference")  # e.g. a renewal Paystack created itself
                return
            placement = (
                await self.placements.get(unlocked.placement_id, for_update=True)
                if unlocked.placement_id
                else None
            )
            payment = await self.payments.by_reference(reference, for_update=True)
            assert payment is not None  # noqa: S101
            if payment.status in (PaymentStatus.success, PaymentStatus.refunded):
                return  # already settled
            if verified.status != "success":
                return  # not paid (yet): nothing to grant
            if verified.amount_kobo != payment.amount_kobo or verified.currency != "NGN":
                log.warning("payment.mismatch", payment_id=str(payment.id))
                return
            now = utcnow()
            if payment.kind is PaymentKind.placement_fee:
                assert placement is not None  # noqa: S101  # ck_payments_kind_target
                if placement.status is PlacementStatus.pending_payment:
                    payment.status = PaymentStatus.success
                    payment.paid_at = verified.paid_at or now
                    await self.session.flush()
                    await self._placements().begin_trial_locked(placement, now)
                else:
                    # The hold lapsed (or was cancelled) before the money arrived: refund it.
                    payment.status = PaymentStatus.refunded
                    payment.paid_at = verified.paid_at or now
                    payment.refunded_at = now
                    refund = True
                    parties = await self.notices.placement_parties(placement.id)
                    await self.notices.add(
                        parties.family_user_id,
                        messages.payment_refunded(parties.worker_name, payment.amount_kobo),
                    )
            else:
                payment.status = PaymentStatus.success
                payment.paid_at = verified.paid_at or now
                assert payment.agency_id is not None  # noqa: S101
                await self._activate(payment.agency_id, payment.paid_at)
            await self.session.flush()
            log.info("payment.settled", payment_id=str(payment.id), status=payment.status.value)
        if refund:
            await self._send_refund(payment.id)

    async def _send_refund(self, payment_id: uuid.UUID) -> bool:
        """Asks Paystack to return a refunded payment's money; the refund_retry job calls this again until
        Paystack accepts. The attempt is counted before the call, so a crash can't retry it forever."""
        async with self.session.begin():
            payment = await self.payments.get(payment_id, for_update=True)
            if payment is None or payment.refund_sent_at is not None:
                return True
            payment.refund_attempts += 1
            reference, attempts = payment.paystack_reference, payment.refund_attempts
        try:
            await self.paystack.refund(reference)
        except PaymentProviderError:
            if attempts >= self.settings.REFUND_MAX_ATTEMPTS:
                # An admin refunds it from the Paystack dashboard; the log names the payment.
                log.error("payment.refund_gave_up", payment_id=str(payment_id), reference=reference)
            else:
                log.error("payment.refund_failed", payment_id=str(payment_id), reference=reference)
            return False
        async with self.session.begin():
            payment = await self.payments.get(payment_id, for_update=True)
            assert payment is not None  # noqa: S101
            payment.refund_sent_at = utcnow()
        log.info("payment.refund_sent", payment_id=str(payment_id))
        return True

    async def retry_refunds(self) -> int:
        """Refunds Paystack hasn't accepted yet, until REFUND_MAX_ATTEMPTS. Returns how many went through."""
        async with self.session.begin():
            waiting = await self.payments.refunds_unsent(self.settings.REFUND_MAX_ATTEMPTS)
        sent = 0
        for payment_id in waiting:
            sent += int(await self._send_refund(payment_id))
        return sent

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

    async def _open_checkout(
        self,
        payment: Payment,
        email: str,
        callback_path: str,
        metadata: dict[str, Any],
        plan: str | None = None,
    ) -> Checkout:
        """Initialises the Paystack transaction (outside any transaction) and remembers its link."""
        initialized = await self.paystack.initialize(
            email=email,
            amount_kobo=payment.amount_kobo,
            reference=payment.paystack_reference,
            callback_url=f"{self.settings.WEB_BASE_URL.rstrip('/')}{callback_path}",
            metadata=metadata | {"payment_id": str(payment.id)},
            plan=plan,
        )
        async with self.session.begin():
            stored = await self.payments.get(payment.id, for_update=True)
            assert stored is not None  # noqa: S101
            stored.authorization_url = initialized.authorization_url
        return Checkout(initialized.authorization_url, payment.paystack_reference)

    def _placements(self) -> PlacementService:
        return PlacementService(self.session, self.settings, self)
