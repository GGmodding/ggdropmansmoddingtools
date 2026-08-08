/**
 * Build items-db.js from Last Epoch Tools itemDB bundle (vm eval).
 * Usage: node build-items-db.js [path/to/db.js]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = process.argv[2] || path.join(process.env.TEMP, "le-db.js");
const out = path.join(__dirname, "items-db.js");

const BASE_TYPE_NAMES = {
  0: "Helmet",
  1: "Body Armor",
  2: "Gloves",
  3: "Boots",
  4: "Belt",
  5: "One-Handed Sword",
  6: "One-Handed Axe",
  7: "One-Handed Mace",
  8: "Dagger",
  9: "Scepter",
  10: "Wand",
  12: "Two-Handed Sword",
  13: "Two-Handed Axe",
  14: "Two-Handed Mace",
  15: "Staff",
  16: "Spear",
  17: "Bow",
  18: "Quiver",
  19: "Shield",
  20: "Ring",
  21: "Amulet",
  22: "Relic",
  23: "Two-Handed Polearm",
  25: "Small Idol",
  26: "Small Idol",
  27: "Small Idol",
  28: "Small Idol",
  29: "Humble Idol",
  30: "Stout Idol",
  31: "Grand Idol",
  32: "Large Idol",
  33: "Ornate Idol",
  34: "Huge Idol",
  35: "Adorned Idol",
  41: "Altar",
  101: "Key / Material",
  102: "Rune / Material",
  103: "Glyph / Material",
  104: "Shard / Material",
  105: "Material",
  106: "Material",
  107: "Material",
  108: "Material",
};

const CONTAINERS = {
  1: "Inventory",
  2: "Helmet",
  3: "Body Armor",
  4: "Weapon 1",
  5: "Off-hand / Weapon 2",
  6: "Belt",
  7: "Gloves",
  8: "Boots",
  9: "Amulet",
  10: "Ring 1",
  11: "Ring 2",
  12: "Relic",
  29: "Idol panel",
  32: "Idols",
  33: "Blessing / Extra 33",
  34: "Blessing / Extra 34",
  35: "Blessing / Extra 35",
  82: "Blessing 1",
  83: "Blessing 2",
  84: "Blessing 3",
  85: "Blessing 4",
};

const RARITIES = {
  0: "Normal",
  1: "Magic",
  2: "Rare",
  3: "Exalted",
  4: "Unique",
  5: "Set",
  6: "Legendary",
  7: "Unique",
  8: "Set",
  9: "Legendary",
};

if (!fs.existsSync(src)) {
  console.error("Missing", src);
  process.exit(1);
}

const text = fs.readFileSync(src, "utf8");
const sandbox = { window: {} };
vm.runInNewContext(text, sandbox, { timeout: 15000 });
const db = sandbox.window.itemDB;
if (!db) {
  console.error("No window.itemDB");
  process.exit(1);
}

const bases = {};
function walk(o, d) {
  if (!o || typeof o !== "object" || d > 6) return;
  if (o.baseTypeId != null && o.subItems) {
    const id = Number(o.baseTypeId);
    const subs = {};
    for (const [sk, sv] of Object.entries(o.subItems)) {
      if (!sv || typeof sv !== "object") continue;
      const sid = Number(sv.subTypeId != null ? sv.subTypeId : sk);
      subs[sid] = {
        i: sv.sprite || null,
        lvl: Number(sv.levelRequirement) || 0,
      };
    }
    bases[id] = {
      n: BASE_TYPE_NAMES[id] || "Type " + id,
      subs,
    };
  }
  for (const v of Object.values(o)) walk(v, d + 1);
}
walk(db.itemList, 0);

const uniques = {};
const ul = (db.uniqueList && db.uniqueList.uniques) || {};
for (const [k, v] of Object.entries(ul)) {
  if (!v || typeof v !== "object") continue;
  const id = Number(v.uniqueId != null ? v.uniqueId : k);
  uniques[id] = {
    i: v.sprite || null,
    base: v.baseTypeId,
    set: !!v.isSetItem,
  };
}

const payload = { bases, uniques, containers: CONTAINERS, rarities: RARITIES };

const file = `(() => {
  "use strict";
  const DB = ${JSON.stringify(payload)};

  function containerName(id) {
    return DB.containers[id] || ("Container " + id);
  }

  function rarityName(id) {
    if (id == null) return "—";
    return DB.rarities[id] || ("Rarity " + id);
  }

  function baseName(id) {
    if (id == null) return "—";
    return (DB.bases[id] && DB.bases[id].n) || ("Type " + id);
  }

  function decodeItemData(data) {
    if (!Array.isArray(data) || !data.length) {
      return {
        rarity: null,
        baseType: null,
        subType: null,
        uniqueId: null,
        label: "Empty",
        sprite: null,
        matched: false,
        packed: null,
      };
    }

    let rarity = Number(data[0]);
    let baseType = data.length > 1 ? Number(data[1]) : null;
    let subType = data.length > 2 ? Number(data[2]) : null;
    let uniqueId = null;
    let packed = null;

    if (window.LEItemCodec) {
      packed = window.LEItemCodec.unpackBestEffort(data);
      if (packed && (packed.layout === "classic" || packed.layout === "season")) {
        rarity = packed.quality;
        baseType = packed.baseType;
        subType = packed.subType;
        uniqueId = packed.uniqueId;
      } else if (packed && packed.uniqueId != null) {
        uniqueId = packed.uniqueId;
        const u = DB.uniques[uniqueId];
        if (u) baseType = u.base;
      }
    }

    if (
      uniqueId == null &&
      !(packed && (packed.layout === "classic" || packed.layout === "season")) &&
      data.length > 3 &&
      (rarity === 4 || rarity === 5 || rarity === 6 || rarity === 7 || rarity === 8 || rarity === 9)
    ) {
      uniqueId = Number(data[3]);
    }

    const base = baseType != null ? DB.bases[baseType] : null;
    const sub = base && subType != null ? base.subs[subType] : null;
    const unique = uniqueId != null ? DB.uniques[uniqueId] : null;
    const matched = !!(base || unique || (data.length <= 6));
    let label;
    if (unique) label = (unique.set ? "Set" : "Unique") + " #" + uniqueId + (base ? " (" + base.n + ")" : "");
    else if (base && sub) label = base.n + " · #" + subType;
    else if (base) label = base.n + (subType != null ? " · sub " + subType : "");
    else if (data.length <= 6) label = "Stack [" + data.join(", ") + "]";
    else label = "Item [" + data.slice(0, 5).join(", ") + "…]";
    const sprite = (unique && unique.i) || (sub && sub.i) || null;
    return { rarity, baseType, subType, uniqueId, label, sprite, matched, packed };
  }

  function spriteToItemIconClass(sprite) {
    if (!sprite || typeof sprite !== "string") return null;
    if (/^I\\d+$/i.test(sprite)) return "itemdb itemdb-" + sprite;
    return null;
  }

  function maxAffixRolls(data) {
    if (!Array.isArray(data) || data.length < 8) return 0;
    let n = 0;
    const set = (i) => {
      if (i < 0 || i >= data.length) return;
      if (typeof data[i] !== "number") return;
      if (data[i] === 255) return;
      data[i] = 255;
      n += 1;
    };

    if (data[0] >= 2 && data[0] !== 255 && data.length >= 12 && data[5] <= 3) {
      const count = Math.min(6, data[11] || 0);
      for (let a = 0; a < count; a++) set(12 + a * 3 + 2);
      return n;
    }

    if (data[0] === 0 || data[0] === 1) {
      set(4);
      set(5);
      set(6);
      const rarity = data[3];
      if (rarity === 7 || rarity === 8 || rarity === 9 || rarity === 4 || rarity === 5 || rarity === 6) {
        for (let i = 0; i < 8; i++) set(9 + i);
        return n;
      }
      const count = Math.min(6, data[8] || 0);
      for (let a = 0; a < count; a++) set(9 + a * 3 + 2);
      return n;
    }

    for (let i = Math.max(4, data.length - 24); i + 2 < data.length; i++) {
      const tier = data[i];
      const id = data[i + 1];
      if (tier >= 0 && tier <= 7 && id > 0 && id < 255) {
        set(i + 2);
        i += 2;
      }
    }
    return n;
  }

  window.LEItems = {
    DB,
    containerName,
    rarityName,
    baseName,
    decodeItemData,
    spriteToItemIconClass,
    maxAffixRolls,
  };
})();
`;

fs.writeFileSync(out, file);
console.log("Wrote", out, "bases", Object.keys(bases).length, "uniques", Object.keys(uniques).length, "bytes", file.length);
