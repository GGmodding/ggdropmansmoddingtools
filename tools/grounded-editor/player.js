(() => {
  "use strict";

  const C = window.GroundedCsav;

  function findAscii(buf, ascii) {
    const enc = new TextEncoder().encode(ascii);
    const hits = [];
    outer: for (let i = 0; i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      hits.push(i);
    }
    return hits;
  }

  function readF32(buf, o) {
    return new DataView(buf.buffer, buf.byteOffset + o, 4).getFloat32(0, true);
  }

  function writeF32(buf, o, value) {
    new DataView(buf.buffer, buf.byteOffset + o, 4).setFloat32(0, value, true);
  }

  /**
   * HealthComponent packs: uint8 marker + float32 current health (+ float32 sentinel -1).
   * Observed on live Steam 1.4.x HostPlayer.csav blobs.
   */
  function findHealth(buf) {
    const hits = findAscii(buf, "/Script/Maine.HealthComponent");
    if (!hits.length) return null;
    const nameAt = hits[0];
    const dataAt = nameAt + "/Script/Maine.HealthComponent".length + 1;
    if (dataAt + 5 > buf.length) return null;
    const marker = buf[dataAt];
    const valueAt = dataAt + 1;
    const value = readF32(buf, valueAt);
    if (!Number.isFinite(value) || value < 0 || value > 10000) return null;
    return { nameAt, dataAt, marker, valueAt, value };
  }

  /**
   * SurvivalComponent: after the class path, a u32 then tightly packed float32 vitals
   * (often unaligned). Prefer a cluster of 2–3 values in ~0.25–10 (hunger/thirst scale).
   */
  function findSurvival(buf) {
    const hits = findAscii(buf, "/Script/Maine.SurvivalComponent");
    if (!hits.length) return null;
    const nameAt = hits[0];
    const dataAt = nameAt + "/Script/Maine.SurvivalComponent".length + 1;
    if (dataAt + 40 > buf.length) return null;
    const flag = C.readU32(buf, dataAt);
    const candidates = [];
    for (let off = 4; off <= 28; off++) {
      const v = readF32(buf, dataAt + off);
      if (!Number.isFinite(v)) continue;
      if (v >= 0.25 && v <= 10) candidates.push({ off, v });
    }
    // Prefer a spaced triplet (hunger / thirst / related), typical stride ~8 bytes
    let best = null;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const gap = candidates[j].off - candidates[i].off;
        if (gap < 6 || gap > 12) continue;
        let k = -1;
        for (let t = j + 1; t < candidates.length; t++) {
          const gap2 = candidates[t].off - candidates[j].off;
          if (gap2 >= 6 && gap2 <= 12) {
            k = t;
            break;
          }
        }
        const score =
          (k >= 0 ? 3 : 2) +
          (Math.abs(gap - 8) < 2 ? 1 : 0) +
          (candidates[i].v > 1 && candidates[i].v < 6 ? 1 : 0);
        const picks =
          k >= 0
            ? [candidates[i], candidates[j], candidates[k]]
            : [candidates[i], candidates[j]];
        if (!best || score > best.score) best = { score, picks };
      }
    }
    if (!best) return null;
    const picks = best.picks;
    return {
      nameAt,
      dataAt,
      flag,
      hungerAt: dataAt + picks[0].off,
      thirstAt: dataAt + picks[1].off,
      thirdAt: picks[2] ? dataAt + picks[2].off : null,
      hunger: picks[0].v,
      thirst: picks[1].v,
      third: picks[2] ? picks[2].v : null,
    };
  }

  function parsePlayerVitals(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const health = findHealth(buf);
    const survival = findSurvival(buf);
    return {
      ok: !!(health || survival),
      health: health ? health.value : null,
      hunger: survival ? survival.hunger : null,
      thirst: survival ? survival.thirst : null,
      _health: health,
      _survival: survival,
      size: buf.length,
    };
  }

  function writePlayerVitals(rawPlayer, values) {
    const out = new Uint8Array(C.toBytes(rawPlayer));
    const parsed = parsePlayerVitals(out);
    const applied = {};
    if (parsed._health && values.health != null && values.health !== "") {
      const n = Math.max(0, Math.min(10000, Number(values.health)));
      if (!Number.isFinite(n)) throw new Error("Invalid health.");
      writeF32(out, parsed._health.valueAt, n);
      applied.health = n;
    }
    if (parsed._survival) {
      if (values.hunger != null && values.hunger !== "") {
        const n = Math.max(0, Math.min(20, Number(values.hunger)));
        if (!Number.isFinite(n)) throw new Error("Invalid hunger.");
        writeF32(out, parsed._survival.hungerAt, n);
        applied.hunger = n;
      }
      if (
        parsed._survival.thirstAt != null &&
        values.thirst != null &&
        values.thirst !== ""
      ) {
        const n = Math.max(0, Math.min(20, Number(values.thirst)));
        if (!Number.isFinite(n)) throw new Error("Invalid thirst.");
        writeF32(out, parsed._survival.thirstAt, n);
        applied.thirst = n;
      }
    }
    if (!Object.keys(applied).length) {
      throw new Error("No vitals fields to write (component pattern not found).");
    }
    return { bytes: out, values: applied };
  }

  function listItemPaths(raw) {
    const text = new TextDecoder("latin1").decode(C.toBytes(raw));
    const re = /\/Game\/[A-Za-z0-9_./]+\/(?:BP_|IT_|Item_|SD_|SG_)([A-Za-z0-9_]+)/g;
    const counts = new Map();
    let m;
    while ((m = re.exec(text))) {
      let id = m[1].replace(/_C$/g, "").replace(/_+$/g, "");
      if (id.length < 2) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .filter((x) => /^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(x.id))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  }

  function parseSlotFolderName(name) {
    const n = String(name || "");
    const id = (n.match(/\(ID-([0-9A-F]+)\)/i) || [])[1] || null;
    const pg = (n.match(/\(PG-([0-9A-F]+)\)/i) || [])[1] || null;
    const area = (n.match(/\(Area-([^)]+)\)/i) || [])[1] || null;
    const gameTime = (n.match(/\(GameTime-([^)]+)\)/i) || [])[1] || null;
    let kind = "manual";
    if (/\(AUTOSAVE-/i.test(n)) kind = "autosave";
    else if (/\(LOGOUT-SAVE\)/i.test(n)) kind = "logout";
    else if (/\(PREMIX\)/i.test(n)) kind = "premix";
    else if (/\(REMIX\)/i.test(n)) kind = "remix";
    else if (/\(ENDGAME\)/i.test(n)) kind = "endgame";
    else if (/\(Date-/i.test(n)) kind = "playground";
    return { id: id || pg, area, gameTime, kind, raw: n };
  }

  window.GroundedPlayer = {
    parsePlayerVitals,
    writePlayerVitals,
    listItemPaths,
    parseSlotFolderName,
    findHealth,
    findSurvival,
  };
})();
