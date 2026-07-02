from agents.base import BaseAgent
from core.models import AgentType
import json


class BusinessModelAgent(BaseAgent):
    agent_type = AgentType.BUSINESS_IMPROVER
    system_prompt = """You are the Business Model Improver Agent.

Given an app idea and (optionally) a technical blueprint, propose concrete, practical improvements to the business model.

Return ONLY a JSON object with this schema:
{
  "executive_summary": "string",

  "target_customers": [
    {
      "segment": "string",
      "jobs_to_be_done": ["string"],
      "pain_points": ["string"],
      "why_now": "string",
      "success_metrics": ["string"]
    }
  ],

  "value_proposition": {
    "current": "string",
    "improved": "string",
    "differentiators": ["string"],
    "positioning_statement": "string"
  },

  "revenue_model_options": [
    {
      "option": "string",
      "how_it_works": "string",
      "pricing_mechanics": ["string"],
      "pros": ["string"],
      "cons": ["string"],
      "best_for_segments": ["string"]
    }
  ],

  "recommended_pricing": {
    "recommended_model": "string",
    "tiers": [
      {
        "name": "string",
        "price": {"amount": number, "currency": "USD|EUR|GBP|...", "billing_period": "monthly|annual|one_time"},
        "ideal_for": "string",
        "included": ["string"],
        "limits": ["string"],
        "upgrade_triggers": ["string"]
      }
    ],
    "assumptions": ["string"],
    "risks_and_mitigations": [
      {
        "risk": "string",
        "mitigation": "string"
      }
    ]
  },

  "packaging_and_offer_design": {
    "free_or_trial_strategy": "string",
    "add_ons_and_upsells": [
      {
        "name": "string",
        "description": "string",
        "who_it_helps": "string",
        "pricing_suggestion": "string"
      }
    ],
    "retention_levers": ["string"],
    "usage_based_or_seat_based_recommendation": "string"
  },

  "go_to_market": {
    "initial_focus": ["string"],
    "channels": ["string"],
    "launch_experiments": [
      {
        "experiment": "string",
        "hypothesis": "string",
        "success_criteria": ["string"],
        "timebox": "string"
      }
    ]
  },

  "mvp_validation_plan": {
    "what_to_test": ["string"],
    "landing_page_questions": ["string"],
    "metrics_to_track": ["string"],
    "decision_rules": [
      {
        "condition": "string",
        "next_step": "string"
      }
    ]
  }
}

Rules:
- Be specific and actionable.
- Prefer realistic pricing mechanics and tiering.
- Do not output markdown.
- Output ONLY valid JSON.
"""

    async def improve(self, app_prompt: str, blueprint=None, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None) -> dict:
        messages = [
            {
                "role": "user",
                "content": (
                    "Improve the business model for this app idea.\n\n"
                    f"App idea/prompt:\n{app_prompt}\n\n"
                    f"Technical blueprint (may be incomplete/empty):\n{json.dumps(blueprint or {}, indent=2)}"
                ),
            }
        ]

        full = await self.run(messages, max_tokens=3500, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)
        clean = full.strip()

        if clean.startswith("```"):
            # strip markdown fences if present
            clean = clean.split("```", 2)[1]
            if clean.startswith("json"):
                clean = clean[4:]
            clean = clean.strip()
            if clean.endswith("```"):
                clean = clean[:-3].strip()

        clean = clean.strip().strip("```json").strip().strip("```").strip()
        return json.loads(clean)

