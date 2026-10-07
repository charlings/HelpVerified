"""`/placements`. Detail responses carry `allowed_actions` for the caller; screens render those."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, status
from fastapi.responses import JSONResponse

from app.core.deps import CurrentUser, FamilyUser, IdempotencyDep, PlacementServiceDep
from app.core.idempotent import run_once
from app.core.pagination import Page, PageParams, page_params
from app.modules.placements.models import PlacementStatus
from app.modules.placements.schemas import (
    PlacementOut,
    PlacementSummary,
    ReasonIn,
    ReplacementOut,
    StatusName,
)

router = APIRouter(prefix="/placements", tags=["placements"])


@router.get("")
async def list_placements(
    user: CurrentUser,
    placements: PlacementServiceDep,
    params: Annotated[PageParams, Depends(page_params)],
    status: StatusName | None = None,
) -> Page[PlacementSummary]:
    """Families and agencies see their own; super admins see all."""
    items, total = await placements.page(user, params, PlacementStatus(status) if status else None)
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.get("/{placement_id}")
async def get_placement(
    placement_id: uuid.UUID, user: CurrentUser, placements: PlacementServiceDep
) -> PlacementOut:
    return await placements.get(user, placement_id)


@router.post("/{placement_id}/confirm", response_model=PlacementOut)
async def confirm(
    placement_id: uuid.UUID,
    user: FamilyUser,
    placements: PlacementServiceDep,
    idempotency: IdempotencyDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    """trial → confirmed. Send an `Idempotency-Key` so a retry can't act twice."""

    async def act() -> PlacementOut:
        return await placements.confirm(user, placement_id)

    return await run_once(idempotency, user, "confirm", idempotency_key, status.HTTP_200_OK, act)


@router.post("/{placement_id}/cancel")
async def cancel(
    placement_id: uuid.UUID, body: ReasonIn, user: FamilyUser, placements: PlacementServiceDep
) -> PlacementOut:
    """Cancel an unpaid hold: the worker is released and the request reopens."""
    return await placements.cancel(user, placement_id, body.reason)


@router.post("/{placement_id}/end")
async def end(
    placement_id: uuid.UUID, body: ReasonIn, user: CurrentUser, placements: PlacementServiceDep
) -> PlacementOut:
    """The family, the agency or a super admin ends a placement on trial or confirmed."""
    return await placements.end(user, placement_id, body.reason)


@router.post("/{placement_id}/replacement")
async def replacement(
    placement_id: uuid.UUID, body: ReasonIn, user: FamilyUser, placements: PlacementServiceDep
) -> ReplacementOut:
    """During the trial or within the window after confirming (409 REPLACEMENT_WINDOW_CLOSED after)."""
    placement, new_request = await placements.replace(user, placement_id, body.reason)
    return ReplacementOut(placement=placement, new_request=new_request)
