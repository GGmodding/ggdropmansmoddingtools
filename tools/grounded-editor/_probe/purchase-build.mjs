import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}
const world = unwrap(
  fs.readFileSync(
    path.join(
      process.env.USERPROFILE,
      "Saved Games",
      "Grounded",
      "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)",
      "World.csav"
    )
  )
);

const TECH = "/Game/Blueprints/Items/Table_TechTrees.Table_TechTrees";
let t = world.indexOf(TECH);
let last = t;
while ((t = world.indexOf(TECH, t)) >= 0 && t < world.indexOf(TECH) + 8000) {
  const nameLen = world.readInt32LE(t + TECH.length + 1);
  last = t + TECH.length + 1 + 4 + nameLen;
  t++;
}
const count = world.readUInt32LE(last);
const unk = world.readUInt32LE(last + 4);
console.log({ count, unk, last });
let p = last + 8;
const purchases = [];
for (let i = 0; i < count; i++) {
  const len = world.readInt32LE(p);
  const name = world.toString("ascii", p + 4, p + 4 + len - 1);
  const a = world.readUInt32LE(p + 4 + len);
  const b = world.readUInt32LE(p + 4 + len + 4);
  purchases.push({ name, a, b });
  if (i < 5 || i > count - 3) console.log(i, name, a, b);
  p += 4 + len + 8;
}
console.log("parsed purchases", purchases.length, "end", p);

// buildings from LeanTo header
const leanNameOff = world.indexOf("LeanTo") - 4;
const bCount = world.readUInt32LE(leanNameOff - 8);
const bUnk = world.readUInt32LE(leanNameOff - 4);
console.log("building hdr", { bCount, bUnk, leanNameOff });
let q = leanNameOff;
const builds = [];
for (let i = 0; i < bCount; i++) {
  const len = world.readInt32LE(q);
  if (len < 2 || len > 80) {
    console.log("fail at", i, q, len);
    break;
  }
  const name = world.toString("ascii", q + 4, q + 4 + len - 1);
  // try trailer 12
  const hex = [...world.subarray(q + 4 + len, q + 4 + len + 12)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  if (i < 3) console.log("b", i, name, hex);
  builds.push(name);
  q += 4 + len + 12;
}
console.log("buildings parsed", builds.length, "last", builds.slice(-3));
