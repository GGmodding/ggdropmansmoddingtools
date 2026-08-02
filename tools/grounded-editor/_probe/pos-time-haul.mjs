import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}

const root = path.join(process.env.USERPROFILE, "Saved Games", "Grounded");
const slots = fs
  .readdirSync(root)
  .filter((n) => /Area-/i.test(n))
  .slice(0, 6);

for (const name of slots) {
  const hp = path.join(root, name, "HostPlayer.csav");
  if (!fs.existsSync(hp)) continue;
  try {
    const host = unwrap(fs.readFileSync(hp));
    const x = host.readFloatLE(168);
    const y = host.readFloatLE(172);
    const z = host.readFloatLE(176);
    const area = (name.match(/Area-([^)]+)/) || [])[1];
    console.log(area, { x: x.toFixed(1), y: y.toFixed(1), z: z.toFixed(1) }, "hex160", [...host.subarray(160, 200)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
  } catch (e) {
    console.log(name, e.message);
  }
}

// Time probes in world
const premix = unwrap(
  fs.readFileSync(
    path.join(root, "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)", "World.csav")
  )
);
for (const s of [
  "SurvivalModeManagerComponent",
  "TimeOfDay",
  "DayNight",
  "Calendar",
  "GameHour",
  "CurrentTime",
  "WorldTime",
]) {
  const i = premix.indexOf(s);
  if (i >= 0) {
    console.log(
      "time",
      s,
      "@",
      i,
      premix.toString("latin1", i, i + 120).replace(/[^\x20-\x7E]/g, ".")
    );
    console.log(
      "hex",
      [...premix.subarray(i + s.length + 1, i + s.length + 1 + 48)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ")
    );
  }
}

// Hauling on host
const host = unwrap(
  fs.readFileSync(
    path.join(root, "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)", "HostPlayer.csav")
  )
);
const HAUL = "/Script/Maine.HaulingComponent";
const hAt = host.indexOf(HAUL);
console.log(
  "haul ascii",
  host.toString("latin1", hAt, hAt + 400).replace(/[^\x20-\x7E]/g, ".")
);
