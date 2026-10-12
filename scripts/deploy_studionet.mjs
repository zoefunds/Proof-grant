import fs from "node:fs";
import keytar from "keytar";
import { createAccount, createClient, chains } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

const accountName = process.env.DEPLOYER_ACCOUNT ?? "cw-lender-e2e";
const privateKey = await keytar.getPassword("genlayer-cli", `account:${accountName}`);
if (!privateKey) throw new Error(`${accountName} is not unlocked in the GenLayer CLI keychain`);

const account = createAccount(privateKey);
const chain = chains.studionet;
const client = createClient({ chain, account });
const code = fs.readFileSync(new URL("../contracts/proof_grant.py", import.meta.url), "utf8");
const args = ["2500000000000000000000", 10000, 2000];

const hash = await client.deployContract({ code, args });
console.log(JSON.stringify({ event: "submitted", deployer: account.address, transaction: hash, args }));

const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.FINALIZED,
  retries: 300,
  interval: 3000,
});

const address =
  receipt.contractAddress ??
  receipt.contract_address ??
  receipt.data?.contractAddress ??
  receipt.data?.contract_address ??
  receipt.consensusData?.leaderReceipt?.[0]?.contractAddress ??
  receipt.consensus_data?.leader_receipt?.[0]?.contract_address;

const leaders = receipt.consensusData?.leaderReceipt ?? receipt.consensus_data?.leader_receipt ?? [];
const execution = receipt.txExecutionResultName ?? receipt.executionResultName ??
  leaders[0]?.executionResult ?? leaders[0]?.execution_result;
const payload = leaders[0]?.result?.payload;
if (execution === "ERROR" || payload === "invalid_contract") {
  throw new Error(`Deployment consensus finalized with contract execution failure: tx=${hash} execution=${execution} payload=${payload}`);
}

console.log(JSON.stringify({
  event: "finalized",
  deployer: account.address,
  transaction: hash,
  contract: address,
  status: receipt.statusName ?? receipt.status_name ?? receipt.status,
  execution,
  network: "GenLayer StudioNet",
  receipt,
}, (_key, value) => typeof value === "bigint" ? value.toString() : value));
