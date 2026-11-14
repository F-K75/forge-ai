"""Unit tests for backend/core/pm_orchestrator.py."""

from unittest.mock import AsyncMock

import pytest

from core.pm_models import (
    Initiative,
    InitiativeStatus,
    PMAgentRole,
    PMWSEvent,
    PMWSEventType,
    Priority,
    TaskCategory,
)
from core.pm_orchestrator import (
    DEFAULT_SPRINT_CAPACITY_HOURS,
    PMOrchestrator,
    _safe_enum,
    _safe_float,
    _safe_int,
    _safe_priority,
)


def _make_initiative(**overrides) -> Initiative:
    defaults = {
        "id": "init-1",
        "user_id": "user-1",
        "org_id": "org-1",
        "name": "Initial Name",
        "prompt": "Build an AI project tracker",
    }
    defaults.update(overrides)
    return Initiative(**defaults)


def _make_orchestrator() -> PMOrchestrator:
    orch = PMOrchestrator()
    orch.business_analyst = AsyncMock()
    orch.prd_writer = AsyncMock()
    orch.designer = AsyncMock()
    orch.epic_generator = AsyncMock()
    orch.story_generator = AsyncMock()
    orch.task_generator = AsyncMock()
    orch.sprint_planner = AsyncMock()
    return orch


@pytest.mark.asyncio
async def test_generate_plan_full_pipeline_success():
    orch = _make_orchestrator()
    initiative = _make_initiative()
    emitted: list[PMWSEvent] = []

    async def emit(event: PMWSEvent) -> None:
        emitted.append(event)

    orch.business_analyst.analyze.return_value = {
        "name": "Forge Tracker",
        "vision": "Ship faster with AI",
        "business_goals": ["Reduce cycle time"],
        "product_scope": "MVP web app",
        "functional_requirements": ["Auth", "Kanban"],
        "non_functional_requirements": ["99.9% uptime"],
        "success_metrics": ["DAU > 1000"],
        "roadmap": [{"phase": "1"}],
        "tech_stack": ["FastAPI", "React"],
        "risks": [{"description": "Scope creep"}],
        "estimated_timeline": "6 weeks",
    }
    orch.prd_writer.write.return_value = {
        "executive_summary": "Summary",
        "problem_statement": "Problem",
        "solution": "Solution",
        "unknown_llm_field": "ignored",
    }
    orch.designer.design.return_value = {"palette": "slate", "layout": "grid"}
    orch.epic_generator.generate.return_value = {
        "epics": [
            {
                "title": "Core Auth",
                "description": "Authentication",
                "priority": "p0",
                "story_points": 13,
                "estimated_duration": "1 week",
            },
            {
                "title": "Board UI",
                "description": "Kanban board",
                "priority": "invalid_priority",
                "story_points": "bad",
                "dependencies": ["Core Auth", "Nonexistent Epic"],
            },
        ]
    }
    orch.story_generator.generate.return_value = {
        "epics": [
            {
                "epic_index": 0,
                "stories": [
                    {
                        "title": "User Login",
                        "description": "JWT login",
                        "acceptance_criteria": ["Returns token"],
                        "definition_of_done": ["Tests pass"],
                        "priority": "p1",
                        "story_points": 5,
                        "business_value": "High",
                        "risk": "low",
                    },
                    {
                        "title": "Token Refresh",
                        "dependencies": ["User Login", "Ghost Story"],
                    },
                ],
            },
            {"epic_index": 99, "stories": [{"title": "Out of bounds"}]},
            {"epic_index": None, "stories": [{"title": "Missing index"}]},
        ]
    }
    orch.task_generator.generate.return_value = {
        "stories": [
            {
                "story_index": 0,
                "tasks": [
                    {
                        "title": "Create login endpoint",
                        "description": "POST /login",
                        "category": "backend",
                        "estimated_hours": 4.5,
                        "complexity": "low",
                        "required_skills": ["FastAPI"],
                        "assigned_agent": "backend_agent",
                    },
                    {
                        "title": "Write login tests",
                        "category": "unknown_cat",
                        "estimated_hours": "bad",
                        "assigned_agent": "unknown_agent",
                        "dependencies": ["Create login endpoint", "Missing Task"],
                    },
                ],
            },
            {"story_index": -1, "tasks": [{"title": "Negative index"}]},
        ]
    }
    orch.sprint_planner.plan.return_value = {
        "sprints": [
            {
                "sprint_number": 1,
                "name": "Sprint 1",
                "goal": "Auth MVP",
                "task_indexes": [0, 1, 999, "bad"],
                "capacity": 40,
                "velocity": 10,
                "story_points_planned": 8,
                "team_load": {"backend": 8},
                "agent_load": {"backend_agent": 8},
                "completion_probability": 0.9,
            }
        ]
    }

    result = await orch.generate_plan(initiative, emit=emit)

    assert result["initiative"].name == "Forge Tracker"
    assert result["initiative"].vision == "Ship faster with AI"
    assert result["initiative"].design == {"palette": "slate", "layout": "grid"}
    assert result["initiative"].status == InitiativeStatus.REVIEW

    assert result["prd"].executive_summary == "Summary"
    assert not hasattr(result["prd"], "unknown_llm_field")

    epics = result["epics"]
    assert len(epics) == 2
    assert epics[0].priority == Priority.P0
    assert epics[1].priority == Priority.P2
    assert epics[1].story_points == 0
    assert epics[1].dependencies == [epics[0].id]

    stories = result["stories"]
    assert len(stories) == 2
    assert stories[0].epic_id == epics[0].id
    assert stories[1].dependencies == [stories[0].id]

    tasks = result["tasks"]
    assert len(tasks) == 2
    assert tasks[0].category == TaskCategory.BACKEND
    assert tasks[0].assigned_agent == PMAgentRole.BACKEND
    assert tasks[0].estimated_hours == 4.5
    assert tasks[1].category == TaskCategory.BACKEND
    assert tasks[1].assigned_agent == PMAgentRole.BACKEND
    assert tasks[1].estimated_hours == 0.0
    assert tasks[1].dependencies == [tasks[0].id]

    sprints = result["sprints"]
    assert len(sprints) == 1
    assert sprints[0].task_ids == [tasks[0].id, tasks[1].id]
    assert tasks[0].sprint_id == sprints[0].id
    assert tasks[1].sprint_id == sprints[0].id

    orch.sprint_planner.plan.assert_awaited_once()
    assert orch.sprint_planner.plan.call_args.kwargs["capacity_hours"] == DEFAULT_SPRINT_CAPACITY_HOURS

    event_types = [e.type for e in emitted]
    assert event_types == [
        PMWSEventType.GENERATION_START,
        PMWSEventType.GENERATION_STAGE,
        PMWSEventType.GENERATION_STAGE,
        PMWSEventType.GENERATION_STAGE,
        PMWSEventType.EPICS_READY,
        PMWSEventType.STORIES_READY,
        PMWSEventType.TASKS_READY,
        PMWSEventType.SPRINT_PLAN_READY,
        PMWSEventType.GENERATION_COMPLETE,
    ]
    assert emitted[-1].data == {"epics": 2, "stories": 2, "tasks": 2, "sprints": 1}


@pytest.mark.asyncio
async def test_generate_plan_designer_failure_falls_back_to_empty_design():
    orch = _make_orchestrator()
    initiative = _make_initiative()
    emitted: list[PMWSEvent] = []

    async def emit(event: PMWSEvent) -> None:
        emitted.append(event)

    orch.business_analyst.analyze.return_value = {"vision": "V1"}
    orch.prd_writer.write.return_value = {"executive_summary": "Exec"}
    orch.designer.design.side_effect = RuntimeError("Designer LLM timeout")
    orch.epic_generator.generate.return_value = {"epics": []}

    result = await orch.generate_plan(initiative, emit=emit)

    assert result["initiative"].name == "Initial Name"
    assert result["initiative"].design == {}
    assert result["initiative"].status == InitiativeStatus.REVIEW
    assert result["epics"] == []
    assert result["stories"] == []
    assert result["tasks"] == []
    assert result["sprints"] == []

    orch.story_generator.generate.assert_not_awaited()
    orch.task_generator.generate.assert_not_awaited()
    orch.sprint_planner.plan.assert_not_awaited()
    assert emitted[-1].type == PMWSEventType.GENERATION_COMPLETE


@pytest.mark.asyncio
async def test_generate_plan_stage_failure_propagates_without_completion_event():
    orch = _make_orchestrator()
    initiative = _make_initiative()
    emitted: list[PMWSEvent] = []

    async def emit(event: PMWSEvent) -> None:
        emitted.append(event)

    orch.business_analyst.analyze.return_value = {"vision": "V1"}
    orch.prd_writer.write.side_effect = ValueError("PRD generation error")

    with pytest.raises(ValueError, match="PRD generation error"):
        await orch.generate_plan(initiative, emit=emit)

    event_types = [e.type for e in emitted]
    assert PMWSEventType.GENERATION_START in event_types
    assert PMWSEventType.GENERATION_COMPLETE not in event_types


@pytest.mark.asyncio
async def test_generate_plan_sprint_defaults_when_fields_missing():
    orch = _make_orchestrator()
    initiative = _make_initiative()

    async def emit(event: PMWSEvent) -> None:
        return None

    orch.business_analyst.analyze.return_value = {"vision": "V"}
    orch.prd_writer.write.return_value = {}
    orch.designer.design.return_value = {}
    orch.epic_generator.generate.return_value = {"epics": [{"title": "E1"}]}
    orch.story_generator.generate.return_value = {
        "epics": [{"epic_index": 0, "stories": [{"title": "S1"}]}]
    }
    orch.task_generator.generate.return_value = {
        "stories": [{"story_index": 0, "tasks": [{"title": "T1"}]}]
    }
    orch.sprint_planner.plan.return_value = {
        "sprints": [{"task_indexes": [0], "sprint_number": 0, "capacity": 0}]
    }

    result = await orch.generate_plan(initiative, emit=emit)
    sprint = result["sprints"][0]
    assert sprint.sprint_number == 1
    assert sprint.capacity == DEFAULT_SPRINT_CAPACITY_HOURS


def test_safe_helper_functions():
    assert _safe_priority("p0") == Priority.P0.value
    assert _safe_priority("invalid") == Priority.P2.value

    assert _safe_enum(TaskCategory, "frontend", TaskCategory.BACKEND) == TaskCategory.FRONTEND.value
    assert _safe_enum(TaskCategory, "nope", TaskCategory.BACKEND) == TaskCategory.BACKEND.value

    assert _safe_int("12") == 12
    assert _safe_int(None) == 0
    assert _safe_int("abc") == 0

    assert _safe_float("2.5") == 2.5
    assert _safe_float(None) == 0.0
    assert _safe_float("xyz") == 0.0
