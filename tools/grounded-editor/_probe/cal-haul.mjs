import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}
const root = path.join(process.env.USERPROFILE, "Saved Games", "Grounded");
const world = unwrap(
  fs.readFileSync(
    path.join(root, "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)", "World.csav")
  )
);
const CAL = "/Script/Maine.CalendarComponent";
const at = world.indexOf(CAL);
console.log("cal at", at);
console.log(
  "ascii",
  world.toString("latin1", at, at + 80).replace(/[^\x20-\x7E]/g, ".")
);
const data = at + CAL.length + 1;
console.log(
  "hex32",
  [...world.subarray(data, data + 32)].map((b) => b.toString(16).padStart(2, "0")).join(" ")
);
console.log("u32s", [0, 4, 8, 12, 16, 20].map((o) => world.readUInt32LE(data + o)));
console.log("floats", [0, 4, 8, 12, 16, 20].map((o) => world.readFloatLE(data + o)));
console.log("double0", world.readDoubleLE(data));
console.log("double4", world.readDoubleLE(data + 4));

// Hauling items
const host = unwrap(
  fs.readFileSync(
    path.join(root, "(ID-4DD8442A4687D7E8BAE17CB4E35EB382)(PREMIX)", "HostPlayer.csav")
  )
);
const HAUL = "/Script/Maine.HaulingComponent";
const hAt = host.indexOf(HAUL);
const FULL = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
let i = hAt;
const names = [];
const end = host.indexOf("/Script/Maine.HeatHazardComponent", hAt);
while (i < end) {
  const t = host.indexOf(FULL, i);
  if (t < 0 || t >= end) break;
  const len = host.readInt32LE(t + FULL.length + 1);
  const name = host.toString("ascii", t + FULL.length + 5, t + FULL.length + 5 + len - 1);
  names.push(name);
  i = t + 1;
}
console.log("haul items", names);
console.log(
  "haul hdr",
  [...host.subarray(hAt + HAUL.length + 1, hAt + HAUL.length + 1 + 24)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
);
