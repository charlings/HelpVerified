"""Placements: accepting a proposal, the trial, confirmation, ending, replacement (database.md §5 to §7).

Rule 2 (CLAUDE.md): a worker is never in two active placements. `accept` locks the request, the
proposal and the worker row in that order (every path takes locks in this order, so they can't deadlock),
then checks availability; the second of two concurrent accepts waits on the worker lock and then sees the
first placement. The partial unique index `placements_one_active_per_worker` backs this up: if a path ever
skips the lock, the repository turns the violation into 409 WORKER_UNAVAILABLE.

Every status change goes through `_move`, which checks the state machine and writes one event row in the
same transaction (spec requirement 9).
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.dates import lagos_date
from app.core.errors import (
    IllegalTransition,
    NotFound,
    ReplacementWindowClosed,
    RequestNotOpen,
    WorkerNotListed,
    WorkerUnavailable,
)
from app.core.logging import get_logger
from app.core.pagination import PageParams
from app.integrations.payments import Checkout, PaymentGateway
from app.modules.admin.models import AuditAction
from app.modules.admin.repository import AuditRepository
from app.modules.agencies.repository import AgencyRepository
from app.modules.families.repository import FamilyRepository
from app.modules.payments.repository import PaymentRepository
from app.modules.placements.models import (
    EndReason,
    Placement,
    PlacementStatus,
    ReplacementRequest,
    ReplacementStatus,
)
from app.modules.placements.repository import PlacementRepository
from app.modules.placements.schemas import PlacementOut, PlacementSummary
from app.modules.placements.state_machine import can_transition, in_replacement_window
from app.modules.placements.views import PlacementViews
from app.modules.requests.models import ProposalStatus, Request, RequestStatus
from app.modules.requests.repository import RequestRepository
from app.modules.requests.schemas import FamilyRequestOut
from app.modules.requests.views import RequestViews
from app.modules.users.models import User, UserRole
from app.modules.verification.models import KINDS
from app.modules.verification.repository import VerificationRepository
from app.modules.workers.models import ListingStatus
from app.modules.workers.repository import WorkerRepository

log = get_logger("app.placements")

END_REASON_FOR_ROLE = {
    UserRole.family: EndReason.family_ended,
    UserRole.agency_admin: EndReason.agency_ended,
    UserRole.super_admin: EndReason.admin_ended,
}
FREE_REPLACEMENT_NOTE = "Replacement, no fee"


@dataclass(frozen=True)
class Accepted:
    placement: PlacementSummary
    checkout: Checkout | None  # None: the fee is waived (a free replacement)


class PlacementService:
    def __init__(self, session: AsyncSession, settings: Settings, payments: PaymentGateway) -> None:
        self.session = session
        self.settings = settings
        self.payments = payments
        self.placements = PlacementRepository(session)
        self.requests = RequestRepository(session)
        self.families = FamilyRepository(session)
        self.agencies = AgencyRepository(session)
        self.workers = WorkerRepository(session)
        self.checks = VerificationRepository(session)
        self.audit = AuditRepository(session)
        self.views = PlacementViews(session, settings)

    # Accept (rule 2)

    async def accept(self, user: User, proposal_id: uuid.UUID) -> Accepted:
        """database.md §7. Checks, in the contract's order: owned (404) → request open → proposal pending →
        worker listed with all four checks unexpired (rule 1) → worker free (rule 2)."""
        now = utcnow()
        async with self.session.begin():
            family = await self.families.for_user(user.id)
            unlocked = await self.requests.proposal(proposal_id)
            if family is None or unlocked is None:
                raise NotFound()
            request = await self.requests.get(unlocked.request_id, for_update=True)
            if request is None or request.family_id != family.id:
                raise NotFound()
            proposal = await self.requests.proposal(proposal_id, for_update=True)
            assert proposal is not None  # noqa: S101  # proposals are never deleted
            if request.status is not RequestStatus.open:
                raise RequestNotOpen()
            if proposal.status is not ProposalStatus.pending:
                raise IllegalTransition("This proposal can't be accepted.")
            worker = await self.workers.get(proposal.worker_id, for_update=True)  # the rule-2 lock
            assert worker is not None  # noqa: S101  # FK
            if worker.listing_status is not ListingStatus.listed:
                raise WorkerNotListed()
            if await self.checks.count_verified_unexpired(worker.id, now) < len(KINDS):
                raise WorkerNotListed()
            # A lapsed hold on this worker no longer counts; clear it now rather than wait for the job.
            for stale in await self.placements.expired_holds(now, worker_id=worker.id):
                await self._release_hold(stale, None, None, EndReason.payment_expired, now)
            if await self.placements.active_for_worker(worker.id):
                raise WorkerUnavailable()

            replaced = await self._replaced_placement(request)
            fee_waived = (
                replaced is not None and replaced.replacements_used <= self.settings.FREE_REPLACEMENTS
            )
            placement = await self.placements.add(  # the index backs up the check above
                Placement(
                    request_id=request.id,
                    proposal_id=proposal.id,
                    worker_id=worker.id,
                    family_id=family.id,
                    agency_id=proposal.agency_id,
                    replacements_used=replaced.replacements_used if replaced else 0,
                    **(
                        self._trial_fields(request, now)
                        if fee_waived
                        else {
                            "status": PlacementStatus.pending_payment,
                            "hold_expires_at": now + timedelta(minutes=self.settings.PAYMENT_HOLD_MINUTES),
                        }
                    ),
                )
            )
            await self.placements.add_event(
                placement.id, None, placement.status, user.id, FREE_REPLACEMENT_NOTE if fee_waived else None
            )
            proposal.status = ProposalStatus.accepted
            await self.requests.set_proposals(
                request.id, (ProposalStatus.pending,), ProposalStatus.superseded, except_id=proposal.id
            )
            request.status = RequestStatus.matched
            if replaced is not None:
                replacement = await self.placements.open_replacement_for(replaced.id)
                if replacement is not None:
                    replacement.status = ReplacementStatus.fulfilled
            await self.session.flush()
            summary = await self.views.summary(placement)
        log.info("placement.created", placement_id=str(placement.id), status=placement.status.value)
        if fee_waived:
            return Accepted(placement=summary, checkout=None)
        # Outside the transaction (database.md §7): the hold stands even if the provider is down.
        checkout = await self.payments.start_placement_checkout(placement.id, user.email)
        return Accepted(placement=summary, checkout=checkout)

    async def start_trial(self, placement_id: uuid.UUID, actor_id: uuid.UUID | None = None) -> Placement:
        """pending_payment → trial once the fee is paid (its own transaction)."""
        async with self.session.begin():
            placement = await self._locked(placement_id)
            await self.begin_trial_locked(placement, utcnow(), actor_id)
            return placement

    async def begin_trial_locked(
        self, placement: Placement, now: datetime, actor_id: uuid.UUID | None = None
    ) -> None:
        """pending_payment → trial inside the caller's transaction; the caller holds the placement lock.
        The payment service calls this once Paystack has confirmed the fee."""
        if placement.status is not PlacementStatus.pending_payment:
            raise IllegalTransition()
        request = await self.requests.get(placement.request_id)
        assert request is not None  # noqa: S101  # FK
        fields = self._trial_fields(request, now)
        placement.trial_starts_on = fields["trial_starts_on"]  # type: ignore[assignment]
        placement.trial_ends_on = fields["trial_ends_on"]  # type: ignore[assignment]
        await self._move(placement, PlacementStatus.trial, actor_id, None, now)
        placement.hold_expires_at = None
        await self.session.flush()

    # Family actions

    async def confirm(self, user: User, placement_id: uuid.UUID) -> PlacementOut:
        now = utcnow()
        async with self.session.begin():
            placement = await self._family_placement(user, placement_id)
            if placement.status is not PlacementStatus.trial:
                raise IllegalTransition("Only a placement on trial can be confirmed.")
            placement.confirmed_at = now
            await self._move(placement, PlacementStatus.confirmed, user.id, None, now)
            return await self.views.detail(placement, user, now)

    async def cancel(self, user: User, placement_id: uuid.UUID, reason: str) -> PlacementOut:
        """An unpaid hold: the worker is released and the request reopens with its proposals."""
        now = utcnow()
        async with self.session.begin():
            placement = await self._family_placement(user, placement_id)
            if placement.status is not PlacementStatus.pending_payment:
                raise IllegalTransition("Only a placement awaiting payment can be cancelled.")
            await self._release_hold(placement, user.id, reason, EndReason.family_ended, now)
            return await self.views.detail(placement, user, now)

    async def end(self, user: User, placement_id: uuid.UUID, reason: str) -> PlacementOut:
        """Family, agency or super admin; the end reason records who. Admin ends are audited."""
        now = utcnow()
        async with self.session.begin():
            placement = await self._visible_placement(user, placement_id, for_update=True)
            if placement.status not in (PlacementStatus.trial, PlacementStatus.confirmed):
                raise IllegalTransition("This placement can't be ended now.")
            placement.end_reason = END_REASON_FOR_ROLE[user.role]
            placement.ended_at = now
            await self._move(placement, PlacementStatus.ended, user.id, reason, now)
            request = await self.requests.get(placement.request_id, for_update=True)
            if request is not None:
                request.status = RequestStatus.closed
            if user.role is UserRole.super_admin:
                summary = await self.views.summary(placement)
                await self.audit.write(
                    user.id,
                    AuditAction.placement_ended,
                    "placement",
                    placement.id,
                    {"label": f"{summary.worker.full_name} with the {summary.family.name}", "reason": reason},
                )
            return await self.views.detail(placement, user, now)

    async def replace(
        self, user: User, placement_id: uuid.UUID, reason: str
    ) -> tuple[PlacementOut, FamilyRequestOut]:
        """database.md §6: during the trial, or within REPLACEMENT_WINDOW_DAYS of confirming. Ends this
        placement as `replaced`, closes its request, opens a linked copy and counts the replacement."""
        now = utcnow()
        async with self.session.begin():
            placement = await self._family_placement(user, placement_id)
            if placement.status not in (PlacementStatus.trial, PlacementStatus.confirmed):
                raise IllegalTransition("This placement can't be replaced.")
            if not in_replacement_window(
                placement.status, placement.confirmed_at, self.settings.REPLACEMENT_WINDOW_DAYS, now
            ):
                raise ReplacementWindowClosed()
            placement.end_reason = EndReason.replaced
            placement.ended_at = now
            placement.replacements_used += 1
            await self._move(placement, PlacementStatus.ended, user.id, reason, now)
            original = await self.requests.get(placement.request_id, for_update=True)
            assert original is not None  # noqa: S101  # FK
            original.status = RequestStatus.closed
            copy = await self.requests.add(
                Request(
                    family_id=original.family_id,
                    role=original.role,
                    title=original.title,
                    description=original.description,
                    schedule=original.schedule,
                    live_in=original.live_in,
                    state=original.state,
                    lga=original.lga,
                    budget_min_kobo=original.budget_min_kobo,
                    budget_max_kobo=original.budget_max_kobo,
                    start_date=lagos_date(now),
                    trial_days=original.trial_days,
                    replaces_placement_id=placement.id,
                )
            )
            await self.placements.add_replacement(
                ReplacementRequest(
                    placement_id=placement.id, requested_by=user.id, reason=reason, new_request_id=copy.id
                )
            )
            detail = await self.views.detail(placement, user, now)
            [new_request] = await RequestViews(self.session).for_family([copy])
            return detail, new_request

    # Jobs

    async def expire_holds(self) -> int:
        """Unpaid holds past their deadline are cancelled (`payment_expired`). B6 runs this every minute."""
        now = utcnow()
        async with self.session.begin():
            expired = await self.placements.expired_holds(now)
            for placement in expired:
                await self._release_hold(placement, None, None, EndReason.payment_expired, now)
        if expired:
            log.info("placements.holds_expired", count=len(expired))
        return len(expired)

    # Reading

    async def get(self, user: User, placement_id: uuid.UUID) -> PlacementOut:
        async with self.session.begin():
            placement = await self._visible_placement(user, placement_id)
            return await self.views.detail(placement, user, utcnow())

    async def page(
        self, user: User, params: PageParams, status: PlacementStatus | None
    ) -> tuple[list[PlacementSummary], int]:
        """Families see theirs, agencies theirs, super admins all."""
        async with self.session.begin():
            scope: dict[str, uuid.UUID] = {}
            if user.role is UserRole.family:
                family = await self.families.for_user(user.id)
                if family is None:
                    return [], 0
                scope["family_id"] = family.id
            elif user.role is UserRole.agency_admin:
                agency = await self.agencies.for_user(user.id)
                if agency is None:
                    return [], 0
                scope["agency_id"] = agency.id
            rows, total = await self.placements.page(params, status=status, **scope)
            return await self.views.summaries(rows), total

    # Helpers

    async def _move(
        self,
        placement: Placement,
        to: PlacementStatus,
        actor_id: uuid.UUID | None,
        reason: str | None,
        now: datetime,
    ) -> None:
        """The one way a placement changes status: the state machine, then one event row."""
        if not can_transition(placement.status, to):
            raise IllegalTransition()
        from_status = placement.status
        placement.status = to
        await self.session.flush()
        await self.placements.add_event(placement.id, from_status, to, actor_id, reason)

    async def _release_hold(
        self,
        placement: Placement,
        actor_id: uuid.UUID | None,
        reason: str | None,
        end_reason: EndReason,
        now: datetime,
    ) -> None:
        """pending_payment → cancelled; the request reopens and its proposals return to pending.
        The unpaid checkout is marked failed: if the family pays it anyway, the payment is refunded."""
        placement.end_reason = end_reason
        placement.ended_at = now
        await self._move(placement, PlacementStatus.cancelled, actor_id, reason, now)
        placement.hold_expires_at = None
        await PaymentRepository(self.session).fail_pending_fee(placement.id)
        request = await self.requests.get(placement.request_id, for_update=True)
        if request is not None and request.status is RequestStatus.matched:
            request.status = RequestStatus.open
            await self.requests.set_proposals(
                request.id, (ProposalStatus.superseded, ProposalStatus.accepted), ProposalStatus.pending
            )
        await self.session.flush()

    def _trial_fields(self, request: Request, now: datetime) -> dict[str, object]:
        starts = lagos_date(now)
        return {
            "status": PlacementStatus.trial,
            "trial_starts_on": starts,
            "trial_ends_on": starts + timedelta(days=request.trial_days),
        }

    async def _replaced_placement(self, request: Request) -> Placement | None:
        return (
            await self.placements.get(request.replaces_placement_id)
            if request.replaces_placement_id
            else None
        )

    async def _locked(self, placement_id: uuid.UUID) -> Placement:
        placement = await self.placements.get(placement_id, for_update=True)
        if placement is None:
            raise NotFound()
        return placement

    async def _family_placement(self, user: User, placement_id: uuid.UUID) -> Placement:
        family = await self.families.for_user(user.id)
        placement = await self.placements.get(placement_id, for_update=True)
        if family is None or placement is None or placement.family_id != family.id:
            raise NotFound()
        return placement

    async def _visible_placement(
        self, user: User, placement_id: uuid.UUID, *, for_update: bool = False
    ) -> Placement:
        """The parties and super admins; anyone else gets 404 (backend.md §2)."""
        placement = await self.placements.get(placement_id, for_update=for_update)
        if placement is None:
            raise NotFound()
        if user.role is UserRole.super_admin:
            return placement
        if user.role is UserRole.agency_admin:
            agency = await self.agencies.for_user(user.id)
            if agency is not None and agency.id == placement.agency_id:
                return placement
        elif user.role is UserRole.family:
            family = await self.families.for_user(user.id)
            if family is not None and family.id == placement.family_id:
                return placement
        raise NotFound()
