"""The one place that reads the current time, so tests can freeze it (time-machine)."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)
