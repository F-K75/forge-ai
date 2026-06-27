from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api.builds import router as builds_router
from api.projects import router as projects_router
from core.database import close_connections


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_connections()


app = FastAPI(
    title="Forge API",
    description="AI-powered full-stack app builder",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(builds_router)
app.include_router(projects_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/integrations/playbooks")
async def list_playbooks():
    from agents.integration import IntegrationAgent
    return IntegrationAgent.get_available_playbooks()
