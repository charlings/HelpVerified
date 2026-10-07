"""Family payloads (api-contracts.md "Added during Phase 1")."""

import uuid

from pydantic import BaseModel

from app.modules.placements.schemas import PlacementSummary
from app.modules.requests.schemas import FamilyRequestOut


class FamilyProfile(BaseModel):
    id: uuid.UUID
    name: str
    state: str | None
    lga: str | None


class FamilyDashboard(BaseModel):
    active_placements: list[PlacementSummary]
    open_requests: list[FamilyRequestOut]
