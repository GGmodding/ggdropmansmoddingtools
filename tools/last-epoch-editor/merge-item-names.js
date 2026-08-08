/**
 * Merge LETools-localized names from le-names-export.json into items-db.js.
 * Refresh export: open lastepochtools.com/db/, resolve names via their zlcg helper,
 * then write window.__LE_EXPORT__ JSON to le-names-export.json.
 * Usage: node merge-item-names.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const namesPath = path.join(root, "le-names-export.json");
const dbPath = path.join(root, "items-db.js");

if (!fs.existsSync(namesPath)) {
  console.error("Missing", namesPath);
  process.exit(1);
}

const names = JSON.parse(fs.readFileSync(namesPath, "utf8"));
const ctx = { window: {} };
vm.runInContext(fs.readFileSync(dbPath, "utf8"), vm.createContext(ctx));
const DB = ctx.window.LEItems.DB;

let namedSubs = 0;
let namedUniques = 0;

for (const [bid, b] of Object.entries(names.bases || {})) {
  if (!DB.bases[bid]) DB.bases[bid] = { n: b.n, subs: {} };
  if (b.n) DB.bases[bid].n = b.n;
  DB.bases[bid].subs = DB.bases[bid].subs || {};
  for (const [sid, s] of Object.entries(b.subs || {})) {
    const cur = DB.bases[bid].subs[sid] || {};
    DB.bases[bid].subs[sid] = {
      n: s.n || cur.n || null,
      i: s.i != null ? s.i : cur.i || null,
      lvl: s.lvl != null ? s.lvl : cur.lvl || 0,
    };
    if (DB.bases[bid].subs[sid].n) namedSubs += 1;
  }
}

for (const [uid, u] of Object.entries(names.uniques || {})) {
  const cur = DB.uniques[uid] || {};
  DB.uniques[uid] = {
    n: u.n || cur.n || null,
    i: u.i != null ? u.i : cur.i || null,
    base: u.base != null ? u.base : cur.base,
    set: u.set != null ? !!u.set : !!cur.set,
  };
  if (DB.uniques[uid].n) namedUniques += 1;
}

// Rebuild items-db.js by patching the const DB = ... literal
const src = fs.readFileSync(dbPath, "utf8");
const start = src.indexOf("const DB = ");
const end = src.indexOf(";\n\n  function containerName", start);
if (start < 0 || end < 0) {
  console.error("Could not locate DB literal in items-db.js");
  process.exit(1);
}
const out = src.slice(0, start) + "const DB = " + JSON.stringify(DB) + src.slice(end);
fs.writeFileSync(dbPath, out);
console.log("Merged names into items-db.js — namedSubs", namedSubs, "namedUniques", namedUniques, "bytes", out.length);
