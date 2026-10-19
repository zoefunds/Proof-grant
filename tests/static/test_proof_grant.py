import ast
from pathlib import Path


SOURCE = Path(__file__).parents[2] / "contracts" / "proof_grant.py"


def _tree():
    return ast.parse(SOURCE.read_text())


def _contract():
    return next(
        node
        for node in _tree().body
        if isinstance(node, ast.ClassDef) and node.name == "ProofGrant"
    )


def test_contract_is_standalone_and_fully_renamed():
    source = SOURCE.read_text()
    assert source.startswith('# v0.2.16\n# { "Depends": "py-genlayer:')
    assert "milestone_forge" not in source.lower()
    assert "MilestoneForge" not in source
    assert "MILESTONE FORGE" not in source
    assert _contract()


def test_public_api_covers_full_escrow_lifecycle():
    methods = {node.name for node in _contract().body if isinstance(node, ast.FunctionDef)}
    assert {
        "create_grant",
        "cancel_milestone",
        "submit_milestone_claim",
        "retry_inconclusive_milestone",
        "file_challenge",
        "resolve_challenge",
        "release_milestone",
        "claim_failed_milestone_refund",
        "force_retry_evaluation",
        "get_grant",
        "get_milestone",
        "get_criterion",
        "get_criterion_result",
        "get_challenge",
        "list_grants",
        "get_protocol_params",
        "update_protocol_params",
        "transfer_admin",
    } <= methods


def test_consensus_and_payout_are_separated():
    evaluate = next(node for node in _contract().body if isinstance(node, ast.FunctionDef) and node.name == "_evaluate_milestone")
    payout = next(node for node in _contract().body if isinstance(node, ast.FunctionDef) and node.name == "_compute_deterministic_payout_bps")
    assert "run_nondet_unsafe" in ast.unparse(evaluate)
    calls = [node.func for node in ast.walk(payout) if isinstance(node, ast.Call)]
    assert all("nondet" not in ast.unparse(call) for call in calls)
    assert all("web" not in ast.unparse(call) for call in calls)


def test_validators_bind_all_nondeterministic_economic_decision_fields():
    """No leader-only field may influence a verdict, payout, or challenge bounty."""
    contract = _contract()
    methods = {
        node.name: node
        for node in contract.body
        if isinstance(node, ast.FunctionDef)
    }

    milestone_matcher = ast.unparse(methods["_milestone_consensus_fields_match"])
    # Used by `_apply_evaluation_result`: criterion ID identifies its weight,
    # passed selects the weight, and any_unreachable forces INCONCLUSIVE.
    for field in ("criterion_id", "passed", "unreachable", "any_unreachable"):
        assert field in milestone_matcher
    assert 'field not in l_entry' in milestone_matcher
    assert "'any_unreachable' not in leader_data" in milestone_matcher

    challenge_matcher = ast.unparse(methods["_challenge_consensus_fields_match"])
    # Used by `_settle_challenge`: target identity and all evidence fields
    # decide whether the bond is returned and whether a bounty is paid.
    for field in ("criterion_id", "reachable", "anchor_referenced", "corroborates_failure"):
        assert field in challenge_matcher
    assert "disputed_criterion_id" in challenge_matcher

    settlement = ast.unparse(methods["_settle_challenge"])
    for guard in ("evidence_targets_disputed_criterion", "anchor_referenced", "reachable"):
        assert guard in settlement


def test_value_transfers_use_single_guarded_helper():
    source = SOURCE.read_text()
    assert source.count("emit_transfer(") == 1
    assert "def _send_gen(" in source
    assert "milestone.reward_deposited = \"0\"" in source
    assert "challenge.bond_deposited = \"0\"" in source


def test_time_is_transaction_deterministic():
    source = SOURCE.read_text()
    assert 'gl.message_raw["datetime"]' in source
    assert "datetime.now" not in source
    assert "time.time" not in source


def test_criteria_and_security_guards_are_present():
    source = SOURCE.read_text()
    for criterion_type in ("HTTP_ENDPOINT", "GIT_REPO_STATE", "ONCHAIN_STATE"):
        assert criterion_type in source
    assert "localhost" in source
    assert "127.0.0.1" in source
    assert "weights must sum to 10000 bps" in source
