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
  off = nameOff + 4 + world.readInt32LE(nameOff);
}
const count2 = world.readUInt32LE(off);
let p = off + 8;
for (let i = 0; i < count2; i++) {
  const len = world.readInt32LE(p);
  p += 4 + len + 12;
}
console.log("list3 head", [...world.subarray(p, p + 16)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
const c3 = world.readUInt32LE(p);
const u3 = world.readUInt32LE(p + 4);
console.log({ c3, u3 });
let q = p + 8;
const builds = [];
for (let i = 0; i < c3; i++) {
  const len = world.readInt32LE(q);
  const name = world.toString("ascii", q + 4, q + 4 + len - 1);
  // try trailers
  builds.push(name);
  // check what follows
  if (i < 3) {
    console.log(i, name, "hex", [...world.subarray(q + 4 + len, q + 4 + len + 16)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
  }
  // guess trailer 0 for pure FString list?
  q += 4 + len;
}
console.log("if FString-only parsed", builds.length, builds.slice(0, 15));
console.log("next", world.toString("latin1", q, q + 80).replace(/[^\x20-\x7E]/g, "."));
