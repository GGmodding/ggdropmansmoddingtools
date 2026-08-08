/**
 * Merge LETools classRequirement flags into items-db.js subtype entries (`cr`).
 * Usage: node merge-class-req.js [path/to/le-class-req-export.json]
 *
 * Flag mapping from save characterClass → subtype cr bit:
 *   Mage(0)=2, Primalist(1)=1, Sentinel(2)=4, Acolyte(3)=8, Rogue(4)=16
 * (LETools enum swaps Mage/Primalist relative to save IDs.)
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const namesPath = process.argv[2] || path.join(root, "le-class-req-export.json");
const dbPath = path.join(root, "items-db.js");

if (!fs.existsSync(namesPath)) {
  console.error("Missing", namesPath);
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(namesPath, "utf8"));
const ctx = { window: {} };
vm.runInContext(fs.readFileSync(dbPath, "utf8"), vm.createContext(ctx));
const DB = ctx.window.LEItems.DB;

let n = 0;
for (const [bid, subs] of Object.entries(map)) {
  if (!DB.bases[bid]) continue;
  for (const [sid, cr] of Object.entries(subs)) {
    if (!DB.bases[bid].subs[sid]) continue;
    DB.bases[bid].subs[sid].cr = Number(cr) || 0;
    n += 1;
  }
}

const src = fs.readFileSync(dbPath, "utf8");
const start = src.indexOf("const DB = ");
const end = src.indexOf(";\n\n  function containerName", start);
if (start < 0 || end < 0) {
  console.error("Could not locate DB literal");
  process.exit(1);
}
const out = src.slice(0, start) + "const DB = " + JSON.stringify(DB) + src.slice(end);
fs.writeFileSync(dbPath, out);
console.log("Merged classRequirement into", n, "subs");
