"""`/workers`: an agency's own workers. Another agency's worker is 404."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentAgency, VerificationServiceDep, WorkerServiceDep
from app.core.pagination import Page, PageParams, page_params
from app.modules.agencies.models import WorkerRole
from app.modules.workers.models import ListingStatus
from app.modules.workers.schemas import ListingName, RoleName, WorkerCreate, WorkerOut, WorkerUpdate

router = APIRouter(prefix="/workers", tags=["workers"])


@router.get("")
async def list_workers(
    agency: CurrentAgency,
    workers: WorkerServiceDep,
    params: Annotated[PageParams, Depends(page_params)],
    role: RoleName | None = None,
    listing_status: ListingName | None = None,
    available: bool | None = None,
) -> Page[WorkerOut]:
    items, total = await workers.page(
        agency,
        params,
        WorkerRole(role) if role else None,
        ListingStatus(listing_status) if listing_status else None,
        available,
    )
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_worker(body: WorkerCreate, agency: CurrentAgency, workers: WorkerServiceDep) -> WorkerOut:
    """Adds a worker as a draft with four `not_started` checks. 409 DUPLICATE_WORKER if the NIN is known."""
    data = body.model_dump(exclude={"nin", "consent"})
    return await workers.create(agency, data, body.nin.get_secret_value())


@router.get("/{worker_id}")
async def get_worker(worker_id: uuid.UUID, agency: CurrentAgency, workers: WorkerServiceDep) -> WorkerOut:
    return await workers.get(agency, worker_id)


@router.patch("/{worker_id}")
async def update_worker(
    worker_id: uuid.UUID, body: WorkerUpdate, agency: CurrentAgency, workers: WorkerServiceDep
) -> WorkerOut:
    return await workers.update(agency, worker_id, body.model_dump(exclude_unset=True))


@router.post("/{worker_id}/list")
async def list_worker(
    worker_id: uuid.UUID, agency: CurrentAgency, checks: VerificationServiceDep, workers: WorkerServiceDep
) -> WorkerOut:
    """Rule 1: needs all four checks verified and unexpired (409 WORKER_NOT_VERIFIED) and an approved,
    subscribed agency (403 AGENCY_NOT_ACTIVE)."""
    await checks.list_worker(agency, worker_id)
    return await workers.get(agency, worker_id)


@router.post("/{worker_id}/delist")
async def delist_worker(
    worker_id: uuid.UUID, agency: CurrentAgency, checks: VerificationServiceDep, workers: WorkerServiceDep
) -> WorkerOut:
    await checks.delist_worker(agency, worker_id)
    return await workers.get(agency, worker_id)
