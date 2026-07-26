/**
 * Rebuild affixes-db.js with in-game names.
 * Names come from Musholic/LastEpochPlanner ModItem.json (affix title + mod text).
 * Meta (type/canRollOn/lvl) comes from LET itemDB when available.
 *
 * Usage:
 *   node build-affixes-db.js [path/to/le-db.js] [path/to/ModItem.json]
 * Downloads ModItem.json from GitHub if the second arg is omitted.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const https = require("https");

const out = path.join(__dirname, "affixes-db.js");
const leDbPath = process.argv[2] || path.join(process.env.TEMP || "", "le-db.js");
const modItemPath = process.argv[3] || path.join(__dirname, "_moditem.json");
const MODITEM_URL =
  "https://raw.githubusercontent.com/Musholic/LastEpochPlanner/dev/src/Data/ModItem.json";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error("HTTP " + res.statusCode + " for " + url));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

async function loadModItem() {
  if (fs.existsSync(modItemPath)) {
    return JSON.parse(fs.readFileSync(modItemPath, "utf8"));
  }
  console.log("Downloading ModItem.json…");
  const text = await fetchUrl(MODITEM_URL);
  fs.writeFileSync(modItemPath, text);
  return JSON.parse(text);
}

function loadLeAffixes() {
  const affixes = {};
  if (!fs.existsSync(leDbPath)) {
    console.warn("No LET db at", leDbPath, "— names only from ModItem");
    return affixes;
  }
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(leDbPath, "utf8"), sandbox, { timeout: 20000 });
  const db = sandbox.window.itemDB;
  if (!db || !db.affixList) return affixes;
  function add(a) {
    if (!a || a.affixId == null) return;
    affixes[a.affixId] = {
      t: Number(a.type) || 0,
      lvl: Number(a.levelRequirement) || 0,
      on: Array.isArray(a.canRollOn) ? a.canRollOn.map(Number) : [],
      g: Number(a.group) || 0,
    };
  }
  Object.values(db.affixList.singleAffixes || {}).forEach(add);
  Object.values(db.affixList.multiAffixes || {}).forEach(add);
  return affixes;
}

function namesFromModItem(modItem) {
  const byId = {};
  for (const [key, row] of Object.entries(modItem)) {
    if (!row || typeof row !== "object") continue;
    const m = /^(\d+)_(\d+)$/.exec(key);
    if (!m) continue;
    const id = Number(m[1]);
    const tier = Number(m[2]);
    const title = row.affix || "";
    const typeStr = row.type || "";
    const mods = [];
    for (const k of Object.keys(row)) {
      if (/^\d+$/.test(k) && typeof row[k] === "string") mods.push(row[k]);
    }
    const modText = (mods[0] || "").replace(/\{rounding:[^}]+\}/g, "").trim();
    if (!byId[id] || tier > (byId[id]._tier || -1)) {
      byId[id] = {
        n: title,
        desc: modText,
        typeStr,
        _tier: tier,
      };
    }
    if (!byId[id].n && title) byId[id].n = title;
  }
  for (const id of Object.keys(byId)) delete byId[id]._tier;
  return byId;
}

async function main() {
  const meta = loadLeAffixes();
  const modItem = await loadModItem();
  const names = namesFromModItem(modItem);

  const affixes = {};
  const ids = new Set([
    ...Object.keys(meta).map(Number),
    ...Object.keys(names).map(Number),
  ]);

  for (const id of [...ids].sort((a, b) => a - b)) {
    const m = meta[id] || {};
    const n = names[id] || {};
    let t = m.t;
    if (t == null) {
      if (n.typeStr === "Suffix") t = 1;
      else if (n.typeStr === "Prefix") t = 0;
      else t = 0;
    }
    affixes[id] = {
      t,
      lvl: m.lvl || 0,
      on: m.on || [],
      g: m.g || 0,
      n: n.n || "",
      d: n.desc || "",
    };
  }

  const named = Object.values(affixes).filter((a) => a.n).length;
  const body = `(() => {
  "use strict";
  const AFFIXES = ${JSON.stringify(affixes)};

  function affixName(id) {
    const a = AFFIXES[id];
    if (!a) return "Affix #" + id;
    const kind = a.t === 1 ? "Suffix" : "Prefix";
    if (a.n) return a.n + " (" + kind + ")";
    return kind + " #" + id;
  }

  function affixDetail(id) {
    const a = AFFIXES[id];
    if (!a) return affixName(id);
    const base = affixName(id);
    return a.d ? base + " — " + a.d : base;
  }

  function affixType(id) {
    const a = AFFIXES[id];
    return a ? a.t : null;
  }

  function listAffixes(opts) {
    const q = ((opts && opts.q) || "").toLowerCase();
    const type = opts && opts.type;
    const baseType = opts && opts.baseType;
    return Object.keys(AFFIXES)
      .map(Number)
      .sort((a, b) => a - b)
      .filter((id) => {
        const a = AFFIXES[id];
        if (type != null && a.t !== Number(type)) return false;
        if (baseType != null && a.on.length && !a.on.includes(Number(baseType))) return false;
        if (!q) return true;
        const hay = [affixName(id), a.d || "", String(id)].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .map((id) => ({ id, name: affixName(id), detail: affixDetail(id), ...AFFIXES[id] }));
  }

  window.LEAffixes = { AFFIXES, affixName, affixDetail, affixType, listAffixes };
})();
`;

  fs.writeFileSync(out, body);
  console.log(
    "Wrote",
    out,
    Object.keys(affixes).length,
    "affixes,",
    named,
    "with names,",
    Math.round(body.length / 1024) + "KB"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
