import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}

const root = path.join(process.env.USERPROFILE, "Saved Games", "Grounded");
const name = fs
  .readdirSync(root)
  .find((n) => n.includes("GameTime-7d"));
const host = unwrap(fs.readFileSync(path.join(root, name, "HostPlayer.csav")));

const PERK = "/Script/Maine.PerkComponent";
const at = host.indexOf(PERK);
let off = at + PERK.length + 1;
off += 1 + 4 + 4;
const entries = [];
for (let i = 0; i < 41; i++) {
  const len = host.readInt32LE(off);
  const n = host.toString("ascii", off + 4, off + 4 + len - 1);
  const a = host.readInt32LE(off + 4 + len);
  const b = host.readInt32LE(off + 4 + len + 4);
  const c = host.readInt32LE(off + 4 + len + 8);
  entries.push({ n, a, b, c });
  off += 4 + len + 12;
}
console.log("slot", name);
console.log(entries.filter((e) => e.a !== -1 || e.b || e.c));
console.log("all a values", [...new Set(entries.map((e) => e.a))]);
console.log("after perk", host.toString("latin1", off, off + 120).replace(/[^\x20-\x7E]/g, "."));
console.log("hex", [...host.subarray(off, off + 64)].map((x) => x.toString(16).padStart(2, "0")).join(" "));

// Search for equipped: look for repeated GUIDs or small FString lists near end of player before PUC
const PUC = host.indexOf("/Script/Maine.PlayerUpgradeComponent");
console.log("between perk-end and PUC", PUC - off);
console.log(
  host.toString("latin1", off, Math.min(PUC, off + 400)).replace(/[^\x20-\x7E]/g, ".")
);
