"""Rule 1 in the database: a worker can't be listed unless all four checks are verified and unexpired.

These go straight to SQL, around every service, so they prove the trigger is the backstop
(the "direct-SQL path" of test_cannot_list_with_pending_item, spec acceptance item 7).
"""

import uuid

import pytest
from sqlalchemy.exc import DBAPIError

from app.modules.verification.models import KINDS
from tests.conftest import run_sql
from tests.factories import create_agency, create_worker, set_items

pytestmark = pytest.mark.usefixtures("clean_state")


def listing_status(worker_id: uuid.UUID) -> str:
    [(status,)] = run_sql("SELECT listing_status::text FROM workers WHERE id = :id", id=worker_id)
    return str(status)


def force_list(worker_id: uuid.UUID) -> None:
    run_sql("UPDATE workers SET listing_status = 'listed' WHERE id = :id", id=worker_id)


def assert_gate_refuses(worker_id: uuid.UUID) -> None:
    with pytest.raises(DBAPIError) as raised:
        force_list(worker_id)
    assert "WORKER_NOT_VERIFIED" in str(raised.value.orig.__cause__.hint)  # type: ignore[union-attr]
    assert listing_status(worker_id) != "listed"


@pytest.mark.parametrize("pending", KINDS)
def test_cannot_list_with_pending_item(pending: str) -> None:
    worker = create_worker(create_agency())
    set_items(worker, "verified", except_kind=pending, other_status="submitted")

    assert_gate_refuses(worker)


@pytest.mark.parametrize("status", ["not_started", "submitted", "rejected", "expired"])
def test_any_unverified_status_blocks_listing(status: str) -> None:
    worker = create_worker(create_agency())
    set_items(worker, "verified", except_kind="references", other_status=status)

    assert_gate_refuses(worker)


def test_verified_but_lapsed_item_blocks_listing() -> None:
    """Even before the expiry job marks it `expired`, a past expires_at counts as unverified."""
    worker = create_worker(create_agency())
    set_items(worker, "verified")
    run_sql(
        "UPDATE verification_items SET expires_at = now() - interval '1 second' "
        "WHERE worker_id = :id AND kind = 'address'",
        id=worker,
    )

    assert_gate_refuses(worker)


def test_insert_as_listed_is_refused() -> None:
    agency = create_agency()
    with pytest.raises(DBAPIError):
        create_worker(agency, listing_status="listed")


def test_four_verified_checks_list_and_stamp_listed_at() -> None:
    worker = create_worker(create_agency())
    set_items(worker, "verified")

    force_list(worker)

    [(status, listed_at)] = run_sql(
        "SELECT listing_status::text, listed_at FROM workers WHERE id = :id", id=worker
    )
    assert status == "listed"
    assert listed_at is not None


@pytest.mark.parametrize("new_status", ["submitted", "rejected", "expired"])
def test_check_leaving_verified_delists_the_worker(new_status: str) -> None:
    worker = create_worker(create_agency())
    set_items(worker, "verified")
    force_list(worker)

    run_sql(
        "UPDATE verification_items SET status = CAST(:s AS verification_status), "
        "rejection_reason = 'Reference could not be reached' WHERE worker_id = :id AND kind = 'references'",
        s=new_status,
        id=worker,
    )

    [(status, listed_at)] = run_sql(
        "SELECT listing_status::text, listed_at FROM workers WHERE id = :id", id=worker
    )
    assert status == "delisted"
    assert listed_at is None


def test_delisting_trigger_leaves_unlisted_workers_alone() -> None:
    worker = create_worker(create_agency())
    set_items(worker, "verified")  # verified but still a draft

    run_sql(
        "UPDATE verification_items SET status = 'submitted' WHERE worker_id = :id AND kind = 'id'", id=worker
    )

    assert listing_status(worker) == "draft"
