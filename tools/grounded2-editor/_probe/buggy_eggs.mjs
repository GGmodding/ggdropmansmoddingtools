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

function afterShort(buf, pathStr) {
  const at = buf.indexOf(pathStr);
  if (at < 0) return null;
  let o = at + pathStr.length + 1;
  const len = buf.readInt32LE(o);
  if (len > 0 && len < 80) o = o + 4 + len;
  return { at, o };
}

function dump(buf, label, start, n = 256) {
  console.log("\n==", label, "@", start, "==");
  for (let i = 0; i < n; i += 16) {
    const row = buf.slice(start + i, start + i + 16);
    const hex = [...row].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const asc = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    console.log(String(i).padStart(4), hex.padEnd(48), asc);
  }
}

// Full buggy region until next /Script/Maine (or large soft path chain)
{
  const p = "/Script/Maine.PlayerBuggyUpgradeComponent";
  const loc = afterShort(host, p);
  dump(host, "Buggy", loc.o, 320);
  // find strings in next 2k
  const region = host.slice(loc.o, loc.o + 2500).toString("latin1");
  const strs = [...region.matchAll(/[A-Za-z][A-Za-z0-9_]{3,60}/g)].map((m) => m[0]);
  console.log("strings", [...new Set(strs)].slice(0, 60));
}

{
  const p = "/Script/Maine.PlayerUpgradeComponent";
  const loc = afterShort(host, p);
  dump(host, "PlayerUpgrade", loc.o, 200);
  const region = host.slice(loc.o, loc.o + 4000).toString("latin1");
  const soft = [...region.matchAll(/\/Game\/[A-Za-z0-9_\/.]+/g)].map((m) => m[0]);
  console.log("PUC softs", soft.slice(0, 40));
  const strs = [...region.matchAll(/[A-Za-z][A-Za-z0-9_]{3,50}/g)]
    .map((m) => m[0])
    .filter((n) => /Upgrade|Molar|Stack|Health|Stamina|Hunger|Thirst|Carry|Haul|Craft|Build/i.test(n));
  console.log("PUC names", [...new Set(strs)].slice(0, 40));
}

// Hatchable actors in world — find each BP_World_Hatchable and dump nearby floats
{
  const needle = "BP_World_Hatchable";
  let from = 0;
  let n = 0;
  while (n < 12) {
    const at = world.indexOf(needle, from);
    if (at < 0) break;
    // back up to soft path start
    let softStart = at;
    while (softStart > 0 && world[softStart - 1] !== 0) softStart--;
    // often /Game/... precedes
    const ctx = world.slice(Math.max(0, at - 80), at + 120).toString("latin1");
    const nameMatch = ctx.match(/BP_World_Hatchable_[A-Za-z0-9_]+/);
    console.log("\nHatchable#" + n, "at", at, nameMatch && nameMatch[0]);
    // dump 96 bytes AFTER the null-terminated name FString-ish
    // find end of this ascii run
    let end = at;
    while (end < world.length && world[end] !== 0) end++;
    end++; // null
    // sometimes short name follows
    dump(world, "after hatch name", end, 96);
    // look for floats 0-1 (progress) or large timers nearby
    const floats = [];
    for (let i = end; i < end + 128; i += 4) {
      const f = world.readFloatLE(i);
      if (Number.isFinite(f) && Math.abs(f) < 1e6) floats.push({ off: i - end, f });
    }
    console.log(
      "floats",
      floats
        .filter((x) => x.f !== 0)
        .slice(0, 20)
        .map((x) => x.off + ":" + x.f.toFixed(4))
        .join(" | ")
    );
    from = at + 1;
    n++;
  }
  console.log("total hatchable name hits scanned", n);
}

// Inventory item ids catalog from host+world soft object short names after Table_AllItems
{
  vm.runInThisContext(fs.readFileSync(path.join(root, "inventory.js"), "utf8"));
  const Inv = window.GroundedInventory;
  const inv = Inv.parseInventory(host);
  console.log("\ninv items", inv.ok ? inv.items.length : inv);
  if (inv.ok) console.log(inv.items.slice(0, 30).map((i) => i.name + ":" + i.stack));
}
