"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(
  path.join(__dirname, "../gvas.js"),
  "utf8"
);
const sandbox = { console, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const G = sandbox.E33Gvas;

const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";

function analyze(label, filePath) {
  const raw = fs.readFileSync(filePath);
  const buf = new Uint8Array(raw);
  console.log("\n====", label, path.basename(filePath), "size", buf.length);
  console.log("GVAS?", String.fromCharCode(buf[0], buf[1], buf[2], buf[3]));
  try {
    const ok = G.isExpeditionSave(buf);
    console.log("isExpeditionSave", ok);
    const p = G.parseSave(buf);
    console.log({
      gold: p.gold,
      chars: p.characters.map((c) => c.name + " L" + c.level + " attrs=" + c.attributes.length),
      weapons: p.weapons.length,
      pictos: p.pictos.length,
      inv: p.inventory.length,
      map: p.mapToLoad,
    });
    // Check WP/PEP meta counts
    function meta(name, prop) {
      const hits = [];
      // use locate via unlock helpers indirectly
      const arrHits = [];
      const enc = Buffer.from(name + "\0");
      const b = Buffer.from(buf);
      for (let i = 4; i < b.length - enc.length; i++) {
        if (b.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
        if (b.readUInt32LE(i - 4) !== enc.length) continue;
        arrHits.push(i);
      }
      console.log(name, "hits", arrHits);
    }
    meta("WeaponProgressions");
    meta("PassiveEffectsProgressions");
    meta("InventoryItems");

    // Validate inventory meta count matches
    const inv = G.parseInventory(buf);
    const loc = G.locateInventoryMeta(buf);
    if (loc) {
      console.log("inv meta", { count: loc.count, items: loc.items.length, size: loc.size });
      if (loc.count !== loc.items.length) console.log("!! INV COUNT MISMATCH");
    } else console.log("!! no inv meta");

    // WP count vs defs
    const wp = p.weapons;
    console.log("weapons sample", wp.slice(0, 5).map((w) => w.name + "@" + w.level));
    console.log("pictos", p.pictos.map((x) => x.name + (x.learnt ? "*" : "")));
  } catch (e) {
    console.log("PARSE ERROR", e.stack || e);
  }
}

analyze("CURRENT", path.join(DIR, "EXPEDITION_0.sav"));
analyze("BACKUP_LATEST", path.join(DIR, "Backup/EXPEDITION_0_2026_8_11_0_4_43.sav"));
analyze("BACKUP_PREV", path.join(DIR, "Backup/EXPEDITION_0_2026_8_10_23_55_47.sav"));
