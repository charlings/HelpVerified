"""The API's error codes and statuses match the frozen contract the web app was built against (ADR 0009).

The web mock's `statusForCode` table is the copy of api-contracts.md §2 that the frontend
was signed off against, so the API must match it exactly.
"""

import re
from pathlib import Path

from app.core.errors import error_statuses

WEB_ERRORS = Path(__file__).parents[4] / "apps" / "web" / "src" / "mocks" / "errors.ts"


def web_statuses() -> dict[str, int]:
    source = WEB_ERRORS.read_text(encoding="utf-8")
    table = source.split("statusForCode", 1)[1].split("};", 1)[0]
    return {code: int(status) for code, status in re.findall(r"([A-Z_]+):\s*(\d{3})", table)}


def test_error_codes_match_the_web_contract() -> None:
    web = web_statuses()

    assert len(web) > 20  # the parser found the table
    assert error_statuses() == web
