"use strict";
/**
 * Strip transient world-state maps that can brick load if inconsistent.
 * Keeps character/inventory/progress. Writes repaired save.
 */
const fs = require("fs");
const path = require("path");

const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";
const SRC = path.join(DIR, "Backup/EXPEDITION_0_2026_8_11_0_4_43.sav");
const OUT = path.join(DIR, "EXPEDITION_0.sav");
const ALSO = path.join(DIR, "_editor_quarantine/EXPEDITION_0.no_transient.sav");

const STRIP = [
  "TransientBattledEnemies",
  "TransientEnemyTransforms",
  "TransientEnemyRoamingPointIndexes",
];

function readFString(buf, o) {
  const len = buf.readInt32LE(o);
  if (len == null || len <= 0 || o + 4 + len > buf.length) return [null, o];
  let s = buf.slice(o + 4, o + 4 + len).toString("utf8");
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return [s, o + 4 + len];
}

function findProp(buf, name, typeWanted) {
  const enc = Buffer.from(name + "\0");
  for (let i = 4; i < buf.length - enc.length - 24; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    const [type, afterType] = readFString(buf, i + enc.length);
    if (typeWanted && type !== typeWanted) continue;
    return { nameAt: i - 4, typeAt: i + enc.length, type, afterType };
  }
  return null;
}

/** MapProperty payload size is at afterType+4 (after index); total prop bytes = header + size. */
function mapPropEnd(buf, hit) {
  // afterType: index(4) size(4) tag(1) then keyType FString, valueType FString, then map body of `size` bytes?
  // In this game's InventoryItems, size field near count was junk (5/6).
  // Safer: find next top-level property after this one by scanning for known neighbors.
  return null;
}

function findNextRootishProp(buf, after) {
  // Scan forward for FString name + Property type pattern at plausible boundaries
  const types = [
    "MapProperty",
    "ArrayProperty",
    "StructProperty",
    "IntProperty",
    "BoolProperty",
    "NameProperty",
    "StrProperty",
    "DoubleProperty",
    "FloatProperty",
    "ByteProperty",
    "SoftObjectProperty",
    "ObjectProperty",
  ];
  for (let i = after; i < Math.min(buf.length - 8, after + 200000); i++) {
    const len = buf.readInt32LE(i);
    if (len < 3 || len > 120) continue;
    if (i + 4 + len + 4 > buf.length) continue;
    const name = buf.slice(i + 4, i + 4 + len - 1).toString("utf8");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (buf[i + 4 + len - 1] !== 0) continue;
    const [type] = readFString(buf, i + 4 + len);
    if (types.includes(type)) return i;
  }
  return -1;
}

function removeProps(buf, names) {
  let b = Buffer.from(buf);
  for (const name of names) {
    const hit = findProp(b, name, "MapProperty");
    if (!hit) {
      console.log("skip missing", name);
      continue;
    }
    const next = findNextRootishProp(b, hit.afterType + 20);
    if (next < 0) throw new Error("Could not find end of " + name);
    console.log("strip", name, "bytes", next - hit.nameAt, "from", hit.nameAt, "to", next);
    b = Buffer.concat([b.slice(0, hit.nameAt), b.slice(next)]);
  }
  return b;
}

const raw = fs.readFileSync(SRC);
console.log("src", raw.length);
let out = removeProps(raw, STRIP);
console.log("out", out.length, "removed", raw.length - out.length);

// Verify stripped
for (const name of STRIP) {
  const still = findProp(out, name, "MapProperty");
  console.log(name, still ? "STILL PRESENT" : "gone");
}

// Parse with gvas
const vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "../gvas.js"), "utf8");
const sandbox = { console, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const p = sandbox.E33Gvas.parseSave(new Uint8Array(out));
console.log("parse", {
  ok: p.ok,
  gold: p.gold,
  chars: p.characters.map((c) => c.name),
  inv: p.inventory.length,
  map: p.mapToLoad,
});

fs.mkdirSync(path.dirname(ALSO), { recursive: true });
fs.writeFileSync(ALSO, out);
fs.writeFileSync(OUT, out);
fs.copyFileSync(path.join(DIR, "Backup/SavesContainer.sav"), path.join(DIR, "SavesContainer.sav"));
console.log("wrote", OUT);
