"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "../gvas.js"), "utf8");
const sandbox = { console, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const G = sandbox.E33Gvas;

const buf = new Uint8Array(
  fs.readFileSync(
    "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
  )
);
const ids = JSON.parse(fs.readFileSync(path.join(__dirname, "../picto-ids.json"), "utf8")).safe;

console.log("before pictos", G.parsePictos(buf).length, "weapons", G.parseWeapons(buf).length);

// small test first
const small = ["SweetKill", "FirstStrike", "Teamwork"];
let r = G.unlockAllPictos(buf, small, { master: true, level: 1, steps: 4 });
console.log("small", r);
let pictos = G.parsePictos(r.bytes);
for (const id of small) {
  const p = pictos.find((x) => x.name === id);
  const inv = G.findInventoryItem(r.bytes, id);
  const w = G.parseWeapons(r.bytes).find((x) => x.name === id);
  console.log(id, { p, inv: inv && inv.value, w });
}

console.log("full unlock…");
r = G.unlockAllPictos(buf, ids, { master: true, level: 1, steps: 4 });
console.log(r);
pictos = G.parsePictos(r.bytes);
const weapons = G.parseWeapons(r.bytes);
const inv = G.parseInventory(r.bytes).items;
const invSet = new Set(inv.map((i) => i.key));
const pepSet = new Set(pictos.map((p) => p.name));
const wpSet = new Set(weapons.map((w) => w.name));
let missingInv = 0,
  missingPep = 0,
  missingWp = 0,
  unmastered = 0;
for (const id of ids) {
  if (!invSet.has(id)) missingInv++;
  if (!pepSet.has(id)) missingPep++;
  if (!wpSet.has(id)) missingWp++;
  const p = pictos.find((x) => x.name === id);
  if (!p || !p.learnt || p.steps < 4) unmastered++;
}
console.log({
  sizeBefore: buf.length,
  sizeAfter: r.bytes.length,
  pictos: pictos.length,
  weapons: weapons.length,
  missingInv,
  missingPep,
  missingWp,
  unmastered,
});
if (missingInv || missingPep || missingWp || unmastered) process.exit(1);
console.log("OK");
