import hashlib
import hmac
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel
from core.config import get_settings
from core.models import User
from core.database import get_db
from api.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/razorpay", tags=["razorpay"])
settings = get_settings()

try:
    import razorpay
    _razorpay_client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret)) if settings.razorpay_key_id else None
except ImportError:
    razorpay = None
    _razorpay_client = None


def _require_razorpay():
    if not _razorpay_client:
        raise HTTPException(status_code=503, detail="Razorpay is not configured")


def get_razorpay_client():
    return _razorpay_client


async def create_rzp_order(req):
    _require_razorpay()
    receipt = req.receipt or "order_unknown"
    try:
        order = _razorpay_client.order.create({
            "amount": req.amount,
            "currency": req.currency,
            "receipt": receipt,
            "payment_capture": 1,
            "notes": req.notes,
        })
        return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"], "receipt": order["receipt"]}
    except Exception:
        logger.exception("Razorpay order creation failed")
        raise


class RazorpayOrderRequest(BaseModel):
    amount: int
    currency: str = "INR"
    receipt: Optional[str] = None
    notes: Dict[str, str] = {}


class RazorpaySubscriptionRequest(BaseModel):
    plan_id: str
    total_count: int = 12
    quantity: int = 1
    customer_notify: bool = True
    notes: Dict[str, str] = {}


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class RazorpayWebhookResponse(BaseModel):
    status: str
    event: str


@router.post("/order", response_model=Dict[str, Any])
async def create_order(req: RazorpayOrderRequest, current_user: User = Depends(get_current_user)):
    _require_razorpay()
    receipt = req.receipt or f"order_{current_user.id}"
    try:
        order = _razorpay_client.order.create({
            "amount": req.amount,
            "currency": req.currency,
            "receipt": receipt,
            "payment_capture": 1,
            "notes": req.notes,
        })
        return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"], "receipt": order["receipt"]}
    except Exception as exc:
        logger.exception("Razorpay order creation failed for user %s", current_user.id)
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {exc}")


@router.post("/subscription", response_model=Dict[str, Any])
async def create_subscription(req: RazorpaySubscriptionRequest, current_user: User = Depends(get_current_user)):
    _require_razorpay()
    db = await get_db()
    user_doc = await db.users.find_one({"id": current_user.id}, {"_id": 0, "name": 1, "email": 1})
    name = (user_doc or {}).get("name", current_user.name)
    email = (user_doc or {}).get("email", current_user.email)

    razorpay_customer_id = None
    existing_sub = await db.subscriptions.find_one({"user_id": current_user.id, "provider": "razorpay"}, {"_id": 0, "razorpay_customer_id": 1})
    if existing_sub and existing_sub.get("razorpay_customer_id"):
        razorpay_customer_id = existing_sub["razorpay_customer_id"]
    else:
        customer = _razorpay_client.customer.create({"name": name, "email": email, "notes": {"user_id": current_user.id}})
        razorpay_customer_id = customer["id"]

    try:
        sub = _razorpay_client.subscription.create({
            "plan_id": req.plan_id,
            "customer_id": razorpay_customer_id,
            "total_count": req.total_count,
            "quantity": req.quantity,
            "customer_notify": req.customer_notify,
            "notes": {"user_id": current_user.id, **req.notes},
        })
    except Exception as exc:
        logger.exception("Razorpay subscription creation failed for user %s", current_user.id)
        raise HTTPException(status_code=502, detail=f"Razorpay subscription creation failed: {exc}")

    await db.subscriptions.update_one(
        {"user_id": current_user.id, "provider": "razorpay"},
        {"$set": {"razorpay_customer_id": razorpay_customer_id}},
        upsert=True,
    )
    return {"subscription_id": sub["id"], "plan_id": sub.get("plan_id"), "status": sub.get("status"), "customer_id": razorpay_customer_id}


@router.post("/verify", response_model=Dict[str, bool])
async def verify_payment(req: RazorpayVerifyRequest):
    _require_razorpay()
    body = f"{req.razorpay_order_id}|{req.razorpay_payment_id}"
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, req.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    return {"valid": True}


@router.post("/webhook", response_model=RazorpayWebhookResponse)
async def razorpay_webhook(request: Request, x_razorpay_signature: str = Header(..., alias="X-Razorpay-Signature")):
    if not _razorpay_client:
        raise HTTPException(status_code=500, detail="Razorpay is not configured")

    rzp_settings = get_settings()
    if not rzp_settings.razorpay_webhook_secret:
        raise HTTPException(status_code=503, detail="Razorpay webhook secret not configured")

    body_bytes = await request.body()
    expected = hmac.new(
        rzp_settings.razorpay_webhook_secret.encode(),
        body_bytes,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, x_razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    try:
        event = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = event.get("event", "")
    entity = event.get("payload", {}).get("payment", {}).get("entity", {}) if event_type.startswith("payment") else event.get("payload", {}).get("subscription", {}).get("entity", {})

    db = await get_db()

    if event_type == "payment.captured":
        order_id = entity.get("order_id")
        purchase = await db.credit_purchases.find_one({"razorpay_order_id": order_id}, {"_id": 0})
        if purchase and purchase.get("status") != "completed":
            res = await db.credit_purchases.update_one(
                {"razorpay_order_id": order_id, "status": {"$ne": "completed"}},
                {"$set": {"status": "completed", "razorpay_payment_id": entity.get("id")}},
            )
            if getattr(res, "modified_count", 1) > 0:
                await db.users.update_one({"id": purchase["user_id"]}, {"$inc": {"credits": purchase.get("credits", 0)}})

    elif event_type == "subscription.activated":
        sub_id = entity.get("id")
        plan_id = entity.get("plan_id")
        await db.subscriptions.update_one(
            {"razorpay_subscription_id": sub_id},
            {"$set": {"status": "active", "razorpay_plan_id": plan_id}},
        )

    elif event_type == "subscription.updated":
        sub_id = entity.get("id")
        await db.subscriptions.update_one(
            {"razorpay_subscription_id": sub_id},
            {"$set": {"status": entity.get("status", "updated")}},
        )

    elif event_type == "subscription.completed":
        sub_id = entity.get("id")
        await db.subscriptions.update_one(
            {"razorpay_subscription_id": sub_id},
            {"$set": {"status": "completed"}},
        )

    elif event_type == "subscription.halted":
        sub_id = entity.get("id")
        sub_doc = await db.subscriptions.find_one({"razorpay_subscription_id": sub_id}, {"_id": 0, "user_id": 1})
        await db.subscriptions.update_one(
            {"razorpay_subscription_id": sub_id},
            {"$set": {"status": entity.get("status", "halted")}},
        )
        if sub_doc and sub_doc.get("user_id"):
            user_doc = await db.users.find_one({"id": sub_doc["user_id"]}, {"_id": 0, "email": 1, "name": 1})
            if user_doc and user_doc.get("email"):
                try:
                    _settings = get_settings()
                    if _settings.resend_api_key:
                        import resend
                        resend.api_key = _settings.resend_api_key
                        resend.Emails.send({
                            "from": _settings.from_email,
                            "to": user_doc["email"],
                            "subject": "Forge: Action required — subscription payment failed",
                            "text": (
                                f"Hi {user_doc.get('name', 'there')},\n\n"
                                "We weren't able to process your latest subscription payment via Razorpay. "
                                "Please update your payment method to avoid interruption to your access.\n\n"
                                "— Forge AI"
                            ),
                        })
                except Exception:
                    logging.exception("Failed to send Razorpay dunning email to %s", user_doc.get("email"))

    return RazorpayWebhookResponse(status="ok", event=event_type)
