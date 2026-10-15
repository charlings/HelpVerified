"""`POST /contact` (api-contracts.md "Added during Phase 1"; web: features/marketing/contact/schemas.ts)."""

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, StringConstraints
from pydantic_core import PydanticCustomError

# apps/web/src/content/contact.ts: contactTopics
ContactTopic = Literal["family", "agency", "partnership", "press", "other"]

_PHONE = re.compile(r"^\+?[0-9 ()-]{7,20}$")


def _phone(value: str | None) -> str | None:
    if not value:
        return None
    if not _PHONE.match(value):
        raise PydanticCustomError("phone", "Enter a valid phone number, or leave it blank.")
    return value


def _message(value: str) -> str:
    if len(value) < 20:
        raise PydanticCustomError("message", "Tell us a little more (at least 20 characters).")
    return value


class ContactIn(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Ada Okafor",
                    "email": "ada@example.com",
                    "phone": "0803 123 4567",
                    "topic": "family",
                    "message": "We're looking for a live-in nanny in Lekki from next month.",
                }
            ]
        }
    )

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
    email: EmailStr
    phone: Annotated[
        str | None, StringConstraints(strip_whitespace=True, max_length=20), AfterValidator(_phone)
    ] = None
    topic: ContactTopic
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=2000), AfterValidator(_message)
    ]


class ContactReceipt(BaseModel):
    received: Literal[True] = True
