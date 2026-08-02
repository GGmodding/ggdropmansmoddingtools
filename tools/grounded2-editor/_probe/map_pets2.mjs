import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, "csav.js"), "utf8"));
const C = window.GroundedCsav;
const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded2",
  "(ID-0B3A75924772BEF9392C4C8FFE6A34ED)(LOGOUT-SAVE)"
);
const world = Buffer.from(
  await C.decompressCsav(fs.readFileSync(path.join(slot, "World.csav")), oozDecompress)
);
const host = Buffer.from(
  await C.decompressCsav(fs.readFileSync(path.join(slot, "HostPlayer.csav")), oozDecompress)
);

function payloadStart(buf, pathStr) {
  const at = buf.indexOf(pathStr);
  let o = at + pathStr.length + 1;
  const len = buf.readInt32LE(o);
  if (len > 0 && len < 80) o = o + 4 + len;
  return { at, o };
}

// Omni: try setting levels to 4 and verify structure length before next Script
{
  const p = "/Script/Maine.OmniToolComponent";
  const { o } = payloadStart(host, p);
  const next = host.indexOf("/Script/Maine.", o);
  console.log("Omni payload len until next Script", next - o);
  console.log("bytes to next", host.slice(o, next).toString("hex"));
}

// PetStorage between PetMaster and next
{
  const p = "/Script/Maine.PetStorageComponent";
  const { o } = payloadStart(host, p);
  const next = host.indexOf("/Script/Maine.", o);
  console.log("\nPetStorage len", next - o);
  console.log("hex head", host.slice(o, Math.min(next, o + 64)).toString("hex"));
  // item tables?
  const region = host.slice(o, next > 0 ? next : o + 2000);
  let i = 0;
  let tables = 0;
  const needle = Buffer.from("/Game/Blueprints/Items/Table_AllItems.Table_AllItems");
  while (true) {
    const at = region.indexOf(needle, i);
    if (at < 0) break;
    tables++;
    i = at + 1;
  }
  console.log("AllItems in PetStorage region", tables);
}

// Buggy region until next Script
{
  const p = "/Script/Maine.PlayerBuggyUpgradeComponent";
  const { o } = payloadStart(host, p);
  const next = host.indexOf("/Script/Maine.", o);
  console.log("\nBuggy payload len", next - o);
  console.log("full hex", host.slice(o, next).toString("hex"));
}

// MapComponent payload until Foliage
{
  const p = "/Script/Maine.MapComponent";
  const { o } = payloadStart(world, p);
  const next = world.indexOf("/Script/Maine.", o);
  console.log("\nMapComponent len", next - o);
  console.log("hex", world.slice(o, Math.min(next, o + 48)).toString("hex"));
}

// Scale(1,1,1) count in host with lower magnitude threshold
{
  const SCALE = Buffer.from([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f]);
  let n = 0;
  const cands = [];
  for (let i = 12; i <= host.length - 12; i++) {
    if (host.compare(SCALE, 0, 12, i, i + 12) !== 0) continue;
    n++;
    const x = host.readFloatLE(i - 12);
    const y = host.readFloatLE(i - 8);
    const z = host.readFloatLE(i - 4);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      const mag = Math.abs(x) + Math.abs(y) + Math.abs(z);
      if (mag > 1 && mag < 1e7) cands.push({ i: i - 12, x, y, z, mag });
    }
  }
  console.log("\nscale hits", n, "cands", cands.length);
  cands.sort((a, b) => b.mag - a.mag);
  console.log(cands.slice(0, 15));
}
