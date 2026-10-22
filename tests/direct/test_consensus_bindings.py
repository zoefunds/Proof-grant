"""Behavioral tests for nondeterministic economic-decision bindings.

These tests exercise the comparison functions directly with payloads that
represent a validator's independently recomputed web result. Every field that
can influence verdict, payout, challenge status, slash, refund, or bounty must
reject a leader/validator mismatch.
"""


def _contract(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    return direct_deploy("contracts/proof_grant.py", "2500000000000000000000", 10000, 2000)


def _milestone_payload():
    return {
        "criteria": [
            {"criterion_id": "crit-1", "passed": True, "unreachable": False},
            {"criterion_id": "crit-2", "passed": False, "unreachable": False},
        ],
        "any_unreachable": False,
    }


def _challenge_payload():
    return {"base": _milestone_payload()}


def test_milestone_validator_rejects_each_economic_field_mismatch(direct_vm, direct_deploy, direct_alice):
    contract = _contract(direct_vm, direct_deploy, direct_alice)
    leader = _milestone_payload()
    assert contract._milestone_consensus_fields_match(leader, _milestone_payload()) is True

    for field, replacement in (
        ("criterion_id", "other-criterion"),
        ("passed", False),
        ("unreachable", True),
    ):
        validator = _milestone_payload()
        validator["criteria"][0][field] = replacement
        assert contract._milestone_consensus_fields_match(leader, validator) is False

    validator = _milestone_payload()
    validator["any_unreachable"] = True
    assert contract._milestone_consensus_fields_match(leader, validator) is False

    # An aggregate must also be true precisely when an entry is unreachable;
    # matching malformed leader and validator payloads are still rejected.
    malformed_leader = _milestone_payload()
    malformed_validator = _milestone_payload()
    malformed_leader["criteria"][0]["unreachable"] = True
    malformed_validator["criteria"][0]["unreachable"] = True
    assert contract._milestone_consensus_fields_match(malformed_leader, malformed_validator) is False


def test_challenge_validator_rejects_every_authoritative_base_recheck_mismatch(
    direct_vm, direct_deploy, direct_alice
):
    contract = _contract(direct_vm, direct_deploy, direct_alice)
    leader = _challenge_payload()
    assert contract._challenge_consensus_fields_match(leader, _challenge_payload(), "crit-1") is True

    # Base re-check fields determine whether a challenge independently flipped.
    for field, replacement in (
        ("criterion_id", "other-criterion"),
        ("passed", False),
        ("unreachable", True),
    ):
        validator = _challenge_payload()
        validator["base"]["criteria"][0][field] = replacement
        assert contract._challenge_consensus_fields_match(leader, validator, "crit-1") is False

    validator = _challenge_payload()
    validator["base"]["any_unreachable"] = True
    assert contract._challenge_consensus_fields_match(leader, validator, "crit-1") is False

    # A challenge target must exist in the pinned authoritative re-check.
    assert contract._challenge_consensus_fields_match(leader, _challenge_payload(), "crit-missing") is False
