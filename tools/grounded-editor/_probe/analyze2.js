const fs = require("fs");
const path = require("path");
const hp = fs.readFileSync(path.join(__dirname, "out", "HostPlayer.bin"));

function findAscii(buf, needle) {
  const enc = Buffer.from(needle, "ascii");
  const hits = [];
  let i = 0;
  while (true) {
    const at = buf.indexOf(enc, i);
    if (at < 0) break;
    hits.push(at);
    i = at + 1;
  }
  return hits;
}

function dump(buf, at, before, after) {
  const s = Math.max(0, at - before);
  const e = Math.min(buf.length, at + after);
  const slice = buf.subarray(s, e);
  console.log(
    `@${at} [${s}..${e}]`,
    [...slice].map((b) => b.toString(16).padStart(2, "0")).join(" ")
  );
  console.log(
    "ascii:",
    [...slice].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("")
  );
}

// SurvivalComponent region
const surv = findAscii(hp, "/Script/Maine.SurvivalComponent")[0];
console.log("SurvivalComponent at", surv);
dump(hp, surv, 16, 200);

// HealthComponent region with more context
const hc = findAscii(hp, "/Script/Maine.HealthComponent")[0];
dump(hp, hc, 32, 120);

// Search for float 100.0 and 200.0 etc near those regions
function findFloatsNear(center, radius, pred) {
  const out = [];
  const start = Math.max(0, center - radius);
  const end = Math.min(hp.length - 4, center + radius);
  for (let i = start; i <= end; i++) {
    const f = hp.readFloatLE(i);
    if (pred(f)) out.push({ i, f });
  }
  return out;
}

console.log(
  "\nFloats 1..200 near HealthComponent:",
  findFloatsNear(hc, 300, (f) => f >= 1 && f <= 200 && Number.isFinite(f)).slice(0, 40)
);
console.log(
  "\nFloats 1..200 near SurvivalComponent:",
  findFloatsNear(surv, 400, (f) => f >= 1 && f <= 200 && Number.isFinite(f)).slice(0, 40)
);

// Look for exactly 100.0
const exactly = [];
for (let i = 0; i < hp.length - 4; i++) {
  const f = hp.readFloatLE(i);
  if (f === 100 || f === 200 || f === 50 || Math.abs(f - 100) < 0.001) {
    exactly.push({ i, f });
  }
}
console.log("\nExact 50/100/200 floats:", exactly);

// Parse possible name table at start
let o = 0;
const a = hp.readUInt32LE(o); o += 4;
const b = hp.readUInt32LE(o); o += 4;
const c = hp.readUInt32LE(o); o += 4;
const d = hp.readUInt32LE(o); o += 4;
const e = hp.readUInt32LE(o); o += 4;
const f = hp.readUInt32LE(o); o += 4;
const nameCount = hp.readUInt32LE(o); o += 4;
const g = hp.readUInt32LE(o); o += 4;
console.log({ a, b, c, d, e, f, nameCount, g, nextOff: o });

// Try reading nameCount FStrings
const names = [];
for (let n = 0; n < Math.min(nameCount, 40); n++) {
  if (o + 4 > hp.length) break;
  const len = hp.readInt32LE(o);
  o += 4;
  if (len > 0 && len < 500 && o + len <= hp.length) {
    let s = hp.toString("utf8", o, o + len);
    o += len;
    if (s.endsWith("\0")) s = s.slice(0, -1);
    names.push(s);
  } else if (len < 0 && -len < 500) {
    const bytes = (-len) * 2;
    let s = hp.toString("utf16le", o, o + bytes);
    o += bytes;
    if (s.endsWith("\0")) s = s.slice(0, -1);
    names.push(s);
  } else {
    names.push(`BAD_LEN_${len}_at_${o - 4}`);
    break;
  }
}
console.log("first names:", names);

// Search world for party science-like property names
const world = fs.readFileSync(path.join(__dirname, "out", "World.bin"));
const wMarkers = [
  "PartyScience",
  "Science",
  "Molar",
  "BurgL",
  "Research",
  "Unlocked",
  "GameMode",
  "Difficulty",
  "CustomGame",
  "GameTime",
  "Day",
  "Hour",
];
for (const m of wMarkers) {
  const hits = findAscii(world, m);
  if (hits.length && hits.length < 30) {
    console.log(`\nWorld ${m} x${hits.length}`);
    for (const at of hits.slice(0, 4)) {
      const slice = world.subarray(Math.max(0, at - 8), Math.min(world.length, at + m.length + 32));
      console.log(
        " ",
        [...slice].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("")
      );
    }
  } else if (hits.length) {
    console.log(`World ${m} x${hits.length} (many)`);
  }
}
