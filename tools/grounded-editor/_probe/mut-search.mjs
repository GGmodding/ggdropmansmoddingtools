import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)"
);
function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}
const host = unwrap(fs.readFileSync(path.join(slot, "HostPlayer.csav")));
const world = unwrap(fs.readFileSync(path.join(slot, "World.csav")));

for (const [label, buf] of [
  ["host", host],
  ["world", world],
]) {
  const needle = Buffer.from("/Game/Design/Perks/");
  let i = 0;
  const paths = [];
  while ((i = buf.indexOf(needle, i)) >= 0) {
    let e = i;
    while (e < buf.length && buf[e] && e < i + 140) e++;
    const p = buf.toString("ascii", i, e);
    if (!p.includes("/Stats/") && !p.includes("Stat_")) paths.push(p);
    i++;
  }
  console.log(label, "non-stat perk paths", [...new Set(paths)].slice(0, 60));
  console.log("count", paths.length, "unique", new Set(paths).size);
}

const up = host.indexOf("/Script/Maine.PlayerUpgradeComponent");
console.log(
  "\nupgrade ascii",
  host.toString("latin1", up, up + 220).replace(/[^\x20-\x7E]/g, ".")
);
console.log(
  "upgrade hex after path",
  [...host.subarray(up + "/Script/Maine.PlayerUpgradeComponent".length + 1, up + 120)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
);

// Search Mutation data tables
for (const s of [
  "Mutations",
  "MutationData",
  "EquippedPerks",
  "UnlockedPerks",
  "PerkSlot",
  "ActivePerks",
  "DT_Mutations",
  "Table_Mutations",
  "BP_Mutation",
]) {
  for (const [label, buf] of [
    ["host", host],
    ["world", world],
  ]) {
    const i = buf.indexOf(s);
    if (i >= 0) {
      console.log(
        label,
        s,
        "@",
        i,
        buf.toString("latin1", Math.max(0, i - 30), i + 90).replace(/[^\x20-\x7E]/g, ".")
      );
    }
  }
}
