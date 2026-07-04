"""Celery tasks for the Agile PM layer: plan generation, task execution, and
the decision engine. Mirrors tasks/build_tasks.py's conventions (single
long-lived event loop per worker process, no blind autoretry on
non-idempotent work, soft time limit as a stuck-pipeline backstop)."""

import asyncio
import logging
from datetime import datetime
from typing import Optional

from celery_app import celery_app as current_app
from core.config import get_settings
from core.database import get_db
from core.pm_orchestrator import PMOrchestrator
from core.pm_models import (
    Initiative, InitiativeStatus, Task, TaskStatus, AgentExecution, AgentExecStatus,
    DecisionLogEntry, RiskReport,
)
from core.pm_models import PMWSEvent, PMWSEventType
from agents.task_executor import TaskExecutorAgent
from agents.decision_engine import DecisionEngineAgent
from services.pm_ws_manager import pm_manager
from services.pm_notifications import notify_agent_finished, notify_task_blocked, notify

settings = get_settings()
logger = logging.getLogger(__name__)

pm_orchestrator = PMOrchestrator()
task_executor = TaskExecutorAgent()
decision_engine = DecisionEngineAgent()

_worker_loop: Optional[asyncio.AbstractEventLoop] = None


def _run_async(coro):
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
    return _worker_loop.run_until_complete(coro)


class PMTask(current_app.Task):
    """No autoretry: none of these jobs are safely re-runnable from scratch
    (generation would re-call every LLM stage again; task execution would
    silently discard/redo real generated output) -- see the identical
    reasoning on BuildTask in tasks/build_tasks.py."""

    retry_kwargs = {"max_retries": 0}
    acks_late = True


@current_app.task(
    bind=True, base=PMTask,
    name="backend.tasks.pm_tasks.generate_initiative_plan",
    soft_time_limit=settings.build_timeout,
    time_limit=settings.build_timeout + 30,
)
def generate_initiative_plan(self, initiative_id: str) -> dict:
    async def _run():
        db = await get_db()
        doc = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
        if not doc:
            raise ValueError(f"Initiative {initiative_id} not found")

        initiative = Initiative(**doc)
        initiative.status = InitiativeStatus.GENERATING
        await db.initiatives.update_one({"id": initiative_id}, {"$set": {"status": initiative.status.value}})

        async def emit(event: PMWSEvent) -> None:
            await pm_manager.emit(event)

        try:
            result = await pm_orchestrator.generate_plan(initiative, emit=emit)

            initiative = result["initiative"]
            initiative.updated_at = datetime.utcnow()
            await db.initiatives.update_one(
                {"id": initiative_id}, {"$set": initiative.model_dump()}
            )
            await db.prds.insert_one(result["prd"].model_dump())
            if result["epics"]:
                await db.epics.insert_many([e.model_dump() for e in result["epics"]])
            if result["stories"]:
                await db.stories.insert_many([s.model_dump() for s in result["stories"]])
            if result["tasks"]:
                await db.tasks.insert_many([t.model_dump() for t in result["tasks"]])
            if result["sprints"]:
                await db.sprints.insert_many([sp.model_dump() for sp in result["sprints"]])

            return {"status": "success", "initiative_id": initiative_id}

        except Exception as e:
            logger.exception("Initiative plan generation failed for %s", initiative_id)
            await db.initiatives.update_one(
                {"id": initiative_id},
                {"$set": {"status": InitiativeStatus.FAILED.value, "generation_error": str(e)}},
            )
            await pm_manager.emit(PMWSEvent(
                type=PMWSEventType.GENERATION_FAILED,
                initiative_id=initiative_id,
                data={"error": str(e)[:2000]},
            ))
            await notify(db, initiative.user_id, "Plan generation failed", str(e)[:280], type="error")
            raise

    return _run_async(_run())


@current_app.task(
    bind=True, base=PMTask,
    name="backend.tasks.pm_tasks.execute_task",
    soft_time_limit=settings.build_timeout,
    time_limit=settings.build_timeout + 30,
)
def execute_task(self, task_id: str, user_id: str) -> dict:
    async def _run():
        db = await get_db()
        task_doc = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        if not task_doc:
            raise ValueError(f"Task {task_id} not found")
        task = Task(**task_doc)

        story = await db.stories.find_one({"id": task.story_id}, {"_id": 0})
        epic = await db.epics.find_one({"id": task.epic_id}, {"_id": 0})
        initiative = await db.initiatives.find_one({"id": task.initiative_id}, {"_id": 0})

        existing_files: dict = {}
        project_ids = (initiative or {}).get("project_ids") or []
        if project_ids:
            latest_build = await db.builds.find_one(
                {"project_id": project_ids[0], "status": "success"}, {"_id": 0}, sort=[("created_at", -1)]
            )
            if latest_build:
                files = await db.build_files.find(
                    {"build_id": latest_build["id"]}, {"_id": 0, "path": 1, "content": 1}
                ).to_list(None)
                existing_files = {f["path"]: f["content"] for f in files}

        context = {
            "vision": (initiative or {}).get("vision"),
            "tech_stack": (initiative or {}).get("tech_stack"),
            "epic_title": (epic or {}).get("title"),
            "story_title": (story or {}).get("title"),
            "acceptance_criteria": (story or {}).get("acceptance_criteria"),
            "existing_files": existing_files,
        }

        execution = AgentExecution(
            task_id=task_id, initiative_id=task.initiative_id, agent=task.assigned_agent,
            status=AgentExecStatus.RUNNING, started_at=datetime.utcnow(),
        )
        await db.agent_executions.insert_one(execution.model_dump())
        await pm_manager.emit(PMWSEvent(
            type=PMWSEventType.AGENT_EXEC_START, initiative_id=task.initiative_id,
            data={"task_id": task_id, "execution_id": execution.id, "agent": task.assigned_agent.value},
        ))

        started_at = task.started_at or datetime.utcnow()
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"status": TaskStatus.IN_PROGRESS.value, "started_at": started_at, "updated_at": datetime.utcnow()}},
        )
        await pm_manager.emit(PMWSEvent(
            type=PMWSEventType.TASK_STATUS_CHANGED, initiative_id=task.initiative_id,
            data={"task_id": task_id, "status": TaskStatus.IN_PROGRESS.value},
        ))

        try:
            result = await task_executor.execute(
                task.model_dump(), context, user_id=user_id, initiative_id=task.initiative_id,
            )
            usage = result.get("_usage", {}) or {}
            files = result.get("files", {}) or {}
            completed_at = datetime.utcnow()
            duration = (completed_at - execution.started_at).total_seconds() if execution.started_at else 0.0

            await db.agent_executions.update_one(
                {"id": execution.id},
                {"$set": {
                    "status": AgentExecStatus.COMPLETED.value,
                    "current_thought": result.get("summary", ""),
                    "progress": 100,
                    "logs": [result.get("summary", ""), result.get("notes", "")],
                    "generated_files": list(files.keys()),
                    "cost_usd": usage.get("cost_usd", 0.0),
                    "tokens_used": usage.get("total_tokens", 0),
                    "completed_at": completed_at,
                    "duration_seconds": duration,
                }},
            )
            await db.tasks.update_one(
                {"id": task_id},
                {"$set": {
                    "status": TaskStatus.CODE_REVIEW.value,
                    "generated_files": list(files.keys()),
                    "completed_at": completed_at,
                    "updated_at": completed_at,
                }},
            )
            await pm_manager.emit(PMWSEvent(
                type=PMWSEventType.AGENT_EXEC_COMPLETE, initiative_id=task.initiative_id,
                data={"task_id": task_id, "execution_id": execution.id, "files": list(files.keys())},
            ))
            await pm_manager.emit(PMWSEvent(
                type=PMWSEventType.TASK_STATUS_CHANGED, initiative_id=task.initiative_id,
                data={"task_id": task_id, "status": TaskStatus.CODE_REVIEW.value},
            ))
            if user_id:
                await notify_agent_finished(db, user_id, task.title, task.assigned_agent.value)

            run_decision_engine.delay(task_id, "task_completed")
            return {"status": "success", "task_id": task_id, "execution_id": execution.id}

        except Exception as e:
            logger.exception("Task execution failed for %s", task_id)
            await db.agent_executions.update_one(
                {"id": execution.id},
                {"$set": {"status": AgentExecStatus.FAILED.value, "error": str(e)[:2000], "completed_at": datetime.utcnow()}},
            )
            await db.tasks.update_one(
                {"id": task_id}, {"$set": {"status": TaskStatus.BLOCKED.value, "updated_at": datetime.utcnow()}},
            )
            await pm_manager.emit(PMWSEvent(
                type=PMWSEventType.AGENT_EXEC_FAILED, initiative_id=task.initiative_id,
                data={"task_id": task_id, "execution_id": execution.id, "error": str(e)[:2000]},
            ))
            await pm_manager.emit(PMWSEvent(
                type=PMWSEventType.TASK_STATUS_CHANGED, initiative_id=task.initiative_id,
                data={"task_id": task_id, "status": TaskStatus.BLOCKED.value},
            ))
            if user_id:
                await notify_task_blocked(db, user_id, task.title, reason="the assigned agent hit an error")
            raise

    return _run_async(_run())


@current_app.task(name="backend.tasks.pm_tasks.run_decision_engine")
def run_decision_engine(task_id: str, event: str) -> dict:
    """Best-effort: re-estimates/risk detection/next-task recommendations are
    a helpful nudge, not a correctness-critical path, so failures here are
    logged and swallowed rather than raised (mirrors credit_alerts.py's
    fail-open posture for non-critical background work)."""

    async def _run():
        db = await get_db()
        try:
            task_doc = await db.tasks.find_one({"id": task_id}, {"_id": 0})
            if not task_doc:
                return {"status": "skipped"}

            initiative_id = task_doc["initiative_id"]
            sprint = None
            if task_doc.get("sprint_id"):
                sprint = await db.sprints.find_one({"id": task_doc["sprint_id"]}, {"_id": 0})
                sibling_tasks = await db.tasks.find({"sprint_id": task_doc["sprint_id"]}, {"_id": 0}).to_list(None)
            else:
                sibling_tasks = await db.tasks.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(200)

            initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0, "user_id": 1})
            user_id = (initiative or {}).get("user_id")

            decision = await decision_engine.decide(
                event, sprint, sibling_tasks, user_id=user_id, initiative_id=initiative_id,
            )

            actions = []
            for re_est in decision.get("re_estimates", []) or []:
                title = re_est.get("task_title")
                hours = re_est.get("new_estimated_hours")
                if title and isinstance(hours, (int, float)):
                    await db.tasks.update_one(
                        {"initiative_id": initiative_id, "title": title},
                        {"$set": {"estimated_hours": hours, "updated_at": datetime.utcnow()}},
                    )
                    actions.append(f"Re-estimated '{title}' to {hours}h")

            risks = decision.get("risks", []) or []
            if risks:
                await db.risk_reports.insert_one(RiskReport(
                    initiative_id=initiative_id,
                    sprint_id=task_doc.get("sprint_id"),
                    risks=risks,
                ).model_dump())
                actions.extend(f"Flagged risk: {r.get('description', '')}" for r in risks)
                high = [r for r in risks if r.get("severity") == "high"]
                if high and user_id:
                    await notify(db, user_id, "New risk detected", high[0].get("description", "")[:280], type="warning")

            await db.decision_log.insert_one(DecisionLogEntry(
                initiative_id=initiative_id, task_id=task_id, trigger=event, actions=actions,
            ).model_dump())

            await pm_manager.emit(PMWSEvent(
                type=PMWSEventType.DECISION_MADE, initiative_id=initiative_id,
                data={
                    "task_id": task_id, "summary": decision.get("summary", ""),
                    "recommended_next_tasks": decision.get("recommended_next_tasks", []),
                    "bottlenecks": decision.get("bottlenecks", []),
                },
            ))
            return {"status": "success"}
        except Exception:
            logger.exception("Decision engine run failed for task %s", task_id)
            return {"status": "error"}

    return _run_async(_run())
