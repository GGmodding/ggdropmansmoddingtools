const fs = require("fs");
const scene = fs.readFileSync("C:/Users/Owner/Desktop/slot0000/scene-objects.bin");

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

function parseFields(buf, start, end, limit = 5000) {
  let i = start;
  const fields = [];
  while (i < end && fields.length < limit) {
    const tagAt = i;
    const tag = buf[i];
    const field = tag >> 3,
      wt = tag & 7;
    if (field === 0 || field > 2000) {
      fields.push({ err: "bad", tagAt, tag });
      break;
    }
    i++;
    if (wt === 0) {
      const [v, ni] = readVarint(buf, i);
      fields.push({ field, wt: "v", v, tagAt, next: ni });
      i = ni;
    } else if (wt === 2) {
      const [len, ni] = readVarint(buf, i);
      const dataStart = ni;
      const dataEnd = ni + len;
      if (dataEnd > end + 100000) {
        fields.push({ err: "huge", field, len, tagAt });
        break;
      }
      fields.push({
        field,
        wt: "b",
        len,
        tagAt,
        dataStart,
        dataEnd,
        preview: buf.subarray(dataStart, Math.min(dataEnd, dataStart + 40)).toString("hex"),
      });
      i = dataEnd;
    } else if (wt === 5) {
      fields.push({ field, wt: "f32", tagAt, float: buf.readFloatLE(i) });
      i += 4;
    } else if (wt === 1) {
      fields.push({ field, wt: "f64", tagAt });
      i += 8;
    } else {
      fields.push({ err: "wt", field, wt, tagAt });
      break;
    }
  }
  return { fields, i };
}

// Bytes before Player at 3252
const playerAt = 3252;
console.log("before Player:\n", scene.subarray(playerAt - 80, playerAt + 16).toString("hex"));
let a = "";
for (const b of scene.subarray(playerAt - 80, playerAt + 16))
  a += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
console.log(a);

// Find GameObject-like length prefix that contains Player
// Look for 0x12 <len> that spans Player
for (let back = 1; back < 100; back++) {
  const i = playerAt - back;
  if (scene[i] !== 0x12 && scene[i] !== 0x1a && scene[i] !== 0x22 && scene[i] !== 0x0a)
    continue;
  try {
    const [len, ni] = readVarint(scene, i + 1);
    if (ni + len > playerAt && ni <= playerAt && len < 500000) {
      console.log(
        `container tag=0x${scene[i].toString(16)} field=${scene[i] >> 3} at ${i} len=${len} covers Player, ends=${ni + len}`
      );
    }
  } catch (_) {}
}

// Hypothesis: after IsEnabled, Player fields are INLINE without d2 wrapper.
// The d2 might be mis-synced. Try parsing from AFTER d2 blob as continuation,
// treating 28 as knownTech and 3a as journal.

const afterD2 = 3452;
console.log("\nRaw from 3452:", scene.subarray(3452, 3452 + 100).toString("hex"));

// Find all 0x3a (field7) and 0x42 (field8) and 0x4a (field9) in a 10KB window from Player
const window = scene.subarray(playerAt, playerAt + 12000);
function findTags(tagByte, label) {
  const hits = [];
  for (let i = 0; i < window.length; i++) {
    if (window[i] === tagByte) {
      const [len, ni] = readVarint(window, i + 1);
      if (len > 0 && len < 500 && ni + len <= window.length) {
        const slice = window.subarray(ni, ni + len);
        let printable = 0;
        for (const b of slice) if (b >= 32 && b <= 126) printable++;
        // nested key?
        let key = null;
        if (slice[0] === 0x0a) {
          const [klen, kni] = readVarint(slice, 1);
          if (klen < 80 && kni + klen <= slice.length) {
            const ks = slice.subarray(kni, kni + klen);
            let ok = true;
            for (const b of ks) if (b < 32 || b > 126) ok = false;
            if (ok) key = ks.toString("utf8");
          }
        }
        hits.push({ at: playerAt + i, len, key, ratio: printable / len });
      }
    }
  }
  console.log(`\n${label} tag 0x${tagByte.toString(16)} candidates`, hits.length);
  console.log(hits.filter((h) => h.key).slice(0, 50));
  return hits.filter((h) => h.key);
}

const journalHits = findTags(0x3a, "journal/f7");
const encyHits = findTags(0x42, "encyclopedia/f8");
const scannerHits = findTags(0x4a, "scanner/f9");

// Also search whole scene for encyclopedia-like dict entries: 42 <len> 0a <klen> key 12/0d timestamp
console.log("\n=== Scene-wide encyclopedia-shaped entries (field 8) ===");
const encyAll = [];
for (let i = 0; i < scene.length - 3; i++) {
  if (scene[i] !== 0x42) continue;
  const [len, ni] = readVarint(scene, i + 1);
  if (len < 4 || len > 120 || ni + len > scene.length) continue;
  const slice = scene.subarray(ni, ni + len);
  if (slice[0] !== 0x0a) continue;
  const [klen, kni] = readVarint(slice, 1);
  if (klen < 2 || klen > 60 || kni + klen > slice.length) continue;
  const keyBuf = slice.subarray(kni, kni + klen);
  let ok = true;
  for (const b of keyBuf) if (b < 33 || b > 126) ok = false;
  if (!ok) continue;
  const key = keyBuf.toString("utf8");
  // value should follow: typically 0x12 (message) or 0x0d (float timestamp field1 wt5)
  const rest = slice.subarray(kni + klen);
  let ts = null;
  if (rest[0] === 0x0d && rest.length >= 5) ts = rest.readFloatLE(1);
  else if (rest[0] === 0x12) {
    const [vlen, vni] = readVarint(rest, 1);
    const val = rest.subarray(vni, vni + vlen);
    if (val[0] === 0x0d && val.length >= 5) ts = val.readFloatLE(1);
    else if (val[0] === 0x0d) {
    }
    // Entry.timestamp ProtoMember likely 1 as fixed32 float => tag 0x0d
    for (let j = 0; j + 4 < val.length; j++) {
      if (val[j] === 0x0d) {
        ts = val.readFloatLE(j + 1);
        break;
      }
    }
  }
  // Filter to plausible ency keys
  if (
    /^(Goal_|OnPlay|OnCraft|OnConstruct|Story_|Radio|Player|Unlock|Repair|Secondary|Lifepod|Infection_|Captain|Outer|Jelly|TimeCapsule|Rocket|RadSuit)/.test(
      key
    ) ||
    /^[A-Z][A-Za-z0-9_]+$/.test(key)
  ) {
    encyAll.push({ at: i, key, ts, len });
  }
}
console.log("shaped count", encyAll.length);
console.log(encyAll.slice(0, 80));

// Check ProtoMember on PDAEncyclopedia.Entry / PDALog.Entry / PDAScanner.Data
const dll = fs.readFileSync(
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/Managed/Assembly-CSharp.dll"
);

// Quick: reuse simplified CA scan for nested Entry types by field name timestamp/techType/version/fragments
function scanProtoForFields(typeNames) {
  // Minimal metadata walk - copy working bits from ency4 by requiring output of field tags
  // Use string search in IL for ProtoMember is hard; instead parse CustomAttribute with field parent matching Field rows named timestamp etc.
}

// Extract keys from English.json that appear as raw strings in scene (unlocked ency?)
const eng = JSON.parse(
  fs.readFileSync(
    "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/StreamingAssets/SNUnmanagedData/LanguageFiles/English.json",
    "utf8"
  )
);
const encyKeys = Object.keys(eng)
  .filter((k) => k.startsWith("Ency_") && !k.startsWith("EncyDesc_"))
  .map((k) => k.slice(5));
console.log("\nEncy keys total", encyKeys.length);
const present = [];
const absent = [];
for (const k of encyKeys) {
  const b = Buffer.from(k);
  if (scene.indexOf(b) >= 0) present.push(k);
  else absent.push(k);
}
console.log("Ency keys present as strings in scene-objects:", present.length);
console.log(present.sort().join(", "));
console.log("sample absent:", absent.slice(0, 30).join(", "));

// Where are present keys located - near Player?
console.log("\nLocations of present ency keys:");
for (const k of present.slice(0, 60)) {
  const b = Buffer.from(k);
  let idx = scene.indexOf(b);
  const locs = [];
  while (idx >= 0 && locs.length < 3) {
    locs.push(idx);
    idx = scene.indexOf(b, idx + 1);
  }
  const nearPlayer = locs.some((x) => x > playerAt && x < playerAt + 15000);
  const nearSgm = locs.some((x) => x > 600 && x < 3000);
  console.log(k, locs, nearPlayer ? "nearPlayer" : "", nearSgm ? "nearSGM" : "");
}
