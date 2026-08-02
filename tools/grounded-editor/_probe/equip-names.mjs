import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, "csav.js"), "utf8"));

const C = window.GroundedCsav;
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
const HAUL = "/Script/Maine.HaulingComponent";
const FULL = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
const eqAt = Buffer.from(host).indexOf(EQ);
const haulAt = Buffer.from(host).indexOf(HAUL);
const end = haulAt > eqAt ? haulAt : eqAt + 8000;

function readFString(buf, off) {
  const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
  if (len <= 1 || len > 120) return null;
  const raw = buf.subarray(off + 4, off + 4 + len - 1);
  let s = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < 32 || raw[i] > 126) return null;
    s += String.fromCharCode(raw[i]);
  }
  return { s, next: off + 4 + len };
}

let i = eqAt;
const names = [];
while (i < end) {
  const at = Buffer.from(host).indexOf(FULL, i);
  if (at < 0 || at >= end) break;
  const name = readFString(host, at + FULL.length + 1);
  if (name) names.push(name.s);
  i = at + 1;
}
console.log("all equipment-region item names:", names);
