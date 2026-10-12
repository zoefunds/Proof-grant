# ProofGrant verification guide

This document describes the checks completed for the deployed ProofGrant release and how to reproduce them. The public deployment and E2E target is exclusively GenLayer StudioNet chain `61999`.

## Verified release

- Contract: `0xC28F6ad60bb686F900700c8d3eB7845dfAe0ec46`
- Deployment transaction: `0x1aa284d305207b7f8c0b0136c2449653723ff9d077387a9490031bc7ca001d62`
- Deployment execution: `FINALIZED / SUCCESS / MAJORITY_AGREE`
- Source SHA-256: `6aa4d2741d8e0e9f5df5c1b6b5c71187fa572cba1f965f69fcb6b1d67ec13bd5`
- StudioNet schema: constructor plus 21 public methods
- Local verification: 17 tests passed; all 3 GenVM lint checks passed
- Live verification: 3 of 3 funded E2E scenarios passed on chain `61999`

## Local verification layers

Run from the repository root:

```bash
npm ci
python3 -m pytest -q
genvm-lint contracts/proof_grant.py
```

The 17-test suite contains:

- Static checks for the `ProofGrant` identity, complete escrow API, deterministic clock usage, separation of consensus from payout calculation, and guarded value transfers.
- Direct-mode execution for grant creation, exact funding, access control, successful and failed claims, weighted partial results, challenge binding and resolution, release guards, and failed-milestone refunds.

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
PROOF_GRANT_CONTRACT=0xC28F6ad60bb686F900700c8d3eB7845dfAe0ec46 npm run test:live
```

The runner is fixed to `chains.studionet`; the resulting evidence file must state `"network": "GenLayer StudioNet"` and `"chainId": 61999`.

## Completed E2E assertions

### Scenario 1: positive repository evidence

- Grant: `grant-1`; milestone: `ms-1`; criterion: `crit-1`
- Evidence: `package.json` exists at the repository root on `main`
- Deposit: `1,000,000` wei
- Stored result: `ref_exists=True path_ok=True`
- Final state: `PASSED`, payout recommendation `10000` bps, status `CHALLENGE_WINDOW`
- Create transaction: `0x3d7494700952280eb857a3c667399c9ae2116ff83b3fa10bbde2d0bdf875dd52`
- Claim transaction: `0xb3e0c02e0bcc5402c58af843dc3d099c5941805e0b4e4a33fcb1d74660713019`

### Scenario 2: negative control and refund

- Grant: `grant-2`; milestone: `ms-2`; criterion: `crit-2`
- Evidence: `proofgrant-live-evidence/absent-file-2026-10-13.txt` is absent from `main`
- Deposit: `2,000,000` wei
- Stored result: `ref_exists=True path_ok=False`
- Claim result: `FAILED`, payout recommendation `0` bps
- Refund result: `reward_deposited` changed from `2000000` to `0`
- Create transaction: `0xa7a070a5ce902548dac589a799b99eb1d4485fd2d2b2d621b30fb12019869bcb`
- Claim transaction: `0xec263b5964665875a736886c30c8e0b858ce8a8d9f61432e9f5e96e13dec88f0`
- Refund transaction: `0x4314e65a8a8f1f8216357b80f536163ebeb6a8fc0b972b24813796744e2d5e76`

### Scenario 3: deterministic weighted partial result

- Grant: `grant-3`; milestone: `ms-3`; criteria: `crit-3` and `crit-4`
- Evidence A: `README.md` exists and carries 5000 bps
- Evidence B: the negative-control path is absent and carries 5000 bps
- Deposit: `3,000,000` wei
- Stored results: one passing criterion and one failing criterion
- Final state: `PARTIAL_PASS`, exact recommendation `5000` bps, status `CHALLENGE_WINDOW`
- Create transaction: `0x5b77d1a11367af2aecf4c40f95a5f072ef9dc90ca60d428af78fe9223cfb8fce`
- Claim transaction: `0xbe018f6ea2faa490ecaf590c97474fa36db0472c5baf247c0da096b9eeb0f415`

Each claim receipt contained three `agree` votes, which was the validator quorum for the completed StudioNet rounds. The machine-readable source of truth is [`../proof/live_e2e.json`](../proof/live_e2e.json).
