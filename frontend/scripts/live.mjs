// ---------------------------------------------------------------------------
// npm run live: everything for a real end-to-end test, on this laptop.
//
//   1. opens a Cloudflare quick tunnel to the API (Bolna needs public HTTPS)
//   2. starts the API with PUBLIC_URL set to the tunnel
//   3. pushes the agent config to Bolna, so its tools and webhook point here
//   4. starts the dashboard on http://localhost:5173
//
// The tunnel URL changes on every run; step 3 keeps Bolna in step. Ctrl+C
// stops everything. Needs `cloudflared` (brew install cloudflared).
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
const run = (cmd, args, opts = {}) => {
  const child = spawn(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], ...opts });
  children.push(child);
  return child;
};
const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const prefix = (name, stream) =>
  stream.on("data", (d) => {
    for (const line of String(d).split("\n").filter(Boolean)) console.log(`[${name}] ${line}`);
  });

// 1. Tunnel
console.log("Opening a public tunnel to the API…");
const tunnel = run("cloudflared", ["tunnel", "--no-autoupdate", "--url", "http://localhost:8787"]);
tunnel.on("error", () => {
  console.error("cloudflared is not installed. Run: brew install cloudflared");
  stop();
});
const publicUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("The tunnel did not start within 40 s")), 40_000);
  const scan = (d) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d));
    if (m) {
      clearTimeout(timer);
      resolve(m[0]);
    }
  };
  tunnel.stdout.on("data", scan);
  tunnel.stderr.on("data", scan);
});
console.log(`Public URL: ${publicUrl}`);

// 2. API
const env = { ...process.env, PUBLIC_URL: publicUrl };
const api = run("node", ["server/index.mjs"], { env });
prefix("api", api.stdout);
prefix("api", api.stderr);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch("http://localhost:8787/health")).ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}
// Cloudflare needs a few seconds before a new quick tunnel answers.
for (let i = 0; i < 30; i++) {
  try {
    if ((await fetch(`${publicUrl}/health`)).ok) break;
  } catch {
    /* DNS not ready yet */
  }
  await new Promise((r) => setTimeout(r, 1000));
}

// 3. Point the Bolna agent at this URL
const sync = run("node", ["server/scripts/bolna-sync.mjs"], { env });
prefix("bolna", sync.stdout);
prefix("bolna", sync.stderr);
await new Promise((r) => sync.on("exit", r));

// 4. Dashboard
const web = run("npx", ["vite", "--port", "5173"], { env });
prefix("web", web.stdout);
console.log("\nReady. Dashboard: http://localhost:5173/app   (Ctrl+C stops everything)\n");
