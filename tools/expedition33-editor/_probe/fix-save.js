"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";
const src = fs.readFileSync(path.join(__dirname, "../gvas.js"), "utf8");
const sandbox = { console, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const G = sandbox.E33Gvas;

const brokenPath = fs
  .readdirSync(DIR)
  .filter((n) => n.startsWith("EXPEDITION_0.sav.broken_"))
  .sort()
  .pop();
const broken = new Uint8Array(fs.readFileSync(path.join(DIR, brokenPath)));
let bytes = new Uint8Array(fs.readFileSync(path.join(DIR, "EXPEDITION_0.sav")));

const pb = G.parseSave(broken);
const pr = G.parseSave(bytes);
console.log("restored before port", {
  size: bytes.length,
  gold: pr.gold,
  inv: pr.inventory.length,
  weapons: pr.weapons.map((w) => w.name + "=" + w.level),
  pictos: pr.pictos.length,
  chars: pr.characters.map((c) => c.name + "L" + c.level),
});
console.log("broken had", {
  gold: pb.gold,
  invExtra: pb.inventory.map((i) => i.key).filter((k) => !pr.inventory.some((x) => x.key === k)),
  weapons: pb.weapons.map((w) => w.name + "=" + w.level),
});

// Port gold
if (pb.gold != null && pb.gold !== pr.gold) {
  bytes = G.writeIntProperty(bytes, "Gold", pb.gold).bytes;
  console.log("ported gold", pb.gold);
}

// Port music records / collectibles that were only in broken
const portKeys = ["MusicRecord_1", "MusicRecord_3", "MusicRecord_4", "MusicRecord_5"];
for (const key of portKeys) {
  const it = pb.inventory.find((x) => x.key === key);
  if (!it) continue;
  if (G.findInventoryItem(bytes, key)) {
    bytes = G.writeInventoryItem(bytes, key, Math.max(1, it.value)).bytes;
  } else {
    bytes = G.ensureInventoryItem(bytes, key, Math.max(1, it.value)).bytes;
  }
  console.log("ported", key);
}

// Port resource stacks if higher in broken (safe in-place / ensure)
const resourceKeys = [
  "Consumable_Respec",
  "Consumable_LuminaPoint",
  "HealingTint_Shard",
  "EnergyTint_Shard",
  "ReviveTint_Shard",
  "PartyHealShard",
  "UpgradeMaterial_Level1",
  "UpgradeMaterial_Level2",
  "UpgradeMaterial_Level3",
  "UpgradeMaterial_Level4",
  "UpgradeMaterial_Level5",
];
for (const key of resourceKeys) {
  const bIt = pb.inventory.find((x) => x.key === key);
  if (!bIt) continue;
  const rIt = G.findInventoryItem(bytes, key);
  if (!rIt) {
    bytes = G.ensureInventoryItem(bytes, key, bIt.value).bytes;
    console.log("inserted resource", key, bIt.value);
  } else if (bIt.value > rIt.value) {
    bytes = G.writeInventoryItem(bytes, key, bIt.value).bytes;
    console.log("bumped resource", key, rIt.value, "->", bIt.value);
  }
}

// Do NOT port weapon levels 33 — leave game backup levels (safer for load).
// Do NOT port unlock-all pictos.

const out = G.parseSave(bytes);
console.log("restored after port", {
  size: bytes.length,
  gold: out.gold,
  inv: out.inventory.length,
  ok: out.ok,
  chars: out.characters.map((c) => c.name + "L" + c.level),
  hasTransient: Buffer.from(bytes).includes(Buffer.from("TransientBattledEnemies")),
});

fs.writeFileSync(path.join(DIR, "EXPEDITION_0.sav"), Buffer.from(bytes));
console.log("wrote fixed EXPEDITION_0.sav");
