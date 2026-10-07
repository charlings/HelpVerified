"""Structured JSON logs (backend.md §6).

Every line carries the request's `request_id`, bound by `RequestContextMiddleware`.
Never log passwords, tokens, NINs, document URLs, card data or webhook payloads.
"""

import logging
import sys

import structlog


def configure_logging(level: str) -> None:
    shared: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    # Tracebacks without frame locals: locals hold request headers (bearer tokens), cookies and bodies.
    tracebacks = structlog.processors.ExceptionRenderer(
        structlog.tracebacks.ExceptionDictTransformer(show_locals=False)
    )
    structlog.configure(
        processors=[
            *shared,
            tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelNamesMapping()[level]),
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    logger: structlog.stdlib.BoundLogger = structlog.get_logger(name)
    return logger
