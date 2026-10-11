"""Live check of the Firestore mirror (B6): writes one test notification, then marks it read.

Uses NOTIFICATIONS_MIRROR=firestore, FIREBASE_PROJECT_ID and FIREBASE_CREDENTIALS_FILE from apps/api/.env.

    cd apps/api
    uv run python -m scripts.firestore_live_check

Then open the Firebase console → Firestore → notifications → 00000000-0000-4000-8000-00000000c4ec → items
to see the document. Delete it there afterwards.
"""

import asyncio
import sys
import uuid

from app.core.clock import utcnow
from app.core.config import load_settings
from app.integrations.firestore import MirroredNotification, MirrorError, mirror_from

LIVE_CHECK_USER = uuid.UUID("00000000-0000-4000-8000-00000000c4ec")


async def main() -> int:
    settings = load_settings()
    mirror = mirror_from(settings)
    if mirror is None:
        print("Set NOTIFICATIONS_MIRROR=firestore and the FIREBASE_* keys in apps/api/.env first.")
        return 1
    item = MirroredNotification(
        id=uuid.uuid4(),
        user_id=LIVE_CHECK_USER,
        kind="live_check",
        title="HelpVerified Firestore check",
        body="Written by scripts/firestore_live_check.py. Safe to delete.",
        link=None,
        created_at=utcnow(),
        read=False,
    )
    try:
        await mirror.write(item)
        print("1. write: ok")
        await mirror.write(MirroredNotification(**{**item.__dict__, "read": True}))
        print("2. update (read): ok")
    except MirrorError as exc:
        print("FAILED:", exc, "- check the project ID, that Firestore is created, and the key's role")
        return 1
    print(f"PASSED. Document: notifications/{LIVE_CHECK_USER}/items/{item.id}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
