import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
globalThis.window = {};

for (const f of ["csav.js", "tech.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}

const C = window.GroundedCsav;
const T = window.GroundedTech;
const savesRoot = path.join(process.env.USERPROFILE, "Saved Games", "Grounded2");

function countAscii(buf, ascii) {
  const enc = new TextEncoder().encode(ascii);
  let n = 0;
  outer: for (let i = 0; i <= buf.length - enc.length; i++) {
    for (let j = 0; j < enc.length; j++) if (buf[i + j] !== enc[j]) continue outer;
    n++;
  }
  return n;
}

const slots = fs
  .readdirSync(savesRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const name of slots) {
  const worldPath = path.join(savesRoot, name, "World.csav");
  if (!fs.existsSync(worldPath)) continue;
  const st = fs.statSync(worldPath);
  const csav = fs.readFileSync(worldPath);
  const raw = await C.decompressCsav(csav, oozDecompress);
  const tech = T.parsePartyTech(raw);
  const allItems = countAscii(raw, "/Game/Blueprints/Items/Table_AllItems.Table_AllItems");
  const modeMgr = countAscii(raw, "/Script/Maine.SurvivalModeManagerComponent");
  const settings = countAscii(raw, "SurvivalGameModeSettings");
  console.log(
    JSON.stringify({
      slot: name.slice(0, 80),
      mtime: st.mtime.toISOString(),
      worldKB: Math.round(st.size / 1024),
      rawKB: Math.round(raw.length / 1024),
      knowledge: tech.ok ? tech.knowledge.length : tech.error || "fail",
      analyzed: tech.ok ? tech.analyzed.length : null,
      allItemsHits: allItems,
      modeMgrHits: modeMgr,
      settingsHits: settings,
    })
  );
}
