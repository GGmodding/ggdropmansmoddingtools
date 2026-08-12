"use strict";
const fs = require("fs");
const path = require("path");
const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";

function readFString(buf, o) {
  if (o + 4 > buf.length) return [null, o];
  const len = buf.readInt32LE(o);
  if (len === 0) return ["", o + 4];
  if (len < 0) {
    const chars = -len;
    const bytes = chars * 2;
    if (o + 4 + bytes > buf.length) return [null, o];
    let s = "";
    for (let i = 0; i < chars; i++) s += String.fromCharCode(buf.readUInt16LE(o + 4 + i * 2));
    if (s.endsWith("\0")) s = s.slice(0, -1);
    return [s, o + 4 + bytes];
  }
  if (o + 4 + len > buf.length) return [null, o];
  let s = buf.slice(o + 4, o + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return [s, o + 4 + len];
}

function dumpProps(buf, start, end, indent = "") {
  let o = start;
  let guard = 0;
  while (o + 8 < end && guard++ < 200) {
    const nameAt = o;
    const [name, afterName] = readFString(buf, o);
    if (!name) {
      o++;
      continue;
    }
    const [type, afterType] = readFString(buf, afterName);
    if (!type || !/Property$/.test(type)) {
      o = afterName;
      continue;
    }
    if (name === "None") {
      console.log(indent + "None @", nameAt);
      return afterName;
    }
    // header
    let p = afterType;
    const idx = buf.readUInt32LE(p); p += 4;
    const size = buf.readUInt32LE(p); p += 4;
    const tag = buf[p]; p += 1;
    let extra = "";
    if (type === "IntProperty") {
      const v = buf.readInt32LE(p);
      extra = " = " + v;
      p += size;
    } else if (type === "BoolProperty") {
      extra = " = " + tag;
      // bool uses tag as value; size usually 0; sometimes trailing byte
      p += size;
    } else if (type === "NameProperty" || type === "StrProperty") {
      const [v, n] = readFString(buf, p);
      extra = " = " + JSON.stringify(v);
      p = n;
    } else if (type === "DoubleProperty") {
      extra = " = " + buf.readDoubleLE(p);
      p += 8;
    } else if (type === "StructProperty") {
      const [sname, afterS] = readFString(buf, p);
      p = afterS;
      // skip guid-ish
      extra = " struct " + sname + " size=" + size;
      const structStart = p;
      // rough: if DateTime, 8 bytes
      if (sname === "DateTime") {
        const lo = buf.readUInt32LE(p);
        const hi = buf.readUInt32LE(p + 4);
        extra += " ticks=" + lo + "," + hi;
        p += size;
      } else {
        p = structStart + size;
      }
    } else if (type === "ArrayProperty") {
      const [inner, afterInner] = readFString(buf, p);
      extra = " Array<" + inner + "> size=" + size;
      p = afterType + 9 + size; // fallible
    } else {
      p = afterType + 9 + size;
    }
    console.log(indent + name + " : " + type + extra + " @" + nameAt);
    o = Math.max(o + 1, p);
  }
  return o;
}

const sc = fs.readFileSync(path.join(DIR, "SavesContainer.sav"));
const meta = [];
const needle = Buffer.from("MetaData_11_38007BD8468B2FD5C72B9E9C78557279\0");
for (let i = 4; i < sc.length - needle.length; i++) {
  if (sc.compare(needle, 0, needle.length, i, i + needle.length) !== 0) continue;
  if (sc.readUInt32LE(i - 4) !== needle.length) continue;
  meta.push(i);
}
console.log("MetaData hits", meta.length, meta);

// Dump first MetaData block loosely as ascii strings
function stringsNear(buf, at, n = 800) {
  const slice = buf.slice(at, Math.min(buf.length, at + n));
  const out = [];
  for (let i = 0; i < slice.length - 5; i++) {
    const len = slice.readInt32LE(i);
    if (len < 3 || len > 80) continue;
    if (i + 4 + len > slice.length) continue;
    let s = slice.slice(i + 4, i + 4 + len).toString("utf8");
    if (s.endsWith("\0")) s = s.slice(0, -1);
    if (/^[A-Za-z_][A-Za-z0-9_:\- \\/.]{1,70}$/.test(s)) out.push(s);
  }
  return [...new Set(out)];
}
meta.slice(0, 3).forEach((m, i) => {
  console.log("\nMeta", i, "strings:", stringsNear(sc, m - 4, 1200).join(" | "));
});

// Check save file SaveDateTime value
const sav = fs.readFileSync(path.join(DIR, "EXPEDITION_0.sav"));
const sdt = sav.indexOf(Buffer.from("SaveDateTime\0"));
// find proper
function findNamed(buf, name) {
  const enc = Buffer.from(name + "\0");
  for (let i = 4; i < buf.length - enc.length; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    return i;
  }
  return -1;
}
const sdtAt = findNamed(sav, "SaveDateTime");
console.log("\nSaveDateTime at", sdtAt);
// After struct path, value is 8-byte DateTime
const region = sav.slice(sdtAt, sdtAt + 120);
console.log(region.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
// Find DateTime type then 8 bytes after path
const dt = Buffer.from("DateTime\0");
const dti = sav.indexOf(dt, sdtAt);
console.log("DateTime marker", dti);
// After DateTime\0: index, size, tag?, path FString, then 8 bytes
let p = dti + dt.length;
console.log("after DT hex", sav.slice(p, p + 40).toString("hex"));
