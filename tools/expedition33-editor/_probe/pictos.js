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
const h = findNamed("PassiveEffectsProgressions", "MapProperty")[0];
console.log("PassiveEffectsProgressions", h);
// dump from name length through ~600 bytes
const start = h.i - 4;
console.log(buf.slice(start, start + 700).toString("hex"));
console.log("---ascii---");
console.log(
  buf
    .slice(start, start + 700)
    .toString("latin1")
    .replace(/[^\x20-\x7e]/g, ".")
);

// find both PassiveEffectName entries and dump between them + after second
const names = findNamed("PassiveEffectName_3_A92DB6CC4549450728A867A714ADF6C5", "NameProperty");
console.log("\nname hits", names.map((x) => x.i));
for (let n = 0; n < names.length; n++) {
  const a = names[n].i - 4;
  const b = n + 1 < names.length ? names[n + 1].i - 4 : a + 280;
  console.log("\n=== entry", n, "len", b - a);
  console.log(buf.slice(a, b).toString("hex"));
  console.log(buf.slice(a, b).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
