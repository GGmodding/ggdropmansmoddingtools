import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}

const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)"
);
const world = unwrap(fs.readFileSync(path.join(slot, "World.csav")));
const host = unwrap(fs.readFileSync(path.join(slot, "HostPlayer.csav")));

const TECH = "/Game/Blueprints/Items/Table_TechTrees.Table_TechTrees";
const techAt = world.indexOf(TECH);
console.log("first tech tree at", techAt);

// Find end of tech trees - last Table_TechTrees then purchases
let last = techAt;
let t = techAt;
const trees = [];
while ((t = world.indexOf(TECH, t)) >= 0 && t < techAt + 5000) {
  const nameLen = world.readInt32LE(t + TECH.length + 1);
  const name = world.toString("ascii", t + TECH.length + 5, t + TECH.length + 5 + nameLen - 1);
  trees.push(name);
  last = t + TECH.length + 1 + 4 + nameLen;
  t++;
}
console.log("trees", trees);
console.log("after trees hex", [...world.subarray(last, last + 32)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
console.log("after trees ascii", world.toString("latin1", last, last + 200).replace(/[^\x20-\x7E]/g, "."));

// Parse purchases: earlier saw FString + u32 cost-ish + u32 2
let p = last;
// skip until we see a plausible count or first purchase name
const purchaseStart = world.indexOf("MultiStoryBuildings", last - 50);
console.log("MultiStory at", purchaseStart);
if (purchaseStart > 0) {
  // walk back to find list header
  console.log("pre32", [...world.subarray(purchaseStart - 20, purchaseStart)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
}

// Building list: find LeanTo after analyzed
const lean = world.indexOf("LeanTo");
console.log("LeanTo", lean, "pre", [...world.subarray(lean - 16, lean)].map((b) => b.toString(16).padStart(2, "0")).join(" "));

// Achievements
const ACH = "/Script/Maine.AchievementsComponent";
const aAt = host.indexOf(ACH);
console.log("\nachievements ascii", host.toString("latin1", aAt, aAt + 500).replace(/[^\x20-\x7E]/g, "."));

// Mutation loadout search near PerkComponent end
const PERK = "/Script/Maine.PerkComponent";
const perkEnd = host.indexOf(ACH);
console.log("between perk and ach", perkEnd - (host.indexOf(PERK) + 40));
console.log(host.toString("latin1", host.indexOf(PERK) + 1200, perkEnd).replace(/[^\x20-\x7E]/g, ".").slice(0, 300));

// Coziness / pet
for (const s of ["Coziness", "PetHome", "PetComponent", "Hatchery", "Buddy", "Tame"]) {
  const i = world.indexOf(s);
  const j = host.indexOf(s);
  if (i >= 0) console.log("w", s, i, world.toString("latin1", i, i + 60).replace(/[^\x20-\x7E]/g, "."));
  if (j >= 0) console.log("h", s, j, host.toString("latin1", j, j + 60).replace(/[^\x20-\x7E]/g, "."));
}
