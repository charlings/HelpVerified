"""Domain errors (api-contracts.md §2).

Services raise these; `core/error_handlers.py` turns them into the error envelope.
No HTTP framework imports here, so services stay free of HTTP concepts.
`status` is the HTTP status the contract assigns to the code.
"""

from typing import Any, ClassVar


class DomainError(Exception):
    code: ClassVar[str] = "BAD_REQUEST"
    status: ClassVar[int] = 400
    default_message: ClassVar[str] = "The request could not be processed."

    def __init__(self, message: str | None = None, details: dict[str, Any] | None = None) -> None:
        self.message = message or self.default_message
        self.details: dict[str, Any] = details or {}
        super().__init__(self.message)


class BadRequest(DomainError):
    code, status = "BAD_REQUEST", 400


class Unauthenticated(DomainError):
    code, status, default_message = "UNAUTHENTICATED", 401, "Please sign in."


class InvalidCredentials(DomainError):
    code, status, default_message = "INVALID_CREDENTIALS", 401, "Email or password is incorrect."


class Forbidden(DomainError):
    code, status, default_message = "FORBIDDEN", 403, "You don't have permission to do that."


class EmailNotVerified(Forbidden):
    code, default_message = "EMAIL_NOT_VERIFIED", "Verify your email address first."


class AccountSuspended(Forbidden):
    code, default_message = "ACCOUNT_SUSPENDED", "This account is suspended."


class AgencyNotActive(Forbidden):
    code, default_message = "AGENCY_NOT_ACTIVE", "The agency must be approved and subscribed."


class NotFound(DomainError):
    code, status, default_message = "NOT_FOUND", 404, "Not found."


class Conflict(DomainError):
    status = 409


class WorkerNotVerified(Conflict):
    code, default_message = "WORKER_NOT_VERIFIED", "All four verification checks must be verified."


class WorkerUnavailable(Conflict):
    code, default_message = "WORKER_UNAVAILABLE", "This worker has just been placed with another family."


class WorkerNotListed(Conflict):
    code, default_message = "WORKER_NOT_LISTED", "This worker is not listed."


class DuplicateWorker(Conflict):
    code, default_message = "DUPLICATE_WORKER", "A worker with this NIN already exists."


class IllegalTransition(Conflict):
    code, default_message = "ILLEGAL_TRANSITION", "That action is not allowed in the current state."


class RequestNotOpen(Conflict):
    code, default_message = "REQUEST_NOT_OPEN", "This request is no longer open."


class ReplacementWindowClosed(Conflict):
    code, default_message = "REPLACEMENT_WINDOW_CLOSED", "The replacement window has closed."


class EvidenceRequired(Conflict):
    code, default_message = "EVIDENCE_REQUIRED", "Upload a document before verifying this check."


class EmailTaken(Conflict):
    code, default_message = "EMAIL_TAKEN", "An account with this email already exists."


class AgencyExists(Conflict):
    code, default_message = "AGENCY_EXISTS", "This account already has an agency."


class AlreadyProposed(Conflict):
    code, default_message = "ALREADY_PROPOSED", "This worker is already proposed for this request."


class TokenExpired(DomainError):
    code, status, default_message = "TOKEN_EXPIRED", 410, "This link has expired or has already been used."


class ValidationFailed(DomainError):
    code, status, default_message = "VALIDATION_ERROR", 422, "Some fields are invalid."


class RateLimited(DomainError):
    code, status, default_message = "RATE_LIMITED", 429, "Too many requests."

    def __init__(self, retry_after_seconds: int = 60, message: str | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = max(1, retry_after_seconds)


class PaymentProviderError(DomainError):
    code, status, default_message = (
        "PAYMENT_PROVIDER_ERROR",
        502,
        "The payment provider could not be reached.",
    )


class InternalError(DomainError):
    code, status, default_message = "INTERNAL_ERROR", 500, "Something went wrong."


def error_statuses() -> dict[str, int]:
    """Every contract code with its HTTP status, collected from the classes above."""
    statuses: dict[str, int] = {}
    pending: list[type[DomainError]] = [DomainError]
    while pending:
        cls = pending.pop()
        if "code" in vars(cls):  # skip grouping classes such as Conflict
            statuses[cls.code] = cls.status
        pending.extend(cls.__subclasses__())
    return statuses
