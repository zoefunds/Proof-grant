import keytar from "keytar";
import { createAccount, createClient, chains } from "genlayer-js";

const [accountName, contract, functionName, value, ...args] = process.argv.slice(2);
if (!accountName || !contract || !functionName || value === undefined) {
  throw new Error("usage: submit_studionet_write.mjs <account> <contract> <method> <value-wei> [args...]");
}

const privateKey = await keytar.getPassword("genlayer-cli", `account:${accountName}`);
if (!privateKey) throw new Error(`${accountName} is not unlocked in the GenLayer CLI keychain`);

const client = createClient({ chain: chains.studionet, account: createAccount(privateKey) });
const hash = await client.writeContract({
  address: contract,
  functionName,
  args,
  value: BigInt(value),
});
console.log(hash);
