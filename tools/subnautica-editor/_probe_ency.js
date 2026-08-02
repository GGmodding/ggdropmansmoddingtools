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

function findPlayer(bytes) {
  const sig = [0x0a, 0x06, 0x50, 0x6c, 0x61, 0x79, 0x65, 0x72, 0x10, 0x01, 0xd2];
  outer: for (let i = 0; i <= bytes.length - sig.length; i++) {
    for (let j = 0; j < sig.length; j++) if (bytes[i + j] !== sig[j]) continue outer;
    const [len, ps] = readVarint(bytes, i + 11);
    const pe = ps + len;
    if (pe > bytes.length || len < 8 || len > 200000) continue;
    if (bytes[ps] !== 0x08) continue;
    return { at: i, ps, pe, len, payload: bytes.subarray(ps, pe) };
  }
  return null;
}

function parseFields(payload, maxDepth = 2, depth = 0) {
  let i = 0;
  const fields = [];
  while (i < payload.length) {
    const tag = payload[i];
    const field = tag >> 3,
      wt = tag & 7;
    if (field === 0 || field > 2000) {
      fields.push({ err: "bad tag", i, tag });
      break;
    }
    i++;
    if (wt === 0) {
      const [v, ni] = readVarint(payload, i);
      fields.push({ field, wt: "varint", v });
      i = ni;
    } else if (wt === 2) {
      const [len, ni] = readVarint(payload, i);
      i = ni;
      const slice = payload.subarray(i, i + len);
      i += len;
      let ascii = "";
      let printable = 0;
      for (const b of slice) {
        if (b >= 32 && b <= 126) {
          ascii += String.fromCharCode(b);
          printable++;
        } else ascii += ".";
      }
      const info = {
        field,
        wt: "len",
        len,
        asciiPreview: ascii.slice(0, 100),
        printableRatio: slice.length ? printable / slice.length : 0,
      };
      if (slice.length >= 2 && printable / slice.length > 0.85) {
        info.str = Buffer.from(slice).toString("utf8");
      }
      if (
        depth < maxDepth &&
        slice.length > 0 &&
        slice.length < 50000 &&
        printable / Math.max(slice.length, 1) < 0.7
      ) {
        try {
          info.nested = parseFields(slice, maxDepth, depth + 1).slice(0, 60);
        } catch (_) {}
      }
      fields.push(info);
    } else if (wt === 5) {
      fields.push({
        field,
        wt: "fixed32",
        hex: Buffer.from(payload.subarray(i, i + 4)).toString("hex"),
      });
      i += 4;
    } else if (wt === 1) {
      fields.push({
        field,
        wt: "fixed64",
        hex: Buffer.from(payload.subarray(i, i + 8)).toString("hex"),
      });
      i += 8;
    } else {
      fields.push({ err: "wt", field, wt, i });
      break;
    }
  }
  return fields;
}

function strings(buf, min = 4) {
  const o = [];
  let c = "",
    start = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 32 && b <= 126) {
      if (!c) start = i;
      c += String.fromCharCode(b);
    } else {
      if (c.length >= min) o.push({ s: c, at: start });
      c = "";
    }
  }
  if (c.length >= min) o.push({ s: c, at: start });
  return o;
}

const hit = findPlayer(scene);
console.log("Player payload len", hit.len, "at", hit.at);
const fields = parseFields(hit.payload, 2);
const counts = {};
for (const f of fields) {
  if (f.field != null) counts[f.field] = (counts[f.field] || 0) + 1;
}
console.log("field counts", counts);

const byField = {};
for (const f of fields) {
  if (f.field == null) continue;
  if (!byField[f.field]) byField[f.field] = [];
  if (byField[f.field].length < 12) byField[f.field].push(f);
}
for (const k of Object.keys(byField).sort((a, b) => a - b)) {
  if (k === "5") {
    console.log("field 5: count", counts[5], "sample", byField[5].slice(0, 3));
    continue;
  }
  console.log("\n=== field", k, "count", counts[k], "===");
  console.log(JSON.stringify(byField[k], null, 2).slice(0, 4000));
}

const creatures = [
  "Peeper",
  "ReaperLeviathan",
  "Gasopod",
  "Bleeder",
  "Stalker",
  "SandShark",
  "BoneShark",
  "Crash",
  "Mesmer",
  "Warper",
  "SeaTreader",
  "GhostLeviathan",
  "SeaDragon",
  "Reefback",
  "LavaLizard",
  "Ampeel",
  "Crabsnake",
  "Crabsquid",
  "BloodCrawler",
  "CaveCrawler",
  "Shuttlebug",
  "Jellyray",
  "RabbitRay",
  "Hoverfish",
  "Boomerang",
  "Eyeye",
  "Oculus",
  "Reginald",
  "Spadefish",
  "Bladderfish",
  "HoleFish",
  "Hoopfish",
  "Spinefish",
  "Garryfish",
  "Aurora",
  "Degasi",
  "Precursor",
  "Quarantine",
  "Emperor",
  "Kharaa",
  "Infection",
  "Sunbeam",
  "Lifepod",
  "Seamoth",
  "Cyclops",
  "Exosuit",
  "Scanner",
  "Builder",
  "Knife",
];

for (const [name, buf] of [
  ["scene", scene],
  ["global", global],
]) {
  const s = strings(buf, 5);
  const ency = s.filter((x) =>
    /Ency|encyclopedia|Databank|Partial|PDALog|PDAScanner|PDAData|knownTech/i.test(x.s)
  );
  console.log("\n" + name + " ency-like strings", ency.slice(0, 60));
  const creatureHits = s.filter((x) => creatures.some((c) => x.s === c || x.s.startsWith(c + "/")));
  console.log(name + " creature-like", [...new Set(creatureHits.map((x) => x.s))].slice(0, 100));
  const paths = s.filter(
    (x) =>
      x.s.includes("Lifeforms/") ||
      x.s.includes("Downloaded") ||
      /^(Lifeforms|Tech|Artifacts|Codes|Degasi|Aurora|Precursor|Planetary|Survivor)/.test(x.s)
  );
  console.log(name + " pathlike", paths.slice(0, 40));
}

// StoryGoalManager
function findComponent(bytes, name) {
  const nameBuf = Buffer.from(name, "utf8");
  // 0a <len> <name>
  const hits = [];
  for (let i = 0; i < bytes.length - nameBuf.length - 2; i++) {
    if (bytes[i] !== 0x0a) continue;
    const [len, ni] = readVarint(bytes, i + 1);
    if (len !== nameBuf.length) continue;
    if (bytes.compare(nameBuf, 0, nameBuf.length, ni, ni + len) === 0) {
      hits.push(i);
    }
  }
  return hits;
}

for (const name of [
  "Story.StoryGoalManager",
  "StoryGoalCustomEventHandler",
  "Player",
  "Inventory",
  "PDA",
  "uGUI_PDA",
]) {
  const hits = findComponent(scene, name);
  console.log("component", name, "hits", hits.length, hits.slice(0, 5));
}

// Dump StoryGoalManager payload structure
const sgmHits = findComponent(scene, "Story.StoryGoalManager");
if (sgmHits.length) {
  const at = sgmHits[0];
  // typical: 0a len name 10 01 <tag> <len> payload
  let i = at;
  const [nlen, ni] = readVarint(scene, i + 1);
  i = ni + nlen;
  console.log("\nAfter name bytes:", scene.subarray(i, i + 20).toString("hex"));
  // expect 10 01 then length-delimited field (often field 26 = 0xd2?)
  if (scene[i] === 0x10) {
    const [v, j] = readVarint(scene, i + 1);
    console.log("field2 varint", v);
    i = j;
  }
  // find next length-delimited
  const tag = scene[i];
  const field = tag >> 3,
    wt = tag & 7;
  console.log("next tag field", field, "wt", wt, "byte", tag.toString(16));
  if (wt === 2) {
    const [len, j] = readVarint(scene, i + 1);
    const payload = scene.subarray(j, j + len);
    console.log("StoryGoalManager payload len", len);
    const pf = parseFields(payload, 1);
    const sc = {};
    for (const f of pf) if (f.field != null) sc[f.field] = (sc[f.field] || 0) + 1;
    console.log("SGM field counts", sc);
    // show string fields
    const strs = pf.filter((f) => f.str);
    console.log(
      "SGM strings sample",
      strs.slice(0, 40).map((f) => ({ field: f.field, str: f.str }))
    );
    // show nested for first few len fields that aren't pure strings
    for (const f of pf.slice(0, 30)) {
      if (f.wt === "len" && !f.str) {
        console.log("SGM nested field", f.field, "len", f.len, "preview", f.asciiPreview);
        if (f.nested) {
          const nestStr = f.nested.filter((n) => n.str);
          console.log("  nested strings", nestStr.map((n) => n.str).slice(0, 20));
          const nestCounts = {};
          for (const n of f.nested)
            if (n.field != null) nestCounts[n.field] = (nestCounts[n.field] || 0) + 1;
          console.log("  nested counts", nestCounts);
        }
      }
    }
  }
}
