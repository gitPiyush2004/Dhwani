// ---------------------------------------------------------------------------
// Creates or updates the Bolna phone agent from the clinic's live data.
//
//   npm run bolna:sync                 create or update the agent
//   npm run bolna:sync -- --link       also point BOLNA_PHONE_NUMBER at it
//   npm run bolna:sync -- --print      print the payload, change nothing
//   npm run bolna:sync -- --call +91…  then ring this number with the agent
//
// The dashboard does the same from Settings > Integrations, and the server
// re-syncs automatically when doctors, FAQs or the knowledge base change.
// ---------------------------------------------------------------------------

import { buildAgentPayload } from "../bolna/agent-config.mjs";
import { agentId, getMe, linkInboundNumber, startCall, syncAgent } from "../bolna/client.mjs";
import { config } from "../config.mjs";
import { useStore } from "../domain.mjs";
import { createStore } from "../store/index.mjs";

const args = process.argv.slice(2);
const store = createStore();
useStore(store);
await store.init();

if (args.includes("--print")) {
  const text = JSON.stringify(buildAgentPayload(), null, 2);
  console.log(config.bolna.secret ? text.replaceAll(config.bolna.secret, "<BOLNA_SECRET>") : text);
  process.exit(0);
}

try {
  const me = await getMe();
  console.log(`Bolna account OK${me.wallet !== undefined ? `, wallet: ${me.wallet}` : ""}`);
  const { agentId: id, created } = await syncAgent();
  console.log(`${created ? "Created" : "Updated"} agent ${id}`);
  if (created && !config.bolna.agentId) {
    console.log(
      `${store.kind === "sheets" ? "Saved in the sheet's Settings tab." : "Saved in the local data file."} ` +
        `Add BOLNA_AGENT_ID=${id} to server/.env so a running API uses it too.`
    );
  }
  if (args.includes("--link")) {
    await linkInboundNumber();
    console.log(`Inbound calls to ${config.bolna.phoneNumber} now go to agent ${agentId()}`);
  }
  const callIdx = args.indexOf("--call");
  if (callIdx !== -1 && args[callIdx + 1]) {
    const out = await startCall(args[callIdx + 1], { test: true });
    console.log(`Calling ${args[callIdx + 1]}: execution ${out.execution_id ?? "?"} (${out.status ?? "queued"})`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await store.flush?.();
  process.exit();
}
