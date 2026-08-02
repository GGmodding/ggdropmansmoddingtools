import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
const window = {};
globalThis.window = window;
for (const f of ["csav.js", "inventory.js", "storage.js"]) {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  vm.runInThisContext(code, { filename: f });
}

const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)"
);
const C = window.GroundedCsav;
const Stor = window.GroundedStorage;

const worldCsav = fs.readFileSync(path.join(slot, "World.csav"));
const worldRaw = await C.decompressCsav(worldCsav, oozDecompress);
console.log("world raw", worldRaw.length);

const listed = Stor.listStorages(worldRaw);
console.log("storages", listed.storages.length);
for (const st of listed.storages.slice(0, 15)) {
  console.log(
    `#${st.index}`,
    st.label,
    st.building || "-",
    "items",
    st.itemCount,
    "countHdr",
    st.editableCount ? st.count : "n/a",
    "sample",
    st.items.slice(0, 3).map((x) => x.name + "x" + x.stack).join(",")
  );
}

const withItems = listed.storages.find((s) => s.itemCount >= 2 && s.items.some((x) => x.stackOff >= 0));
if (!withItems) {
  console.log("NO non-empty storage");
  console.log(listed.storages.map((s) => s.label + ":" + s.itemCount).join(" | "));
  process.exit(1);
}
console.log("\nTesting edit on", withItems.label, "idx", withItems.index);

const before = withItems.items[0];
const stacked = Stor.setStorageStack(worldRaw, withItems.index, 0, before.stack + 7);
const afterStack = Stor.getStorage(stacked.bytes, withItems.index).items[0];
console.log("stack", before.stack, "->", afterStack.stack);

const added = Stor.addStorageItem(stacked.bytes, withItems.index, "Fiber", 3);
const afterAdd = Stor.getStorage(added.bytes, withItems.index);
const fiber = afterAdd.items.find((x) => x.name === "Fiber");
console.log("add Fiber", !!fiber, fiber && fiber.stack, "count", afterAdd.itemCount);

const fiberIdx = afterAdd.items.findIndex((x) => x.name === "Fiber");
const removed = Stor.removeStorageItem(added.bytes, withItems.index, fiberIdx);
const afterRm = Stor.getStorage(removed.bytes, withItems.index);
console.log(
  "remove Fiber gone",
  !afterRm.items.some((x) => x.name === "Fiber"),
  "count",
  afterRm.itemCount
);

console.log("STORAGE SMOKE OK");
