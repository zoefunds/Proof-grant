import { createClient, chains } from "genlayer-js";

const [contract, functionName, encodedArgs] = process.argv.slice(2);
if (!contract || !functionName || encodedArgs === undefined) {
  throw new Error("usage: read_studionet_contract.mjs <contract> <method> <args-json>");
}

const client = createClient({ chain: chains.studionet });
const result = await client.readContract({
  address: contract,
  functionName,
  args: JSON.parse(encodedArgs),
  stateStatus: "finalized",
});
console.log(JSON.stringify(result));
