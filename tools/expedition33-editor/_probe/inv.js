"use strict";

const fs = require("fs");
const buf = fs.readFileSync(
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
);

function readFString(o) {
  if (o + 4 > buf.length) return [null, o];
  const len = buf.readInt32LE(o);
  if (len <= 0 || o + 4 + len > buf.length) return [null, o];
  let s = buf.slice(o + 4, o + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return [s, o + 4 + len];
}

function findNamed(name) {
  const enc = Buffer.from(name + "\0");
  for (let i = 4; i < buf.length - enc.length - 24; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const [type, after] = readFString(i + enc.length);
    return { i, type, after };
  }
  return null;
}

const inv = findNamed("InventoryItems");
console.log("InventoryItems", inv);
console.log(
  "asc",
  buf
    .slice(inv.after, inv.after + 160)
    .toString("latin1")
    .replace(/[^\x20-\x7e]/g, ".")
);
console.log("hex", buf.slice(inv.after, inv.after + 80).toString("hex"));

// Walk map entries starting at first inventory key after MapProperty header.
// From prior probe, HealingTint_Shard @ 7918 is early in the map.
let o = 7914; // length prefix before HealingTint_Shard
const entries = [];
for (let n = 0; n < 60; n++) {
  const [k, end] = readFString(o);
  if (!k || k.length > 100 || !/^[A-Za-z0-9_]+$/.test(k)) {
    console.log("stop", { o, k });
    break;
  }
  const val = buf.readInt32LE(end);
  entries.push({ k, val, nameAt: o + 4, valAt: end });
  o = end + 4;
  if (k === "Gold") break;
}
console.log("entries", entries.length);
console.log(entries);

const gold = findNamed("Gold");
console.log("Gold value", buf.readInt32LE(gold.after + 9), "valAt", gold.after + 9);

const mapLoad = findNamed("MapToLoad");
const [level] = readFString(mapLoad.after + 9);
console.log("MapToLoad", level);

const time = findNamed("TimePlayed");
console.log("TimePlayed", buf.readDoubleLE(time.after + 9));

// How many characters in collection?
const chars = findNamed("CharactersCollection");
console.log("CharactersCollection header", buf.slice(chars.after, chars.after + 64).toString("hex"));
