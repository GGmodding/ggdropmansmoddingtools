const fs = require("fs");
const path = require("path");

const dir = __dirname;
function tsv(name) {
  const text = fs.readFileSync(path.join(dir, name), "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const header = lines[0].split("\t");
  const idx = {};
  header.forEach((h, i) => (idx[h] = i));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const get = (h) => (idx[h] == null ? "" : cols[idx[h]] || "");
    rows.push({ get, cols });
  }
  return { idx, rows };
}

const NP = {
  item_maxdamage_percent: 2,
  firemindam: 2,
  lightmindam: 2,
  magicmindam: 2,
  coldmindam: 3,
  poisonmindam: 3,
};

const mag = [];
const stats = tsv("ItemStatCost.txt");
for (const row of stats.rows) {
  const name = row.get("Stat");
  const id = Number(row.get("ID") || row.get("*ID"));
  if (!name || !Number.isFinite(id)) continue;
  const rec = {
    s: name,
    sB: Number(row.get("Save Bits") || 0),
    sA: Number(row.get("Save Add") || 0),
    sP: Number(row.get("Save Param Bits") || 0),
    e: Number(row.get("Encode") || 0),
    dF: Number(row.get("descfunc") || 0),
  };
  if (NP[name]) rec.np = NP[name];
  mag[id] = rec;
}

const items = {};
function addItems(file, kind) {
  const table = tsv(file);
  for (const row of table.rows) {
    const code = (row.get("code") || "").trim();
    if (!code || code === "Expansion") continue;
    const name = (row.get("name") || row.get("*name") || code).trim();
    const rec = {
      n: name,
      k: kind,
      w: Number(row.get("invwidth") || 1) || 1,
      h: Number(row.get("invheight") || 1) || 1,
    };
    if (Number(row.get("stackable") || 0)) rec.s = 1;
    if (Number(row.get("compactsave") || 0)) rec.c = 1;
    const quest = row.get("quest");
    if (quest && quest !== "0") rec.q = 1;
    items[code] = rec;
  }
}
addItems("Armor.txt", "a");
addItems("Weapons.txt", "w");
addItems("Misc.txt", "m");

const out = `(() => {
  "use strict";
  const MAG = ${JSON.stringify(mag)};
  const ITEMS = ${JSON.stringify(items)};
  const QUALITY = ["", "Low", "Normal", "Superior", "Magic", "Set", "Rare", "Unique", "Crafted"];
  const BODY = ["", "Helm", "Amulet", "Armor", "Weapon", "Shield", "Right Ring", "Left Ring", "Belt", "Boots", "Gloves", "Alt Weapon", "Alt Shield"];
  const LOC = ["Stored", "Equipped", "Belt", "Ground", "Cursor", "Unknown", "Socket"];
  const PANEL = ["None", "Inventory", "Unknown", "Unknown", "Cube", "Stash", "Shared"];
  const api = { MAG, ITEMS, QUALITY, BODY, LOC, PANEL };
  if (typeof window !== "undefined") window.SoEItemsDB = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
`;

const dest = path.join(dir, "..", "items-db.js");
fs.writeFileSync(dest, out);
const codes = Object.keys(items);
const magCount = mag.filter(Boolean).length;
console.log("wrote", dest, "bytes", out.length, "items", codes.length, "stats", magCount);
console.log("sample", items.cap, items.hp1, items.key, items.r01, items.tbk, items.gld, items.jew);
console.log("compact", codes.filter((c) => items[c].c).length, "stackable", codes.filter((c) => items[c].s).length, "quest", codes.filter((c) => items[c].q).length);
