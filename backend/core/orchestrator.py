import asyncio
import json
import logging
import time
import uuid
from typing import Awaitable, Callable, Optional

from agents.architect import ArchitectAgent
from agents.designer import DesignerAgent
from agents.developer import DeveloperAgent
from agents.integration import IntegrationAgent
from agents.pm import PMAgent
from agents.business_model import BusinessModelAgent
from agent_registry import get_agent_registry
from core.models import (
    Build, BuildStatus, AgentStep, AgentType, WSEvent, WSEventType, PlanTier,
    utcnow,
)
from core.specialist_shadow import launch_shadow_comparison
from core.config import get_settings
from core.database import get_db
from sandbox.moderation import scan_code
from sandbox.csp import apply_csp
from harness.evaluator import PromptEvaluator
from harness.metrics import MetricsCollector
from harness.models import TestCase, TestSuite

settings = get_settings()
logger = logging.getLogger(__name__)

MAX_DEBUG_ITERATIONS = 3

# Best-effort harness evaluation after each agent step.
ENABLE_LOOP_ENGINEERING = True

_evaluator = PromptEvaluator()
_metrics_collector = MetricsCollector()

# Maps each build-pipeline AgentType to the persistent agent_registry role/
# department it runs as, so pipeline runs accumulate real experience on a
# per-project AgentProfile instead of vanishing after each build. ARCHITECT
# intentionally maps onto the org's leadership "architect" -- the same role
# that owns architecture/scalability decisions for the project.
_AGENT_TYPE_ROLE_DEPARTMENT = {
    AgentType.ARCHITECT: ("architect", "leadership"),
    AgentType.DESIGNER: ("designer", "frontend"),
    AgentType.DEVELOPER: ("developer", "specialists"),
    AgentType.INTEGRATION: ("integration", "backend"),
    AgentType.PM: ("build_validator", "qa"),
    AgentType.BUSINESS_IMPROVER: ("business_improver", "research"),
    AgentType.DEBUGGER: ("debugger", "qa"),
    AgentType.DEVOPS: ("devops_engineer", "infrastructure"),
    AgentType.QA: ("test_engineer", "qa"),
    AgentType.SECURITY: ("security_engineer", "infrastructure"),
    AgentType.RESEARCH: ("research_engineer", "research"),
}


class BuildCancelled(Exception):
    """User declined an interactive gate. Distinct from generic failures so
    tasks/build_tasks.py never auto-retries a build the user chose to stop."""


class Orchestrator:
    def __init__(self):
        self.architect = ArchitectAgent()
        self.designer = DesignerAgent()
        self.developer = DeveloperAgent()
        self.integration = IntegrationAgent()
        self.pm = PMAgent()
        self.business_model = BusinessModelAgent()
        self._agent_registry = get_agent_registry()

    async def run_build(
        self,
        build: Build,
        emit: Callable,  # async fn(WSEvent)
        sandbox_runner=None,
        conversation_history: list = None,
        existing_files: dict = None,
        template: Optional[str] = None,
        persist_files: Optional[Callable[[dict], Awaitable[None]]] = None,
    ) -> tuple[Build, dict]:

        """
        Full pipeline: architect → business model → designer → developer → integration → PM → (debug loop via debugger)
        emit: coroutine that sends WSEvent to connected WebSocket clients

        conversation_history / existing_files: prior build's architect exchange
        and generated files, when this build amends an existing project instead
        of starting from scratch. On a resumed (retried) build, `build.agents`
        and `existing_files` may already carry a prior attempt's completed
        steps and generated files -- see the `_recovered`/`resume_ok` checks
        below, which skip re-running (and re-charging) any step that already
        has a persisted SUCCESS record instead of restarting the whole
        pipeline from the Architect. The PM/debug loop is never resumed at
        sub-step granularity; it always restarts from PM validation.

        persist_files: optional async fn(files) called after every point
        `files` changes, so a caller (tasks/build_tasks.py) can persist
        generated files incrementally instead of only once at the very end --
        this is what makes resume possible after a crash mid-pipeline.

        Returns (build, files): build output no longer carries a `files` field
        (persisted separately in the build_files collection), so the generated
        files are returned alongside the build for the caller to persist.
        """
        if persist_files is None:
            async def persist_files(_files: dict) -> None:
                return None

        files: dict = dict(existing_files) if existing_files else {}
        # Computed once per build (never cached on self -- this Orchestrator
        # instance is a shared singleton across every concurrent user's
        # build, see api/builds.py) so BYOK users skip per-agent credit
        # deduction below; the upfront credit reservation in api/builds.py
        # is then refunded in full by the existing reserved-minus-used logic
        # in tasks/build_tasks.py, with no changes needed there.
        byok_active = await self._is_byok_active(build.user_id)
        try:

            # --- 0. BUILD START ---
            await emit(WSEvent(
                type=WSEventType.BUILD_START,
                build_id=build.id,
                data={"project_id": build.project_id}
            ))

            # --- 1. ARCHITECT ---
            architect_recovered, blueprint = self._try_recover_json(build, AgentType.ARCHITECT)
            if architect_recovered:
                logger.info("Build %s: resuming -- architect already SUCCESS, skipping.", build.id)
            else:
                await self._start_agent(build, AgentType.ARCHITECT, emit, skip_credits=byok_active)

                # Interactive first builds: surface what's ambiguous about the
                # idea and let the user answer before the blueprint is drawn.
                # Follow-up builds already carry context in conversation_history.
                if build.interactive and not conversation_history:
                    await emit(WSEvent(
                        type=WSEventType.AGENT_UPDATE,
                        build_id=build.id,
                        data={"agent": "architect", "message": "Reviewing your idea for open questions"}
                    ))
                    questions = await self.architect.clarify(
                        build.prompt,
                        user_id=build.user_id,
                        build_id=build.id,
                        project_id=build.project_id,
                        template=template,
                    )
                    if questions:
                        response = await self._wait_for_gate(
                            build, emit, stage="clarify", agent="architect",
                            kind="questions", questions=questions,
                        )
                        qa = [
                            f"Q: {q}\nA: {a.strip()}"
                            for q, a in zip(questions, response.get("answers") or [])
                            if isinstance(a, str) and a.strip()
                        ]
                        if qa:
                            conversation_history = list(conversation_history or [])
                            conversation_history.append({
                                "role": "user",
                                "content": "Answers to the architect's clarifying questions:\n\n" + "\n\n".join(qa),
                            })

                blueprint = await self.architect.blueprint(
                    build.prompt,
                    conversation_history=conversation_history,
                    user_id=build.user_id,
                    build_id=build.id,
                    project_id=build.project_id,
                    template=template,
                )
                await self._complete_agent(build, AgentType.ARCHITECT, emit, output=json.dumps(blueprint))

                await emit(WSEvent(
                    type=WSEventType.AGENT_UPDATE,
                    build_id=build.id,
                    data={"agent": "architect", "message": "Architecture blueprint created"}
                ))

                await emit(WSEvent(
                    type=WSEventType.AGENT_COMPLETE,
                    build_id=build.id,
                    data={"agent": "architect", "files_changed": []}
                ))

                await self._emit_output(build, "architect", emit, blueprint)
                await self._wait_for_gate(build, emit, stage="architect", agent="architect")

            resume_ok = architect_recovered

            # --- 2. BUSINESS MODEL ---
            bm_recovered, business_model = (resume_ok and self._try_recover_json(build, AgentType.BUSINESS_IMPROVER)) or (False, None)
            if bm_recovered:
                logger.info("Build %s: resuming -- business_model already SUCCESS, skipping.", build.id)
                build.business_model = business_model
            else:
                await self._start_agent(build, AgentType.BUSINESS_IMPROVER, emit, skip_credits=byok_active)
                business_model = await self.business_model.improve(build.prompt, blueprint=blueprint, user_id=build.user_id, build_id=build.id, project_id=build.project_id)
                build.business_model = business_model
                await self._complete_agent(
                    build, AgentType.BUSINESS_IMPROVER, emit, output=json.dumps(business_model)
                )

                await emit(WSEvent(
                    type=WSEventType.AGENT_UPDATE,
                    build_id=build.id,
                    data={"agent": "business_improver", "message": "Business model improvements ready"}
                ))

                await self._emit_output(build, "business_improver", emit, business_model)
                await self._wait_for_gate(build, emit, stage="business_improver", agent="business_improver")

            resume_ok = resume_ok and bm_recovered

            # --- 3. DESIGNER ---
            designer_recovered, design = (resume_ok and self._try_recover_json(build, AgentType.DESIGNER)) or (False, None)
            if designer_recovered:
                logger.info("Build %s: resuming -- designer already SUCCESS, skipping.", build.id)
            else:
                await self._start_agent(build, AgentType.DESIGNER, emit, skip_credits=byok_active)
                design = await self.designer.design(blueprint, user_id=build.user_id, build_id=build.id, project_id=build.project_id)
                await self._complete_agent(build, AgentType.DESIGNER, emit, output=json.dumps(design))

                await emit(WSEvent(
                    type=WSEventType.AGENT_UPDATE,
                    build_id=build.id,
                    data={"agent": "designer", "message": "Design complete"},
                ))

                await self._emit_output(build, "designer", emit, design)
                await self._wait_for_gate(build, emit, stage="designer", agent="designer")

            resume_ok = resume_ok and designer_recovered

            # --- 4. DEVELOPER (with streaming) ---
            developer_recovered = resume_ok and self._find_success_output(build, AgentType.DEVELOPER) is not None
            if developer_recovered and not files:
                logger.warning(
                    "Build %s: developer step is SUCCESS but no files were recovered -- "
                    "forcing a full regeneration to avoid an empty build.", build.id,
                )
                developer_recovered = False
            if developer_recovered:
                logger.info(
                    "Build %s: resuming -- developer already SUCCESS, skipping generation "
                    "(files recovered from persisted build_files).", build.id,
                )
            else:
                await self._start_agent(build, AgentType.DEVELOPER, emit, skip_credits=byok_active)

                await emit(WSEvent(
                    type=WSEventType.AGENT_PROGRESS,
                    build_id=build.id,
                    data={"agent": "developer", "progress": 0, "message": "Generating files"}
                ))

                stream_buffer = []
                async def stream_token(chunk: str):
                    stream_buffer.append(chunk)
                    await emit(WSEvent(
                        type=WSEventType.STREAM_TOKEN,
                        build_id=build.id,
                        data={"agent": "developer", "token": chunk}
                    ))

                files_result = await self.developer.generate_files(
                    blueprint, design, stream_callback=stream_token, existing_files=existing_files,
                    user_id=build.user_id, build_id=build.id, project_id=build.project_id,
                )
                files.update(files_result.get("files", {}))
                await persist_files(files)

                await self._complete_agent(
                    build, AgentType.DEVELOPER, emit,
                    output=f"Generated {len(files)} files",
                    files_changed=list(files_result.get("files", {}).keys())
                )

                await emit(WSEvent(
                    type=WSEventType.AGENT_UPDATE,
                    build_id=build.id,
                    data={"agent": "developer", "message": "Developer finished generating files"}
                ))

                new_files = files_result.get("files", {})
                # Previously followed by a second FILE_UPDATE shaped {"files":
                # files} -- the frontend's file_update handler only ever
                # understood that shape, not this one, so this delta event was
                # silently dropped by parseWSEvent's validation and the
                # redundant full-dict event was doing all the real work (WS-002).
                # Both sides now agree on the delta shape; see wsContract.ts.
                await emit(WSEvent(
                    type=WSEventType.FILE_UPDATE,
                    build_id=build.id,
                    data={"delta": {"changed": new_files, "deleted": []}}
                ))


                await emit(WSEvent(
                    type=WSEventType.AGENT_PROGRESS,
                    build_id=build.id,
                    data={"agent": "developer", "progress": 100, "message": "Files generated"}
                ))

                # Specialist shadow comparison (docs/architecture/specialist-agent-
                # execution-plan.md, Phase 2). Fire-and-forget, flag-gated (default
                # OFF), and launched only after everything above -- the real
                # Developer stage -- has fully completed. Never awaited here, adds
                # no latency, and cannot affect `files`/credits/events above. See
                # core/specialist_shadow.py for the full safety contract.
                launch_shadow_comparison(build, blueprint, design, files)

            resume_ok = resume_ok and developer_recovered

            # --- 5. INTEGRATION ---
            integrations = blueprint.get("integrations", [])
            if integrations:
                integration_recovered = resume_ok and self._find_success_output(build, AgentType.INTEGRATION) is not None
                if integration_recovered:
                    logger.info("Build %s: resuming -- integration already SUCCESS, skipping.", build.id)
                else:
                    await self._start_agent(build, AgentType.INTEGRATION, emit, skip_credits=byok_active)
                    int_result = await self.integration.integrate(integrations, files, user_id=build.user_id, build_id=build.id, project_id=build.project_id)
                    files.update(int_result.get("files", {}))
                    await persist_files(files)
                    await self._complete_agent(
                        build, AgentType.INTEGRATION, emit,
                    output=int_result.get("instructions", ""),
                        files_changed=list(int_result.get("files", {}).keys())
                    )

                    await emit(WSEvent(
                        type=WSEventType.AGENT_UPDATE,
                        build_id=build.id,
                        data={"agent": "integration", "message": "Integration complete"},
                    ))

                    await self._emit_output(
                        build, "integration", emit,
                        {"instructions": int_result.get("instructions", "")},
                    )


            # --- CONTENT SECURITY POLICY (generated apps) ---
            # Inject a secure default CSP into the generated app itself (HTML
            # meta + FastAPI middleware) so the protection travels with the code
            # when it is deployed/previewed standalone -- not just behind the
            # Forge platform's own headers.
            csp_report = apply_csp(files)

            # --- 6. SANDBOX (best-effort static check, folded into the first PM pass) ---
            sandbox_errors = []
            if sandbox_runner:
                raw = await sandbox_runner.run(files)
                sandbox_errors = [line for line in raw.split("\n") if line.strip()] if raw else []

            # Content moderation: block leaked secrets / destructive commands by
            # folding them into sandbox_errors (the PM debug loop remediates
            # them), and re-scan the final files after the loop to attach a
            # non-blocking report to the build output.
            _moderation = await scan_code(files)
            if _moderation and _moderation.blocking_lines():
                sandbox_errors.extend(_moderation.blocking_lines())

            # --- 7. PM VALIDATION + DEBUG LOOP ---
            # PM is the authority on whether the build needs another pass. If it
            # reports errors, the debugger (a specialized pass of the developer agent)
            # patches them, then PM re-validates, up to MAX_DEBUG_ITERATIONS times
            # before giving up.
            # Seeded from the build's lifetime debug-iteration counter (not
            # reset to 0) so a build that crashes and resumes repeatedly
            # can't accumulate an unbounded number of debug iterations by
            # getting a fresh MAX_DEBUG_ITERATIONS budget on every retry.
            iteration = build.debug_iterations
            validation = {}
            while True:
                await self._start_agent(build, AgentType.PM, emit, skip_credits=byok_active)
                validation = await self.pm.validate(blueprint, files, user_id=build.user_id, build_id=build.id, project_id=build.project_id)
                await self._complete_agent(
                    build, AgentType.PM, emit,
                    output=json.dumps(validation)
                )
                await self._evaluate_agent_output(build.id, "pm", json.dumps(validation), emit)
                await self._emit_output(build, "pm", emit, validation)

                errors = list(sandbox_errors)
                sandbox_errors = []
                if not validation.get("passed", True):
                    errors.extend(
                        f"Missing feature: {f}"
                        for f in (validation.get("missing_features") or [])
                    )
                    errors.extend(
                        f"[{i.get('severity', '?')}] {i.get('file', '?')}: {i.get('description', '')}"
                        for i in (validation.get("issues") or [])
                    )
                    if not errors:
                        errors = ["PM validation failed"]

                if not errors:
                    break

                if iteration >= MAX_DEBUG_ITERATIONS:
                    build.status = BuildStatus.FAILED
                    await emit(WSEvent(
                        type=WSEventType.BUILD_FAILED,
                        build_id=build.id,
                        data={"error": "; ".join(errors)[:2000]}
                    ))
                    return build, files

                build.status = BuildStatus.DEBUGGING
                build.debug_iterations += 1
                iteration += 1

                await emit(WSEvent(
                    type=WSEventType.DEBUG_START,
                    build_id=build.id,
                    data={"iteration": iteration, "errors": errors}
                ))

                await self._start_agent(build, AgentType.DEBUGGER, emit, skip_credits=byok_active)
                patched = await self.developer.patch_files(
                    files, "\n".join(errors), blueprint,
                    user_id=build.user_id, build_id=build.id, project_id=build.project_id,
                )
                files.update(patched.get("files", {}))
                await persist_files(files)
                await self._complete_agent(
                    build, AgentType.DEBUGGER, emit,
                    output=f"Patched {len(patched.get('files', {}))} files",
                    files_changed=list(patched.get("files", {}).keys())
                )

                await emit(WSEvent(
                    type=WSEventType.FILE_UPDATE,
                    build_id=build.id,
                    data={"delta": {"changed": patched.get("files", {}), "deleted": []}, "debug_iteration": iteration}
                ))

            # --- 8. DONE ---
            build.status = BuildStatus.SUCCESS
            build.completed_at = utcnow()

            # Attach the final (post-debug-loop) moderation + CSP reports so
            # users see any non-blocking warnings even when blocking issues were
            # remediated.
            final_moderation = await scan_code(files)
            validation["moderation"] = final_moderation.to_dict() if final_moderation else None
            validation["csp"] = csp_report.to_dict()

            # BUILD_COMPLETE already carries the full final `files` state
            # below -- a trailing FILE_UPDATE re-sending everything as a
            # "changed" delta was pure duplicate work.
            await emit(WSEvent(
                type=WSEventType.BUILD_COMPLETE,
                build_id=build.id,
                data={
                    "files": files,
                    "validation": validation,
                    "credits_used": build.credits_used,
                    "business_model": build.business_model,
                }
            ))


        except Exception as e:
            build.status = BuildStatus.FAILED
            for step in build.agents:
                if step.status == BuildStatus.RUNNING and step.agent_profile_id:
                    try:
                        await self._agent_registry.record_task_result(
                            build.project_id, step.agent_profile_id, success=False,
                        )
                    except Exception:
                        logger.debug(
                            "Agent registry record_task_result (failure path) failed for build=%s",
                            build.id, exc_info=True,
                        )
            await emit(WSEvent(
                type=WSEventType.BUILD_FAILED,
                build_id=build.id,
                data={"error": str(e)}
            ))
            await emit(WSEvent(
                type=WSEventType.ERROR,
                build_id=build.id,
                data={"error": str(e), "agent": "orchestrator"}
            ))
            raise


        return build, files

    async def _emit_output(self, build: Build, agent: str, emit: Callable, output) -> None:
        """Structured (already-parsed) agent output for the workspace's center
        panel — AgentStep.output carries the same data as a JSON string, but
        making clients re-parse it proved error-prone."""
        await emit(WSEvent(
            type=WSEventType.AGENT_OUTPUT,
            build_id=build.id,
            # Copy: the pipeline keeps mutating some outputs after this point
            # (PM validation gains moderation/csp reports), and emit callbacks
            # may hold the event beyond this call.
            data={"agent": agent, "output": dict(output) if isinstance(output, dict) else output},
        ))

    async def _wait_for_gate(
        self,
        build: Build,
        emit: Callable,
        stage: str,
        agent: str,
        kind: str = "approval",
        questions: Optional[list] = None,
    ) -> dict:
        """Pause an interactive build until the user responds via
        POST /builds/{build_id}/gate (which writes pending_gate.response),
        the gate times out (auto-approve), or the user cancels.

        Polling the build document — rather than waiting on an in-process
        signal — keeps this working across processes: the API server that
        receives the response is not the Celery worker running this pipeline.

        Resume trade-off: `_complete_agent` for a stage always runs before
        that stage's `_wait_for_gate` call, so a crash mid-poll (after the
        step is durably SUCCESS but before the user answered the gate) means
        a resumed attempt will treat the stage as fully recovered and skip
        calling this method entirely for that stage -- i.e. it silently
        proceeds as if the gate had been auto-approved, rather than showing
        it to the user again. This is an accepted limitation of resume, not
        a bug: fixing it would require reordering gate-before-complete,
        which changes the interactive-build UX (approve happens today only
        after the user has seen the stage's output).
        """
        if not build.interactive:
            return {"action": "approve", "auto": True}

        db = await get_db()
        gate = {
            "gate_id": str(uuid.uuid4()),
            "stage": stage,
            "agent": agent,
            "kind": kind,
            "questions": questions or [],
            "timeout_seconds": settings.gate_timeout,
            "requested_at": utcnow().isoformat(),
        }
        await db.builds.update_one({"id": build.id}, {"$set": {"pending_gate": gate}})
        await emit(WSEvent(type=WSEventType.GATE_REQUEST, build_id=build.id, data=gate))

        response: dict = {"action": "approve", "auto": True}
        deadline = time.monotonic() + settings.gate_timeout
        while time.monotonic() < deadline:
            doc = await db.builds.find_one({"id": build.id}, {"_id": 0, "pending_gate": 1})
            pending = (doc or {}).get("pending_gate") or {}
            if pending.get("gate_id") == gate["gate_id"] and pending.get("response"):
                response = pending["response"]
                break
            await asyncio.sleep(settings.gate_poll_interval)

        await db.builds.update_one({"id": build.id}, {"$set": {"pending_gate": None}})
        await emit(WSEvent(
            type=WSEventType.GATE_RESOLVED,
            build_id=build.id,
            data={
                "gate_id": gate["gate_id"],
                "stage": stage,
                "agent": agent,
                "action": response.get("action", "approve"),
                "auto": bool(response.get("auto", False)),
            },
        ))

        if response.get("auto"):
            await emit(WSEvent(
                type=WSEventType.AGENT_UPDATE,
                build_id=build.id,
                data={"agent": agent, "message": "No response — continuing automatically"},
            ))
        if response.get("action") == "cancel":
            raise BuildCancelled("Build cancelled by user")
        return response

    def _find_success_output(self, build: Build, agent_type: AgentType) -> Optional[str]:
        """First SUCCESS step's raw `output` for this agent type, if a prior
        (possibly crashed) attempt already completed it -- used to skip
        re-running a step on resume."""
        for step in build.agents:
            if step.agent == agent_type and step.status == BuildStatus.SUCCESS:
                return step.output
        return None

    def _try_recover_json(self, build: Build, agent_type: AgentType) -> tuple[bool, Optional[dict]]:
        """Like `_find_success_output`, but also JSON-decodes it (architect/
        business_model/designer store their dict output as `json.dumps(...)`).
        Never raises: a step recorded SUCCESS with output that fails to parse
        is treated as not-yet-done so the pipeline safely re-runs it instead
        of crashing or silently continuing with a broken value."""
        output = self._find_success_output(build, agent_type)
        if output is None:
            return False, None
        try:
            return True, json.loads(output)
        except (json.JSONDecodeError, TypeError):
            logger.warning(
                "Build %s: SUCCESS %s step output failed to JSON-parse on resume; "
                "treating as not-yet-done and re-running.",
                build.id, agent_type.value,
            )
            return False, None

    async def _is_byok_active(self, user_id: str) -> bool:
        """Pro+ users with a stored BYOK key skip credit costs (see the
        pricing page's "Bring your own key" perk) -- agents/base.py's
        _resolve_client does the equivalent check to pick which API key an
        LLM call actually uses; this mirrors it for the credit ledger."""
        try:
            db = await get_db()
            user_doc = await db.users.find_one(
                {"id": user_id}, {"_id": 0, "plan": 1, "llm_api_key": 1}
            )
        except Exception:
            return False
        if not user_doc or not user_doc.get("llm_api_key"):
            return False
        return user_doc.get("plan") in (PlanTier.PRO.value, PlanTier.ENTERPRISE.value)

    async def _resolve_agent_profile(self, build: Build, agent_type: AgentType) -> Optional[str]:
        """Best-effort: look up (or create) the persistent AgentProfile this
        pipeline stage runs as. Never raises -- a registry hiccup must not
        block a build."""
        role, department = _AGENT_TYPE_ROLE_DEPARTMENT.get(agent_type, (agent_type.value, "specialists"))
        try:
            profile, _ = await self._agent_registry.get_or_create_agent(
                build.project_id, role, department=department
            )
            return profile.id
        except Exception:
            logger.debug("Agent registry lookup failed for role=%s build=%s", role, build.id, exc_info=True)
            return None

    async def _start_agent(
        self, build: Build, agent_type: AgentType, emit: Callable, skip_credits: bool = False
    ):
        step = AgentStep(agent=agent_type, status=BuildStatus.RUNNING, started_at=utcnow())
        step.agent_profile_id = await self._resolve_agent_profile(build, agent_type)
        build.agents.append(step)
        if not skip_credits:
            credit_map = {
                AgentType.ARCHITECT: settings.credits_architect,
                AgentType.DESIGNER: settings.credits_designer,
                AgentType.DEVELOPER: settings.credits_developer,
                AgentType.INTEGRATION: settings.credits_integration,
                AgentType.PM: settings.credits_pm,
                AgentType.BUSINESS_IMPROVER: settings.credits_business_model,
                AgentType.DEBUGGER: settings.credits_debug,
                AgentType.DEVOPS: settings.credits_devops,
                AgentType.QA: settings.credits_qa,
                AgentType.SECURITY: settings.credits_security,
                AgentType.RESEARCH: settings.credits_research,
            }
            build.credits_used += credit_map.get(agent_type, 1)

        await emit(WSEvent(
            type=WSEventType.AGENT_START,
            build_id=build.id,
            data={"agent": agent_type.value}
        ))

    async def _evaluate_agent_output(self, build_id: str, agent: str, output: str, emit: Callable):
        """Best-effort harness evaluation emitted as WS event when enabled."""
        if not ENABLE_LOOP_ENGINEERING:
            return
        try:
            suite = TestSuite(
                suite_id=f"orch-{build_id}-{agent}",
                role=agent,
                template_version="v1",
                cases=[
                    TestCase(
                        case_id=f"{agent}-non-empty",
                        role=agent,
                        task=output[:200],
                        expected_output_patterns=[output[:50]] if output else [],
                        expected_format="text",
                    ),
                ],
            )
            result = _evaluator.evaluate_suite(output, suite)
            metrics = _metrics_collector.from_test_results(result.results)
            await emit(WSEvent(
                type=WSEventType.AGENT_UPDATE,
                build_id=build_id,
                data={
                    "agent": agent,
                    "message": "Harness evaluation",
                    "harness": {
                        "pass_rate": result.pass_rate,
                        "format_compliance": metrics.format_compliance,
                        "completeness": metrics.completeness,
                        "relevance": metrics.relevance,
                    },
                },
            ))
        except Exception:
            pass

    async def _complete_agent(
        self,
        build: Build,
        agent_type: AgentType,
        emit: Callable,
        output: str = "",
        files_changed: list = None,
    ):
        completed_step = None
        for step in build.agents:
            if step.agent == agent_type and step.status == BuildStatus.RUNNING:
                step.status = BuildStatus.SUCCESS
                step.completed_at = utcnow()
                step.output = output
                step.files_changed = files_changed or []
                completed_step = step
                break

        if completed_step and completed_step.agent_profile_id:
            try:
                await self._agent_registry.record_task_result(
                    build.project_id,
                    completed_step.agent_profile_id,
                    success=True,
                    files_touched=files_changed or None,
                )
            except Exception:
                logger.debug(
                    "Agent registry record_task_result failed for build=%s agent=%s",
                    build.id, agent_type.value, exc_info=True,
                )

        await self._evaluate_agent_output(build.id, agent_type.value, output, emit)

        await emit(WSEvent(
            type=WSEventType.AGENT_COMPLETE,
            build_id=build.id,
            data={"agent": agent_type.value, "files_changed": files_changed or []}
        ))
