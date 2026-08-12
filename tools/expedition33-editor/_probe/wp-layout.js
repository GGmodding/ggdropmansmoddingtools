"use strict";
const fs = require("fs");
const buf = fs.readFileSync(
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
);
function readFString(o) {
  const len = buf.readInt32LE(o);
  if (len <= 0 || o + 4 + len > buf.length) return [null, o];
  let s = buf.slice(o + 4, o + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return [s, o + 4 + len];
}
function findNamed(name) {
  const enc = Buffer.from(name + "\0");
  for (let i = 4; i < buf.length - enc.length; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const [t, after] = readFString(i + enc.length);
    return { i, t, after };
  }
  return null;
}
const wp = findNamed("WeaponProgressions");
console.log(wp);
console.log(buf.slice(wp.i - 4, wp.i + 200).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
console.log(buf.slice(wp.after, wp.after + 80).toString("hex"));

const DEF = "DefinitionID_3_60EB24664894755B19F4EBA18A21AF1A";
const denc = Buffer.from(DEF + "\0");
const defs = [];
for (let i = 4; i < buf.length - denc.length; i++) {
  if (buf.compare(denc, 0, denc.length, i, i + denc.length) !== 0) continue;
  if (buf.readUInt32LE(i - 4) !== denc.length) continue;
  defs.push(i - 4);
}
console.log("def count", defs.length, "first few", defs.slice(0, 5));
for (let n = 0; n < Math.min(3, defs.length); n++) {
  const a = defs[n];
  const b = n + 1 < defs.length ? defs[n + 1] : a + 200;
  const slice = buf.slice(a, b);
  console.log("\nentry", n, "size", b - a);
  console.log(slice.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  console.log(slice.toString("hex"));
}
