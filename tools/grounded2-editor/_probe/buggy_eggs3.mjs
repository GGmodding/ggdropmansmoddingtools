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

// Hatchery actor region
{
  const at = world.indexOf("BP_Hatchery.BP_Hatchery_C");
  console.log("Hatchery soft at", at);
  // find length-prefixed path start
  let g = world.lastIndexOf("/Game/", at);
  const len = world.readInt32LE(g - 4);
  console.log("path", world.slice(g, g + len - 1).toString());
  let o = g + len;
  // dump 512 bytes and extract strings + interesting floats
  console.log(world.slice(o, o + 400).toString("hex"));
  const region = world.slice(o, o + 4000);
  const strs = [...region.toString("latin1").matchAll(/[A-Za-z][A-Za-z0-9_]{3,50}/g)].map((m) => m[0]);
  console.log(
    "hatchery strings",
    [...new Set(strs)].filter((s) =>
      /Egg|Hatch|Progress|Timer|Slot|Inventory|Ant|Pet|Tame|Incub|Time|Day|Float/i.test(s)
    )
  );
  // find Taming_Egg / AntEgg nearby
  for (const needle of ["Taming_Egg", "AntEgg", "Table_AllItems", "HatchProgress", "Remaining"]) {
    const i = region.indexOf(needle);
    console.log("in hatchery+4k", needle, i);
  }
}

// Look near Ant_Soldier buggy character data for tier ints
{
  const needle = "Ant_Soldier_Brown_Augusta_Buggy";
  const at = host.indexOf(needle);
  console.log("\nbuggy char at", at);
  if (at >= 0) {
    console.log(host.slice(at - 32, at + needle.length + 128).toString("hex"));
    // search nearby u32 small ints 1-4 as possible tier
    const start = Math.max(0, at - 200);
    const end = Math.min(host.length, at + 800);
    const hits = [];
    for (let i = start; i + 4 <= end; i++) {
      const u = host.readUInt32LE(i);
      if (u >= 1 && u <= 4) hits.push({ i: i - at, u });
    }
    console.log("nearby u32 1-4 count", hits.length, "sample", hits.slice(0, 30));
  }
}

// HealthLOD near buggy - find all HealthLOD and context
{
  const p = "/Script/Maine.HealthLODComponent";
  let from = 0;
  let n = 0;
  while (n < 8) {
    const at = host.indexOf(p, from);
    if (at < 0) break;
    const ctx = host.slice(Math.max(0, at - 120), at + 80).toString("latin1");
    let o = at + p.length + 1;
    const len = host.readInt32LE(o);
    o = o + 4 + len;
    const floats = [];
    for (let i = 0; i < 32; i++) {
      const f = host.readFloatLE(o + i);
      if (Number.isFinite(f) && f > 1 && f < 2000) floats.push({ off: i, f: +f.toFixed(1) });
    }
    console.log("HealthLOD#" + n, "at", at, "floats", floats.slice(0, 6));
    console.log("  ctx", ctx.replace(/[^\x20-\x7e]/g, ".").slice(-80));
    from = at + 1;
    n++;
  }
}

// Search world for Buffin / Evolution / BuggyEvolution
{
  for (const n of ["Buffin", "BuggyEvolution", "EvolutionStation", "BuggyUpgrade", "Tier"]) {
    console.log("world", n, world.indexOf(n));
  }
}

// NestPetStorage
{
  const p = "/Script/Maine.NestPetStorageComponent";
  const at = world.indexOf(p);
  console.log("\nNestPetStorage", at);
  if (at >= 0) {
    let o = at + p.length + 1;
    const len = world.readInt32LE(o);
    o = o + 4 + len;
    const region = world.slice(o, o + 3000).toString("latin1");
    const soft = [...region.matchAll(/\/Game\/[A-Za-z0-9_\/.]+/g)].map((m) => m[0]);
    console.log("softs", soft.slice(0, 20));
    const names = [...region.matchAll(/[A-Za-z][A-Za-z0-9_]{3,40}/g)]
      .map((m) => m[0])
      .filter((s) => /Egg|Taming|Ant|Pet|Hatch|Progress/i.test(s));
    console.log("names", [...new Set(names)].slice(0, 40));
  }
}
