"""Small pure pieces of B3: signing, month arithmetic, SQL splitting, and copies kept in step."""

import importlib.util
import re
from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.core.dates import add_months
from app.core.security import hash_nin
from app.core.validation import NIGERIAN_STATES
from app.db.sql_script import split_sql
from app.integrations.cloudinary import Asset, CloudinaryClient, sign

ROOT = Path(__file__).parents[4]
API = Path(__file__).parents[2]


def test_cloudinary_signature_matches_the_documented_example() -> None:
    """The worked example in Cloudinary's "Generating authentication signatures" guide."""
    params: dict[str, str | int] = {
        "eager": "w_400,h_300,c_pad|w_260,h_200,c_crop",
        "public_id": "sample_image",
        "timestamp": 1315060510,
    }

    assert sign(params, "abcd") == "bfd09f95f331f558cbd1320e67aa8d488770583e"


def test_upload_signature_is_restricted_to_its_folder_and_type() -> None:
    client = CloudinaryClient("demo", "key", "secret")

    signed = client.sign_upload("workers/docs/w1/id", "authenticated", 1_700_000_000)

    assert signed.upload_url == "https://api.cloudinary.com/v1_1/demo/auto/upload"
    assert signed.signature == sign(
        {"folder": "workers/docs/w1/id", "timestamp": 1_700_000_000, "type": "authenticated"}, "secret"
    )


def test_private_download_url_expires_and_never_contains_the_secret() -> None:
    client = CloudinaryClient("demo", "key", "s3cret-value")
    asset = Asset("workers/docs/w1/id/abc", "authenticated", "image", "pdf", 1000)

    url = client.private_download_url(asset, datetime(2026, 10, 7, 12, 5, tzinfo=UTC), 1_791_374_400)

    assert url.startswith("https://api.cloudinary.com/v1_1/demo/image/download?")
    assert "expires_at=1791374700" in url
    assert "type=authenticated" in url
    assert "s3cret-value" not in url


def test_nin_hash_is_keyed() -> None:
    assert hash_nin("12345678901", "pepper-one" * 4) != hash_nin("12345678901", "pepper-two" * 4)
    assert "12345678901" not in hash_nin("12345678901", "pepper-one" * 4)


@pytest.mark.parametrize(
    ("start", "months", "expected"),
    [
        (datetime(2026, 10, 7, tzinfo=UTC), 12, datetime(2027, 10, 7, tzinfo=UTC)),
        (datetime(2027, 1, 31, tzinfo=UTC), 1, datetime(2027, 2, 28, tzinfo=UTC)),
        (datetime(2028, 1, 31, tzinfo=UTC), 1, datetime(2028, 2, 29, tzinfo=UTC)),
        (datetime(2026, 12, 15, tzinfo=UTC), 2, datetime(2027, 2, 15, tzinfo=UTC)),
    ],
)
def test_add_months(start: datetime, months: int, expected: datetime) -> None:
    assert add_months(start, months) == expected


def test_split_sql_keeps_function_bodies_whole() -> None:
    script = """
    -- comment
    CREATE TABLE t (id int);
    CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RETURN NEW;
    END $$;
    DROP TABLE t;
    """

    statements = split_sql(script)

    assert len(statements) == 3
    assert "RETURN NEW;" in statements[1]


def test_readable_sql_copy_matches_migration_0003() -> None:
    path = API / "app/db/migrations/versions/20261007_0003_agencies_workers.py"
    spec = importlib.util.spec_from_file_location("migration_0003", path)
    assert spec is not None
    assert spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    copy = (API / "app/db/sql/0003_agencies_workers.sql").read_text(encoding="utf-8")

    assert split_sql(migration.UPGRADE_SQL) == split_sql(copy)


def test_states_match_the_web_list() -> None:
    web = (ROOT / "apps/web/src/content/locations.ts").read_text(encoding="utf-8")

    assert tuple(re.findall(r'^\s+"([^"]+)",$', web, re.MULTILINE)) == NIGERIAN_STATES
