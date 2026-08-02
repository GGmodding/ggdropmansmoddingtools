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
const TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";

function parseNamed(buf, name, limit = 8) {
  const needle = Buffer.from(name + "\0");
  let from = 0;
  const out = [];
  while (out.length < limit) {
    const nameAt = buf.indexOf(needle, from);
    if (nameAt < 0) break;
    from = nameAt + 1;
    const tableAt = buf.lastIndexOf(TABLE, nameAt);
    if (tableAt < 0 || nameAt - tableAt > 120) continue;
    const rec = Inv.parseItemRecord(buf, tableAt - 4, nameAt + 600);
    if (!rec || rec.name !== name) continue;
    const floats = [];
    for (let i = rec.start; i + 4 <= rec.end; i += 4) {
      const f = buf.readFloatLE(i);
      if (!Number.isFinite(f)) continue;
      if (f === 0 || f === 1 || f === -1) continue;
      if (Math.abs(f) > 1e6) continue;
      floats.push({ off: i - rec.start, f: +f.toFixed(4) });
    }
    // also u32 small
    const small = [];
    for (let i = rec.start; i + 4 <= rec.end; i += 4) {
      const u = buf.readUInt32LE(i);
      if (u >= 1 && u <= 100) small.push({ off: i - rec.start, u });
    }
    out.push({ start: rec.start, size: rec.size, level: rec.level, floats, small: small.slice(0, 15) });
  }
  return out;
}

for (const name of ["Taming_EggAnt", "Taming_EggLadybug", "AntHatch", "AntEgg"]) {
  const recs = parseNamed(world, name, 6);
  console.log("\n====", name, "parsed", recs.length, "====");
  for (const r of recs) {
    console.log("size", r.size, "level", r.level, "start", r.start);
    console.log("  floats", r.floats.slice(0, 20));
    console.log("  smallu", r.small);
  }
}

// Compare AntHatch size 461 — look for double time remaining (UE often uses double for timers)
{
  const recs = parseNamed(world, "AntHatch", 2);
  for (const r of recs) {
    console.log("\nAntHatch doubles:");
    for (let i = r.start; i + 8 <= r.start + r.size; i += 4) {
      const d = world.readDoubleLE(i);
      if (Number.isFinite(d) && d > 0.01 && d < 1e8) {
        console.log("  off", i - r.start, d);
      }
    }
  }
}

// List all unique item names that look like building mats / upgrades for preset
{
  const host = Buffer.from(
    await C.decompressCsav(
      fs.readFileSync(path.join(slot, "HostPlayer.csav")),
      oozDecompress
    )
  );
  const names = new Set();
  for (const buf of [host, world]) {
    let from = 0;
    while (true) {
      const at = buf.indexOf(TABLE, from);
      if (at < 0) break;
      const nameOff = at + TABLE.length + 1;
      const len = buf.readInt32LE(nameOff);
      if (len > 1 && len < 80) {
        const s = buf.slice(nameOff + 4, nameOff + 4 + len - 1).toString("utf8");
        if (/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) names.add(s);
      }
      from = at + 1;
    }
  }
  console.log("\nALL NAMES", [...names].sort().join(", "));
}
