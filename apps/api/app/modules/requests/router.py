"""`/requests`, `/proposals` and `/workers/{id}/public`. Shared paths answer by the caller's role,
as the web mock does: families see their own requests, agencies the open ones that match them."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from fastapi.responses import JSONResponse

from app.core.deps import (
    AgencyServiceDep,
    CurrentAgency,
    CurrentUser,
    FamilyUser,
    IdempotencyDep,
    PlacementServiceDep,
    RequestServiceDep,
)
from app.core.errors import Forbidden
from app.core.idempotent import run_once
from app.core.pagination import Page, PageParams, page_params
from app.modules.placements.schemas import AcceptOut, CheckoutOut
from app.modules.requests.schemas import (
    AgencyProposalOut,
    AgencyRequestOut,
    FamilyProposalOut,
    FamilyRequestOut,
    ProposalCreate,
    RequestCreate,
    WorkerPublicOut,
)
from app.modules.users.models import UserRole

router = APIRouter(tags=["requests"])
Paging = Annotated[PageParams, Depends(page_params)]


@router.get("/requests")
async def list_requests(
    user: CurrentUser, requests: RequestServiceDep, agencies: AgencyServiceDep, params: Paging
) -> Page[FamilyRequestOut] | Page[AgencyRequestOut]:
    """Family: its own requests, newest first. Agency: open requests for its roles in its state."""
    if user.role is UserRole.family:
        family_items, total = await requests.family_page(user, params)
        return Page(items=family_items, page=params.page, page_size=params.page_size, total=total)
    agency = await agencies.require_for_user(user)
    agency_items, total = await requests.agency_page(agency, params)
    return Page(items=agency_items, page=params.page, page_size=params.page_size, total=total)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def create_request(
    body: RequestCreate, user: FamilyUser, requests: RequestServiceDep
) -> FamilyRequestOut:
    """Needs a verified email (403 EMAIL_NOT_VERIFIED)."""
    return await requests.create(user, body.model_dump())


@router.get("/requests/{request_id}")
async def get_request(
    request_id: uuid.UUID, user: CurrentUser, requests: RequestServiceDep, agencies: AgencyServiceDep
) -> FamilyRequestOut | AgencyRequestOut:
    if user.role is UserRole.family:
        return await requests.family_get(user, request_id)
    return await requests.agency_get(await agencies.require_for_user(user), request_id)


@router.post("/requests/{request_id}/cancel")
async def cancel_request(
    request_id: uuid.UUID, user: FamilyUser, requests: RequestServiceDep
) -> FamilyRequestOut:
    return await requests.cancel(user, request_id)


@router.get("/requests/{request_id}/proposals")
async def list_proposals(
    request_id: uuid.UUID, user: CurrentUser, requests: RequestServiceDep, agencies: AgencyServiceDep
) -> list[FamilyProposalOut] | list[AgencyProposalOut]:
    """Family: every proposal except withdrawn ones. Agency: only its own."""
    if user.role is UserRole.family:
        return await requests.family_proposals(user, request_id)
    return await requests.agency_proposals(await agencies.require_for_user(user), request_id)


@router.post("/requests/{request_id}/proposals", status_code=status.HTTP_201_CREATED)
async def propose(
    request_id: uuid.UUID, body: ProposalCreate, agency: CurrentAgency, requests: RequestServiceDep
) -> AgencyProposalOut:
    """Offer a listed, available worker (rules 1 and 2). A withdrawn proposal can be made again."""
    return await requests.propose(agency, request_id, body.worker_id, body.note)


@router.post("/proposals/{proposal_id}/withdraw")
async def withdraw(
    proposal_id: uuid.UUID, agency: CurrentAgency, requests: RequestServiceDep
) -> AgencyProposalOut:
    return await requests.withdraw(agency, proposal_id)


@router.post("/proposals/{proposal_id}/decline")
async def decline(proposal_id: uuid.UUID, user: FamilyUser, requests: RequestServiceDep) -> FamilyProposalOut:
    return await requests.decline(user, proposal_id)


@router.post("/proposals/{proposal_id}/accept", status_code=status.HTTP_201_CREATED, response_model=AcceptOut)
async def accept(
    proposal_id: uuid.UUID,
    user: FamilyUser,
    placements: PlacementServiceDep,
    idempotency: IdempotencyDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    """Creates the placement and holds the worker (rule 2). Returns the checkout link, or `payment: null`
    when a free replacement waives the fee. Send an `Idempotency-Key` so a retry can't act twice."""

    async def act() -> AcceptOut:
        accepted = await placements.accept(user, proposal_id)
        checkout = accepted.checkout
        return AcceptOut(
            placement=accepted.placement,
            payment=CheckoutOut(authorization_url=checkout.authorization_url, reference=checkout.reference)
            if checkout
            else None,
        )

    return await run_once(idempotency, user, "accept", idempotency_key, status.HTTP_201_CREATED, act)


@router.get("/workers/{worker_id}/public")
async def worker_public(
    worker_id: uuid.UUID, user: CurrentUser, requests: RequestServiceDep
) -> WorkerPublicOut:
    """For a family that has been proposed this worker. Everyone else: 404 (families) or 403."""
    if user.role is not UserRole.family:
        raise Forbidden()
    return await requests.worker_public(user, worker_id)
