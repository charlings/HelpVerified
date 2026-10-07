"""Imports every ORM model so `Base.metadata` is complete (Alembic, the schema-drift test).

Add each new module's models here.
"""

from app.modules.admin.models import AuditLog
from app.modules.agencies.models import Agency, AgencyMember, Subscription
from app.modules.auth.models import OneTimeToken, RefreshToken
from app.modules.users.models import User
from app.modules.verification.models import DocumentAccess, VerificationDocument, VerificationItem
from app.modules.workers.models import Worker

__all__ = [
    "Agency",
    "AgencyMember",
    "AuditLog",
    "DocumentAccess",
    "OneTimeToken",
    "RefreshToken",
    "Subscription",
    "User",
    "VerificationDocument",
    "VerificationItem",
    "Worker",
]
