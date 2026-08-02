import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
const window = {};
globalThis.window = window;
for (const f of [
  "csav.js",
  "player.js",
  "gear.js",
  "inventory.js",
  "storage.js",
  "perks.js",
  "tech.js",
  "progress.js",
  "presets.js",
]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), {
    filename: f,
  });
}

const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)"
);

const C = window.GroundedCsav;
const G = window.GroundedGear;
const Progress = window.GroundedProgress;
const Presets = window.GroundedPresets;

let host = await C.decompressCsav(
  fs.readFileSync(path.join(slot, "HostPlayer.csav")),
  oozDecompress
);
let world = await C.decompressCsav(
  fs.readFileSync(path.join(slot, "World.csav")),
  oozDecompress
);

const purchases0 = Progress.parsePurchases(world);
const buildings0 = Progress.parseBuildings(world);
const ach0 = Progress.parseAchievements(host);
console.log("parse purchases", purchases0.ok, purchases0.entries?.length);
console.log("parse buildings", buildings0.ok, buildings0.entries?.length);
console.log("parse achievements", ach0.ok, ach0.entries?.length);

const sleek = G.applySleekArmor(host);
console.log("sleek", sleek.changed, "level", sleek.level);
host = sleek.bytes;

const oneshotNg = G.applyOneShotWeapons(host, { ngPlus: true });
console.log("oneshot ng+", oneshotNg.changed, "level", oneshotNg.level);
host = oneshotNg.bytes;

const pur = Progress.unlockPurchaseCatalog(world);
console.log("unlock purchases +", pur.added, "skip", pur.skipped);
world = pur.bytes;

const bld = Progress.unlockAllBuildingsFromSave(world);
console.log("unlock buildings +", bld.added, "owned", bld.owned);
world = bld.bytes;

const know = Progress.unlockAllKnowledgeCategories(world);
console.log("knowledge", know.summary);
world = know.bytes;

const ach = Progress.completeAllAchievements(host);
console.log("achievements fields changed", ach.changed, "of", ach.total);
host = ach.bytes;

const op = Presets.applyOpPreset(
  await C.decompressCsav(
    fs.readFileSync(path.join(slot, "HostPlayer.csav")),
    oozDecompress
  ),
  await C.decompressCsav(
    fs.readFileSync(path.join(slot, "World.csav")),
    oozDecompress
  ),
  { ngPlus: false }
);
console.log("OP log:", op.log.join(" | "));

const purchases1 = Progress.parsePurchases(op.worldBytes);
const buildings1 = Progress.parseBuildings(op.worldBytes);
const ach1 = Progress.parseAchievements(op.hostBytes);
console.log(
  "after OP purchases",
  purchases1.entries.length,
  "buildings",
  buildings1.entries.length,
  "ach",
  ach1.entries.length
);

const packedH = C.compressCsav(op.hostBytes);
const packedW = C.compressCsav(op.worldBytes);
const backH = await C.decompressCsav(packedH, oozDecompress);
const backW = await C.decompressCsav(packedW, oozDecompress);
console.log(
  "roundtrip host",
  backH.length === op.hostBytes.length &&
    Buffer.compare(Buffer.from(backH), Buffer.from(op.hostBytes)) === 0
);
console.log(
  "roundtrip world",
  backW.length === op.worldBytes.length &&
    Buffer.compare(Buffer.from(backW), Buffer.from(op.worldBytes)) === 0
);

console.log("FEAT SMOKE OK");
