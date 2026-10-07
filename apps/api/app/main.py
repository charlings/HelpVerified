"""App factory: middleware, routers, exception handlers.

`fastapi dev app/main.py` serves the module-level `app`; tests call `create_app()`.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.core.error_handlers import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import BodySizeLimitMiddleware, RequestContextMiddleware


class Health(BaseModel):
    status: str


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    app = FastAPI(
        title="HelpVerified API",
        version="0.1.0",
        description="Families hire agency-verified nannies, drivers and cleaners.",
    )
    register_error_handlers(app)

    # Added last runs first: request context wraps CORS, which wraps the body limit.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.MAX_BODY_BYTES)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )
    app.add_middleware(RequestContextMiddleware)

    @app.get("/health", tags=["health"])
    async def health() -> Health:
        """Liveness: the process is up. Does not touch the database."""
        return Health(status="ok")

    # Module routers are mounted under /api/v1 from B2 onwards.
    return app


app = create_app()
