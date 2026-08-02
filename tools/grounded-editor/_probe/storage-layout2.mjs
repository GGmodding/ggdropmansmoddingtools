import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
const window = {};
globalThis.window = window;
vm.runInThisContext(fs.readFileSync(path.join(root, "csav.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "inventory.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "storage.js"), "utf8"));

const C = window.GroundedCsav;
const Stor = window.GroundedStorage;
const Inv = window.GroundedInventory;

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

const listed = Stor.listStorages(worldRaw);
const target = listed.storages.find((s) => s.label === "Legit gear") || listed.storages.find((s) => s.itemCount > 20);
console.log("target", target.label, "invAt", target.invAt, "end", target.end, "count", target.count, "items", target.itemCount);

const INV = "/Script/Maine.InventoryComponent";
const dataAt = target.invAt + INV.length + 1;
console.log("hdr bytes", [...worldRaw.subarray(dataAt, dataAt + 24)].map((b) => b.toString(16).padStart(2, "0")).join(" "));

// Parse only first N items with Inv.parseItemRecord
const FULL = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
function indexOf(buf, ascii, from) {
  const enc = Buffer.from(ascii);
  return buf.indexOf(enc, from || 0);
}

const limit = target.count > 0 ? target.count : 999;
const items = [];
let i = target.invAt;
while (items.length < limit) {
  const at = indexOf(worldRaw, FULL, i);
  if (at < 0 || at >= target.end) break;
  const rec = Inv.parseItemRecord(worldRaw, at - 4, target.end);
  if (rec) {
    items.push(rec);
    i = rec.end;
  } else {
    i = at + 1;
  }
}
console.log("limited parse", items.length, "first5", items.slice(0, 5).map((x) => x.name + ":" + x.stack + "@" + x.stackOff));
console.log("last5", items.slice(-5).map((x) => x.name + ":" + x.stack));

// Check uniqueness of names in overscan
const names = target.items.map((x) => x.name);
const uniq = new Set(names);
console.log("overscan unique", uniq.size, "total", names.length, "dup ratio", (names.length / uniq.size).toFixed(2));

// Show building string near inv
const win = Buffer.from(worldRaw.subarray(Math.max(0, target.invAt - 600), target.invAt)).toString("latin1");
console.log("Storage paths", [...win.matchAll(/[^\0]{0,80}Storage[^\0]{0,40}/g)].slice(-3).map((m) => m[0].replace(/[^\x20-\x7E]/g, ".")));
console.log("Legit?", /Legit/.test(win), win.includes("Legit"));
const leg = worldRaw.indexOf(Buffer.from("Legit"));
console.log("Legit index", leg);
if (leg >= 0) {
  console.log("around Legit", Buffer.from(worldRaw.subarray(leg - 4, leg + 20)).toString("hex"));
  console.log("ascii", Buffer.from(worldRaw.subarray(leg - 4, leg + 20)).toString("latin1"));
}
