const fs = require("fs");
const path = require("path");
const Save = require("../d2s.js");
const Items = require("../items.js");
const { encodeUnique } = require("./gen-items-db.js");

function row(o) {
  return { get: (k) => (o[k] != null ? String(o[k]) : "") };
}

// D2 stores RunewordN as N+26 in the 12-bit name field (Ancient's Pledge / Runeword1 = 27).
function spawnRuneword(code, sockets, runes, runewordNum, props, place) {
  const enc = encodeUnique(row(props));
  if (enc.skipped.length) throw new Error(code + " skipped " + enc.skipped.join(", "));
  const item = Items.spawnItem(code, place, { sockets, version: 103, ilvl: 99 });
  for (const r of runes) {
    Items.insertSocketed(item, Items.spawnSimple(r, { x: 0, y: 0, location: 0, panel: 0 }));
  }
  item.runeword = 1;
  item.runewordId = runewordNum + 26;
  item.runewordPad = 5;
  item.runewordMods = enc.mods.map((m) => ({ id: m.id, values: (m.v || []).slice() }));
  item.identified = 1;
  Items.rewriteItem(item);
  Items.applyPlacement(item, place);
  if (item.parseError) throw new Error(code + " parseError " + item.parseError);
  if (!item.runeword) throw new Error(code + " missing runeword flag");
  if (item.runewordId !== runewordNum + 26) throw new Error(code + " id " + item.runewordId);
  return item;
}

const sample = path.join(process.env.USERPROFILE, "Documents", "Diablo II", "Saves", "GGminions.d2s");
const bak = path.join(process.env.USERPROFILE, "Documents", "Diablo II", "GGminions.before-dominion-phoenix2.d2s.bak");
const parsed = Save.parse(fs.readFileSync(sample));
parsed.items.player = (parsed.items.player || []).filter((it) => !(it.code === "r32" && it.location === 0 && it.panel === 0));
const bag = parsed.items.player;

const phoenixPlace = { x: 5, y: 0, location: 0, panel: 1, equipped: 0 };
const dominionPlace = { x: 7, y: 0, location: 0, panel: 1, equipped: 0 };

const phoenix = spawnRuneword("uit", 4, ["r26", "r26", "r28", "r31"], 103, {
  prop1: "dmg%", min1: 250, max1: 300,
  prop2: "ac-miss", min2: 350, max2: 400,
  prop3: "att-skill", par3: 225, min3: 33, max3: 40,
  prop4: "levelup-skill", par4: 46, min4: 100, max4: 40,
  prop5: "pierce-fire", min5: 28, max5: 28,
  prop6: "aura", par6: "Redemption", min6: 10, max6: 12,
}, phoenixPlace);
bag.push(phoenix);

const dominion = spawnRuneword("7bw", 2, ["r32", "r27"], 171, {
  prop1: "skill", par1: "Golem Mastery", min1: 2, max1: 3,
  prop2: "cast2", min2: 25, max2: 25,
  prop3: "red-dmg", min3: 5, max3: 7,
  prop4: "res-cold", min4: 30, max4: 30,
  prop5: "nec", min5: 2, max5: 2,
  prop6: "ac", min6: 300, max6: 450,
  prop7: "extra-golem", min7: 1, max7: 1,
}, dominionPlace);
bag.push(dominion);

fs.copyFileSync(sample, bak);
const out = Save.write(parsed);
fs.writeFileSync(sample, Buffer.from(out));
const again = Save.parse(fs.readFileSync(sample));
const found = (again.items.player || [])
  .filter((it) => it.runeword)
  .map((it) => ({
    name: Items.displayName(it),
    code: it.code,
    version: it.version,
    runewordId: it.runewordId,
    runewordPad: it.runewordPad,
    x: it.x,
    y: it.y,
    panel: it.panel,
    gems: (it.socketedItems || []).map((g) => g.code),
    err: it.parseError || null,
    rwMods: it.runewordMods,
    auras: Items.listAuras({ mods: it.runewordMods || [] }),
  }));
const cham = (again.items.player || []).filter((it) => it.code === "r32").map((it) => ({
  loc: it.location, panel: it.panel, x: it.x, y: it.y, parent: it.runeword,
}));
console.log(JSON.stringify({ verify: Save.verify(out), bak, found, cham, len: out.length, level: again.stats.level }, null, 2));
