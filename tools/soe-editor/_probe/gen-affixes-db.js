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

const skillById = {};
const skillByName = {};
for (const row of tsv("Skills.txt").rows) {
  const id = Number(row.get("Id"));
  const skill = (row.get("skill") || "").trim();
  if (!skill || !Number.isFinite(id)) continue;
  skillById[id] = skill;
  skillByName[skill.toLowerCase()] = skill;
}

function skillName(par) {
  const s = String(par || "").trim();
  if (!s) return "Skill";
  if (/^-?\d+$/.test(s)) return skillById[Number(s)] || "Skill " + s;
  return skillByName[s.toLowerCase()] || s;
}

const SKILL_TABS = [
  "Bow and Crossbow Skills",
  "Passive and Magic Skills",
  "Javelin and Spear Skills",
  "Fire Skills",
  "Lightning Skills",
  "Cold Skills",
  "Curses",
  "Poison and Bone Skills",
  "Summoning Skills",
  "Combat Skills",
  "Offensive Auras",
  "Defensive Auras",
  "Combat Skills",
  "Combat Masteries",
  "Warcries",
  "Summoning Skills",
  "Shape Shifting Skills",
  "Elemental Skills",
  "Traps",
  "Shadow Disciplines",
  "Martial Arts",
];

const CLASS_SKILL = {
  ama: "Amazon Skill Levels",
  sor: "Sorceress Skill Levels",
  nec: "Necromancer Skill Levels",
  pal: "Paladin Skill Levels",
  bar: "Barbarian Skill Levels",
  dru: "Druid Skill Levels",
  ass: "Assassin Skill Levels",
};

function nnum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function span(min, max) {
  const a = nnum(min);
  const b = nnum(max);
  if (a == null && b == null) return "";
  if (a == null || a === b) return String(b != null ? b : a);
  if (b == null) return String(a);
  return a + "-" + b;
}

function signed(min, max, pct) {
  const a = nnum(min);
  const b = nnum(max);
  if (a == null && b == null) return "";
  const lo = a != null ? a : b;
  const hi = b != null ? b : a;
  const neg = lo < 0 && hi <= 0;
  const body = lo === hi ? String(Math.abs(lo)) : Math.abs(lo) + "-" + Math.abs(hi);
  return (neg ? "-" : "+") + body + (pct ? "%" : "");
}

function toStat(min, max, text, pct) {
  return signed(min, max, pct) + " " + text;
}

function describeProp(code, par, min, max) {
  const c = String(code || "").trim();
  if (!c) return "";
  if (CLASS_SKILL[c]) return toStat(min, max, "to " + CLASS_SKILL[c]);
  if (c === "allskills") return toStat(min, max, "to All Skills");
  if (c === "skill" || c === "oskill") return toStat(min, max, "to " + skillName(par));
  if (c === "skilltab") {
    const tab = nnum(par) || 0;
    return toStat(min, max, "to " + (SKILL_TABS[tab] || "Skill Tab " + tab));
  }
  if (c === "charged") return "Level " + span(min, max) + " " + skillName(par) + " Charges";
  if (c === "hit-skill") return signed(min, max, true) + " Chance to Cast " + skillName(par) + " on Striking";
  if (c === "att-skill") return signed(min, max, true) + " Chance to Cast " + skillName(par) + " on Attack";
  if (c === "gethit-skill") return signed(min, max, true) + " Chance to Cast " + skillName(par) + " when Struck";
  const plusTo = {
    hp: "to Life",
    mana: "to Mana",
    stam: "to Stamina",
    str: "to Strength",
    dex: "to Dexterity",
    vit: "to Vitality",
    enr: "to Energy",
    ac: "Defense",
    "ac-miss": "Defense vs Missile",
    att: "to Attack Rating",
    light: "to Light Radius",
    "mana-kill": "to Mana after each Kill",
    "heal-kill": "Life after each Kill",
    sock: "Sockets",
    "all-stats": "to all Attributes",
    "curse-effectiveness": "Curse Effectiveness",
    "cooldown-reduction": "Cooldown Reduction",
    "inc-splash-radius": "Melee Splash Radius",
  };
  if (plusTo[c]) return toStat(min, max, plusTo[c], c === "curse-effectiveness" || c === "cooldown-reduction" || c === "inc-splash-radius");
  const plusPct = {
    "ac%": "Enhanced Defense",
    "dmg%": "Enhanced Damage",
    "hp%": "to Life",
    "mana%": "to Mana",
    "dur%": "Enhanced Durability",
    swing1: "Increased Attack Speed",
    swing2: "Increased Attack Speed",
    swing3: "Increased Attack Speed",
    cast1: "Faster Cast Rate",
    cast2: "Faster Cast Rate",
    cast3: "Faster Cast Rate",
    move1: "Faster Run/Walk",
    move2: "Faster Run/Walk",
    move3: "Faster Run/Walk",
    balance1: "Faster Hit Recovery",
    balance2: "Faster Hit Recovery",
    balance3: "Faster Hit Recovery",
    block1: "Faster Block Rate",
    block2: "Faster Block Rate",
    block3: "Faster Block Rate",
    "mag%": "Better Chance of Getting Magic Items",
    "gold%": "Extra Gold from Monsters",
    lifesteal: "Life Stolen per Hit",
    manasteal: "Mana Stolen per Hit",
    "att%": "Bonus to Attack Rating",
    crush: "Chance of Crushing Blow",
    deadly: "Deadly Strike",
    openwounds: "Chance of Open Wounds",
    pierce: "Chance to Pierce",
    block: "Increased Chance of Blocking",
    "red-dmg%": "Damage Reduced",
    "dmg-to-mana": "Damage Taken Goes to Mana",
    "regen-mana": "Faster Mana Regeneration",
    "regen-stam": "Heal Stamina Plus",
    "res-pois-len": "Poison Length Reduced",
    "reduce-ac": "Target Defense",
    ease: "Requirements",
    "pierce-fire": "to Enemy Fire Resistance",
    "pierce-ltng": "to Enemy Lightning Resistance",
    "pierce-cold": "to Enemy Cold Resistance",
    "pierce-pois": "to Enemy Poison Resistance",
    "extra-fire": "to Fire Skill Damage",
    "extra-ltng": "to Lightning Skill Damage",
    "extra-cold": "to Cold Skill Damage",
    "extra-pois": "to Poison Skill Damage",
  };
  if (plusPct[c]) return toStat(min, max, plusPct[c], true);
  const resist = {
    "res-fire": "Fire Resist",
    "res-ltng": "Lightning Resist",
    "res-cold": "Cold Resist",
    "res-pois": "Poison Resist",
    "res-mag": "Magic Resist",
    "res-all": "All Resistances",
    "res-fire-max": "Maximum Fire Resist",
    "res-ltng-max": "Maximum Lightning Resist",
    "res-cold-max": "Maximum Cold Resist",
    "res-pois-max": "Maximum Poison Resist",
    "res-all-max": "Maximum All Resist",
  };
  if (resist[c]) return resist[c] + " " + signed(min, max, true);
  if (c === "red-dmg") return "Damage Reduced by " + span(min, max);
  if (c === "red-mag") return "Magic Damage Reduced by " + span(min, max);
  if (c === "regen") return "Replenish Life +" + span(min, max);
  if (c === "thorns") return "Attacker Takes Damage of " + span(min, max);
  if (c === "dmg") return "+" + span(min, max) + " to Damage";
  if (c === "dur") return "+" + span(min, max) + " Durability";
  if (c === "nofreeze") return "Cannot Be Frozen";
  if (c === "half-freeze") return "Half Freeze Duration";
  if (c === "ignore-ac") return "Ignores Target's Defense";
  if (c === "noheal") return "Prevent Monster Heal";
  if (c === "knock") return "Knockback";
  if (c === "indestruct") return "Indestructible";
  if (c === "ethereal") return "Ethereal";
  if (c === "splash") return "Melee Attacks Deal Splash Damage";
  const v = span(min, max);
  return v ? c + " " + v : c;
}

function takeCode(slots, used, code) {
  const i = slots.findIndex((s, idx) => !used.has(idx) && s.code === code);
  if (i < 0) return null;
  used.add(i);
  return slots[i];
}

function describeMods(slots) {
  const used = new Set();
  const lines = [];
  const pairs = [
    ["fire-min", "fire-max", "Fire Damage"],
    ["ltng-min", "ltng-max", "Lightning Damage"],
    ["cold-min", "cold-max", "Cold Damage"],
    ["pois-min", "pois-max", "Poison Damage"],
    ["dmg-min", "dmg-max", "Damage"],
  ];
  for (const [minCode, maxCode, label] of pairs) {
    const mn = takeCode(slots, used, minCode);
    const mx = takeCode(slots, used, maxCode);
    if (minCode === "cold-min") takeCode(slots, used, "cold-len");
    if (minCode === "pois-min") takeCode(slots, used, "pois-len");
    if (!mn && !mx) continue;
    const lo = (mn || mx).min;
    const hi = (mx || mn).max;
    lines.push("Adds " + span(lo, hi) + " " + label);
  }
  for (let i = 0; i < slots.length; i++) {
    if (used.has(i)) continue;
    const line = describeProp(slots[i].code, slots[i].par, slots[i].min, slots[i].max);
    if (line) lines.push(line);
  }
  return lines.join(" · ");
}

function readAffixes(file) {
  const table = tsv(file);
  const list = [];
  let skipped = 0;
  table.rows.forEach((row, idx) => {
    const name = (row.get("Name") || row.get("name") || "").trim();
    if (!name) return;
    const enc = encodeUnique(wrapAffix(row));
    skipped += enc.skipped.length;
    const commentRaw = String(row.get("*comment") || "").trim();
    const comment = Number(commentRaw);
    const rec = {
      i: commentRaw !== "" && Number.isFinite(comment) && comment > 0 ? comment : idx + 1,
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
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const code = (row.get("mod" + i + "code") || "").trim();
      if (!code) continue;
      slots.push({
        code,
        par: (row.get("mod" + i + "param") || "").trim(),
        min: row.get("mod" + i + "min"),
        max: row.get("mod" + i + "max"),
      });
    }
    rec.d = describeMods(slots) || name;
    rec.s = [name, rec.d, ...slots.map((s) => s.code), ...slots.map((s) => ALIAS[s.code] || "")]
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
const automagic = fs.existsSync(path.join(dir, "AutoMagic.txt")) ? readAffixes("AutoMagic.txt") : { list: [], skipped: 0 };

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
  AUTO: automagic.list,
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
  "auto",
  automagic.list.length,
  "types",
  Object.keys(types).length,
  "items",
  Object.keys(itemt).length,
  "skipP",
  prefixes.skipped,
  "skipS",
  suffixes.skipped
);
console.log("sturdy", JSON.stringify(sturdy.slice(0, 2).map((a) => ({ n: a.n, d: a.d }))));
console.log("whale", JSON.stringify(whale.slice(0, 2).map((a) => ({ n: a.n, d: a.d }))));
