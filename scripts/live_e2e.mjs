import fs from "node:fs";
import keytar from "keytar";
import { createAccount, createClient, chains } from "genlayer-js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

const contract = process.env.PROOF_GRANT_CONTRACT;
if (!contract) throw new Error("PROOF_GRANT_CONTRACT is required");

const loadAccount = async (name) => {
  const key = await keytar.getPassword("genlayer-cli", `account:${name}`);
  if (!key) throw new Error(`${name} is not unlocked in the GenLayer CLI keychain`);
  return createAccount(key);
};

const funder = await loadAccount(process.env.FUNDER_ACCOUNT ?? "cw-lender-e2e");
const grantee = await loadAccount(process.env.GRANTEE_ACCOUNT ?? "cw-borrower-e2e");
const chain = chains.studionet;
const funderClient = createClient({ chain, account: funder });
const granteeClient = createClient({ chain, account: grantee });
const results = [];
const repository = "https://github.com/genlayerlabs/genlayer-js";
const repositoryRef = "main";
const absentPath = "proofgrant-live-evidence/absent-file-2026-10-13.txt";

const read = (client, functionName, args = []) => client.readContract({
  address: contract,
  functionName,
  args,
  stateStatus: "finalized",
});

const write = async (client, functionName, args = [], value = 0n) => {
  const hash = await client.writeContract({ address: contract, functionName, args, value });
  console.log(JSON.stringify({ event: "submitted", functionName, hash }));
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 300,
    interval: 3000,
  });
  const execution = receipt.txExecutionResultName ?? receipt.executionResultName;
  const executionNumber = receipt.txExecutionResult ?? receipt.executionResult;
  const leaders = receipt.consensusData?.leaderReceipt ?? receipt.consensus_data?.leader_receipt ?? [];
  const leaderExecution = leaders[0]?.executionResult ?? leaders[0]?.execution_result;
  const succeeded = execution === "FINISHED_WITH_RETURN" ||
    executionNumber === ExecutionResult.FINISHED_WITH_RETURN || leaderExecution === "SUCCESS";
  if (!succeeded) throw new Error(`${functionName} failed: tx=${hash} execution=${execution ?? executionNumber ?? leaderExecution}`);
  const votes = receipt.consensusData?.votes ?? receipt.consensus_data?.votes ?? {};
  const agreeingValidators = Object.values(votes).filter((vote) => String(vote).toLowerCase() === "agree").length;
  return { hash, agreeingValidators };
};

const gitCriterion = ({ description, path, weightBps }) => ({
  criterion_type: "GIT_REPO_STATE",
  description,
  repo_url: repository,
  repo_ref: repositoryRef,
  repo_path_expected: path,
  weight_bps: weightBps,
});

const createGrant = async ({ title, rewardWei, criteria }) => {
  const spec = [{
    title: `${title} — repository evidence checkpoint`,
    reward_wei: rewardWei.toString(),
    challenge_window_seconds: 86400,
    claimable_after: 0,
    criteria,
  }];
  const before = await read(funderClient, "list_grants");
  const create = await write(funderClient, "create_grant", [grantee.address, title, JSON.stringify(spec)], rewardWei);
  const after = await read(funderClient, "list_grants");
  if (after.length !== before.length + 1) throw new Error(`${title}: grant registry did not grow by one`);
  const grantId = after[after.length - 1];
  const grant = await read(funderClient, "get_grant", [grantId]);
  const milestoneId = grant.milestone_ids[0];
  return { grantId, milestoneId, grant, spec, create };
};

// Scenario 1: a real repository commit and package manifest are independently verified.
{
  const opened = await createGrant({
    title: "GenLayer JS package-manifest verification grant — 2026-10-13",
    rewardWei: 1_000_000n,
    criteria: [gitCriterion({
      description: "The genlayerlabs/genlayer-js main branch resolves to a live commit and contains package.json at the repository root",
      path: "package.json",
      weightBps: 10000,
    })],
  });
  const claim = await write(granteeClient, "submit_milestone_claim", [opened.milestoneId, "Live verification of the public genlayerlabs/genlayer-js main branch and its root package manifest on 2026-10-13."]);
  const milestone = await read(funderClient, "get_milestone", [opened.milestoneId]);
  if (milestone.verdict !== "PASSED" || milestone.status !== "CHALLENGE_WINDOW") {
    throw new Error(`scenario 1 expected PASSED/CHALLENGE_WINDOW: ${JSON.stringify(milestone)}`);
  }
  const criterion = await read(funderClient, "get_criterion", [milestone.criteria_ids[0]]);
  const criterionResult = await read(funderClient, "get_criterion_result", [milestone.result_ids[0]]);
  results.push({
    scenario: 1,
    title: opened.grant.title,
    expectedOutcome: "PASSED",
    grantId: opened.grantId,
    milestoneId: opened.milestoneId,
    repository,
    repositoryRef,
    criterion,
    criterionResult,
    finalMilestone: milestone,
    transactions: { create: opened.create.hash, claim: claim.hash },
    agreeingValidators: claim.agreeingValidators,
  });
}

// Scenario 2: the repository exists but a precisely named path does not; failure is refunded.
{
  const rewardWei = 2_000_000n;
  const opened = await createGrant({
    title: "GenLayer JS absent-artifact control grant — 2026-10-13",
    rewardWei,
    criteria: [gitCriterion({
      description: `The genlayerlabs/genlayer-js main branch must contain the audit artifact at ${absentPath}`,
      path: absentPath,
      weightBps: 10000,
    })],
  });
  const claim = await write(granteeClient, "submit_milestone_claim", [opened.milestoneId, `Negative-control verification: validators must independently confirm that ${absentPath} is absent from the real public repository.`]);
  const failed = await read(funderClient, "get_milestone", [opened.milestoneId]);
  if (failed.verdict !== "FAILED" || failed.status !== "FAILED") {
    throw new Error(`scenario 2 expected FAILED: ${JSON.stringify(failed)}`);
  }
  const refund = await write(funderClient, "claim_failed_milestone_refund", [opened.milestoneId]);
  const refunded = await read(funderClient, "get_milestone", [opened.milestoneId]);
  if (refunded.reward_deposited !== "0") throw new Error(`scenario 2 refund ledger not zero: ${JSON.stringify(refunded)}`);
  const criterion = await read(funderClient, "get_criterion", [failed.criteria_ids[0]]);
  const criterionResult = await read(funderClient, "get_criterion_result", [failed.result_ids[0]]);
  results.push({
    scenario: 2,
    title: opened.grant.title,
    expectedOutcome: "FAILED then fully refunded",
    grantId: opened.grantId,
    milestoneId: opened.milestoneId,
    repository,
    repositoryRef,
    criterion,
    criterionResult,
    failedMilestone: failed,
    finalMilestone: refunded,
    transactions: { create: opened.create.hash, claim: claim.hash, refund: refund.hash },
    agreeingValidators: claim.agreeingValidators,
  });
}

// Scenario 3: one real path passes and one absent path fails, producing exact 50% partial payout advice.
{
  const opened = await createGrant({
    title: "GenLayer JS weighted repository completeness grant — 2026-10-13",
    rewardWei: 3_000_000n,
    criteria: [
      gitCriterion({
        description: "The genlayerlabs/genlayer-js main branch resolves and contains the public README.md documentation file",
        path: "README.md",
        weightBps: 5000,
      }),
      gitCriterion({
        description: `The same main branch contains the additional evidence artifact at ${absentPath}`,
        path: absentPath,
        weightBps: 5000,
      }),
    ],
  });
  const claim = await write(granteeClient, "submit_milestone_claim", [opened.milestoneId, "Weighted live audit of two immutable criteria against the same public main-branch snapshot: README presence and the explicit negative-control artifact path."]);
  const milestone = await read(funderClient, "get_milestone", [opened.milestoneId]);
  if (milestone.verdict !== "PARTIAL_PASS" || milestone.status !== "CHALLENGE_WINDOW" || Number(milestone.recommended_payout_bps) !== 5000) {
    throw new Error(`scenario 3 expected PARTIAL_PASS/5000 bps: ${JSON.stringify(milestone)}`);
  }
  const criteria = await Promise.all(milestone.criteria_ids.map((id) => read(funderClient, "get_criterion", [id])));
  const criterionResults = await Promise.all(milestone.result_ids.map((id) => read(funderClient, "get_criterion_result", [id])));
  results.push({
    scenario: 3,
    title: opened.grant.title,
    expectedOutcome: "PARTIAL_PASS with deterministic 5000 bps recommendation",
    grantId: opened.grantId,
    milestoneId: opened.milestoneId,
    repository,
    repositoryRef,
    criteria,
    criterionResults,
    finalMilestone: milestone,
    transactions: { create: opened.create.hash, claim: claim.hash },
    agreeingValidators: claim.agreeingValidators,
  });
}

const output = {
  ok: true,
  testedAt: new Date().toISOString(),
  network: "GenLayer StudioNet",
  chainId: 61999,
  contract,
  funder: funder.address,
  grantee: grantee.address,
  repositoryEvidence: { repository, ref: repositoryRef, negativeControlPath: absentPath },
  scenarios: results,
};

fs.mkdirSync(new URL("../proof/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("../proof/live_e2e.json", import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
