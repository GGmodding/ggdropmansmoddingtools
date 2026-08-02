import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, "csav.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "gear.js"), "utf8"));

const C = window.GroundedCsav;
const G = window.GroundedGear;

const slotDir = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)"
);
const host = await C.decompressCsav(
  fs.readFileSync(path.join(slotDir, "HostPlayer.csav")),
  oozDecompress
);

const EQ = "/Script/Maine.EquipmentComponent";
const FULL = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
const eqAt = Buffer.from(host).indexOf(EQ);
console.log("eqAt", eqAt);
console.log(
  "hdr",
  [...host.subarray(eqAt + EQ.length + 1, eqAt + EQ.length + 1 + 48)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
);

const gear = G.parseGear(host);
const eqItems = gear.items.filter((x) => x.region === "equipment");
console.log(
  "equipment items",
  eqItems.map((x) => ({
    name: x.name,
    kind: x.kind,
    level: x.level,
    enh: x.enhancement,
    mid: x.mid,
  }))
);

// Dump slot ints near each equipment item
for (const it of eqItems) {
  const around = host.subarray(it.tableAt - 32, it.tableAt);
  const ints = [];
  for (let o = 0; o + 4 <= around.length; o += 4) {
    ints.push(C.readU32(around, o));
  }
  console.log(it.name, "pre32 u32", ints, "ascii", Buffer.from(around).toString("latin1").replace(/[^\x20-\x7E]/g, "."));
}

// Look for slot name strings near EquipmentComponent
const win = Buffer.from(host.subarray(eqAt, Math.min(host.length, eqAt + 6000))).toString("latin1");
const slotish = [...win.matchAll(/EEquipmentSlot|Slot_|Head|Chest|Legs|MainHand|OffHand|Trinket|Face|Arms/g)];
console.log("slotish", [...new Set(slotish.map((m) => m[0]))]);
