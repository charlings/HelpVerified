"""App factory: middleware, routers, exception handlers, and the resources on `app.state`.

`fastapi dev app/main.py` serves the module-level `app`; tests call `create_app()`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from redis.asyncio import Redis

from app.core.config import Settings, get_settings
from app.core.error_handlers import register_error_handlers
from app.core.logging import configure_logging
from app.core.middleware import BodySizeLimitMiddleware, RequestContextMiddleware
from app.core.rate_limit import RateLimiter
from app.db.session import create_engine, create_sessionmaker
from app.integrations.email import EmailSender, OutboxEmailSender
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router

API_PREFIX = "/api/v1"


class Health(BaseModel):
    status: str


def create_app(settings: Settings | None = None, email_sender: EmailSender | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.database_url)
        redis = Redis.from_url(str(settings.REDIS_URL))
        app.state.sessionmaker = create_sessionmaker(engine)
        app.state.rate_limiter = RateLimiter(redis)
        app.state.email_sender = email_sender or OutboxEmailSender(
            settings.EMAIL_OUTBOX_DIR, settings.EMAIL_FROM
        )
        try:
            yield
        finally:
            await redis.aclose()
            await engine.dispose()

    app = FastAPI(
        title="HelpVerified API",
        version="0.2.0",
        description="Families hire agency-verified nannies, drivers and cleaners.",
        lifespan=lifespan,
    )
    app.state.settings = settings
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

    app.include_router(auth_router, prefix=API_PREFIX)
    app.include_router(users_router, prefix=API_PREFIX)
    return app


app = create_app()
