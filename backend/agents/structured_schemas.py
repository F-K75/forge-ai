"""JSON Schema definitions for agent structured output (8.8).

These mirror the ``output_format`` shapes already described inside the prompt
templates / inline system prompts, expressed as JSON Schema so the AI Gateway
can validate and (once) repair responses through ``AIGateway.generate`` instead
of each agent hand-rolling fence-strip + ``json.loads``.

The ``additionalProperties: False`` + strict array typing are intentional: the
whole point of 8.8 is that a malformed or extra-key payload no longer slips
through the permissive ``strict=False`` parse the agents previously used.
"""

# --- Product Manager (`agents/pm.py`, template `product_manager_v1`) ---------
PM_VALIDATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "passed": {"type": "boolean"},
        "score": {"type": "number"},
        "missing_features": {"type": "array", "items": {"type": "string"}},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low"],
                    },
                    "description": {"type": "string"},
                    "file": {"type": "string"},
                    "suggestion": {"type": "string"},
                },
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["passed", "score"],
}

# --- Integration (`agents/integration.py`, template `integration_v1`) --------
INTEGRATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "files": {"type": "object"},
        "env_vars_needed": {"type": "array", "items": {"type": "string"}},
        "instructions": {"type": "string"},
    },
    "required": ["files", "env_vars_needed", "instructions"],
}

# --- Business Model (`agents/business_model.py`, inline system prompt) -------
BUSINESS_MODEL_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "executive_summary": {"type": "string"},
        "target_customers": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "segment": {"type": "string"},
                    "jobs_to_be_done": {"type": "array", "items": {"type": "string"}},
                    "pain_points": {"type": "array", "items": {"type": "string"}},
                    "why_now": {"type": "string"},
                    "success_metrics": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "value_proposition": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "current": {"type": "string"},
                "improved": {"type": "string"},
                "differentiators": {"type": "array", "items": {"type": "string"}},
                "positioning_statement": {"type": "string"},
            },
        },
        "revenue_model_options": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "option": {"type": "string"},
                    "how_it_works": {"type": "string"},
                    "pricing_mechanics": {"type": "array", "items": {"type": "string"}},
                    "pros": {"type": "array", "items": {"type": "string"}},
                    "cons": {"type": "array", "items": {"type": "string"}},
                    "best_for_segments": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "recommended_pricing": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "recommended_model": {"type": "string"},
                "tiers": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string"},
                            "price": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "amount": {"type": "number"},
                                    "currency": {"type": "string"},
                                    "billing_period": {
                                        "type": "string",
                                        "enum": ["monthly", "annual", "one_time"],
                                    },
                                },
                            },
                            "ideal_for": {"type": "string"},
                            "included": {"type": "array", "items": {"type": "string"}},
                            "limits": {"type": "array", "items": {"type": "string"}},
                            "upgrade_triggers": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                },
                "assumptions": {"type": "array", "items": {"type": "string"}},
                "risks_and_mitigations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "risk": {"type": "string"},
                            "mitigation": {"type": "string"},
                        },
                    },
                },
            },
        },
        "packaging_and_offer_design": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "free_or_trial_strategy": {"type": "string"},
                "add_ons_and_upsells": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "who_it_helps": {"type": "string"},
                            "pricing_suggestion": {"type": "string"},
                        },
                    },
                },
                "retention_levers": {"type": "array", "items": {"type": "string"}},
                "usage_based_or_seat_based_recommendation": {"type": "string"},
            },
        },
        "go_to_market": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "initial_focus": {"type": "array", "items": {"type": "string"}},
                "channels": {"type": "array", "items": {"type": "string"}},
                "launch_experiments": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "experiment": {"type": "string"},
                            "hypothesis": {"type": "string"},
                            "success_criteria": {"type": "array", "items": {"type": "string"}},
                            "timebox": {"type": "string"},
                        },
                    },
                },
            },
        },
        "mvp_validation_plan": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "what_to_test": {"type": "array", "items": {"type": "string"}},
                "landing_page_questions": {"type": "array", "items": {"type": "string"}},
                "metrics_to_track": {"type": "array", "items": {"type": "string"}},
                "decision_rules": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "condition": {"type": "string"},
                            "next_step": {"type": "string"},
                        },
                    },
                },
            },
        },
    },
    # Summary + the structured sections; the agent prompt guarantees these.
    "required": [
        "executive_summary",
        "target_customers",
        "value_proposition",
        "revenue_model_options",
        "recommended_pricing",
        "packaging_and_offer_design",
        "go_to_market",
        "mvp_validation_plan",
    ],
}