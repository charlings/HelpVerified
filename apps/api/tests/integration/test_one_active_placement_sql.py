"""Rule 2 in the database: a worker can't be in two active placements (pending_payment, trial, confirmed).
Straight SQL, around every service: the partial unique index is the backstop."""

import pytest
from sqlalchemy.exc import IntegrityError

from tests.factories import (
    create_agency,
    create_family,
    create_proposal,
    create_request,
    insert_placement,
    listed_worker,
)

pytestmark = pytest.mark.usefixtures("clean_state")

ACTIVE = ["pending_payment", "trial", "confirmed"]


def two_proposals_for_one_worker() -> tuple[object, object]:
    worker = listed_worker(create_agency())
    first = create_proposal(create_request(create_family()), worker)
    second = create_proposal(create_request(create_family()), worker)
    return first, second


@pytest.mark.parametrize("first_status", ACTIVE)
@pytest.mark.parametrize("second_status", ACTIVE)
def test_second_active_placement_for_a_worker_is_refused(first_status: str, second_status: str) -> None:
    first, second = two_proposals_for_one_worker()
    insert_placement(first, first_status)  # type: ignore[arg-type]

    with pytest.raises(IntegrityError) as raised:
        insert_placement(second, second_status)  # type: ignore[arg-type]

    assert "placements_one_active_per_worker" in str(raised.value)


@pytest.mark.parametrize("finished", ["ended", "cancelled"])
def test_finished_placements_dont_block_the_worker(finished: str) -> None:
    first, second = two_proposals_for_one_worker()
    insert_placement(first, finished)  # type: ignore[arg-type]

    insert_placement(second, "trial")  # type: ignore[arg-type]


def test_a_request_cant_be_filled_twice() -> None:
    agency = create_agency()
    request = create_request(create_family())
    first = create_proposal(request, listed_worker(agency))
    second = create_proposal(request, listed_worker(agency))
    insert_placement(first, "trial")

    with pytest.raises(IntegrityError) as raised:
        insert_placement(second, "pending_payment")

    assert "placements_one_active_per_request" in str(raised.value)
