from agents.base import BaseAgent
from agents.developer import parse_addressed_questions
from agents.json_utils import strip_markdown_fences
from core.collaboration import render_decisions_block, untrusted_block
from core.models import AgentType
from typing import Optional
import json


class DesignerAgent(BaseAgent):
    agent_type = AgentType.DESIGNER
    prompt_role = "designer"

    async def design(self, blueprint: dict, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None, decisions: Optional[list] = None) -> dict:
        """decisions: the build blackboard's decisions (collaboration
        protocol v2), e.g. the Architect's answers to the Designer's own
        structure questions."""
        content = f"Create design system for this app:\n{json.dumps(blueprint, indent=2)}"
        if decisions:
            content += render_decisions_block(decisions, "Decisions recorded for this build (follow them):")
        messages = [{"role": "user", "content": content}]
        response = await self.run(messages, max_tokens=3000, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)
        clean = response.strip().strip("```json").strip("```").strip()
        # strict=False: some models (esp. non-Claude ones via BYOK) emit
        # literal control characters (raw newlines) inside JSON strings
        # instead of the \n escape the system prompt asks for.
        return json.loads(clean, strict=False)

    async def identify_questions(
        self,
        blueprint: dict,
        max_questions: int,
        user_id: str = None,
        build_id: str = None,
        project_id: str = None,
        org_id: str = None,
        recipients: Optional[list] = None,
        decisions: Optional[list] = None,
        raise_errors: bool = False,
    ) -> list[dict]:
        """Structure questions for the Architect (collaboration protocol v2)
        before the design is drawn: what the blueprint leaves open that would
        change screens, navigation or states. Returns
        ``[{"to", "question", "key"}]``. Best-effort: any LLM/parse failure
        returns [] and the design proceeds as before."""
        recipients = list(recipients or ["architect"])
        if max_questions <= 0:
            return []
        try:
            response = await self.run(
                [{
                    "role": "user",
                    "content": (
                        f"List at most {max_questions} clarifying questions. Address each "
                        f"one to exactly one of: {', '.join(recipients)}.\n\n"
                        f"Blueprint:\n{json.dumps(blueprint, indent=2)}"
                        f"{render_decisions_block(decisions or [], 'Already decided (do not ask about these again):')}"
                    ),
                }],
                max_tokens=600,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                prompt_template_version="questions-v1",
            )
            items = json.loads(strip_markdown_fences(response), strict=False)
        except Exception:
            if raise_errors:
                raise
            return []
        return parse_addressed_questions(items, recipients[0], max_questions, raise_errors=raise_errors)

    async def answer(
        self,
        question: str,
        blueprint: dict,
        design: Optional[dict] = None,
        user_id: str = None,
        build_id: str = None,
        project_id: str = None,
        org_id: str = None,
        asker: Optional[str] = None,
        decisions: Optional[list] = None,
    ) -> str:
        """Answer another agent's UI question about this build's design
        (collaboration protocol v2: the Developer may ask the Designer).
        Routed here only by core/agent_communication.py. Raises on LLM
        failure or an empty answer so the caller records the exchange as
        failed."""
        context = f"Blueprint:\n{json.dumps(blueprint, indent=2)}"
        if design:
            context += f"\n\nDesign:\n{json.dumps(design, indent=2)}"
        context += render_decisions_block(decisions or [], "Decisions already recorded for this build (stay consistent with them):")
        label = (asker or "developer").capitalize()
        response = await self.run(
            [{"role": "user", "content": f"{context}\n\nQuestion from the {label}:\n{untrusted_block(asker or 'developer', question)}"}],
            max_tokens=400,
            user_id=user_id,
            build_id=build_id,
            project_id=project_id,
            org_id=org_id,
            prompt_template_version="answer-v1",
        )
        answer = (response or "").strip()
        if not answer:
            raise ValueError("Designer returned an empty answer")
        return answer
