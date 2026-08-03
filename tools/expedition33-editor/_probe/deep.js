"use strict";

const fs = require("fs");
const path = require("path");

const SAV =
  process.argv[2] ||
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav";
const buf = fs.readFileSync(SAV);
console.log("size", buf.length, path.basename(SAV));

function readFString(o) {
  if (o + 4 > buf.length) return [null, o];
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

function dumpAround(label, off, before = 16, after = 96) {
  const a = Math.max(0, off - before);
  const b = Math.min(buf.length, off + after);
  console.log("\n==", label, "@", off);
  console.log(buf.slice(a, b).toString("hex"));
  console.log(
    buf
      .slice(a, b)
      .toString("latin1")
      .replace(/[^\x20-\x7e]/g, ".")
  );
}

const targets = [
  "InventoryItems",
  "WeaponProgressions",
  "PassiveEffectsProgressions",
  "ExplorationProgression",
  "SpawnPointTagToLoadAt",
  "MapToLoad",
  "AssignedAttributePoints_190_4E4BA51441F1E8D8E07ECA95442E0B7E",
  "UnlockedSkills_197_FAA1BD934F68CFC542FB048E3C0F3592",
  "EquippedSkills_201_05B6B5E9490E2586B23751B11CDA521F",
  "CurrentParty",
  "QuestStatuses",
  "InteractedObjects",
  "EquippedConsumableShards",
];

for (const t of targets) {
  const hits = findNamed(t);
  console.log(
    t,
    hits.map((h) => h.type + "@" + h.i).join(" | ") || "(none)"
  );
  if (hits[0]) dumpAround(t, hits[0].i - 4, 4, 120);
}

// Sample inventory entry bytes (HealingTint)
const invKey = "HealingTint_Shard";
const enc = Buffer.from(invKey + "\0");
for (let i = 4; i < buf.length - enc.length; i++) {
  if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
  if (buf.readUInt32LE(i - 4) !== enc.length) continue;
  dumpAround("inv entry " + invKey, i - 4, 0, 40);
  break;
}

// Collect NameProperty strings that look like MusicRecord / Journal / Quest
const interesting = [];
for (let i = 0; i < buf.length - 8; i++) {
  const len = buf.readInt32LE(i);
  if (len < 6 || len > 80 || i + 4 + len > buf.length) continue;
  if (buf[i + 3 + len] !== 0 && buf[i + 4 + len - 1] !== 0) continue;
  let s = buf.slice(i + 4, i + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  if (!/^(MusicRecord_|Quest_|Journal_|EXP_|Skin|Face|Consumable_|UpgradeMaterial_)/.test(s))
    continue;
  interesting.push(s);
  i += 3 + len;
}
console.log("\n== interesting name hits (unique)");
console.log([...new Set(interesting)].sort().join("\n"));
