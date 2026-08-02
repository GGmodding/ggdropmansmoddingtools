const fs = require("fs");
const path = require("path");
const root = __dirname;
const buildings = fs
  .readFileSync(path.join(root, "_building_catalog.inc.js"), "utf8")
  .replace(/^const BUILDING_CATALOG = /, "")
  .replace(/;\s*$/, "");
const purchases = fs
  .readFileSync(path.join(root, "_purchase_catalog.inc.js"), "utf8")
  .replace(/^const PURCHASE_CATALOG_FULL = /, "")
  .replace(/;\s*$/, "");
let prog = fs.readFileSync(path.join(root, "progress.js"), "utf8");
const start = prog.indexOf("/** Harvested from a late-game PREMIX slot");
const end = prog.indexOf("const KNOWLEDGE_BULK");
if (start < 0 || end < 0) throw new Error("anchors missing");
prog =
  prog.slice(0, start) +
  "/** Harvested from a late-game PREMIX slot — used as unlock catalogs. */\n  const PURCHASE_CATALOG = " +
  purchases +
  ";\n  const BUILDING_CATALOG = " +
  buildings +
  ";\n\n  " +
  prog.slice(end);
prog = prog.replace(
  "const catalog = catalogNames && catalogNames.length ? catalogNames : [...have];",
  "const catalog = catalogNames && catalogNames.length ? catalogNames : BUILDING_CATALOG;"
);
if (!prog.includes("BUILDING_CATALOG,")) {
  prog = prog.replace(
    "PURCHASE_CATALOG,\n    KNOWLEDGE_BULK,",
    "PURCHASE_CATALOG,\n    BUILDING_CATALOG,\n    KNOWLEDGE_BULK,"
  );
}
fs.writeFileSync(path.join(root, "progress.js"), prog);
console.log("patched", prog.includes('"LeanTo"'), prog.includes("Scarecrow"));
