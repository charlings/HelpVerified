"""`/families/me`: the family's profile (null before its first request) and dashboard."""

from fastapi import APIRouter

from app.core.deps import FamilyServiceDep, FamilyUser
from app.modules.families.schemas import FamilyDashboard, FamilyProfile

router = APIRouter(prefix="/families", tags=["families"])


@router.get("/me")
async def get_family(user: FamilyUser, families: FamilyServiceDep) -> FamilyProfile | None:
    return await families.profile(user)


@router.get("/me/dashboard")
async def get_dashboard(user: FamilyUser, families: FamilyServiceDep) -> FamilyDashboard:
    """Active placements and open requests."""
    return await families.dashboard(user)
