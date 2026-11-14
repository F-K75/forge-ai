"""Unit tests for backend/tasks/pm_tasks.py."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.pm_models import (
    AgentExecStatus,
    Epic,
    Initiative,
    InitiativeStatus,
    PMAgentRole,
    PMWSEventType,
    PRD,
    Sprint,
    Story,
    Task,
    TaskStatus,
)
from tasks import pm_tasks


def _make_collection() -> MagicMock:
    col = MagicMock()
    col.find_one = AsyncMock(return_value=None)
    col.update_one = AsyncMock()
    col.insert_one = AsyncMock()
    col.insert_many = AsyncMock()
    col.delete_many = AsyncMock()
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    col.find = MagicMock(return_value=cursor)
    return col


def _make_mock_db() -> SimpleNamespace:
    return SimpleNamespace(
        initiatives=_make_collection(),
        prds=_make_collection(),
        epics=_make_collection(),
        stories=_make_collection(),
        tasks=_make_collection(),
        sprints=_make_collection(),
        builds=_make_collection(),
        build_files=_make_collection(),
        agent_executions=_make_collection(),
        risk_reports=_make_collection(),
        decision_log=_make_collection(),
    )


def test_pm_task_class_disables_autoretry_and_enables_acks_late():
    assert pm_tasks.PMTask.retry_kwargs == {"max_retries": 0}
    assert pm_tasks.PMTask.acks_late is True


def test_run_async_recreates_closed_loop(monkeypatch):
    closed_loop = asyncio.new_event_loop()
    closed_loop.close()
    monkeypatch.setattr(pm_tasks, "_worker_loop", closed_loop)

    async def _sample():
        return 42

    assert pm_tasks._run_async(_sample()) == 42
    assert pm_tasks._worker_loop is not None
    assert not pm_tasks._worker_loop.is_closed()


@pytest.mark.asyncio
async def test_replace_plan_artifacts_clears_and_inserts_non_empty_collections():
    db = _make_mock_db()
    prd = PRD(initiative_id="init-1", executive_summary="Exec")
    epic = Epic(initiative_id="init-1", title="E1")
    story = Story(epic_id=epic.id, initiative_id="init-1", title="S1")
    task = Task(story_id=story.id, epic_id=epic.id, initiative_id="init-1", title="T1")
    sprint = Sprint(initiative_id="init-1", sprint_number=1, task_ids=[task.id])

    await pm_tasks._replace_plan_artifacts(
        db,
        "init-1",
        {
            "prd": prd,
            "epics": [epic],
            "stories": [story],
            "tasks": [task],
            "sprints": [sprint],
        },
    )

    for col_name in pm_tasks.PLAN_ARTIFACT_COLLECTIONS:
        getattr(db, col_name).delete_many.assert_awaited_once_with({"initiative_id": "init-1"})

    db.prds.insert_one.assert_awaited_once()
    db.epics.insert_many.assert_awaited_once()
    db.stories.insert_many.assert_awaited_once()
    db.tasks.insert_many.assert_awaited_once()
    db.sprints.insert_many.assert_awaited_once()


@pytest.mark.asyncio
async def test_replace_plan_artifacts_skips_empty_lists():
    db = _make_mock_db()
    prd = PRD(initiative_id="init-1")

    await pm_tasks._replace_plan_artifacts(
        db,
        "init-1",
        {"prd": prd, "epics": [], "stories": [], "tasks": [], "sprints": []},
    )

    db.prds.insert_one.assert_awaited_once()
    db.epics.insert_many.assert_not_awaited()
    db.stories.insert_many.assert_not_awaited()
    db.tasks.insert_many.assert_not_awaited()
    db.sprints.insert_many.assert_not_awaited()


def test_generate_initiative_plan_not_found():
    db = _make_mock_db()
    db.initiatives.find_one.return_value = None

    with patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)):
        with pytest.raises(ValueError, match="Initiative missing-id not found"):
            pm_tasks.generate_initiative_plan("missing-id")


def test_generate_initiative_plan_success_merges_and_replaces_artifacts():
    db = _make_mock_db()
    initial_doc = {
        "id": "init-1",
        "user_id": "user-1",
        "name": "Old Name",
        "prompt": "Build app",
        "status": InitiativeStatus.DRAFT.value,
        "project_ids": ["proj-1"],
    }
    db.initiatives.find_one.side_effect = [initial_doc, initial_doc]

    generated_init = Initiative(
        id="init-1",
        user_id="user-1",
        name="Generated Name",
        prompt="Build app",
        status=InitiativeStatus.REVIEW,
        vision="New Vision",
        tech_stack=["FastAPI"],
    )
    plan_result = {
        "initiative": generated_init,
        "prd": PRD(initiative_id="init-1", executive_summary="Summary"),
        "epics": [Epic(initiative_id="init-1", title="E1")],
        "stories": [],
        "tasks": [],
        "sprints": [],
    }

    async def fake_generate_plan(initiative, emit):
        await emit(
            pm_tasks.PMWSEvent(
                type=PMWSEventType.GENERATION_START,
                initiative_id=initiative.id,
            )
        )
        return plan_result

    mock_emit = AsyncMock()
    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(pm_tasks.pm_orchestrator, "generate_plan", side_effect=fake_generate_plan),
        patch.object(pm_tasks.pm_manager, "emit", mock_emit),
    ):
        res = pm_tasks.generate_initiative_plan("init-1")

    assert res == {"status": "success", "initiative_id": "init-1"}
    mock_emit.assert_awaited_once()
    assert db.initiatives.update_one.await_count == 2
    merged_set = db.initiatives.update_one.call_args_list[1].args[1]["$set"]
    assert merged_set["name"] == "Generated Name"
    assert merged_set["vision"] == "New Vision"
    assert merged_set["status"] == InitiativeStatus.REVIEW
    assert merged_set["project_ids"] == ["proj-1"]
    db.epics.insert_many.assert_awaited_once()


def test_generate_initiative_plan_success_when_current_doc_missing_on_reread():
    db = _make_mock_db()
    initial_doc = {
        "id": "init-2",
        "user_id": "user-1",
        "name": "Init 2",
        "prompt": "Build",
    }
    db.initiatives.find_one.side_effect = [initial_doc, None]

    generated_init = Initiative(
        id="init-2",
        user_id="user-1",
        name="Init 2",
        prompt="Build",
        status=InitiativeStatus.REVIEW,
    )
    plan_result = {
        "initiative": generated_init,
        "prd": PRD(initiative_id="init-2"),
        "epics": [],
        "stories": [],
        "tasks": [],
        "sprints": [],
    }

    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(pm_tasks.pm_orchestrator, "generate_plan", AsyncMock(return_value=plan_result)),
        patch.object(pm_tasks.pm_manager, "emit", AsyncMock()),
    ):
        res = pm_tasks.generate_initiative_plan("init-2")

    assert res == {"status": "success", "initiative_id": "init-2"}
    assert db.initiatives.update_one.await_count == 2


def test_generate_initiative_plan_failure_marks_failed_emits_sanitized_error_and_notifies():
    db = _make_mock_db()
    initial_doc = {
        "id": "init-err",
        "user_id": "user-9",
        "name": "Err Init",
        "prompt": "Fail",
    }
    db.initiatives.find_one.return_value = initial_doc

    mock_emit = AsyncMock()
    mock_notify = AsyncMock()
    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(
            pm_tasks.pm_orchestrator,
            "generate_plan",
            AsyncMock(side_effect=RuntimeError("sensitive-internal-trace")),
        ),
        patch.object(pm_tasks.pm_manager, "emit", mock_emit),
        patch.object(pm_tasks, "notify", mock_notify),
    ):
        with pytest.raises(RuntimeError, match="sensitive-internal-trace"):
            pm_tasks.generate_initiative_plan("init-err")

    fail_update = db.initiatives.update_one.call_args_list[-1].args[1]["$set"]
    assert fail_update["status"] == InitiativeStatus.FAILED.value
    assert "sensitive-internal-trace" in fail_update["generation_error"]

    emitted_event = mock_emit.call_args.args[0]
    assert emitted_event.type == PMWSEventType.GENERATION_FAILED
    assert "sensitive-internal-trace" not in emitted_event.data["error"]
    mock_notify.assert_awaited_once()


def test_execute_task_not_found():
    db = _make_mock_db()
    db.tasks.find_one.return_value = None

    with patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)):
        with pytest.raises(ValueError, match="Task missing-task not found"):
            pm_tasks.execute_task("missing-task", "user-1")


def test_execute_task_success_with_existing_build_files_and_decision_trigger():
    db = _make_mock_db()
    task_doc = {
        "id": "task-1",
        "story_id": "story-1",
        "epic_id": "epic-1",
        "initiative_id": "init-1",
        "title": "Build API",
        "assigned_agent": PMAgentRole.BACKEND.value,
    }
    db.tasks.find_one.return_value = task_doc
    db.stories.find_one.return_value = {"title": "Story 1", "acceptance_criteria": ["200 OK"]}
    db.epics.find_one.return_value = {"title": "Epic 1"}
    db.initiatives.find_one.return_value = {
        "vision": "Fast API",
        "tech_stack": ["Python"],
        "project_ids": ["proj-1"],
    }
    db.builds.find_one.return_value = {"id": "build-1"}

    files_cursor = MagicMock()
    files_cursor.to_list = AsyncMock(return_value=[{"path": "app.py", "content": "print(1)"}])
    db.build_files.find = MagicMock(return_value=files_cursor)

    mock_executor = AsyncMock(
        return_value={
            "summary": "Implemented endpoint",
            "notes": "All good",
            "files": {"api.py": "code"},
            "_usage": {"cost_usd": 0.02, "total_tokens": 500},
        }
    )
    mock_emit = AsyncMock()
    mock_notify_finished = AsyncMock()
    mock_delay = MagicMock()

    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(pm_tasks.task_executor, "execute", mock_executor),
        patch.object(pm_tasks.pm_manager, "emit", mock_emit),
        patch.object(pm_tasks, "notify_agent_finished", mock_notify_finished),
        patch.object(pm_tasks.run_decision_engine, "delay", mock_delay),
    ):
        res = pm_tasks.execute_task("task-1", "user-1")

    assert res["status"] == "success"
    assert res["task_id"] == "task-1"
    assert "execution_id" in res

    passed_context = mock_executor.call_args.args[1]
    assert passed_context["existing_files"] == {"app.py": "print(1)"}
    assert passed_context["epic_title"] == "Epic 1"

    exec_update = db.agent_executions.update_one.call_args.args[1]["$set"]
    assert exec_update["status"] == AgentExecStatus.COMPLETED.value
    assert exec_update["cost_usd"] == 0.02
    assert exec_update["tokens_used"] == 500
    assert exec_update["generated_files"] == ["api.py"]

    task_final_update = db.tasks.update_one.call_args_list[-1].args[1]["$set"]
    assert task_final_update["status"] == TaskStatus.CODE_REVIEW.value
    assert task_final_update["generated_files"] == ["api.py"]

    emitted_types = [c.args[0].type for c in mock_emit.call_args_list]
    assert emitted_types == [
        PMWSEventType.AGENT_EXEC_START,
        PMWSEventType.TASK_STATUS_CHANGED,
        PMWSEventType.AGENT_EXEC_COMPLETE,
        PMWSEventType.TASK_STATUS_CHANGED,
    ]
    mock_notify_finished.assert_awaited_once()
    mock_delay.assert_called_once_with("task-1", "task_completed")


def test_execute_task_failure_marks_blocked_emits_failed_and_notifies():
    db = _make_mock_db()
    db.tasks.find_one.return_value = {
        "id": "task-2",
        "story_id": "story-1",
        "epic_id": "epic-1",
        "initiative_id": "init-1",
        "title": "Failing Task",
        "assigned_agent": PMAgentRole.BACKEND.value,
    }
    mock_emit = AsyncMock()
    mock_notify_blocked = AsyncMock()
    mock_delay = MagicMock()

    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(
            pm_tasks.task_executor,
            "execute",
            AsyncMock(side_effect=RuntimeError("LLM rate limit")),
        ),
        patch.object(pm_tasks.pm_manager, "emit", mock_emit),
        patch.object(pm_tasks, "notify_task_blocked", mock_notify_blocked),
        patch.object(pm_tasks.run_decision_engine, "delay", mock_delay),
    ):
        with pytest.raises(RuntimeError, match="LLM rate limit"):
            pm_tasks.execute_task("task-2", "user-1")

    exec_update = db.agent_executions.update_one.call_args.args[1]["$set"]
    assert exec_update["status"] == AgentExecStatus.FAILED.value
    assert "LLM rate limit" in exec_update["error"]

    task_update = db.tasks.update_one.call_args_list[-1].args[1]["$set"]
    assert task_update["status"] == TaskStatus.BLOCKED.value

    emitted_types = [c.args[0].type for c in mock_emit.call_args_list]
    assert emitted_types[-2:] == [
        PMWSEventType.AGENT_EXEC_FAILED,
        PMWSEventType.TASK_STATUS_CHANGED,
    ]
    mock_notify_blocked.assert_awaited_once()
    mock_delay.assert_not_called()


def test_run_decision_engine_skips_missing_task():
    db = _make_mock_db()
    db.tasks.find_one.return_value = None

    with patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)):
        res = pm_tasks.run_decision_engine("missing-task", "task_completed")

    assert res == {"status": "skipped"}


def test_run_decision_engine_applies_reestimates_risks_and_emits():
    db = _make_mock_db()
    db.tasks.find_one.return_value = {
        "id": "task-1",
        "initiative_id": "init-1",
        "sprint_id": "sprint-1",
    }
    db.sprints.find_one.return_value = {"id": "sprint-1", "name": "Sprint 1"}
    db.initiatives.find_one.return_value = {"user_id": "user-1"}

    siblings_cursor = MagicMock()
    siblings_cursor.to_list = AsyncMock(return_value=[{"id": "task-1", "title": "Auth"}])
    db.tasks.find = MagicMock(return_value=siblings_cursor)

    decision_payload = {
        "summary": "Re-estimated Auth and flagged high risk",
        "re_estimates": [
            {"task_title": "Auth", "new_estimated_hours": 12},
            {"task_title": "Bad", "new_estimated_hours": "not-a-number"},
        ],
        "risks": [
            {"description": "Auth bottleneck", "severity": "high"},
            {"description": "Minor UI polish", "severity": "low"},
        ],
        "recommended_next_tasks": ["task-2"],
        "bottlenecks": ["Auth"],
    }
    mock_emit = AsyncMock()
    mock_notify = AsyncMock()

    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(
            pm_tasks.decision_engine, "decide", AsyncMock(return_value=decision_payload)
        ),
        patch.object(pm_tasks.pm_manager, "emit", mock_emit),
        patch.object(pm_tasks, "notify", mock_notify),
    ):
        res = pm_tasks.run_decision_engine("task-1", "task_completed")

    assert res == {"status": "success"}
    db.tasks.update_one.assert_awaited_once_with(
        {"initiative_id": "init-1", "title": "Auth"},
        {"$set": {"estimated_hours": 12, "updated_at": db.tasks.update_one.call_args.args[1]["$set"]["updated_at"]}},
    )
    db.risk_reports.insert_one.assert_awaited_once()
    db.decision_log.insert_one.assert_awaited_once()
    mock_notify.assert_awaited_once()
    assert mock_emit.call_args.args[0].type == PMWSEventType.DECISION_MADE


def test_run_decision_engine_without_sprint_and_no_risks():
    db = _make_mock_db()
    db.tasks.find_one.return_value = {
        "id": "task-9",
        "initiative_id": "init-9",
    }
    db.initiatives.find_one.return_value = {"user_id": "user-9"}

    siblings_cursor = MagicMock()
    siblings_cursor.to_list = AsyncMock(return_value=[])
    db.tasks.find = MagicMock(return_value=siblings_cursor)

    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(
            pm_tasks.decision_engine,
            "decide",
            AsyncMock(return_value={"summary": "All clear", "re_estimates": [], "risks": []}),
        ),
        patch.object(pm_tasks.pm_manager, "emit", AsyncMock()),
    ):
        res = pm_tasks.run_decision_engine("task-9", "manual")

    assert res == {"status": "success"}
    siblings_cursor.to_list.assert_awaited_once_with(200)
    db.risk_reports.insert_one.assert_not_awaited()
    db.decision_log.insert_one.assert_awaited_once()


def test_run_decision_engine_fails_open_on_exception():
    db = _make_mock_db()
    db.tasks.find_one.return_value = {
        "id": "task-err",
        "initiative_id": "init-1",
    }
    siblings_cursor = MagicMock()
    siblings_cursor.to_list = AsyncMock(return_value=[])
    db.tasks.find = MagicMock(return_value=siblings_cursor)

    with (
        patch.object(pm_tasks, "get_db", AsyncMock(return_value=db)),
        patch.object(
            pm_tasks.decision_engine,
            "decide",
            AsyncMock(side_effect=RuntimeError("Decision LLM down")),
        ),
    ):
        res = pm_tasks.run_decision_engine("task-err", "task_completed")

    assert res == {"status": "error"}
