"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const gvasSrc = fs.readFileSync(path.join(__dirname, "..", "gvas.js"), "utf8");
const sandbox = { window: {}, console, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer };
vm.runInNewContext(gvasSrc, sandbox);
const G = sandbox.window.E33Gvas;

const sav = fs.readFileSync(
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
);

const parsed = G.parseSave(sav);
console.log("baseline", {
  gold: parsed.gold,
  inv: parsed.inventory.length,
  weapons: parsed.weapons,
  attrs: parsed.characters[0] && parsed.characters[0].attributes,
  skills: parsed.characters[0] && {
    u: parsed.characters[0].skillsUnlocked.map((s) => s.name),
    e: parsed.characters[0].skillsEquipped.map((s) => s.name),
  },
  exploration: parsed.exploration,
  spawn: { map: parsed.mapToLoad, tag: parsed.spawnTag },
  pictos: parsed.pictos.length,
  tints: parsed.tintLevels,
});

const meta = G.locateInventoryMeta(sav);
console.log("inv meta", meta && { count: meta.count, size: meta.size, countAt: meta.countAt, sizeAt: meta.sizeAt });

let bytes = new Uint8Array(sav);
bytes = G.insertInventoryItem(bytes, "Consumable_Respec", 99).bytes;
bytes = G.insertInventoryItem(bytes, "UpgradeMaterial_Level1", 50).bytes;
bytes = G.ensureInventoryItem(bytes, "Consumable_LuminaPoint", 88).bytes;
if (parsed.weapons[0]) {
  bytes = G.writeWeaponLevel(bytes, parsed.weapons[0].levelAt, 10).bytes;
}
if (parsed.characters[0] && parsed.characters[0].attributes[0]) {
  bytes = G.writeAttribute(bytes, parsed.characters[0].attributes[0].valAt, 7).bytes;
}
bytes = G.setTintLevel(bytes, "Consumable_Health_Level", 2).bytes;

const again = G.parseSave(bytes);
console.log("after", {
  sizeDelta: again.size - parsed.size,
  inv: again.inventory.length,
  recoat: again.recoat,
  cat1: again.catalysts.level1,
  lumina: again.luminaPoints,
  weapon: again.weapons[0],
  attr0: again.characters[0].attributes[0],
  tintHealth: again.tintLevels.Consumable_Health_Level,
  gvas: again.ok,
});

if (again.recoat !== 99) throw new Error("recoat insert failed");
if (again.catalysts.level1 !== 50) throw new Error("catalyst insert failed");
if (again.luminaPoints !== 88) throw new Error("lumina write failed");
if (again.weapons[0].level !== 10) throw new Error("weapon level failed");
if (again.characters[0].attributes[0].value !== 7) throw new Error("attr failed");
if (again.tintLevels.Consumable_Health_Level.level !== 2) throw new Error("tint level failed");
if (again.inventory.length !== parsed.inventory.length + 2) throw new Error("inv count mismatch");
console.log("SMOKE ALL OK");
