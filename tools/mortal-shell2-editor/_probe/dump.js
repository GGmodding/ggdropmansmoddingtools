"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
console.log("LOCALAPPDATA=" + local);

try {
  for (const d of fs.readdirSync(local)) {
    if (/mortal|shell|cold|symmetry|playstack/i.test(d)) {
      console.log("DIR " + path.join(local, d));
    }
  }
} catch (err) {
  console.log("list err " + err.message);
}

const roots = [
  path.join(local, "MortalShell2"),
  path.join(local, "MortalShellII"),
  path.join(local, "Mortal Shell 2"),
  path.join(local, "ColdSymmetry"),
];

function walk(dir, depth, acc) {
  if (depth > 6) return;
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1, acc);
    else if (/\.(sav|bak)$/i.test(e.name)) acc.push(p);
  }
}

function readU32(buf, o) {
  if (o + 4 > buf.length) return null;
  return buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | ((buf[o + 3] << 24) >>> 0);
}

function readI32(buf, o) {
  const u = readU32(buf, o);
  return u == null ? null : u | 0;
}

function readFString(buf, o) {
  const len = readI32(buf, o);
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
  if (off + len > buf.length || len > 4096) return [null, o];
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

function scan(buf) {
  const props = [];
  for (let i = 4; i < buf.length - 28; i++) {
    const [type, after] = readFString(buf, i);
    if (!type || !TYPES.has(type)) continue;
    let name = null;
    for (let back = 4; back < 240; back++) {
      const ns = i - back;
      if (ns < 4) break;
      if (readU32(buf, ns - 4) !== back) continue;
      const [nm, nend] = readFString(buf, ns - 4);
      if (!nm || nend !== i) continue;
      if (!/^[\x20-\x7e]{1,200}$/.test(nm)) continue;
      name = nm;
      break;
    }
    if (!name) continue;
    let value = null;
    const valueAt = after + 9;
    if (type === "BoolProperty") value = buf[after + 8] !== 0;
    else if (type === "IntProperty" || type === "UInt32Property") value = readI32(buf, valueAt);
    else if (type === "FloatProperty" && valueAt + 4 <= buf.length) {
      value = buf.readFloatLE(valueAt);
    } else if (type === "DoubleProperty" && valueAt + 8 <= buf.length) {
      value = buf.readDoubleLE(valueAt);
    } else if (type === "StrProperty" || type === "NameProperty") {
      const [v] = readFString(buf, valueAt);
      value = v;
    }
    props.push({ name, type, value });
    i = after - 1;
  }
  return props;
}

const files = [];
for (const r of roots) {
  console.log("try " + r + " " + (fs.existsSync(r) ? "EXISTS" : "missing"));
  if (fs.existsSync(r)) walk(r, 0, files);
}

const steamRoots = ["C:\\Program Files (x86)\\Steam\\userdata", "D:\\Steam\\userdata"];
for (const s of steamRoots) {
  if (!fs.existsSync(s)) continue;
  try {
    for (const user of fs.readdirSync(s)) {
      const p = path.join(s, user, "2584270");
      if (fs.existsSync(p)) {
        console.log("STEAM " + p);
        walk(p, 0, files);
      }
    }
  } catch (_) {}
}

console.log("files " + files.length);
const lines = [];
for (const f of files.slice(0, 30)) {
  const buf = fs.readFileSync(f);
  const st = fs.statSync(f);
  console.log("\n==== " + f);
  console.log("size " + st.size);
  console.log("head " + buf.slice(0, 16).toString("hex"));
  console.log("ascii " + buf.slice(0, 48).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  console.log("GVAS " + buf.indexOf(Buffer.from("GVAS")));
  const props = scan(buf);
  const seen = new Map();
  for (const p of props) {
    const k = p.name + "|" + p.type;
    if (!seen.has(k)) seen.set(k, p);
  }
  const unique = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  console.log("props " + props.length + " unique " + unique.length);
  const keys = /tar|glimpse|health|resolve|shell|harden|gold|currency|level|xp|playtime|familiar|parry|inventory|weapon/i;
  for (const p of unique) {
    if (keys.test(p.name)) console.log("  HIT " + p.name + " :" + p.type + " = " + JSON.stringify(p.value));
  }
  for (const p of unique.slice(0, 80)) {
    console.log("  " + p.name + " :" + p.type + " = " + JSON.stringify(p.value));
  }
  lines.push(f + "\n" + unique.map((p) => p.name + " :" + p.type + " = " + JSON.stringify(p.value)).join("\n"));
}

const out = path.join(__dirname, "dump-out.txt");
fs.writeFileSync(out, lines.join("\n\n"));
console.log("\nwrote " + out);
