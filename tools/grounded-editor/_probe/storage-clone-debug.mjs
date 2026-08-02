import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
globalThis.window = {};
for (const f of ["csav.js", "inventory.js", "storage.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}
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

const st0 = Stor.listStorages(worldRaw).storages.find((s) => s.label === "Modded gear");
const tmpl = st0.items[st0.items.length - 1];
console.log("tmpl", {
  name: tmpl.name,
  size: tmpl.size,
  stack: tmpl.stack,
  stackOff: tmpl.stackOff,
  nameLen: tmpl.nameLen,
  start: tmpl.start,
  end: tmpl.end,
});

// Prefer a simple template like inventory does
const simple = st0.items
  .filter((x) => x.size >= 130 && x.size <= 200 && x.mid === "None" && x.stackOff >= 0)
  .sort((a, b) => a.size - b.size);
console.log(
  "simple templates",
  simple.slice(0, 5).map((x) => x.name + " sz" + x.size + " st" + x.stack)
);

// Manual clone using simple template
const buf = new Uint8Array(worldRaw);
const t = simple[0] || tmpl;
const insertAt = st0.items[st0.items.length - 1].end; // still insert at end
const slice = buf.slice(t.start, t.end);
let out = new Uint8Array(buf.length + slice.length);
out.set(buf.subarray(0, insertAt), 0);
out.set(slice, insertAt);
out.set(buf.subarray(insertAt), insertAt + slice.length);
C.writeU32(out, st0.countOff, st0.count + 1);

const rec = Inv.parseItemRecord(out, insertAt, insertAt + slice.length + 50);
console.log("cloned rec at insertAt", rec && {
  name: rec.name,
  stack: rec.stack,
  stackOff: rec.stackOff,
  size: rec.size,
  nameOff: rec.nameOff,
});

// rename to Fiber manually like inventory.replace
function encodeFString(str) {
  const s = String(str);
  const u = new Uint8Array(4 + s.length + 1);
  C.writeU32(u, 0, s.length + 1);
  for (let i = 0; i < s.length; i++) u[4 + i] = s.charCodeAt(i);
  return u;
}
const enc = encodeFString("Fiber");
const oldBytes = 4 + rec.nameLen;
const delta = enc.length - oldBytes;
const grown = new Uint8Array(out.length + delta);
grown.set(out.subarray(0, rec.nameOff), 0);
grown.set(enc, rec.nameOff);
grown.set(out.subarray(rec.nameOff + oldBytes), rec.nameOff + enc.length);
out = grown;

const rec2 = Inv.parseItemRecord(out, insertAt, insertAt + slice.length + delta + 50);
console.log("after rename", rec2 && {
  name: rec2.name,
  stack: rec2.stack,
  stackOff: rec2.stackOff,
  size: rec2.size,
  enhancement: rec2.enhancement,
  mid: rec2.mid,
});
if (rec2 && rec2.stackOff >= 0) {
  new DataView(out.buffer, out.byteOffset + rec2.stackOff, 4).setInt32(0, 99, true);
  const rec3 = Inv.parseItemRecord(out, insertAt, insertAt + slice.length + delta + 50);
  console.log("after stack set", rec3.stack);
}
