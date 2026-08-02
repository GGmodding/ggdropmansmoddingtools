import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}

const slot = path.join(
  process.env.USERPROFILE,
  "Saved Games",
  "Grounded",
  "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)"
);
const host = unwrap(fs.readFileSync(path.join(slot, "HostPlayer.csav")));
const world = unwrap(fs.readFileSync(path.join(slot, "World.csav")));

for (const s of [
  "RelativeLocation",
  "PlayerStart",
  "RootComponent",
  "CapsuleComponent",
  "CharacterMovement",
  "LastTransform",
  "SpawnTransform",
  "PlayerLocation",
]) {
  for (const [l, b] of [
    ["h", host],
    ["w", world],
  ]) {
    const i = b.indexOf(s);
    if (i >= 0) {
      console.log(
        l,
        s,
        "@",
        i,
        b.toString("latin1", Math.max(0, i - 10), i + 80).replace(/[^\x20-\x7E]/g, ".")
      );
    }
  }
}

// Host begins with actor transform floats often
console.log("host head floats");
for (let o = 0; o < 200; o += 4) {
  const f = host.readFloatLE(o);
  if (Number.isFinite(f) && Math.abs(f) > 10 && Math.abs(f) < 1e6) {
    console.log(o, f);
  }
}

// Search for plausible backyard coords: X/Y large, Z small-ish
function findVec3(buf, label) {
  const hits = [];
  for (let o = 0; o + 12 <= Math.min(buf.length, 200000); o += 4) {
    const x = buf.readFloatLE(o);
    const y = buf.readFloatLE(o + 4);
    const z = buf.readFloatLE(o + 8);
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z) &&
      Math.abs(x) > 500 &&
      Math.abs(x) < 200000 &&
      Math.abs(y) > 500 &&
      Math.abs(y) < 200000 &&
      Math.abs(z) < 50000 &&
      Math.abs(z) > 1
    ) {
      hits.push({ o, x, y, z });
      if (hits.length > 8) break;
    }
  }
  console.log(label, "vec candidates", hits.slice(0, 5));
}
findVec3(host, "host");
