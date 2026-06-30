from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import stripe

from core.config import get_settings
from core.models import User, PlanTier, Subscription, Invoice, CreditPurchase, SubscriptionStatus, OnboardingProgress, SecurityEvent
from core.database import get_db
from api.auth import get_current_user

settings = get_settings()
stripe.api_key = settings.stripe_secret_key

router = APIRouter(prefix="/billing", tags=["billing"])

PLAN_PRICES: Dict[PlanTier, str] = {
    PlanTier.FREE: "price_free",
    PlanTier.STANDARD: "price_standard_monthly",
    PlanTier.PRO: "price_pro_monthly",
    PlanTier.ENTERPRISE: "price_enterprise_monthly",
}

ANNUAL_PLAN_PRICES: Dict[PlanTier, str] = {
    PlanTier.STANDARD: "price_standard_annual",
    PlanTier.PRO: "price_pro_annual",
    PlanTier.ENTERPRISE: "price_enterprise_annual",
    PlanTier.FREE: "price_free",
}

PLAN_DETAILS = [
    {
        "tier": PlanTier.FREE,
        "name": "Free",
        "price_id": "price_free",
        "price_monthly": 0,
        "price_annual": 0,
        "credits": 10,
        "features": ["Basic agents", "10 credits/month", "Community support"],
        "max_projects": 3,
    },
    {
        "tier": PlanTier.STANDARD,
        "name": "Standard",
        "price_id": "price_standard_monthly",
        "price_annual_id": "price_standard_annual",
        "price_monthly": 29,
        "price_annual": 290,
        "credits": 100,
        "features": ["All agents", "100 credits/month", "Priority support", "Custom domains"],
        "max_projects": 25,
    },
    {
        "tier": PlanTier.PRO,
        "name": "Pro",
        "price_id": "price_pro_monthly",
        "price_annual_id": "price_pro_annual",
        "price_monthly": 99,
        "price_annual": 990,
        "credits": 500,
        "features": ["All agents", "500 credits/month", "24/7 support", "SSO", "Advanced analytics"],
        "max_projects": 100,
    },
    {
        "tier": PlanTier.ENTERPRISE,
        "name": "Enterprise",
        "price_id": "price_enterprise_monthly",
        "price_annual_id": "price_enterprise_annual",
        "price_monthly": 999,
        "price_annual": 9990,
        "credits": 5000,
        "features": [
            "All agents",
            "Unlimited credits",
            "Dedicated support",
            "SSO/SAML",
            "Custom SLA",
            "On-premise option",
        ],
        "max_projects": -1,
    },
]

CREDIT_PACKAGES = [
    {"credits": 100, "price_usd": 10, "id": "credits_100"},
    {"credits": 500, "price_usd": 40, "id": "credits_500"},
    {"credits": 1000, "price_usd": 70, "id": "credits_1000"},
    {"credits": 5000, "price_usd": 250, "id": "credits_5000"},
]


class CheckoutRequest(BaseModel):
    plan: Optional[PlanTier] = None
    price_id: Optional[str] = None
    success_url: str
    cancel_url: str
    interval: Optional[str] = None


class PortalRequest(BaseModel):
    return_url: str


class CreditPurchaseRequest(BaseModel):
    package_id: str


class CancelSubscriptionRequest(BaseModel):
    at_period_end: bool = True


class DowngradeRequest(BaseModel):
    plan: PlanTier


class SubscriptionResponse(BaseModel):
    id: str
    plan: str
    status: str
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    created_at: datetime


class InvoiceResponse(BaseModel):
    id: str
    amount: int
    currency: str
    status: str
    hosted_invoice_url: Optional[str]
    created_at: datetime


class CreditPurchaseResponse(BaseModel):
    id: str
    credits: int
    amount: int
    status: str
    created_at: datetime


class UsageResponse(BaseModel):
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    credits_used: int
    credits_remaining: int
    builds_count: int
    agents_runs: Dict[str, int]


class PlanResponse(BaseModel):
    tier: str
    name: str
    price_id: str
    price_monthly: int
    price_annual: int
    credits: int
    features: List[str]
    max_projects: int


@router.post("/checkout", response_model=Dict[str, str])
async def create_checkout_session(req: CheckoutRequest, user: User = Depends(get_current_user)):
    db = await get_db()

    if req.plan == PlanTier.FREE:
        raise HTTPException(status_code=400, detail="Cannot checkout for free plan")

    # Validate Stripe is properly configured
    if not settings.stripe_secret_key or settings.stripe_secret_key == "your_stripe_secret_key_here":
        raise HTTPException(status_code=503, detail="Billing not configured. Please contact support.")
    
    if not req.price_id:
        if not req.plan:
            raise HTTPException(status_code=400, detail="plan or price_id is required")
        
        price_id = None
        plan_details = next((p for p in PLAN_DETAILS if p["tier"] == req.plan), None)
        
        if req.interval == "annual":
            price_id = plan_details.get("price_annual_id") if plan_details else None
        else:
            price_id = PLAN_PRICES.get(req.plan)
        
        if not price_id:
            raise HTTPException(status_code=400, detail="Invalid plan or interval")
    else:
        price_id = req.price_id

    metadata = {"user_id": user.id, "trial_eligible": "true"}

    customer_id = user.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(email=user.email, name=user.name, metadata=metadata)
        customer_id = customer.id
        await db.users.update_one({"id": user.id}, {"$set": {"stripe_customer_id": customer_id}})

    checkout_session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=req.success_url,
        cancel_url=req.cancel_url,
        metadata=metadata,
        allow_promotion_codes=True,
    )

    return {"url": checkout_session.url, "id": checkout_session.id}


@router.post("/portal", response_model=Dict[str, str])
async def create_portal_session(req: PortalRequest, user: User = Depends(get_current_user)):
    db = await get_db()
    user_doc = await db.users.find_one({"id": user.id}, {"_id": 0, "stripe_customer_id": 1})
    customer_id = user_doc.get("stripe_customer_id") if user_doc else None

    if not customer_id:
        customer = stripe.Customer.create(email=user.email, name=user.name, metadata={"user_id": user.id})
        customer_id = customer.id
        await db.users.update_one({"id": user.id}, {"$set": {"stripe_customer_id": customer_id}})

    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=req.return_url,
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(...)):
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, settings.stripe_webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    db = await get_db()

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        await handle_checkout_completed(db, data)
    elif event_type == "customer.subscription.updated":
        await handle_subscription_updated(db, data)
    elif event_type == "customer.subscription.deleted":
        await handle_subscription_deleted(db, data)
    elif event_type == "invoice.payment_succeeded":
        await handle_invoice_payment_succeeded(db, data)
    elif event_type == "invoice.payment_failed":
        await handle_invoice_payment_failed(db, data)

    return {"status": "ok"}


async def handle_checkout_completed(db: Any, session: Dict[str, Any]):
    metadata = session.get("metadata", {})
    user_id = metadata.get("user_id")
    if not user_id:
        return

    customer_id = session.get("customer")
    await db.users.update_one({"id": user_id}, {"$set": {"stripe_customer_id": customer_id}})

    subscription_id = session.get("subscription")
    if not subscription_id:
        return

    stripe_sub = stripe.Subscription.retrieve(subscription_id)
    plan_tier = _map_price_to_plan(stripe_sub["items"]["data"][0]["price"]["id"])

    subscription = Subscription(
        user_id=user_id,
        stripe_subscription_id=subscription_id,
        stripe_price_id=stripe_sub["items"]["data"][0]["price"]["id"],
        status=SubscriptionStatus(stripe_sub["status"].lower()),
        plan=plan_tier,
        current_period_start=datetime.fromtimestamp(stripe_sub["current_period_start"]),
        current_period_end=datetime.fromtimestamp(stripe_sub["current_period_end"]),
    )
    sub_dict = subscription.model_dump()
    await db.subscriptions.replace_one(
        {"stripe_subscription_id": subscription_id},
        sub_dict,
        upsert=True,
    )

    plan_details = next((p for p in PLAN_DETAILS if p["tier"] == plan_tier), None)
    if plan_details:
        await db.users.update_one({"id": user_id}, {"$set": {"plan": plan_tier, "credits": plan_details["credits"]}})


async def handle_subscription_updated(db: Any, sub: Dict[str, Any]):
    subscription_id = sub["id"]
    plan_tier = _map_price_to_plan(sub["items"]["data"][0]["price"]["id"])

    await db.subscriptions.update_one(
        {"stripe_subscription_id": subscription_id},
        {"$set": {
            "status": SubscriptionStatus(sub["status"].lower()),
            "plan": plan_tier,
            "current_period_start": datetime.fromtimestamp(sub["current_period_start"]),
            "current_period_end": datetime.fromtimestamp(sub["current_period_end"]),
            "cancel_at_period_end": sub.get("cancel_at_period_end", False),
            "updated_at": datetime.utcnow(),
        }},
    )

    sub_doc = await db.subscriptions.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0, "user_id": 1})
    if sub_doc:
        plan_details = next((p for p in PLAN_DETAILS if p["tier"] == plan_tier), None)
        if plan_details:
            await db.users.update_one({"id": sub_doc["user_id"]}, {"$set": {"plan": plan_tier}})


async def handle_subscription_deleted(db: Any, sub: Dict[str, Any]):
    subscription_id = sub["id"]
    await db.subscriptions.update_one(
        {"stripe_subscription_id": subscription_id},
        {"$set": {"status": SubscriptionStatus.CANCELED, "updated_at": datetime.utcnow()}},
    )

    sub_doc = await db.subscriptions.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0, "user_id": 1})
    if sub_doc:
        await db.users.update_one({"id": sub_doc["user_id"]}, {"$set": {"plan": PlanTier.FREE}})


async def handle_invoice_payment_succeeded(db: Any, invoice: Dict[str, Any]):
    stripe_invoice_id = invoice["id"]
    await db.invoices.update_one(
        {"stripe_invoice_id": stripe_invoice_id},
        {"$set": {"status": "paid"}},
    )


async def handle_invoice_payment_failed(db: Any, invoice: Dict[str, Any]):
    stripe_invoice_id = invoice["id"]
    await db.invoices.update_one(
        {"stripe_invoice_id": stripe_invoice_id},
        {"$set": {"status": "payment_failed"}},
    )


def _map_price_to_plan(price_id: str) -> PlanTier:
    for plan, pid in PLAN_PRICES.items():
        if pid == price_id:
            return plan
    for plan, pid in ANNUAL_PLAN_PRICES.items():
        if pid == price_id:
            return plan
    return PlanTier.FREE


@router.get("/subscription", response_model=Optional[SubscriptionResponse])
async def get_subscription(user: User = Depends(get_current_user)):
    db = await get_db()
    sub = await db.subscriptions.find_one({"user_id": user.id, "status": {"$ne": SubscriptionStatus.CANCELED}}, {"_id": 0})
    if not sub:
        return None
    return sub


@router.get("/invoices", response_model=List[InvoiceResponse])
async def list_invoices(user: User = Depends(get_current_user)):
    db = await get_db()
    invoices = []
    cursor = db.invoices.find({"user_id": user.id}, {"_id": 0}).sort("created_at", -1)
    async for doc in cursor:
        invoices.append(doc)
    return invoices


@router.post("/credits/purchase", response_model=Dict[str, str])
async def create_credit_purchase(req: CreditPurchaseRequest, user: User = Depends(get_current_user)):
    db = await get_db()

    package = next((p for p in CREDIT_PACKAGES if p["id"] == req.package_id), None)
    if not package:
        raise HTTPException(status_code=400, detail="Invalid credit package")

    customer_id = user.stripe_customer_id
    if not customer_id:
        user_doc = await db.users.find_one({"id": user.id}, {"_id": 0, "stripe_customer_id": 1})
        customer_id = user_doc.get("stripe_customer_id") if user_doc else None
        if not customer_id:
            customer = stripe.Customer.create(email=user.email, name=user.name, metadata={"user_id": user.id})
            customer_id = customer.id
            await db.users.update_one({"id": user.id}, {"$set": {"stripe_customer_id": customer_id}})

    payment_intent = stripe.PaymentIntent.create(
        amount=package["price_usd"] * 100,
        currency="usd",
        customer=customer_id,
        metadata={"user_id": user.id, "credits": package["credits"], "package_id": req.package_id},
        automatic_payment_methods={"enabled": True},
    )

    purchase = CreditPurchase(
        user_id=user.id,
        stripe_payment_intent_id=payment_intent.id,
        credits=package["credits"],
        amount=package["price_usd"] * 100,
        status="pending",
    )
    await db.credit_purchases.insert_one(purchase.model_dump())

    return {
        "client_secret": payment_intent.client_secret,
        "payment_intent_id": payment_intent.id,
        "amount": payment_intent.amount,
        "currency": payment_intent.currency,
    }


@router.get("/plans", response_model=List[PlanResponse])
async def list_plans():
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
        )
        for p in PLAN_DETAILS
    ]


@router.post("/cancel")
async def cancel_subscription(req: CancelSubscriptionRequest, user: User = Depends(get_current_user)):
    db = await get_db()
    sub = await db.subscriptions.find_one({"user_id": user.id, "status": {"$ne": SubscriptionStatus.CANCELED}}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found")

    if req.at_period_end:
        stripe.Subscription.modify(sub["stripe_subscription_id"], cancel_at_period_end=True)
        await db.subscriptions.update_one(
            {"stripe_subscription_id": sub["stripe_subscription_id"]},
            {"$set": {"cancel_at_period_end": True, "updated_at": datetime.utcnow()}},
        )
    else:
        stripe.Subscription.delete(sub["stripe_subscription_id"])
        await db.subscriptions.update_one(
            {"stripe_subscription_id": sub["stripe_subscription_id"]},
            {"$set": {"status": SubscriptionStatus.CANCELED, "cancel_at_period_end": False, "updated_at": datetime.utcnow()}},
        )
        await db.users.update_one({"id": user.id}, {"$set": {"plan": PlanTier.FREE}})

    return {"ok": True}


@router.post("/reactivate")
async def reactivate_subscription(user: User = Depends(get_current_user)):
    db = await get_db()
    sub = await db.subscriptions.find_one({"user_id": user.id, "cancel_at_period_end": True}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="No canceled subscription found to reactivate")

    stripe.Subscription.modify(sub["stripe_subscription_id"], cancel_at_period_end=False)
    await db.subscriptions.update_one(
        {"stripe_subscription_id": sub["stripe_subscription_id"]},
        {"$set": {"cancel_at_period_end": False, "updated_at": datetime.utcnow()}},
    )

    return {"ok": True}


@router.post("/downgrade")
async def downgrade_plan(req: DowngradeRequest, user: User = Depends(get_current_user)):
    db = await get_db()
    sub = await db.subscriptions.find_one({"user_id": user.id, "status": {"$ne": SubscriptionStatus.CANCELED}}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found")

    plan_details = next((p for p in PLAN_DETAILS if p["tier"] == req.plan), None)
    if not plan_details:
        raise HTTPException(status_code=400, detail="Invalid plan")

    # Schedule downgrade at period end
    stripe.Subscription.modify(
        sub["stripe_subscription_id"],
        cancel_at_period_end=True,
        items=[{"price": PLAN_PRICES.get(req.plan) or "price_free"}]
    )

    await db.users.update_one(
        {"id": user.id},
        {"$set": {"downgraded_to": req.plan, "credits": plan_details["credits"]}}
    )

    return {"ok": True, "message": f"Downgraded to {plan_details['name']} at period end"}


@router.get("/usage", response_model=UsageResponse)
async def get_usage(user: User = Depends(get_current_user)):
    db = await get_db()

    sub = await db.subscriptions.find_one(
        {"user_id": user.id, "status": {"$ne": SubscriptionStatus.CANCELED}}, {"_id": 0}
    )

    credits_remaining = user.credits
    period_start = None
    period_end = None

    if sub:
        period_start = sub.get("current_period_start")
        period_end = sub.get("current_period_end")

    start_filter = {}
    if period_start:
        start_filter["created_at"] = {"$gte": period_start}
    if period_end:
        start_filter.setdefault("created_at", {})["$lte"] = period_end

    builds_pipeline = [
        {"$match": {"user_id": user.id, **start_filter}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    builds_count = 0
    async for doc in db.builds.aggregate(builds_pipeline):
        builds_count += doc.get("count", 0)

    credits_used_pipeline = [
        {"$match": {"user_id": user.id, **start_filter}},
        {"$group": {"_id": None, "total": {"$sum": "$credits_used"}}},
    ]
    credits_used = 0
    async for doc in db.builds.aggregate(credits_used_pipeline):
        credits_used = doc.get("total", 0)

    agents_runs: Dict[str, int] = {}
    agents_pipeline = [
        {"$match": {"user_id": user.id, **start_filter}},
        {"$unwind": "$agents"},
        {"$group": {"_id": "$agents.agent", "count": {"$sum": 1}}},
    ]
    async for doc in db.builds.aggregate(agents_pipeline):
        agent = doc.get("_id", "unknown")
        agents_runs[agent] = doc.get("count", 0)

    return UsageResponse(
        period_start=period_start,
        period_end=period_end,
        credits_used=credits_used,
        credits_remaining=credits_remaining,
        builds_count=builds_count,
        agents_runs=agents_runs,
    )


@router.post("/webhook/payment")
async def handle_payment_webhook(request: Request, stripe_signature: str = Header(...)):
    """Handle payment success/failure for credit purchases."""
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook")
    
    db = await get_db()
    
    if event["type"] == "payment_intent.succeeded":
        intent = event["data"]["object"]
        purchase = await db.credit_purchases.find_one({"stripe_payment_intent_id": intent["id"]}, {"_id": 0})
        if purchase:
            user_id = purchase.get("user_id")
            credits = purchase.get("credits", 0)
            
            await db.credit_purchases.update_one(
                {"stripe_payment_intent_id": intent["id"]},
                {"$set": {"status": "completed"}}
            )
            
            await db.users.update_one(
                {"id": user_id},
                {"$inc": {"credits": credits}}
            )
    
    return {"status": "ok"}