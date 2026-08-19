import hashlib
import hmac
import logging
from typing import Any, Dict, List, Optional

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel

from core.config import get_settings
from core.models import PlanTier, User, PlanResponse
from core.database import get_db
from core.cache import cached_read, PLANS_CACHE_KEY, PLANS_CACHE_TTL
from api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cashfree", tags=["cashfree"])
settings = get_settings()

_CASHFREE_BASE_URL = settings.cashfree_base_url or "https://api.cashfree.com/pg/v1"

_CASHFREE_HEADERS = {
    "x-client-id": settings.cashfree_app_id,
    "x-client-secret": settings.cashfree_secret_key,
    "Content-Type": "application/json",
}


def _cashfree_headers(cf_settings) -> dict:
    return {
        "x-client-id": cf_settings.cashfree_app_id,
        "x-client-secret": cf_settings.cashfree_secret_key,
        "Content-Type": "application/json",
    }


def _require_cashfree():
    """Validate Cashfree config against *current* settings.

    Returns the Settings instance. The module-level ``settings`` singleton is
    frozen at first import anywhere in the process (main.py/billing.py import
    this module), so callers must use the returned instance -- not the module
    global -- to get env-correct values in tests and long-lived processes.
    """
    cf_settings = get_settings()
    if not cf_settings.cashfree_app_id or not cf_settings.cashfree_secret_key:
        raise HTTPException(status_code=503, detail="Cashfree is not configured")
    return cf_settings


class CashfreeOrderRequest(BaseModel):
    amount: int
    currency: str = "INR"
    receipt: Optional[str] = None
    notes: Dict[str, str] = {}
    customer: Optional[Dict[str, Any]] = None
    return_url: Optional[str] = None


class CashfreeSubscriptionRequest(BaseModel):
    plan_id: str
    customer_id: Optional[str] = None
    quantity: int = 1
    customer_notify: bool = True
    notes: Dict[str, str] = {}


class CashfreeVerifyRequest(BaseModel):
    order_id: str
    order_token: str


class CashfreeWebhookResponse(BaseModel):
    status: str
    event: str


@router.post("/order", response_model=Dict[str, Any])
async def create_order(req: CashfreeOrderRequest, current_user: User = Depends(get_current_user)):
    _require_cashfree()
    db = await get_db()

    receipt = req.receipt or f"order_{current_user.id}"
    user_doc = await db.users.find_one({"id": current_user.id}, {"_id": 0, "name": 1, "email": 1})
    customer = req.customer or {
        "id": current_user.id,
        "name": (user_doc or {}).get("name", current_user.name),
        "email": (user_doc or {}).get("email", current_user.email),
    }

    payload = {
        "order_id": receipt,
        "order_amount": req.amount / 100 if req.currency.lower() == "inr" else req.amount,
        "order_currency": req.currency,
        "customer_details": customer,
        "order_meta": {
            "return_url": req.return_url or f"{settings.app_url}/billing?status=success",
            "notify_url": f"{settings.api_url}/billing/webhook/cashfree",
        },
    }

    try:
        async with httpx.AsyncClient(base_url=_CASHFREE_BASE_URL, headers=_CASHFREE_HEADERS, timeout=15.0) as client:
            response = await client.post("/orders", json=payload)
            response.raise_for_status()
            order = response.json()
    except Exception as exc:
        logger.exception("Cashfree order creation failed for user %s", current_user.id)
        raise HTTPException(status_code=502, detail=f"Cashfree order creation failed: {exc}")

    purchase = {
        "user_id": current_user.id,
        "cashfree_order_id": order.get("order_id") or receipt,
        "cashfree_order_token": order.get("order_token"),
        "credits": 0,
        "amount": req.amount,
        "currency": req.currency,
        "status": "pending",
        "provider": "cashfree",
        "receipt": receipt,
    }
    await db.credit_purchases.insert_one(purchase)

    return {
        "order_id": order.get("order_id") or receipt,
        "order_token": order.get("order_token"),
        "amount": order.get("order_amount"),
        "currency": order.get("order_currency"),
        "payment_session_id": order.get("payment_session_id"),
    }


async def create_cashfree_order(req: Any, current_user: User) -> Dict[str, Any]:
    cf_settings = _require_cashfree()
    db = await get_db()

    receipt = f"order_{current_user.id}"
    user_doc = await db.users.find_one({"id": current_user.id}, {"_id": 0, "name": 1, "email": 1})
    customer = {
        "id": current_user.id,
        "name": (user_doc or {}).get("name", current_user.name),
        "email": (user_doc or {}).get("email", current_user.email),
    }

    if isinstance(req, dict):
        amount = req.get("amount", 0)
        currency = req.get("currency", "INR")
        success_url = req.get("success_url")
    else:
        amount = getattr(req, "amount", 0)
        currency = getattr(req, "currency", "INR")
        success_url = getattr(req, "success_url", None)

    payload = {
        "order_id": receipt,
        "order_amount": amount,
        "order_currency": currency,
        "customer_details": customer,
        "order_meta": {
            "return_url": success_url or f"{cf_settings.app_url}/billing?status=success",
            "notify_url": f"{cf_settings.api_url}/billing/webhook/cashfree",
        },
    }

    try:
        async with httpx.AsyncClient(
            base_url=cf_settings.cashfree_base_url or "https://api.cashfree.com/pg/v1",
            headers=_cashfree_headers(cf_settings),
            timeout=15.0,
        ) as client:
            response = await client.post("/orders", json=payload)
            response.raise_for_status()
            order = response.json()
    except Exception as exc:
        logger.exception("Cashfree order creation failed for user %s", current_user.id)
        raise HTTPException(status_code=502, detail=f"Cashfree order creation failed: {exc}")

    purchase = {
        "user_id": current_user.id,
        "cashfree_order_id": order.get("order_id") or receipt,
        "cashfree_order_token": order.get("order_token"),
        "credits": 0,
        "amount": amount,
        "currency": currency,
        "status": "pending",
        "provider": "cashfree",
        "receipt": receipt,
    }
    await db.credit_purchases.insert_one(purchase)

    payment_session_id = order.get("payment_session_id")
    redirect_url = (
        f"https://payments.cashfree.com/checkout#paymentSessionId={payment_session_id}"
        if payment_session_id
        else None
    )

    return {
        "order_id": order.get("order_id") or receipt,
        "order_token": order.get("order_token"),
        "amount": order.get("order_amount"),
        "currency": order.get("order_currency"),
        "payment_session_id": payment_session_id,
        "url": redirect_url,
    }


@router.post("/subscription", response_model=Dict[str, Any])
async def create_cashfree_subscription(req: CashfreeSubscriptionRequest, current_user: User = Depends(get_current_user)):
    cf_settings = _require_cashfree()
    db = await get_db()

    plan_id = _cashfree_plan_id(req.plan_id)
    if not plan_id:
        raise HTTPException(status_code=400, detail="Plan not configured for Cashfree")

    user_doc = await db.users.find_one({"id": current_user.id}, {"_id": 0, "name": 1, "email": 1})
    customer_details = {
        "id": req.customer_id or current_user.id,
        "name": (user_doc or {}).get("name", current_user.name),
        "email": (user_doc or {}).get("email", current_user.email),
    }

    payload = {
        "plan_id": plan_id,
        "customer_details": customer_details,
        "quantity": req.quantity,
        "customer_notify": req.customer_notify,
        "subscription_meta": {
            "notify_url": f"{cf_settings.api_url}/billing/webhook/cashfree",
            "return_url": f"{cf_settings.app_url}/billing?status=success",
        },
    }

    try:
        async with httpx.AsyncClient(
            base_url=cf_settings.cashfree_base_url or "https://api.cashfree.com/pg/v1",
            headers=_cashfree_headers(cf_settings),
            timeout=15.0,
        ) as client:
            response = await client.post("/subscriptions", json=payload)
            response.raise_for_status()
            sub = response.json()
    except Exception as exc:
        logger.exception("Cashfree subscription creation failed for user %s", current_user.id)
        raise HTTPException(status_code=502, detail=f"Cashfree subscription creation failed: {exc}")

    subscription = {
        "user_id": current_user.id,
        "cashfree_subscription_id": sub.get("subscription_id") or sub.get("subscriptation_id"),
        "cashfree_plan_id": plan_id,
        "plan": _map_cashfree_plan_id(plan_id),
        "status": sub.get("status", "pending"),
        "provider": "cashfree",
    }
    await db.subscriptions.replace_one(
        {"cashfree_subscription_id": subscription["cashfree_subscription_id"]},
        subscription,
        upsert=True,
    )

    return {
        "subscription_id": sub.get("subscription_id") or sub.get("subscriptation_id"),
        "plan_id": plan_id,
        "status": sub.get("status"),
        "customer_id": customer_details["id"],
    }


@router.post("/verify", response_model=Dict[str, bool])
async def verify_payment(req: CashfreeVerifyRequest):
    cf_settings = _require_cashfree()
    try:
        async with httpx.AsyncClient(
            base_url=cf_settings.cashfree_base_url or "https://api.cashfree.com/pg/v1",
            headers=_cashfree_headers(cf_settings),
            timeout=15.0,
        ) as client:
            response = await client.get(f"/orders/{req.order_id}")
            response.raise_for_status()
            order = response.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cashfree verification failed: {exc}")

    return {"valid": order.get("order_status") == "PAID"}


@router.post("/webhook", response_model=CashfreeWebhookResponse)
async def cashfree_webhook(request: Request, x_cashfree_signature: str = Header(..., alias="X-Cashfree-Signature")):
    cf_settings = get_settings()
    if not cf_settings.cashfree_webhook_secret:
        return CashfreeWebhookResponse(status="skipped", event="no_secret")

    body_bytes = await request.body()
    expected = hmac.new(
        cf_settings.cashfree_webhook_secret.encode(),
        body_bytes,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, x_cashfree_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    db = await get_db()
    event_type = event.get("type", "")
    data = event.get("data", {}).get("order", {}) or event.get("data", {}).get("subscription", {})

    if event_type in ("ORDER.PAID", "PAYMENT_SUCCESS"):
        await _handle_cashfree_payment_success(db, data)
    elif event_type == "ORDER.FAILED":
        await _handle_cashfree_payment_failed(db, data)
    elif event_type == "SUBSCRIPTION.ACTIVATED":
        await _handle_cashfree_subscription_activated(db, data)
    elif event_type == "SUBSCRIPTION.UPDATED":
        await _handle_cashfree_subscription_updated(db, data)
    elif event_type == "SUBSCRIPTION.CANCELLED":
        await _handle_cashfree_subscription_cancelled(db, data)

    return CashfreeWebhookResponse(status="ok", event=event_type)


async def _handle_cashfree_payment_success(db: Any, order: Dict[str, Any]) -> None:
    order_id = order.get("order_id") or order.get("orderId")
    purchase = await db.credit_purchases.find_one({"cashfree_order_id": order_id}, {"_id": 0})
    if purchase and purchase.get("status") != "completed":
        await db.credit_purchases.update_one(
            {"cashfree_order_id": order_id, "status": {"$ne": "completed"}},
            {"$set": {"status": "completed", "cashfree_order_token": order.get("order_token")}},
        )
        await db.users.update_one({"id": purchase["user_id"]}, {"$inc": {"credits": purchase.get("credits", 0)}})


async def _handle_cashfree_payment_failed(db: Any, order: Dict[str, Any]) -> None:
    order_id = order.get("order_id") or order.get("orderId")
    await db.credit_purchases.update_one(
        {"cashfree_order_id": order_id},
        {"$set": {"status": "failed"}},
    )


async def _handle_cashfree_subscription_activated(db: Any, sub: Dict[str, Any]) -> None:
    sub_id = sub.get("subscription_id") or sub.get("subscriptation_id")
    await db.subscriptions.update_one(
        {"cashfree_subscription_id": sub_id},
        {"$set": {"status": "active"}},
    )


async def _handle_cashfree_subscription_updated(db: Any, sub: Dict[str, Any]) -> None:
    sub_id = sub.get("subscription_id") or sub.get("subscriptation_id")
    await db.subscriptions.update_one(
        {"cashfree_subscription_id": sub_id},
        {"$set": {"status": sub.get("status", "updated")}},
    )


async def _handle_cashfree_subscription_cancelled(db: Any, sub: Dict[str, Any]) -> None:
    sub_id = sub.get("subscription_id") or sub.get("subscriptation_id")
    await db.subscriptions.update_one(
        {"cashfree_subscription_id": sub_id},
        {"$set": {"status": "cancelled"}},
    )


_CASHFREE_PLAN_MAP: Dict[str, PlanTier] = {}


def _cashfree_plan_id(plan_id: str) -> Optional[str]:
    return plan_id or None


def _map_cashfree_plan_id(plan_id: str) -> PlanTier:
    return _CASHFREE_PLAN_MAP.get(plan_id, PlanTier.FREE)


@router.get("/plans", response_model=List[PlanResponse])
async def list_cashfree_plans():
    return await cached_read(PLANS_CACHE_KEY, PLANS_CACHE_TTL, _build_plans)


async def _build_plans():
    from api.billing import PLAN_DETAILS  # local import: avoids a load-time cycle

    return [
        PlanResponse(
            tier=p["tier"],
            name=p["name"],
            price_id=p["price_id"],
            price_monthly=p["price_monthly"],
            price_annual=p.get("price_annual", p["price_monthly"] * 10),
            credits=p["credits"],
            features=p["features"],
            max_projects=p.get("max_projects", 0),
        ).model_dump()
        for p in PLAN_DETAILS
    ]


require_cashfree = _require_cashfree
verify_cashfree_payment = verify_payment
