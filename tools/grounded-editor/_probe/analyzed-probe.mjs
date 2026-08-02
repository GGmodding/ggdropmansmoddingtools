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
let off = at + PARTY.length + 1 + 1 + 4; // tag+count
for (let i = 0; i < 328; i++) {
  const pathLen = world.readUInt32LE(off);
  const nameOff = off + 4 + pathLen;
  const nameLen = world.readInt32LE(nameOff);
  off = nameOff + 4 + nameLen;
}

const count2 = world.readUInt32LE(off);
const unk2 = world.readUInt32LE(off + 4);
console.log("list2 header", { count2, unk2, off });

// try parse as FString + 3xu32 or FString + u8 + stuff
let o = off + 8;
const entries = [];
for (let i = 0; i < Math.min(count2, 5); i++) {
  const len = world.readInt32LE(o);
  const name = world.toString("ascii", o + 4, o + 4 + len - 1);
  const hex = [...world.subarray(o + 4 + len, o + 4 + len + 20)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  console.log(i, name, "len", len, "hex", hex);
  // guess stride: name + 4+4+4 = 12? or 16?
  // SpikySprig: after name 00 00 00 00 00 03 00 00 00 01 ...
  entries.push(name);
}

// Try: FString, u32 a, u32 b, u32 c  (12 bytes) — SpikySprig showed 00 00 00 00 | 03 00 00 00 | 01 ...
function tryParse(trailer) {
  let p = off + 8;
  const out = [];
  for (let i = 0; i < count2; i++) {
    const len = world.readInt32LE(p);
    if (len < 2 || len > 80 || p + 4 + len + trailer > world.length) return null;
    const raw = world.subarray(p + 4, p + 4 + len - 1);
    if (![...raw].every((c) => (c >= 32 && c < 127) || c === 0)) return null;
    const name = raw.toString("ascii").replace(/\0/g, "");
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return null;
    out.push(name);
    p += 4 + len + trailer;
  }
  return { out, end: p };
}

for (const t of [8, 12, 16, 4, 9, 13]) {
  const r = tryParse(t);
  console.log("trailer", t, r ? "OK " + r.out.length + " end@" + r.end + " next " + world.toString("latin1", r.end, r.end + 40).replace(/[^\x20-\x7E]/g, ".") : "fail");
}
