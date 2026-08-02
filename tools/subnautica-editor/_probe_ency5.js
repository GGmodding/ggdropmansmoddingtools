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

function parseFields(payload, limit = 5000) {
  let i = 0;
  const fields = [];
  while (i < payload.length && fields.length < limit) {
    const tagAt = i;
    const tag = payload[i];
    const field = tag >> 3,
      wt = tag & 7;
    if (field === 0 || field > 500) {
      fields.push({ err: "bad", i, tag });
      break;
    }
    i++;
    if (wt === 0) {
      const [v, ni] = readVarint(payload, i);
      fields.push({ field, wt: "v", v, tagAt });
      i = ni;
    } else if (wt === 2) {
      const [len, ni] = readVarint(payload, i);
      i = ni;
      const slice = payload.subarray(i, i + Math.min(len, payload.length - i));
      i += len;
      let printable = 0,
        ascii = "";
      for (const b of slice) {
        if (b >= 32 && b <= 126) {
          printable++;
          ascii += String.fromCharCode(b);
        } else ascii += ".";
      }
      const info = {
        field,
        wt: "b",
        len,
        tagAt,
        ascii: ascii.slice(0, 80),
      };
      if (slice.length && printable / slice.length > 0.85)
        info.str = slice.toString("utf8");
      // nested peek
      if (!info.str && slice.length > 0 && slice.length < 500) {
        try {
          info.nested = parseFields(slice, 20);
        } catch (_) {}
      }
      fields.push(info);
    } else if (wt === 5) {
      fields.push({
        field,
        wt: "f32",
        hex: Buffer.from(payload.subarray(i, i + 4)).toString("hex"),
        float: payload.readFloatLE(i),
        tagAt,
      });
      i += 4;
    } else if (wt === 1) {
      fields.push({ field, wt: "f64", tagAt });
      i += 8;
    } else {
      fields.push({ err: "wt", field, wt, i: tagAt });
      break;
    }
  }
  return { fields, end: i };
}

// Find Player component header
const namePat = Buffer.from([0x0a, 0x06, 0x50, 0x6c, 0x61, 0x79, 0x65, 0x72]);
let at = -1;
for (let i = 0; i < scene.length; i++) {
  if (scene.compare(namePat, 0, 8, i, i + 8) === 0 && scene[i + 8] === 0x10) {
    at = i;
    break;
  }
}
console.log("Player component at", at);
console.log("header", scene.subarray(at, at + 20).toString("hex"));

// Start of Player proto members after Name+IsEnabled
let i = at + 8; // after name
if (scene[i] === 0x10) {
  const [v, j] = readVarint(scene, i + 1);
  console.log("IsEnabled", v);
  i = j;
}
console.log("first member bytes", scene.subarray(i, i + 30).toString("hex"));

// Parse a large window as Player fields until next component
// Next component after Player in earlier probe was around LiveMixin or similar
// Use end heuristic: 0a <len> PascalName 10
const windowEnd = Math.min(scene.length, i + 20000);
const slice = scene.subarray(i, windowEnd);
const { fields, end } = parseFields(slice, 2000);
const counts = {};
for (const f of fields) if (f.field != null) counts[f.field] = (counts[f.field] || 0) + 1;
console.log("field counts in window", counts);
console.log("parsed bytes", end);

const NAMES = {
  1: "version",
  2: "serializedIsUnderwater",
  3: "serializedDepthClass",
  4: "serializedEscapePod",
  5: "knownTech",
  6: "currentSubUID",
  7: "journal",
  8: "encyclopedia",
  9: "scanner",
  10: "currentWaterParkUID",
  11: "usedTools",
  12: "precursorOutOfWater",
  13: "analyzedTech",
  14: "isSick",
  15: "notifications",
  16: "_displaySurfaceWater",
  17: "timeLastSleep",
  18: "infectionRevealed",
  19: "timeCapsules",
  20: "hasUsedConsole",
  21: "rotationX",
  22: "rotationY",
  23: "suffocationState",
  24: "suffocationProgress",
  25: "lastValidSubUID",
  26: "pins",
};

// Summarize each field number
for (const k of Object.keys(counts)
  .map(Number)
  .sort((a, b) => a - b)) {
  const fs_ = fields.filter((f) => f.field === k);
  const name = NAMES[k] || "?";
  if (k === 5 || k === 11 || k === 13 || k === 26) {
    const vals = fs_.filter((f) => f.wt === "v").map((f) => f.v);
    const blobs = fs_.filter((f) => f.wt === "b");
    console.log(
      `\n[${k}] ${name}: varints=${vals.length} sample=[${vals.slice(0, 8)}] blobs=${blobs.length}`,
      blobs[0] ? `blob0 len=${blobs[0].len}` : ""
    );
    if (blobs[0] && blobs[0].nested) {
      const nc = {};
      for (const n of blobs[0].nested.fields || blobs[0].nested)
        if (n.field != null) nc[n.field] = (nc[n.field] || 0) + 1;
      console.log("  blob0 nested counts", nc);
      // if nested looks like version+knownTech, note it
      const nestedFields = blobs[0].nested.fields || blobs[0].nested;
      console.log(
        "  blob0 nested head",
        nestedFields.slice(0, 10).map((n) =>
          n.wt === "v" ? `f${n.field}=${n.v}` : `f${n.field}:${n.wt}`
        )
      );
    }
  } else if (k === 7 || k === 8 || k === 19) {
    console.log(`\n[${k}] ${name}: count=${fs_.length}`);
    for (const f of fs_.slice(0, 15)) {
      if (f.nested) {
        const nested = f.nested.fields || f.nested;
        const kv = nested.map((n) => {
          if (n.str) return `f${n.field}="${n.str}"`;
          if (n.wt === "f32") return `f${n.field}=float:${n.float}`;
          if (n.wt === "v") return `f${n.field}=${n.v}`;
          return `f${n.field}:${n.wt}/${n.len || ""}`;
        });
        console.log(`  entry len=${f.len}`, kv.join(", "));
      } else {
        console.log(`  `, f.str || f.ascii || f);
      }
    }
    if (fs_.length > 15) console.log("  ...", fs_.length - 15, "more");
  } else if (k === 9) {
    console.log(`\n[${k}] ${name}: count=${fs_.length}`);
    for (const f of fs_.slice(0, 3)) {
      console.log("  len", f.len, "ascii", f.ascii);
      if (f.nested) {
        const nested = f.nested.fields || f.nested;
        const nc = {};
        for (const n of nested) if (n.field != null) nc[n.field] = (nc[n.field] || 0) + 1;
        console.log("  nested counts", nc);
        console.log(
          "  nested sample",
          nested.slice(0, 25).map((n) => {
            if (n.str) return `f${n.field}="${n.str}"`;
            if (n.wt === "v") return `f${n.field}=${n.v}`;
            if (n.wt === "f32") return `f${n.field}=f32:${n.float}`;
            if (n.wt === "b") return `f${n.field}:len=${n.len}:${n.ascii?.slice(0, 30)}`;
            return JSON.stringify(n).slice(0, 80);
          })
        );
      }
    }
  } else {
    const sample = fs_.slice(0, 5).map((f) => {
      if (f.wt === "v") return f.v;
      if (f.str) return JSON.stringify(f.str);
      if (f.wt === "f32") return f.float;
      return `${f.wt}:${f.len || f.hex || ""}`;
    });
    console.log(`[${k}] ${name}: n=${fs_.length} sample=`, sample);
  }
}

// Focus: all encyclopedia entries
const ency = fields.filter((f) => f.field === 8);
console.log("\n=== ALL ENCYCLOPEDIA ENTRIES ===", ency.length);
for (const f of ency) {
  const nested = (f.nested && (f.nested.fields || f.nested)) || [];
  const key = nested.find((n) => n.field === 1 && n.str)?.str;
  const ts = nested.find((n) => n.field === 2 && n.wt === "f32")?.float;
  const cap = nested.find((n) => n.field === 3 && n.str)?.str;
  console.log({ key, ts, cap, len: f.len });
}

// Journal keys
const journal = fields.filter((f) => f.field === 7);
console.log("\n=== JOURNAL ENTRIES ===", journal.length);
for (const f of journal.slice(0, 40)) {
  const nested = (f.nested && (f.nested.fields || f.nested)) || [];
  const key = nested.find((n) => n.field === 1 && n.str)?.str;
  const ts = nested.find((n) => n.field === 2 && n.wt === "f32")?.float;
  console.log({ key, ts });
}

// Get ProtoMember tags for PDAEncyclopedia.Entry and PDAScanner.Data
// Also extract English.json Ency keys
const eng =
  "C:/Program Files (x86)/Steam/steamapps/common/Subnautica/Subnautica_Data/StreamingAssets/SNUnmanagedData/LanguageFiles/English.json";
if (fs.existsSync(eng)) {
  const text = fs.readFileSync(eng, "utf8");
  const keys = new Set();
  const re = /"Ency_([A-Za-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(text))) keys.add(m[1]);
  // Also EncyDesc_
  const keys2 = new Set();
  const re2 = /"EncyDesc_([A-Za-z0-9_]+)"/g;
  while ((m = re2.exec(text))) keys2.add(m[1]);
  console.log("\nEnglish.json Ency_ keys", keys.size);
  console.log([...keys].sort().slice(0, 60).join(", "));
  console.log("EncyDesc_ keys", keys2.size);
  // keys that are in Ency_ but encyclopedia unlock uses the key without prefix
  console.log("total unique unlock ids", new Set([...keys, ...keys2]).size);
}
