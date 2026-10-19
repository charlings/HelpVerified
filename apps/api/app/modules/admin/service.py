"""Super-admin moderation (ADR 0006; mock: admin-domain.ts, admin.ts).

Agency moves: pending → approved | rejected, approved → suspended, suspended → approved (reinstate).
Rejected is final. A move that's no longer legal (someone acted first) is 409 ILLEGAL_TRANSITION.
Suspending sets listed workers to `suspended` and withdraws the agency's pending proposals; reinstating
returns those workers to `delisted`, so the agency relists them through the four-check gate. Active
placements keep running.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.dates import LAGOS, lagos_date
from app.core.errors import IllegalTransition, NotFound, ValidationFailed
from app.core.pagination import PageParams
from app.modules.admin.models import AdminAlert, AuditAction
from app.modules.admin.repository import AlertRepository, AuditRepository
from app.modules.admin.schemas import (
    AdminAgencyDetail,
    AdminAgencySummary,
    AdminOverview,
    AdminWorkerDetail,
    AgencyAction,
    AgencyAdmin,
    AlertKindName,
    AlertOut,
    AuditEntry,
)
from app.modules.agencies.models import Agency, AgencyStatus, WorkerRole
from app.modules.agencies.repository import AgencyRepository
from app.modules.agencies.schemas import SubscriptionOut, WorkerCounts
from app.modules.notifications import messages
from app.modules.notifications.repository import NotificationRepository
from app.modules.payments.repository import PaymentRepository
from app.modules.placements.repository import PlacementRepository
from app.modules.requests.repository import RequestRepository
from app.modules.users.models import User
from app.modules.verification.repository import VerificationRepository
from app.modules.verification.schemas import ItemOut
from app.modules.workers.models import ListingStatus
from app.modules.workers.repository import WorkerRepository
from app.modules.workers.schemas import AdminWorkerOut
from app.modules.workers.service import photo_url

TRIALS_ENDING_SOON_DAYS = 3  # as the web mock's overview counts them


@dataclass(frozen=True)
class Move:
    from_statuses: frozenset[AgencyStatus]
    to: AgencyStatus
    audit: AuditAction
    reason_required: bool


MOVES: dict[str, Move] = {
    "approve": Move(
        frozenset({AgencyStatus.pending}), AgencyStatus.approved, AuditAction.agency_approved, False
    ),
    "reject": Move(
        frozenset({AgencyStatus.pending}), AgencyStatus.rejected, AuditAction.agency_rejected, True
    ),
    "suspend": Move(
        frozenset({AgencyStatus.approved}), AgencyStatus.suspended, AuditAction.agency_suspended, True
    ),
    "reinstate": Move(
        frozenset({AgencyStatus.suspended}), AgencyStatus.approved, AuditAction.agency_reinstated, False
    ),
}


def allowed_actions(agency: Agency) -> list[AgencyAction]:
    return [name for name, move in MOVES.items() if agency.status in move.from_statuses]  # type: ignore[misc]


class AdminService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.agencies = AgencyRepository(session)
        self.workers = WorkerRepository(session)
        self.checks = VerificationRepository(session)
        self.audit = AuditRepository(session)
        self.alerts = AlertRepository(session)
        self.placements = PlacementRepository(session)
        self.requests = RequestRepository(session)
        self.notices = NotificationRepository(session)

    async def overview(self) -> AdminOverview:
        """The admin home: counts, the approval queue (oldest first) and the latest audit entries."""
        today = lagos_date(utcnow())
        soon = today + timedelta(days=TRIALS_ENDING_SOON_DAYS)
        month_start = datetime(today.year, today.month, 1, tzinfo=LAGOS)  # this month, Nigerian calendar
        async with self.session.begin():
            pending = await self.agencies.pending_oldest_first()
            totals = {agency.id: await self.agencies.worker_counts(agency.id) for agency in pending}
            recent, _ = await self.audit.page(PageParams(page=1, page_size=5))
            return AdminOverview(
                agencies_pending=len(pending),
                workers_listed=await self.workers.count_listed(),
                placements_active=await self.placements.count_active(),
                trials_ending_soon=len(await self.placements.trials_ending(soon)),
                fees_paid_this_month_kobo=await PaymentRepository(self.session).fees_paid_since(month_start),
                open_alerts=await self.alerts.open_count(),
                pending_agencies=[AdminAgencySummary.of(a, totals[a.id]["total"]) for a in pending],
                recent_audit=[AuditEntry.of(entry, actor) for entry, actor in recent],
            )

    # Agencies

    async def agencies_page(
        self, params: PageParams, status: AgencyStatus | None
    ) -> tuple[list[AdminAgencySummary], int]:
        async with self.session.begin():
            rows, total = await self.agencies.page(params, status)
        return [AdminAgencySummary.of(agency, n) for agency, n in rows], total

    async def agency_detail(self, agency_id: uuid.UUID) -> AdminAgencyDetail:
        async with self.session.begin():
            agency = await self.agencies.get(agency_id)
            if agency is None:
                raise NotFound()
            return await self._detail(agency)

    async def move_agency(
        self, admin: User, agency_id: uuid.UUID, action: str, reason: str | None
    ) -> AdminAgencyDetail:
        move = MOVES.get(action)
        if move is None:
            raise NotFound()
        reason = (reason or "").strip()
        if move.reason_required and len(reason) < 5:
            raise ValidationFailed(details={"fields": {"reason": ["Give a reason. The agency will see it."]}})
        async with self.session.begin():
            agency = await self.agencies.get(agency_id, for_update=True)
            if agency is None:
                raise NotFound()
            if agency.status not in move.from_statuses:
                raise IllegalTransition(f"This agency is {agency.status.value}.")
            agency.status = move.to
            if move.to is AgencyStatus.approved:
                agency.approved_at = agency.approved_at or utcnow()
                agency.approved_by = agency.approved_by or admin.id
                agency.status_reason = None
            else:
                agency.status_reason = reason
            if action == "suspend":
                await self.agencies.set_workers_status(
                    agency.id, ListingStatus.listed, ListingStatus.suspended
                )
                await self.requests.withdraw_pending_for_agency(agency.id)
            elif action == "reinstate":
                await self.agencies.set_workers_status(
                    agency.id, ListingStatus.suspended, ListingStatus.delisted
                )
            await self.audit.write(
                admin.id,
                move.audit,
                "agency",
                agency.id,
                {"label": agency.name} | ({"reason": reason} if reason else {}),
            )
            await self.notices.add_many(
                await self.notices.agency_user_ids(agency.id),
                messages.agency_status(move.to, reinstated=action == "reinstate", reason=reason or None),
            )
            await self.session.flush()
            return await self._detail(agency)

    async def _detail(self, agency: Agency) -> AdminAgencyDetail:
        counts = await self.agencies.worker_counts(agency.id)
        admin = await self.agencies.admin_user(agency.id)
        subscription = await self.agencies.subscription(agency.id)
        history = await self.audit.for_entity("agency", agency.id)
        return AdminAgencyDetail(
            **AdminAgencySummary.of(agency, counts["total"]).model_dump(),
            email=agency.email,
            phone=agency.phone,
            address_line=agency.address_line,
            approved_at=agency.approved_at,
            status_reason=agency.status_reason,
            admin=AgencyAdmin(full_name=admin.full_name, email=admin.email) if admin else None,
            subscription=(
                SubscriptionOut(
                    status=subscription.status.value, current_period_end=subscription.current_period_end
                )
                if subscription
                else None
            ),
            workers=WorkerCounts(**counts),
            active_placements=await self.placements.count_active(agency.id),
            history=[AuditEntry.of(entry, actor) for entry, actor in history],
            allowed_actions=allowed_actions(agency),
        )

    # Workers

    async def workers_page(
        self,
        params: PageParams,
        agency_id: uuid.UUID | None,
        role: WorkerRole | None,
        listing_status: ListingStatus | None,
    ) -> tuple[list[AdminWorkerOut], int]:
        async with self.session.begin():
            rows, total = await self.workers.page(
                params, agency_id=agency_id, role=role, listing_status=listing_status, order_by_name=True
            )
            ids = [w.id for w, _ in rows]
            statuses = await self.checks.statuses(ids)
            active = await self.placements.active_for_workers(ids)
        return [AdminWorkerOut.with_agency(w, a, statuses[w.id], active.get(w.id)) for w, a in rows], total

    async def worker_detail(self, worker_id: uuid.UUID) -> AdminWorkerDetail:
        async with self.session.begin():
            return await self.worker_detail_in_transaction(worker_id)

    async def worker_detail_in_transaction(self, worker_id: uuid.UUID) -> AdminWorkerDetail:
        worker = await self.workers.get(worker_id)
        if worker is None:
            raise NotFound()
        agency = await self.agencies.get(worker.agency_id)
        assert agency is not None  # noqa: S101  # FK
        items = await self.checks.items(worker.id)
        documents = await self.checks.documents([i.id for i in items])
        statuses = {i.kind.value: i.status.value for i in items}
        active = await self.placements.active_for_worker(worker.id)
        base = AdminWorkerOut.with_agency(worker, agency, statuses, active)
        detail = AdminWorkerDetail(
            **base.model_dump(), checks=[ItemOut.of(i, documents[i.id]) for i in items]
        )
        detail.photo_url = photo_url(self.settings, worker)
        return detail

    # Audit log

    async def audit_page(self, params: PageParams, action: str | None) -> tuple[list[AuditEntry], int]:
        async with self.session.begin():
            rows, total = await self.audit.page(params, action)
        return [AuditEntry.of(entry, actor) for entry, actor in rows], total

    # Alerts (ADR 0017 section F, OD4): view, acknowledge, resolve with a note. Acknowledging never resolves.

    async def alerts_page(
        self, params: PageParams, state: Literal["open", "resolved", "all"]
    ) -> tuple[list[AlertOut], int]:
        async with self.session.begin():
            rows, total = await self.alerts.page(params, state)
            return [await self._alert_out(alert) for alert in rows], total

    async def acknowledge_alert(self, user: User, alert_id: uuid.UUID) -> AlertOut:
        async with self.session.begin():
            alert = await self.alerts.get(alert_id, for_update=True)
            if alert is None:
                raise NotFound()
            if alert.resolved_at is not None:
                raise IllegalTransition("This alert is already resolved.")
            if alert.acknowledged_at is None:
                alert.acknowledged_at = utcnow()
                alert.acknowledged_by = user.id
                await self.audit.write(
                    user.id, AuditAction.alert_acknowledged, "alert", alert.id, {"label": alert.kind}
                )
            return await self._alert_out(alert)

    async def resolve_alert(self, user: User, alert_id: uuid.UUID, note: str) -> AlertOut:
        async with self.session.begin():
            alert = await self.alerts.get(alert_id, for_update=True)
            if alert is None:
                raise NotFound()
            if alert.resolved_at is not None:
                raise IllegalTransition("This alert is already resolved.")
            now = utcnow()
            alert.acknowledged_at = alert.acknowledged_at or now
            alert.acknowledged_by = alert.acknowledged_by or user.id
            alert.resolved_at = now
            alert.resolved_by = user.id
            alert.resolution_note = note
            await self.audit.write(
                user.id, AuditAction.alert_resolved, "alert", alert.id, {"label": alert.kind, "reason": note}
            )
            return await self._alert_out(alert)

    async def alert_payment(self, alert_id: uuid.UUID) -> uuid.UUID | None:
        async with self.session.begin():
            alert = await self.alerts.get(alert_id)
            if alert is None:
                raise NotFound()
            return alert.payment_id

    async def _alert_out(self, alert: AdminAlert) -> AlertOut:
        payment = await PaymentRepository(self.session).get(alert.payment_id) if alert.payment_id else None
        names = {
            uid: (await self.session.get(User, uid))
            for uid in (alert.acknowledged_by, alert.resolved_by)
            if uid is not None
        }

        def name(uid: uuid.UUID | None) -> str | None:
            user = names.get(uid) if uid else None
            return user.full_name if user else None

        state: Literal["open", "acknowledged", "resolved"] = (
            "resolved" if alert.resolved_at else "acknowledged" if alert.acknowledged_at else "open"
        )
        return AlertOut(
            id=alert.id,
            kind=cast(AlertKindName, alert.kind),
            state=state,
            subject_key=alert.subject_key,
            payment_id=alert.payment_id,
            payment_reference=payment.paystack_reference if payment else None,
            details=alert.details or {},
            opened_at=alert.opened_at,
            acknowledged_at=alert.acknowledged_at,
            acknowledged_by=name(alert.acknowledged_by),
            resolved_at=alert.resolved_at,
            resolved_by=(name(alert.resolved_by) or "System") if alert.resolved_at else None,
            resolution_note=alert.resolution_note,
        )
