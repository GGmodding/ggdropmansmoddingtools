const fs = require("fs");
const scene = fs.readFileSync("C:/Users/Owner/Desktop/slot0000/scene-objects.bin");
const dll = fs.readFileSync(
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/Managed/Assembly-CSharp.dll"
);

function readVarint(buf, i) {
  let x = 0,
    s = 0;
  while (i < buf.length) {
    const b = buf[i++];
    x |= (b & 127) << s;
    if (!(b & 128)) break;
    s += 7;
    if (s > 56) break;
  }
  return [x >>> 0, i];
}

function parseMsg(buf) {
  let i = 0;
  const fields = [];
  while (i < buf.length) {
    const tag = buf[i];
    const field = tag >> 3,
      wt = tag & 7;
    if (field === 0 || field > 1000) break;
    i++;
    if (wt === 0) {
      const [v, ni] = readVarint(buf, i);
      fields.push({ field, wt: "v", v });
      i = ni;
    } else if (wt === 2) {
      const [len, ni] = readVarint(buf, i);
      i = ni;
      const slice = buf.subarray(i, i + len);
      i += len;
      let str = null,
        printable = 0;
      for (const b of slice) if (b >= 32 && b <= 126) printable++;
      if (slice.length && printable / slice.length > 0.9) str = slice.toString("utf8");
      fields.push({
        field,
        wt: "b",
        len,
        str,
        hex: slice.toString("hex"),
        nested: str ? null : parseMsg(slice),
      });
    } else if (wt === 5) {
      fields.push({ field, wt: "f32", float: buf.readFloatLE(i), hex: buf.subarray(i, i + 4).toString("hex") });
      i += 4;
    } else if (wt === 1) {
      fields.push({ field, wt: "f64" });
      i += 8;
    } else break;
  }
  return fields;
}

// Dump first encyclopedia entries in full
console.log("=== Encyclopedia entry wire format ===");
const encyStarts = [4955, 4972, 5000, 5331, 5451, 5660];
for (const at of encyStarts) {
  console.log("\n@", at, "hex", scene.subarray(at, at + 50).toString("hex"));
  if (scene[at] !== 0x42) {
    console.log("not 0x42");
    continue;
  }
  const [len, ni] = readVarint(scene, at + 1);
  const slice = scene.subarray(ni, ni + len);
  console.log("len", len, "fields", JSON.stringify(parseMsg(slice), null, 2));
}

// Dump journal entry
console.log("\n=== Journal entry wire format ===");
for (const at of [3505, 3765, 5660]) {
  if (scene[at] !== 0x3a && at !== 5660) {
    /* journal */
  }
}
for (const at of [3505, 3765, 4074]) {
  console.log("\n@", at, "hex", scene.subarray(at, at + 40).toString("hex"));
  const [len, ni] = readVarint(scene, at + 1);
  console.log("fields", JSON.stringify(parseMsg(scene.subarray(ni, ni + len)), null, 2));
}

// Find scanner field 9 after encyclopedia block
// Encyclopedia seems to end around 6550; look for 0x4a
console.log("\n=== Scanner (field 9) search near Player ===");
for (let i = 4900; i < 8000; i++) {
  if (scene[i] !== 0x4a) continue;
  const [len, ni] = readVarint(scene, i + 1);
  if (len < 2 || len > 2000) continue;
  // scanner Data usually starts with version field 08
  if (scene[ni] === 0x08 || scene[ni] === 0x12 || scene[ni] === 0x1a || scene[ni] === 0x22) {
    const slice = scene.subarray(ni, ni + len);
    console.log("possible scanner @", i, "len", len);
    console.log(JSON.stringify(parseMsg(slice), null, 2).slice(0, 2000));
  }
}

// Determine Player component total span: from Player name to next component at same level
// After encyclopedia, next might be field 10+ or next component LiveMixin etc.
console.log("\n=== Bytes after last ency-ish region ===");
console.log(scene.subarray(6520, 6700).toString("hex"));
let ascii = "";
for (const b of scene.subarray(6520, 6700)) ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
console.log(ascii);

// ProtoMember on nested Entry types via metadata (compact)
function getEntryProtoMembers() {
  const e_lfanew = dll.readUInt32LE(0x3c);
  const coff = e_lfanew + 4;
  const numSections = dll.readUInt16LE(coff + 2);
  const optSize = dll.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const isPE32Plus = dll.readUInt16LE(opt) === 0x20b;
  const cliRva = dll.readUInt32LE(opt + (isPE32Plus ? 112 : 96) + 14 * 8);
  const sections = [];
  for (let i = 0; i < numSections; i++) {
    const o = opt + optSize + i * 40;
    sections.push({
      va: dll.readUInt32LE(o + 12),
      vsize: dll.readUInt32LE(o + 8),
      rawSize: dll.readUInt32LE(o + 16),
      rawPtr: dll.readUInt32LE(o + 20),
    });
  }
  const rvaToOff = (rva) => {
    for (const s of sections)
      if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize))
        return s.rawPtr + (rva - s.va);
    return -1;
  };
  const metaOff = rvaToOff(dll.readUInt32LE(rvaToOff(cliRva) + 8));
  const verLen = dll.readUInt32LE(metaOff + 12);
  const verPad = (verLen + 3) & ~3;
  let nStreams = dll.readUInt16LE(metaOff + 16 + verPad + 2);
  let p = metaOff + 16 + verPad + 4;
  const streams = {};
  for (let i = 0; i < nStreams; i++) {
    const off = dll.readUInt32LE(p);
    let name = "",
      q = p + 8;
    while (dll[q]) name += String.fromCharCode(dll[q++]);
    q++;
    while ((q - (p + 8)) % 4) q++;
    streams[name] = { off: metaOff + off };
    p = q;
  }
  const getStr = (idx) => {
    let i = streams["#Strings"].off + idx,
      s = "";
    while (dll[i]) s += String.fromCharCode(dll[i++]);
    return s;
  };
  const heapSizes = dll[streams["#~"].off + 6];
  const stringIdxSize = heapSizes & 1 ? 4 : 2;
  const guidIdxSize = heapSizes & 2 ? 4 : 2;
  const blobIdxSize = heapSizes & 4 ? 4 : 2;
  const valid = dll.readBigUInt64LE(streams["#~"].off + 8);
  let rcOff = streams["#~"].off + 24;
  const rowCounts = {};
  for (let bit = 0; bit < 64; bit++) {
    if ((valid >> BigInt(bit)) & 1n) {
      rowCounts[bit] = dll.readUInt32LE(rcOff);
      rcOff += 4;
    }
  }
  // We already validated row sizes in ency4 - reuse same formulas briefly by calling known offsets from previous successful run
  // Instead: find Field rows named timestamp under types, match CA
  // Simpler approach: from wire format we SEE timestamp as field1 fixed32 (0x0d)

  // Confirm: dump Readme entry raw
}

// Collect ALL encyclopedia keys from save
const keys = [];
for (let i = 4900; i < 6700; i++) {
  if (scene[i] !== 0x42) continue;
  const [len, ni] = readVarint(scene, i + 1);
  if (len < 4 || len > 80 || ni + len > scene.length) continue;
  const slice = scene.subarray(ni, ni + len);
  const fields = parseMsg(slice);
  const keyF = fields.find((f) => f.field === 1 && f.str);
  const valF = fields.find((f) => f.field === 2);
  if (!keyF) continue;
  let ts = null,
    cap = null;
  if (valF) {
    if (valF.wt === "f32") ts = valF.float;
    else if (valF.nested) {
      const t = valF.nested.find((x) => x.field === 1 && x.wt === "f32");
      const c = valF.nested.find((x) => x.field === 2 && x.str);
      if (t) ts = t.float;
      if (c) cap = c.str;
    }
  }
  // also field1 float directly
  const tDirect = fields.find((f) => f.field === 1 && f.wt === "f32");
  keys.push({ at: i, key: keyF.str, ts, cap, fields });
}
// dedupe by increasing at
const uniq = [];
let last = -1;
for (const k of keys) {
  if (k.at <= last) continue;
  uniq.push(k);
  last = k.at + 1;
}
console.log("\n=== Unlocked encyclopedia in save ===", uniq.length);
for (const k of uniq) console.log(`- ${k.key} ts=${k.ts}`);

// English.json keys (strip comments)
const engPath =
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/StreamingAssets/SNUnmanagedData/LanguageFiles/English.json";
let engText = fs.readFileSync(engPath, "utf8");
// remove // comments
engText = engText.replace(/^\s*\/\/.*$/gm, "");
const encyLang = new Set();
const re = /"Ency_([A-Za-z0-9_]+)"\s*:/g;
let m;
while ((m = re.exec(engText))) encyLang.add(m[1]);
console.log("\nLanguage Ency_ unlock ids", encyLang.size);
const unlocked = new Set(uniq.map((u) => u.key));
const missing = [...encyLang].filter((k) => !unlocked.has(k));
console.log("unlocked intersecting language", [...unlocked].filter((k) => encyLang.has(k)).length);
console.log("missing from save (sample 40):", missing.slice(0, 40).join(", "));

// StoryGoalManager header decode
console.log("\n=== StoryGoalManager header ===");
const sgm = scene.indexOf(Buffer.from("Story.StoryGoalManager"));
const sgmData = sgm + Buffer.from("Story.StoryGoalManager").length;
console.log(scene.subarray(sgmData, sgmData + 30).toString("hex"));
// Try: after 10 01, parse as if multi-byte tag for field with dictionary
let i = sgmData;
if (scene[i] === 0x10) {
  const [, j] = readVarint(scene, i + 1);
  i = j;
}
// protobuf-net HashSet/List of strings as repeated field1 or field2
// header d5 10 08 03 — maybe field 26 fixed? Or version in a wrapper
// Try interpret d2-style with wrong byte: what if it's da?
console.log("Trying parse from first 0x12");
const first12 = scene.indexOf(0x12, i);
const goals = [];
let g = first12;
while (g < sgm + 2500 && scene[g] === 0x12) {
  const [len, ni] = readVarint(scene, g + 1);
  goals.push(scene.subarray(ni, ni + len).toString("utf8"));
  g = ni + len;
}
console.log("goals via 0x12 run", goals.length);

// ProtoMember Entry confirmation from wire:
console.log("\nEntry format conclusion from Readme:");
const [rlen, rni] = readVarint(scene, 4956);
const readme = scene.subarray(rni, rni + rlen);
console.log([...readme].map((b) => b.toString(16).padStart(2, "0")).join(" "));
console.log(parseMsg(readme));
