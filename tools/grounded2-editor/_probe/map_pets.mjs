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

{
  const fog = "/Script/Maine.FogOfWarComponent";
  const { o } = payloadStart(world, fog);
  let firstNz = -1;
  let lastNz = -1;
  let nz = 0;
  const max = Math.min(world.length, o + 300000);
  for (let i = o; i < max; i++) {
    if (world[i] !== 0) {
      nz++;
      if (firstNz < 0) firstNz = i;
      lastNz = i;
    }
  }
  console.log(
    "Fog payload@",
    o,
    "nonzero in 300k:",
    nz,
    "first",
    firstNz !== -1 ? firstNz - o : null,
    "last",
    lastNz !== -1 ? lastNz - o : null
  );
  for (const pad of [0, 1]) {
    const base = o + pad;
    const a = world.readUInt32LE(base);
    const b = world.readUInt32LE(base + 4);
    console.log("pad", pad, "u32", a, b, "hex", a.toString(16), b.toString(16));
  }
  const next = world.indexOf("/Script/Maine.", o);
  console.log("next Script at", next, next >= 0 ? world.slice(next, next + 60).toString() : "");
  // If fog is a TArray of bytes: [pad?][count][bytes...]
  // Try pad0: count=0x01b66100 too big. pad1: count=0x01b661 = 112225
  const count = world.readUInt32LE(o + 1);
  console.log("pad1 count", count, "blob end would be", 1 + 4 + count);
  if (count > 0 && count < 500000) {
    const blob = world.slice(o + 5, o + 5 + count);
    let ones = 0;
    let zeros = 0;
    let other = 0;
    for (const b of blob) {
      if (b === 0) zeros++;
      else if (b === 0xff) ones++;
      else other++;
    }
    console.log("blob bytes", blob.length, "0=", zeros, "ff=", ones, "other=", other);
    const after = o + 5 + count;
    console.log("after blob", world.slice(after, after + 32).toString("hex"), world.slice(after, after + 40).toString("latin1"));
  }
}

{
  const p = "/Script/Maine.ResourceSurveyComponent";
  const { o } = payloadStart(world, p);
  console.log("\nSurvey payload@", o);
  console.log("hex", world.slice(o, o + 32).toString("hex"));
  console.log("u32s", world.readUInt32LE(o), world.readUInt32LE(o + 4), world.readUInt32LE(o + 8));
  const nextFog = world.indexOf("/Script/Maine.FogOfWarComponent", o);
  console.log("survey size until fog path", nextFog - o);
}

{
  const p = "/Script/Maine.OmniToolComponent";
  const { o } = payloadStart(host, p);
  console.log("\nOmni", host.slice(o, o + 40).toString("hex"));
  // Interpret as: u8/u16 version + array of unlocked tiers?
  console.log(
    "as u32s",
    [...Array(8)].map((_, i) => host.readUInt32LE(o + i * 4))
  );
}

{
  const p = "/Script/Maine.PlayerBuggyUpgradeComponent";
  const { o } = payloadStart(host, p);
  console.log("\nBuggy", host.slice(o, o + 48).toString("hex"));
  console.log("u32", host.readUInt32LE(o), host.readUInt32LE(o + 4), host.readUInt32LE(o + 8), host.readUInt32LE(o + 12));
  const region = host.slice(o, Math.min(host.length, o + 8000)).toString("latin1");
  const names = [...region.matchAll(/[A-Za-z][A-Za-z0-9_]{4,50}/g)]
    .map((m) => m[0])
    .filter((n) => /Buggy|Upgrade|Tame|Pet|Mount|Speed|Carry|Storage|Sprint|Harness/i.test(n));
  console.log("nearby", [...new Set(names)].slice(0, 40));
}

{
  const p = "/Script/Maine.PetMasterComponent";
  const { o } = payloadStart(host, p);
  const region = host.slice(o, Math.min(host.length, o + 8000)).toString("latin1");
  const soft = [...region.matchAll(/\/Game\/[A-Za-z0-9_\/.]+/g)].map((m) => m[0]);
  console.log("\nPet softs", soft.slice(0, 25));
  console.log("Pet hex", host.slice(o, o + 48).toString("hex"));
}

// Position: find large XYZ near CharacterMovement / RootComponent
{
  const hits = [];
  const re = /\/Script\/[A-Za-z0-9_.]+/g;
  const s = host.toString("latin1");
  let m;
  while ((m = re.exec(s))) {
    if (/Movement|Root|Transform|Capsule|Character/i.test(m[0])) hits.push({ path: m[0], at: m.index });
  }
  console.log("\nTransform-ish paths", hits.slice(0, 30));
}
