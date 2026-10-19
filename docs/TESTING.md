# ProofGrant verification guide

This document describes the deployed ProofGrant release and its consensus-binding remediation. The public deployment and E2E target is exclusively GenLayer StudioNet chain `61999`.

## Verified release

- Contract: `0x05607023Cce260DBdDe4597ECE740ead5B8aA5B8`
- Deployment transaction: `0xa145c50817721bc8a7ff3c9c48186880efb502304fd1175f1ceb62c0e09c87ca`
- Deployment execution: `FINALIZED / SUCCESS / MAJORITY_AGREE`
- Source SHA-256: `aebc4c473eea82b405599ea5df2842074e753e47f131f4087d3a441fc56ee0b8`
- StudioNet schema: constructor plus 21 public methods
- Local verification: 20 tests passed; all 3 GenVM lint checks passed
- Live verification: 3 of 3 funded E2E scenarios passed on chain `61999`

## Local verification layers

Run from the repository root:

```bash
npm ci
python3 -m pytest -q
genvm-lint contracts/proof_grant.py
```

The current 20-test suite contains:

- Static checks for the `ProofGrant` identity, complete escrow API, deterministic clock usage, separation of consensus from payout calculation, and guarded value transfers.
- Direct-mode execution for grant creation, exact funding, access control, successful and failed claims, weighted partial results, challenge binding and resolution, release guards, and failed-milestone refunds.
- A consensus-binding regression check that requires validators to compare every leader-derived field used by verdict, payout, challenge, slash, refund, or bounty logic.

## Consensus-binding remediation

The remediated source SHA-256 is
`aebc4c473eea82b405599ea5df2842074e753e47f131f4087d3a441fc56ee0b8`.

The milestone validator now compares, for every criterion, its identity,
pass/fail value, and reachability; it also compares `any_unreachable`. These
are exactly the nondeterministic inputs consumed by verdict selection and
weighted payout calculation.

The challenge validator now reuses that full comparison for the base re-check,
then compares the exact disputed criterion ID along with evidence reachability,
anchor binding, and failure corroboration. Settlement repeats the evidence
identity/reachability/anchor guard before deciding whether to uphold a
challenge and pay a bond return plus bounty.

The GenVM linter performs three contract checks. The deployed source must retain both the `# v0.2.16` version line and the blank line that terminates the runner JSON header. Without that separator, StudioNet parses subsequent descriptive comments as runner configuration and rejects the contract.

## StudioNet deployment

The deployer account defaults to the unlocked GenLayer CLI keychain account named `cw-lender-e2e`. The deployment script submits the constructor below and refuses to report success when a finalized receipt contains `ERROR` or `invalid_contract`.

```text
default_dispute_bond_wei = "2500000000000000000000"
frivolous_slash_bps      = 10000
upheld_bounty_bps        = 2000
```

The deployed release already exists. To create a deliberate new immutable deployment:

```bash
npm run deploy:studionet
```

Confirm that the output explicitly says `network: GenLayer StudioNet`, `status: FINALIZED`, and `execution: SUCCESS`. Save the new address and transaction receipt before running any value-bearing tests.

## Live E2E prerequisites

The E2E runner uses two unlocked CLI accounts:

```text
FUNDER_ACCOUNT  = cw-lender-e2e
GRANTEE_ACCOUNT = cw-borrower-e2e
```

Their addresses in the completed run were:

```text
funder  = 0x1c2e587043568239B2fcaeC5f96F278EB134b7f5
grantee = 0x034d85C75b3902892C2F1D5887744Ab65d333176
```

The funder must have enough StudioNet GEN for the three deliberately small deposits totaling `6,000,000` wei and any applicable transaction fees. The test reads real public evidence from `https://github.com/genlayerlabs/genlayer-js` at ref `main`.

Run only against the intended chain-61999 contract:

```bash
PROOF_GRANT_CONTRACT=0x05607023Cce260DBdDe4597ECE740ead5B8aA5B8 npm run test:live
```

The runner is fixed to `chains.studionet`; the resulting evidence file must state `"network": "GenLayer StudioNet"` and `"chainId": 61999`.

## Completed E2E assertions

### Scenario 1: positive repository evidence

- Grant: `grant-4`; milestone: `ms-4`; criterion: `crit-4`
- Evidence: `package.json` exists at the repository root on `main`
- Deposit: `1,000,000` wei
- Stored result: `ref_exists=True path_ok=True`
- Final state: `PASSED`, payout recommendation `10000` bps, status `CHALLENGE_WINDOW`
- Create transaction: `0x7ad71a0650406429973f460874df9fb3bfb74189f1e0b3f0b9ea1f21418c6a7f`
- Claim transaction: `0x0863ef2fe5954dd5142bc634481ea13772ab9f851f19689a1017f1dc436bcb31`

### Scenario 2: negative control and refund

- Grant: `grant-6`; milestone: `ms-6`; criterion: `crit-6`
- Evidence: `proofgrant-live-evidence/absent-file-2026-10-19.txt` is absent from `main`
- Deposit: `2,000,000` wei
- Stored result: `ref_exists=True path_ok=False`
- Claim result: `FAILED`, payout recommendation `0` bps
- Refund result: `reward_deposited` changed from `2000000` to `0`
- Create transaction: `0x2e651d9d4f3125f615d6e963749b0c1295af88fa83b7db59f59ed9bab13dd48a`
- Claim transaction: `0xb3657a784dd7a2c0824ca0533d3a7b0edf02bd58e6528ca7edee6a20db78d5ba`
- Refund transaction: `0xcbe08406d291979176189845cf80c6957a967780647d31838470728b9c541c86`

### Scenario 3: deterministic weighted partial result

- Grant: `grant-8`; milestone: `ms-8`; criteria: `crit-8` and `crit-9`
- Evidence A: `README.md` exists and carries 5000 bps
- Evidence B: the negative-control path is absent and carries 5000 bps
- Deposit: `3,000,000` wei
- Stored results: one passing criterion and one failing criterion
- Final state: `PARTIAL_PASS`, exact recommendation `5000` bps, status `CHALLENGE_WINDOW`
- Create transaction: `0xacaa8efc2818ddc22a711da93c64855b9fa6ce0c9ccae943dc9f6acd511bfc9a`
- Claim transaction: `0x6baa76e8ef5ba02ecc598986e5e28d4d684105f16cada1424d25f343291939ab`

Each claim receipt contained three `agree` votes, which was the validator quorum for the completed StudioNet rounds. The machine-readable source of truth is [`../proof/live_e2e.json`](../proof/live_e2e.json).
