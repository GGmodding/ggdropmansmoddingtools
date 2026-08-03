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
  for (let i = 4; i < buf.length - enc.length - 24; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const [t, after] = readFString(i + enc.length);
    if (type && t !== type) continue;
    return { i, type: t, after };
  }
  return null;
}

// Weapon progressions — walk entries
const wp = findNamed("WeaponProgressions", "ArrayProperty");
let o = wp.after;
console.log("WP header", buf.slice(o, o + 100).toString("hex"));
// skip to find DefinitionID occurrences
const def = "DefinitionID_3_60EB24664894755B19F4EBA18A21AF1A";
const lvl = "CurrentLevel_6_227A00644D035BDD595B2D86C8455B71";
function findAll(s) {
  const e = Buffer.from(s);
  const out = [];
  for (let i = 0; i < buf.length - e.length; i++) {
    if (buf.compare(e, 0, e.length, i, i + e.length) === 0) out.push(i);
  }
  return out;
}
const defs = findAll(def);
const lvls = findAll(lvl);
console.log("weapon def hits", defs.length, "level hits", lvls.length);
for (let i = 0; i < Math.min(defs.length, 5); i++) {
  const d = defs[i];
  // after NameProperty header for DefinitionID, value is Name
  const hitType = readFString(d + def.length + 1);
  console.log("def", i, "at", d, "next type?", hitType[0]);
  // find NameProperty after the long name
  const nameProp = findNamed(def, "NameProperty");
}
// For each DefinitionID NameProperty, read value name and nearby level int
for (const d of defs) {
  if (buf.readUInt32LE(d - 4) !== def.length + 1) continue;
  const [typ, after] = readFString(d + def.length + 1);
  if (typ !== "NameProperty") continue;
  const [wname] = readFString(after + 9);
  // find level nearby
  let level = null,
    levelAt = null;
  for (const l of lvls) {
    if (l > d && l < d + 200) {
      if (buf.readUInt32LE(l - 4) !== lvl.length + 1) continue;
      const [lt, la] = readFString(l + lvl.length + 1);
      if (lt === "IntProperty") {
        level = buf.readInt32LE(la + 9);
        levelAt = la + 9;
      }
      break;
    }
  }
  console.log("weapon", wname, "level", level, "levelAt", levelAt);
}

// Attributes
const apName = "AssignedAttributePoints_190_4E4BA51441F1E8D8E07ECA95442E0B7E";
const ap = findNamed(apName, "MapProperty");
o = ap.after;
console.log("\nAP raw", buf.slice(o, o + 250).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
// Find enumerators and ints
const en = "ECharacterAttribute::NewEnumerator";
for (const hit of findAll(en)) {
  const full = buf.slice(hit, hit + 40).toString("utf8").split("\0")[0];
  // value int after the enum name string in map
  const len = buf.readUInt32LE(hit - 4);
  const end = hit + len;
  const val = buf.readInt32LE(end);
  console.log("attr", full, "val", val, "valAt", end);
}

// Exploration capacities — find byte array values
const exCap = "ExplorationCapacities_22_D278AAE341C821F118686B81FD83BBB0";
const exHits = findAll(exCap);
console.log("\nExplorationCapacities hits", exHits.length);
for (const h of exHits) {
  console.log(buf.slice(h, h + 200).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  console.log(buf.slice(h, h + 200).toString("hex"));
}

// Spawn tag name value
const sp = findNamed("SpawnPointTagToLoadAt", "StructProperty");
const tagHits = findAll("TagName");
for (const h of tagHits) {
  if (h < sp.i || h > sp.i + 200) continue;
  if (buf.readUInt32LE(h - 4) !== 8) continue; // "TagName\0" len 8
  const [t, a] = readFString(h + 8);
  console.log("\nTagName type", t);
  const [v] = readFString(a + 9);
  console.log("spawn tag", v, "at", a + 9);
}

// InteractedObjects sample
const io = findNamed("InteractedObjects", "MapProperty");
console.log("\nInteractedObjects header", buf.slice(io.after, io.after + 80).toString("hex"));
