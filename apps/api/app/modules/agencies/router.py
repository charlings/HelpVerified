"""`/agencies`: onboarding and the agency's own profile and dashboard."""

from fastapi import APIRouter, status

from app.core.deps import AgencyServiceDep, CurrentAgency, CurrentUser
from app.modules.agencies.schemas import (
    AgencyCreate,
    AgencyCreated,
    AgencyDashboard,
    AgencyProfile,
    AgencyUpdate,
)

router = APIRouter(prefix="/agencies", tags=["agencies"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_agency(body: AgencyCreate, user: CurrentUser, agencies: AgencyServiceDep) -> AgencyCreated:
    """Onboarding (agency admins, once, with a verified email). The agency waits for approval as `pending`."""
    agency = await agencies.register(user, body.model_dump())
    return AgencyCreated(id=agency.id, name=agency.name, status=agency.status.value)


@router.get("/me")
async def get_my_agency(agency: CurrentAgency) -> AgencyProfile:
    return AgencyProfile.of(agency)


@router.patch("/me")
async def update_my_agency(
    body: AgencyUpdate, agency: CurrentAgency, agencies: AgencyServiceDep
) -> AgencyProfile:
    return AgencyProfile.of(await agencies.update(agency, body.model_dump(exclude_unset=True)))


@router.get("/me/dashboard")
async def get_dashboard(agency: CurrentAgency, agencies: AgencyServiceDep) -> AgencyDashboard:
    return AgencyDashboard.model_validate(await agencies.dashboard(agency))
