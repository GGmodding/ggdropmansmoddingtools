const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "out");
const hp = fs.readFileSync(path.join(outDir, "HostPlayer.bin"));
const world = fs.readFileSync(path.join(outDir, "World.bin"));

function findAscii(buf, needle) {
  const enc = Buffer.from(needle, "ascii");
  const hits = [];
  let i = 0;
  while (i < buf.length - enc.length) {
    const at = buf.indexOf(enc, i);
    if (at < 0) break;
    hits.push(at);
    i = at + 1;
  }
  return hits;
}

function dumpAround(buf, at, before = 32, after = 64) {
  const start = Math.max(0, at - before);
  const end = Math.min(buf.length, at + after);
  const slice = buf.subarray(start, end);
  const hex = [...slice].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const ascii = [...slice]
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
    .join("");
  return { start, hex, ascii };
}

function readFStringAt(buf, o) {
  if (o + 4 > buf.length) return null;
  const len = buf.readInt32LE(o);
  if (len === 0) return { value: "", end: o + 4 };
  if (len > 0 && len < 2000 && o + 4 + len <= buf.length) {
    let s = buf.toString("utf8", o + 4, o + 4 + len);
    if (s.endsWith("\0")) s = s.slice(0, -1);
    return { value: s, end: o + 4 + len, len };
  }
  if (len < 0) {
    const chars = -len;
    const bytes = chars * 2;
    if (o + 4 + bytes > buf.length) return null;
    let s = buf.toString("utf16le", o + 4, o + 4 + bytes);
    if (s.endsWith("\0")) s = s.slice(0, -1);
    return { value: s, end: o + 4 + bytes, len };
  }
  return null;
}

const markers = [
  "MaxHealth",
  "Health",
  "Hunger",
  "Thirst",
  "Stamina",
  "Oxygen",
  "RawScience",
  "CurrentRawScience",
  "Science",
  "MilkMolar",
  "MilkMolars",
  "Inventory",
  "Backpack",
  "ItemCount",
  "StackCount",
  "Count",
  "Brainpower",
  "PlayerName",
  "DisplayName",
  "CurrentHealth",
  "HealthComponent",
  "InventoryComponent",
  "PlayerStatsComponent",
  "CustomProperty",
];

console.log("=== HostPlayer markers ===");
for (const m of markers) {
  const hits = findAscii(hp, m);
  if (!hits.length) continue;
  console.log(`\n${m}: ${hits.length} hits`);
  for (const at of hits.slice(0, 5)) {
    const d = dumpAround(hp, at, 24, m.length + 48);
    console.log(`  @${at}`, d.ascii);
    // try floats nearby
    const floats = [];
    for (let off = at + m.length; off < at + m.length + 40 && off + 4 <= hp.length; off++) {
      const f = hp.readFloatLE(off);
      if (Number.isFinite(f) && f > 0 && f <= 1000) floats.push({ off, f: +f.toFixed(3) });
      const i = hp.readInt32LE(off);
      if (i > 0 && i < 1e7) floats.push({ off, i });
    }
    console.log("   nearby:", JSON.stringify(floats.slice(0, 12)));
  }
}

console.log("\n=== World markers (science/molar) ===");
for (const m of ["RawScience", "CurrentRawScience", "MilkMolar", "SciencePoints", "GlobalRawScience", "PartyRawScience"]) {
  const hits = findAscii(world, m);
  console.log(`${m}: ${hits.length}`);
  for (const at of hits.slice(0, 3)) {
    const d = dumpAround(world, at, 16, m.length + 40);
    console.log(`  @${at}`, d.ascii);
    const nums = [];
    for (let off = at + m.length; off < at + m.length + 48 && off + 4 <= world.length; off++) {
      const f = world.readFloatLE(off);
      const i = world.readInt32LE(off);
      if (Number.isFinite(f) && f > 0 && f < 1e9) nums.push({ off, f: +f.toFixed(2) });
      if (i > 0 && i < 1e9) nums.push({ off, i });
    }
    console.log("   nearby:", JSON.stringify(nums.slice(0, 15)));
  }
}

// UE-style property scan: Name\0 + Type\0 pattern loosely
console.log("\n=== HostPlayer property-ish names near HealthComponent ===");
const hc = findAscii(hp, "/Script/Maine.HealthComponent");
if (hc.length) {
  const region = hp.subarray(hc[0], Math.min(hp.length, hc[0] + 800));
  const strings = [];
  let cur = "";
  let start = 0;
  for (let i = 0; i < region.length; i++) {
    const c = region[i];
    if (c >= 32 && c < 127) {
      if (!cur) start = i;
      cur += String.fromCharCode(c);
    } else {
      if (cur.length >= 3) strings.push({ at: hc[0] + start, s: cur });
      cur = "";
    }
  }
  console.log(strings.map((x) => `${x.at}:${x.s}`).join("\n"));
}

// Look for FloatProperty / IntProperty style
for (const prop of ["FloatProperty", "IntProperty", "BoolProperty", "StrProperty", "NameProperty", "StructProperty"]) {
  console.log(`${prop} in HP:`, findAscii(hp, prop).length, "World:", findAscii(world, prop).length);
}

// Check for GVAS magic
console.log("HP head hex:", [...hp.subarray(0, 32)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
console.log("World head hex:", [...world.subarray(0, 32)].map((b) => b.toString(16).padStart(2, "0")).join(" "));

// Parse header file
const hdr = fs.readFileSync(path.join(outDir, "SaveGameHeaderData.savheader"));
console.log("\n=== Header parse attempt ===");
let o = 0;
function ru32() {
  const v = hdr.readUInt32LE(o);
  o += 4;
  return v;
}
function rstr() {
  const len = hdr.readInt32LE(o);
  o += 4;
  if (len <= 0) return "";
  const s = hdr.toString("utf8", o, o + len - (hdr[o + len - 1] === 0 ? 1 : 0));
  o += len;
  return s.replace(/\0$/, "");
}
console.log("field0", ru32(), "field1", ru32());
console.log("version", rstr());
console.log("rest hex from", o, [...hdr.subarray(o)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
