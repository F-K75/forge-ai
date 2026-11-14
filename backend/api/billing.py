from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import httpx
import stripe

from core.config import get_settings
from core.models import User, PlanTier, Subscription, CreditPurchase, SubscriptionStatus, AuditLog, PaginationParams, utcnow
from core.database import get_db, paginated_query
from core.cache import cached_read, PLANS_CACHE_KEY, PLANS_CACHE_TTL
from api.auth import get_current_user
from services.credit_alerts import reset_credit_alerts
from api.razorpay import create_rzp_order, _require_razorpay, get_razorpay_client
from api.cashfree import (
    create_cashfree_order,
    CashfreeOrderRequest,
    require_cashfree,
    _cashfree_plan_id as _cf_plan_id,
)

settings = get_settings()
stripe.api_key = settings.stripe_secret_key
BILLING_PROVIDER = settings.billing_provider or "stripe"

# Actor identity for audit_logs entries written by Stripe webhook handlers --
# these are system-triggered changes, not made by a logged-in human, so
# there's no real user to attribute them to as the actor (see BE-017).
_STRIPE_WEBHOOK_ACTOR_ID = "stripe_webhook"
_STRIPE_WEBHOOK_ACTOR_EMAIL = "system+stripe-webhook@forge.internal"


async def _log_billing_event(db: Any, action: str, user_id: Optional[str], changes: Dict[str, Any]) -> None:
    """Audit-log a billing state change driven by a Stripe webhook.

    Billing webhook handlers grant credits and change plans/subscription
    status with real business consequences, but previously had zero audit
    trail -- unlike admin-initiated credit/plan changes, which were already
    logged (see api/admin.py). Fixed as BE-017.
    """
    audit_log = AuditLog(
        actor_id=_STRIPE_WEBHOOK_ACTOR_ID,
        actor_email=_STRIPE_WEBHOOK_ACTOR_EMAIL,
        action=action,
        resource_type="user",
        resource_id=user_id,
        changes=changes,
    )
    await db.audit_logs.insert_one(audit_log.model_dump())

settings = get_settings()
stripe.api_key = settings.stripe_secret_key

router = APIRouter(prefix="/billing", tags=["billing"])

# Sourced from settings (STRIPE_PRICE_* env vars) rather than hardcoded, so
# real Stripe price IDs can be set per-environment without a code change
# (PROD-022) -- the settings defaults are still non-functional placeholders.
PLAN_PRICES: Dict[PlanTier, str] = {
    PlanTier.FREE: "price_free",
    PlanTier.STANDARD: settings.stripe_price_standard_monthly,
    PlanTier.PRO: settings.stripe_price_pro_monthly,
    PlanTier.ENTERPRISE: settings.stripe_price_enterprise_monthly,
}

ANNUAL_PLAN_PRICES: Dict[PlanTier, str] = {
    PlanTier.STANDARD: settings.stripe_price_standard_annual,
    PlanTier.PRO: settings.stripe_price_pro_annual,
    PlanTier.ENTERPRISE: settings.stripe_price_enterprise_annual,
    PlanTier.FREE: "price_free",
}

# The single source of truth for plans: what /billing/plans shows, what a
# subscription grants, and the project limits enforced in api/projects.py and
# api/initiatives.py. Prices and credits come from core/config.py so this
# table, the config and the marketing pages can't drift apart again.
# Stripe/Razorpay/Cashfree charge whatever their configured price IDs say;
# keep those prices in step with this table.
# max_projects: -1 means unlimited. Annual price = 10x monthly (2 months free).
PLAN_DETAILS = [
    {
        "tier": PlanTier.FREE,
        "name": "Free",
        "price_id": "price_free",
        "price_monthly": 0,
        "price_annual": 0,
        # One-time signup grant (not monthly); the first build is also free.
        "credits": settings.free_credits,
        "features": [
            f"{settings.free_credits} credits at signup",
            "First build free",
            "1 project",
            "Community support",
        ],
        "max_projects": 1,
    },
    {
        "tier": PlanTier.STANDARD,
        "name": "Standard",
        "price_id": settings.stripe_price_standard_monthly,
        "price_annual_id": settings.stripe_price_standard_annual,
        "price_monthly": settings.standard_monthly_price,
        "price_annual": settings.standard_monthly_price * 10,
        "credits": settings.standard_credits,
        "features": [
            f"{settings.standard_credits} credits/month",
            "Unlimited projects",
            "All agents",
            "Email support",
        ],
        "max_projects": -1,
    },
    {
        "tier": PlanTier.PRO,
        "name": "Pro",
        "price_id": settings.stripe_price_pro_monthly,
        "price_annual_id": settings.stripe_price_pro_annual,
        "price_monthly": settings.pro_monthly_price,
        "price_annual": settings.pro_monthly_price * 10,
        "credits": settings.pro_credits,
        "features": [
            f"{settings.pro_credits} credits/month",
            "Unlimited projects",
            "All agents",
            "Bring your own LLM key (BYOK)",
            "Priority support",
        ],
        "max_projects": -1,
    },
    {
        # Custom pricing: the pages show "Custom" and "Contact us" instead of a
        # price. The price IDs stay so existing Enterprise subscriptions keep
        # working; credits are what such a subscription is granted.
        "tier": PlanTier.ENTERPRISE,
        "name": "Enterprise",
        "price_id": settings.stripe_price_enterprise_monthly,
        "price_annual_id": settings.stripe_price_enterprise_annual,
        "price_monthly": 0,
        "price_annual": 0,
        "custom_pricing": True,
        "credits": 5000,
        "features": [
            "Custom pricing and credit volume",
            "Unlimited projects",
            "All agents",
            "Bring your own LLM key (BYOK)",
            "Dedicated support",
        ],
        "max_projects": -1,
    },
]

CREDIT_PACKAGES = [
    {"credits": 100, "price_usd": 10, "price_inr": 850, "id": "credits_100"},
    {"credits": 500, "price_usd": 40, "price_inr": 3400, "id": "credits_500"},
    {"credits": 1000, "price_usd": 70, "price_inr": 5950, "id": "credits_1000"},
    {"credits": 5000, "price_usd": 250, "price_inr": 21250, "id": "credits_5000"},
]


def _package_amount_paise(package: Dict[str, Any]) -> int:
    """Return credit package price in INR paise, falling back from USD if needed."""
    price_inr = package.get("price_inr")
    if price_inr is None:
        price_inr = int(package["price_usd"]) * 85
    return int(price_inr) * 100


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


class PaginatedInvoices(BaseModel):
    invoices: List[InvoiceResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


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
    projects_count: int = 0
    max_projects: int = 0


class PlanResponse(BaseModel):
    tier: str
    name: str
    price_id: str
    price_monthly: int
    price_annual: int
    credits: int
    features: List[str]
    max_projects: int
    # True for Enterprise: show "Custom" / "Contact us" instead of a price.
    custom_pricing: bool = False


@router.post("/checkout", response_model=Dict[str, Any])
async def create_checkout_session(req: CheckoutRequest, user: User = Depends(get_current_user)):
    db = await get_db()

    if req.plan == PlanTier.FREE:
        raise HTTPException(status_code=400, detail="Cannot checkout for free plan")

    if BILLING_PROVIDER == "cashfree":
        return await create_cashfree_order(req, user)

    if BILLING_PROVIDER == "razorpay":
        return await _razorpay_checkout(req, user)

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
    try:
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
    except stripe.StripeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Payment provider error: {exc.user_message or str(exc)}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Failed to create checkout session.",
        ) from exc

    return {"url": checkout_session.url, "id": checkout_session.id}


async def _razorpay_checkout(req: CheckoutRequest, user: User):
    _require_razorpay()
    db = await get_db()
    plan_details = next((p for p in PLAN_DETAILS if p["tier"] == req.plan), None)
    if not plan_details:
        raise HTTPException(status_code=400, detail="Invalid plan")

    interval = req.interval or "monthly"
    plan_id = _razorpay_plan_id(plan_details["tier"], interval)
    if not plan_id:
        raise HTTPException(status_code=400, detail="Plan not configured for Razorpay")

    sub = get_razorpay_client().subscription.create({
        "plan_id": plan_id,
        "customer_notify": 1,
        "notes": {"user_id": user.id, "plan": req.plan},
    })

    subscription = Subscription(
        user_id=user.id,
        razorpay_subscription_id=sub["id"],
        razorpay_plan_id=plan_id,
        plan=plan_details["tier"],
        status=SubscriptionStatus.PENDING,
        provider="razorpay",
    )
    await db.subscriptions.replace_one({"razorpay_subscription_id": sub["id"]}, subscription.model_dump(), upsert=True)

    authorization_url = sub.get("short_url") or sub.get("authorized_url") or ""
    return {"url": authorization_url, "id": sub["id"], "provider": "razorpay"}


def _razorpay_plan_id(tier: PlanTier, interval: str) -> Optional[str]:
    mapping = {
        (PlanTier.STANDARD, "monthly"): settings.razorpay_standard_monthly_plan_id,
        (PlanTier.PRO, "monthly"): settings.razorpay_pro_monthly_plan_id,
        (PlanTier.ENTERPRISE, "monthly"): settings.razorpay_enterprise_monthly_plan_id,
        (PlanTier.STANDARD, "annual"): settings.razorpay_standard_annual_plan_id,
        (PlanTier.PRO, "annual"): settings.razorpay_pro_annual_plan_id,
        (PlanTier.ENTERPRISE, "annual"): settings.razorpay_enterprise_annual_plan_id,
    }
    return mapping.get((tier, interval))


@router.get("/razorpay/plans", response_model=List[PlanResponse])
async def list_razorpay_plans():
    return await cached_read(PLANS_CACHE_KEY, PLANS_CACHE_TTL, _build_plans)


async def _build_plans():
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
            custom_pricing=p.get("custom_pricing", False),
        ).model_dump()
        for p in PLAN_DETAILS
    ]


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
        await db.users.update_one({"id": user_id}, {"$set": {"plan": plan_tier}})
        await _log_billing_event(
            db, "stripe_checkout_completed", user_id,
            {"subscription_id": subscription_id, "plan": plan_tier, "credits_granted": plan_details["credits"]},
        )
        await reset_credit_alerts(db, user_id)


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
            "updated_at": utcnow(),
        }},
    )

    sub_doc = await db.subscriptions.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0, "user_id": 1})
    if sub_doc:
        plan_details = next((p for p in PLAN_DETAILS if p["tier"] == plan_tier), None)
        if plan_details:
            await db.users.update_one({"id": sub_doc["user_id"]}, {"$set": {"plan": plan_tier}})
        await _log_billing_event(
            db, "stripe_subscription_updated", sub_doc["user_id"],
            {"subscription_id": subscription_id, "plan": plan_tier, "status": sub["status"]},
        )


async def handle_subscription_deleted(db: Any, sub: Dict[str, Any]):
    subscription_id = sub["id"]
    await db.subscriptions.update_one(
        {"stripe_subscription_id": subscription_id},
        {"$set": {"status": SubscriptionStatus.CANCELED, "updated_at": utcnow()}},
    )

    sub_doc = await db.subscriptions.find_one({"stripe_subscription_id": subscription_id}, {"_id": 0, "user_id": 1})
    if sub_doc:
        await db.users.update_one({"id": sub_doc["user_id"]}, {"$set": {"plan": PlanTier.FREE}})
        await _log_billing_event(
            db, "stripe_subscription_deleted", sub_doc["user_id"],
            {"subscription_id": subscription_id, "downgraded_to": PlanTier.FREE},
        )


async def handle_invoice_payment_succeeded(db: Any, invoice: Dict[str, Any]):
    stripe_invoice_id = invoice["id"]
    await db.invoices.update_one(
        {"stripe_invoice_id": stripe_invoice_id},
        {"$set": {"status": "paid"}},
    )
    invoice_doc = await db.invoices.find_one({"stripe_invoice_id": stripe_invoice_id}, {"_id": 0, "user_id": 1})
    await _log_billing_event(
        db, "stripe_invoice_payment_succeeded", invoice_doc["user_id"] if invoice_doc else None,
        {"stripe_invoice_id": stripe_invoice_id},
    )


async def handle_invoice_payment_failed(db: Any, invoice: Dict[str, Any]):
    stripe_invoice_id = invoice["id"]
    await db.invoices.update_one(
        {"stripe_invoice_id": stripe_invoice_id},
        {"$set": {"status": "payment_failed"}},
    )
    invoice_doc = await db.invoices.find_one({"stripe_invoice_id": stripe_invoice_id}, {"_id": 0, "user_id": 1})
    await _log_billing_event(
        db, "stripe_invoice_payment_failed", invoice_doc["user_id"] if invoice_doc else None,
        {"stripe_invoice_id": stripe_invoice_id},
    )


_PRICE_TO_PLAN: Dict[str, PlanTier] = {}
_PRICE_TO_PLAN.update({pid: plan for plan, pid in PLAN_PRICES.items()})
_PRICE_TO_PLAN.update({pid: plan for plan, pid in ANNUAL_PLAN_PRICES.items()})


def _map_price_to_plan(price_id: str) -> PlanTier:
    return _PRICE_TO_PLAN.get(price_id, PlanTier.FREE)


async def get_max_projects_for_user(db, user_id: str) -> int:
    user = await db.users.find_one({"id": user_id}, {"plan": 1})
    if not user:
        return 0
    plan = user.get("plan", PlanTier.FREE)
    plan_details = next((p for p in PLAN_DETAILS if p["tier"] == plan), None)
    return plan_details.get("max_projects", 0) if plan_details else 0


@router.get("/provider")
async def get_billing_provider():
    return {"provider": BILLING_PROVIDER}


@router.get("/subscription", response_model=Optional[SubscriptionResponse])
async def get_subscription(user: User = Depends(get_current_user)):
    db = await get_db()
    sub = await db.subscriptions.find_one({"user_id": user.id, "status": {"$ne": SubscriptionStatus.CANCELED}}, {"_id": 0})
    if not sub:
        return None
    return sub


@router.get("/invoices", response_model=PaginatedInvoices)
async def list_invoices(
    user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()
    result = await paginated_query(
        db.invoices,
        {"user_id": user.id},
        page=params.page,
        per_page=params.per_page,
        sort=[("created_at", -1)],
    )
    return PaginatedInvoices(
        invoices=result.items,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


@router.post("/credits/purchase", response_model=Dict[str, Any])
async def create_credit_purchase(req: CreditPurchaseRequest, user: User = Depends(get_current_user)):
    db = await get_db()

    package = next((p for p in CREDIT_PACKAGES if p["id"] == req.package_id), None)
    if not package:
        raise HTTPException(status_code=400, detail="Invalid credit package")

    if BILLING_PROVIDER == "cashfree":
        return await _cashfree_credit_purchase(req, package, user)

    if BILLING_PROVIDER == "razorpay":
        return await _razorpay_credit_purchase(req, package, user)

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
        currency="usd",
        status="pending",
        provider="stripe",
    )
    await db.credit_purchases.insert_one(purchase.model_dump())

    return {
        "client_secret": payment_intent.client_secret,
        "payment_intent_id": payment_intent.id,
        "amount": payment_intent.amount,
        "currency": payment_intent.currency,
    }


async def _razorpay_credit_purchase(req: CreditPurchaseRequest, package: Dict[str, Any], user: User):
    _require_razorpay()
    db = await get_db()
    amount_paise = _package_amount_paise(package)
    order = await create_rzp_order({"amount": amount_paise, "currency": "INR", "receipt": f"credits_{user.id}_{req.package_id}", "notes": {"user_id": user.id, "credits": str(package["credits"]), "package_id": req.package_id}})

    purchase = CreditPurchase(
        user_id=user.id,
        razorpay_order_id=order["order_id"],
        credits=package["credits"],
        amount=amount_paise,
        currency="INR",
        status="pending",
        provider="razorpay",
    )
    await db.credit_purchases.insert_one(purchase.model_dump())
    return {"order_id": order["order_id"], "amount": order["amount"], "currency": order["currency"], "key_id": settings.razorpay_key_id}


async def _cashfree_credit_purchase(req: CreditPurchaseRequest, package: Dict[str, Any], user: User):
    require_cashfree()
    db = await get_db()
    amount_paise = _package_amount_paise(package)
    order = await create_cashfree_order(
        CashfreeOrderRequest(
            amount=amount_paise,
            currency="INR",
            receipt=f"credits_{user.id}_{req.package_id}",
            notes={"user_id": user.id, "credits": str(package["credits"]), "package_id": req.package_id},
        ),
        current_user=user,
    )

    purchase = CreditPurchase(
        user_id=user.id,
        cashfree_order_id=order["order_id"],
        cashfree_order_token=order.get("order_token"),
        credits=package["credits"],
        amount=amount_paise,
        currency="INR",
        status="pending",
        provider="cashfree",
    )
    await db.credit_purchases.insert_one(purchase.model_dump())
    return order


@router.get("/plans", response_model=List[PlanResponse])
async def list_plans():
    # Plan table is config-driven and effectively static per deploy, so cache
    # it for an hour (BE-007) to spare every pricing page load a rebuild. The
    # cache is fail-open: a Redis miss just rebuilds the list inline.
    async def _build_plans():
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
            custom_pricing=p.get("custom_pricing", False),
            ).model_dump()
            for p in PLAN_DETAILS
        ]

    return await cached_read(PLANS_CACHE_KEY, PLANS_CACHE_TTL, _build_plans)


@router.post("/cancel")
async def cancel_subscription(req: CancelSubscriptionRequest, user: User = Depends(get_current_user)):
    db = await get_db()
    sub = await db.subscriptions.find_one({"user_id": user.id, "status": {"$ne": SubscriptionStatus.CANCELED}}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription found")

    if sub.get("provider") == "cashfree":
        sub_id = sub.get("cashfree_subscription_id")
        if not sub_id:
            raise HTTPException(status_code=400, detail="Missing Cashfree subscription id")

        if req.at_period_end:
            await _cashfree_update_subscription(db, sub_id, {"status": "cancelled_at_end"})
            await db.subscriptions.update_one(
                {"cashfree_subscription_id": sub_id},
                {"$set": {"cancel_at_period_end": True, "updated_at": utcnow()}},
            )
        else:
            await _cashfree_cancel_subscription(db, sub_id)
            await db.subscriptions.update_one(
                {"cashfree_subscription_id": sub_id},
                {"$set": {"status": SubscriptionStatus.CANCELED, "cancel_at_period_end": False, "updated_at": utcnow()}},
            )
            await db.users.update_one({"id": user.id}, {"$set": {"plan": PlanTier.FREE}})
        return {"ok": True}

    if not sub.get("stripe_subscription_id"):
        raise HTTPException(status_code=400, detail="Unsupported subscription provider")

    if req.at_period_end:
        stripe.Subscription.modify(sub["stripe_subscription_id"], cancel_at_period_end=True)
        await db.subscriptions.update_one(
            {"stripe_subscription_id": sub["stripe_subscription_id"]},
            {"$set": {"cancel_at_period_end": True, "updated_at": utcnow()}},
        )
    else:
        stripe.Subscription.delete(sub["stripe_subscription_id"])
        await db.subscriptions.update_one(
            {"stripe_subscription_id": sub["stripe_subscription_id"]},
            {"$set": {"status": SubscriptionStatus.CANCELED, "cancel_at_period_end": False, "updated_at": utcnow()}},
        )
        await db.users.update_one({"id": user.id}, {"$set": {"plan": PlanTier.FREE}})

    return {"ok": True}


@router.post("/reactivate")
async def reactivate_subscription(user: User = Depends(get_current_user)):
    db = await get_db()
    sub = await db.subscriptions.find_one({"user_id": user.id, "cancel_at_period_end": True}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="No canceled subscription found to reactivate")

    if sub.get("provider") == "cashfree":
        sub_id = sub.get("cashfree_subscription_id")
        if not sub_id:
            raise HTTPException(status_code=400, detail="Missing Cashfree subscription id")
        await _cashfree_update_subscription(db, sub_id, {"status": "active"})
        await db.subscriptions.update_one(
            {"cashfree_subscription_id": sub_id},
            {"$set": {"cancel_at_period_end": False, "updated_at": utcnow()}},
        )
        return {"ok": True}

    if not sub.get("stripe_subscription_id"):
        raise HTTPException(status_code=400, detail="Unsupported subscription provider")

    stripe.Subscription.modify(sub["stripe_subscription_id"], cancel_at_period_end=False)
    await db.subscriptions.update_one(
        {"stripe_subscription_id": sub["stripe_subscription_id"]},
        {"$set": {"cancel_at_period_end": False, "updated_at": utcnow()}},
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

    if sub.get("provider") == "cashfree":
        sub_id = sub.get("cashfree_subscription_id")
        if not sub_id:
            raise HTTPException(status_code=400, detail="Missing Cashfree subscription id")
        await _cashfree_update_subscription(db, sub_id, {"plan_id": _cf_plan_id(req.plan.value or req.plan)})
        await db.users.update_one(
            {"id": user.id},
            {"$set": {"downgraded_to": req.plan}}
        )
        return {"ok": True, "message": f"Downgraded to {plan_details['name']} at period end"}

    if not sub.get("stripe_subscription_id"):
        raise HTTPException(status_code=400, detail="Unsupported subscription provider")

    stripe.Subscription.modify(
        sub["stripe_subscription_id"],
        cancel_at_period_end=True,
        items=[{"price": PLAN_PRICES.get(req.plan) or "price_free"}]
    )

    await db.users.update_one(
        {"id": user.id},
        {"$set": {"downgraded_to": req.plan}}
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

    projects_count = await db.projects.count_documents(
        {"user_id": user.id, "deleted_at": None}
    )
    max_projects = await get_max_projects_for_user(db, user.id)

    return UsageResponse(
        period_start=period_start,
        period_end=period_end,
        credits_used=credits_used,
        credits_remaining=credits_remaining,
        builds_count=builds_count,
        agents_runs=agents_runs,
        projects_count=projects_count,
        max_projects=max_projects,
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
    await _handle_payment_event(db, event)
    return {"status": "ok"}


async def _handle_payment_event(db: Any, event: Dict[str, Any]) -> None:
    """Process a payment_intent event idempotently.

    Stripe retries webhooks automatically, so the handler must be safe to
    invoke multiple times for the same payment intent.
    """
    if event.get("type") != "payment_intent.succeeded":
        return

    intent = event["data"]["object"]
    purchase = await db.credit_purchases.find_one(
        {"stripe_payment_intent_id": intent["id"]}, {"_id": 0}
    )
    if not purchase or purchase.get("status") == "completed":
        return

    user_id = purchase.get("user_id")
    credits = purchase.get("credits", 0)

    result = await db.credit_purchases.update_one(
        {"stripe_payment_intent_id": intent["id"], "status": {"$ne": "completed"}},
        {"$set": {"status": "completed"}}
    )
    if result.modified_count == 0:
        return

    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"credits": credits}}
    )
    await _log_billing_event(
        db, "stripe_credit_purchase_completed", user_id,
        {"stripe_payment_intent_id": intent["id"], "credits_granted": credits},
    )
    await reset_credit_alerts(db, user_id)


# --- Cashfree helpers ---


async def _cashfree_update_subscription(db: Any, sub_id: str, payload: Dict[str, Any]) -> None:
    from api.cashfree import _require_cashfree, _CASHFREE_BASE_URL, _CASHFREE_HEADERS
    _require_cashfree()
    async with httpx.AsyncClient(base_url=_CASHFREE_BASE_URL, headers=_CASHFREE_HEADERS, timeout=15.0) as client:
        response = await client.post(f"/subscriptions/{sub_id}", json=payload)
        response.raise_for_status()


async def _cashfree_cancel_subscription(db: Any, sub_id: str) -> None:
    from api.cashfree import _require_cashfree, _CASHFREE_BASE_URL, _CASHFREE_HEADERS
    _require_cashfree()
    async with httpx.AsyncClient(base_url=_CASHFREE_BASE_URL, headers=_CASHFREE_HEADERS, timeout=15.0) as client:
        response = await client.post(f"/subscriptions/{sub_id}/cancel")
        response.raise_for_status()


@router.post("/webhook/cashfree")
async def cashfree_webhook(request: Request, x_cashfree_signature: str = Header(..., alias="X-Cashfree-Signature")):
    from api.cashfree import cashfree_webhook as _cf_webhook
    return await _cf_webhook(request, x_cashfree_signature=x_cashfree_signature)
