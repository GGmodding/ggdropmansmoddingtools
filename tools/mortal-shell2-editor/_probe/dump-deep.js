"use strict";

const fs = require("fs");
const path = require("path");

const file =
  process.argv[2] ||
  path.join(process.env.LOCALAPPDATA, "MortalShell2", "Saved", "SaveGames", "WorldState_0.sav");

const buf = fs.readFileSync(file);
console.log("FILE", file);
console.log("SIZE", buf.length);

function readU32(o) {
  if (o + 4 > buf.length) return null;
  return buf.readUInt32LE(o);
}
function readI32(o) {
  if (o + 4 > buf.length) return null;
  return buf.readInt32LE(o);
}
function readFString(o) {
  const len = readI32(o);
  if (len == null) return [null, o];
  let off = o + 4;
  if (len === 0) return ["", off];
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
  const s = Buffer.from(raw).toString("utf8");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) return [null, o];
  return [s, off];
}

const TYPES = new Set([
  "IntProperty",
  "Int64Property",
  "UInt32Property",
  "FloatProperty",
  "DoubleProperty",
  "BoolProperty",
  "ByteProperty",
  "StrProperty",
  "NameProperty",
  "EnumProperty",
  "ArrayProperty",
  "MapProperty",
  "SetProperty",
  "StructProperty",
  "ObjectProperty",
  "SoftObjectProperty",
]);

const strings = [];
for (let i = 0; i < buf.length - 8; i++) {
  const [s, end] = readFString(i);
  if (!s || s.length < 3) continue;
  if (!/^[\x20-\x7e]+$/.test(s)) continue;
  strings.push({ at: i, s, end });
  i = end - 1;
}

console.log("\n=== FSTRING COUNT", strings.length, "===");
const interesting = /health|hp|gold|gloom|glimpse|tar|resolve|currency|ovum|ventrium|laterite|dorsalite|thoracium|heal|flask|amount|count|current|max|player|shell|item|inventory|weapon|level|xp|exp|poise|stamina/i;
const hits = strings.filter((x) => interesting.test(x.s));
console.log("KEYWORD STRINGS", hits.length);
for (const h of hits) console.log(("    " + h.at).slice(-8), h.s);

console.log("\n=== ALL PROPERTIES ===");
const props = [];
for (let i = 4; i < buf.length - 28; i++) {
  const [type, after] = readFString(i);
  if (!type || !TYPES.has(type)) continue;
  let name = null;
  for (let back = 4; back < 240; back++) {
    const ns = i - back;
    if (ns < 4) break;
    if (readU32(ns - 4) !== back) continue;
    const [nm, nend] = readFString(ns - 4);
    if (!nm || nend !== i) continue;
    if (!/^[\x20-\x7e]{1,200}$/.test(nm)) continue;
    name = nm;
    break;
  }
  if (!name) continue;
  const valueAt = type === "BoolProperty" ? after + 8 : after + 9;
  let value = null;
  if (type === "BoolProperty") value = buf[valueAt] !== 0;
  else if (type === "IntProperty" || type === "UInt32Property") value = readI32(valueAt);
  else if (type === "FloatProperty" && valueAt + 4 <= buf.length) value = buf.readFloatLE(valueAt);
  else if (type === "DoubleProperty" && valueAt + 8 <= buf.length) value = buf.readDoubleLE(valueAt);
  else if (type === "StrProperty" || type === "NameProperty") value = readFString(valueAt)[0];
  else if (type === "MapProperty" || type === "ArrayProperty" || type === "SetProperty") {
    const size = readI32(after);
    const inner = readFString(after + 9)[0];
    value = { size, inner };
  }
  props.push({ name, type, at: i, after, valueAt, value });
  i = after - 1;
}

for (const p of props) {
  console.log(
    p.name.padEnd(32),
    p.type.padEnd(20),
    JSON.stringify(p.value)
  );
}

console.log("\n=== INT/FLOAT VALUES ===");
for (const p of props) {
  if (typeof p.value === "number" || typeof p.value === "boolean") {
    console.log(p.name, p.type, p.value);
  }
}

const out = path.join(__dirname, "dump-deep-out.txt");
fs.writeFileSync(
  out,
  hits.map((h) => h.at + "\t" + h.s).join("\n") +
    "\n\n---PROPS---\n" +
    props.map((p) => p.name + " :" + p.type + " = " + JSON.stringify(p.value)).join("\n")
);
console.log("\nwrote", out);
