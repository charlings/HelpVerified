"""List responses (api-contracts.md §1): `?page=1&page_size=20` (max 100) gives
`{items, page, page_size, total}`."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Query
from pydantic import BaseModel


@dataclass(frozen=True)
class PageParams:
    page: int = 1
    page_size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(
    page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 20
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


class Page[T](BaseModel):
    items: list[T]
    page: int
    page_size: int
    total: int
