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
const st = listed.storages.find((s) => s.label === "Modded gear") || listed.storages.find((s) => s.itemCount >= 10 && s.editableCount);
console.log("using", st.label, "items", st.itemCount, "count", st.count);
console.log("has Fiber?", st.items.some((x) => x.name === "Fiber"));

const r = Stor.addStorageItem(worldRaw, st.index, "Fiber", 99);
console.log("result", { mode: r.mode, stack: r.stack, count: r.count, added: r.added });
const after = Stor.getStorage(r.bytes, st.index);
const fibers = after.items.filter((x) => x.name === "Fiber");
console.log(
  "fibers",
  fibers.map((x) => ({ stack: x.stack, stackOff: x.stackOff, start: x.start }))
);
console.log("itemCount", after.itemCount, "hdr", after.count);
