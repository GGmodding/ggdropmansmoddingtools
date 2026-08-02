(() => {
  "use strict";

  const C = window.GroundedCsav;
  const Inv = window.GroundedInventory;

  const FULL_TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
  const HATCH_NAMES = ["AntHatch", "BlackAntHatch", "LadybugHatch", "OrbHatch", "SpiderHatch"];
  const TAMING_EGGS = [
    "Taming_EggAnt",
    "Taming_EggBlackAnt",
    "Taming_EggLadybug",
    "Taming_EggOrb",
  ];

  function indexOfAscii(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from || 0); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function findItemRecords(buf, name) {
    const out = [];
    if (!Inv || typeof Inv.parseItemRecord !== "function") return out;
    const needle = name + "\0";
    let from = 0;
    while (out.length < 40) {
      const nameAt = indexOfAscii(buf, needle, from);
      if (nameAt < 0) break;
      from = nameAt + 1;
      const tableAt = (() => {
        // lastIndexOf ascii
        let best = -1;
        let i = 0;
        while (i < nameAt) {
          const at = indexOfAscii(buf, FULL_TABLE, i);
          if (at < 0 || at >= nameAt) break;
          best = at;
          i = at + 1;
        }
        return best;
      })();
      if (tableAt < 0 || nameAt - tableAt > 140) continue;
      const rec = Inv.parseItemRecord(buf, tableAt - 4, Math.min(buf.length, nameAt + 800));
      if (!rec || rec.name !== name) continue;
      out.push(rec);
    }
    return out;
  }

  function parseHatcheryJobs(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const jobs = [];
    for (const name of HATCH_NAMES) {
      for (const rec of findItemRecords(buf, name)) {
        let progress = null;
        let progressOff = -1;
        let remain = null;
        let remainOff = -1;
        for (let i = rec.start; i + 4 <= rec.end; i += 4) {
          const f = new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true);
          if (!Number.isFinite(f)) continue;
          // Hatch percent-ish (exclude known egg constants like 14.46 / 196.3)
          if (
            f > 1.5 &&
            f <= 100.01 &&
            Math.abs(f - 14.4627) > 0.01 &&
            Math.abs(f - 196.3098) > 0.01
          ) {
            if (progress == null || f >= 99.5 || (progress < 99.5 && f > progress && f < 99.5)) {
              progress = f;
              progressOff = i;
            }
          }
        }
        for (let i = rec.start + Math.floor(rec.size / 2); i + 8 <= rec.end; i += 4) {
          const d = new DataView(buf.buffer, buf.byteOffset + i, 8).getFloat64(0, true);
          if (Number.isFinite(d) && d >= 0.0005 && d < 500000) {
            // Prefer larger remaining-time candidates over tiny epsilons we write when done
            if (remain == null || (d > 1 && (remain < 1 || d < remain))) {
              remain = d;
              remainOff = i;
            }
          }
        }
        jobs.push({
          name,
          start: rec.start,
          size: rec.size,
          level: rec.level,
          progress,
          progressOff,
          remain,
          remainOff,
        });
      }
    }
    return { ok: true, jobs };
  }

  /** Push hatchery craft jobs to completion (progress → 100, remaining time → ~0). */
  function finishHatcheryJobs(rawWorld) {
    const parsed = parseHatcheryJobs(rawWorld);
    const buf = new Uint8Array(C.toBytes(rawWorld));
    let changed = 0;
    for (const job of parsed.jobs) {
      if (job.progressOff >= 0) {
        new DataView(buf.buffer, buf.byteOffset + job.progressOff, 4).setFloat32(0, 100, true);
        changed++;
      }
      if (job.remainOff >= 0) {
        new DataView(buf.buffer, buf.byteOffset + job.remainOff, 8).setFloat64(0, 0.001, true);
        changed++;
      }
    }
    return { bytes: buf, jobs: parsed.jobs.length, changed };
  }

  window.GroundedHatching = {
    parseHatcheryJobs,
    finishHatcheryJobs,
    TAMING_EGGS,
    HATCH_NAMES,
  };
})();
