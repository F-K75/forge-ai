"""core/pricing.py: the reservation formula (§13.1) and the EX-1 closed-form
proof (§16.4).

The proof enumerates every permitted combination of the EX-1 base matrix
(11,730 with today's settings; cheap, so always the full matrix here) and
walks each one through the ledger's authorization rule:

- a mandatory operation is authorized iff ``consumed + price <= cap``;
- an optional one iff ``consumed + price + remaining_mandatory <= cap``;

where ``cap`` is the reservation (``user_credits``) or the free-build
allowance (``free_grant``). It asserts that no operation on a permitted path
is ever refused, that ``consumed <= cap``, that ``consumed`` equals the
closed-form price of the COMPLETED usable operations, that BYOK consumes 0,
and that the bound is tight (the max path costs exactly ``max_build_cost``).
test_build_ledger.py runs the same matrix through the real orchestrator and
ledger (stratified 5% in PR CI, full with ``FORGE_EX_FULL=1``).
"""

from __future__ import annotations

import pytest

from core import pricing
from core.config import get_settings
from core.pricing import PriceTable, QuoteParams, max_build_cost, quote_from_settings
from tests.ex_matrix import Combination, all_combinations, pm_debug_sequences


def test_formula_is_27_with_shipped_settings():
    quote = quote_from_settings()
    assert quote.max_cost == 27
    # 15 (one pass of every stage) + 9 (3 debug + PM passes) + 3 (clarifications)
    by_key = {line["key"]: line["credits"] for line in quote.breakdown_lines()}
    assert sum(by_key[k] for k in ("architect", "business_model", "designer",
                                   "developer", "integration", "pm")) == 15
    assert by_key["debug_loop"] == 9
    assert by_key["clarifications"] == 3
    assert "reviews" not in by_key
    assert quote.pricing_version == pricing.PRICING_VERSION


def test_formula_is_derived_from_settings_never_hard_coded(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "credits_developer", 11)
    monkeypatch.setattr(settings, "credits_pm", 4)
    monkeypatch.setattr(settings, "max_debug_iterations", 2)
    monkeypatch.setattr(settings, "developer_clarification_max_questions", 5)
    monkeypatch.setattr(settings, "credits_clarification", 2)
    quote = quote_from_settings()
    p = PriceTable.from_settings(settings)
    expected = (p.architect + p.business_model + p.designer + 11 + p.integration + 4
                + 2 * (p.debug + 4) + 5 * 2)
    assert quote.max_cost == expected
    # Clarifications disabled: no clarification term at all.
    monkeypatch.setattr(settings, "developer_clarification_max_questions", 0)
    assert quote_from_settings().max_cost == expected - 10


def test_breakdown_sums_to_max_cost_and_is_labelled():
    quote = quote_from_settings()
    lines = quote.breakdown_lines()
    assert sum(line["credits"] for line in lines) == quote.max_cost
    assert all(line["label"] and line["key"] for line in lines)


def test_quote_round_trips_through_the_build_document():
    quote = quote_from_settings()
    again = pricing.Quote.from_doc(quote.to_doc())
    assert again == quote


def test_single_price_source():
    """RG-F21: every ledger price comes from settings through one table."""
    settings = get_settings()
    table = PriceTable.from_settings(settings)
    assert table.price_for("architect") == settings.credits_architect
    assert table.price_for("business_model") == settings.credits_business_model
    assert table.price_for("designer") == settings.credits_designer
    assert table.price_for("developer") == settings.credits_developer
    assert table.price_for("integration") == settings.credits_integration
    assert table.price_for("pm#0") == table.price_for("pm#3") == settings.credits_pm
    assert table.price_for("debug#2") == settings.credits_debug
    assert table.price_for("clarification#abc") == settings.credits_clarification
    # C3: question generation is part of the Developer price.
    assert table.price_for("question_pass:developer") == 0
    assert table.price_for("architect_clarify") == 0
    with pytest.raises(KeyError):
        table.price_for("unknown_stage")


def test_collab_v2_clarification_bound(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "collab_protocol_v2", True)
    params = QuoteParams.from_settings(settings)
    expected_q = min(settings.collab_max_messages_per_build,
                     settings.developer_clarification_max_questions + 2 * settings.collab_stage_max_questions)
    assert params.clarification_questions == expected_q
    assert params.collab_protocol == 2


def test_negative_price_rejected(monkeypatch):
    monkeypatch.setattr(get_settings(), "credits_debug", -1)
    with pytest.raises(ValueError):
        PriceTable.from_settings()


def test_remaining_mandatory_worst_case():
    quote = quote_from_settings()
    p, params = quote.prices, quote.params
    full = pricing.remaining_mandatory_worst_case(p, params, [])
    assert full == quote.max_cost - params.clarification_questions * p.clarification
    done = ["architect", "business_model", "designer"]
    assert pricing.remaining_mandatory_worst_case(p, params, done, integrations=False) == (
        full - p.architect - p.business_model - p.designer - p.integration
    )


# --------------------------------------------------------------------------- #
# EX-1 closed-form proof over the full base matrix
# --------------------------------------------------------------------------- #


def _walk(c: Combination, quote) -> int:
    """Authorize and settle every operation of ``c`` in pipeline order with
    the ledger rule; return consumed. Asserts nothing is refused."""
    p, params = quote.prices, quote.params
    byok = c.funding == "byok"
    cap = 0 if byok else quote.max_cost
    consumed = 0
    settled = set()

    def price(key):
        return 0 if byok else p.price_for(key)

    def mandatory(key, completes=True, closes=False):
        nonlocal consumed
        assert consumed + price(key) <= cap or price(key) == 0, (c.id, key, consumed)
        if completes:
            consumed += price(key)
            settled.add(key)
        elif closes:
            settled.add(key)

    def optional(key, completes):
        nonlocal consumed
        remaining = 0 if byok else pricing.remaining_mandatory_worst_case(
            p, params, settled, integrations=c.integrations)
        assert consumed + price(key) + remaining <= cap or price(key) == 0, (c.id, key, consumed, remaining)
        if completes:
            consumed += price(key)

    for key in ("architect", "business_model", "designer"):
        mandatory(key)
    optional("question_pass:developer", completes=True)
    for i, outcome in enumerate(c.clarifications):
        optional(f"clarification#{i}", completes=(outcome == "answered"))
    mandatory("developer")
    if c.integrations:
        mandatory("integration")
    mandatory("pm#0")
    for k, usable in enumerate(c.debug_usable, start=1):
        mandatory(f"debug#{k}", completes=usable, closes=not usable)
        mandatory(f"pm#{k}")
    return consumed


def test_ex1_closed_form_proof_full_matrix():
    quote = quote_from_settings()
    n, q = quote.params.debug_iterations, quote.params.clarification_questions
    combos = all_combinations(n, q)
    assert len(combos) == 3 * sum(4 ** k for k in range(q + 1)) * 2 * len(pm_debug_sequences(n))
    if (n, q) == (3, 3):
        assert len(combos) == 11_730
    max_seen = 0
    for c in combos:
        consumed = _walk(c, quote)
        if c.funding == "byok":
            assert consumed == 0
            continue
        assert consumed <= quote.max_cost, c.id
        expected = pricing.closed_form_price(quote.prices, c.expected_completed(n)) + (
            c.answered * quote.prices.clarification)
        assert consumed == expected, c.id
        if c.is_max_path(n, q):
            assert consumed == quote.max_cost, c.id
        max_seen = max(max_seen, consumed)
    assert max_seen == quote.max_cost


@pytest.mark.parametrize("n,q,dev", [(0, 0, 5), (1, 2, 7), (5, 1, 3), (2, 6, 1)])
def test_ex1_proof_holds_for_other_settings(monkeypatch, n, q, dev):
    settings = get_settings()
    monkeypatch.setattr(settings, "max_debug_iterations", n)
    monkeypatch.setattr(settings, "developer_clarification_max_questions", q)
    monkeypatch.setattr(settings, "credits_developer", dev)
    quote = quote_from_settings()
    for c in all_combinations(n, min(q, 2), fundings=("user_credits",)):
        assert _walk(c, quote) <= quote.max_cost


def test_quote_matches_closed_form_of_max_path():
    quote = quote_from_settings()
    params = quote.params
    path = pricing.mandatory_path(params, integrations=True)
    assert pricing.closed_form_price(quote.prices, path) + (
        params.clarification_questions * quote.prices.clarification) == quote.max_cost
    assert max_build_cost(quote.prices, params) == quote
