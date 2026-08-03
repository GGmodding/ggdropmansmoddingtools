"use strict";

const fs = require("fs");
const path =
  process.argv[2] ||
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav";
const buf = fs.readFileSync(path);
console.log("size", buf.length);

function readFString(o) {
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
  if (o + 4 + len > buf.length || len < 0) return [null, o];
  let s = buf.slice(o + 4, o + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return [s, o + 4 + len];
}

function findNamed(name) {
  const enc = Buffer.from(name + "\0");
  const hits = [];
  for (let i = 4; i < buf.length - enc.length - 24; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const [type, afterType] = readFString(i + enc.length);
    hits.push({ nameAt: i, type, afterType });
  }
  return hits;
}

function intCandidates(afterType) {
  return {
    p9: buf.readInt32LE(afterType + 9),
    p8: buf.readInt32LE(afterType + 8),
    p12: buf.readInt32LE(afterType + 12),
    hex: buf.slice(afterType, afterType + 20).toString("hex"),
  };
}

for (const name of [
  "Gold",
  "TimePlayed",
  "InventoryItems",
  "CharactersCollection",
  "CurrentParty",
  "MapToLoad",
  "FinishedGameCount",
  "VisitedLevelRowNames",
  "CurrentLevel_49_97AB711D48E18088A93C8DADFD96F854",
  "LuminaFromConsumables_210_7CAC193144F82258C6A89BB09BB1D226",
  "AvailableActionPoints_103_25B963504066FA8FD1210890DD45C001",
  "CharacterHardcodedName_36_FB9BA9294D02CFB5AD3668B0C4FD85A5",
  "IsExcluded_206_5D433A504D71F6A2FC9057945C23DDFB",
]) {
  const hits = findNamed(name);
  console.log("\n==", name, "hits", hits.length);
  for (const h of hits) {
    console.log(" ", h.type, "@", h.nameAt);
    if (h.type === "IntProperty" || h.type === "BoolProperty") {
      console.log("   ", intCandidates(h.afterType));
    } else if (h.type === "DoubleProperty") {
      console.log("    d9", buf.readDoubleLE(h.afterType + 9), "d8", buf.readDoubleLE(h.afterType + 8));
      console.log("    hex", buf.slice(h.afterType, h.afterType + 24).toString("hex"));
    } else {
      console.log("    hex", buf.slice(h.afterType, h.afterType + 32).toString("hex"));
      console.log(
        "    asc",
        buf
          .slice(h.afterType, h.afterType + 48)
          .toString("latin1")
          .replace(/[^\x20-\x7e]/g, ".")
      );
    }
  }
}

// Inventory Name->Int map entries: after key null, int32 value
console.log("\n== inventory-like keys");
const invKeys = [
  "Consumable_LuminaPoint",
  "Consumable_Respec",
  "HealingTint_Shard",
  "EnergyTint_Shard",
  "ReviveTint_Shard",
  "PartyHealShard",
  "FestivalToken",
  "UpgradeMaterial_Level1",
  "UpgradeMaterial_Level2",
  "UpgradeMaterial_Level3",
  "UpgradeMaterial_Level4",
  "UpgradeMaterial_Level5",
];
for (const key of invKeys) {
  const enc = Buffer.from(key + "\0");
  for (let i = 4; i < buf.length - enc.length - 8; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const after = i + enc.length;
    const val = buf.readInt32LE(after);
    const nextLen = buf.readInt32LE(after + 4);
    console.log(key, "@", i, "val", val, "nextLen", nextLen);
  }
}

// Character blocks: hardcoded name then nearby level
console.log("\n== character hardcoded names (NameProperty values)");
const charNameProp = findNamed("CharacterHardcodedName_36_FB9BA9294D02CFB5AD3668B0C4FD85A5");
for (const h of charNameProp) {
  // After NameProperty header, value is FString/FName
  let o = h.afterType;
  // skip size(4)+index(4)+tag(1) = 9, then maybe more for NameProperty
  console.log("try offsets for name value:");
  for (const off of [9, 10, 13, 14, 17]) {
    const [s, end] = readFString(h.afterType + off);
    if (s && /^[A-Za-z][A-Za-z0-9_]{1,24}$/.test(s)) {
      console.log("  +" + off, s, "end", end);
    }
  }
}
