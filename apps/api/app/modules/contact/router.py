"""`POST /contact`: public and rate-limited per IP (api-contracts.md "Added during Phase 1")."""

from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Request, status

from app.core.deps import ContactServiceDep, LimiterDep, SettingsDep
from app.core.rate_limit import identifier
from app.modules.contact.schemas import ContactIn, ContactReceipt

router = APIRouter(tags=["contact"])
HOUR = timedelta(hours=1)


@router.post("/contact", status_code=status.HTTP_202_ACCEPTED)
async def contact(
    body: ContactIn,
    request: Request,
    background: BackgroundTasks,
    service: ContactServiceDep,
    limiter: LimiterDep,
    settings: SettingsDep,
) -> ContactReceipt:
    """Accepts a message for the team; it's emailed after the response."""
    ip = request.client.host if request.client else "unknown"
    await limiter.hit("contact", identifier(ip), settings.RATE_LIMIT_CONTACT_PER_HOUR, HOUR)
    background.add_task(service.send, service.message(body))
    return ContactReceipt()
