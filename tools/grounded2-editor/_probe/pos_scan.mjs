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
const host = Buffer.from(
  await C.decompressCsav(fs.readFileSync(path.join(slot, "HostPlayer.csav")), oozDecompress)
);

// Find float triplets that look like Augusta world coords (often thousands)
const cands = [];
for (let i = 0; i + 12 <= host.length; i += 4) {
  const x = host.readFloatLE(i);
  const y = host.readFloatLE(i + 4);
  const z = host.readFloatLE(i + 8);
  if (![x, y, z].every((n) => Number.isFinite(n))) continue;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  // world-ish: XZ large, Y altitude moderate
  if (ax > 500 && ax < 200000 && az > 500 && az < 200000 && ay > 50 && ay < 50000) {
    // reject if next floats look like garbage extremes
    cands.push({ i, x, y, z, mag: ax + ay + az });
  }
}
cands.sort((a, b) => b.mag - a.mag);
console.log("worldish triplets", cands.length);
console.log(cands.slice(0, 20));

// Also search for FVector with Scale 1.0 nearby (within 48 bytes after)
const ones = [];
for (const c of cands.slice(0, 200)) {
  for (let off = 12; off <= 64; off += 4) {
    if (c.i + off + 12 > host.length) break;
    const s0 = host.readFloatLE(c.i + off);
    const s1 = host.readFloatLE(c.i + off + 4);
    const s2 = host.readFloatLE(c.i + off + 8);
    if (Math.abs(s0 - 1) < 1e-5 && Math.abs(s1 - 1) < 1e-5 && Math.abs(s2 - 1) < 1e-5) {
      ones.push({ ...c, scaleOff: off });
    }
  }
}
console.log("with scale1 nearby", ones.slice(0, 10));
