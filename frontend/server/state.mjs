// ---------------------------------------------------------------------------
// The in-memory working copy of the clinic's data.
//
// Every route reads and writes this object synchronously, which is what makes
// the double-booking guard atomic: Node runs one handler at a time between
// awaits, so "check the slot, then write the row" cannot interleave. The store
// (store/*.mjs) persists changes to Google Sheets or a JSON file afterwards and
// loads this object on startup.
// ---------------------------------------------------------------------------

export const db = {
  clinic: null,
  doctors: [],
  calls: [],
  appointments: [],
  knowledge: [],
  liveCalls: [],
  campaigns: [],
  usage: {},
  onboarding: [],
  savedViews: [],
  /** Small key/value settings: bolnaAgentId, onboarding overrides, reminder log. */
  meta: {},
};

const DEFAULTS = {
  doctors: [],
  calls: [],
  appointments: [],
  knowledge: [],
  liveCalls: [],
  campaigns: [],
  usage: {},
  onboarding: [],
  savedViews: [],
  meta: {},
};

/** Replaces the working copy, keeping defaults for anything missing. */
export function replaceDb(data) {
  for (const key of Object.keys(db)) {
    if (data[key] !== undefined) db[key] = data[key];
    else if (key !== "clinic") db[key] = structuredClone(DEFAULTS[key]);
  }
}
