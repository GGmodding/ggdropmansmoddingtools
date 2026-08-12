"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Load gvas.js as IIFE and capture exports
const src = fs.readFileSync(path.join(__dirname, "../gvas.js"), "utf8");
const sandbox = { console, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer };
vm.createContext(sandbox);
// gvas attaches to window or self — shim
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.runInContext(src, sandbox);
const G = sandbox.E33Gvas || sandbox.window.E33Gvas;
if (!G) {
  console.log("keys", Object.keys(sandbox).filter((k) => /E33|Gvas/i.test(k)));
  process.exit(1);
}

const buf = new Uint8Array(
  fs.readFileSync(
    "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
  )
);
const chars = G.parseCharacters(buf);
for (const c of chars) {
  console.log("---", c.name, "nameAt", c.nameAt, "lvl", c.level, "xp", c.xp, "ap", c.actionPoints);
  console.log(
    "  attrs",
    c.attributes.map((a) => a.index + "=" + a.value + "@" + a.valAt).join(", ")
  );
  console.log("  unlock", c.skillsUnlocked.map((s) => s.name).join(", ") || "—");
  console.log("  equip", c.skillsEquipped.map((s) => s.name).join(", ") || "—");
}

// Write Lune first attr +1 and verify
const lune = chars.find((c) => c.name === "Lune");
if (!lune || !lune.attributes.length) {
  console.error("FAIL: Lune missing attributes");
  process.exit(1);
}
const a0 = lune.attributes[0];
const next = a0.value + 1;
const written = G.writeAttribute(buf, a0.valAt, next);
const chars2 = G.parseCharacters(written.bytes);
const lune2 = chars2.find((c) => c.name === "Lune");
const a0b = lune2.attributes.find((a) => a.valAt === a0.valAt);
const frey2 = chars2.find((c) => c.name === "Frey");
console.log("write check: Lune attr", a0.index, a0.value, "->", a0b && a0b.value);
console.log(
  "Frey attrs unchanged?",
  frey2.attributes.map((a) => a.index + "=" + a.value).join(", ")
);
if (!a0b || a0b.value !== next) {
  console.error("FAIL write");
  process.exit(1);
}
console.log("OK");
