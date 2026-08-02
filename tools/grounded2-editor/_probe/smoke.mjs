import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const window = {};
globalThis.window = window;

for (const f of [
  "csav.js",
  "header.js",
  "player.js",
  "save.js",
  "data.js",
  "inventory.js",
]) {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  vm.runInThisContext(code, { filename: f });
}

const slot =
  process.argv[2] ||
  path.join(
    process.env.USERPROFILE,
    "Saved Games",
    "Grounded2",
    "(ID-0B3A75924772BEF9392C4C8FFE6A34ED)(LOGOUT-SAVE)"
  );

const C = window.GroundedCsav;
const H = window.GroundedHeader;
const P = window.GroundedPlayer;
const Inv = window.GroundedInventory;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const header = fs.readFileSync(path.join(slot, "SaveGameHeaderData.savheader"));
const meta = H.parseHeader(header);
console.log("header", {
  ver: meta.gameVersion,
  world: meta.worldName,
  area: meta.areaName,
});
assert(meta.gameVersion, "missing game version");
assert(meta.worldName, "missing world name");

const renamed = H.rewriteWorldName(header, "gg");
assert(renamed.bytes.length === header.length, "rename must keep header size");

const hostCsav = fs.readFileSync(path.join(slot, "HostPlayer.csav"));
const hostRaw = await C.decompressCsav(hostCsav, oozDecompress);
const vitals = P.parsePlayerVitals(hostRaw);
console.log("vitals", {
  ok: vitals.ok,
  health: vitals.health,
  hunger: vitals.hunger,
  thirst: vitals.thirst,
  healthKind: vitals._health && vitals._health.kind,
});
assert(vitals.ok, "vitals not found");
assert(vitals.health != null && vitals.health > 0, "health missing");
assert(vitals.hunger != null, "hunger missing");

const edited = P.writePlayerVitals(hostRaw, {
  health: 100,
  hunger: 5,
  thirst: 5,
});
const packed = C.compressCsav(edited.bytes);
const round = await C.decompressCsav(packed, oozDecompress);
const vitals2 = P.parsePlayerVitals(round);
console.log("after fill", {
  health: vitals2.health,
  hunger: vitals2.hunger,
  thirst: vitals2.thirst,
});
assert(Math.abs(vitals2.health - 100) < 0.01, "health write failed");
assert(Math.abs(vitals2.hunger - 5) < 0.01, "hunger write failed");

const worldCsav = fs.readFileSync(path.join(slot, "World.csav"));
const worldRaw = await C.decompressCsav(worldCsav, oozDecompress);
const molars = P.parseMolars(hostRaw, worldRaw);
console.log("molars/science", {
  ok: molars.ok,
  milk: molars.milkMolars,
  party: molars.goldenMolars,
  science: molars.rawScience,
  stacks: molars.stackUpgrades.length,
});
assert(molars.ok, "molars/science not found");
assert(molars.rawScience != null, "raw science missing");
assert(molars.milkMolars != null, "milk molars missing");

const scienceTarget = Math.min(5000000, (molars.rawScience || 0) + 123);
const molarWrite = P.writeMolars(hostRaw, worldRaw, {
  milkMolars: (molars.milkMolars || 0) + 1,
  rawScience: scienceTarget,
});
const worldBack = await C.decompressCsav(
  C.compressCsav(molarWrite.worldBytes),
  oozDecompress
);
const hostBack = await C.decompressCsav(
  C.compressCsav(molarWrite.hostBytes),
  oozDecompress
);
const molars2 = P.parseMolars(hostBack, worldBack);
assert(molars2.rawScience === scienceTarget, "science write failed");
assert(
  molars2.milkMolars === (molars.milkMolars || 0) + 1,
  "milk molar write failed"
);

const inv = Inv.parseInventory(hostRaw);
console.log("inventory", { ok: inv.ok, items: inv.items.length, count: inv.count });
assert(inv.ok && inv.items.length > 0, "inventory parse failed");
assert(inv.count === inv.items.length, "inventory count mismatch");

const packedWorld = C.compressCsav(worldRaw);
const worldRound = await C.decompressCsav(packedWorld, oozDecompress);
assert(
  worldRound.length === worldRaw.length &&
    Buffer.compare(Buffer.from(worldRound), Buffer.from(worldRaw)) === 0,
  "world copy-pack roundtrip failed"
);

console.log("G2 SMOKE OK");
