import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";
import vm from "vm";

const root = path.resolve("..");
globalThis.window = {};
for (const f of ["csav.js", "inventory.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), "utf8"), { filename: f });
}
const C = window.GroundedCsav;
const Inv = window.GroundedInventory;
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

const TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";

function findNameHits(buf, name) {
  const out = [];
  let from = 0;
  const needle = Buffer.from(name + "\0");
  while (true) {
    const at = buf.indexOf(needle, from);
    if (at < 0) break;
    out.push(at);
    from = at + 1;
  }
  return out;
}

for (const name of ["AntHatch", "Taming_EggAnt", "Taming_EggLadybug", "Taming_EggOrb", "Taming_EggBlackAnt", "AntEgg", "AntSaddle"]) {
  const hits = findNameHits(world, name).concat(findNameHits(host, name).map((x) => "H:" + x));
  console.log(name, "hits", hits.length, hits.slice(0, 8));
}

// Parse AntHatch records in world — find Table_AllItems just before name
{
  const hits = findNameHits(world, "AntHatch");
  for (const nameAt of hits) {
    // walk back for Table_AllItems
    const tableAt = world.lastIndexOf(TABLE, nameAt);
    if (tableAt < 0 || nameAt - tableAt > 120) {
      console.log("AntHatch@", nameAt, "no nearby table");
      continue;
    }
    const pathLenOff = tableAt - 4;
    const rec = Inv.parseItemRecord(world, pathLenOff, nameAt + 400);
    console.log("\nAntHatch rec", rec && {
      name: rec.name,
      stack: rec.stack,
      level: rec.level,
      enh: rec.enhancement,
      mid: rec.mid,
      size: rec.size,
      start: rec.start,
      end: rec.end,
      stackOff: rec.stackOff,
    });
    if (!rec) {
      console.log("raw around name", world.slice(nameAt - 8, nameAt + 80).toString("hex"));
      continue;
    }
    // dump floats in record
    const floats = [];
    for (let i = rec.start; i + 4 <= rec.end; i += 4) {
      const f = world.readFloatLE(i);
      if (Number.isFinite(f) && f !== 0 && Math.abs(f) < 1e7) {
        floats.push({ off: i - rec.start, f: +f.toFixed(4) });
      }
    }
    console.log("floats in rec", floats);
    // also 64 bytes after end
    const after = [];
    for (let i = 0; i < 64; i += 4) {
      const f = world.readFloatLE(rec.end + i);
      const u = world.readUInt32LE(rec.end + i);
      after.push(i + ":f" + f.toFixed(3) + "/u" + u);
    }
    console.log("after", after.join(" | "));
  }
}

// Host AntSaddle + buggy equipment
{
  const hits = findNameHits(host, "AntSaddle");
  for (const nameAt of hits) {
    const tableAt = host.lastIndexOf(TABLE, nameAt);
    if (tableAt < 0) continue;
    const rec = Inv.parseItemRecord(host, tableAt - 4, nameAt + 400);
    console.log("\nHost AntSaddle", rec && { name: rec.name, stack: rec.stack, level: rec.level, size: rec.size });
    if (rec) {
      const floats = [];
      for (let i = rec.start; i + 4 <= rec.end; i += 4) {
        const f = host.readFloatLE(i);
        if (Number.isFinite(f) && f !== 0 && Math.abs(f) < 1e6)
          floats.push({ off: i - rec.start, f: +f.toFixed(3) });
      }
      console.log("saddle floats", floats);
    }
  }
}

// All HealthComponent values on host
{
  const p = "/Script/Maine.HealthComponent";
  let from = 0;
  let n = 0;
  while (n < 10) {
    const at = host.indexOf(p, from);
    if (at < 0) break;
    let o = at + p.length + 1;
    const len = host.readInt32LE(o);
    if (len > 0 && len < 80) o = o + 4 + len;
    const vals = [];
    for (let off = 0; off <= 24; off++) {
      const f = host.readFloatLE(o + off);
      if (Number.isFinite(f) && f > 10 && f < 2000) vals.push({ off, f: +f.toFixed(1) });
    }
    const ctx = host.slice(Math.max(0, at - 60), at).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
    console.log("HealthComp#" + n, vals.slice(0, 4), "ctx", ctx.slice(-40));
    from = at + 1;
    n++;
  }
}

// BuggyEvolution soft path context (purchase unlock?)
{
  const at = world.indexOf("BuggyEvolution");
  console.log("\nBuggyEvolution ctx", world.slice(at - 80, at + 100).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
