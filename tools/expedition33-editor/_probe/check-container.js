"use strict";
const fs = require("fs");
const path = require("path");
const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";
const sc = fs.readFileSync(path.join(DIR, "SavesContainer.sav"));
const sav = fs.readFileSync(path.join(DIR, "EXPEDITION_0.sav"));

// Find any occurrence of file size numbers
const sizes = [78374, 84060, 84148, sav.length];
for (const s of sizes) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(s);
  let idx = sc.indexOf(buf);
  console.log("size", s, "in container?", idx);
}
// Also search for EXPEDITION string
const enc = Buffer.from("EXPEDITION");
let i = 0;
while ((i = sc.indexOf(enc, i)) >= 0) {
  console.log("EXPEDITION at", i, sc.slice(i, i + 40).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  i += 1;
}
// List IntProperty-looking values near save names
function readFString(buf, o) {
  const len = buf.readInt32LE(o);
  if (len <= 0 || len > 200 || o + 4 + len > buf.length) return [null, o];
  let s = buf.slice(o + 4, o + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return [s, o + 4 + len];
}
for (let o = 4; o < sc.length - 8; o++) {
  const [s, n] = readFString(sc, o);
  if (s && /EXPEDITION|SaveName|Slot|FileSize|SaveData/i.test(s)) {
    console.log("prop-like", s, "@", o);
  }
}
console.log("container/sav ok sizes", sc.length, sav.length);
console.log("GVAS sav", sav.slice(0, 4).toString());
