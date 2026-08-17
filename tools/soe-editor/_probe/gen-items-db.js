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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function hasNum(v) {
  return v != null && String(v).trim() !== "" && Number.isFinite(Number(v));
}
function pickVal(par, min, max) {
  if (hasNum(max)) return num(max);
  if (hasNum(min)) return num(min);
  if (hasNum(par)) return num(par);
  return 0;
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
const statId = {};
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
  const oB = Number(row.get("Save Bits S12") || 0);
  const oA = Number(row.get("Save Add S12") || 0);
  const oP = Number(row.get("Save Param Bits S12") || 0);
  if (oB !== rec.sB) rec.oB = oB;
  if (oA !== rec.sA) rec.oA = oA;
  if (oP !== rec.sP) rec.oP = oP;
  if (NP[name]) rec.np = NP[name];
  mag[id] = rec;
  statId[name] = id;
}

const leadOf = [];
for (let id = 0; id < mag.length; id++) {
  if (!mag[id] || leadOf[id] != null) continue;
  const np = mag[id].np || 1;
  for (let i = 0; i < np; i++) leadOf[id + i] = id;
}

function slotCount(prop) {
  if (!prop) return 0;
  let n = 0;
  if (prop.sP) {
    if (prop.dF === 14) n += 1;
    if (prop.e === 2 || prop.e === 3) n += 1;
    n += 1;
  }
  n += prop.e === 3 ? 2 : 1;
  return n;
}

function groupLen(leadId) {
  const first = mag[leadId];
  const np = (first && first.np) || 1;
  let n = 0;
  for (let i = 0; i < np; i++) n += slotCount(mag[leadId + i]);
  return n;
}

function valueIndex(leadId, statIdNum) {
  const first = mag[leadId];
  const np = (first && first.np) || 1;
  let n = 0;
  for (let i = 0; i < np; i++) {
    if (leadId + i === statIdNum) return n;
    n += slotCount(mag[leadId + i]);
  }
  return n;
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
    const maxac = Number(row.get("maxac") || 0);
    if (maxac) rec.ac = maxac;
    const dur = Number(row.get("durability") || 0);
    if (dur) rec.dur = dur;
    if (Number(row.get("nodurability") || 0)) rec.nd = 1;
    const gs = Number(row.get("gemsockets") || 0);
    if (gs) rec.gs = gs;
    items[code] = rec;
  }
}
addItems("Armor.txt", "a");
addItems("Weapons.txt", "w");
addItems("Misc.txt", "m");

function stubFromType(code, typeName) {
  const t = String(typeName || "").toLowerCase();
  const rec = { n: (typeName || code).trim() || code, k: "m", w: 1, h: 1 };
  if (/helm|hood|cap|mask|crown|circlet|tiara|diadem|antlers|visage|wolf|pelt|bonnet/.test(t)) {
    rec.k = "a"; rec.w = 2; rec.h = 2;
  } else if (/boot|greave|sabaton/.test(t)) {
    rec.k = "a"; rec.w = 2; rec.h = 2;
  } else if (/glove|gaunt|mitten/.test(t)) {
    rec.k = "a"; rec.w = 2; rec.h = 2;
  } else if (/belt|sash|wrap/.test(t)) {
    rec.k = "a"; rec.w = 2; rec.h = 1;
  } else if (/shield|ward|aegis|kite|targe|buckler|trophy/.test(t)) {
    rec.k = "a"; rec.w = 2; rec.h = 3;
  } else if (/armor|plate|mail|skin|robe|garb|leather|splint|chest/.test(t)) {
    rec.k = "a"; rec.w = 2; rec.h = 3;
  } else if (/charm/.test(t)) {
    rec.k = "m"; rec.w = 1; rec.h = 1;
  } else if (/map|soulstone|cairn|ascend/.test(t)) {
    rec.k = "m"; rec.w = 1; rec.h = 1;
  } else if (/quiver|arrow|bolt/.test(t)) {
    rec.k = "w"; rec.w = 1; rec.h = 3; rec.s = 1;
  } else if (/sword|axe|mace|club|wand|scepter|javelin|spear|pole|staff|bow|cross|claw|dagger|knife|orb/.test(t)) {
    rec.k = "w"; rec.w = 2; rec.h = 3;
  } else if (/ring|amulet|jewel/.test(t)) {
    rec.k = "m"; rec.w = 1; rec.h = 1;
  }
  return rec;
}

const props = {};
for (const row of tsv("Properties.txt").rows) {
  const code = (row.get("code") || "").trim();
  if (!code) continue;
  const funcs = [];
  for (let i = 1; i <= 7; i++) {
    const func = num(row.get("func" + i));
    const stat = (row.get("stat" + i) || "").trim();
    const val = row.get("val" + i);
    if (!func && !stat) continue;
    funcs.push({ func, stat, val });
  }
  props[code.toLowerCase()] = funcs;
}

const skills = {};
for (const row of tsv("Skills.txt").rows) {
  const id = Number(row.get("Id"));
  if (!Number.isFinite(id)) continue;
  const skill = (row.get("skill") || "").trim();
  const desc = (row.get("skilldesc") || "").trim();
  if (skill) skills[skill.toLowerCase()] = id;
  if (desc) skills[desc.toLowerCase()] = id;
}

function resolveSkill(par) {
  const s = String(par || "").trim();
  if (!s) return 0;
  if (/^-?\d+$/.test(s)) return Number(s);
  const id = skills[s.toLowerCase()];
  return id == null ? null : id;
}

function savable(statName) {
  const id = statId[statName];
  if (id == null || !mag[id] || !mag[id].sB) return false;
  return true;
}

function encodeUnique(row) {
  const mods = new Map();
  const flags = { sock: 0, eth: 0, ind: 0 };
  const skipped = [];

  function ensure(leadId) {
    if (!mods.has(leadId)) mods.set(leadId, { id: leadId, v: Array(groupLen(leadId)).fill(0) });
    return mods.get(leadId);
  }

  function setSlot(statName, slotOff, value) {
    if (!savable(statName)) {
      skipped.push(statName);
      return false;
    }
    const id = statId[statName];
    const lead = leadOf[id] != null ? leadOf[id] : id;
    const rec = ensure(lead);
    rec.v[valueIndex(lead, id) + slotOff] = value;
    return true;
  }

  function setValue(statName, value) {
    return setSlot(statName, 0, value);
  }

  function setParamValue(statName, values) {
    if (!savable(statName)) {
      skipped.push(statName);
      return false;
    }
    const id = statId[statName];
    const lead = leadOf[id] != null ? leadOf[id] : id;
    const rec = ensure(lead);
    const start = valueIndex(lead, id);
    for (let i = 0; i < values.length; i++) rec.v[start + i] = values[i];
    return true;
  }

  function applyFunc(fn, par, min, max) {
    let func = fn.func;
    const stat = fn.stat;
    if (func === 36 && stat === "item_addclassskills") func = 21;
    const vmin = hasNum(min) ? num(min) : pickVal(par, min, max);
    const vmax = pickVal(par, min, max);

    switch (func) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 8:
      case 9: {
        if (!stat) return;
        const rec = mag[statId[stat]];
        if (rec && rec.sP) {
          const skill = resolveSkill(par);
          if (skill == null) {
            skipped.push(stat + ":" + par);
            return;
          }
          setParamValue(stat, [hasNum(par) && !/^-?\d+$/.test(String(par).trim()) ? skill : hasNum(par) ? num(par) : num(fn.val), vmax]);
        } else {
          setValue(stat, vmax);
        }
        return;
      }
      case 5:
        setValue("mindamage", vmax);
        return;
      case 6:
        setValue("maxdamage", vmax);
        return;
      case 7:
        setParamValue("item_maxdamage_percent", [vmax, vmax]);
        return;
      case 10: {
        const tab = hasNum(par) ? num(par) : 0;
        setParamValue(stat || "item_addskill_tab", [tab % 3, Math.floor(tab / 3), vmax]);
        return;
      }
      case 11: {
        const skill = resolveSkill(par);
        if (skill == null) {
          skipped.push((stat || "hit-skill") + ":" + par);
          return;
        }
        setParamValue(stat, [vmax, skill, hasNum(min) ? num(min) : 100]);
        return;
      }
      case 14:
        flags.sock = Math.max(0, Math.min(6, vmax || vmin || num(par)));
        return;
      case 15:
        setValue(stat, hasNum(min) ? num(min) : vmax);
        return;
      case 16:
        setValue(stat, vmax);
        return;
      case 17:
        if (/length$/i.test(stat)) setValue(stat, hasNum(par) ? num(par) : vmax);
        else setValue(stat, vmax);
        return;
      case 19: {
        const skill = resolveSkill(par);
        if (skill == null) {
          skipped.push("charged:" + par);
          return;
        }
        const charges = hasNum(min) ? num(min) : vmax;
        const level = hasNum(max) ? num(max) : vmin;
        setParamValue(stat, [level, skill, charges, charges]);
        return;
      }
      case 20:
        flags.ind = 1;
        return;
      case 21: {
        const cls = hasNum(fn.val) ? num(fn.val) : hasNum(par) ? num(par) : 0;
        setParamValue(stat, [cls, vmax]);
        return;
      }
      case 22: {
        const skill = resolveSkill(par);
        if (skill == null) {
          skipped.push((stat || "skill") + ":" + par);
          return;
        }
        setParamValue(stat, [skill, vmax]);
        return;
      }
      case 23:
        flags.eth = 1;
        return;
      default:
        if (stat && savable(stat) && func) {
          const rec = mag[statId[stat]];
          if (rec && rec.sP) {
            const skill = resolveSkill(par);
            if (skill == null) skipped.push(stat + ":func" + func);
            else setParamValue(stat, [skill, vmax]);
          } else setValue(stat, vmax);
        } else if (func) skipped.push((stat || "?") + ":func" + func);
        return;
    }
  }

  for (let i = 1; i <= 12; i++) {
    const code = (row.get("prop" + i) || "").trim();
    if (!code) continue;
    const fns = props[code.toLowerCase()];
    if (!fns || !fns.length) {
      skipped.push(code);
      continue;
    }
    const par = row.get("par" + i);
    const min = row.get("min" + i);
    const max = row.get("max" + i);
    for (const fn of fns) applyFunc(fn, par, min, max);
  }

  const list = [...mods.values()].filter((m) => mag[m.id] && mag[m.id].sB);
  return { mods: list, flags, skipped };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { encodeUnique, tsv, items };
}

if (require.main !== module) return;

const uniques = [];
let skipPropCount = 0;
const stubbed = [];
const uniqueTable = tsv("UniqueItems.txt");
// UniqueItems.bin / save uniqueId skip the Expansion placeholder row.
// Counting it made every LoD unique off-by-one (Wraithflight spawned as Bonehew).
let expansionIdx = -1;
uniqueTable.rows.forEach((row, i) => {
  if ((row.get("index") || "").trim() === "Expansion") expansionIdx = i;
});
uniqueTable.rows.forEach((row, i) => {
  const name = (row.get("index") || "").trim();
  const code = (row.get("code") || "").trim();
  const enabled = row.get("enabled");
  if (!name || !code || enabled === "0") return;
  const id = expansionIdx >= 0 && i > expansionIdx ? i - 1 : i;
  if (!items[code]) {
    items[code] = stubFromType(code, row.get("*type") || name);
    stubbed.push(name + " [" + code + "]");
  }
  const enc = encodeUnique(row);
  skipPropCount += enc.skipped.length;
  const rec = { i: id, n: name, c: code, m: enc.mods };
  if (enc.flags.sock) rec.s = enc.flags.sock;
  if (enc.flags.eth) rec.e = 1;
  if (enc.flags.ind) rec.d = 1;
  uniques.push(rec);
});

const out = `(() => {
  "use strict";
  const MAG = ${JSON.stringify(mag)};
  const ITEMS = ${JSON.stringify(items)};
  const UNIQUES = ${JSON.stringify(uniques)};
  const QUALITY = ["", "Low", "Normal", "Superior", "Magic", "Set", "Rare", "Unique", "Crafted"];
  const BODY = ["", "Helm", "Amulet", "Armor", "Weapon", "Shield", "Right Ring", "Left Ring", "Belt", "Boots", "Gloves", "Alt Weapon", "Alt Shield"];
  const LOC = ["Stored", "Equipped", "Belt", "Ground", "Cursor", "Unknown", "Socket"];
  const PANEL = ["None", "Inventory", "Unknown", "Unknown", "Cube", "Stash", "Shared"];
  const api = { MAG, ITEMS, UNIQUES, QUALITY, BODY, LOC, PANEL };
  if (typeof window !== "undefined") window.SoEItemsDB = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
`;

const dest = path.join(dir, "..", "items-db.js");
fs.writeFileSync(dest, out);
const codes = Object.keys(items);
const magCount = mag.filter(Boolean).length;
const shako = uniques.find((u) => u.n === "Harlequin Crest");
const gnasher = uniques.find((u) => u.n === "The Gnasher");
const wraith = uniques.find((u) => u.n === "Wraithflight");
const bonehew = uniques.find((u) => u.n === "Bonehew");
console.log("wrote", dest, "bytes", out.length, "items", codes.length, "stats", magCount, "uniques", uniques.length, "skippedSlots", skipPropCount);
console.log("expansionIdx", expansionIdx, "wraith", wraith && wraith.i, "bonehew", bonehew && bonehew.i);
console.log("stubbed bases", stubbed.length, stubbed.slice(0, 20).join("; "));
console.log("sample", items.cap, items.uit, items.jew, items.r01);
console.log("gnasher", JSON.stringify(gnasher));
console.log("shako", JSON.stringify(shako));
console.log("compact", codes.filter((c) => items[c].c).length, "stackable", codes.filter((c) => items[c].s).length, "quest", codes.filter((c) => items[c].q).length);
