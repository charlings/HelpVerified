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


class HoldExpired(Conflict):
    """The placement's hold ended unpaid; the family must accept again (ADR 0017, OD2)."""

    code, default_message = (
        "HOLD_EXPIRED",
        "The hold on this worker has expired. Accept again to place a new hold.",
    )


class CheckoutInProgress(Conflict):
    """Another request is preparing this placement's checkout (ADR 0017, X3). Not a provider failure."""

    code, default_message = (
        "CHECKOUT_IN_PROGRESS",
        "A checkout for this placement is already being prepared. Try again in a moment.",
    )


class CheckoutAttemptsExhausted(Conflict):
    """The hold has used its payment attempts (ADR 0017, X2; the cap is a proposed default)."""

    code, default_message = (
        "CHECKOUT_ATTEMPTS_EXHAUSTED",
        "This hold has reached its limit of payment attempts. Cancel it or let it lapse, then accept again.",
    )


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
    """A Paystack failure. Raise one of the two subclasses so the client can tell them apart through
    `details.reason`; both keep the contract's code and status (api-contracts.md §2)."""

    code, status, default_message = (
        "PAYMENT_PROVIDER_ERROR",
        502,
        "The payment provider couldn't process this request.",
    )
    reason: ClassVar[str | None] = None

    def __init__(self, message: str | None = None, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, ({"reason": self.reason} if self.reason else {}) | (details or {}))


class PaymentProviderUnavailable(PaymentProviderError):
    """Paystack couldn't be reached, timed out or failed on its side: retrying later may work."""

    default_message = "The payment provider could not be reached. Please try again shortly."
    reason = "unavailable"


class PaymentProviderRejected(PaymentProviderError):
    """Paystack answered and refused the request: retrying the same request won't help.

    `provider_code` is Paystack's machine-readable `code` (for example `duplicate_reference`,
    `transaction_not_found`, `transaction_reversed`); services branch on it (ADR 0017, OD9 item 1). It is
    never put in `details`, so it never reaches a client."""

    default_message = "The payment provider declined this payment request."
    reason = "rejected"

    def __init__(
        self,
        message: str | None = None,
        details: dict[str, Any] | None = None,
        provider_code: str | None = None,
    ) -> None:
        super().__init__(message, details)
        self.provider_code = provider_code


class TransactionNotFound(PaymentProviderRejected):
    """Paystack has no transaction for the reference: documented as HTTP 404 (D10), observed in test mode as
    HTTP 400 `transaction_not_found` (O4). Never proof that one won't exist later."""


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
