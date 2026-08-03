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
  for (let i = 4; i < buf.length - enc.length - 24; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const [t, after] = readFString(i + enc.length);
    if (type && t !== type) continue;
    return { i, type: t, after };
  }
  return null;
}

// ---- Inventory map header dissection ----
const inv = findNamed("InventoryItems", "MapProperty");
console.log("InventoryItems after", inv.after);
console.log(buf.slice(inv.after, inv.after + 80).toString("hex"));
// Layout from dump:
// after MapProperty\0:
// 02 00 00 00  = ?
// 0d 00 00 00 NameProperty\0
// 00 00 00 00
// 0c 00 00 00 IntProperty\0
// 00 00 00 00
// 4e           = ?
// 05 00 00 00  = ?
// 00 00 00 00
// 32 00 00 00  = count 50
// then first key

let o = inv.after;
console.log("u32[0]", buf.readUInt32LE(o));
o += 4;
let [kt, o2] = readFString(o);
console.log("keyType", kt);
o = o2;
console.log("u32 after key", buf.readUInt32LE(o));
o += 4;
let [vt, o3] = readFString(o);
console.log("valType", vt);
o = o3;
console.log("next bytes", buf.slice(o, o + 20).toString("hex"));
// 00 00 00 00 4e 05 00 00 00 00 00 00 00 32 00 00 00
console.log("zero", buf.readUInt32LE(o));
console.log("byte", buf[o + 4], String.fromCharCode(buf[o + 4]));
console.log("u32", buf.readUInt32LE(o + 5));
console.log("u32", buf.readUInt32LE(o + 9));
console.log("count?", buf.readUInt32LE(o + 13));

const countAt = o + 13;
const count = buf.readUInt32LE(countAt);
console.log("countAt", countAt, "count", count);
const firstEntryAt = countAt + 4;

// MapProperty size field: typically index(4)+size(4)+tag(1) at start of after
// Looking at after: first 4 bytes are 02 not 00 - so NOT standard index/size?
// Actually from earlier Gold: index=0 size=4 tag=0
// For MapProperty: hex started with 02 00 00 00 - maybe numKeys type?
// Wait - property SIZE is before the type-specific data. For MapProperty the structure after type name is:
// From uesave: size u32, index u32, ... OR index then size
// Our after starts with 02 00 00 00 which is NOT size of payload.
// Looking again at InventoryItems dump from deep.js:
// InventoryItems\0 MapProperty\0 then 02 00 00 00 ...
// So afterType includes the 02...
// Perhaps: array_index isn't there and it's different UE5 format with:
//  inner_tag: 2? 

// Property size for MapProperty - search backwards from NameProperty
// Name length field for InventoryItems is at inv.i-4
// After MapProperty null at inv.after
// Standard UE4: 
//   size: i64 or u32
// Looking at TimePlayed DoubleProperty: after = 00 00 00 00 08 00 00 00 00 <double>
// = index 0, size 8, tag 0

// For InventoryItems MapProperty after = 02 00 00 00 0d 00 00 00 NameProperty
// That doesn't match index/size pattern! Unless size is huge and we're wrong about after.

const nameEnd = inv.i + ("InventoryItems\0".length);
console.log("nameAt", inv.i, "recalc after type");
const [t2, after2] = readFString(nameEnd);
console.log(t2, after2, "same?", after2 === inv.after);

// Maybe MapProperty has: size as first part differently
// Check bytes RIGHT before keyType NameProperty length:
// 02 00 00 00 could be Max/Num?

// I'll treat count field at countAt and entry region firstEntryAt..gold
const gold = findNamed("Gold", "IntProperty");
console.log("gold nameAt-4", gold.i - 4);

// Compute payload size of map entries
let p = firstEntryAt;
for (let n = 0; n < count; n++) {
  const [k, end] = readFString(p);
  p = end + 4;
}
console.log("entries end", p, "gold prop start", gold.i - 4, "match", p === gold.i - 4);

// ---- WeaponProgressions ----
const wp = findNamed("WeaponProgressions", "ArrayProperty");
console.log("\nWeaponProgressions");
console.log(buf.slice(wp.after, wp.after + 200).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
console.log(buf.slice(wp.after, wp.after + 200).toString("hex"));

// ---- AssignedAttributePoints ----
const ap = findNamed(
  "AssignedAttributePoints_190_4E4BA51441F1E8D8E07ECA95442E0B7E",
  "MapProperty"
);
console.log("\nAssignedAttributePoints");
console.log(buf.slice(ap.after, ap.after + 160).toString("hex"));
console.log(buf.slice(ap.after, ap.after + 200).toString("latin1").replace(/[^\x20-\x7e]/g, "."));

// ---- Exploration ----
const ex = findNamed("ExplorationProgression", "StructProperty");
console.log("\nExploration");
console.log(buf.slice(ex.after, ex.after + 250).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
console.log(buf.slice(ex.after, ex.after + 250).toString("hex"));

// ---- Spawn ----
const sp = findNamed("SpawnPointTagToLoadAt", "StructProperty");
console.log("\nSpawn");
console.log(buf.slice(sp.after, sp.after + 120).toString("latin1").replace(/[^\x20-\x7e]/g, "."));

// ---- Skills ----
const us = findNamed(
  "UnlockedSkills_197_FAA1BD934F68CFC542FB048E3C0F3592",
  "ArrayProperty"
);
console.log("\nUnlockedSkills");
console.log(buf.slice(us.after, us.after + 180).toString("latin1").replace(/[^\x20-\x7e]/g, "."));

// ---- Party ----
const party = findNamed("CurrentParty", "ArrayProperty");
console.log("\nCurrentParty");
console.log(buf.slice(party.after, party.after + 220).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
