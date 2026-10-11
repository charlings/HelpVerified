"""What each notification says (ADR 0015). One function per event; services pick the recipient.

Links are web app paths (apps/web/src/config/routes.ts; tests/unit/test_notification_messages.py checks
they exist there). Texts name only what the recipient can already see in the app: never NINs, documents,
tokens or card details.
"""

from dataclasses import dataclass
from datetime import date

from app.modules.agencies.models import AgencyStatus
from app.modules.verification.models import VerificationKind

FAMILY_REQUEST = "/family/requests/{id}"
FAMILY_PLACEMENT = "/family/placements/{id}"
FAMILY_PAYMENTS = "/family/payments"
AGENCY_HOME = "/agency"
AGENCY_WORKER = "/agency/workers/{id}"
AGENCY_PLACEMENT = "/agency/placements/{id}"
AGENCY_BILLING = "/agency/billing"

CHECK_LABELS = {
    VerificationKind.id: "ID",
    VerificationKind.guarantor: "guarantor",
    VerificationKind.references: "references",
    VerificationKind.address: "address",
}


@dataclass(frozen=True)
class Message:
    kind: str
    title: str
    body: str
    link: str | None
    email: bool = True  # also sent by email (the feed always gets it)


def naira(kobo: int) -> str:
    return f"₦{kobo // 100:,}"


def _day(value: date) -> str:
    return f"{value.day} {value:%B %Y}"  # "14 October 2026"


def _list(words: list[str]) -> str:
    return words[0] if len(words) == 1 else f"{', '.join(words[:-1])} and {words[-1]}"


# Requests and proposals


def proposal_received(request_id: object, agency_name: str, worker_name: str, role: str) -> Message:
    return Message(
        "proposal_received",
        "New proposal for your request",
        f"{agency_name} has proposed {worker_name} for your {role} request.",
        FAMILY_REQUEST.format(id=request_id),
    )


def proposal_accepted(
    placement_id: object, family_name: str, worker_name: str, *, fee_waived: bool
) -> Message:
    then = (
        "As a free replacement, the trial has started."
        if fee_waived
        else "The trial starts once they pay the placement fee."
    )
    return Message(
        "proposal_accepted",
        "Proposal accepted",
        f"The {family_name} accepted {worker_name}. {then}",
        AGENCY_PLACEMENT.format(id=placement_id),
    )


# Placements


def trial_started_family(placement_id: object, worker_name: str, ends_on: date) -> Message:
    return Message(
        "trial_started",
        "Payment received: the trial has started",
        f"Thank you. {worker_name}'s trial runs until {_day(ends_on)}.",
        FAMILY_PLACEMENT.format(id=placement_id),
    )


def trial_started_agency(placement_id: object, family_name: str, worker_name: str, ends_on: date) -> Message:
    return Message(
        "trial_started",
        "Placement fee paid: the trial has started",
        f"The {family_name} paid the placement fee. {worker_name}'s trial runs until {_day(ends_on)}.",
        AGENCY_PLACEMENT.format(id=placement_id),
    )


def hold_expired_family(request_id: object, worker_name: str, hold_minutes: int) -> Message:
    return Message(
        "hold_expired",
        f"Your hold on {worker_name} has lapsed",
        f"The placement fee wasn't paid within {hold_minutes} minutes, so {worker_name} has been released "
        "and your request is open again. You can accept a proposal again at any time.",
        FAMILY_REQUEST.format(id=request_id),
    )


def hold_released_agency(
    placement_id: object, family_name: str, worker_name: str, *, expired: bool
) -> Message:
    why = "didn't pay the placement fee in time" if expired else "cancelled before paying"
    return Message(
        "hold_released",
        f"{worker_name} is available again",
        f"The {family_name} {why}, so {worker_name} has been released.",
        AGENCY_PLACEMENT.format(id=placement_id),
        email=False,
    )


def trial_ending_family(placement_id: object, worker_name: str, ends_on: date) -> Message:
    return Message(
        "trial_ending",
        f"{worker_name}'s trial ends on {_day(ends_on)}",
        "Confirm the placement if it's going well, or ask for a replacement before the trial ends.",
        FAMILY_PLACEMENT.format(id=placement_id),
    )


def trial_ending_agency(placement_id: object, family_name: str, worker_name: str, ends_on: date) -> Message:
    return Message(
        "trial_ending",
        f"{worker_name}'s trial ends on {_day(ends_on)}",
        f"{worker_name}'s trial with the {family_name} ends soon.",
        AGENCY_PLACEMENT.format(id=placement_id),
    )


def placement_confirmed(placement_id: object, family_name: str, worker_name: str) -> Message:
    return Message(
        "placement_confirmed",
        "Placement confirmed",
        f"The {family_name} confirmed {worker_name} after the trial.",
        AGENCY_PLACEMENT.format(id=placement_id),
    )


def placement_ended(link: str, family_name: str, worker_name: str, by: str) -> Message:
    return Message(
        "placement_ended",
        "Placement ended",
        f"{worker_name}'s placement with the {family_name} was ended by {by}.",
        link,
    )


def replacement_requested(placement_id: object, family_name: str, worker_name: str) -> Message:
    return Message(
        "replacement_requested",
        "Replacement requested",
        f"The {family_name} asked for a replacement for {worker_name}. "
        "Their request is open for new proposals.",
        AGENCY_PLACEMENT.format(id=placement_id),
    )


def payment_refunded(worker_name: str, amount_kobo: int) -> Message:
    return Message(
        "payment_refunded",
        "Your payment is being refunded",
        f"Your payment of {naira(amount_kobo)} arrived after the hold on {worker_name} had lapsed, so it is "
        "being refunded to the card you paid with. Refunds can take a few working days to appear.",
        FAMILY_PAYMENTS,
    )


# Agencies and workers


def agency_status(status: AgencyStatus, *, reinstated: bool, reason: str | None) -> Message:
    because = f" Reason: {reason}" if reason else ""
    if status is AgencyStatus.approved and reinstated:
        title = "Your agency has been reinstated"
        body = "You can relist your workers once their checks are verified."
    elif status is AgencyStatus.approved:
        title = "Your agency is approved"
        body = "Subscribe to start listing verified workers and proposing them to families."
    elif status is AgencyStatus.suspended:
        title = "Your agency has been suspended"
        body = f"Your workers have been taken off the list and pending proposals withdrawn.{because}"
    else:
        title = "Your agency application wasn't approved"
        body = f"Your application to HelpVerified wasn't approved.{because}"
    return Message(f"agency_{status.value}", title, body, AGENCY_HOME)


def check_flagged(worker_id: object, worker_name: str, kind: VerificationKind, reason: str) -> Message:
    return Message(
        "check_flagged",
        f"{worker_name}'s {CHECK_LABELS[kind]} check needs review",
        f"A HelpVerified admin sent this check back for review: {reason} "
        f"{worker_name} is off the list until it is verified again.",
        AGENCY_WORKER.format(id=worker_id),
    )


def checks_expired(worker_id: object, worker_name: str, kinds: list[VerificationKind]) -> Message:
    labels = _list([CHECK_LABELS[k] for k in kinds])
    noun = "check has" if len(kinds) == 1 else "checks have"
    return Message(
        "checks_expired",
        f"{worker_name}'s {labels} {noun} expired",
        f"{worker_name} is off the list until the {labels} {'check is' if len(kinds) == 1 else 'checks are'} "
        "verified again.",
        AGENCY_WORKER.format(id=worker_id),
    )


def subscription_lapsed(*, ended: bool) -> Message:
    title = "Your subscription has ended" if ended else "Your subscription payment didn't go through"
    return Message(
        "subscription_lapsed",
        title,
        "Until your subscription is active again you can't list workers or make proposals. "
        "Placements already running aren't affected.",
        AGENCY_BILLING,
    )
