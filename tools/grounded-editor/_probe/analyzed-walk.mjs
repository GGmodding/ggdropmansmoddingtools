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
const at = world.indexOf(PARTY);
let off = at + PARTY.length + 1 + 1 + 4;
for (let i = 0; i < 328; i++) {
  const pathLen = world.readUInt32LE(off);
  const nameOff = off + 4 + pathLen;
  const nameLen = world.readInt32LE(nameOff);
  off = nameOff + 4 + nameLen;
}

const count2 = world.readUInt32LE(off);
let p = off + 8;
const names = [];
for (let i = 0; i < count2; i++) {
  const len = world.readInt32LE(p);
  if (len < 2 || len > 80) {
    console.log("fail len", i, p, len);
    break;
  }
  const raw = world.subarray(p + 4, p + 4 + len - 1);
  const name = raw.toString("ascii");
  const a = world.readUInt32LE(p + 4 + len);
  const b = world.readUInt32LE(p + 4 + len + 4);
  const c = world.readUInt32LE(p + 4 + len + 8);
  if (![...raw].every((ch) => ch >= 32 && ch < 127)) {
    console.log("fail ascii", i, p, [...raw]);
    break;
  }
  names.push({ name, a, b, c });
  p += 4 + len + 12;
}
console.log("parsed", names.length, "/", count2);
console.log("first10", names.slice(0, 10));
console.log("last5", names.slice(-5));
console.log("next", world.toString("latin1", p, p + 60).replace(/[^\x20-\x7E]/g, "."));
console.log("unique", new Set(names.map((n) => n.name)).size);

// a,b,c patterns
const abcs = names.reduce((m, n) => {
  const k = n.a + "," + n.b + "," + n.c;
  m[k] = (m[k] || 0) + 1;
  return m;
}, {});
console.log("abc patterns", abcs);
