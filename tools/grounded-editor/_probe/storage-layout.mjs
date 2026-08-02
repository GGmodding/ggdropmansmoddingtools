import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
const window = {};
globalThis.window = window;
for (const f of ["csav.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}
const C = window.GroundedCsav;
const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)"
);
const worldRaw = await C.decompressCsav(
  fs.readFileSync(path.join(slot, "World.csav")),
  oozDecompress
);

function indexOf(buf, ascii, from) {
  const enc = Buffer.from(ascii);
  return buf.indexOf(enc, from || 0);
}

const INV = "/Script/Maine.InventoryComponent";
const hits = [];
let i = 0;
while (true) {
  const at = indexOf(worldRaw, INV, i);
  if (at < 0) break;
  hits.push(at);
  i = at + 1;
}

function dumpAround(label, at, before = 200, after = 80) {
  const start = Math.max(0, at - before);
  const slice = worldRaw.subarray(start, at + after);
  const ascii = Buffer.from(slice)
    .toString("latin1")
    .replace(/[^\x20-\x7E]/g, ".");
  console.log("\n===", label, "at", at, "===");
  console.log("hex after path:", [...worldRaw.subarray(at + INV.length + 1, at + INV.length + 1 + 32)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" "));
  // find nearby BP_
  const win = Buffer.from(worldRaw.subarray(Math.max(0, at - 800), at)).toString("latin1");
  const bps = [...win.matchAll(/BP_[A-Za-z0-9_]+/g)].map((m) => m[0]);
  console.log("nearby BP_", [...new Set(bps)].slice(-8));
  const names = [...win.matchAll(/[\x20-\x7E]{3,40}/g)].map((m) => m[0]).filter((s) => / /.test(s) || /LAB|gear/i.test(s));
  console.log("nearby strings", names.slice(-6));
}

// Legit gear ~ Storage_Tier3 with 90 items — find by custom name
const legitAt = indexOf(worldRaw, "Legit gear");
console.log("Legit gear string at", legitAt);
const invNear = hits.find((h) => h > legitAt && h < legitAt + 2000);
dumpAround("Legit gear inv", invNear);

const fridge = hits.find((h) => {
  const win = Buffer.from(worldRaw.subarray(Math.max(0, h - 500), h)).toString("latin1");
  return /StorageFridge/.test(win);
});
dumpAround("Fridge", fridge);

// Storage with count 42
for (const h of hits) {
  const dataAt = h + INV.length + 1;
  let countOff = dataAt;
  let count = C.readU32(worldRaw, countOff);
  if ((count > 500 || count === 0) && worldRaw[dataAt] === 0) {
    countOff = dataAt + 1;
    count = C.readU32(worldRaw, countOff);
  }
  if (count === 42) {
    dumpAround("count42", h, 300, 40);
    break;
  }
}

// How many Table_AllItems between Legit inv and next inv?
const next = hits[hits.indexOf(invNear) + 1];
let tables = 0;
let p = invNear;
while (true) {
  const t = indexOf(worldRaw, "/Game/Blueprints/Items/Table_AllItems.Table_AllItems", p);
  if (t < 0 || t >= next) break;
  tables++;
  p = t + 1;
}
console.log("\nLegit gear -> next inv distance", next - invNear, "Table_AllItems", tables);
