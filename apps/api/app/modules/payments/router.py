"""Payments, billing and the Paystack webhook (api-contracts.md §3, Payments and billing)."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request, Response, status
from fastapi.responses import JSONResponse

from app.core.deps import (
    CurrentAgency,
    CurrentUser,
    FamilyUser,
    IdempotencyDep,
    PaymentServiceDep,
)
from app.core.errors import HoldExpired, IllegalTransition
from app.core.idempotent import fresh_replay, run_once
from app.core.pagination import Page, PageParams, page_params
from app.modules.payments.schemas import BillingSubscription, PaymentOut, PaymentVerification
from app.modules.placements.schemas import CheckoutOut

router = APIRouter(tags=["payments"])


@router.get("/payments")
async def list_payments(
    user: CurrentUser, payments: PaymentServiceDep, params: Annotated[PageParams, Depends(page_params)]
) -> Page[PaymentOut]:
    """The caller's payments (and their agency's subscription payments), newest first."""
    items, total = await payments.page(user, params)
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.get("/payments/{reference}/verify")
async def verify_payment(
    reference: str, user: CurrentUser, payments: PaymentServiceDep
) -> PaymentVerification:
    """For the callback page after Paystack's redirect. Only the payer; anyone else gets 404."""
    return await payments.verify_for_payer(user, reference)


@router.post("/placements/{placement_id}/pay", response_model=CheckoutOut)
async def pay(
    placement_id: uuid.UUID,
    user: FamilyUser,
    payments: PaymentServiceDep,
    idempotency: IdempotencyDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> JSONResponse:
    """Resume the checkout for an unpaid hold (the same Paystack transaction, never a second one). 409
    HOLD_EXPIRED once the hold has expired; a replayed key is checked the same way (ADR 0017)."""

    async def act() -> CheckoutOut:
        checkout = await payments.resume_checkout(user, placement_id)
        return CheckoutOut(authorization_url=checkout.authorization_url, reference=checkout.reference)

    async def replay(body: dict[str, Any]) -> JSONResponse | None:
        decision = await payments.replay_decision(user, placement_id, body.get("reference"))
        if decision == "current":
            return await fresh_replay(status.HTTP_200_OK, act)
        if decision == "paid":
            raise IllegalTransition("Nothing to pay.", details={"placement_id": str(placement_id)})
        if decision == "expired":
            raise HoldExpired(details={"placement_id": str(placement_id)})
        return None

    return await run_once(idempotency, user, "pay", idempotency_key, status.HTTP_200_OK, act, replay)


@router.get("/billing/subscription")
async def get_subscription(agency: CurrentAgency, payments: PaymentServiceDep) -> BillingSubscription | None:
    return await payments.subscription(agency)


@router.post("/billing/subscription")
async def start_subscription(
    user: CurrentUser, agency: CurrentAgency, payments: PaymentServiceDep
) -> CheckoutOut:
    """A Paystack checkout for the agency's monthly plan. Paystack then renews it each month."""
    checkout = await payments.start_subscription(user, agency)
    return CheckoutOut(authorization_url=checkout.authorization_url, reference=checkout.reference)


@router.post("/webhooks/paystack", include_in_schema=False)
async def paystack_webhook(
    request: Request,
    payments: PaymentServiceDep,
    signature: Annotated[str | None, Header(alias="x-paystack-signature")] = None,
) -> Response:
    """Paystack only: the signature is checked on the raw body before anything is parsed."""
    await payments.handle_webhook(await request.body(), signature)
    return Response(status_code=status.HTTP_200_OK)
