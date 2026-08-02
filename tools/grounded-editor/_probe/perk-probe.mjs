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
  const u = b.readUInt32LE(0);
  return Buffer.from(oozDecompress(b.subarray(8, 8 + b.readUInt32LE(4)), u));
}
const host = unwrap(fs.readFileSync(path.join(slot, "HostPlayer.csav")));

const PERK = "/Script/Maine.PerkComponent";
const at = host.indexOf(PERK);
console.log("PerkComponent at", at);
console.log(
  "hex+200",
  [...host.subarray(at, at + 200)].map((b) => b.toString(16).padStart(2, "0")).join(" ")
);
console.log(
  "ascii+800",
  host
    .subarray(at, at + 1200)
    .toString("latin1")
    .replace(/[^\x20-\x7E]/g, ".")
);

// harvest FStrings after perk component
function readFString(buf, off) {
  if (off + 4 > buf.length) return null;
  const len = buf.readInt32LE(off);
  if (len <= 1 || len > 200 || off + 4 + len > buf.length) return null;
  const raw = buf.subarray(off + 4, off + 4 + len - 1);
  for (const c of raw) if (c < 32 || c > 126) return null;
  return { s: raw.toString("ascii"), next: off + 4 + len, off, len };
}

const strings = [];
for (let o = at; o < at + 4000; o++) {
  const fs2 = readFString(host, o);
  if (fs2 && fs2.s.length >= 3) {
    strings.push({ o: fs2.off, s: fs2.s });
    o = fs2.next - 1;
  }
}
console.log(
  "\nstrings",
  strings.filter((x) => /Perk|Mutat|Charm|Trait|Buff|Upgrade|None|^[A-Z][a-zA-Z0-9_]{2,40}$/.test(x.s)).slice(0, 80)
);

// Find next /Script/Maine after perk
const nextScript = host.indexOf("/Script/Maine.", at + PERK.length);
console.log("\nnext script", nextScript, host.toString("latin1", nextScript, nextScript + 80));
