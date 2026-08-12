/**
 * Clear permanent recipe-unlock pollution from Grounded 2 World.csav ModeManager blobs.
 * Close the game first. Patches any slot whose ModeManager head matches the dirty signature.
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
const NEEDLE = Buffer.from("/Script/Maine.SurvivalModeManagerComponent");
const CLEAN_PREFIX = Buffer.from(
  "0602000d00000001000001000000803f0000803f0101000101010100000003000000000000803f0000803f0101010000803f0000803f0100",
  "hex"
);
const DIRTY_SIG = Buffer.from([0x06, 0x04, 0x00, 0x0d]);
const PATCH_LEN = CLEAN_PREFIX.length;

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

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(SAVES, `_backup_recipe_clear_${stamp}`);
fs.mkdirSync(backupRoot, { recursive: true });

let fixed = 0;
for (const name of fs.readdirSync(SAVES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  if (name.startsWith("_backup")) continue;
  const worldPath = path.join(SAVES, name, "World.csav");
  if (!fs.existsSync(worldPath)) continue;
  const csav = fs.readFileSync(worldPath);
  const raw = Buffer.from(await C.decompressCsav(csav, oozDecompress));
  const off = modePayloadOff(raw);
  const before = Buffer.from(raw.subarray(off, off + PATCH_LEN));
  const unlockish =
    before[0] === 0x06 &&
    (before[1] === 0x04 || before[8] === 0x01 || before[9] === 0x01);

  console.log("\n" + name.slice(0, 72));
  console.log(" before", hex(before, Math.min(32, PATCH_LEN)));

  if (!unlockish && !before.subarray(0, 4).equals(DIRTY_SIG)) {
    console.log("  looks clean — skip");
    continue;
  }

  const bakDir = path.join(backupRoot, name);
  fs.mkdirSync(bakDir, { recursive: true });
  fs.copyFileSync(worldPath, path.join(bakDir, "World.csav"));

  // Prefer surgical clear of unlock bytes if layout matches known pattern
  if (before[0] === 0x06 && before[3] === 0x0d) {
    raw[off + 1] = 0x02; // non-dirty variant seen on clean slots
    raw[off + 8] = 0x00; // unlock off
    raw[off + 9] = 0x00; // free/unlock companion off
    // restore a few clean defaults around integrity/free-craft region from template when dirty
    if (before.subarray(0, 4).equals(DIRTY_SIG) || before[8] === 0x01) {
      CLEAN_PREFIX.copy(raw, off, 0, PATCH_LEN);
    }
  } else {
    CLEAN_PREFIX.copy(raw, off, 0, PATCH_LEN);
  }

  const after = raw.subarray(off, off + PATCH_LEN);
  console.log(" after ", hex(after, Math.min(32, PATCH_LEN)));
  fs.writeFileSync(worldPath, C.compressCsav(raw));
  fixed++;
  console.log("  wrote", worldPath);
}

console.log(`\nFixed ${fixed} slot(s). Backups: ${backupRoot}`);
if (fixed === 0) console.log("No dirty ModeManager unlock pattern found — pollution may be elsewhere.");
