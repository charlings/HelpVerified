"""Turns every error into `{ "error": { code, message, details, request_id } }` (api-contracts.md §2)."""

from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import (
    BadRequest,
    DomainError,
    Forbidden,
    InternalError,
    NotFound,
    RateLimited,
    Unauthenticated,
    ValidationFailed,
)
from app.core.logging import get_logger

log = get_logger("app.errors")

# Framework HTTP errors (unknown route, wrong method, ...) mapped onto contract codes.
_HTTP_STATUS_ERRORS: dict[int, type[DomainError]] = {
    401: Unauthenticated,
    403: Forbidden,
    404: NotFound,
    429: RateLimited,
}


def request_id_of(request: Request) -> str:
    return str(getattr(request.state, "request_id", ""))


def envelope_response(
    error: DomainError,
    request_id: str,
    status: int | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = {
        "error": {
            "code": error.code,
            "message": error.message,
            "details": jsonable_encoder(error.details),
            "request_id": request_id,
        }
    }
    return JSONResponse(body, status_code=status or error.status, headers=headers)


async def _domain_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)  # noqa: S101  # registered for DomainError only
    return envelope_response(exc, request_id_of(request))


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    if exc.status_code >= 500:
        error: DomainError = InternalError()
    else:
        error = _HTTP_STATUS_ERRORS.get(exc.status_code, BadRequest)()
    return envelope_response(error, request_id_of(request), status=exc.status_code, headers=exc.headers)


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    fields: dict[str, list[str]] = {}
    for item in exc.errors():
        loc: tuple[Any, ...] = tuple(item.get("loc", ()))
        path = loc[1:] if loc and loc[0] in {"body", "query", "path", "header", "cookie"} else loc
        name = ".".join(str(part) for part in path) or str(loc[0] if loc else "body")
        fields.setdefault(name, []).append(str(item.get("msg", "Invalid value.")))
    return envelope_response(ValidationFailed(details={"fields": fields}), request_id_of(request))


async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    # Runs outside RequestContextMiddleware, so the request ID header is added here.
    request_id = request_id_of(request)
    log.exception("unhandled_error", request_id=request_id, route=request.url.path)
    return envelope_response(InternalError(), request_id, headers={"X-Request-ID": request_id})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, _domain_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled_error)
