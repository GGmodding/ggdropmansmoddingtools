"use strict";

const fs = require("fs");
const path = require("path");

const file =
  process.argv[2] ||
  path.join(process.env.LOCALAPPDATA, "MortalShell2", "Saved", "SaveGames", "WorldState_0.sav");
const buf = fs.readFileSync(file);

function readI32(o) {
  if (o < 0 || o + 4 > buf.length) return null;
  return buf.readInt32LE(o);
}
function readFString(o) {
  const len = readI32(o);
  if (len == null || len <= 0 || len > 800) return [null, o];
  const off = o + 4;
  if (off + len > buf.length) return [null, o];
  let raw = buf.subarray(off, off + len);
  if (raw[raw.length - 1] === 0) raw = raw.subarray(0, raw.length - 1);
  const s = raw.toString("utf8");
  if (!/^[\x20-\x7e]+$/.test(s)) return [null, o];
  return [s, off + len];
}

function findName(name) {
  const needle = Buffer.from(name + "\0");
  const textAt = buf.indexOf(needle);
  if (textAt < 4) return null;
  if (readI32(textAt - 4) !== name.length + 1) return null;
  return textAt - 4;
}

function parseObjectIntMap(mapName) {
  const nameAt = findName(mapName);
  if (nameAt == null) return null;
  const [, afterName] = readFString(nameAt);
  const [typ, afterType] = readFString(afterName);
  if (typ !== "MapProperty") return { error: "not map", typ };

  const marker = Buffer.from("IntProperty\0");
  const intAt = buf.indexOf(marker, afterType);
  if (intAt < 0 || intAt - afterType > 80) return { error: "no IntProperty" };
  const afterInt = intAt + marker.length;

  let start = -1;
  let count = 0;
  for (let skip = 0; skip < 28; skip++) {
    const c = readI32(afterInt + skip);
    if (c < 1 || c > 64) continue;
    const [s] = readFString(afterInt + skip + 4);
    if (s && (s.startsWith("/Game/") || s.startsWith("ID_"))) {
      start = afterInt + skip + 4;
      count = c;
      break;
    }
  }
  if (start < 0) {
    return { error: "no entries", afterInt, peek: buf.subarray(afterInt, afterInt + 32).toString("hex") };
  }

  const items = [];
  let p = start;
  for (let i = 0; i < count; i++) {
    const [s, n] = readFString(p);
    if (!s) break;
    const amt = readI32(n);
    items.push({ path: s, amount: amt, amountAt: n });
    p = n + 4;
  }
  return { mapName, count, items };
}

for (const name of ["DropItems", "PPItemFoundAmounts", "PPItemLevels"]) {
  const parsed = parseObjectIntMap(name);
  console.log("\n===", name, "===");
  console.log(parsed && parsed.error ? parsed : parsed.items.map((it) => it.path.split("/").pop() + " = " + it.amount).join("\n"));
}
