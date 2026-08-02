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

const playerAt = 3252;
// Find length-prefixed parents covering player through scanner
console.log("Searching length prefixes covering Player..scanner");
for (let i = Math.max(0, playerAt - 200); i < playerAt; i++) {
  const tag = scene[i];
  const wt = tag & 7;
  if (wt !== 2) continue;
  const field = tag >> 3;
  if (field === 0 || field > 50) continue;
  const [len, ni] = readVarint(scene, i + 1);
  const end = ni + len;
  // must contain player start and encyclopedia region ~6500
  if (ni <= playerAt && end > 6545 && len < 200000) {
    console.log({
      tagAt: i,
      field,
      len,
      dataStart: ni,
      dataEnd: end,
      head: scene.subarray(ni, ni + 20).toString("hex"),
      tail: scene.subarray(end - 20, end).toString("hex"),
    });
  }
}

// Parse Player members properly: treat everything after 10 01 as fields until parent ends
// First find the tightest parent
let best = null;
for (let i = Math.max(0, playerAt - 200); i < playerAt; i++) {
  if ((scene[i] & 7) !== 2) continue;
  const [len, ni] = readVarint(scene, i + 1);
  const end = ni + len;
  if (ni <= playerAt && end > 6545 && len < 200000) {
    if (!best || len < best.len) best = { i, len, ni, end, field: scene[i] >> 3 };
  }
}
console.log("tightest parent", best);

// From Player name+enabled, parse fields with awareness that d2 might be a nested submessage
// containing ONLY some fields, then MORE sibling fields follow inside parent
let i = playerAt + 8;
if (scene[i] === 0x10) {
  const [, j] = readVarint(scene, i + 1);
  i = j;
}
const end = best ? best.end : playerAt + 20000;
console.log("parsing Player fields from", i, "to", end);

const counts = {};
const ency = [];
const journal = [];
let knownTech = 0;
while (i < end) {
  const tag = scene[i];
  const field = tag >> 3,
    wt = tag & 7;
  if (field === 0 || field > 40) {
    console.log("stop at", i, "tag", tag.toString(16));
    break;
  }
  i++;
  if (wt === 0) {
    const [v, ni] = readVarint(scene, i);
    counts[field] = (counts[field] || 0) + 1;
    if (field === 5) knownTech++;
    i = ni;
  } else if (wt === 2) {
    const [len, ni] = readVarint(scene, i);
    const slice = scene.subarray(ni, ni + len);
    counts[field] = (counts[field] || 0) + 1;
    if (field === 8) {
      // ency kv
      if (slice[0] === 0x0a) {
        const [kl, kni] = readVarint(slice, 1);
        ency.push(slice.subarray(kni, kni + kl).toString("utf8"));
      }
    }
    if (field === 7) {
      if (slice[0] === 0x0a) {
        const [kl, kni] = readVarint(slice, 1);
        journal.push(slice.subarray(kni, kni + kl).toString("utf8"));
      }
    }
    if (field === 26 || (field === 5 && false)) {
      // peek
    }
    // Special: if field 26 length-delimited contains version+knownTech, count inner knownTech
    if (field === 26) {
      let j = 0;
      while (j < slice.length) {
        const t = slice[j];
        const f = t >> 3,
          w = t & 7;
        if (f === 0) break;
        j++;
        if (w === 0) {
          const [v, nj] = readVarint(slice, j);
          if (f === 5) knownTech++;
          j = nj;
        } else if (w === 2) {
          const [l, nj] = readVarint(slice, j);
          j = nj + l;
        } else if (w === 5) j += 4;
        else if (w === 1) j += 8;
        else break;
      }
      console.log("field26 nested len", len, "inner knownTech so far", knownTech);
    }
    i = ni + len;
  } else if (wt === 5) {
    counts[field] = (counts[field] || 0) + 1;
    i += 4;
  } else if (wt === 1) {
    counts[field] = (counts[field] || 0) + 1;
    i += 8;
  } else {
    console.log("bad wt", wt, "at", i - 1);
    // try skip: if next bytes look like 28 (knownTech), continue from there
    if (scene[i - 1 + 1] === 0x28 || scene[i] === 0x28) {
      // resync: walk back and find 28
      console.log("resync attempt");
    }
    break;
  }
}
console.log("counts", counts);
console.log("knownTech", knownTech, "journal", journal.length, "ency", ency.length);
console.log("ency keys", ency);

// Manual: from after d2 blob, parse 28s then 3a/42/4a without requiring strict continuity from d2
i = 3452;
const counts2 = {};
let kt2 = 0,
  jn = [],
  en = [];
while (i < end) {
  const tag = scene[i];
  const field = tag >> 3,
    wt = tag & 7;
  // allow resync on known tags
  if (!(field >= 1 && field <= 26 && [0, 2, 5, 1].includes(wt))) {
    console.log("break2 at", i, scene.subarray(i, i + 8).toString("hex"));
    break;
  }
  i++;
  if (wt === 0) {
    const [v, ni] = readVarint(scene, i);
    counts2[field] = (counts2[field] || 0) + 1;
    if (field === 5) kt2++;
    i = ni;
  } else if (wt === 2) {
    const [len, ni] = readVarint(scene, i);
    const slice = scene.subarray(ni, ni + len);
    counts2[field] = (counts2[field] || 0) + 1;
    if (field === 7 && slice[0] === 0x0a) {
      const [kl, kni] = readVarint(slice, 1);
      jn.push(slice.subarray(kni, kni + kl).toString("utf8"));
    }
    if (field === 8 && slice[0] === 0x0a) {
      const [kl, kni] = readVarint(slice, 1);
      en.push(slice.subarray(kni, kni + kl).toString("utf8"));
    }
    i = ni + len;
  } else if (wt === 5) {
    counts2[field] = (counts2[field] || 0) + 1;
    i += 4;
  } else if (wt === 1) {
    counts2[field] = (counts2[field] || 0) + 1;
    i += 8;
  } else break;
}
console.log("from3452 counts", counts2, "kt", kt2, "journal", jn.length, "ency", en.length);
console.log("ended at", i, "best.end", end);
