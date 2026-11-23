"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const savePath = path.join(
  process.env.LOCALAPPDATA,
  "MortalShell2",
  "Saved",
  "SaveGames",
  "WorldState_0.sav"
);
const gvasPath = path.join(__dirname, "..", "gvas.js");
const src = fs.readFileSync(gvasPath, "utf8");
const sandbox = { window: {}, Uint8Array, DataView, TextEncoder, TextDecoder, Number, BigInt, Math, String, Map, Set };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const G = sandbox.window.MortalShell2Gvas;

const bytes = new Uint8Array(fs.readFileSync(savePath));
const items = G.parseDropItems(bytes);
console.log("drop count", items.length);
for (const it of items) console.log(" ", it.short, it.amount, "at", it.amountAt);

const gold = items.find((it) => /ID_Gold/.test(it.path));
if (!gold) throw new Error("ID_Gold missing");
const next = gold.amount + 7;
const edited = G.writeDropItem(bytes, gold.path, next);
const again = G.parseDropItems(edited);
const gold2 = again.find((it) => /ID_Gold/.test(it.path));
console.log("gold", gold.amount, "->", gold2.amount, gold2.amount === next ? "OK" : "FAIL");
if (gold2.amount !== next) process.exit(1);

const curated = G.matchCurated(edited, [
  { id: "gold", label: "Gold", dropId: /ID_Gold/, keys: [] },
  { id: "cumGold", label: "Lifetime Gold", keys: ["CumulativeGold"], types: ["IntProperty"] },
  { id: "playtime", label: "Playtime", keys: ["TotalPlayTimeSeconds"], types: ["FloatProperty"] },
]);
console.log("curated", curated.map((r) => r.field.id + "=" + r.prop.value).join(", "));
if (curated.length < 2) process.exit(1);
console.log("write test passed (did not touch disk)");
