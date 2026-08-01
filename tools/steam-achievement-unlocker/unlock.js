#!/usr/bin/env node
"use strict";

/**
 * GGdropman Steam Achievement Unlocker
 * Requires: Steam client running & logged in, Node 18+, ownership of the AppID.
 * Default AppID: State of Decay 2 (495720).
 */

const fs = require("fs");
const path = require("path");

const PRESETS = {
  sod2: 495720,
  "state-of-decay-2": 495720,
  spacewar: 480,
};

function printHelp() {
  console.log(`GGdropman Steam Achievement Unlocker

Usage:
  node unlock.js [options]

Options:
  --app <id|name>     Steam AppID or preset (sod2, spacewar). Default: 495720 (SoD2)
  --list              List achievements and unlock state
  --unlock <name>     Unlock one achievement API name (repeatable)
  --lock <name>       Clear/lock one achievement API name (repeatable)
  --unlock-all        Unlock every achievement for the app
  --lock-all          Clear every achievement for the app
  --locked-only       With --list, only show locked
  --unlocked-only     With --list, only show unlocked
  -h, --help          Show help

Examples:
  node unlock.js --list
  node unlock.js --app sod2 --unlock-all
  node unlock.js --app 480 --unlock ACH_WIN_ONE_GAME
  node unlock.js --lock-all

Notes:
  - Close the target game first (Steamworks init works best without it fighting you).
  - Steam must be running and you must own the AppID.
  - This cannot run inside the browser hub — it talks to the local Steam client.
`);
}

function parseArgs(argv) {
  const args = {
    app: 495720,
    list: false,
    unlockAll: false,
    lockAll: false,
    unlock: [],
    lock: [],
    lockedOnly: false,
    unlockedOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--list") args.list = true;
    else if (a === "--unlock-all") args.unlockAll = true;
    else if (a === "--lock-all") args.lockAll = true;
    else if (a === "--locked-only") args.lockedOnly = true;
    else if (a === "--unlocked-only") args.unlockedOnly = true;
    else if (a === "--app") {
      const raw = argv[++i];
      if (!raw) throw new Error("--app requires a value");
      const key = String(raw).toLowerCase();
      if (PRESETS[key] != null) args.app = PRESETS[key];
      else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid --app: " + raw);
        args.app = n;
      }
    } else if (a === "--unlock") {
      const name = argv[++i];
      if (!name) throw new Error("--unlock requires an achievement API name");
      args.unlock.push(name);
    } else if (a === "--lock") {
      const name = argv[++i];
      if (!name) throw new Error("--lock requires an achievement API name");
      args.lock.push(name);
    } else {
      throw new Error("Unknown argument: " + a);
    }
  }

  if (
    !args.help &&
    !args.list &&
    !args.unlockAll &&
    !args.lockAll &&
    !args.unlock.length &&
    !args.lock.length
  ) {
    args.list = true;
  }

  return args;
}

function writeAppIdFile(appId) {
  const file = path.join(__dirname, "steam_appid.txt");
  fs.writeFileSync(file, String(appId) + "\n", "utf8");
  return file;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pumpCallbacks(steam, times) {
  for (let i = 0; i < times; i++) {
    steam.runCallbacks();
    await sleep(50);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  writeAppIdFile(args.app);

  let steamworks;
  try {
    steamworks = require("steamworks.js");
  } catch (err) {
    console.error("Missing dependency. From this folder run:\n  npm install\n");
    console.error(err.message || err);
    process.exitCode = 1;
    return;
  }

  let client;
  try {
    client = steamworks.init(args.app);
  } catch (err) {
    console.error("Failed to init Steamworks for AppID " + args.app + ".");
    console.error("Make sure Steam is running, you are logged in, and you own this app.");
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
    return;
  }

  const name = client.localplayer.getName();
  const steamId = client.localplayer.getSteamId();
  console.log("Steam user:", name, "(" + steamId.steamId64.toString() + ")");
  console.log("AppID:", args.app);
  console.log("");

  const names = client.achievement.names();
  if (!names.length) {
    console.log("No achievements reported for this AppID (or stats not ready yet).");
    process.exitCode = 1;
    return;
  }

  const rows = names.map((apiName) => ({
    apiName,
    unlocked: client.achievement.isActivated(apiName),
  }));

  if (args.list) {
    let shown = rows;
    if (args.lockedOnly) shown = shown.filter((r) => !r.unlocked);
    if (args.unlockedOnly) shown = shown.filter((r) => r.unlocked);
    const unlockedCount = rows.filter((r) => r.unlocked).length;
    console.log("Achievements: " + unlockedCount + " / " + rows.length + " unlocked\n");
    for (const row of shown) {
      console.log((row.unlocked ? "[x]" : "[ ]") + "  " + row.apiName);
    }
    console.log("");
  }

  let changed = 0;

  function unlockOne(apiName) {
    if (!names.includes(apiName)) {
      console.error("Unknown achievement:", apiName);
      return false;
    }
    if (client.achievement.isActivated(apiName)) {
      console.log("Already unlocked:", apiName);
      return true;
    }
    const ok = client.achievement.activate(apiName);
    console.log((ok ? "Unlocked:" : "Failed:") + " " + apiName);
    if (ok) changed++;
    return ok;
  }

  function lockOne(apiName) {
    if (!names.includes(apiName)) {
      console.error("Unknown achievement:", apiName);
      return false;
    }
    if (!client.achievement.isActivated(apiName)) {
      console.log("Already locked:", apiName);
      return true;
    }
    const ok = client.achievement.clear(apiName);
    console.log((ok ? "Locked:" : "Failed:") + " " + apiName);
    if (ok) changed++;
    return ok;
  }

  for (const apiName of args.unlock) unlockOne(apiName);
  for (const apiName of args.lock) lockOne(apiName);

  if (args.unlockAll) {
    for (const row of rows) {
      if (!row.unlocked) unlockOne(row.apiName);
    }
  }

  if (args.lockAll) {
    for (const row of rows) {
      if (row.unlocked) lockOne(row.apiName);
    }
  }

  if (changed > 0) {
    const stored = client.stats.store();
    console.log("");
    console.log(stored ? "Stats stored to Steam." : "Warning: stats.store() returned false.");
    await pumpCallbacks(client, 20);
    console.log("Done. Check Steam → Achievements (may take a moment to sync).");
  } else if (!args.list) {
    console.log("No changes made.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
