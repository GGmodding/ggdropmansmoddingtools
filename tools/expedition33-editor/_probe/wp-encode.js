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
const pep = findNamed("PassiveEffectsProgressions");
console.log("wp", wp.i, "pep", pep.i);

const DEF = "DefinitionID_3_60EB24664894755B19F4EBA18A21AF1A";
const denc = Buffer.from(DEF + "\0");
const defs = [];
for (let i = wp.i; i < pep.i - denc.length; i++) {
  if (buf.compare(denc, 0, denc.length, i, i + denc.length) !== 0) continue;
  if (buf.readUInt32LE(i - 4) !== denc.length) continue;
  // value is after NameProperty headers
  const [t, after] = readFString(i + denc.length);
  const valAt = after + 9;
  const [name] = readFString(valAt);
  defs.push({ at: i - 4, name, t });
}
console.log("defs in WP region", defs.length);
defs.forEach((d) => console.log(d.at, d.name));

// Parse count properly: after StructProperty\0
const marker = Buffer.from("StructProperty\0");
let countAt = -1;
for (let i = wp.after; i < wp.after + 40; i++) {
  if (buf.compare(marker, 0, marker.length, i, i + marker.length) === 0) {
    countAt = i + marker.length;
    break;
  }
}
console.log("countAt", countAt, "count", buf.readUInt32LE(countAt));

// Find end of last WP entry (None before PassiveEffects or next)
const none = Buffer.from("\x05\x00\x00\x00None\x00");
let lastNone = -1;
for (let i = defs[defs.length - 1].at; i < pep.i; i++) {
  if (buf.compare(none, 0, none.length, i, i + none.length) === 0) {
    lastNone = i;
    break;
  }
}
console.log("lastNone", lastNone, "bytes to pep", pep.i - 4 - (lastNone + none.length));
console.log(
  "between",
  buf.slice(lastNone, pep.i).toString("latin1").replace(/[^\x20-\x7e]/g, ".")
);

// Build Dodger weapon entry as template and measure
function encodeFString(s) {
  const b = Buffer.from(s + "\0");
  const out = Buffer.alloc(4 + b.length);
  out.writeInt32LE(b.length, 0);
  b.copy(out, 4);
  return out;
}
function encodeNameProp(propName, value) {
  // propName NameProperty index=0 size=nameLen tag=0 then FString value
  const name = encodeFString(propName);
  const type = encodeFString("NameProperty");
  const val = encodeFString(value);
  // After type: index(4) size(4) tag(1) — size = val.length for NameProperty?
  // From hex: NameProperty 00 | 00000000 | 0c000000 | 00 | 08000000 4c756e6572696d00
  // size field = 0x0c = 12 = 4 + 8 = len prefix + "Lunerim\0"? Lunerim\0 is 8, +4 = 12. Yes!
  const size = val.length;
  const hdr = Buffer.alloc(9);
  hdr.writeUInt32LE(0, 0);
  hdr.writeUInt32LE(size, 4);
  hdr[8] = 0;
  return Buffer.concat([name, type, hdr, val]);
}
function encodeIntProp(propName, value) {
  const name = encodeFString(propName);
  const type = encodeFString("IntProperty");
  // From hex: IntProperty 00 | 00000000 | 04000000 | 00 | 21000000
  const hdr = Buffer.alloc(9);
  hdr.writeUInt32LE(0, 0);
  hdr.writeUInt32LE(4, 4);
  hdr[8] = 0;
  const val = Buffer.alloc(4);
  val.writeInt32LE(value, 0);
  return Buffer.concat([name, type, hdr, val]);
}
function encodeWeaponEntry(id, level) {
  return Buffer.concat([
    encodeNameProp(DEF, id),
    encodeIntProp("CurrentLevel_6_227A00644D035BDD595B2D86C8455B71", level),
    encodeFString("None"),
  ]);
}
const built = encodeWeaponEntry("Dodger", 33);
const existing = buf.slice(defs[2].at, defs[3].at);
console.log("built len", built.length, "existing len", existing.length);
console.log("match?", built.equals(existing));
if (!built.equals(existing)) {
  for (let i = 0; i < Math.min(built.length, existing.length); i++) {
    if (built[i] !== existing[i]) {
      console.log("diff at", i, "built", built[i], "exist", existing[i]);
      console.log("built", built.slice(Math.max(0, i - 8), i + 16).toString("hex"));
      console.log("exist", existing.slice(Math.max(0, i - 8), i + 16).toString("hex"));
      break;
    }
  }
}
