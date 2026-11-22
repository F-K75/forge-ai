from agents.base import BaseAgent
from agents.developer import parse_addressed_questions
from agents.json_utils import strip_markdown_fences
from agents.structured_schemas import INTEGRATION_SCHEMA
from core.collaboration import render_decisions_block
from core.models import AgentType
from typing import Optional
import json

# Pre-tested integration playbooks
PLAYBOOKS = {
    "stripe": {
        "packages": ["stripe"],
        "env_vars": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
        "description": "Payment processing — charges, subscriptions, webhooks",
    },
    "supabase": {
        "packages": ["supabase"],
        "env_vars": ["SUPABASE_URL", "SUPABASE_ANON_KEY"],
        "description": "Postgres database + auth + realtime",
    },
    "slack": {
        "packages": ["slack-sdk"],
        "env_vars": ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"],
        "description": "Slack notifications and bot commands",
    },
    "sendgrid": {
        "packages": ["sendgrid"],
        "env_vars": ["SENDGRID_API_KEY", "FROM_EMAIL"],
        "description": "Transactional email",
    },
    "twilio": {
        "packages": ["twilio"],
        "env_vars": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE"],
        "description": "SMS and voice",
    },
    "openai": {
        "packages": ["openai"],
        "env_vars": ["OPENAI_API_KEY"],
        "description": "GPT-4 and embeddings",
    },
    "google_sheets": {
        "packages": ["gspread", "google-auth"],
        "env_vars": ["GOOGLE_SERVICE_ACCOUNT_JSON"],
        "description": "Read/write Google Sheets",
    },
    "airtable": {
        "packages": ["pyairtable"],
        "env_vars": ["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID"],
        "description": "Airtable as database",
    },
    "cloudinary": {
        "packages": ["cloudinary"],
        "env_vars": ["CLOUDINARY_URL"],
        "description": "Image and video uploads",
    },
    "resend": {
        "packages": ["resend"],
        "env_vars": ["RESEND_API_KEY"],
        "description": "Modern transactional email",
    },
}


class IntegrationAgent(BaseAgent):
    agent_type = AgentType.INTEGRATION
    prompt_role = "integration"
    output_schema = INTEGRATION_SCHEMA

    async def integrate(self, integrations: list, existing_files: dict, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None, decisions: Optional[list] = None) -> dict:
        """decisions: the build blackboard's decisions (collaboration
        protocol v2), e.g. the Architect's answers to this agent's questions
        about integration contracts."""
        if not integrations:
            return {"files": {}, "env_vars_needed": [], "instructions": ""}

        playbook_info = {
            name: PLAYBOOKS[name]
            for name in integrations
            if name in PLAYBOOKS
        }

        messages = [
            {
                "role": "user",
                "content": (
                    f"Add these integrations: {integrations}\n\n"
                    f"Playbook specs:\n{json.dumps(playbook_info, indent=2)}\n\n"
                    f"Existing backend main.py:\n{existing_files.get('backend/main.py', '')}"
                    f"{render_decisions_block(decisions or [], 'Decisions recorded for this build (follow them):')}"
                )
            }
        ]

        # 8.8: schema-validated + gateway-repaired structured output.
        return await self._call_structured(
            messages, max_tokens=6000, user_id=user_id, build_id=build_id,
            project_id=project_id, org_id=org_id,
        )

    async def identify_questions(
        self,
        integrations: list,
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
        """Questions for the Architect about integration contracts
        (collaboration protocol v2): which data a webhook updates, who owns
        a customer record, how failures surface. Returns
        ``[{"to", "question", "key"}]``. Best-effort: any LLM/parse failure
        returns [] and the integration proceeds as before."""
        recipients = list(recipients or ["architect"])
        if max_questions <= 0 or not integrations:
            return []
        try:
            response = await self.run(
                [{
                    "role": "user",
                    "content": (
                        f"Integrations to add: {integrations}\n\n"
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

    @staticmethod
    def get_available_playbooks() -> dict:
        return PLAYBOOKS
