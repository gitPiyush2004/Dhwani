// ---------------------------------------------------------------------------
// Tiny .env loader, so the server stays zero-dependency.
//
// Reads server/.env (and then ./.env) and copies any KEY=value pair into
// process.env, without overriding variables that are already set. Hosts like
// Render and Railway set real environment variables, so this only matters
// locally.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function parse(text) {
  const out = {};
  let key = null;
  let buffer = null;
  for (const raw of text.split(/\r?\n/)) {
    // Continue a multi-line double-quoted value (a pasted private key, say).
    if (key !== null) {
      buffer += `\n${raw}`;
      if (raw.trimEnd().endsWith('"')) {
        out[key] = buffer.trimEnd().slice(0, -1);
        key = null;
      }
      continue;
    }
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let v = line.slice(eq + 1).trim();
    if (v.startsWith('"') && !(v.length > 1 && v.endsWith('"'))) {
      key = k;
      buffer = v.slice(1);
      continue;
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else {
      v = v.replace(/\s+#.*$/, "");
    }
    out[k] = v;
  }
  return out;
}

export function loadEnv(files = [join(here, ".env"), join(process.cwd(), ".env")]) {
  if (process.env.SKIP_DOTENV) return;
  for (const file of files) {
    if (!existsSync(file)) continue;
    const vars = parse(readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}
