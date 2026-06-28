from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api.builds import router as builds_router
from api.projects import router as projects_router
from api.auth import router as auth_router
from api.billing import router as billing_router
from api.admin import router as admin_router
from api.analytics import router as analytics_router
from api.marketplace import router as marketplace_router
from api.growth import router as growth_router
from core.database import close_connections
from core.config import get_settings
from core.security import rate_limit_middleware

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_connections()


app = FastAPI(
    title="Forge API",
    description="AI-powered full-stack app builder",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(",") if settings.allowed_origins else ["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(rate_limit_middleware)

app.include_router(auth_router)
app.include_router(builds_router)
app.include_router(projects_router)
app.include_router(billing_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(marketplace_router)
app.include_router(growth_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/integrations/playbooks")
async def list_playbooks():
    from agents.integration import IntegrationAgent
    return IntegrationAgent.get_available_playbooks()