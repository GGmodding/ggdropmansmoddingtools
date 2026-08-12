"use strict";
const fs = require("fs");
const path = require("path");

const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";
const cur = fs.readFileSync(path.join(DIR, "EXPEDITION_0.sav"));
const bak = fs.readFileSync(path.join(DIR, "Backup/EXPEDITION_0_2026_8_11_0_4_43.sav"));

function findProps(buf) {
  const props = [];
  // Scan for NameProperty/IntProperty/etc patterns: FString then type FString
  const types = [
    "IntProperty",
    "BoolProperty",
    "NameProperty",
    "StrProperty",
    "ArrayProperty",
    "MapProperty",
    "StructProperty",
    "FloatProperty",
    "DoubleProperty",
    "ByteProperty",
    "SoftObjectProperty",
    "ObjectProperty",
  ];
  for (let i = 4; i < buf.length - 20; i++) {
    const len = buf.readInt32LE(i - 4);
    if (len < 3 || len > 120) continue;
    if (i - 4 + 4 + len > buf.length) continue;
    const name = buf.slice(i, i + len - 1).toString("utf8");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    // type follows
    const typeLen = buf.readInt32LE(i + len);
    if (typeLen < 5 || typeLen > 40) continue;
    const typeStart = i + len + 4;
    if (typeStart + typeLen > buf.length) continue;
    const type = buf.slice(typeStart, typeStart + typeLen - 1).toString("utf8");
    if (!types.includes(type)) continue;
    props.push({ name, type, at: i - 4 });
  }
  return props;
}

const curProps = findProps(cur);
const bakProps = findProps(bak);
const curNames = new Map(curProps.map((p) => [p.name + "|" + p.type, p]));
const bakNames = new Map(bakProps.map((p) => [p.name + "|" + p.type, p]));

const onlyBak = [...bakNames.keys()].filter((k) => !curNames.has(k));
const onlyCur = [...curNames.keys()].filter((k) => !bakNames.has(k));
console.log("prop hits cur", curProps.length, "bak", bakProps.length);
console.log("only in backup (" + onlyBak.length + "):");
onlyBak.slice(0, 40).forEach((k) => console.log(" ", k, "at", bakNames.get(k).at));
console.log("only in current (" + onlyCur.length + "):");
onlyCur.slice(0, 40).forEach((k) => console.log(" ", k, "at", curNames.get(k).at));

// Top-level-ish unique property names counts
function rootish(props) {
  // heuristic: properties whose names don't have GUID suffixes long form - actually list unique names
  const c = {};
  for (const p of props) c[p.name] = (c[p.name] || 0) + 1;
  return c;
}
const rc = rootish(curProps);
const rb = rootish(bakProps);
const missingRoots = Object.keys(rb).filter((k) => !rc[k]);
const extraRoots = Object.keys(rc).filter((k) => !rb[k]);
console.log("\nmissing root names in current", missingRoots.length);
missingRoots.forEach((k) => console.log(" ", k, "bakCount", rb[k]));
console.log("extra in current", extraRoots.length);
extraRoots.slice(0, 30).forEach((k) => console.log(" ", k, "curCount", rc[k]));

// Check SavesContainer
const sc = fs.readFileSync(path.join(DIR, "SavesContainer.sav"));
console.log("\nSavesContainer size", sc.length);
console.log(sc.toString("utf8").replace(/[^\x20-\x7e\n]/g, ".").slice(0, 1500));
