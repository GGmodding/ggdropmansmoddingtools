import fs from "fs";

const hp = fs.readFileSync("out/HostPlayer.bin");

function readI32(buf, o) {
  return buf.readInt32LE(o);
}
function readU32(buf, o) {
  return buf.readUInt32LE(o);
}
function readFString(buf, o) {
  const len = readI32(buf, o);
  if (len === 0) return { value: "", end: o + 4 };
  if (len > 0) {
    if (o + 4 + len > buf.length) return null;
    let s = buf.toString("utf8", o + 4, o + 4 + len);
    if (s.endsWith("\0")) s = s.slice(0, -1);
    return { value: s, end: o + 4 + len, len };
  }
  const chars = -len;
  const bytes = chars * 2;
  if (o + 4 + bytes > buf.length) return null;
  let s = buf.toString("utf16le", o + 4, o + 4 + bytes);
  if (s.endsWith("\0")) s = s.slice(0, -1);
  return { value: s, end: o + 4 + bytes, len };
}

// Header guess from earlier probe
let o = 0;
const hdr = {
  a: readU32(hp, o),
  b: readU32(hp, (o += 4)),
  c: readU32(hp, (o += 4)),
  d: readU32(hp, (o += 4)),
  e: readU32(hp, (o += 4)),
  f: readU32(hp, (o += 4)),
};
o += 4;
const nameCount = readU32(hp, o);
o += 4;
const pad = readU32(hp, o);
o += 4;
console.log({ hdr, nameCount, pad, o });

// Try alternate: maybe names are FName entries (string + number) or soft object paths
// Scan for FString sequence of nameCount items from various starts
function tryParseNames(start, count, maxFail = 3) {
  let off = start;
  const names = [];
  let fails = 0;
  for (let i = 0; i < count; i++) {
    const s = readFString(hp, off);
    if (!s || s.value.length > 300 || (s.value.length > 0 && !/^[\x20-\x7E]+$/.test(s.value) && s.len > 0)) {
      fails++;
      if (fails > maxFail) return null;
      // skip 4 bytes and retry
      off += 4;
      i--;
      continue;
    }
    names.push(s.value);
    off = s.end;
    // FName often has trailing int32 index
    // peek: if next looks like small int and following isn't a valid string length, consume it
    if (off + 4 <= hp.length) {
      const maybeIdx = readI32(hp, off);
      const nextLen = off + 4 < hp.length ? readI32(hp, off + 4) : null;
      if (maybeIdx >= 0 && maybeIdx < 100000) {
        // Heuristic: if nextLen looks like a string length, don't consume idx; else if nextLen is garbage, consume
        if (nextLen == null || nextLen === 0 || (nextLen > 0 && nextLen < 400) || nextLen < 0) {
          // could be either; try without consuming first in a second pass
        }
      }
    }
  }
  return { names, end: off };
}

// Brute a few start positions near 32
for (const start of [32, 28, 36, 40, 24]) {
  // try with FName (string + int32)
  let off = start;
  const names = [];
  let ok = true;
  for (let i = 0; i < Math.min(nameCount, 20); i++) {
    const s = readFString(hp, off);
    if (!s || s.value.length > 250) {
      ok = false;
      break;
    }
    // require mostly printable
    if (s.value && !/^[\x09\x0a\x0d\x20-\x7E]*$/.test(s.value)) {
      ok = false;
      break;
    }
    off = s.end;
    const idx = readI32(hp, off);
    off += 4;
    names.push({ s: s.value, idx });
  }
  if (ok) {
    console.log("start", start, "first names:", names.slice(0, 15));
    // parse all
    off = start;
    const all = [];
    ok = true;
    for (let i = 0; i < nameCount; i++) {
      const s = readFString(hp, off);
      if (!s) {
        ok = false;
        console.log("fail at", i, off);
        break;
      }
      off = s.end + 4; // skip fname number
      all.push(s.value);
    }
    if (ok) {
      console.log("parsed all names, end", off, "sample interesting:");
      all.forEach((n, i) => {
        if (/molar|science|upgrade|health|hunger|thirst|stamina|point/i.test(n)) {
          console.log(i, n);
        }
      });
      fs.writeFileSync("out/hp-names.json", JSON.stringify(all, null, 2));
      console.log("wrote names", all.length);
      break;
    }
  } else {
    console.log("start", start, "failed early");
  }
}
