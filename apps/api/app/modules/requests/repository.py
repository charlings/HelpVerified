"""Request and proposal queries."""

import uuid
from collections import defaultdict

from sqlalchemy import ColumnElement, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams
from app.modules.agencies.models import WorkerRole
from app.modules.requests.models import Proposal, ProposalStatus, Request, RequestStatus


class RequestRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # Requests

    async def get(self, request_id: uuid.UUID, *, for_update: bool = False) -> Request | None:
        query = select(Request).where(Request.id == request_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def add(self, request: Request) -> Request:
        self.session.add(request)
        await self.session.flush()
        await self.session.refresh(request)
        return request

    async def page_for_family(self, family_id: uuid.UUID, params: PageParams) -> tuple[list[Request], int]:
        where = Request.family_id == family_id
        rows = await self.session.scalars(
            select(Request)
            .where(where)
            .order_by(Request.created_at.desc(), Request.id)
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(select(func.count()).select_from(Request).where(where)) or 0
        return list(rows), total

    async def open_for_family(self, family_id: uuid.UUID) -> list[Request]:
        rows = await self.session.scalars(
            select(Request)
            .where(Request.family_id == family_id, Request.status == RequestStatus.open)
            .order_by(Request.created_at.desc())
        )
        return list(rows)

    def _matching(self, roles: list[WorkerRole], state: str) -> list[ColumnElement[bool]]:
        return [Request.status == RequestStatus.open, Request.role.in_(roles), Request.state == state]

    async def page_matching(
        self, roles: list[WorkerRole], state: str, params: PageParams
    ) -> tuple[list[Request], int]:
        """Open requests for roles an agency places, in its state (api-contracts.md §3)."""
        where = self._matching(roles, state)
        rows = await self.session.scalars(
            select(Request)
            .where(*where)
            .order_by(Request.created_at.desc(), Request.id)
            .offset(params.offset)
            .limit(params.page_size)
        )
        total = await self.session.scalar(select(func.count()).select_from(Request).where(*where)) or 0
        return list(rows), total

    async def count_matching(self, roles: list[WorkerRole], state: str) -> int:
        where = self._matching(roles, state)
        return await self.session.scalar(select(func.count()).select_from(Request).where(*where)) or 0

    # Proposals

    async def proposal(self, proposal_id: uuid.UUID, *, for_update: bool = False) -> Proposal | None:
        query = select(Proposal).where(Proposal.id == proposal_id)
        return await self.session.scalar(query.with_for_update() if for_update else query)

    async def proposal_for(self, request_id: uuid.UUID, worker_id: uuid.UUID) -> Proposal | None:
        return await self.session.scalar(
            select(Proposal)
            .where(Proposal.request_id == request_id, Proposal.worker_id == worker_id)
            .with_for_update()
        )

    async def add_proposal(self, proposal: Proposal) -> Proposal:
        self.session.add(proposal)
        await self.session.flush()
        await self.session.refresh(proposal)
        return proposal

    async def proposals_for_request(
        self, request_id: uuid.UUID, *, agency_id: uuid.UUID | None = None, hide_withdrawn: bool = False
    ) -> list[Proposal]:
        query = select(Proposal).where(Proposal.request_id == request_id)
        if agency_id:
            query = query.where(Proposal.agency_id == agency_id)
        if hide_withdrawn:
            query = query.where(Proposal.status != ProposalStatus.withdrawn)
        order = Proposal.created_at.desc() if agency_id else Proposal.created_at
        return list(await self.session.scalars(query.order_by(order, Proposal.id)))

    async def proposal_counts(self, request_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
        """For each request: proposals visible to the family (not withdrawn) and how many are pending."""
        rows = await self.session.execute(
            select(Proposal.request_id, Proposal.status, func.count())
            .where(Proposal.request_id.in_(request_ids), Proposal.status != ProposalStatus.withdrawn)
            .group_by(Proposal.request_id, Proposal.status)
        )
        counts: dict[uuid.UUID, dict[str, int]] = defaultdict(lambda: {"total": 0, "pending": 0})
        for request_id, status, n in rows:
            counts[request_id]["total"] += n
            if status is ProposalStatus.pending:
                counts[request_id]["pending"] += n
        return counts

    async def agency_proposal_counts(
        self, agency_id: uuid.UUID, request_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, int]:
        rows = await self.session.execute(
            select(Proposal.request_id, func.count())
            .where(Proposal.agency_id == agency_id, Proposal.request_id.in_(request_ids))
            .group_by(Proposal.request_id)
        )
        return {request_id: n for request_id, n in rows}

    async def agency_has_proposed(self, agency_id: uuid.UUID, request_id: uuid.UUID) -> bool:
        return (
            await self.session.scalar(
                select(func.count()).where(Proposal.agency_id == agency_id, Proposal.request_id == request_id)
            )
            or 0
        ) > 0

    async def set_proposals(
        self,
        request_id: uuid.UUID,
        from_statuses: tuple[ProposalStatus, ...],
        to: ProposalStatus,
        *,
        except_id: uuid.UUID | None = None,
    ) -> None:
        query = update(Proposal).where(Proposal.request_id == request_id, Proposal.status.in_(from_statuses))
        if except_id:
            query = query.where(Proposal.id != except_id)
        await self.session.execute(query.values(status=to))

    async def withdraw_pending_for_agency(self, agency_id: uuid.UUID) -> None:
        """An agency is suspended: its pending proposals leave families' view (ADR 0006)."""
        await self.session.execute(
            update(Proposal)
            .where(Proposal.agency_id == agency_id, Proposal.status == ProposalStatus.pending)
            .values(status=ProposalStatus.withdrawn)
        )

    async def family_received_worker(self, family_id: uuid.UUID, worker_id: uuid.UUID) -> bool:
        """The family has been proposed this worker (and the proposal wasn't withdrawn)."""
        return (
            await self.session.scalar(
                select(func.count())
                .select_from(Proposal)
                .join(Request, Request.id == Proposal.request_id)
                .where(
                    Proposal.worker_id == worker_id,
                    Proposal.status != ProposalStatus.withdrawn,
                    Request.family_id == family_id,
                )
            )
            or 0
        ) > 0
