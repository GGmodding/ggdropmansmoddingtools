const fs = require("fs");
const path = require("path");
const { Oodle } = require("oodle.js");

async function main() {
  const slot =
    process.argv[2] ||
    path.join(
      process.env.USERPROFILE,
      "Saved Games",
      "Grounded",
      "(ID-B995D4F644DEFE1DC29D01BC5CB1B69B)(LOGOUT-SAVE)"
    );
  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("Loading Oodle...");
  const oodle = await Oodle.Create();
  console.log("Oodle ready");

  for (const name of ["HostPlayer.csav", "World.csav", "Options.csav"]) {
    const file = path.join(slot, name);
    if (!fs.existsSync(file)) {
      console.log("missing", name);
      continue;
    }
    const buf = fs.readFileSync(file);
    const uSize = buf.readUInt32LE(0);
    const cSize = buf.readUInt32LE(4);
    console.log(`\n=== ${name} file=${buf.length} uSize=${uSize} cSize=${cSize} ===`);
    const payload = buf.subarray(8);
    console.log(
      "payload head:",
      [...payload.subarray(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join(" ")
    );
    try {
      const compressor = oodle.getCompressor(payload);
      console.log("compressor enum:", compressor);
    } catch (e) {
      console.log("getCompressor err:", e.message);
    }
    try {
      const out = oodle.decompress({ buffer: payload }, uSize);
      console.log("decompressed:", out.length);
      fs.writeFileSync(path.join(outDir, name.replace(".csav", ".bin")), out);
      const ascii = out
        .toString("latin1")
        .replace(/[^\x20-\x7E\n]/g, ".")
        .slice(0, 400);
      console.log("ascii preview:", ascii);
      // string harvest
      const strings = [];
      let cur = "";
      for (let i = 0; i < out.length; i++) {
        const c = out[i];
        if (c >= 32 && c < 127) {
          cur += String.fromCharCode(c);
        } else {
          if (cur.length >= 4) strings.push(cur);
          cur = "";
        }
      }
      if (cur.length >= 4) strings.push(cur);
      const interesting = strings.filter((s) =>
        /Raw|Science|Health|Hunger|Thirst|Inventory|Backpack|Molar|Player|Item|Count|Brain/i.test(
          s
        )
      );
      console.log(
        "interesting strings:",
        [...new Set(interesting)].slice(0, 60).join(" | ")
      );
    } catch (e) {
      console.log("decompress err:", e.message || e);
    }
  }

  // also dump header
  const hdr = path.join(slot, "SaveGameHeaderData.savheader");
  if (fs.existsSync(hdr)) {
    fs.copyFileSync(hdr, path.join(outDir, "SaveGameHeaderData.savheader"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
