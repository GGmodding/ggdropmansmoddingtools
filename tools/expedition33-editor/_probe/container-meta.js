"use strict";
const fs = require("fs");
const path = require("path");
const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";
const sc = fs.readFileSync(path.join(DIR, "SavesContainer.sav"));
const sav = fs.readFileSync(path.join(DIR, "EXPEDITION_0.sav"));

// Dump metadata near EXPEDITION_0 slot
const idx = sc.indexOf(Buffer.from("EXPEDITION_0\0"));
console.log("slot name at", idx);
console.log(sc.slice(idx - 20, idx + 200).toString("hex"));
console.log(
  sc
    .slice(idx - 20, idx + 400)
    .toString("latin1")
    .replace(/[^\x20-\x7e]/g, ".")
);

// Search ints that look like timestamps / sizes near start of MetaData
function findNamed(buf, name) {
  const enc = Buffer.from(name + "\0");
  const hits = [];
  for (let i = 4; i < buf.length - enc.length; i++) {
    if (buf.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
    if (buf.readUInt32LE(i - 4) !== enc.length) continue;
    hits.push(i);
  }
  return hits;
}
for (const n of [
  "SaveDateTime",
  "SaveName",
  "LevelName",
  "PlayTime",
  "Version",
  "SaveVersion",
  "SlotIndex",
  "IsValid",
  "Checksum",
  "Hash",
  "FileSize",
]) {
  const hits = findNamed(sc, n);
  if (hits.length) console.log(n, hits);
}
for (const n of ["SaveDateTime", "MapToLoad", "TimePlayedSeconds_NS"]) {
  const hits = findNamed(sav, n);
  console.log("sav", n, hits);
}

// Compare SaveDateTime between container metadata and save if possible
const sdt = findNamed(sav, "SaveDateTime");
if (sdt[0]) {
  console.log("SaveDateTime region", sav.slice(sdt[0] - 4, sdt[0] + 80).toString("hex"));
  console.log(
    sav
      .slice(sdt[0] - 4, sdt[0] + 80)
      .toString("latin1")
      .replace(/[^\x20-\x7e]/g, ".")
  );
}
