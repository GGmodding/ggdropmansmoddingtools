const fs = require("fs");
const scene = fs.readFileSync("C:/Users/Owner/Desktop/slot0000/scene-objects.bin");
const global = fs.readFileSync("C:/Users/Owner/Desktop/slot0000/global-objects.bin");

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

function parseFields(payload) {
  let i = 0;
  const fields = [];
  while (i < payload.length) {
    const tag = payload[i];
    const field = tag >> 3,
      wt = tag & 7;
    if (field === 0 || field > 5000) {
      fields.push({ err: "bad", i, tag });
      break;
    }
    i++;
    if (wt === 0) {
      const [v, ni] = readVarint(payload, i);
      fields.push({ field, wt: "varint", v, at: i - 1 });
      i = ni;
    } else if (wt === 2) {
      const [len, ni] = readVarint(payload, i);
      i = ni;
      const slice = payload.subarray(i, i + len);
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
        wt: "len",
        len,
        at: i - 1 - (ni - (i - len)),
        ascii: ascii.slice(0, 120),
      };
      if (slice.length && printable / slice.length > 0.85)
        info.str = Buffer.from(slice).toString("utf8");
      fields.push(info);
      i += len;
    } else if (wt === 5) {
      fields.push({
        field,
        wt: "f32",
        hex: Buffer.from(payload.subarray(i, i + 4)).toString("hex"),
        at: i - 1,
      });
      i += 4;
    } else if (wt === 1) {
      fields.push({
        field,
        wt: "f64",
        hex: Buffer.from(payload.subarray(i, i + 8)).toString("hex"),
        at: i - 1,
      });
      i += 8;
    } else {
      fields.push({ err: "wt", field, wt, i: i - 1 });
      break;
    }
  }
  return fields;
}

function dumpAround(label, at, before = 16, after = 80) {
  const start = Math.max(0, at - before);
  const end = Math.min(scene.length, at + after);
  const slice = scene.subarray(start, end);
  let ascii = "";
  for (const b of slice) ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : ".";
  console.log("\n---", label, "at", at, "---");
  console.log(slice.toString("hex"));
  console.log(ascii);
}

// List all component names in scene
function listComponents(buf) {
  const comps = [];
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] !== 0x0a) continue;
    const [len, ni] = readVarint(buf, i + 1);
    if (len < 3 || len > 80) continue;
    if (ni + len > buf.length) continue;
    // next should often be 0x10 (field 2)
    if (buf[ni + len] !== 0x10) continue;
    let ok = true;
    let name = "";
    for (let j = 0; j < len; j++) {
      const b = buf[ni + j];
      if (
        !(
          (b >= 65 && b <= 90) ||
          (b >= 97 && b <= 122) ||
          (b >= 48 && b <= 57) ||
          b === 46 ||
          b === 95 ||
          b === 36 ||
          b === 43
        )
      ) {
        ok = false;
        break;
      }
      name += String.fromCharCode(b);
    }
    if (!ok) continue;
    if (!/^[A-Z]/.test(name) && !name.includes(".")) continue;
    comps.push({ at: i, name, after: ni + len });
  }
  return comps;
}

const comps = listComponents(scene);
const uniq = {};
for (const c of comps) uniq[c.name] = (uniq[c.name] || 0) + 1;
console.log("Unique components:", Object.keys(uniq).sort().join(", "));
console.log("Counts:", uniq);

// Dump structure after each interesting component
for (const want of [
  "Story.StoryGoalManager",
  "StoryGoalCustomEventHandler",
  "Player",
  "Oxygen",
  "Survival",
  "Inventory",
  "PlayerAges",
  "KnownTech",
]) {
  for (const c of comps.filter((x) => x.name === want)) {
    dumpAround(c.name, c.after, 4, 100);
    // Try parse as: 10 <varint> then remaining protobuf fields until next component-ish
    let i = c.after;
    if (scene[i] === 0x10) {
      const [v, j] = readVarint(scene, i + 1);
      console.log("enabled?", v);
      i = j;
    }
    // Heuristic: take next 2..4000 bytes and try parse fields until we see another 0a name pattern
    // Better: protobuf-net often puts component data as field N length-delimited
    const tag = scene[i];
    console.log(
      "next tag",
      tag.toString(16),
      "field",
      tag >> 3,
      "wt",
      tag & 7
    );
    if ((tag & 7) === 2) {
      const [len, j] = readVarint(scene, i + 1);
      console.log("len-delimited payload", len);
      const payload = scene.subarray(j, j + len);
      const fields = parseFields(payload);
      const counts = {};
      for (const f of fields) if (f.field != null) counts[f.field] = (counts[f.field] || 0) + 1;
      console.log("field counts", counts);
      const strs = fields.filter((f) => f.str);
      console.log(
        "strings",
        strs.slice(0, 50).map((f) => `f${f.field}:${f.str}`)
      );
      // nested decode length fields
      for (const f of fields.filter((x) => x.wt === "len" && !x.str).slice(0, 15)) {
        const start =
          payload.indexOf && 0; // need byte offset - re-parse with offsets
      }
      // show first 40 fields briefly
      console.log(
        "fields head",
        fields.slice(0, 40).map((f) => {
          if (f.str) return `f${f.field}:str=${f.str}`;
          if (f.wt === "varint") return `f${f.field}:v=${f.v}`;
          if (f.wt === "len") return `f${f.field}:len=${f.len}:${f.ascii.slice(0, 40)}`;
          return `f${f.field}:${f.wt}`;
        })
      );
    } else if ((tag & 7) === 5) {
      console.log("starts with fixed32 - maybe data is unwrapped?");
      // Try parse from i as raw fields for ~N bytes
      // Find end: next component name at comps
      const nextComp = comps.find((x) => x.at > c.at);
      const end = nextComp ? nextComp.at : Math.min(scene.length, i + 5000);
      const payload = scene.subarray(i, end);
      console.log("raw slice len to next component", payload.length);
      const fields = parseFields(payload);
      const counts = {};
      for (const f of fields) if (f.field != null) counts[f.field] = (counts[f.field] || 0) + 1;
      console.log("raw field counts", counts);
      const strs = fields.filter((f) => f.str);
      console.log(
        "raw strings",
        strs.slice(0, 80).map((f) => `f${f.field}:${f.str}`)
      );
      console.log(
        "raw fields head",
        fields.slice(0, 50).map((f) => {
          if (f.str) return `f${f.field}:str=${f.str}`;
          if (f.wt === "varint") return `f${f.field}:v=${f.v}`;
          if (f.wt === "len") return `f${f.field}:len=${f.len}:${f.ascii.slice(0, 40)}`;
          if (f.err) return JSON.stringify(f);
          return `f${f.field}:${f.wt}:${f.hex || ""}`;
        })
      );
    }
  }
}

// Slot file list
try {
  console.log(
    "\nslot files",
    fs.readdirSync("C:/Users/Owner/Desktop/slot0000").map((n) => {
      const st = fs.statSync("C:/Users/Owner/Desktop/slot0000/" + n);
      return n + ":" + st.size;
    })
  );
} catch (e) {
  console.log(e);
}

// Search global for component names too
const gcomps = listComponents(global);
const guniq = {};
for (const c of gcomps) guniq[c.name] = (guniq[c.name] || 0) + 1;
console.log("\nglobal unique components:", Object.keys(guniq).sort().join(", "));
