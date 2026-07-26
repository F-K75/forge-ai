"""Versioned API routers (BE-004).

All production API routes are exposed under the ``/v1/`` prefix by including
each existing router with ``prefix="/v1"``.  The legacy root-level paths
(``/auth``, ``/builds``, …) are still registered in ``main.py`` so existing
clients do not break during the deprecation window, but every legacy route
returns a ``Deprecation`` header and a ``Link`` header pointing at the
canonical ``/v1/`` successor.
"""

from fastapi import APIRouter

from api.activity import router as activity_router
from api.admin import router as admin_router
from api.agent_executions import router as agent_executions_router
from api.agent_registry import router as agent_registry_router
from api.analytics import router as analytics_router
from api.api_keys import router as api_keys_router
from api.auth import router as auth_router
from api.billing import router as billing_router
from api.builds import router as builds_router
from api.deployments import router as deployments_router
from api.epics import router as epics_router
from api.gdpr import router as gdpr_router
from api.growth import router as growth_router
from api.initiatives import router as initiatives_router
from api.llm import router as llm_router
from api.marketplace import router as marketplace_router
from api.monitoring_webhook import router as monitoring_webhook_router
from api.planning import router as planning_router
from api.projects import router as projects_router
from api.prompts import router as prompts_router
from api.razorpay import router as razorpay_router
from api.releases import router as releases_router
from api.repo_memory import router as repo_memory_router
from api.sprints import router as sprints_router
from api.stories import router as stories_router
from api.support import router as support_router
from api.tasks import router as tasks_router
from api.webhooks import router as webhooks_router
from api.workload import router as workload_router


v1_router = APIRouter(prefix="/v1")

v1_router.include_router(activity_router)
v1_router.include_router(admin_router)
v1_router.include_router(agent_executions_router)
v1_router.include_router(agent_registry_router)
v1_router.include_router(analytics_router)
v1_router.include_router(api_keys_router)
v1_router.include_router(auth_router)
v1_router.include_router(billing_router)
v1_router.include_router(builds_router)
v1_router.include_router(deployments_router)
v1_router.include_router(epics_router)
v1_router.include_router(gdpr_router)
v1_router.include_router(growth_router)
v1_router.include_router(initiatives_router)
v1_router.include_router(llm_router)
v1_router.include_router(marketplace_router)
v1_router.include_router(monitoring_webhook_router)
v1_router.include_router(planning_router)
v1_router.include_router(projects_router)
v1_router.include_router(prompts_router)
v1_router.include_router(razorpay_router)
v1_router.include_router(releases_router)
v1_router.include_router(repo_memory_router)
v1_router.include_router(sprints_router)
v1_router.include_router(stories_router)
v1_router.include_router(support_router)
v1_router.include_router(tasks_router)
v1_router.include_router(webhooks_router)
v1_router.include_router(workload_router)
