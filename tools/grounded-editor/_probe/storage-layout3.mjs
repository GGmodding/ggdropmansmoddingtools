import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, "csav.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "inventory.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(root, "storage.js"), "utf8"));

const C = window.GroundedCsav;
const Stor = window.GroundedStorage;
const Inv = window.GroundedInventory;
const FULL = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";

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
  return Buffer.from(buf).indexOf(ascii, from || 0);
}

const listed = Stor.listStorages(worldRaw);
for (const st of listed.storages.filter((s) => s.itemCount > 0).slice(0, 8)) {
  let ok = 0,
    bad = 0;
  const names = [];
  let i = st.invAt;
  while (ok + bad < 200) {
    const at = indexOf(worldRaw, FULL, i);
    if (at < 0 || at >= st.end) break;
    const rec = Inv.parseItemRecord(worldRaw, at - 4, st.end);
    if (rec) {
      ok++;
      names.push(rec.name + "x" + rec.stack);
      i = rec.end;
    } else {
      bad++;
      i = at + 1;
    }
  }
  console.log(
    `#${st.index}`,
    st.label,
    "hdr",
    st.count,
    "scanOk",
    ok,
    "scanBad",
    bad,
    "okSample",
    names.slice(0, 4).join(", ")
  );
}

// Hex dump first Table_AllItems after Legit gear inv
const legit = listed.storages.find((s) => s.label === "Legit gear");
let at = indexOf(worldRaw, FULL, legit.invAt);
console.log("\nFirst table after legit at", at, "delta", at - legit.invAt);
console.log(
  "bytes around name:",
  [...worldRaw.subarray(at + FULL.length, at + FULL.length + 80)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
);
console.log(
  "ascii",
  Buffer.from(worldRaw.subarray(at + FULL.length, at + FULL.length + 80))
    .toString("latin1")
    .replace(/[^\x20-\x7E]/g, ".")
);

// Why parse fails - step through
const pathLenOff = at - 4;
const pathLen = C.readU32(worldRaw, pathLenOff);
console.log("pathLen", pathLen, "expected", FULL.length + 1);
const nameOff = at + FULL.length + 1;
const nameLen = C.readU32(worldRaw, nameOff);
console.log("nameLen", nameLen, "name", Buffer.from(worldRaw.subarray(nameOff + 4, nameOff + 4 + Math.min(40, Math.max(0, nameLen - 1)))).toString("latin1"));
let off = nameOff + 4 + nameLen;
console.log("head8", [...worldRaw.subarray(off, off + 8)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
off += 8;
const enhLen = C.readU32(worldRaw, off);
console.log("enhLen", enhLen, "as i32", new DataView(worldRaw.buffer, worldRaw.byteOffset + off, 4).getInt32(0, true));
console.log("next40", Buffer.from(worldRaw.subarray(off, off + 40)).toString("latin1").replace(/[^\x20-\x7E]/g, "."));
