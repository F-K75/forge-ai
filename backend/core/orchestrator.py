import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from agents.architect import ArchitectAgent
from agents.designer import DesignerAgent
from agents.developer import DeveloperAgent
from agents.integration import IntegrationAgent
from agents.pm import PMAgent
from agents.business_model import BusinessModelAgent
from agent_registry import get_agent_registry
from core import collaboration as collab
from core.agent_communication import CommunicationPolicy, InProcessAgentCommunication
from core.collaboration import AGENT_CAPABILITIES, CollabConfig
from core.models import (
    AgentMessage, AgentMessageStatus, Build, BuildStatus, AgentStep, AgentType,
    Escalation, EscalationState, WSEvent, WSEventType, PlanTier, utcnow,
)
from core.specialist_shadow import launch_shadow_comparison
from core.processing_boundary import current_boundary
from core import build_ledger
from core.build_ledger import (
    LedgerCommsHooks, LedgerRefused, OperationSkipped, RecoveryExhausted, UnusableOutput,
    current_ledger_run,
)
from core.quotas import QuotaRefused
from core.config import get_settings
from core.database import get_db
from sandbox.moderation import scan_code
from sandbox.csp import apply_csp
from sandbox import static_security
from harness.evaluator import PromptEvaluator
from harness.metrics import MetricsCollector
from harness.models import TestCase, TestSuite

settings = get_settings()
logger = logging.getLogger(__name__)

# N of the reservation formula (core/pricing.py); 3 with the shipped settings.
MAX_DEBUG_ITERATIONS = settings.max_debug_iterations

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


# --- A1 usability predicates (plan §8.1, W5): what counts as usable output ---


def _usable_dict(result: Any) -> bool:
    """Schema-valid structured output: a JSON object."""
    return isinstance(result, dict)


def _usable_files(result: Any) -> bool:
    """The Developer must produce at least one file."""
    return isinstance(result, dict) and isinstance(result.get("files"), dict) and bool(result["files"])


def _changes_files(result: Any, current: Dict[str, str]) -> bool:
    """U6: a debug pass is usable only if it changes the active files; a
    genuine no-op is uncharged (and still counts toward N)."""
    if not isinstance(result, dict) or not isinstance(result.get("files"), dict):
        return False
    return any(current.get(path) != content for path, content in result["files"].items())


# An interactive escalation gate shorter than this is not worth showing; the
# decision owner decides instead (resolved_by = "default").
_MIN_ESCALATION_GATE_SECONDS = 10.0


@dataclass
class _CollabRun:
    """Per-build, per-attempt state of collaboration protocol v2. Never
    stored on the Orchestrator, which is a singleton shared by every
    concurrent build."""

    config: CollabConfig
    byok_active: bool
    reserved_credits: Optional[int]
    # time.monotonic() at which this attempt's build_timeout runs out.
    deadline: float


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
        reserved_credits: Optional[int] = None,
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

        reserved_credits: the credits api/builds.py reserved up front for
        this build. Only used to cap Developer -> Architect clarifications so
        they can never push credits_used past the reservation; when None
        (unknown) metered builds skip clarifications entirely.

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
        # Foundation C flag, read once per attempt; None means no scan.
        static_security_config = static_security.snapshot_config(settings)
        try:

            # --- 0. BUILD START ---
            await emit(WSEvent(
                type=WSEventType.BUILD_START,
                build_id=build.id,
                data={"project_id": build.project_id}
            ))

            # Collaboration protocol v2: None means the legacy flow (flag off,
            # or a build that started without a v2 snapshot).
            collab_run = await self._start_collaboration(build, byok_active, reserved_credits)

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
                    questions = await self._optional_call(
                        build, "architect_clarify", AgentType.ARCHITECT,
                        lambda: self.architect.clarify(
                            build.prompt,
                            user_id=build.user_id,
                            build_id=build.id,
                            project_id=build.project_id,
                            template=template,
                        ),
                        usable=lambda r: isinstance(r, list), default=[],
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

                blueprint = await self._stage_call(
                    build, "architect", AgentType.ARCHITECT,
                    lambda: self.architect.blueprint(
                        build.prompt,
                        conversation_history=conversation_history,
                        user_id=build.user_id,
                        build_id=build.id,
                        project_id=build.project_id,
                        template=template,
                    ),
                    usable=_usable_dict,
                )
                self._note_integrations(blueprint)
                await self._complete_agent(build, AgentType.ARCHITECT, emit, output=json.dumps(blueprint),
                                           stage_key="architect")

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
            if architect_recovered:
                self._note_integrations(blueprint)

            # --- 2. BUSINESS MODEL ---
            bm_recovered, business_model = (resume_ok and self._try_recover_json(build, AgentType.BUSINESS_IMPROVER)) or (False, None)
            if bm_recovered:
                logger.info("Build %s: resuming -- business_model already SUCCESS, skipping.", build.id)
                build.business_model = business_model
            else:
                await self._start_agent(build, AgentType.BUSINESS_IMPROVER, emit, skip_credits=byok_active)
                business_model = await self._stage_call(
                    build, "business_model", AgentType.BUSINESS_IMPROVER,
                    lambda: self.business_model.improve(build.prompt, blueprint=blueprint, user_id=build.user_id, build_id=build.id, project_id=build.project_id),
                    usable=_usable_dict,
                )
                build.business_model = business_model
                await self._complete_agent(
                    build, AgentType.BUSINESS_IMPROVER, emit, output=json.dumps(business_model),
                    stage_key="business_model", extra_set={"business_model": business_model},
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
                design_kwargs = {}
                if collab_run is not None:
                    await self._run_stage_clarifications(
                        build, collab_run, AgentType.DESIGNER, emit, blueprint=blueprint,
                    )
                    design_kwargs = self._decisions_kwargs(build)
                design = await self._stage_call(
                    build, "designer", AgentType.DESIGNER,
                    lambda: self.designer.design(blueprint, user_id=build.user_id, build_id=build.id, project_id=build.project_id, **design_kwargs),
                    usable=_usable_dict,
                )
                await self._complete_agent(build, AgentType.DESIGNER, emit, output=json.dumps(design),
                                           stage_key="designer")

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

                if collab_run is not None:
                    # v2: questions may go to the Architect or the Designer;
                    # answers land on the blackboard, and the Developer gets
                    # the blackboard's decisions instead of `clarifications`.
                    await self._run_stage_clarifications(
                        build, collab_run, AgentType.DEVELOPER, emit,
                        blueprint=blueprint, design=design,
                    )
                    extra_kwargs = self._decisions_kwargs(build)
                else:
                    clarifications = await self._run_developer_clarifications(
                        build, blueprint, design, emit,
                        byok_active=byok_active, reserved_credits=reserved_credits,
                    )
                    extra_kwargs = {"clarifications": clarifications} if clarifications else {}
                files_result = await self._stage_call(
                    build, "developer", AgentType.DEVELOPER,
                    lambda: self.developer.generate_files(
                        blueprint, design, stream_callback=stream_token, existing_files=existing_files,
                        user_id=build.user_id, build_id=build.id, project_id=build.project_id,
                        **extra_kwargs,
                    ),
                    usable=_usable_files,
                )
                files.update(files_result.get("files", {}))
                await persist_files(files)

                await self._complete_agent(
                    build, AgentType.DEVELOPER, emit,
                    output=f"Generated {len(files)} files",
                    files_changed=list(files_result.get("files", {}).keys()),
                    stage_key="developer",
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
                    integration_kwargs = {}
                    if collab_run is not None:
                        await self._run_stage_clarifications(
                            build, collab_run, AgentType.INTEGRATION, emit,
                            blueprint=blueprint, design=design, integrations=integrations,
                        )
                        integration_kwargs = self._decisions_kwargs(build)
                    try:
                        int_result = await self._stage_call(
                            build, "integration", AgentType.INTEGRATION,
                            lambda: self.integration.integrate(integrations, files, user_id=build.user_id, build_id=build.id, project_id=build.project_id, **integration_kwargs),
                            usable=_usable_dict,
                        )
                    except (LedgerRefused, QuotaRefused) as exc:
                        # 7c: refused after the code exists -> INCOMPLETE.
                        await self._stop_incomplete(build, "integration", exc, emit)
                        int_result = None
                    if int_result is not None:
                        files.update(int_result.get("files", {}))
                        await persist_files(files)
                        await self._complete_agent(
                            build, AgentType.INTEGRATION, emit,
                            output=int_result.get("instructions", ""),
                            files_changed=list(int_result.get("files", {}).keys()),
                            stage_key="integration",
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
            # A1: the ledger build's quote fixes N; legacy builds use the
            # module bound (the same setting).
            ledger_run = current_ledger_run()
            max_debug = ledger_run.debug_iterations if ledger_run is not None else MAX_DEBUG_ITERATIONS
            incomplete = False
            if ledger_run is not None and iteration > 0:
                incomplete = await self._resume_debug_pass(
                    build, ledger_run, iteration, files, blueprint, emit, persist_files, collab_run,
                )
            while not incomplete:
                pm_key = f"pm#{iteration}"
                recovered = self._recover_stage_output(build, pm_key)
                if recovered is not None:
                    # Committed by an earlier attempt: reuse it, no new call.
                    validation = recovered
                else:
                    await self._start_agent(build, AgentType.PM, emit, skip_credits=byok_active)
                    try:
                        validation = await self._stage_call(
                            build, pm_key, AgentType.PM,
                            lambda: self.pm.validate(blueprint, files, user_id=build.user_id, build_id=build.id, project_id=build.project_id),
                            usable=_usable_dict,
                        )
                    except (LedgerRefused, QuotaRefused) as exc:
                        # 7c / QT-4: the code exists, the validation cannot
                        # run -> COMPLETED with the stage INCOMPLETE.
                        await self._stop_incomplete(build, pm_key, exc, emit)
                        incomplete = True
                        break
                    await self._complete_agent(
                        build, AgentType.PM, emit,
                        output=json.dumps(validation),
                        stage_key=pm_key,
                    )
                    await self._evaluate_agent_output(build.id, "pm", json.dumps(validation), emit)
                    await self._emit_output(build, "pm", emit, validation)

                errors = self._validation_errors(validation, sandbox_errors)
                sandbox_errors = []

                if not errors:
                    break

                if iteration >= max_debug:
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
                if await self._debug_pass(
                    build, f"debug#{iteration}", iteration, files, errors, blueprint, emit, persist_files, collab_run,
                ):
                    incomplete = True
                    break

            # --- 8. DONE ---
            build.status = BuildStatus.SUCCESS
            build.completed_at = utcnow()
            if ledger_run is not None and ledger_run.incomplete_stages:
                # A1 records which stages a ceiling or quota stopped; the
                # quality status itself is B2's (§11, §15.1).
                build.quality = ledger_run.quality_fields(build.quality).get("quality")
                validation = dict(validation or {})
                validation["incomplete_stages"] = list(ledger_run.incomplete_stages)

            # Attach the final (post-debug-loop) moderation + CSP reports so
            # users see any non-blocking warnings even when blocking issues were
            # remediated.
            final_moderation = await scan_code(files)
            validation["moderation"] = final_moderation.to_dict() if final_moderation else None
            validation["csp"] = csp_report.to_dict()
            # Foundation C: report-only static security scan of the final
            # files, on build.static_security and validation["static_security"].
            # No quality effect, no credits, no provider call; never raises.
            await static_security.attach_report(build, validation, files, static_security_config)

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
            if current_ledger_run() is not None:
                # A1 (F22, LC-1): the task decides whether a retry follows;
                # `failed` is persisted and `build_failed` emitted only for a
                # terminal failure. No step stays RUNNING (I-9).
                for step in build.agents:
                    if step.status == BuildStatus.RUNNING:
                        step.status = BuildStatus.FAILED
                        step.completed_at = utcnow()
                        step.error = str(e)[:500]
                        step.outcome = step.outcome or "failed"
                        if step.agent_profile_id:
                            try:
                                await self._agent_registry.record_task_result(
                                    build.project_id, step.agent_profile_id, success=False,
                                )
                            except Exception:
                                logger.debug("Agent registry record_task_result failed", exc_info=True)
                raise
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

    # ------------------------------------------------------------------ #
    # A1 build ledger (core/build_ledger.py). Every helper below is a
    # plain call when the build is not a ledger build (flag off, or a
    # build admitted before ledger_v2).
    # ------------------------------------------------------------------ #

    async def _dispatch(
        self,
        build: Build,
        stage_key: str,
        agent_type: Optional[AgentType],
        call: Callable[[], Awaitable[Any]],
        *,
        usable: Optional[Callable[[Any], bool]] = None,
        mandatory: Optional[bool] = None,
        commit: bool = False,
        on_unusable: str = "raise",
    ) -> Tuple[Any, Optional["build_ledger.OpHandle"]]:
        """One ledger operation around ``call``: W1/W2 (``begin``), the call
        inside A2's ``operation_scope``, W5 (``usable``), W4 (journal), then
        either W7 now (``commit``) or the handle is left pending for
        ``_complete_agent``. A journaled response from an interrupted
        attempt is used instead of calling again.

        Returns ``(result, handle)``; ``handle`` is None for a legacy build
        and for unusable output with ``on_unusable="no_change"``."""
        run = current_ledger_run()
        if run is None:
            return await call(), None
        handle = await run.begin(
            stage_key, agent=agent_type.value if agent_type is not None else None, mandatory=mandatory,
        )
        if handle is None:
            raise OperationSkipped(stage_key)
        if handle.journaled:
            result = handle.journal_result
        else:
            with handle.scope():
                try:
                    result = await call()
                except (Exception, asyncio.CancelledError) as exc:
                    # Not other BaseExceptions: a process that is dying
                    # (SystemExit, KeyboardInterrupt) writes nothing more; the
                    # open dispatch is what recovery reads (§8.6).
                    await run.fail_from_exception(handle, exc)
                    if handle.dispatch_no >= 2 and isinstance(exc, Exception) and not isinstance(
                        exc, (build_ledger.AttemptSuperseded, LedgerRefused, QuotaRefused)
                    ):
                        # RT-3: the recovery dispatch failed; no third one.
                        raise RecoveryExhausted(stage_key) from exc
                    raise
        # A journaled result passed W5 before it was journaled (unusable
        # output is never journaled), so it is not re-judged against state
        # its own W6 may already have changed.
        if usable is not None and not handle.journaled and not usable(result):
            if on_unusable == "no_change":
                await run.fail(handle, "no_change")
                return result, None
            await run.fail(handle, "unusable_output")
            raise UnusableOutput(stage_key)
        await run.journal(handle, result)
        if commit:
            build.credits_used = run.consumed + run.charge_for(handle)
            await run.commit(handle)
            build.credits_used = run.consumed
        else:
            run.pending[stage_key] = handle
        return result, handle

    async def _stage_call(self, build: Build, stage_key: str, agent_type: AgentType,
                          call: Callable[[], Awaitable[Any]], *, usable=None) -> Any:
        result, _ = await self._dispatch(build, stage_key, agent_type, call, usable=usable)
        return result

    async def _optional_call(self, build: Build, stage_key: str, agent_type: Optional[AgentType],
                             call: Callable[[], Awaitable[Any]], *, usable=None, default: Any = None) -> Any:
        """An optional, separately recorded operation (question passes, the
        interactive clarify; price 0, C3): committed at once; interrupted
        on a previous attempt -> skipped with ``default``."""
        try:
            result, _ = await self._dispatch(
                build, stage_key, agent_type, call, usable=usable, mandatory=False, commit=True,
            )
        except (OperationSkipped, UnusableOutput):
            return default
        return result

    def _ledger_hooks(self, build: Build) -> Optional[LedgerCommsHooks]:
        run = current_ledger_run()
        return LedgerCommsHooks(run, build) if run is not None and run.build_id == build.id else None

    def _build_filter(self, build: Build) -> Dict[str, Any]:
        """A ledger build's writes are fenced on the attempt's token."""
        run = current_ledger_run()
        if run is not None and run.build_id == build.id:
            return run.fence()
        return {"id": build.id}

    @staticmethod
    def _note_integrations(blueprint: Any) -> None:
        run = current_ledger_run()
        if run is not None and isinstance(blueprint, dict):
            run.integrations = bool(blueprint.get("integrations"))

    @staticmethod
    def _recover_stage_output(build: Build, stage_key: str) -> Optional[dict]:
        """The committed output of ``stage_key`` from an earlier attempt
        (PM passes restart from validation on resume; reuse, do not
        re-run and re-charge)."""
        run = current_ledger_run()
        op = run.completed(stage_key) if run is not None else None
        if op is None:
            return None
        for step in build.agents:
            if step.operation_id == op["operation_id"] and step.status == BuildStatus.SUCCESS:
                try:
                    value = json.loads(step.output)
                except (TypeError, ValueError):
                    return None
                return value if isinstance(value, dict) else None
        return None

    async def _stop_incomplete(self, build: Build, stage_key: str, exc: Exception, emit: Callable) -> None:
        """7c / QT-4: a mandatory stage refused after the code exists. The
        build completes with the stage recorded as incomplete; nothing is
        charged for it."""
        reason = getattr(exc, "reason", None) or type(exc).__name__
        run = current_ledger_run()
        if run is not None:
            run.record_incomplete(stage_key, reason)
        for step in build.agents:
            if step.status == BuildStatus.RUNNING:
                step.status = BuildStatus.FAILED
                step.completed_at = utcnow()
                step.error = f"refused: {reason}"
                step.outcome = "refused"
        logger.warning("Build %s: %s refused (%s); completing with the stage incomplete", build.id, stage_key, reason)
        await emit(WSEvent(
            type=WSEventType.AGENT_UPDATE,
            build_id=build.id,
            data={"agent": "orchestrator", "message": f"Skipped {stage_key}: {reason}", "incomplete": stage_key},
        ))

    @staticmethod
    def _validation_errors(validation: dict, sandbox_errors: List[str]) -> List[str]:
        errors = list(sandbox_errors)
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
        return errors

    async def _debug_pass(
        self,
        build: Build,
        debug_key: str,
        iteration: int,
        files: dict,
        errors: List[str],
        blueprint: dict,
        emit: Callable,
        persist_files: Callable,
        collab_run: Optional[_CollabRun],
    ) -> bool:
        """One debug pass (``debug#k``). Returns True when a ceiling or
        quota refused it (the loop stops; the stage is incomplete)."""
        snapshot = dict(files)
        try:
            patched, handle = await self._dispatch(
                build, debug_key, AgentType.DEBUGGER,
                lambda: self.developer.patch_files(
                    files, "\n".join(errors), blueprint,
                    user_id=build.user_id, build_id=build.id, project_id=build.project_id,
                    **(self._decisions_kwargs(build) if collab_run is not None else {}),
                ),
                usable=lambda r: _changes_files(r, snapshot),
                on_unusable="no_change",
            )
        except (LedgerRefused, QuotaRefused) as exc:
            await self._stop_incomplete(build, debug_key, exc, emit)
            return True
        patched = patched if isinstance(patched, dict) else {}
        files.update(patched.get("files", {}))
        await persist_files(files)
        no_change = current_ledger_run() is not None and handle is None
        await self._complete_agent(
            build, AgentType.DEBUGGER, emit,
            output=("No changes" if no_change else f"Patched {len(patched.get('files', {}))} files"),
            files_changed=list(patched.get("files", {}).keys()),
            stage_key=debug_key,
            outcome="no_change" if no_change else None,
        )

        await emit(WSEvent(
            type=WSEventType.FILE_UPDATE,
            build_id=build.id,
            data={"delta": {"changed": patched.get("files", {}), "deleted": []}, "debug_iteration": iteration}
        ))
        return False

    async def _resume_debug_pass(
        self,
        build: Build,
        run: "build_ledger.LedgerRun",
        iteration: int,
        files: dict,
        blueprint: dict,
        emit: Callable,
        persist_files: Callable,
        collab_run: Optional[_CollabRun],
    ) -> bool:
        """Resume inside the debug loop: ``debug#k`` an earlier attempt left
        open gets its journal or recovery dispatch (C9) with the errors of
        the PM pass before it, instead of being silently dropped."""
        debug_key = f"debug#{iteration}"
        _, op = run.latest(debug_key)
        if op is None or op.get("status") not in build_ledger.OPEN:
            return False
        previous = self._recover_stage_output(build, f"pm#{iteration - 1}") or {}
        errors = self._validation_errors(previous, []) if previous else ["Resume the interrupted debug pass"]
        await self._start_agent(build, AgentType.DEBUGGER, emit)
        return await self._debug_pass(
            build, debug_key, iteration, files, errors, blueprint, emit, persist_files, collab_run,
        )

    @staticmethod
    def _worst_case_cost_after_developer(build: Build, blueprint: dict) -> int:
        """Most the stages after the developer can still charge: integration
        (when the blueprint has any), the first PM pass, and every remaining
        debug iteration (debugger + PM re-validation) up to
        MAX_DEBUG_ITERATIONS."""
        return Orchestrator._worst_case_cost_after(build, blueprint, AgentType.DEVELOPER)

    @staticmethod
    def _worst_case_cost_after(build: Build, blueprint: dict, stage: AgentType) -> int:
        """Most the stages after ``stage`` (whose own charge has already been
        taken by _start_agent) can still charge, debug loop included. The
        same set-aside rule as the legacy clarification policy, applied to
        the Designer, Developer and Integration question passes."""
        remaining_debug = max(0, MAX_DEBUG_ITERATIONS - build.debug_iterations)
        cost = settings.credits_pm + remaining_debug * (settings.credits_debug + settings.credits_pm)
        if stage in (AgentType.DESIGNER, AgentType.DEVELOPER) and blueprint.get("integrations"):
            cost += settings.credits_integration
        if stage == AgentType.DESIGNER:
            cost += settings.credits_developer
        return cost

    def _clarification_policy(
        self, build: Build, blueprint: dict, byok_active: bool, reserved_credits: Optional[int]
    ) -> CommunicationPolicy:
        """Budget rules for Developer -> Architect clarifications.

        BYOK builds are unmetered (no charge, question limit only), mirroring
        _start_agent's skip_credits. Metered builds may only spend what the
        upfront reservation still covers after setting aside the worst case
        of everything that runs after the developer, debug loop included.
        Clarifications therefore only ever use reservation headroom the
        pipeline provably can't need, and can never be the reason a build
        ends above its reservation. An unknown reservation, the free first
        build (reserved 0), or a reservation that doesn't cover the
        pipeline's own worst case leaves no headroom, so the phase is
        skipped."""
        ceiling: Optional[int]
        if byok_active:
            ceiling = None
        else:
            ceiling = (reserved_credits or 0) - self._worst_case_cost_after_developer(build, blueprint)
        return CommunicationPolicy(
            max_questions=settings.developer_clarification_max_questions,
            credit_cost=settings.credits_clarification,
            credit_ceiling=ceiling,
            timeout_seconds=settings.agent_message_timeout_seconds,
            ledger=self._ledger_hooks(build),
        )

    async def _run_developer_clarifications(
        self,
        build: Build,
        blueprint: dict,
        design: dict,
        emit: Callable,
        byok_active: bool,
        reserved_credits: Optional[int],
    ) -> list[dict]:
        """Let the Developer ask the Architect about ambiguities before it
        generates files. Returns the answered exchanges as
        [{"question", "answer"}] for generate_files.

        Resume: exchanges already on build.agent_messages (from a crashed
        attempt) are reused -- ANSWERED ones as-is with no new charge,
        PENDING ones delivered now -- and the Developer is not asked for a
        fresh list of questions.

        Never raises: the build always continues, with whatever answers it
        got, exactly as it did before clarifications existed."""
        policy = self._clarification_policy(build, blueprint, byok_active, reserved_credits)
        if policy.max_questions <= 0:
            return []

        architect_context = {"blueprint": blueprint, "design": design}

        async def architect_responder(question: str, context: dict) -> str:
            return await self.architect.answer(
                question, context["blueprint"], context.get("design"),
                user_id=build.user_id, build_id=build.id, project_id=build.project_id,
            )

        comms = InProcessAgentCommunication(
            build, emit, responders={"architect": architect_responder}, policy=policy,
        )

        try:
            messages = comms.messages_between("developer", "architect")
            if not messages:
                if not policy.can_afford(build.credits_used):
                    logger.info(
                        "Build %s: skipping developer clarifications -- no reservation headroom "
                        "(reserved=%s, used=%s, ceiling=%s).",
                        build.id, reserved_credits, build.credits_used, policy.credit_ceiling,
                    )
                    return []
                try:
                    # C3: question generation is a recorded operation priced
                    # 0 (included in the Developer price).
                    questions = await self._optional_call(
                        build, "question_pass:developer", AgentType.DEVELOPER,
                        lambda: asyncio.wait_for(
                            self.developer.identify_questions(
                                blueprint, design, policy.max_questions,
                                user_id=build.user_id, build_id=build.id, project_id=build.project_id,
                            ),
                            timeout=policy.timeout_seconds,
                        ),
                        usable=lambda r: isinstance(r, list), default=[],
                    )
                except Exception:
                    logger.warning("Build %s: developer question pass failed; continuing without clarifications.", build.id, exc_info=True)
                    return []
                questions = (questions or [])[: policy.max_questions]
                if not questions:
                    return []

                await emit(WSEvent(
                    type=WSEventType.AGENT_UPDATE,
                    build_id=build.id,
                    data={"agent": "developer", "message": f"Asking the Architect {len(questions)} clarifying question{'s' if len(questions) != 1 else ''}"},
                ))
                conversation_id = str(uuid.uuid4())
                messages = [
                    await comms.submit("developer", "architect", q, conversation_id=conversation_id)
                    for q in questions
                ]
            else:
                logger.info("Build %s: resuming -- reusing %d recorded developer clarification(s).", build.id, len(messages))

            for message in messages:
                await comms.resolve(message, architect_context)
        except Exception:
            logger.warning("Build %s: clarification phase failed; continuing with answers so far.", build.id, exc_info=True)

        return [
            {"question": m.question, "answer": m.answer}
            for m in comms.messages_between("developer", "architect")
            if m.status == AgentMessageStatus.ANSWERED and m.answer
        ]

    # ------------------------------------------------------------------ #
    # Collaboration protocol v2 (docs/architecture/collaboration-protocol-v2.md)
    # ------------------------------------------------------------------ #

    async def _start_collaboration(
        self, build: Build, byok_active: bool, reserved_credits: Optional[int]
    ) -> Optional[_CollabRun]:
        """Decide which protocol this build runs, from its snapshot.

        A first attempt (no steps recorded yet) with the flag on takes the
        snapshot and persists it before anything else happens; if that write
        fails the build runs the legacy protocol. A resumed build always uses
        its snapshot -- or, without one, the legacy protocol -- whatever the
        current setting says. Never raises."""
        snapshot = build.collab_config
        if snapshot is None:
            if build.agents or not settings.collab_protocol_v2:
                return None
            build.collab_config = collab.build_collab_snapshot(settings, reserved_credits)
            if not await self._persist_collab_state(build):
                logger.warning("Build %s: could not persist the collaboration snapshot; running protocol v1.", build.id)
                build.collab_config = None
                return None
            snapshot = build.collab_config
        config = CollabConfig.from_snapshot(snapshot)
        if config is None:
            return None
        return _CollabRun(
            config=config,
            byok_active=byok_active,
            reserved_credits=reserved_credits,
            deadline=time.monotonic() + settings.build_timeout,
        )

    async def _persist_collab_state(self, build: Build) -> bool:
        """Write the snapshot and the Decisions/Escalations lanes. The task's
        emit() persists agent_messages and credits but not these, so lane
        events are persisted here before they are broadcast. Never raises."""
        try:
            db = await get_db()
            await db.builds.update_one(
                self._build_filter(build),
                {"$set": {
                    "collab_config": build.collab_config,
                    "blackboard": [e.model_dump() for e in build.blackboard],
                    "escalations": [x.model_dump() for x in build.escalations],
                }},
            )
            return True
        except Exception:
            logger.warning("Build %s: persisting collaboration state failed.", build.id, exc_info=True)
            return False

    @staticmethod
    def _decisions_kwargs(build: Build) -> dict:
        decisions = collab.decisions_for_prompt(build)
        return {"decisions": decisions} if decisions else {}

    def _pipeline_agents(self) -> Dict[str, Any]:
        return {
            "architect": self.architect,
            "designer": self.designer,
            "developer": self.developer,
            "integration": self.integration,
            "pm": self.pm,
            "business_improver": self.business_model,
        }

    def _collab_responders(self, build: Build) -> Dict[str, Callable]:
        """Responders registered from AGENT_CAPABILITIES, never ad hoc. Each
        gets orchestrator-selected, build-scoped context only, plus the
        blackboard's current decisions so its answer stays consistent."""
        agents = self._pipeline_agents()
        responders: Dict[str, Callable] = {}
        for name, capability in AGENT_CAPABILITIES.items():
            if not (capability.routable and capability.answers and capability.responder):
                continue
            method = getattr(agents.get(name), capability.responder, None)
            if method is None:
                continue

            async def responder(question: str, context: dict, _method=method) -> Any:
                return await _method(
                    question, context.get("blueprint"), context.get("design"),
                    asker=context.get("asker"),
                    decisions=collab.decisions_for_prompt(build),
                    user_id=build.user_id, build_id=build.id, project_id=build.project_id,
                )

            responders[name] = responder
        return responders

    def _collab_policy(self, build: Build, run: _CollabRun, blueprint: dict, stage: AgentType) -> CommunicationPolicy:
        """Today's accounting semantics under the snapshot's limits: each
        answered message costs the per-question credit cost, only out of
        reservation headroom the rest of the pipeline provably cannot need;
        BYOK is unmetered but still limited."""
        ceiling: Optional[int]
        if run.byok_active:
            ceiling = None
        else:
            ceiling = (run.reserved_credits or 0) - self._worst_case_cost_after(build, blueprint, stage)
        return CommunicationPolicy(
            max_questions=run.config.max_messages,
            credit_cost=run.config.credit_cost,
            credit_ceiling=ceiling,
            timeout_seconds=run.config.message_timeout_s,
            max_question_chars=run.config.max_content_chars,
            protocol_version=collab.PROTOCOL_VERSION,
            routes=run.config.routes,
            max_answer_chars=run.config.max_answer_chars,
            deadline=run.deadline - run.config.time_reserve_s,
            ledger=self._ledger_hooks(build),
        )

    def _collab_comms(self, build: Build, emit: Callable, policy: CommunicationPolicy) -> InProcessAgentCommunication:
        async def persist_lanes() -> None:
            await self._persist_collab_state(build)

        return InProcessAgentCommunication(
            build, emit,
            responders=self._collab_responders(build),
            policy=policy,
            capabilities=AGENT_CAPABILITIES,
            persist_lanes=persist_lanes,
        )

    async def _identify_stage_questions(
        self,
        build: Build,
        stage: AgentType,
        limit: int,
        recipients: List[str],
        blueprint: dict,
        design: Optional[dict],
        integrations: Optional[list],
    ) -> Any:
        ids = {"user_id": build.user_id, "build_id": build.id, "project_id": build.project_id}
        decisions = collab.decisions_for_prompt(build)
        if stage == AgentType.DEVELOPER:
            return await self.developer.identify_questions(
                blueprint, design, limit, recipients=recipients, decisions=decisions, **ids,
            )
        if stage == AgentType.DESIGNER:
            return await self.designer.identify_questions(
                blueprint, limit, recipients=recipients, decisions=decisions, **ids,
            )
        if stage == AgentType.INTEGRATION:
            return await self.integration.identify_questions(
                integrations or [], blueprint, limit, recipients=recipients, decisions=decisions, **ids,
            )
        return []

    async def _run_stage_clarifications(
        self,
        build: Build,
        run: _CollabRun,
        stage: AgentType,
        emit: Callable,
        blueprint: dict,
        design: Optional[dict] = None,
        integrations: Optional[list] = None,
    ) -> None:
        """v2 question pass for ``stage`` (Designer, Developer, Integration).

        The stage proposes ``{to, question, key}`` items; the sender is the
        stage itself, set here. Every question is recorded before any is
        delivered; the router authorizes each against the snapshot's route
        table. Answers become blackboard decisions; a conflicting answer
        opens an escalation. On resume, messages this stage already recorded
        are reused (answered ones without a new charge) and no fresh
        question pass runs.

        Never raises, except BuildCancelled (the user cancelled an
        escalation gate): the build continues with whatever was decided."""
        sender = stage.value
        cap = run.config.stage_question_cap(sender)
        recipients = run.config.recipients_for(sender)
        if cap <= 0 or not recipients:
            return
        policy = self._collab_policy(build, run, blueprint, stage)
        if policy.max_questions <= 0:
            return
        comms = self._collab_comms(build, emit, policy)
        context = {"blueprint": blueprint, "design": design}

        try:
            messages = comms.messages_from(sender)
            if not messages:
                limit = min(cap, policy.max_questions - comms.delivered_count())
                time_left = (policy.deadline or 0) - time.monotonic()
                if limit <= 0 or time_left < 1:
                    return
                if not policy.can_afford(build.credits_used):
                    logger.info(
                        "Build %s: skipping %s clarifications -- no reservation headroom "
                        "(reserved=%s, used=%s, ceiling=%s).",
                        build.id, sender, run.reserved_credits, build.credits_used, policy.credit_ceiling,
                    )
                    return
                try:
                    raw = await self._optional_call(
                        build, f"question_pass:{sender}", stage,
                        lambda: asyncio.wait_for(
                            self._identify_stage_questions(build, stage, limit, recipients, blueprint, design, integrations),
                            timeout=min(policy.timeout_seconds, time_left),
                        ),
                        usable=lambda r: r is not None, default=None,
                    )
                except Exception:
                    logger.warning("Build %s: %s question pass failed; continuing without clarifications.", build.id, sender, exc_info=True)
                    return
                proposals = collab.normalize_question_proposals(raw, recipients[0], run.config.max_content_chars)[:limit]
                if not proposals:
                    return

                await emit(WSEvent(
                    type=WSEventType.AGENT_UPDATE,
                    build_id=build.id,
                    data={"agent": sender, "message": f"Asking {len(proposals)} clarifying question{'s' if len(proposals) != 1 else ''}"},
                ))
                conversation_id = str(uuid.uuid4())
                refs = ["blueprint"] + (["design"] if design else [])
                messages = []
                for proposal in proposals:
                    key = proposal["key"] or collab.fallback_key(proposal["question"], proposal["to"])
                    messages.append(await comms.submit(
                        sender, proposal["to"], proposal["question"],
                        conversation_id=conversation_id, subject=key,
                        payload={"decision_key": key}, artifact_refs=refs,
                    ))
            else:
                logger.info("Build %s: resuming -- reusing %d recorded %s message(s).", build.id, len(messages), sender)

            for message in messages:
                await comms.resolve(message, context)
                await self._apply_answer_to_blackboard(build, run, comms, emit, message)
        except BuildCancelled:
            raise
        except Exception:
            logger.warning("Build %s: %s clarification phase failed; continuing with answers so far.", build.id, sender, exc_info=True)

    async def _apply_answer_to_blackboard(
        self,
        build: Build,
        run: _CollabRun,
        comms: InProcessAgentCommunication,
        emit: Callable,
        message: AgentMessage,
    ) -> None:
        """An answered clarification becomes a ``decision`` entry. The same
        key with a different value never overwrites: it opens an escalation.
        Idempotent, so a resumed build can replay it for every reused
        message."""
        if message.status != AgentMessageStatus.ANSWERED or not message.answer:
            return
        if collab.entry_for_message(build, message.message_id) is not None:
            return
        escalation = collab.escalation_for_message(build, message.message_id)
        if escalation is not None:
            if escalation.state == EscalationState.OPEN:
                await self._settle_escalation(build, run, comms, emit, escalation)
            return

        key = collab.normalize_key(message.payload.get("decision_key")) or collab.fallback_key(message.question, message.recipient)
        existing = collab.active_entry(build, key)
        if existing is None:
            await comms.record_decision(
                key, message.answer, owner_agent=message.recipient,
                rationale=collab.clean_text(f"Answer to the {message.sender}'s clarification: {message.question}", 600),
                source_message_id=message.message_id,
            )
            return
        if collab.same_value(existing.value, message.answer):
            return

        owner = collab.decision_owner_for(key)
        escalation = await comms.escalate(
            raised_by=message.sender,
            decision_owner=owner,
            subject=f"Conflicting decisions for {key}",
            detail=(
                f"Recorded by the {existing.owner_agent}: {existing.value}\n"
                f"New answer from the {message.recipient} to the {message.sender}'s question "
                f"\"{message.question}\": {message.answer}"
            ),
            options=[existing.value, message.answer],
            conflict={
                "key": key,
                "existing_value": existing.value,
                "proposed_value": message.answer,
                "existing_entry_id": existing.entry_id,
                "proposed_by": message.recipient,
                "source_message_id": message.message_id,
            },
        )
        await self._settle_escalation(build, run, comms, emit, escalation)

    def _escalation_gate_wait(self, run: _CollabRun) -> Optional[float]:
        """How long an escalation gate may wait: at most the snapshot's gate
        timeout, and never into the time the rest of the pipeline needs.
        None when that leaves too little to be worth asking."""
        remaining = run.deadline - time.monotonic() - run.config.time_reserve_s
        wait = min(run.config.escalation_gate_timeout_s, remaining)
        return wait if wait >= _MIN_ESCALATION_GATE_SECONDS else None

    async def _settle_escalation(
        self,
        build: Build,
        run: _CollabRun,
        comms: InProcessAgentCommunication,
        emit: Callable,
        escalation: Escalation,
    ) -> None:
        """Resolve an open escalation. Non-interactive builds: the decision
        owner decides, with a recorded rationale. Interactive builds: the
        user is asked through an ``escalation`` gate; if the gate times out
        (or there is no time left to ask) the decision owner's default
        applies (``resolved_by = "default"``). A resolution that changes the
        value adds a new blackboard version superseding the old entry; the
        escalation and the blackboard change are persisted in one write."""
        conflict = escalation.conflict or {}
        key = conflict.get("key")
        existing = collab.entry_by_id(build, conflict.get("existing_entry_id"))
        if existing is None or existing.superseded_by is not None:
            existing = collab.active_entry(build, key) if key else None
        proposed = conflict.get("proposed_value") or (escalation.options[-1] if escalation.options else "")
        owner = escalation.decision_owner
        default_value, default_rationale = collab.owner_default_resolution(
            owner, existing, proposed, conflict.get("proposed_by"),
        )
        resolution, resolved_by, rationale = default_value, f"agent:{owner}", default_rationale

        if build.interactive:
            wait = self._escalation_gate_wait(run)
            if wait is None:
                resolved_by = "default"
                rationale = f"{default_rationale} There was not enough time left in the build to ask you."
            else:
                try:
                    response = await self._wait_for_gate(
                        build, emit, stage=escalation.raised_by, agent=owner, kind="escalation",
                        timeout_seconds=wait,
                        extra={
                            "escalation_id": escalation.escalation_id,
                            "subject": escalation.subject,
                            "detail": escalation.detail,
                            "options": list(escalation.options),
                        },
                    )
                except BuildCancelled:
                    collab.close_escalation(
                        escalation, EscalationState.EXPIRED, None, None,
                        "The build was cancelled before this escalation was resolved.",
                    )
                    await comms.publish_lanes(resolved=[escalation])
                    raise
                resolution, resolved_by, rationale = await self._escalation_gate_outcome(
                    run, escalation, response, default_value, default_rationale,
                )

        changed = []
        if key and (existing is None or not collab.same_value(resolution, existing.value)):
            source = conflict.get("source_message_id") if collab.same_value(resolution, proposed) else None
            entry = collab.add_entry(
                build, key, resolution, "user" if resolved_by == "user" else owner,
                rationale=rationale, source_message_id=source, supersedes=existing,
            )
            changed = ([existing] if existing else []) + [entry]
        collab.close_escalation(escalation, EscalationState.RESOLVED, resolution, resolved_by, rationale)
        await comms.publish_lanes(entries=changed, resolved=[escalation])

    @staticmethod
    async def _escalation_gate_outcome(
        run: _CollabRun,
        escalation: Escalation,
        response: dict,
        default_value: str,
        default_rationale: str,
    ) -> Tuple[str, str, str]:
        """(resolution, resolved_by, rationale) from an escalation gate's
        response: ``answers[0]`` is the chosen option (free text is accepted
        as the user's own value, screened like any other content); a plain
        approve accepts the decision owner's recommendation; an unanswered
        gate falls back to the decision owner (``default``)."""
        if response.get("auto"):
            return default_value, "default", f"{default_rationale} No answer arrived before the gate timed out."
        answers = response.get("answers") or []
        chosen = answers[0].strip() if answers and isinstance(answers[0], str) else ""
        if response.get("action") == "answers" and chosen:
            match = next((o for o in escalation.options if collab.same_value(o, chosen)), None)
            if match is None:
                match, _ = await collab.screen_text(chosen, run.config.max_answer_chars)
            if match:
                return match, "user", "Chosen by the user."
        return default_value, "user", f"The user accepted the decision owner's recommendation. {default_rationale}"

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
        timeout_seconds: Optional[float] = None,
        extra: Optional[dict] = None,
    ) -> dict:
        """Pause an interactive build until the user responds via
        POST /builds/{build_id}/gate (which writes pending_gate.response),
        the gate times out (auto-approve), or the user cancels.

        timeout_seconds overrides settings.gate_timeout (escalation gates use
        it to stay inside the build's time budget); extra adds kind-specific
        data to the gate, e.g. an escalation's id, subject, detail and
        options.

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
        timeout = settings.gate_timeout if timeout_seconds is None else timeout_seconds
        gate = {
            "gate_id": str(uuid.uuid4()),
            "stage": stage,
            "agent": agent,
            "kind": kind,
            "questions": questions or [],
            "timeout_seconds": timeout,
            "requested_at": utcnow().isoformat(),
        }
        for field_name, value in (extra or {}).items():
            gate.setdefault(field_name, value)
        await db.builds.update_one(self._build_filter(build), {"$set": {"pending_gate": gate}})
        await emit(WSEvent(type=WSEventType.GATE_REQUEST, build_id=build.id, data=gate))

        response: dict = {"action": "approve", "auto": True}
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            doc = await db.builds.find_one({"id": build.id}, {"_id": 0, "pending_gate": 1})
            pending = (doc or {}).get("pending_gate") or {}
            if pending.get("gate_id") == gate["gate_id"] and pending.get("response"):
                response = pending["response"]
                break
            await asyncio.sleep(settings.gate_poll_interval)

        await db.builds.update_one(self._build_filter(build), {"$set": {"pending_gate": None}})
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
        LLM call actually uses; this mirrors it for the credit ledger.

        Inside a build, the processing boundary snapshotted at admission is
        authoritative (§5.2, BY-7): a key added or removed mid-build must
        not change how this build is charged or which credential it uses."""
        boundary = current_boundary()
        if boundary is not None:
            return boundary.is_byok
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
        # A1: a ledger build is charged at W7 for usable, persisted output
        # only (core/build_ledger.py), never when a stage starts.
        if not skip_credits and current_ledger_run() is None:
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
        stage_key: Optional[str] = None,
        extra_set: Optional[Dict[str, Any]] = None,
        outcome: Optional[str] = None,
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

        run = current_ledger_run()
        handle = run.pending.get(stage_key) if (run is not None and stage_key) else None
        if completed_step is not None and run is not None:
            completed_step.outcome = outcome or ("completed" if handle is not None else completed_step.outcome)
        if handle is not None:
            # W7: the operation outcome, its credits, credits_used and the
            # step outcome in one fenced write.
            if completed_step is not None:
                completed_step.operation_id = handle.operation_id
            build.credits_used = run.consumed + run.charge_for(handle)
            await run.commit(handle, extra_set={
                "agents": [a.model_dump() for a in build.agents],
                **(extra_set or {}),
            })
            build.credits_used = run.consumed

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
