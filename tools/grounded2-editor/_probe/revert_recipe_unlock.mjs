/**
 * Revert UnlockAllRecipes pollution in Grounded 2 World.csav ModeManager blob.
 * Clean template = AUTOSAVE-2 (pre-cheat). Patches AUTOSAVE-0 / AUTOSAVE-1.
 *
 * Close Grounded 2 before running. Steam Cloud may re-download if sync is on.
 */
import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "../csav.js"), "utf8"));
const C = window.GroundedCsav;

const SAVES = path.join(process.env.USERPROFILE, "Saved Games", "Grounded2");
const WORLD_ID = "402C68AC4570DB2584515CA31859C5D0";
const CLEAN = `(ID-${WORLD_ID})(AUTOSAVE-2)`;
const DIRTY = [`(ID-${WORLD_ID})(AUTOSAVE-0)`, `(ID-${WORLD_ID})(AUTOSAVE-1)`];
const NEEDLE = Buffer.from("/Script/Maine.SurvivalModeManagerComponent");
const PATCH_LEN = 56; // ModeManager custom/settings prefix (excludes trailing unique dword)

function modePayloadOff(buf) {
  const at = buf.indexOf(NEEDLE);
  if (at < 0) throw new Error("ModeManager not found");
  let o = at + NEEDLE.length + 1;
  const len = buf.readInt32LE(o);
  if (len > 1 && len < 80) o = o + 4 + len;
  return o;
}

function hex(buf, n) {
  return [...buf.subarray(0, n)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

async function loadWorld(slot) {
  const p = path.join(SAVES, slot, "World.csav");
  const csav = fs.readFileSync(p);
  const raw = Buffer.from(await C.decompressCsav(csav, oozDecompress));
  return { path: p, raw };
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(SAVES, `_backup_recipe_revert_${stamp}`);
fs.mkdirSync(backupRoot, { recursive: true });

const clean = await loadWorld(CLEAN);
const cleanOff = modePayloadOff(clean.raw);
const cleanPrefix = Buffer.from(clean.raw.subarray(cleanOff, cleanOff + PATCH_LEN));
console.log("clean template", CLEAN);
console.log(" ", hex(cleanPrefix, PATCH_LEN));

const dirtySig = Buffer.from([0x06, 0x04, 0x00, 0x0d]); // polluted ModeManager head seen live

for (const slot of DIRTY) {
  const w = await loadWorld(slot);
  const off = modePayloadOff(w.raw);
  const before = Buffer.from(w.raw.subarray(off, off + PATCH_LEN));
  console.log("\nslot", slot);
  console.log(" before", hex(before, PATCH_LEN));

  const bakDir = path.join(backupRoot, slot);
  fs.mkdirSync(bakDir, { recursive: true });
  fs.copyFileSync(w.path, path.join(bakDir, "World.csav"));
  // also backup HostPlayer for safety
  const host = path.join(SAVES, slot, "HostPlayer.csav");
  if (fs.existsSync(host)) fs.copyFileSync(host, path.join(bakDir, "HostPlayer.csav"));

  if (!before.subarray(0, 4).equals(dirtySig) && !before.equals(cleanPrefix)) {
    console.log("  WARN: unexpected prefix — still applying clean ModeManager settings");
  }
  if (before.equals(cleanPrefix)) {
    console.log("  already clean — skip write");
    continue;
  }

  w.raw.set(cleanPrefix, off);
  const after = w.raw.subarray(off, off + PATCH_LEN);
  console.log(" after ", hex(after, PATCH_LEN));

  const packed = C.compressCsav(w.raw);
  fs.writeFileSync(w.path, packed);
  console.log("  wrote", w.path, "bytes", packed.length);
}

console.log("\nBackups at", backupRoot);
console.log("Done. Load AUTOSAVE-0 or AUTOSAVE-1 in-game (Steam Cloud off recommended).");
