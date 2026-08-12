"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR =
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872";
const src = fs.readFileSync(path.join(__dirname, "../gvas.js"), "utf8");
const sandbox = { console, TextEncoder, TextDecoder, Uint8Array, DataView, ArrayBuffer };
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const G = sandbox.E33Gvas;

const cur = new Uint8Array(fs.readFileSync(path.join(DIR, "EXPEDITION_0.sav")));
const bak = new Uint8Array(
  fs.readFileSync(path.join(DIR, "Backup/EXPEDITION_0_2026_8_11_0_4_43.sav"))
);

function deepCheck(label, buf) {
  const p = G.parseSave(buf);
  console.log("\n" + label);
  // Character fields
  for (const c of p.characters) {
    console.log(c.name, {
      level: c.level,
      xp: c.xp,
      ap: c.actionPoints,
      lumina: c.lumina,
      excluded: c.excluded,
      attrs: c.attributes.map((a) => a.index + "=" + a.value),
      skillsU: c.skillsUnlocked.length,
      skillsE: c.skillsEquipped.length,
    });
  }
  // Spot-check inventory for nonsense values
  const badInv = p.inventory.filter(
    (i) => i.value < 0 || i.value > 1e9 || !/^[A-Za-z][A-Za-z0-9_+]*$/.test(i.key)
  );
  console.log("bad inv", badInv.slice(0, 10));
  // Weapon levels
  const hi = p.weapons.filter((w) => w.level > 33 || w.level < 1);
  console.log(
    "weapons",
    p.weapons.map((w) => w.name + "=" + w.level).join(", "),
    "bad",
    hi
  );
  // WP/PEP size+count consistency
  function arrayMeta(arrayName, entryProp) {
    const b = Buffer.from(buf);
    const enc = Buffer.from(arrayName + "\0");
    let nameAt = -1;
    for (let i = 4; i < b.length - enc.length; i++) {
      if (b.compare(enc, 0, enc.length, i, i + enc.length) !== 0) continue;
      if (b.readUInt32LE(i - 4) !== enc.length) continue;
      nameAt = i;
      break;
    }
    const penc = Buffer.from(entryProp + "\0");
    const entries = [];
    for (let i = nameAt; i < b.length - penc.length; i++) {
      if (b.compare(penc, 0, penc.length, i, i + penc.length) !== 0) continue;
      if (b.readUInt32LE(i - 4) !== penc.length) continue;
      // stop if we hit another top array
      if (arrayName === "WeaponProgressions" && i > nameAt + 50000) break;
      entries.push(i - 4);
      if (entries.length > 500) break;
    }
    // For WP, stop before PassiveEffects
    let filtered = entries;
    if (arrayName === "WeaponProgressions") {
      const pep = b.indexOf("PassiveEffectsProgressions");
      // find proper
      const pepEnc = Buffer.from("PassiveEffectsProgressions\0");
      let pepAt = Infinity;
      for (let i = 4; i < b.length - pepEnc.length; i++) {
        if (b.compare(pepEnc, 0, pepEnc.length, i, i + pepEnc.length) === 0 && b.readUInt32LE(i - 4) === pepEnc.length) {
          pepAt = i;
          break;
        }
      }
      const idEnc = Buffer.from("InteractedDialogues\0");
      let idAt = Infinity;
      for (let i = nameAt; i < b.length - idEnc.length; i++) {
        if (b.compare(idEnc, 0, idEnc.length, i, i + idEnc.length) === 0 && b.readUInt32LE(i - 4) === idEnc.length) {
          idAt = i;
          break;
        }
      }
      const end = Math.min(pepAt, idAt);
      filtered = entries.filter((e) => e < end);
    }
    if (!filtered.length) return console.log(arrayName, "no entries");
    const first = filtered[0];
    const count = b.readUInt32LE(first - 4);
    const size = b.readUInt32LE(first - 8);
    // measure payload
    const last = filtered[filtered.length - 1];
    const none = Buffer.from("\x05\x00\x00\x00None\x00");
    let endAt = -1;
    for (let i = last; i < Math.min(b.length, last + 400); i++) {
      if (b.compare(none, 0, none.length, i, i + none.length) === 0) {
        endAt = i + none.length;
        break;
      }
    }
    const measured = endAt > 0 ? endAt - first : -1;
    console.log(arrayName, {
      entryCount: filtered.length,
      countField: count,
      sizeField: size,
      measuredPayload: measured,
      matchCount: count === filtered.length,
      matchSize: size === measured,
    });
  }
  arrayMeta("WeaponProgressions", "DefinitionID_3_60EB24664894755B19F4EBA18A21AF1A");
  arrayMeta(
    "PassiveEffectsProgressions",
    "PassiveEffectName_3_A92DB6CC4549450728A867A714ADF6C5"
  );
}

deepCheck("CURRENT", cur);
deepCheck("BACKUP", bak);

// Compare gold / resources to port
const pc = G.parseSave(cur);
const pb = G.parseSave(bak);
console.log("\nDelta current vs backup:");
console.log("gold", pc.gold, "-> bak", pb.gold);
console.log("inv count", pc.inventory.length, pb.inventory.length);
const curKeys = new Set(pc.inventory.map((i) => i.key));
const bakKeys = new Set(pb.inventory.map((i) => i.key));
console.log(
  "only current inv",
  [...curKeys].filter((k) => !bakKeys.has(k))
);
console.log(
  "only backup inv",
  [...bakKeys].filter((k) => !curKeys.has(k))
);
