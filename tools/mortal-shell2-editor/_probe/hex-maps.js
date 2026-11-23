"use strict";

const fs = require("fs");
const path = require("path");

const file =
  process.argv[2] ||
  path.join(process.env.LOCALAPPDATA, "MortalShell2", "Saved", "SaveGames", "WorldState_0.sav");
const buf = fs.readFileSync(file);

function readI32(o) {
  if (o + 4 > buf.length) return null;
  return buf.readInt32LE(o);
}
function readFString(o) {
  const len = readI32(o);
  if (len == null || len === 0) return [len === 0 ? "" : null, o + 4];
  let off = o + 4;
  if (len < 0) {
    const chars = -len;
    const bytes = chars * 2;
    if (off + bytes > buf.length || chars > 4096) return [null, o];
    let s = "";
    for (let i = 0; i < chars; i++) s += String.fromCharCode(buf[off + i * 2] | (buf[off + i * 2 + 1] << 8));
    if (s.endsWith("\0")) s = s.slice(0, -1);
    return [s, off + bytes];
  }
  if (off + len > buf.length || len > 8192) return [null, o];
  let raw = buf.subarray(off, off + len);
  off += len;
  if (raw.length && raw[raw.length - 1] === 0) raw = raw.subarray(0, raw.length - 1);
  return [Buffer.from(raw).toString("utf8"), off];
}

function hex(o, n) {
  const slice = buf.subarray(o, o + n);
  const hex = [...slice].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const ascii = [...slice].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
  return hex + "  " + ascii;
}

const needle = Buffer.from("DropItems\0");
let at = buf.indexOf(needle);
console.log("DropItems ascii at", at);

// FString is len + chars, so name starts 4 bytes before the text if len is 10
const nameAt = buf.indexOf(Buffer.from("\n\0\0\0DropItems\0")); // 10 = 0x0a
console.log("nameAt", nameAt);

function dumpAround(label, o, n) {
  console.log("\n===", label, "off", o, "===");
  for (let i = 0; i < n; i += 16) {
    console.log(String(o + i).padStart(6), hex(o + i, Math.min(16, n - i)));
  }
}

if (nameAt >= 0) dumpAround("DropItems", nameAt, 512);

const keys = ["PPItemFoundAmounts", "PPItemLevels", "LostGloomAmount", "ActorInts", "CumulativeGold"];
for (const k of keys) {
  const hit = buf.indexOf(Buffer.from(k + "\0"));
  console.log(k, "at", hit);
  if (hit >= 0) dumpAround(k, Math.max(0, hit - 8), 192);
}
