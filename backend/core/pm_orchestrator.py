from typing import Callable
import logging

from agents.business_analyst import BusinessAnalystAgent
from agents.prd_writer import PRDWriterAgent
from agents.epic_generator import EpicGeneratorAgent
from agents.story_generator import StoryGeneratorAgent
from agents.task_generator import TaskGeneratorAgent
from agents.sprint_planner import SprintPlannerAgent
from core.pm_models import (
    Initiative, InitiativeStatus, PRD, Epic, Story, Task, Sprint,
    PMWSEvent, PMWSEventType, TaskCategory, PMAgentRole,
)

logger = logging.getLogger(__name__)

DEFAULT_SPRINT_CAPACITY_HOURS = 80


class PMOrchestrator:
    """Idea -> vision -> PRD -> epics -> stories -> tasks -> sprint plan.

    Mirrors core/orchestrator.py's shape: a shared, stateless-per-call
    singleton that never touches the database directly -- it returns fully
    constructed Pydantic model instances (with real ids already assigned) for
    the caller (tasks/pm_tasks.py) to persist, and calls `emit` for live
    progress. Titles/indexes returned by the LLM are resolved to real ids
    here so downstream persistence is a plain insert_many.
    """

    def __init__(self):
        self.business_analyst = BusinessAnalystAgent()
        self.prd_writer = PRDWriterAgent()
        self.epic_generator = EpicGeneratorAgent()
        self.story_generator = StoryGeneratorAgent()
        self.task_generator = TaskGeneratorAgent()
        self.sprint_planner = SprintPlannerAgent()

    async def generate_plan(self, initiative: Initiative, emit: Callable) -> dict:
        uid, org_id = initiative.user_id, initiative.org_id

        await emit(PMWSEvent(
            type=PMWSEventType.GENERATION_START,
            initiative_id=initiative.id,
            data={"stage": "business_analyst"},
        ))

        analysis = await self.business_analyst.analyze(
            initiative.prompt, user_id=uid, initiative_id=initiative.id, org_id=org_id
        )
        initiative.name = analysis.get("name") or initiative.name
        initiative.vision = analysis.get("vision", "")
        initiative.business_goals = analysis.get("business_goals", [])
        initiative.product_scope = analysis.get("product_scope", "")
        initiative.functional_requirements = analysis.get("functional_requirements", [])
        initiative.non_functional_requirements = analysis.get("non_functional_requirements", [])
        initiative.success_metrics = analysis.get("success_metrics", [])
        initiative.roadmap = analysis.get("roadmap", [])
        initiative.tech_stack = analysis.get("tech_stack", [])
        initiative.risks = analysis.get("risks", [])
        initiative.estimated_timeline = analysis.get("estimated_timeline", "")

        await emit(PMWSEvent(
            type=PMWSEventType.GENERATION_STAGE,
            initiative_id=initiative.id,
            data={"stage": "prd", "vision": initiative.vision},
        ))

        # --- PRD ---
        prd_data = await self.prd_writer.write(
            initiative.model_dump(), user_id=uid, initiative_id=initiative.id, org_id=org_id
        )
        prd = PRD(initiative_id=initiative.id, **{
            k: v for k, v in prd_data.items() if k in PRD.model_fields
        })

        await emit(PMWSEvent(
            type=PMWSEventType.GENERATION_STAGE,
            initiative_id=initiative.id,
            data={"stage": "epics"},
        ))

        # --- Epics ---
        epics_data = (await self.epic_generator.generate(
            initiative.model_dump(), prd.model_dump(), user_id=uid, initiative_id=initiative.id, org_id=org_id
        )).get("epics", [])

        epics: list[Epic] = []
        title_to_epic_id: dict[str, str] = {}
        for i, e in enumerate(epics_data):
            epic = Epic(
                initiative_id=initiative.id,
                title=e.get("title", f"Epic {i + 1}"),
                description=e.get("description", ""),
                priority=_safe_priority(e.get("priority")),
                story_points=_safe_int(e.get("story_points")),
                estimated_duration=e.get("estimated_duration", ""),
                order=i,
            )
            epics.append(epic)
            title_to_epic_id[epic.title] = epic.id

        for epic, e in zip(epics, epics_data):
            epic.dependencies = [
                title_to_epic_id[d] for d in (e.get("dependencies") or []) if d in title_to_epic_id
            ]

        await emit(PMWSEvent(
            type=PMWSEventType.EPICS_READY,
            initiative_id=initiative.id,
            data={"count": len(epics)},
        ))

        # --- Stories (grouped by epic_index in one call) ---
        stories: list[Story] = []
        if epics:
            stories_payload = (await self.story_generator.generate(
                initiative.model_dump(), [e.model_dump() for e in epics],
                user_id=uid, initiative_id=initiative.id, org_id=org_id,
            )).get("epics", [])

            for group in stories_payload:
                idx = group.get("epic_index")
                if idx is None or not (0 <= idx < len(epics)):
                    continue
                epic = epics[idx]
                title_to_story_id: dict[str, str] = {}
                group_stories = []
                for j, s in enumerate(group.get("stories", [])):
                    story = Story(
                        epic_id=epic.id,
                        initiative_id=initiative.id,
                        title=s.get("title", f"Story {j + 1}"),
                        description=s.get("description", ""),
                        acceptance_criteria=s.get("acceptance_criteria", []),
                        definition_of_done=s.get("definition_of_done", []),
                        priority=_safe_priority(s.get("priority")),
                        story_points=_safe_int(s.get("story_points")),
                        business_value=s.get("business_value", ""),
                        risk=s.get("risk", "low"),
                        order=j,
                    )
                    group_stories.append((story, s))
                    title_to_story_id[story.title] = story.id
                for story, s in group_stories:
                    story.dependencies = [
                        title_to_story_id[d] for d in (s.get("dependencies") or []) if d in title_to_story_id
                    ]
                stories.extend(story for story, _ in group_stories)

        await emit(PMWSEvent(
            type=PMWSEventType.STORIES_READY,
            initiative_id=initiative.id,
            data={"count": len(stories)},
        ))

        # --- Tasks (grouped by story_index in one call) ---
        tasks: list[Task] = []
        if stories:
            tasks_payload = (await self.task_generator.generate(
                initiative.model_dump(), [s.model_dump() for s in stories],
                user_id=uid, initiative_id=initiative.id, org_id=org_id,
            )).get("stories", [])

            for group in tasks_payload:
                idx = group.get("story_index")
                if idx is None or not (0 <= idx < len(stories)):
                    continue
                story = stories[idx]
                title_to_task_id: dict[str, str] = {}
                group_tasks = []
                for k, t in enumerate(group.get("tasks", [])):
                    task = Task(
                        story_id=story.id,
                        epic_id=story.epic_id,
                        initiative_id=initiative.id,
                        title=t.get("title", f"Task {k + 1}"),
                        description=t.get("description", ""),
                        category=_safe_enum(TaskCategory, t.get("category"), TaskCategory.BACKEND),
                        estimated_hours=_safe_float(t.get("estimated_hours")),
                        complexity=t.get("complexity", "medium"),
                        required_skills=t.get("required_skills", []),
                        assigned_agent=_safe_enum(PMAgentRole, t.get("assigned_agent"), PMAgentRole.BACKEND),
                        kanban_order=k,
                    )
                    group_tasks.append((task, t))
                    title_to_task_id[task.title] = task.id
                for task, t in group_tasks:
                    task.dependencies = [
                        title_to_task_id[d] for d in (t.get("dependencies") or []) if d in title_to_task_id
                    ]
                tasks.extend(task for task, _ in group_tasks)

        await emit(PMWSEvent(
            type=PMWSEventType.TASKS_READY,
            initiative_id=initiative.id,
            data={"count": len(tasks)},
        ))

        # --- Sprint plan ---
        sprints: list[Sprint] = []
        if tasks:
            sprint_payload = (await self.sprint_planner.plan(
                initiative.model_dump(), [t.model_dump() for t in tasks],
                capacity_hours=DEFAULT_SPRINT_CAPACITY_HOURS,
                user_id=uid, initiative_id=initiative.id, org_id=org_id,
            )).get("sprints", [])

            for sp in sprint_payload:
                indexes = [i for i in (sp.get("task_indexes") or []) if isinstance(i, int) and 0 <= i < len(tasks)]
                sprint = Sprint(
                    initiative_id=initiative.id,
                    sprint_number=_safe_int(sp.get("sprint_number")) or (len(sprints) + 1),
                    name=sp.get("name", f"Sprint {len(sprints) + 1}"),
                    goal=sp.get("goal", ""),
                    task_ids=[tasks[i].id for i in indexes],
                    capacity=_safe_int(sp.get("capacity")) or DEFAULT_SPRINT_CAPACITY_HOURS,
                    velocity=_safe_int(sp.get("velocity")),
                    story_points_planned=_safe_int(sp.get("story_points_planned")),
                    team_load=sp.get("team_load", {}) or {},
                    agent_load=sp.get("agent_load", {}) or {},
                    completion_probability=_safe_float(sp.get("completion_probability")),
                )
                sprints.append(sprint)
                for i in indexes:
                    tasks[i].sprint_id = sprint.id

        await emit(PMWSEvent(
            type=PMWSEventType.SPRINT_PLAN_READY,
            initiative_id=initiative.id,
            data={"count": len(sprints)},
        ))

        initiative.status = InitiativeStatus.ACTIVE

        await emit(PMWSEvent(
            type=PMWSEventType.GENERATION_COMPLETE,
            initiative_id=initiative.id,
            data={
                "epics": len(epics), "stories": len(stories),
                "tasks": len(tasks), "sprints": len(sprints),
            },
        ))

        return {
            "initiative": initiative,
            "prd": prd,
            "epics": epics,
            "stories": stories,
            "tasks": tasks,
            "sprints": sprints,
        }


def _safe_priority(value) -> str:
    from core.pm_models import Priority
    try:
        return Priority(value).value
    except Exception:
        return Priority.P2.value


def _safe_enum(enum_cls, value, default) -> str:
    try:
        return enum_cls(value).value
    except Exception:
        return default.value


def _safe_int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _safe_float(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
