import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";

// Load IIFE modules into a fake window
const require = createRequire(import.meta.url);
const vm = await import("vm");
const root = path.resolve("..");
const window = {};
globalThis.window = window;
for (const f of ["csav.js", "header.js", "player.js", "save.js", "data.js"]) {
  const code = fs.readFileSync(path.join(root, f), "utf8");
  vm.runInThisContext(code, { filename: f });
}

const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-B995D4F644DEFE1DC29D01BC5CB1B69B)(LOGOUT-SAVE)"
);
const C = window.GroundedCsav;
const H = window.GroundedHeader;
const P = window.GroundedPlayer;

const header = fs.readFileSync(path.join(slot, "SaveGameHeaderData.savheader"));
const meta = H.parseHeader(header);
console.log("header", {
  ver: meta.gameVersion,
  world: meta.worldName,
  area: meta.areaName,
  level: meta.levelName,
  cap: meta._worldNameHit?.capacity,
});

const renamed = H.rewriteWorldName(header, "gg");
console.log("rename same ok", renamed.bytes.length === header.length);

const hostCsav = fs.readFileSync(path.join(slot, "HostPlayer.csav"));
const hostRaw = await C.decompressCsav(hostCsav, oozDecompress);
const vitals = P.parsePlayerVitals(hostRaw);
console.log("vitals", {
  ok: vitals.ok,
  health: vitals.health,
  hunger: vitals.hunger,
  thirst: vitals.thirst,
});

const edited = P.writePlayerVitals(hostRaw, { health: 100 });
const packed = C.compressCsav(edited.bytes);
const round = await C.decompressCsav(packed, oozDecompress);
const vitals2 = P.parsePlayerVitals(round);
console.log("after health=100", vitals2.health, "csav", packed.length);

const worldCsav = fs.readFileSync(path.join(slot, "World.csav"));
const worldRaw = await C.decompressCsav(worldCsav, oozDecompress);
const items = P.listItemPaths(Buffer.concat([hostRaw, worldRaw]));
console.log("items", items.length, "top", items.slice(0, 5));

const packedWorld = C.compressCsav(worldRaw);
const worldBack = await C.decompressCsav(packedWorld, oozDecompress);
console.log(
  "world copy-pack roundtrip",
  worldBack.length === worldRaw.length &&
    Buffer.compare(Buffer.from(worldBack), worldRaw) === 0,
  "packed",
  packedWorld.length
);

console.log("SMOKE OK");
