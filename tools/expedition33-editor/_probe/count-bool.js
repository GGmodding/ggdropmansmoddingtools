"use strict";
const fs = require("fs");
const buf = fs.readFileSync(
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
);
const wp = 71934;
const region = buf.slice(wp, 72200);
for (let i = 0; i < region.length - 4; i++) {
  const v = region.readUInt32LE(i);
  if (v === 6 || v === 2 || v === 5) {
    console.log("u32=" + v + " at wp+" + i + " abs " + (wp + i));
  }
}

// Encode passive entry and compare to Dodger
function encodeFString(s) {
  const b = Buffer.from(s + "\0");
  const out = Buffer.alloc(4 + b.length);
  out.writeInt32LE(b.length, 0);
  b.copy(out, 4);
  return out;
}
function encodeNameProp(propName, value) {
  const name = encodeFString(propName);
  const type = encodeFString("NameProperty");
  const val = encodeFString(value);
  const hdr = Buffer.alloc(9);
  hdr.writeUInt32LE(0, 0);
  hdr.writeUInt32LE(val.length, 4);
  hdr[8] = 0;
  return Buffer.concat([name, type, hdr, val]);
}
function encodeBoolProp(propName, value) {
  const name = encodeFString(propName);
  const type = encodeFString("BoolProperty");
  // From hex: BoolProperty 00 | 00000000 | 00000000 | 01 | 00
  // Bool stores value IN the tag byte, then extra 0?
  // hex: 426f6f6c50726f706572747900 00000000 00000000 10 ?? 
  // Looking at earlier: BoolProperty........../ 
  // 00 00000000 00000000 10 2f...
  // Actually: after BoolProperty\0: index=0, size=0, tag=0x01 (true), then 0x00?
  // From entry dump: `BoolProperty........../` and learnt true
  // hex fragment: 426f6f6c50726f7065727479000000000000000000102f0000004c6561726e74
  // BoolProperty\0 | 00000000 | 00000000 | 10 | 2f000000 LearntSteps
  // So tag byte = 0x10? That's weird for bool. Or tag=0x01 and next is 0x00 then LearntSteps starts with 0x2f?
  // 10 2f = tag 0x10? 
  // UE BoolProperty: the bool value is stored as the Tag byte (replacing usual 0 tag), and there's no payload. Size=0.
  // But 0x10 = 16, not 0/1. Hmm.
  // Wait: 01 00 then 2f of LearntSteps length? 
  // BoolProperty\0 + index(4) + size(4) + bool(1) + ? 
  // Standard: BoolProperty has value as single byte where tag usually is, size=0, no extra payload.
  // So: index=0, size=0, value=1 (true). Bytes: 00000000 00000000 01
  // Then next is LearntSteps: 2f000000 = length 47.
  // So hex should be ...0000000000000000012f000000...
  // But we saw ...0000000000000000102f000000...
  // That's 0x10 not 0x01! Unless endianness display confusion.
  // Re-read CritChanceBurn entry hex around IsLearnt:
  // From earlier full entry hex ending part:
  // 2c00000049734c6561726e745f...426f6f6c50726f7065727479000000000000000000102f0000004c6561726e74
  // Yes 10 then 2f. So value byte is 0x10?
  // Could BoolProperty be: index, size, tag(0), value(1), padding?
  // 00000000 00000000 00 01  — that would be 00 00 00 00 00 00 00 00 00 01, then 2f
  // Hex: 00000000 00000000 10 2f — that's only 9 bytes after type: 4+4+1
  // So it's index=0, size=0, tag/value=0x10.
  // 0x10 might mean true in some UE versions? Or it's 1 with high nibble?
  // parsePictos uses: buf[lh.afterType + BOOL_OFF] !== 0 with BOOL_OFF = 8
  // afterType points after "BoolProperty\0", +8 is the 9th byte = tag byte (0-index: bytes 0-3 index, 4-7 size, 8 tag)
  // So they read tag as bool, and 0x10 is truthy. When writing: out[learntAt] = learnt ? 1 : 0
  // So they WRITE 1, but existing save has 0x10? Let me check actual value at learntAt for CritChanceBurn
}
const PASSIVE_LEARNT = "IsLearnt_9_2561000E49D90653437DE9A45BE2A86D";
const lenc = Buffer.from(PASSIVE_LEARNT + "\0");
for (let i = 75000; i < 76200; i++) {
  if (buf.compare(lenc, 0, lenc.length, i, i + lenc.length) !== 0) continue;
  if (buf.readUInt32LE(i - 4) !== lenc.length) continue;
  const afterType = i + lenc.length + 13; // NameProperty length is already past - need after BoolProperty type
  // find BoolProperty after this name
  const bp = Buffer.from("BoolProperty\0");
  const bi = buf.indexOf(bp, i);
  console.log("IsLearnt at", i - 4, "BoolProperty at", bi);
  console.log("9 bytes after BoolProperty:", buf.slice(bi + bp.length, bi + bp.length + 12).toString("hex"));
}
