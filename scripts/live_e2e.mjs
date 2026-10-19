import fs from "node:fs";
import { execFileSync } from "node:child_process";

const contract = process.env.PROOF_GRANT_CONTRACT;
if (!contract) throw new Error("PROOF_GRANT_CONTRACT is required");

const funder = { address: "0x1c2e587043568239B2fcaeC5f96F278EB134b7f5" };
const grantee = { address: "0x034d85C75b3902892C2F1D5887744Ab65d333176" };
const funderClient = null;
const granteeClient = null;
const results = [];
const repository = "https://github.com/genlayerlabs/genlayer-js";
const repositoryRef = "main";
const evidenceDate = new Date().toISOString().slice(0, 10);
const absentPath = `proofgrant-live-evidence/absent-file-${evidenceDate}.txt`;

const read = (_client, functionName, args = []) => JSON.parse(execFileSync(
  "node",
  ["scripts/read_studionet_contract.mjs", contract, functionName, JSON.stringify(args)],
  { encoding: "utf8" },
));

const write = (accountName, functionName, args = [], value = 0n) => {
  // genlayer-js can terminate the current Node process after submitting a
  // transaction. Isolating submission keeps this runner alive to obtain a
  // finalized receipt and prevents incomplete E2E evidence.
  const hash = execFileSync(
    "node",
    [
      "scripts/submit_studionet_write.mjs",
      accountName,
      contract,
      functionName,
      value.toString(),
      ...args,
    ],
    { encoding: "utf8" },
  ).trim();
  console.log(JSON.stringify({ event: "submitted", functionName, hash }));
  const receiptText = execFileSync(
    "npx",
    ["genlayer", "receipt", hash, "--retries", "300", "--interval", "3000"],
    { encoding: "utf8" },
  );
  if (!receiptText.includes("status_name: 'FINALIZED'") || !receiptText.includes("execution_result: 'SUCCESS'")) {
    throw new Error(`${functionName} did not finalize successfully: tx=${hash}`);
  }
  const votesBlock = receiptText.match(/votes:\s*\{([\s\S]*?)\n\s*\},\n\s*leader_receipt:/)?.[1] ?? "";
  const agreeingValidators = (votesBlock.match(/:\s*'agree'/g) ?? []).length;
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
  const create = write(process.env.FUNDER_ACCOUNT ?? "cw-lender-e2e", "create_grant", [grantee.address, title, JSON.stringify(spec)], rewardWei);
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
    title: `GenLayer JS package-manifest verification grant — ${evidenceDate}`,
    rewardWei: 1_000_000n,
    criteria: [gitCriterion({
      description: "The genlayerlabs/genlayer-js main branch resolves to a live commit and contains package.json at the repository root",
      path: "package.json",
      weightBps: 10000,
    })],
  });
  const claim = write(process.env.GRANTEE_ACCOUNT ?? "cw-borrower-e2e", "submit_milestone_claim", [opened.milestoneId, `Live verification of the public genlayerlabs/genlayer-js main branch and its root package manifest on ${evidenceDate}.`]);
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
    title: `GenLayer JS absent-artifact control grant — ${evidenceDate}`,
    rewardWei,
    criteria: [gitCriterion({
      description: `The genlayerlabs/genlayer-js main branch must contain the audit artifact at ${absentPath}`,
      path: absentPath,
      weightBps: 10000,
    })],
  });
  const claim = write(process.env.GRANTEE_ACCOUNT ?? "cw-borrower-e2e", "submit_milestone_claim", [opened.milestoneId, `Negative-control verification: validators must independently confirm that ${absentPath} is absent from the real public repository.`]);
  const failed = await read(funderClient, "get_milestone", [opened.milestoneId]);
  if (failed.verdict !== "FAILED" || failed.status !== "FAILED") {
    throw new Error(`scenario 2 expected FAILED: ${JSON.stringify(failed)}`);
  }
  const refund = write(process.env.FUNDER_ACCOUNT ?? "cw-lender-e2e", "claim_failed_milestone_refund", [opened.milestoneId]);
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
    title: `GenLayer JS weighted repository completeness grant — ${evidenceDate}`,
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
  const claim = write(process.env.GRANTEE_ACCOUNT ?? "cw-borrower-e2e", "submit_milestone_claim", [opened.milestoneId, "Weighted live audit of two immutable criteria against the same public main-branch snapshot: README presence and the explicit negative-control artifact path."]);
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
