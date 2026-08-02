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
const world = unwrap(fs.readFileSync(path.join(slot, "World.csav")));
const PARTY = "/Script/Maine.PartyComponent";
const at = world.indexOf(PARTY);
console.log("Party at", at);
console.log(
  "before12",
  [...world.subarray(at - 16, at)].map((b) => b.toString(16).padStart(2, "0")).join(" "),
  "science?",
  world.readUInt32LE(at - 12)
);
console.log(
  "after",
  [...world.subarray(at + PARTY.length + 1, at + PARTY.length + 1 + 64)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
);
console.log(
  "ascii+2k",
  world
    .subarray(at, at + 2500)
    .toString("latin1")
    .replace(/[^\x20-\x7E]/g, ".")
);

// FStrings after party
function harvest(from, to) {
  const out = [];
  for (let o = from; o < to - 4; o++) {
    const len = world.readInt32LE(o);
    if (len < 4 || len > 100 || o + 4 + len > to) continue;
    const raw = world.subarray(o + 4, o + 4 + len - 1);
    if (![...raw].every((c) => c >= 32 && c < 127)) continue;
    const s = raw.toString("ascii");
    if (/^[A-Za-z0-9_./]+$/.test(s) && s.length >= 3) {
      out.push(s);
      o += 3 + len;
    }
  }
  return out;
}
const strs = harvest(at, at + 8000);
console.log(
  "\nunique strings",
  [...new Set(strs)].filter((s) => /Recipe|Tech|Know|Item|Build|Craft|Science|Chip|BURG|Unlock/i.test(s)).slice(0, 80)
);
console.log("sample", [...new Set(strs)].slice(0, 40));
