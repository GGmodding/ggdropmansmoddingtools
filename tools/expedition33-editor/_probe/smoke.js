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
console.log({
  ok: parsed.ok,
  gold: parsed.gold,
  map: parsed.mapToLoad,
  time: Math.round(parsed.timePlayed),
  chars: parsed.characters.map((c) => ({
    name: c.name,
    level: c.level,
    xp: c.xp,
    ap: c.actionPoints,
    lumina: c.lumina,
  })),
  invCount: parsed.inventory.length,
  luminaBag: parsed.luminaPoints,
  healing: parsed.healingTint,
});

let bytes = new Uint8Array(sav);
bytes = G.writeIntProperty(bytes, "Gold", 7777).bytes;
bytes = G.writeInventoryItem(bytes, "Consumable_LuminaPoint", 42).bytes;
if (parsed.characters[0] && parsed.characters[0].levelAt != null) {
  bytes = G.writeCharacterField(bytes, parsed.characters[0].levelAt, 12).bytes;
}
const again = G.parseSave(bytes);
console.log("after write", {
  gold: again.gold,
  lumina: again.luminaPoints,
  level: again.characters[0] && again.characters[0].level,
  sizeSame: again.size === parsed.size,
});

if (again.gold !== 7777) throw new Error("gold write failed");
if (again.luminaPoints !== 42) throw new Error("lumina write failed");
if (again.characters[0].level !== 12) throw new Error("level write failed");
if (again.size !== parsed.size) throw new Error("size changed");
console.log("SMOKE OK");
