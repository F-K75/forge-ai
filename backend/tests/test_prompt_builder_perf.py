from prompt_builder.builder import PromptBuilder
from prompt_builder.models import PromptContext, ProjectStateSlice


def test_build_p95_under_20ms():
    builder = PromptBuilder()
    context = PromptContext(
        agent_role="developer",
        task="Generate all code files for a todo app with auth.",
        project_state=ProjectStateSlice(
            project_name="Todo App",
            tech_stack=["React", "FastAPI", "MongoDB"],
            completed_tasks=["scaffold"],
            pending_tasks=["auth", "crud"],
        ),
        relevant_files=["frontend/src/App.tsx", "backend/main.py"],
        previous_outputs={"architect": '{"app_name": "Todo"}', "designer": '{"palette": {}}'},
    )

    timings = []
    for _ in range(100):
        result = builder.build(context)
        timings.append(result.metadata.build_time_ms)

    timings.sort()
    p95 = timings[int(len(timings) * 0.95)]
    assert p95 < 20, f"p95 build time {p95}ms exceeded 20ms budget"
