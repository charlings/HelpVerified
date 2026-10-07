"""`/admin`: super-admin moderation. Every other role gets 403 FORBIDDEN."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import AdminServiceDep, AdminUser, VerificationServiceDep
from app.core.pagination import Page, PageParams, page_params
from app.modules.admin.schemas import (
    AdminAgencyDetail,
    AdminAgencySummary,
    AdminOverview,
    AdminWorkerDetail,
    AgencyActionIn,
    AuditEntry,
    FlagIn,
)
from app.modules.agencies.models import AgencyStatus, WorkerRole
from app.modules.agencies.schemas import AgencyStatusName
from app.modules.verification.models import VerificationKind
from app.modules.workers.models import ListingStatus
from app.modules.workers.schemas import AdminWorkerOut, ListingName, RoleName

router = APIRouter(prefix="/admin", tags=["admin"])
Paging = Annotated[PageParams, Depends(page_params)]


@router.get("/overview")
async def overview(_: AdminUser, admin: AdminServiceDep) -> AdminOverview:
    """Counts, the approval queue (oldest first) and the five latest audit entries."""
    return await admin.overview()


@router.get("/agencies")
async def list_agencies(
    _: AdminUser, admin: AdminServiceDep, params: Paging, status: AgencyStatusName | None = None
) -> Page[AdminAgencySummary]:
    """Pending first, then newest."""
    items, total = await admin.agencies_page(params, AgencyStatus(status) if status else None)
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.get("/agencies/{agency_id}")
async def get_agency(agency_id: uuid.UUID, _: AdminUser, admin: AdminServiceDep) -> AdminAgencyDetail:
    return await admin.agency_detail(agency_id)


@router.post("/agencies/{agency_id}/{action}")
async def move_agency(
    agency_id: uuid.UUID, action: str, body: AgencyActionIn, user: AdminUser, admin: AdminServiceDep
) -> AdminAgencyDetail:
    """`approve`, `reject` (reason), `suspend` (reason) or `reinstate`. 409 if the move is no longer legal."""
    return await admin.move_agency(user, agency_id, action, body.reason)


@router.get("/workers")
async def list_workers(
    _: AdminUser,
    admin: AdminServiceDep,
    params: Paging,
    agency_id: uuid.UUID | None = None,
    role: RoleName | None = None,
    listing_status: ListingName | None = None,
) -> Page[AdminWorkerOut]:
    items, total = await admin.workers_page(
        params,
        agency_id,
        WorkerRole(role) if role else None,
        ListingStatus(listing_status) if listing_status else None,
    )
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.get("/workers/{worker_id}")
async def get_worker(worker_id: uuid.UUID, _: AdminUser, admin: AdminServiceDep) -> AdminWorkerDetail:
    """The worker with all four checks (document metadata only, never URLs)."""
    return await admin.worker_detail(worker_id)


@router.post("/workers/{worker_id}/flag")
async def flag_check(
    worker_id: uuid.UUID,
    body: FlagIn,
    user: AdminUser,
    checks: VerificationServiceDep,
    admin: AdminServiceDep,
) -> AdminWorkerDetail:
    """Send a verified check back to review with a reason the agency sees. Delists the worker."""
    await checks.flag(user, worker_id, VerificationKind(body.kind), body.reason)
    return await admin.worker_detail(worker_id)


@router.get("/audit-log")
async def audit_log(
    _: AdminUser, admin: AdminServiceDep, params: Paging, action: str | None = None
) -> Page[AuditEntry]:
    """Newest first."""
    items, total = await admin.audit_page(params, action)
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)
