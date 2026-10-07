"""The family's own profile and dashboard."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.modules.families.repository import FamilyRepository
from app.modules.families.schemas import FamilyDashboard, FamilyProfile
from app.modules.placements.repository import PlacementRepository
from app.modules.placements.views import PlacementViews
from app.modules.requests.repository import RequestRepository
from app.modules.requests.views import RequestViews
from app.modules.users.models import User


class FamilyService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.families = FamilyRepository(session)
        self.placements = PlacementRepository(session)
        self.requests = RequestRepository(session)
        self.placement_views = PlacementViews(session, settings)
        self.request_views = RequestViews(session)

    async def profile(self, user: User) -> FamilyProfile | None:
        """None until the family posts its first request."""
        async with self.session.begin():
            family = await self.families.for_user(user.id)
        if family is None:
            return None
        return FamilyProfile(id=family.id, name=family.name, state=family.state, lga=family.lga)

    async def dashboard(self, user: User) -> FamilyDashboard:
        async with self.session.begin():
            family = await self.families.for_user(user.id)
            if family is None:
                return FamilyDashboard(active_placements=[], open_requests=[])
            active = await self.placements.active_for_family(family.id)
            open_requests = await self.requests.open_for_family(family.id)
            return FamilyDashboard(
                active_placements=await self.placement_views.summaries(active),
                open_requests=await self.request_views.for_family(open_requests),
            )
