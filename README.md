# ProofGrant

ProofGrant is a standalone GenLayer Intelligent Contract for evidence-verified grant escrow. A funder deposits each grant's complete milestone budget when the grant is created. Validators independently inspect immutable public evidence, while deterministic contract logic calculates the payout recommendation and enforces the challenge window.

## Release status

The remediated source is deployed and E2E-verified on StudioNet. Its SHA-256
is `aebc4c473eea82b405599ea5df2842074e753e47f131f4087d3a441fc56ee0b8`.

| Field | Value |
| --- | --- |
| Network | GenLayer StudioNet |
| Chain ID | `61999` |
| Contract | `0x05607023Cce260DBdDe4597ECE740ead5B8aA5B8` |
| Contract class | `ProofGrant` |
| Deployment transaction | `0xa145c50817721bc8a7ff3c9c48186880efb502304fd1175f1ceb62c0e09c87ca` |
| Deployment result | `FINALIZED / SUCCESS / MAJORITY_AGREE` |
| Deployer | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Deployed source SHA-256 | `aebc4c473eea82b405599ea5df2842074e753e47f131f4087d3a441fc56ee0b8` |
| GenVM runner | `v0.2.16` |
| Python dependency | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |
| Constructor values | bond `2500000000000000000000` wei; frivolous slash `10000` bps; upheld bounty `2000` bps |

The authoritative deployment record is [`proof/deployment.json`](proof/deployment.json). The complete E2E results, including stored contract state and transaction hashes, are in [`proof/live_e2e.json`](proof/live_e2e.json).

## Consensus-binding remediation

The current source is designed so a validator independently recomputes and
compares every nondeterministic field that can affect an economic result:

| Decision | Bound fields |
| --- | --- |
| Milestone verdict and payout | per-criterion `criterion_id`, `passed`, `unreachable`, plus aggregate `any_unreachable` |
| Challenge re-check | the same complete base-criterion fields, including reachability |
| Challenge settlement and bounty | disputed `criterion_id`, evidence `reachable`, `anchor_referenced`, and `corroborates_failure` |

Diagnostic text and latency are intentionally excluded because the contract
never uses them to choose a verdict, payout, refund, slash, or bounty.

## Verified StudioNet E2E results

All tests below ran on StudioNet chain `61999` on October 19, 2026. The funder was `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5`; the grantee was `0x034d85C75b3902892C2F1D5887744Ab65d333176`. Validators fetched evidence from the real public [`genlayerlabs/genlayer-js`](https://github.com/genlayerlabs/genlayer-js) repository at ref `main`.

| Scenario | Real criterion | Funded reward | Result | Transactions |
| --- | --- | ---: | --- | --- |
| Positive repository evidence | Root `package.json` exists | `1,000,000` wei | `PASSED`, 10000 bps, `CHALLENGE_WINDOW` | create `0x333c2050f6f3880e6044551835d9be7492e0875a814bc58db698dbcedcb35dc4`; claim `0xf5f8f6a0d5e68f483ed2373927334d42188e342e46939940c0fdbd37241d66c3` |
| Negative-control evidence | `proofgrant-live-evidence/absent-file-2026-10-13.txt` does not exist | `2,000,000` wei | `FAILED`, then fully refunded; escrow balance became `0` | create `0x3b3d94f0697c745dcc0b8d407d7734d79527621de3413780ce4b670fe61b6428`; claim `0x14946e21b1137577a4b2612a80afa8f2f571a3002c9d13ab71d7700fe06c163b`; refund `0x245934ab3ce57f63c725de6354def02e7ca291794f6c2fca1f49435715046807` |
| Weighted mixed evidence | `README.md` exists at 5000 bps; negative-control path does not exist at 5000 bps | `3,000,000` wei | `PARTIAL_PASS`, exactly 5000 bps, `CHALLENGE_WINDOW` | create `0xeb73078d7ed071736fb695a4f540ef4e88575e4d02cc3bc93b40c7c17e643d5a`; claim `0x7fc7bc9b78914a27c6f5da971a0d6ba2c28dd0517c5137973557a0dade44f850` |

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

Expected result for the remediation: `20 passed` and `Lint passed (3 checks)`.

To inspect the deployed release, use StudioNet chain `61999` and address `0x05607023Cce260DBdDe4597ECE740ead5B8aA5B8`.

See [`docs/TESTING.md`](docs/TESTING.md) for exact live-test prerequisites and safety notes.
