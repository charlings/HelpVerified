"""Imports every ORM model so `Base.metadata` is complete (Alembic, the schema-drift test).

Add each new module's models here.
"""

from app.modules.auth.models import OneTimeToken, RefreshToken
from app.modules.users.models import User

__all__ = ["OneTimeToken", "RefreshToken", "User"]
