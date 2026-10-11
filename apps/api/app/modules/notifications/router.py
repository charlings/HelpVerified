"""The signed-in user's notification feed (B6). Everyone sees only their own."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, NotificationServiceDep
from app.core.pagination import PageParams, page_params
from app.modules.notifications.schemas import MarkedRead, NotificationOut, NotificationPage

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    user: CurrentUser,
    notifications: NotificationServiceDep,
    params: Annotated[PageParams, Depends(page_params)],
    unread_only: bool = False,
) -> NotificationPage:
    """Newest first, with the unread count."""
    items, total, unread = await notifications.page(user, params, unread_only=unread_only)
    return NotificationPage(
        items=items, page=params.page, page_size=params.page_size, total=total, unread=unread
    )


@router.post("/read-all")
async def mark_all_read(user: CurrentUser, notifications: NotificationServiceDep) -> MarkedRead:
    return MarkedRead(updated=await notifications.mark_all_read(user))


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID, user: CurrentUser, notifications: NotificationServiceDep
) -> NotificationOut:
    """404 for someone else's notification."""
    return await notifications.mark_read(user, notification_id)
