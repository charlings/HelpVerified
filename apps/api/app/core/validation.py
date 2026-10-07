"""Field rules shared by schemas, matching the web forms (apps/web/src/features/*/schemas.ts)."""

import re
from typing import Annotated

from pydantic import AfterValidator, StringConstraints
from pydantic_core import PydanticCustomError

# apps/web/src/content/locations.ts (tests/unit/test_validation.py keeps them identical)
NIGERIAN_STATES: tuple[str, ...] = (
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River",
    "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Federal Capital Territory", "Gombe", "Imo", "Jigawa",
    "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
    "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
)  # fmt: skip

_NIGERIAN_PHONE = re.compile(r"^(\+234|0)[789][01]\d{8}$")


def _nigerian_phone(value: str) -> str:
    compact = re.sub(r"[\s()-]", "", value)
    if not _NIGERIAN_PHONE.match(compact):
        raise PydanticCustomError("phone", "Enter a Nigerian phone number, like 0803 123 4567.")
    return compact


def _nigerian_state(value: str) -> str:
    if value not in NIGERIAN_STATES:
        raise PydanticCustomError("state", "Choose a state.")
    return value


def _reason(value: str) -> str:
    if len(value) < 5:
        raise PydanticCustomError(
            "reason", "Give a reason of at least 5 characters. The other side will see it."
        )
    return value


Phone = Annotated[str, AfterValidator(_nigerian_phone)]
NigerianState = Annotated[str, AfterValidator(_nigerian_state)]
Lga = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000), AfterValidator(_reason)]
