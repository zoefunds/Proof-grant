# ProofGrant

ProofGrant is a standalone GenLayer Intelligent Contract for evidence-verified grant escrow. A funder deposits each grant's complete milestone budget when the grant is created. Validators independently inspect immutable public evidence, while deterministic contract logic calculates the payout recommendation and enforces the challenge window.

## Release status

The challenge-evidence remediation is deployed on StudioNet. Its SHA-256 is
`7e102730ae84c8db1dcb11454190ba8c104811e2d182de6ffe479161a3aa7646`.

| Field | Value |
| --- | --- |
| Network | GenLayer StudioNet |
| Chain ID | `61999` |
| Contract | `0x326A80daBad01998a8C205535e1136E08F0ab58f` |
| Contract class | `ProofGrant` |
| Deployment transaction | `0x9ef709b68956a380eca3ac1a51fc6afa821358b530a50ec9beda6eba756fa1ec` |
| Deployment result | `FINALIZED / MAJORITY_AGREE` |
| Deployer | `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5` |
| Deployed source SHA-256 | `7e102730ae84c8db1dcb11454190ba8c104811e2d182de6ffe479161a3aa7646` |
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
| Challenge settlement and bounty | the original passing result plus the exact disputed criterion's authoritative re-check (`criterion_id`, `passed`, `unreachable`) |

Diagnostic text, latency, and challenger-provided URLs/notes are intentionally
excluded because the contract never uses them to choose a verdict, payout,
refund, slash, or bounty. A third-party page can therefore not overturn a
still-passing criterion merely by returning HTTP 200, echoing an anchor, and
containing a generic failure word.

## Verified StudioNet E2E results

All tests below ran on StudioNet chain `61999` on October 19, 2026. The funder was `0x1c2e587043568239B2fcaeC5f96F278EB134b7f5`; the grantee was `0x034d85C75b3902892C2F1D5887744Ab65d333176`. Validators fetched evidence from the real public [`genlayerlabs/genlayer-js`](https://github.com/genlayerlabs/genlayer-js) repository at ref `main`.

| Scenario | Real criterion | Funded reward | Result | Transactions |
| --- | --- | ---: | --- | --- |
| Positive repository evidence | Root `package.json` exists | `1,000,000` wei | `PASSED`, 10000 bps, `CHALLENGE_WINDOW` | create `0x7ad71a0650406429973f460874df9fb3bfb74189f1e0b3f0b9ea1f21418c6a7f`; claim `0x0863ef2fe5954dd5142bc634481ea13772ab9f851f19689a1017f1dc436bcb31` |
| Negative-control evidence | `proofgrant-live-evidence/absent-file-2026-10-19.txt` does not exist | `2,000,000` wei | `FAILED`, then fully refunded; escrow balance became `0` | create `0x2e651d9d4f3125f615d6e963749b0c1295af88fa83b7db59f59ed9bab13dd48a`; claim `0xb3657a784dd7a2c0824ca0533d3a7b0edf02bd58e6528ca7edee6a20db78d5ba`; refund `0xcbe08406d291979176189845cf80c6957a967780647d31838470728b9c541c86` |
| Weighted mixed evidence | `README.md` exists at 5000 bps; negative-control path does not exist at 5000 bps | `3,000,000` wei | `PARTIAL_PASS`, exactly 5000 bps, `CHALLENGE_WINDOW` | create `0xacaa8efc2818ddc22a711da93c64855b9fa6ce0c9ccae943dc9f6acd511bfc9a`; claim `0x6baa76e8ef5ba02ecc598986e5e28d4d684105f16cada1424d25f343291939ab` |

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

To inspect the deployed release, use StudioNet chain `61999` and address `0x326A80daBad01998a8C205535e1136E08F0ab58f`.

See [`docs/TESTING.md`](docs/TESTING.md) for exact live-test prerequisites and safety notes.
