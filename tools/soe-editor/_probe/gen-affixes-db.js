const fs = require("fs");
const path = require("path");
const { encodeUnique, tsv } = require("./gen-items-db.js");

const dir = __dirname;

function wrapAffix(row) {
  const map = {
    prop1: "mod1code",
    par1: "mod1param",
    min1: "mod1min",
    max1: "mod1max",
    prop2: "mod2code",
    par2: "mod2param",
    min2: "mod2min",
    max2: "mod2max",
    prop3: "mod3code",
    par3: "mod3param",
    min3: "mod3min",
    max3: "mod3max",
  };
  return { get: (h) => row.get(map[h] || h) };
}

function typeList(row, key, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = (row.get(key + i) || "").trim();
    if (t) out.push(t);
  }
  return out;
}

const ALIAS = {
  cast1: "fcr",
  cast2: "fcr",
  cast3: "fcr",
  swing1: "ias",
  swing2: "ias",
  swing3: "ias",
  move1: "frw",
  move2: "frw",
  move3: "frw",
  hp: "life",
  "mag%": "mf magic find",
  "gold%": "gf gold find",
  "res-all": "allres all res",
  lifesteal: "ll leech",
  manasteal: "ml leech",
  balance1: "fhr",
  balance2: "fhr",
  balance3: "fhr",
};

function readAffixes(file) {
  const table = tsv(file);
  const list = [];
  let skipped = 0;
  table.rows.forEach((row, idx) => {
    const name = (row.get("Name") || row.get("name") || "").trim();
    if (!name) return;
    const enc = encodeUnique(wrapAffix(row));
    skipped += enc.skipped.length;
    const rec = {
      i: idx + 1,
      n: name,
      m: enc.mods.map((m) => ({ id: m.id, v: m.v })),
    };
    const group = Number(row.get("group") || 0);
    if (group) rec.g = group;
    const level = Number(row.get("level") || 0);
    if (level) rec.l = level;
    const itype = typeList(row, "itype", 7);
    if (itype.length) rec.t = itype;
    const etype = typeList(row, "etype", 5);
    if (etype.length) rec.e = etype;
    const mods = [];
    for (let i = 1; i <= 3; i++) {
      const code = (row.get("mod" + i + "code") || "").trim();
      if (code) mods.push(code);
    }
    rec.s = [name, ...mods, ...mods.map((c) => ALIAS[c] || "")]
      .join(" ")
      .toLowerCase();
    list.push(rec);
  });
  return { list, skipped };
}

function readNames(file) {
  const names = [""];
  for (const row of tsv(file).rows) {
    names.push((row.get("name") || "").trim());
  }
  return names;
}

const prefixes = readAffixes("MagicPrefix.txt");
const suffixes = readAffixes("MagicSuffix.txt");

const types = {};
for (const row of tsv("ItemTypes.txt").rows) {
  const code = (row.get("Code") || "").trim();
  if (!code) continue;
  const eq = [(row.get("Equiv1") || "").trim(), (row.get("Equiv2") || "").trim()].filter(Boolean);
  types[code] = eq;
}

const itemt = {};
for (const file of ["Armor.txt", "Weapons.txt", "Misc.txt"]) {
  for (const row of tsv(file).rows) {
    const code = (row.get("code") || "").trim();
    if (!code || code === "Expansion") continue;
    const t = [(row.get("type") || "").trim(), (row.get("type2") || "").trim()].filter(Boolean);
    if (t.length) itemt[code] = t;
  }
}

const api = {
  PREFIX: prefixes.list,
  SUFFIX: suffixes.list,
  RARE_P: readNames("RarePrefix.txt"),
  RARE_S: readNames("RareSuffix.txt"),
  TYPES: types,
  ITEMT: itemt,
};

const out = `(() => {
  "use strict";
  const api = ${JSON.stringify(api)};
  if (typeof window !== "undefined") window.SoEAffixes = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
`;

const dest = path.join(dir, "..", "affixes-db.js");
fs.writeFileSync(dest, out);
const whale = suffixes.list.filter((a) => /whale/i.test(a.n));
const sturdy = prefixes.list.filter((a) => a.n === "Sturdy");
console.log(
  "wrote",
  dest,
  "bytes",
  out.length,
  "prefixes",
  prefixes.list.length,
  "suffixes",
  suffixes.list.length,
  "types",
  Object.keys(types).length,
  "items",
  Object.keys(itemt).length,
  "skipP",
  prefixes.skipped,
  "skipS",
  suffixes.skipped
);
console.log("sturdy", JSON.stringify(sturdy.slice(0, 2)));
console.log("whale", JSON.stringify(whale.slice(0, 2)));
