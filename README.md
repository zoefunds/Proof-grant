# ProofGrant

ProofGrant is a standalone GenLayer Intelligent Contract for evidence-verified grant escrow. A funder deposits each grant's complete milestone budget when the grant is created. Validators independently inspect immutable public evidence, while deterministic contract logic calculates the payout recommendation and enforces the challenge window.

## Live deployment

| Field | Value |
| --- | --- |
| Network | GenLayer StudioNet |
| Chain ID | `61999` |
| Contract | `0xC28F6ad60bb686F900700c8d3eB7845dfAe0ec46` |
| Contract class | `ProofGrant` |
| Deployment transaction | `0x1aa284d305207b7f8c0b0136c2449653723ff9d077387a9490031bc7ca001d62` |
| Deployment result | `FINALIZED / SUCCESS / MAJORITY_AGREE` |
| Deployer | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Deployed source SHA-256 | `6aa4d2741d8e0e9f5df5c1b6b5c71187fa572cba1f965f69fcb6b1d67ec13bd5` |
| GenVM runner | `v0.2.16` |
| Python dependency | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Constructor values | bond `2500000000000000000000` wei; frivolous slash `10000` bps; upheld bounty `2000` bps |

The authoritative deployment record is [`proof/deployment.json`](proof/deployment.json). The complete E2E results, including stored contract state and transaction hashes, are in [`proof/live_e2e.json`](proof/live_e2e.json).

## Verified StudioNet E2E results

All tests below ran on StudioNet chain `61999` on October 13, 2026. The funder was `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5`; the grantee was `0x034d85C75b3902892C2F1D5887744Ab65d333176`. Validators fetched evidence from the real public [`genlayerlabs/genlayer-js`](https://github.com/genlayerlabs/genlayer-js) repository at ref `main`.

| Scenario | Real criterion | Funded reward | Result | Transactions |
| --- | --- | ---: | --- | --- |
| Positive repository evidence | Root `package.json` exists | `1,000,000` wei | `PASSED`, 10000 bps, `CHALLENGE_WINDOW` | create `0x3d7494700952280eb857a3c667399c9ae2116ff83b3fa10bbde2d0bdf875dd52`; claim `0xb3e0c02e0bcc5402c58af843dc3d099c5941805e0b4e4a33fcb1d74660713019` |
| Negative-control evidence | `proofgrant-live-evidence/absent-file-2026-10-13.txt` does not exist | `2,000,000` wei | `FAILED`, then fully refunded; escrow balance became `0` | create `0xa7a070a5ce902548dac589a799b99eb1d4485fd2d2b2d621b30fb12019869bcb`; claim `0xec263b5964665875a736886c30c8e0b858ce8a8d9f61432e9f5e96e13dec88f0`; refund `0x4314e65a8a8f1f8216357b80f536163ebeb6a8fc0b972b24813796744e2d5e76` |
| Weighted mixed evidence | `README.md` exists at 5000 bps; negative-control path does not exist at 5000 bps | `3,000,000` wei | `PARTIAL_PASS`, exactly 5000 bps, `CHALLENGE_WINDOW` | create `0x5b77d1a11367af2aecf4c40f95a5f072ef9dc90ca60d428af78fe9223cfb8fce`; claim `0xbe018f6ea2faa490ecaf590c97474fa36db0472c5baf247c0da096b9eeb0f415` |

Every claim finalized with validator quorum and three recorded `agree` votes. These are deliberately small test deposits; amounts are wei, not whole GEN.

## Contract lifecycle

1. `create_grant` records the grantee, immutable milestone criteria and public evidence locations, and requires an exact GEN deposit equal to all milestone rewards.
2. `submit_milestone_claim` pins the claim note and evaluates each criterion through GenLayer consensus.
3. Deterministic logic converts criterion results and weights into `PASSED`, `PARTIAL_PASS`, `FAILED`, or `INCONCLUSIVE`.
4. Passing results enter a bounded challenge window. A challenge must target a pinned criterion and include the configured bond.
5. After an unchallenged window, `release_milestone` transfers the deterministic payout. A failed milestone can be refunded to its funder.

Escrow accounting is updated before external transfers. Validator/LLM output cannot directly choose or transfer an arbitrary amount.

## Repository layout

```text
contracts/proof_grant.py       Standalone deployed contract
tests/direct/                  Executable direct-mode behavior tests
tests/static/                  Source and invariant tests
scripts/deploy_studionet.mjs   Receipt-validated StudioNet deployment
scripts/live_e2e.mjs           Three real-data StudioNet E2E scenarios
proof/deployment.json          Canonical deployment manifest
proof/live_e2e.json            Full successful E2E evidence
docs/TESTING.md                Reproduction and verification guide
```

## Installation and verification

Requirements: Python 3.12 or newer, Node.js 18 or newer, `genlayer-test`, `genvm-linter`, and an unlocked GenLayer CLI account for live operations.

```bash
npm ci
python3 -m pytest -q
genvm-lint contracts/proof_grant.py
```

Expected result for this release: `17 passed` and `Lint passed (3 checks)`.

To inspect the already-deployed contract, use StudioNet chain `61999` and address `0xC28F6ad60bb686F900700c8d3eB7845dfAe0ec46`. Deployment creates a new immutable address, so do not run `npm run deploy:studionet` unless a new release is intentionally required.

See [`docs/TESTING.md`](docs/TESTING.md) for exact live-test prerequisites and safety notes.
