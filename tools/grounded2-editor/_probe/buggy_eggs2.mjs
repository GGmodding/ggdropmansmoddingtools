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

// Collect unique soft-path starts for hatchables (use full /Game/... path)
function findAll(buf, ascii) {
  const out = [];
  let from = 0;
  const needle = Buffer.from(ascii);
  while (true) {
    const at = buf.indexOf(needle, from);
    if (at < 0) break;
    out.push(at);
    from = at + 1;
  }
  return out;
}

// Find FString soft object paths containing Hatchable
{
  const hits = findAll(world, "Hatchable_");
  const records = [];
  for (const at of hits) {
    // walk back to '/' of /Game
    let s = at;
    while (s > 0 && world[s] !== 0) s--;
    // s points at null before path OR mid-string; find /Game
    let g = world.lastIndexOf("/Game/", at);
    if (g < 0 || at - g > 200) continue;
    // FString length is 4 bytes before path
    const lenOff = g - 4;
    const len = world.readInt32LE(lenOff);
    if (len < 10 || len > 200) continue;
    const pathStr = world.slice(g, g + len - 1).toString("utf8");
    if (!/Hatchable/i.test(pathStr)) continue;
    const pathEnd = g + len; // after null
    // short name FString?
    let payload = pathEnd;
    const snLen = world.readInt32LE(payload);
    let short = "";
    if (snLen > 1 && snLen < 80) {
      short = world.slice(payload + 4, payload + 4 + snLen - 1).toString("utf8");
      payload = payload + 4 + snLen;
    }
    // sample floats at payload+0..160
    const sample = {};
    for (let off = 0; off <= 160; off += 4) {
      const f = world.readFloatLE(payload + off);
      const u = world.readUInt32LE(payload + off);
      if (Number.isFinite(f) && f > 0 && f <= 1.0001) sample["f" + off] = +f.toFixed(4);
      if (u > 0 && u < 100) sample["u" + off] = u;
    }
    records.push({ path: pathStr.split("/").pop(), short, payload, sample });
  }
  // unique by payload
  const seen = new Set();
  for (const r of records) {
    if (seen.has(r.payload)) continue;
    seen.add(r.payload);
    console.log(r.path, "short=", r.short, "payload", r.payload, r.sample);
  }
  console.log("unique hatch payloads", seen.size);
}

// Hatchery building instances
{
  const hits = findAll(world, "BP_Hatchery");
  console.log("\nHatchery hits", hits.length);
  for (const at of hits.slice(0, 6)) {
    console.log(world.slice(at - 40, at + 80).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  }
}

// Look for egg item names + hatch progress near Inventory in world (nest/hatchery storage)
{
  const eggNames = ["AntEgg", "Egg", "Hatch", "Incubat", "Progress"];
  for (const name of eggNames) {
    const hits = findAll(world, name);
    console.log("world ascii", name, hits.length);
  }
}

// Stat_Buggy and upgrade-like soft paths in host
{
  const soft = [...host.toString("latin1").matchAll(/\/Game\/[A-Za-z0-9_\/.]+/g)].map((m) => m[0]);
  const buggy = soft.filter((p) => /Buggy|Upgrade|Pet|Tame|Egg|Hatch|Stat_/i.test(p));
  console.log("\nhost buggy-ish softs", [...new Set(buggy)]);
}

// TameableLOD dump
{
  const p = "/Script/Maine.TameableLODComponent";
  const at = host.indexOf(p);
  console.log("\nTameableLOD at", at);
  if (at >= 0) {
    let o = at + p.length + 1;
    const len = host.readInt32LE(o);
    o = o + 4 + len;
    console.log(host.slice(o, o + 128).toString("hex"));
    const region = host.slice(o, o + 500).toString("latin1");
    console.log(
      [...region.matchAll(/[A-Za-z][A-Za-z0-9_]{3,40}/g)]
        .map((m) => m[0])
        .filter((n, i, a) => a.indexOf(n) === i)
        .slice(0, 30)
    );
  }
}

// Catalog unique item short names after Table_AllItems in host+world
{
  const table = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
  const names = new Set();
  for (const buf of [host, world]) {
    let from = 0;
    while (true) {
      const at = buf.indexOf(table, from);
      if (at < 0) break;
      const nameOff = at + table.length + 1;
      const len = buf.readInt32LE(nameOff);
      if (len > 1 && len < 80) {
        const s = buf.slice(nameOff + 4, nameOff + 4 + len - 1).toString("utf8");
        if (/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) names.add(s);
      }
      from = at + 1;
    }
  }
  const list = [...names].sort();
  console.log("\nunique item names", list.length);
  console.log(list.filter((n) => /Egg|Plank|Stem|Grass|Clay|Quartz|Weed|Sap|Fiber|Molar|Chip|Upgrade|Berry|Acorn|Pebble|Bark|Resin|Dust|Shard|Part|Hide|Silk|Web|Thistle|Clover|Twig|Stone|Seed|Nectar|Honey|Mushroom|Goop/i.test(n)).join(", "));
}
