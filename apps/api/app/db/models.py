"""Imports every ORM model so `Base.metadata` is complete (Alembic, the schema-drift test).

Add each new module's models here.
"""

from app.modules.admin.models import AuditLog
from app.modules.agencies.models import Agency, AgencyMember, Subscription
from app.modules.auth.models import OneTimeToken, RefreshToken
from app.modules.families.models import Family
from app.modules.notifications.models import Notification
from app.modules.payments.models import Payment, WebhookEvent
from app.modules.placements.models import Placement, PlacementEvent, ReplacementRequest
from app.modules.requests.models import Proposal, Request
from app.modules.users.models import User
from app.modules.verification.models import DocumentAccess, VerificationDocument, VerificationItem
from app.modules.workers.models import Worker

__all__ = [
    "Agency",
    "AgencyMember",
    "AuditLog",
    "DocumentAccess",
    "Family",
    "Notification",
    "OneTimeToken",
    "Payment",
    "Placement",
    "PlacementEvent",
    "Proposal",
    "RefreshToken",
    "ReplacementRequest",
    "Request",
    "Subscription",
    "User",
    "VerificationDocument",
    "VerificationItem",
    "WebhookEvent",
    "Worker",
]
