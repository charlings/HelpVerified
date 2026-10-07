"""Family requests and agency proposals (api-contracts.md §3; rules mirror the web mock's
family-requests.ts and requests.ts). Accepting a proposal lives in the placement service."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.dates import lagos_date
from app.core.errors import (
    AgencyNotActive,
    AlreadyProposed,
    EmailNotVerified,
    IllegalTransition,
    NotFound,
    RequestNotOpen,
    ValidationFailed,
    WorkerNotListed,
    WorkerUnavailable,
)
from app.core.pagination import PageParams
from app.modules.agencies.models import Agency, WorkerRole
from app.modules.agencies.repository import AgencyRepository
from app.modules.agencies.service import is_active
from app.modules.families.models import Family
from app.modules.families.repository import FamilyRepository
from app.modules.placements.repository import PlacementRepository
from app.modules.requests.models import Proposal, ProposalStatus, Request, RequestStatus
from app.modules.requests.repository import RequestRepository
from app.modules.requests.schemas import (
    AgencyProposalOut,
    AgencyRequestOut,
    FamilyProposalOut,
    FamilyRequestOut,
    WorkerPublicOut,
)
from app.modules.requests.views import RequestViews
from app.modules.users.models import User
from app.modules.verification.models import KINDS
from app.modules.verification.repository import VerificationRepository
from app.modules.workers.models import ListingStatus, Worker
from app.modules.workers.repository import WorkerRepository


def family_name(full_name: str) -> str:
    """ "Ada Okafor" → "Okafor family" (what agencies see)."""
    parts = full_name.split()
    return f"{parts[-1] if parts else full_name} family"


class RequestService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.requests = RequestRepository(session)
        self.families = FamilyRepository(session)
        self.agencies = AgencyRepository(session)
        self.workers = WorkerRepository(session)
        self.checks = VerificationRepository(session)
        self.placements = PlacementRepository(session)
        self.views = RequestViews(session)

    # Family side

    async def create(self, user: User, data: dict[str, Any]) -> FamilyRequestOut:
        """Needs a verified email. The family record is created with the first request."""
        if user.email_verified_at is None:
            raise EmailNotVerified()
        if data["start_date"] < lagos_date(utcnow()):
            raise ValidationFailed(
                details={"fields": {"start_date": ["The start date can't be in the past."]}}
            )
        async with self.session.begin():
            family = await self.families.for_user(user.id, for_update=True)
            if family is None:
                family = await self.families.add(
                    Family(
                        user_id=user.id,
                        name=family_name(user.full_name),
                        state=data["state"],
                        lga=data["lga"],
                    )
                )
            request = await self.requests.add(
                Request(**data | {"role": WorkerRole(data["role"])}, family_id=family.id)
            )
            [out] = await self.views.for_family([request])
            return out

    async def family_page(self, user: User, params: PageParams) -> tuple[list[FamilyRequestOut], int]:
        async with self.session.begin():
            family = await self.families.for_user(user.id)
            if family is None:
                return [], 0
            rows, total = await self.requests.page_for_family(family.id, params)
            return await self.views.for_family(rows), total

    async def family_get(self, user: User, request_id: uuid.UUID) -> FamilyRequestOut:
        async with self.session.begin():
            request = await self._own_request(user, request_id)
            [out] = await self.views.for_family([request])
            return out

    async def cancel(self, user: User, request_id: uuid.UUID) -> FamilyRequestOut:
        """Only open requests; their pending proposals are declined."""
        async with self.session.begin():
            request = await self._own_request(user, request_id, for_update=True)
            if request.status is not RequestStatus.open:
                raise RequestNotOpen("Only open requests can be cancelled.")
            request.status = RequestStatus.cancelled
            await self.requests.set_proposals(request.id, (ProposalStatus.pending,), ProposalStatus.declined)
            await self.session.flush()
            [out] = await self.views.for_family([request])
            return out

    async def family_proposals(self, user: User, request_id: uuid.UUID) -> list[FamilyProposalOut]:
        """Oldest first; withdrawn proposals are hidden."""
        async with self.session.begin():
            request = await self._own_request(user, request_id)
            proposals = await self.requests.proposals_for_request(request.id, hide_withdrawn=True)
            return await self.views.family_proposals(proposals)

    async def decline(self, user: User, proposal_id: uuid.UUID) -> FamilyProposalOut:
        async with self.session.begin():
            proposal = await self._own_proposal(user, proposal_id)
            if proposal.status is not ProposalStatus.pending:
                raise IllegalTransition("Only pending proposals can be declined.")
            proposal.status = ProposalStatus.declined
            await self.session.flush()
            [out] = await self.views.family_proposals([proposal])
            return out

    async def worker_public(self, user: User, worker_id: uuid.UUID) -> WorkerPublicOut:
        """Only for a family that has been proposed this worker; anyone else gets 404."""
        async with self.session.begin():
            family = await self.families.for_user(user.id)
            worker = await self.workers.get(worker_id)
            if (
                family is None
                or worker is None
                or not await self.requests.family_received_worker(family.id, worker.id)
            ):
                raise NotFound()
            return await self.views.worker_public(worker)

    # Agency side

    async def agency_page(self, agency: Agency, params: PageParams) -> tuple[list[AgencyRequestOut], int]:
        """Open requests for roles the agency places, in its state."""
        async with self.session.begin():
            rows, total = await self.requests.page_matching(list(agency.roles_offered), agency.state, params)
            return await self.views.for_agency(agency.id, rows), total

    async def agency_get(self, agency: Agency, request_id: uuid.UUID) -> AgencyRequestOut:
        async with self.session.begin():
            request = await self._visible(agency, request_id)
            [out] = await self.views.for_agency(agency.id, [request])
            return out

    async def agency_proposals(self, agency: Agency, request_id: uuid.UUID) -> list[AgencyProposalOut]:
        """Only the agency's own proposals, never competitors'."""
        async with self.session.begin():
            request = await self._visible(agency, request_id)
            proposals = await self.requests.proposals_for_request(request.id, agency_id=agency.id)
            return await self.views.agency_proposals(proposals)

    async def propose(
        self, agency: Agency, request_id: uuid.UUID, worker_id: uuid.UUID, note: str | None
    ) -> AgencyProposalOut:
        """Checks, in the mock's order: visible → agency active → request open → own worker → role →
        listed with all four checks unexpired (rule 1) → available (rule 2) → not already proposed."""
        now = utcnow()
        async with self.session.begin():
            request = await self._visible(agency, request_id, for_update=True)
            current = await self.agencies.get(agency.id)
            if current is None or not is_active(current, await self.agencies.subscription(agency.id)):
                raise AgencyNotActive()
            if request.status is not RequestStatus.open:
                raise RequestNotOpen()
            worker = await self.workers.get_owned(worker_id, agency.id, for_update=True)
            if worker is None:
                raise ValidationFailed(details={"fields": {"worker_id": ["Choose one of your workers."]}})
            if worker.role is not request.role:
                raise ValidationFailed(
                    details={"fields": {"worker_id": [f"This request is for a {request.role.value}."]}}
                )
            await self._require_proposable(worker, now)
            if await self.placements.occupying(worker.id, now):
                raise WorkerUnavailable("This worker is in a placement.")
            note = note or None
            existing = await self.requests.proposal_for(request.id, worker.id)
            if existing is not None and existing.status is not ProposalStatus.withdrawn:
                raise AlreadyProposed()
            if existing is not None:  # a withdrawn proposal can be made again
                existing.status = ProposalStatus.pending
                existing.note = note
                existing.created_at = now
                proposal = existing
                await self.session.flush()
            else:
                proposal = await self.requests.add_proposal(
                    Proposal(request_id=request.id, worker_id=worker.id, agency_id=agency.id, note=note)
                )
            [out] = await self.views.agency_proposals([proposal])
            return out

    async def withdraw(self, agency: Agency, proposal_id: uuid.UUID) -> AgencyProposalOut:
        async with self.session.begin():
            proposal = await self.requests.proposal(proposal_id, for_update=True)
            if proposal is None or proposal.agency_id != agency.id:
                raise NotFound()
            if proposal.status is not ProposalStatus.pending:
                raise IllegalTransition("Only pending proposals can be withdrawn.")
            proposal.status = ProposalStatus.withdrawn
            await self.session.flush()
            [out] = await self.views.agency_proposals([proposal])
            return out

    # Helpers

    async def _require_proposable(self, worker: Worker, now: Any) -> None:
        """Rule 1 at the point of offering: listed, with all four checks still unexpired (a lapsed check
        counts even before the expiry job runs)."""
        if worker.listing_status is not ListingStatus.listed:
            raise WorkerNotListed()
        if await self.checks.count_verified_unexpired(worker.id, now) < len(KINDS):
            raise WorkerNotListed()

    async def _family(self, user: User) -> Family:
        family = await self.families.for_user(user.id)
        if family is None:
            raise NotFound()
        return family

    async def _own_request(self, user: User, request_id: uuid.UUID, *, for_update: bool = False) -> Request:
        family = await self._family(user)
        request = await self.requests.get(request_id, for_update=for_update)
        if request is None or request.family_id != family.id:
            raise NotFound()
        return request

    async def _own_proposal(self, user: User, proposal_id: uuid.UUID) -> Proposal:
        family = await self._family(user)
        proposal = await self.requests.proposal(proposal_id, for_update=True)
        request = await self.requests.get(proposal.request_id) if proposal else None
        if proposal is None or request is None or request.family_id != family.id:
            raise NotFound()
        return proposal

    async def _visible(self, agency: Agency, request_id: uuid.UUID, *, for_update: bool = False) -> Request:
        """An agency sees open requests matching its roles and state, plus any it has proposed to."""
        request = await self.requests.get(request_id, for_update=for_update)
        if request is None:
            raise NotFound()
        matches = (
            request.status is RequestStatus.open
            and request.role in agency.roles_offered
            and request.state == agency.state
        )
        if not matches and not await self.requests.agency_has_proposed(agency.id, request.id):
            raise NotFound()
        return request
