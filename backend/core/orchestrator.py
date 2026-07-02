import json
from typing import Callable
from datetime import datetime

from agents.architect import ArchitectAgent
from agents.designer import DesignerAgent
from agents.developer import DeveloperAgent
from agents.integration import IntegrationAgent
from agents.pm import PMAgent
from agents.business_model import BusinessModelAgent
from core.models import (
    Build, BuildStatus, AgentStep, AgentType, WSEvent, WSEventType
)
from core.config import get_settings

settings = get_settings()

MAX_DEBUG_ITERATIONS = 3


class Orchestrator:
    def __init__(self):
        self.architect = ArchitectAgent()
        self.designer = DesignerAgent()
        self.developer = DeveloperAgent()
        self.integration = IntegrationAgent()
        self.pm = PMAgent()
        self.business_model = BusinessModelAgent()

    async def run_build(
        self,
        build: Build,
        emit: Callable,  # async fn(WSEvent)
        sandbox_runner=None,
        conversation_history: list = None,
        existing_files: dict = None,
    ) -> tuple[Build, dict]:

        """
        Full pipeline: architect → business model → designer → developer → integration → PM → (debug loop via debugger)
        emit: coroutine that sends WSEvent to connected WebSocket clients

        conversation_history / existing_files: prior build's architect exchange
        and generated files, when this build amends an existing project instead
        of starting from scratch.

        Returns (build, files): build output no longer carries a `files` field
        (persisted separately in the build_files collection), so the generated
        files are returned alongside the build for the caller to persist.
        """
        files: dict = dict(existing_files) if existing_files else {}
        try:

            # --- 0. BUILD START ---
            await emit(WSEvent(
                type=WSEventType.BUILD_START,
                build_id=build.id,
                data={"project_id": build.project_id}
            ))

            # --- 1. ARCHITECT ---
            await self._start_agent(build, AgentType.ARCHITECT, emit)
            blueprint = await self.architect.blueprint(
                build.prompt,
                conversation_history=conversation_history,
                user_id=build.user_id,
                build_id=build.id,
                project_id=build.project_id,
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

            # --- 2. BUSINESS MODEL ---
            await self._start_agent(build, AgentType.BUSINESS_IMPROVER, emit)
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

            # --- 3. DESIGNER ---
            await self._start_agent(build, AgentType.DESIGNER, emit)
            design = await self.designer.design(blueprint, user_id=build.user_id, build_id=build.id, project_id=build.project_id)
            await self._complete_agent(build, AgentType.DESIGNER, emit, output=json.dumps(design))

            await emit(WSEvent(
                type=WSEventType.AGENT_UPDATE,
                build_id=build.id,
                data={"agent": "designer", "message": "Design complete"},
            ))

            # --- 4. DEVELOPER (with streaming) ---
            await self._start_agent(build, AgentType.DEVELOPER, emit)

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
            delta = {"changed": new_files, "deleted": []}
            await emit(WSEvent(
                type=WSEventType.FILE_UPDATE,
                build_id=build.id,
                data={"delta": delta}
            ))

            await emit(WSEvent(
                type=WSEventType.FILE_UPDATE,
                build_id=build.id,
                data={"files": files}
            ))


            await emit(WSEvent(
                type=WSEventType.AGENT_PROGRESS,
                build_id=build.id,
                data={"agent": "developer", "progress": 100, "message": "Files generated"}
            ))


            # --- 5. INTEGRATION ---
            integrations = blueprint.get("integrations", [])
            if integrations:
                await self._start_agent(build, AgentType.INTEGRATION, emit)
                int_result = await self.integration.integrate(integrations, files, user_id=build.user_id, build_id=build.id, project_id=build.project_id)
                files.update(int_result.get("files", {}))
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


            # --- 6. SANDBOX (best-effort static check, folded into the first PM pass) ---
            sandbox_errors = []
            if sandbox_runner:
                raw = await sandbox_runner.run(files)
                sandbox_errors = [line for line in raw.split("\n") if line.strip()] if raw else []

            # --- 7. PM VALIDATION + DEBUG LOOP ---
            # PM is the authority on whether the build needs another pass. If it
            # reports errors, the debugger (a specialized pass of the developer agent)
            # patches them, then PM re-validates, up to MAX_DEBUG_ITERATIONS times
            # before giving up.
            iteration = 0
            validation = {}
            while True:
                await self._start_agent(build, AgentType.PM, emit)
                validation = await self.pm.validate(blueprint, files, user_id=build.user_id, build_id=build.id, project_id=build.project_id)
                await self._complete_agent(
                    build, AgentType.PM, emit,
                    output=json.dumps(validation)
                )

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

                await self._start_agent(build, AgentType.DEBUGGER, emit)
                patched = await self.developer.patch_files(
                    files, "\n".join(errors), blueprint,
                    user_id=build.user_id, build_id=build.id, project_id=build.project_id,
                )
                files.update(patched.get("files", {}))
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
            build.completed_at = datetime.utcnow()

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

            await emit(WSEvent(
                type=WSEventType.FILE_UPDATE,
                build_id=build.id,
                data={"delta": {"changed": files, "deleted": []}}
            ))


        except Exception as e:
            build.status = BuildStatus.FAILED
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

    async def _start_agent(self, build: Build, agent_type: AgentType, emit: Callable):
        step = AgentStep(agent=agent_type, status=BuildStatus.RUNNING, started_at=datetime.utcnow())
        build.agents.append(step)
        # Deduct credits
        credit_map = {
            AgentType.ARCHITECT: settings.credits_architect,
            AgentType.DESIGNER: settings.credits_designer,
            AgentType.DEVELOPER: settings.credits_developer,
            AgentType.INTEGRATION: settings.credits_integration,
            AgentType.PM: settings.credits_pm,
            AgentType.BUSINESS_IMPROVER: settings.credits_business_model,
            AgentType.DEBUGGER: settings.credits_debug,
        }
        build.credits_used += credit_map.get(agent_type, 1)

        await emit(WSEvent(
            type=WSEventType.AGENT_START,
            build_id=build.id,
            data={"agent": agent_type.value}
        ))

    async def _complete_agent(
        self,
        build: Build,
        agent_type: AgentType,
        emit: Callable,
        output: str = "",
        files_changed: list = None,
    ):
        for step in build.agents:
            if step.agent == agent_type and step.status == BuildStatus.RUNNING:
                step.status = BuildStatus.SUCCESS
                step.completed_at = datetime.utcnow()
                step.output = output
                step.files_changed = files_changed or []
                break

        await emit(WSEvent(
            type=WSEventType.AGENT_COMPLETE,
            build_id=build.id,
            data={"agent": agent_type.value, "files_changed": files_changed or []}
        ))
