"""`/me`: the signed-in user, with their agency if they're an agency admin who has registered one."""

from fastapi import APIRouter

from app.core.deps import AgencyServiceDep, CurrentUser, UserServiceDep
from app.modules.users.schemas import MeUpdate, UserOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def get_me(user: CurrentUser, agencies: AgencyServiceDep) -> UserOut:
    return UserOut.of(user, await agencies.for_user(user.id))


@router.patch("")
async def update_me(
    body: MeUpdate, user: CurrentUser, users: UserServiceDep, agencies: AgencyServiceDep
) -> UserOut:
    updated = await users.update_profile(user, body.model_dump(exclude_unset=True))
    return UserOut.of(updated, await agencies.for_user(user.id))
