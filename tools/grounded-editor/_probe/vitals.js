const fs = require("fs");
const path = require("path");
const { Oodle, OodleCompressor, OodleCompressionLevel } = require("oodle.js");

async function roundtrip() {
  const slot = path.join(
    process.env.USERPROFILE,
    "Saved Games",
    "Grounded",
    "(ID-B995D4F644DEFE1DC29D01BC5CB1B69B)(LOGOUT-SAVE)"
  );
  const oodle = await Oodle.Create();
  const raw = fs.readFileSync(path.join(slot, "HostPlayer.csav"));
  const uSize = raw.readUInt32LE(0);
  const payload = raw.subarray(8);
  const hp = Buffer.from(oodle.decompress({ buffer: payload }, uSize));

  // SurvivalComponent vitals (doubles after name + uint32)
  const surv = hp.indexOf(Buffer.from("/Script/Maine.SurvivalComponent\0"));
  const survData = surv + "/Script/Maine.SurvivalComponent\0".length;
  console.log("Survival @", surv, "data@", survData);
  console.log("u32", hp.readUInt32LE(survData));
  console.log("d0", hp.readDoubleLE(survData + 4));
  console.log("d1", hp.readDoubleLE(survData + 12));
  console.log("d2", hp.readDoubleLE(survData + 20));
  console.log("d3", hp.readDoubleLE(survData + 28));
  console.log("u32 after", hp.readUInt32LE(survData + 36));

  const hc = hp.indexOf(Buffer.from("/Script/Maine.HealthComponent\0"));
  const hcData = hc + "/Script/Maine.HealthComponent\0".length;
  console.log("\nHealth @", hc, "data@", hcData);
  console.log("bytes", [...hp.subarray(hcData, hcData + 20)].map((b) => b.toString(16).padStart(2, "0")).join(" "));
  for (let i = 0; i < 16; i++) {
    const f = hp.readFloatLE(hcData + i);
    const d = hcData + i + 8 <= hp.length ? hp.readDoubleLE(hcData + i) : null;
    if ((f > 0 && f <= 500) || (d && d > 0 && d <= 500)) {
      console.log(`  off+${i} float=${f} double=${d}`);
    }
  }

  // Try rewrite survival d0 to 100 and recompress
  const edited = Buffer.from(hp);
  edited.writeDoubleLE(100, survData + 4);
  edited.writeDoubleLE(100, survData + 12);
  // health: try writing float 100 at the 30.0 location (hcData+3 = 00 00 f0 41)
  // verify: hcData+1 = 00 00 f0 41? 
  // bytes: 08 00 00 f0 41 → float at +1
  console.log("\nhealth float at +1", edited.readFloatLE(hcData + 1));
  console.log("health float at +2", edited.readFloatLE(hcData + 2));
  console.log("health float at +3", edited.readFloatLE(hcData + 3));

  // Maybe structure is uint32=8 then float was misread because it's actually:
  // Looking again: 08 00 00 f0 41 — could be float16? Or the 30 is intentional (hurt player)
  // Write float32 100 at offset where 30 was: if 00 00 f0 41 is at hcData+1, writing 100 there overwrites the 08 boundary.

  // Test recompress identity
  const recompressed = oodle.compress(
    { buffer: hp },
    OodleCompressor.Kraken,
    OodleCompressionLevel.Optimal
  );
  console.log("\nRecompress size", recompressed.length, "original payload", payload.length);
  const back = oodle.decompress({ buffer: recompressed }, uSize);
  console.log("roundtrip equal?", Buffer.compare(back, hp) === 0);

  // Does game accept different compressed size? Likely yes if uSize/cSize headers updated.
  const out = Buffer.alloc(8 + recompressed.length);
  out.writeUInt32LE(uSize, 0);
  out.writeUInt32LE(recompressed.length, 4);
  recompressed.copy(out, 8);
  fs.writeFileSync(path.join(__dirname, "out", "HostPlayer.roundtrip.csav"), out);
  console.log("wrote roundtrip csav", out.length);
}

roundtrip().catch((e) => {
  console.error(e);
  process.exit(1);
});
