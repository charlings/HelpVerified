"""The placement state machine matches the web's copy and the table in database.md §6 (spec item 11)."""

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.modules.placements.models import PlacementStatus as S
from app.modules.placements.state_machine import TRANSITIONS, allowed_actions, can_transition

WEB = Path(__file__).parents[4] / "apps/web/src/features/placements/state-machine.ts"
NOW = datetime(2026, 10, 7, 12, tzinfo=UTC)
WINDOW = 30


def web_transitions() -> dict[str, tuple[str, ...]]:
    block = WEB.read_text(encoding="utf-8").split("transitions:", 1)[1].split("};", 1)[0]
    return {
        state: tuple(re.findall(r'"(\w+)"', targets))
        for state, targets in re.findall(r"(\w+): \[([^\]]*)\]", block)
    }


def test_transitions_match_the_web_state_machine() -> None:
    assert web_transitions() == {
        s.value: tuple(t.value for t in targets) for s, targets in TRANSITIONS.items()
    }


@pytest.mark.parametrize("from_status", list(S))
@pytest.mark.parametrize("to_status", list(S))
def test_only_listed_transitions_are_allowed(from_status: S, to_status: S) -> None:
    allowed = {
        (S.pending_payment, S.trial),
        (S.pending_payment, S.cancelled),
        (S.trial, S.confirmed),
        (S.trial, S.ended),
        (S.confirmed, S.ended),
    }

    assert can_transition(from_status, to_status) == ((from_status, to_status) in allowed)


IN_WINDOW = NOW - timedelta(days=WINDOW)  # confirmed exactly 30 days ago: still in the window
OUT_OF_WINDOW = NOW - timedelta(days=WINDOW, seconds=1)

EXPECTED = [
    # role, status, confirmed_at, actions
    ("family", S.pending_payment, None, ["pay", "cancel"]),
    ("family", S.trial, None, ["confirm", "request_replacement", "end"]),
    ("family", S.confirmed, IN_WINDOW, ["request_replacement", "end"]),
    ("family", S.confirmed, OUT_OF_WINDOW, ["end"]),
    ("family", S.ended, None, []),
    ("family", S.cancelled, None, []),
    *[
        (role, status, IN_WINDOW, expected)
        for role in ("agency_admin", "super_admin")
        for status, expected in [
            (S.pending_payment, []),
            (S.trial, ["end"]),
            (S.confirmed, ["end"]),
            (S.ended, []),
            (S.cancelled, []),
        ]
    ],
]


@pytest.mark.parametrize(("role", "status", "confirmed_at", "expected"), EXPECTED)
def test_allowed_actions_for_every_state_and_role(
    role: str, status: S, confirmed_at: datetime | None, expected: list[str]
) -> None:
    assert allowed_actions(role, status, confirmed_at, WINDOW, NOW) == expected  # type: ignore[arg-type]
