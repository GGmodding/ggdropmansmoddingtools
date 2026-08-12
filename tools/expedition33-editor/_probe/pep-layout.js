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

// Find PassiveEffectsProgressions ArrayProperty and parse header
const name = "PassiveEffectsProgressions";
const enc = Buffer.from(name + "\0");
let nameAt = -1;
for (let i = 4; i < buf.length - enc.length; i++) {
  if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
  if (buf.readUInt32LE(i - 4) !== enc.length) continue;
  nameAt = i;
  break;
}
console.log("nameAt", nameAt);
let o = nameAt + enc.length;
const [type, afterType] = readFString(o);
console.log("type", type, "afterType", afterType);
// dump 80 bytes after type
console.log(buf.slice(afterType, afterType + 100).toString("hex"));
console.log(buf.slice(afterType, afterType + 100).toString("latin1").replace(/[^\x20-\x7e]/g, "."));

// Manual parse UE ArrayProperty of Struct:
// after type: ArrayIndex(4) Size(4) Tag(1) InnerType(FString) then struct header then count?
o = afterType;
const arrayIndex = buf.readUInt32LE(o); o += 4;
const arraySize = buf.readUInt32LE(o); o += 4;
const tag = buf[o]; o += 1;
console.log({ arrayIndex, arraySize, tag, o });
const [innerType, afterInner] = readFString(o);
console.log("innerType", innerType, afterInner);
o = afterInner;
// For StructProperty arrays: count, then struct name, then guid?, then elements
const count = buf.readUInt32LE(o);
console.log("count?", count, "@", o);
o += 4;
const [structName, afterSN] = readFString(o);
console.log("structName", structName, afterSN);
o = afterSN;
const structIndex = buf.readUInt32LE(o); o += 4;
const structSize = buf.readUInt32LE(o); o += 4;
console.log({ structIndex, structSize });
const [structPath, afterPath] = readFString(o);
console.log("structPath", structPath);
o = afterPath;
console.log("next 20", buf.slice(o, o + 20).toString("hex"));

// Find first entry start (PassiveEffectName)
const PASSIVE_NAME = "PassiveEffectName_3_A92DB6CC4549450728A867A714ADF6C5";
const nenc = Buffer.from(PASSIVE_NAME + "\0");
const entries = [];
for (let i = nameAt; i < Math.min(buf.length, nameAt + 50000); i++) {
  if (buf.compare(nenc, 0, nenc.length, i, i + nenc.length) !== 0) continue;
  if (buf.readUInt32LE(i - 4) !== nenc.length) continue;
  entries.push(i - 4);
  if (entries.length >= 5) break;
}
console.log("entry starts", entries);

// Measure entry0 size = entry1 - entry0
if (entries.length >= 2) {
  const e0 = buf.slice(entries[0], entries[1]);
  console.log("entry0 size", e0.length);
  // Find None terminator
  const none = Buffer.from("\x05\x00\x00\x00None\x00");
  const noneAt = e0.indexOf(none);
  console.log("None at", noneAt, "entry payload to None+len", noneAt + none.length);
}

// After last entry, what comes next?
const last = entries[entries.length - 1];
// find None of last entry then next property
let p = last;
for (let i = 0; i < 400; i++) {
  const [s, n] = readFString(p);
  if (s === "None") {
    console.log("None of last at", p, "next prop starts", n);
    console.log(buf.slice(n, n + 40).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
    break;
  }
  if (!s) {
    p++;
    continue;
  }
  p = n;
}
