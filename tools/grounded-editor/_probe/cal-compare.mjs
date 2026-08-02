import { decompress as oozDecompress } from "ooz-wasm";
import fs from "fs";
import path from "path";

function unwrap(b) {
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), b.readUInt32LE(0)));
}
const root = path.join(process.env.USERPROFILE, "Saved Games", "Grounded");
const CAL = "/Script/Maine.CalendarComponent";

for (const name of fs.readdirSync(root).filter((n) => /GameTime|PREMIX|LOGOUT/i.test(n)).slice(0, 8)) {
  const wp = path.join(root, name, "World.csav");
  if (!fs.existsSync(wp)) continue;
  try {
    const world = unwrap(fs.readFileSync(wp));
    const at = world.indexOf(CAL);
    if (at < 0) continue;
    const data = at + CAL.length + 1;
    const hex = [...world.subarray(data, data + 16)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const f5 = world.readFloatLE(data + 5);
    const f4 = world.readFloatLE(data + 4);
    const f8 = world.readFloatLE(data + 8);
    console.log(name.slice(0, 55), "hex", hex, "f4", f4.toFixed(2), "f5", f5.toFixed(2), "f8", f8.toFixed(2));
  } catch (e) {
    console.log(name, e.message);
  }
}
