import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "../csav.js"), "utf8"));
const C = window.GroundedCsav;
const root = path.join(process.env.USERPROFILE, "Saved Games", "Grounded2");
const needle = Buffer.from("/Script/Maine.SurvivalModeManagerComponent");

async function dumpSlot(name) {
  const worldPath = path.join(root, name, "World.csav");
  if (!fs.existsSync(worldPath)) return;
  const raw = await C.decompressCsav(fs.readFileSync(worldPath), oozDecompress);
  const buf = Buffer.from(raw);
  const at = buf.indexOf(needle);
  console.log("===", name.slice(0, 72), "modeAt", at);
  if (at < 0) return;
  let o = at + needle.length + 1;
  const len = buf.readInt32LE(o);
  if (len > 1 && len < 80) {
    const nm = buf.slice(o + 4, o + 4 + len - 1).toString("ascii");
    console.log(" name", JSON.stringify(nm), "len", len);
    o = o + 4 + len;
  }
  const slice = buf.subarray(o, o + 320);
  for (let i = 0; i < slice.length; i += 16) {
    const hex = [...slice.subarray(i, i + 16)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    console.log(String(i).padStart(3, "0") + ":", hex);
  }

  // HostPlayer KnownCraftingRecipes path search
  const hostPath = path.join(root, name, "HostPlayer.csav");
  if (fs.existsSync(hostPath)) {
    const host = await C.decompressCsav(fs.readFileSync(hostPath), oozDecompress);
    const hb = Buffer.from(host);
    const recipes = (hb.toString("ascii").match(/Recipe[_A-Za-z0-9]+/g) || []).length;
    const craft = hb.indexOf("KnownCrafting");
    const craft2 = hb.indexOf("CraftingRecipe");
    console.log(" host recipes-ish", recipes, "KnownCrafting@", craft, "CraftingRecipe@", craft2);
  }
}

for (const d of fs.readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) {
  await dumpSlot(d.name);
}
