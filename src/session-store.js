/**
 * Session store — persists each platform's logged-in browser state (cookies + localStorage)
 * between searches so the scrapers don't have to redo the UI login every time.
 *
 * Playwright's `storageState` captures the whole client-side session; restoring it into a new
 * context makes the site see a returning, already-authenticated visitor. Each scraper still
 * VERIFIES the restored session actually works (sessions expire server-side) and falls back to
 * a fresh login + re-save when it doesn't.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '.sessions');

function statePath(name) {
  return path.join(DIR, `${name}.json`);
}

// Returns the storageState path for `newContext({ storageState })`, or undefined when no
// session has been saved yet (undefined = Playwright starts a clean context).
function loadStorageState(name) {
  const p = statePath(name);
  return fs.existsSync(p) ? p : undefined;
}

async function saveStorageState(context, name) {
  fs.mkdirSync(DIR, { recursive: true });
  await context.storageState({ path: statePath(name) });
}

module.exports = { loadStorageState, saveStorageState };
