"use strict";
const fs = require("fs");
const buf = fs.readFileSync(
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
);
function readFString(o) {
  const len = buf.readInt32LE(o);
  let s = buf.slice(o + 4, o + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return [s, o + 4 + len];
}
function findNamed(name, type) {
  const enc = Buffer.from(name + "\0");
  const hits = [];
  for (let i = 4; i < buf.length - enc.length - 24; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const [t, after] = readFString(i + enc.length);
    if (type && t !== type) continue;
    hits.push({ i, type: t, after });
  }
  return hits;
}
function parseArrayAt(after) {
  const marker = Buffer.from("NameProperty\0");
  for (let i = after; i < after + 60; i++) {
    if (buf.compare(marker, 0, marker.length, i, i + marker.length) !== 0) continue;
    let p = i + marker.length;
    for (let skip = 0; skip < 20; skip++) {
      const count = buf.readUInt32LE(p + skip);
      if (count > 0 && count < 200) {
        const out = [];
        let q = p + skip + 4;
        for (let n = 0; n < count; n++) {
          const [nm, nend] = readFString(q);
          if (!nm) break;
          out.push({ name: nm, at: q });
          q = nend;
        }
        if (out.length === count) return out;
      }
    }
  }
  return [];
}
const US = "UnlockedSkills_197_FAA1BD934F68CFC542FB048E3C0F3592";
const ES = "EquippedSkills_201_05B6B5E9490E2586B23751B11CDA521F";
for (const h of findNamed(US, "ArrayProperty")) {
  console.log("unlocked @" + h.i, parseArrayAt(h.after));
}
for (const h of findNamed(ES, "ArrayProperty")) {
  console.log("equipped @" + h.i, parseArrayAt(h.after));
}
