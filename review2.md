# Review 2 — challenger-controlled evidence remediation

## Request addressed

The review required that a challenger-controlled evidence URL must not be able
to independently fail a milestone and earn a bounty merely because it returns
HTTP 200, repeats a criterion anchor, and includes a generic failure word.

## Finding in the superseded implementation

The prior challenge path fetched `evidence_url` and treated the following as
independent corroboration:

1. the page returned HTTP 200;
2. its body included the disputed criterion's anchor; and
3. its body included a generic marker such as `down`, `error`, `outage`, or
   `failed`.

Because the challenger selected that URL, they could control all of these
inputs. Anchor matching did not establish that the page was authoritative or
immutable. Therefore the additive-evidence branch could uphold a challenge
even when the independently rechecked pinned criterion still passed.

## Remediation

The current contract makes challenger-supplied `evidence_url` and
`evidence_note` non-economic context. They remain stored with the challenge
for off-chain review, but the contract does not fetch their contents during
resolution and they do not enter validator consensus.

`resolve_challenge` now re-inspects only the immutable, genesis-pinned
criteria. `_settle_challenge` upholds only when all of the following are true
for the exact disputed criterion:

1. it was recorded as passing in the original milestone evaluation;
2. the authoritative re-check is reachable; and
3. that re-check now fails.

In code, this is the `criterion_flipped` condition. It is the sole source of
the `upheld` decision. Consequently, a still-passing criterion cannot be
overturned by arbitrary third-party page content, and no challenger receives a
bond return or bounty on that basis.

## Consensus and settlement properties

- The challenge validator compares the complete authoritative base re-check
  through `_milestone_consensus_fields_match`.
- The re-check binds `criterion_id`, `passed`, `unreachable`, and
  `any_unreachable` across leader and validators.
- Settlement selects the exact disputed criterion by ID. Other failed
  criteria in a partial-pass milestone do not make the challenge succeed.
- A transiently unreachable re-check is not accepted as evidence of failure.
- Challenger URL content is absent from both the consensus payload and all
  payout, bond, slash, refund, and bounty predicates.

## Regression coverage

`tests/direct/test_challenge_resolution.py` now proves that a challenger page
which returns HTTP 200, repeats the exact disputed endpoint URL, and says the
endpoint was "down" with "error responses" is rejected while the independent
criterion re-check remains passing. The test verifies that:

- the challenge status is `REJECTED`;
- the milestone remains in `CHALLENGE_WINDOW`;
- the original `PARTIAL_PASS` payout recommendation remains `5000` bps; and
- the milestone reward escrow remains intact, so no bounty was paid.

The same suite also proves that a genuine reachable-and-failing re-check of
the pinned criterion upholds without relying on page content.

`tests/direct/test_consensus_bindings.py` and
`tests/static/test_proof_grant.py` ensure that challenger evidence fields are
not consensus/economic inputs and that settlement depends on
`criterion_flipped` rather than evidence corroboration.

## Verification results

- Local test suite: `20 passed`
- GenVM lint: `3 checks passed`
- Submitted/deployed source SHA-256:
  `7e102730ae84c8db1dcb11454190ba8c104811e2d182de6ffe479161a3aa7646`
- StudioNet replacement contract:
  `0x326A80daBad01998a8C205535e1136E08F0ab58f`
- Deployment transaction:
  `0x9ef709b68956a380eca3ac1a51fc6afa821358b530a50ec9beda6eba756fa1ec`
- The deployed transaction's embedded source was extracted and hashed; it
  exactly matched the submitted source above.
- StudioNet E2E: all three scenarios passed against the replacement contract;
  the complete machine-readable results are in `proof/live_e2e.json`.
  They cover a passing criterion, a failing criterion plus refund, and a
  weighted `PARTIAL_PASS` calculation.

## Scope note

The earlier deployment is immutable and cannot be patched in place. The
replacement address above is the authoritative fixed deployment.
