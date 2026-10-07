"""Placement transitions and allowed actions (database.md §6).

Mirror of apps/web/src/features/placements/state-machine.ts: keep the two identical (CLAUDE.md).
tests/unit/test_state_machine.py checks the transition table against the TypeScript file and
`allowed_actions` for every pair of state and role. Screens render what this returns; they never re-derive it.
"""

from datetime import datetime, timedelta
from typing import Literal

from app.modules.placements.models import PlacementStatus as S

PlacementAction = Literal["pay", "cancel", "confirm", "request_replacement", "end"]
Role = Literal["super_admin", "agency_admin", "family"]

TRANSITIONS: dict[S, tuple[S, ...]] = {
    S.pending_payment: (S.trial, S.cancelled),
    S.trial: (S.confirmed, S.ended),
    S.confirmed: (S.ended,),
    S.ended: (),
    S.cancelled: (),
}


def can_transition(from_status: S, to_status: S) -> bool:
    return to_status in TRANSITIONS[from_status]


def in_replacement_window(status: S, confirmed_at: datetime | None, window_days: int, now: datetime) -> bool:
    """During the trial, or within `window_days` of confirming (inclusive)."""
    if status is S.trial:
        return True
    return (
        status is S.confirmed
        and confirmed_at is not None
        and now <= confirmed_at + timedelta(days=window_days)
    )


def allowed_actions(
    role: Role, status: S, confirmed_at: datetime | None, window_days: int, now: datetime
) -> list[PlacementAction]:
    if role == "family":
        if status is S.pending_payment:
            return ["pay", "cancel"]
        if status is S.trial:
            return ["confirm", "request_replacement", "end"]
        if status is S.confirmed:
            if in_replacement_window(status, confirmed_at, window_days, now):
                return ["request_replacement", "end"]
            return ["end"]
        return []
    return ["end"] if status in (S.trial, S.confirmed) else []
