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
const PARTY = "/Script/Maine.PartyComponent";
const FULL = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
const at = world.indexOf(PARTY);
let off = at + PARTY.length + 1;
const tag = world[off++];
const count = world.readUInt32LE(off);
off += 4;
console.log({ tag, count, off });

const entries = [];
for (let i = 0; i < count; i++) {
  const pathLen = world.readUInt32LE(off);
  if (pathLen !== FULL.length + 1) {
    console.log("bad pathLen at", i, off, pathLen);
    break;
  }
  const tableAt = off + 4;
  if (world.indexOf(FULL, tableAt) !== tableAt) {
    console.log("bad table at", i);
    break;
  }
  const nameOff = tableAt + FULL.length + 1;
  const nameLen = world.readInt32LE(nameOff);
  const name = world.toString("ascii", nameOff + 4, nameOff + 4 + nameLen - 1);
  const start = off;
  const end = nameOff + 4 + nameLen;
  entries.push({ name, start, end, size: end - start });
  off = end;
}
console.log("parsed", entries.length, "first", entries.slice(0, 3).map((e) => e.name));
console.log("recipes", entries.filter((e) => /^Recipe/i.test(e.name)).map((e) => e.name).slice(0, 30));
console.log("tech", entries.filter((e) => /TechChip|Tech_/i.test(e.name)).map((e) => e.name));
console.log("recipe count", entries.filter((e) => /^Recipe/i.test(e.name)).length);
console.log("next bytes", [...world.subarray(off, off + 32)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
console.log("next ascii", world.toString("latin1", off, off + 80).replace(/[^\x20-\x7E]/g, "."));

// Harvest Recipe* mentions elsewhere in world as candidates
const needle = Buffer.from("Recipe");
let i = 0;
const found = new Set();
while ((i = world.indexOf(needle, i)) >= 0) {
  // try FString ending at this
  for (let back = 4; back <= 8; back++) {
    const len = world.readInt32LE(i - back);
    if (len > 5 && len < 80 && i - back + 4 + len <= world.length) {
      const s = world.toString("ascii", i - back + 4, i - back + 4 + len - 1);
      if (/^Recipe[A-Za-z0-9_]+$/.test(s)) found.add(s);
    }
  }
  i++;
}
console.log("Recipe* FStrings in world", found.size, [...found].sort().slice(0, 40));
