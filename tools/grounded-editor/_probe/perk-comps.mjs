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

function dumpComp(name) {
  const at = host.indexOf(name);
  if (at < 0) return console.log("missing", name);
  const next = host.indexOf("/Script/Maine.", at + name.length);
  const end = next > 0 ? next : Math.min(host.length, at + 3000);
  console.log("\n====", name, "at", at, "len", end - at, "====");
  console.log(
    host
      .subarray(at, Math.min(end, at + 1500))
      .toString("latin1")
      .replace(/[^\x20-\x7E]/g, ".")
  );
  // FStrings
  const strs = [];
  for (let o = at; o < end - 4; o++) {
    const len = host.readInt32LE(o);
    if (len < 4 || len > 80 || o + 4 + len > end) continue;
    const raw = host.subarray(o + 4, o + 4 + len - 1);
    if (![...raw].every((c) => c >= 32 && c < 127)) continue;
    const s = raw.toString("ascii");
    if (/^[A-Za-z][A-Za-z0-9_.]*$/.test(s)) {
      strs.push(s);
      o += 3 + len;
    }
  }
  console.log("ids", [...new Set(strs)].slice(0, 60));
}

dumpComp("/Script/Maine.PlayerStatsComponent");
dumpComp("/Script/Maine.StatusEffectComponent");
dumpComp("/Script/Maine.PlayerUpgradeComponent");
dumpComp("/Script/Maine.PerkComponent");
