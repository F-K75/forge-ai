from agents.base import BaseAgent
from core.models import AgentType
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
    system_prompt = """You are the Integration Agent in a multi-agent app builder.

Given a list of integrations needed and the current backend code, you add integration code.

Output ONLY a JSON object:
{
  "files": {
    "backend/services/stripe_service.py": "full file content",
    "backend/routers/payments.py": "full file content"
  },
  "env_vars_needed": ["VAR_NAME"],
  "instructions": "Brief setup instructions for the developer"
}

Rules:
- Use playbook packages only (no alternative SDKs).
- Generate complete, working integration code with error handling.
- Include webhook handlers where relevant.
- Output ONLY valid JSON.
"""

    async def integrate(self, integrations: list, existing_files: dict, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None) -> dict:
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
                )
            }
        ]

        full = await self.run(messages, max_tokens=6000, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)
        clean = full.strip().strip("```json").strip("```").strip()
        # strict=False: some models (esp. non-Claude ones via BYOK) emit
        # literal control characters (raw newlines) inside JSON strings
        # instead of the \n escape the system prompt asks for.
        return json.loads(clean, strict=False)

    @staticmethod
    def get_available_playbooks() -> dict:
        return PLAYBOOKS
