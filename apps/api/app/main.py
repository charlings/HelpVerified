"""App factory: middleware, routers, exception handlers, and the resources on `app.state`.

`fastapi dev app/main.py` serves the module-level `app`; tests call `create_app()`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from redis.asyncio import Redis

from app.core.config import Settings, get_settings
from app.core.error_handlers import register_error_handlers
from app.core.idempotency import IdempotencyStore
from app.core.logging import configure_logging
from app.core.middleware import BodySizeLimitMiddleware, RequestContextMiddleware
from app.core.rate_limit import RateLimiter
from app.db.session import create_engine, create_sessionmaker
from app.integrations.cloudinary import Cloudinary, CloudinaryClient
from app.integrations.email import EmailSender, email_sender_from
from app.integrations.firestore import NotificationMirror, mirror_from
from app.integrations.google import GoogleOAuth, google_from
from app.integrations.paystack import PaystackApi, PaystackClient
from app.jobs.registry import JobContext
from app.jobs.scheduler import JobRunner, start_scheduler
from app.modules.admin.router import router as admin_router
from app.modules.agencies.router import router as agencies_router
from app.modules.auth.google import GoogleFlows
from app.modules.auth.router import router as auth_router
from app.modules.contact.router import router as contact_router
from app.modules.families.router import router as families_router
from app.modules.notifications.dispatcher import NotificationDispatcher
from app.modules.notifications.router import router as notifications_router
from app.modules.payments.router import router as payments_router
from app.modules.placements.router import router as placements_router
from app.modules.requests.router import router as requests_router
from app.modules.users.router import router as users_router
from app.modules.verification.router import router as verification_router
from app.modules.workers.router import router as workers_router

API_PREFIX = "/api/v1"


class Health(BaseModel):
    status: str


def create_app(
    settings: Settings | None = None,
    email_sender: EmailSender | None = None,
    cloudinary: Cloudinary | None = None,
    paystack: PaystackApi | None = None,
    mirror: NotificationMirror | None = None,
    google: GoogleOAuth | None = None,
    *,
    deliver_immediately: bool = True,
) -> FastAPI:
    """Integrations default to the real clients settings describe; tests pass fakes. With
    `deliver_immediately=False` notifications wait for an explicit `app.state.notifications.drain()`.
    Google sign-in is off (even with a fake passed) unless the Google settings are set."""
    settings = settings or get_settings()
    configure_logging(settings.LOG_LEVEL)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.database_url)
        redis = Redis.from_url(str(settings.REDIS_URL))
        app.state.sessionmaker = create_sessionmaker(engine)
        app.state.rate_limiter = RateLimiter(redis)
        app.state.idempotency = IdempotencyStore(redis, timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS))
        app.state.google = (google or google_from(settings)) if settings.google_enabled else None
        app.state.google_flows = GoogleFlows(
            redis,
            timedelta(minutes=settings.GOOGLE_FLOW_TTL_MIN),
            timedelta(minutes=settings.GOOGLE_PENDING_TTL_MIN),
        )
        app.state.paystack = paystack or PaystackClient(settings.PAYSTACK_SECRET_KEY.get_secret_value())
        app.state.email_sender = email_sender or email_sender_from(settings)
        app.state.cloudinary = cloudinary or CloudinaryClient(
            settings.CLOUDINARY_CLOUD_NAME,
            settings.CLOUDINARY_API_KEY,
            settings.CLOUDINARY_API_SECRET.get_secret_value(),
        )
        app.state.notifications = NotificationDispatcher(
            app.state.sessionmaker,
            settings,
            app.state.email_sender,
            mirror or mirror_from(settings),
            immediate=deliver_immediately,
        )
        scheduler = None
        if settings.JOBS_ENABLED:
            context = JobContext(
                app.state.sessionmaker,
                settings,
                app.state.paystack,
                app.state.cloudinary,
                app.state.notifications,
            )
            scheduler = start_scheduler(JobRunner(context, redis))
        try:
            yield
        finally:
            if scheduler is not None:
                scheduler.shutdown(wait=False)
            await app.state.notifications.close()
            await redis.aclose()
            await engine.dispose()

    app = FastAPI(
        title="HelpVerified API",
        version="0.3.0",
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

    for router in (
        auth_router,
        users_router,
        agencies_router,
        workers_router,
        verification_router,
        requests_router,
        placements_router,
        families_router,
        payments_router,
        notifications_router,
        admin_router,
        contact_router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
