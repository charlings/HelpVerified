"""Direct-SQL factories for agencies and workers (bypassing services on purpose, for setup and for
proving the database rules). Values go in as bound parameters."""

import uuid

from app.core.security import hash_nin
from app.modules.verification.models import KINDS
from tests.conftest import TEST_ENV, run_sql
from tests.helpers import create_user

NIN_PEPPER = TEST_ENV["NIN_PEPPER"]
_nin_counter = iter(range(10_000_000_000, 99_999_999_999))


def next_nin() -> str:
    return str(next(_nin_counter))


def create_agency(
    *,
    admin_email: str | None = None,
    status: str = "approved",
    subscribed: bool = True,
    name: str = "Sunrise Domestic Staffing",
    state: str = "Lagos",
    roles: tuple[str, ...] = ("nanny", "driver", "cleaner"),
) -> uuid.UUID:
    """An agency, approved and subscribed by default, plus an agency_admin if `admin_email` is given."""
    agency_id = uuid.uuid4()
    run_sql(
        "INSERT INTO agencies (id, name, cac_number, email, phone, address_line, state, lga, "
        "roles_offered, status) VALUES (:id, :name, :cac, 'office@agency.example', '08031234567', "
        "'12 Allen Avenue', :state, 'Ikeja', CAST(:roles AS worker_role[]), CAST(:status AS agency_status))",
        id=agency_id,
        name=name,
        cac=f"RC {uuid.uuid4().int % 10_000_000:07d}",
        state=state,
        roles=list(roles),
        status=status,
    )
    if subscribed:
        run_sql(
            "INSERT INTO subscriptions (agency_id, plan_code, status, current_period_end) "
            "VALUES (:id, 'PLN_test', 'active', now() + interval '30 days')",
            id=agency_id,
        )
    if admin_email:
        user_id = create_user(admin_email, role="agency_admin")
        run_sql("INSERT INTO agency_members (user_id, agency_id) VALUES (:u, :a)", u=user_id, a=agency_id)
    return agency_id


def create_worker(
    agency_id: uuid.UUID,
    *,
    full_name: str = "Amaka Obi",
    role: str = "nanny",
    listing_status: str = "draft",
    nin: str | None = None,
) -> uuid.UUID:
    """A worker with its four checks `not_started` (as the service creates them)."""
    worker_id = uuid.uuid4()
    nin = nin or next_nin()
    run_sql(
        "INSERT INTO workers (id, agency_id, full_name, role, years_experience, languages, state, lga, "
        "nin_hash, nin_last4, consent_at, listing_status) VALUES (:id, :agency, :name, "
        "CAST(:role AS worker_role), 5, ARRAY['English'], 'Lagos', 'Ikeja', :hash, :last4, now(), "
        "CAST(:listing AS listing_status))",
        id=worker_id,
        agency=agency_id,
        name=full_name,
        role=role,
        hash=hash_nin(nin, NIN_PEPPER),
        last4=nin[-4:],
        listing=listing_status,
    )
    for kind in KINDS:
        run_sql(
            "INSERT INTO verification_items (worker_id, kind) VALUES (:w, CAST(:k AS verification_kind))",
            w=worker_id,
            k=kind.value,
        )
    return worker_id


def set_items(
    worker_id: uuid.UUID, status: str, *, except_kind: str | None = None, other_status: str = "submitted"
) -> None:
    """Sets every check to `status` (and `except_kind`, if given, to `other_status`), with the fields the
    table's constraints need. Verified checks get a verifier and timestamp."""
    [(verifier,)] = run_sql("SELECT id FROM users ORDER BY created_at LIMIT 1") or [(None,)]
    if verifier is None:
        verifier = create_user(f"verifier-{uuid.uuid4().hex[:6]}@example.com", role="agency_admin")
    for kind in KINDS:
        value = other_status if kind.value == except_kind else status
        run_sql(
            "UPDATE verification_items SET status = CAST(:s AS verification_status), "
            "verified_by = CASE WHEN :s = 'verified' THEN CAST(:v AS uuid) END, "
            "verified_at = CASE WHEN :s = 'verified' THEN now() END, "
            "rejection_reason = CASE WHEN :s = 'rejected' THEN 'Not acceptable' END "
            "WHERE worker_id = :w AND kind = CAST(:k AS verification_kind)",
            s=value,
            v=verifier,
            w=worker_id,
            k=kind.value,
        )
