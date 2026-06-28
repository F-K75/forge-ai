import asyncio
import json
from typing import Callable, AsyncGenerator
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
        self.business_model = BusinessModelAgent()
        self.designer = DesignerAgent()
        self.developer = DeveloperAgent()
        self.integration = IntegrationAgent()
        self.pm = PMAgent()

    async def run_build(
        self,
        build: Build,
        emit: Callable,  # async fn(WSEvent)
        sandbox_runner=None,
    ) -> Build:

        """
        Full pipeline: architect → designer → developer → integration → PM → (debug loop)
        emit: coroutine that sends WSEvent to connected WebSocket clients
        """
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
                conversation_history=None,
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




            # --- 2. BUSINESS MODEL IMPROVER ---
            await self._start_agent(build, AgentType.BUSINESS_IMPROVER, emit)
            business_model = await self.business_model.improve(build.prompt, blueprint=blueprint)
            await self._complete_agent(
                build,
                AgentType.BUSINESS_IMPROVER,
                emit,
                output=json.dumps(business_model),
            )
            await emit(WSEvent(
                type=WSEventType.AGENT_UPDATE,
                build_id=build.id,
                data={"agent": "business_model", "message": "Business model updated"},
            ))
            await emit(WSEvent(
                type=WSEventType.AGENT_COMPLETE,
                build_id=build.id,
                data={"agent": "business_model", "files_changed": []},
            ))



            # --- 3. DESIGNER ---
            await self._start_agent(build, AgentType.DESIGNER, emit)
            design = await self.designer.design(blueprint)
            await self._complete_agent(build, AgentType.DESIGNER, emit, output=json.dumps(design))

            await emit(WSEvent(
                type=WSEventType.AGENT_UPDATE,
                build_id=build.id,
                data={"agent": "designer", "message": "Design complete"},
            ))

            # --- 3. DEVELOPER (with streaming) ---
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
                blueprint, design, stream_callback=stream_token
            )
            build.files.update(files_result.get("files", {}))

            await self._complete_agent(
                build, AgentType.DEVELOPER, emit,
                output=f"Generated {len(build.files)} files",
                files_changed=list(build.files.keys())
            )

            await emit(WSEvent(
                type=WSEventType.AGENT_UPDATE,
                build_id=build.id,
                data={"agent": "developer", "message": "Developer finished generating files"},
            ))

            await emit(WSEvent(
                type=WSEventType.FILE_UPDATE,
                build_id=build.id,
                data={"files": build.files}
            ))


            await emit(WSEvent(
                type=WSEventType.AGENT_PROGRESS,
                build_id=build.id,
                data={"agent": "developer", "progress": 100, "message": "Files generated"}
            ))


            # --- 4. INTEGRATION ---
            integrations = blueprint.get("integrations", [])
            if integrations:
                await self._start_agent(build, AgentType.INTEGRATION, emit)
                int_result = await self.integration.integrate(integrations, build.files)
                build.files.update(int_result.get("files", {}))
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


            # --- 5. SANDBOX (if available) ---
            errors = None
            if sandbox_runner:
                errors = await sandbox_runner.run(build.files)

            # --- 6. DEBUG LOOP ---
            iteration = 0
            while errors and iteration < MAX_DEBUG_ITERATIONS:
                build.status = BuildStatus.DEBUGGING
                build.debug_iterations += 1
                iteration += 1

                await emit(WSEvent(
                    type=WSEventType.DEBUG_START,
                    build_id=build.id,
                    data={"iteration": iteration, "errors": errors}
                ))

                patched = await self.developer.patch_files(
                    build.files, errors, blueprint
                )
                build.files.update(patched.get("files", {}))

                await emit(WSEvent(
                    type=WSEventType.FILE_UPDATE,
                    build_id=build.id,
                    data={"files": patched.get("files", {}), "debug_iteration": iteration}
                ))

                if sandbox_runner:
                    errors = await sandbox_runner.run(build.files)
                else:
                    errors = None

            # --- 7. PM VALIDATION ---
            await self._start_agent(build, AgentType.PM, emit)
            validation = await self.pm.validate(blueprint, build.files)
            await self._complete_agent(
                build, AgentType.PM, emit,
                output=json.dumps(validation)
            )

            # --- 8. DONE ---
            build.status = BuildStatus.SUCCESS
            build.completed_at = datetime.utcnow()

            await emit(WSEvent(
                type=WSEventType.BUILD_COMPLETE,
                build_id=build.id,
                data={
                    "files": build.files,
                    "validation": validation,
                    "credits_used": build.credits_used,
                }
            ))

            # Frontend expects preview_update/error events; we keep previewUrl best-effort.
            await emit(WSEvent(
                type=WSEventType.FILE_UPDATE,
                build_id=build.id,
                data={"preview_url": None, "files": build.files}
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


        return build

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
