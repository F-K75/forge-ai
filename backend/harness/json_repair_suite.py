"""Phase 8.7 -- harness eval suite for JSON-repair prompt quality.

The AI Gateway's ``_repair`` prompt (gateway/service.py) is issued when a
response fails structured-output schema validation: it asks the model to return
ONLY corrected JSON for the failing schema. This module codifies an evaluation
suite that measures how well that repair prompt performs across the three
production roles that consume structured JSON (architect / designer /
developer), mirroring each role's ``output_format`` contract.

Two things are measured:
* ``format_compliance`` -- the repaired output parses as JSON (gateway-valid).
* ``expected_keys`` / ``forbidden_patterns`` -- the repaired output matches the
  role's required shape and contains no prose/fence noise.

The suite is data-driven: `build_report` takes the actual text returned by a
repair call (or a capture of raw model output) and scores it without needing a
live LLM, so it can run in CI as a deterministic regression guard.
"""

from __future__ import annotations

from typing import Dict, List

from harness.evaluator import PromptEvaluator
from harness.models import EvaluationResult, TestCase, TestSuite

# Each role's required top-level keys (from the templates the gateway repairs).
ROLE_KEYS: Dict[str, List[str]] = {
    "architect": [
        "app_name", "description", "pages", "data_models", "api_endpoints",
        "features", "integrations",
    ],
    "designer": [
        "theme", "layout", "components", "design_notes",
    ],
    "developer": [
        "files",
    ],
}

# Forbidden markers: the repair prompt demands JSON only, no prose/fences.
_FORBIDDEN = [
    r"^```",            # opening fence
    r"\n```\s*$",       # closing fence
    r"\bHere'?s?\b",    # "Here is the corrected JSON..."
    r"\bSorry\b",
    r"\bn/a\b",
]


def _single_line_pattern(role: str) -> str:
    """The repair prompt expects the output to be one contiguous JSON payload.
    A real (non-fenced) JSON start/end brace pair on the first/last line is the
    strongest signal of a clean repair; anything else is suspicious."""
    return r"^\s*[\{\[]"


def build_suite(role: str, template_version: str = "v1", *, repair: bool = True) -> TestSuite:
    """Build the 8.7 JSON-repair evaluation suite for one role.

    Args:
        role: one of ``architect`` / ``designer`` / ``developer``.
        template_version: the prompt template version under test.
        repair: if True, cases represent the *repaired* output the gateway
            should produce after a repair call; if False, they represent a
            fresh (first-attempt) valid output.
    """
    keys = ROLE_KEYS[role]
    task = f"Repair the malformed JSON output from the {role} agent"

    cases = [
        TestCase(
            case_id=f"{role}-repair-clean-json",
            role=role,
            task=task,
            expected_output_patterns=[_single_line_pattern(role)],
            forbidden_patterns=list(_FORBIDDEN),
            expected_format="json",
            expected_keys=keys,
            tags=["8.7", "json-repair", "clean"],
            priority=1,
        ),
        TestCase(
            case_id=f"{role}-repair-fence-noise",
            role=role,
            task=task,
            expected_output_patterns=[_single_line_pattern(role)],
            forbidden_patterns=[r"^```", r"\n```\s*$"],
            expected_format="json",
            expected_keys=keys,
            tags=["8.7", "json-repair", "fence"],
            priority=2,
        ),
        TestCase(
            case_id=f"{role}-repair-prose-noise",
            role=role,
            task=task,
            expected_output_patterns=[_single_line_pattern(role), r'"'],
            forbidden_patterns=[r"\bHere'?s?\b", r"\bSorry\b"],
            expected_format="json",
            expected_keys=keys,
            tags=["8.7", "json-repair", "prose"],
            priority=2,
        ),
        # Guard against the worst failure mode: dropping required keys during
        # repair when a model trims the payload to "save tokens".
        TestCase(
            case_id=f"{role}-repair-complete-keys",
            role=role,
            task=task,
            expected_output_patterns=[_single_line_pattern(role)],
            forbidden_patterns=list(_FORBIDDEN),
            expected_format="json",
            expected_keys=keys,
            tags=["8.7", "json-repair", "complete"],
            priority=3,
        ),
    ]

    return TestSuite(
        suite_id=f"{role}-json-repair-{template_version}",
        role=role,
        template_version=template_version,
        cases=cases,
        description=(
            f"Phase 8.7 JSON-repair eval for the {role} role: verifies repaired "
            "output is fenceless, prose-free, well-formed JSON with the required keys."
        ),
    )


def build_default_suites(template_version: str = "v1") -> Dict[str, TestSuite]:
    """All three production roles' 8.7 JSON-repair suites in one map."""
    return {role: build_suite(role, template_version) for role in ROLE_KEYS}


def build_report(suites: Dict[str, TestSuite], outputs: Dict[str, str]) -> Dict[str, EvaluationResult]:
    """Score a set of actual (or sampled/faked) repair outputs against suites.

    Args:
        suites: ``{role: TestSuite}`` from ``build_default_suites``.
        outputs: ``{role: raw_text_returned_by_the_repair_call}``.

    Returns:
        ``{role: EvaluationResult}`` with per-case and aggregate scores.
    """
    evaluator = PromptEvaluator()
    report: Dict[str, EvaluationResult] = {}
    for role, suite in suites.items():
        output = outputs.get(role, "")
        report[role] = evaluator.evaluate_suite(output, suite)
    return report


def render_repair_ok_sample(role: str) -> str:
    """A canonical, valid, fenceless JSON sample for `role` -- used by the
    deterministic regression guard in tests to prove a well-formed repair scores
    well, and by CI as a smoke input when no live model is configured."""
    if role == "architect":
        return (
            '{"app_name":"MyApp","description":"A sample app",'
            '"pages":[{"name":"Home","route":"/","components":[]}],'
            '"data_models":[{"name":"User","fields":[{"name":"id","type":"string","required":true}]}],'
            '"api_endpoints":[{"method":"GET","path":"/api/users"}],'
            '"features":[],"integrations":[]}'
        )
    if role == "designer":
        return (
            '{"theme":{"primary":"#444444","secondary":"#cccccc",'
            '"accent":"#111111","background":"#ffffff","surface":"#f5f5f5",'
            '"text_primary":"#111111","text_secondary":"#666666",'
            '"border_radius":"8px","font_family":"Inter","style":"modern"},'
            '"layout":{"sidebar":true,"topbar":true,"sidebar_width":240,"content_max_width":1200},'
            '"components":{},"design_notes":"Clean, accessible, modern."}'
        )
    # developer
    return '{"files":{"frontend/src/App.tsx":"export default function App(){return null;}"}}'


def render_repair_bad_sample(role: str, *, fenced: bool = True, with_prose: bool = True) -> str:
    """A deliberately noisy/malformed repair output for `role` -- the baseline
    the repair prompt exists to fix. Used in tests and CI to prove the eval
    suite actually flags poor quality (not a vacuous always-pass)."""
    payload = render_repair_ok_sample(role)
    mutant = payload
    # Drop every required key except the first to simulate a token-trimmed repair.
    first_key = ROLE_KEYS[role][0]
    bad = '{\n  "' + first_key + '" : "truncated", "missing_rest": true }'
    if fenced:
        mutant = "```json\n" + bad + "\n```"
    if with_prose:
        mutant = "Here is the corrected JSON.\n```json\n" + bad + "\n```"
    return mutant