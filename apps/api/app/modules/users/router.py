"""`/me`: the signed-in user."""

from fastapi import APIRouter

from app.core.deps import CurrentUser, UserServiceDep
from app.modules.users.schemas import MeUpdate, UserOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
async def get_me(user: CurrentUser) -> UserOut:
    return UserOut.of(user)


@router.patch("")
async def update_me(body: MeUpdate, user: CurrentUser, users: UserServiceDep) -> UserOut:
    updated = await users.update_profile(user, body.model_dump(exclude_unset=True))
    return UserOut.of(updated)
