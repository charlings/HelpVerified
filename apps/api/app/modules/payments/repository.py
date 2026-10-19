"""Payment, refund and webhook-event queries."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.modules.payments.models import (
    ACTIVE_ATTEMPTS,
    FINAL_REFUNDS,
    ClosedReason,
    Payment,
    PaymentKind,
    PaymentRefund,
    PaymentStatus,
    RefundStatus,
    WebhookEvent,
)


class PaymentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, payment: Payment) -> Payment:
        self.session.add(payment)
        await self.session.flush()
        await self.session.refresh(payment)
        return payment

    async def get(self, payment_id: uuid.UUID, *, for_update: bool = False) -> Payment | None:
        query = select(Payment).where(Payment.id == payment_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def by_reference(self, reference: str, *, for_update: bool = False) -> Payment | None:
        query = select(Payment).where(Payment.paystack_reference == reference)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def db_now(self) -> datetime:
        """The database clock at this moment (clock_timestamp(), not the transaction's start: OD1)."""
        now: datetime = await self.session.scalar(text("SELECT clock_timestamp()"))
        return now

    # Checkout attempts (ADR 0017)

    async def active_attempt(self, placement_id: uuid.UUID, *, for_update: bool = False) -> Payment | None:
        """The placement's one open attempt (`initiating`, `open` or `unknown`; I4), if any."""
        query = select(Payment).where(
            Payment.placement_id == placement_id,
            Payment.kind == PaymentKind.placement_fee,
            Payment.status.in_(ACTIVE_ATTEMPTS),
        )
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def attempts(self, placement_id: uuid.UUID) -> list[Payment]:
        rows = await self.session.scalars(
            select(Payment)
            .where(Payment.placement_id == placement_id, Payment.kind == PaymentKind.placement_fee)
            .order_by(Payment.created_at, Payment.id)
        )
        return list(rows)

    async def next_attempt_no(self, placement_id: uuid.UUID) -> int:
        """Call with the placement row locked, so two requests can't compute the same number."""
        highest = await self.session.scalar(
            select(func.max(Payment.attempt_no)).where(Payment.placement_id == placement_id)
        )
        return int(highest or 0) + 1

    async def has_succeeded(self, placement_id: uuid.UUID, *, other_than: uuid.UUID) -> bool:
        found = await self.session.scalar(
            select(Payment.id).where(
                Payment.placement_id == placement_id,
                Payment.kind == PaymentKind.placement_fee,
                Payment.status == PaymentStatus.succeeded,
                Payment.id != other_than,
            )
        )
        return found is not None

    async def deactivate_attempts(
        self,
        placement_id: uuid.UUID,
        reason: ClosedReason,
        watch_until: datetime,
        now: datetime,
        *,
        except_id: uuid.UUID | None = None,
    ) -> None:
        """AT14 (a sibling was applied) and AT15-AT17 (the hold ended): `open` → `closed`, `initiating` →
        `unknown` (no further initialise; reconciled by verify), and every attempt that may still be paid is
        watched until `watch_until`. The caller holds the placement lock."""
        scope = [Payment.placement_id == placement_id, Payment.kind == PaymentKind.placement_fee]
        if except_id is not None:
            scope.append(Payment.id != except_id)
        await self.session.execute(
            update(Payment)
            .where(*scope, Payment.status == PaymentStatus.open)
            .values(status=PaymentStatus.closed, closed_reason=reason.value)
        )
        await self.session.execute(
            update(Payment)
            .where(*scope, Payment.status == PaymentStatus.initiating)
            .values(status=PaymentStatus.unknown, next_reconcile_at=now)
        )
        await self.session.execute(
            update(Payment)
            .where(
                *scope,
                Payment.status.in_(
                    (
                        PaymentStatus.unknown,
                        PaymentStatus.closed,
                        PaymentStatus.failed,
                        PaymentStatus.orphaned,
                        PaymentStatus.rejected,
                    )
                ),
                or_(Payment.watch_until.is_(None), Payment.watch_until < watch_until),
            )
            .values(watch_until=watch_until, next_reconcile_at=func.coalesce(Payment.next_reconcile_at, now))
        )

    async def due_for_reconcile(self, now: datetime, stale_before: datetime, limit: int = 100) -> list[str]:
        """References of `unknown` attempts due a check, and `initiating` ones older than the stale limit."""
        rows = await self.session.scalars(
            select(Payment.paystack_reference)
            .where(
                Payment.kind == PaymentKind.placement_fee,
                or_(
                    (Payment.status == PaymentStatus.unknown)
                    & (Payment.next_reconcile_at.is_(None) | (Payment.next_reconcile_at <= now)),
                    (Payment.status == PaymentStatus.initiating) & (Payment.created_at <= stale_before),
                ),
            )
            .order_by(Payment.next_reconcile_at.nulls_first())
            .limit(limit)
        )
        return list(rows)

    async def due_for_watch(self, now: datetime, limit: int = 200) -> list[str]:
        """References of inactive attempts still inside their watch window and due a check."""
        rows = await self.session.scalars(
            select(Payment.paystack_reference)
            .where(
                Payment.kind == PaymentKind.placement_fee,
                Payment.status.in_(
                    (
                        PaymentStatus.closed,
                        PaymentStatus.failed,
                        PaymentStatus.orphaned,
                        PaymentStatus.rejected,
                    )
                ),
                Payment.watch_until > now,
                Payment.next_reconcile_at.is_(None) | (Payment.next_reconcile_at <= now),
            )
            .order_by(Payment.next_reconcile_at.nulls_first())
            .limit(limit)
        )
        return list(rows)

    async def unknown_past_window(self, now: datetime) -> list[Payment]:
        rows = await self.session.scalars(
            select(Payment).where(
                Payment.kind == PaymentKind.placement_fee,
                Payment.status == PaymentStatus.unknown,
                Payment.watch_until.is_not(None),
                Payment.watch_until <= now,
            )
        )
        return list(rows)

    # Reading

    async def page_for(
        self, user_id: uuid.UUID, agency_id: uuid.UUID | None, params: PageParams
    ) -> tuple[list[Payment], int]:
        """The caller's own payments, plus their agency's (subscriptions), newest first. Checkout attempts
        that never reached a payable state aren't payments the family made, so they're left out."""
        scope = (
            or_(Payment.payer_user_id == user_id, Payment.agency_id == agency_id)
            if agency_id
            else (Payment.payer_user_id == user_id)
        )
        visible = scope & Payment.status.not_in((PaymentStatus.initiating, PaymentStatus.rejected))
        rows = await self.session.scalars(
            select(Payment)
            .where(visible)
            .order_by(Payment.created_at.desc(), Payment.id)
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(select(func.count()).select_from(Payment).where(visible)) or 0
        return list(rows), total

    async def fees_paid_since(self, since: datetime) -> int:
        return (
            await self.session.scalar(
                select(func.coalesce(func.sum(Payment.amount_kobo), 0)).where(
                    Payment.kind == PaymentKind.placement_fee,
                    Payment.status == PaymentStatus.succeeded,
                    Payment.paid_at >= since,
                )
            )
            or 0
        )


class RefundRepository:
    """Every write here happens with the parent payment row already locked (ADR 0017 section D's lock order:
    payment, then refund, then the aggregate, then any alert)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, refund: PaymentRefund) -> PaymentRefund:
        self.session.add(refund)
        await self.session.flush()
        await self.session.refresh(refund)
        return refund

    async def get(self, refund_id: uuid.UUID, *, for_update: bool = False) -> PaymentRefund | None:
        query = select(PaymentRefund).where(PaymentRefund.id == refund_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def payment_id_of(self, refund_id: uuid.UUID) -> uuid.UUID | None:
        """Read without a lock, so the caller can lock the payment first."""
        found: uuid.UUID | None = await self.session.scalar(
            select(PaymentRefund.payment_id).where(PaymentRefund.id == refund_id)
        )
        return found

    async def for_payment(self, payment_id: uuid.UUID) -> list[PaymentRefund]:
        rows = await self.session.scalars(
            select(PaymentRefund)
            .where(PaymentRefund.payment_id == payment_id)
            .order_by(PaymentRefund.created_at, PaymentRefund.id)
        )
        return list(rows)

    async def by_paystack_id(self, paystack_refund_id: int) -> PaymentRefund | None:
        found: PaymentRefund | None = await self.session.scalar(
            select(PaymentRefund).where(PaymentRefund.paystack_refund_id == paystack_refund_id)
        )
        return found

    async def known_paystack_ids(self) -> set[int]:
        rows = await self.session.scalars(
            select(PaymentRefund.paystack_refund_id).where(PaymentRefund.paystack_refund_id.is_not(None))
        )
        return {int(r) for r in rows if r is not None}

    async def due(self, now: datetime, limit: int = 100) -> list[uuid.UUID]:
        rows = await self.session.scalars(
            select(PaymentRefund.id)
            .where(
                PaymentRefund.status.not_in((*FINAL_REFUNDS, RefundStatus.admin_review)),
                PaymentRefund.next_check_at.is_not(None),
                PaymentRefund.next_check_at <= now,
            )
            .order_by(PaymentRefund.next_check_at)
            .limit(limit)
        )
        return list(rows)

    async def processed_total(self, payment_id: uuid.UUID) -> int:
        return int(
            await self.session.scalar(
                select(func.coalesce(func.sum(PaymentRefund.amount_kobo), 0)).where(
                    PaymentRefund.payment_id == payment_id, PaymentRefund.status == RefundStatus.processed
                )
            )
            or 0
        )


class WebhookEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(
        self, provider: str, event_id: str, event_type: str, payload: dict[str, Any]
    ) -> WebhookEvent:
        """Inserts the event once; a redelivery returns the stored row (UNIQUE provider, event_id)."""
        await self.session.execute(
            insert(WebhookEvent)
            .values(provider=provider, event_id=event_id, event_type=event_type, payload=payload)
            .on_conflict_do_nothing(constraint="uq_webhook_events_provider_event_id")
        )
        stored = await self.session.scalar(
            select(WebhookEvent)
            .where(WebhookEvent.provider == provider, WebhookEvent.event_id == event_id)
            .with_for_update()
        )
        assert stored is not None  # noqa: S101  # inserted or already there
        return stored
