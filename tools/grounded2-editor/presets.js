(() => {
  "use strict";

  const C = window.GroundedCsav;

  /** Zero common status blobs after their short-name FString when present. */
  const STATUS_PATHS = [
    "/Script/Maine.VenomComponent",
    "/Script/Maine.PoisonGasComponent",
    "/Script/Maine.CorrosionComponent",
    "/Script/Maine.BodyTemperatureComponent",
    "/Script/Maine.StatusEffectComponent",
  ];

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 80 || off + 4 + len > buf.length) return null;
    return { next: off + 4 + len };
  }

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

  function clearStatusEffects(rawPlayer) {
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    let touched = 0;
    for (const path of STATUS_PATHS) {
      const at = indexOfAscii(buf, path, 0);
      if (at < 0) continue;
      let off = at + path.length + 1;
      const fs = readFString(buf, off);
      if (fs) off = fs.next;
      // Zero a small payload window (best-effort; avoids rewriting component size)
      const end = Math.min(buf.length, off + 32);
      for (let i = off; i < end; i++) {
        if (buf[i] !== 0) {
          buf[i] = 0;
          touched++;
        }
      }
    }
    return { bytes: buf, touched };
  }

  function applyOpPreset(rawPlayer, rawWorld) {
    let host = rawPlayer ? new Uint8Array(C.toBytes(rawPlayer)) : null;
    let world = rawWorld ? new Uint8Array(C.toBytes(rawWorld)) : null;
    const log = [];
    const P = window.GroundedPlayer;
    const G = window.GroundedGear;
    const Perks = window.GroundedPerks;
    const Progress = window.GroundedProgress;
    const Tech = window.GroundedTech;

    if (host && P) {
      try {
        const v = P.writePlayerVitals(host, { health: 200, hunger: 5, thirst: 5 });
        host = v.bytes;
        log.push("vitals");
      } catch (e) {
        log.push("vitals fail");
      }
      try {
        const m = P.writeMolars(host, world, {
          milkMolars: 999,
          goldenMolars: 999,
          rawScience: 999999,
        });
        if (m.hostBytes) host = m.hostBytes;
        if (m.worldBytes) world = m.worldBytes;
        log.push("molars/science");
      } catch (e) {
        log.push("molars fail");
      }
    }
    if (host && G) {
      try {
        const w = G.applyOneShotWeapons(host, { ngPlus: true });
        host = w.bytes;
        log.push("oneshot x" + w.changed);
        const a = G.applyGodArmor(host, { ngPlus: true });
        host = a.bytes;
        log.push("armor x" + a.changed);
      } catch (e) {
        log.push("gear fail");
      }
    }
    if (host && Perks) {
      try {
        const u = Perks.unlockAllMutations(host, Perks.MAX_PHASE);
        host = u.bytes;
        log.push("mutations x" + u.changed);
      } catch (e) {
        log.push("mutations fail");
      }
    }
    if (host && Progress && Progress.completeAllAchievements) {
      try {
        const a = Progress.completeAllAchievements(host);
        host = a.bytes;
        log.push("achievements");
      } catch (e) {
        log.push("ach fail");
      }
    }
    if (world && Progress && Progress.completeAllQuests) {
      try {
        const q = Progress.completeAllQuests(world);
        world = q.bytes;
        log.push("quests x" + q.changed);
      } catch (e) {
        log.push("quests fail");
      }
    }
    if (world && Progress && Progress.unlockAllBuildingsFromSave) {
      try {
        const b = Progress.unlockAllBuildingsFromSave(world);
        world = b.bytes;
        log.push("buildings +" + b.added);
      } catch (e) {
        log.push("buildings fail");
      }
    }
    if (world && Tech) {
      try {
        const a = Tech.unlockAnalyzeStarter(world);
        world = a.bytes;
        log.push("analyze +" + a.added);
      } catch (e) {
        log.push("analyze fail");
      }
    }
    if (world && window.GroundedMap) {
      try {
        const f = window.GroundedMap.revealAllFog(world);
        world = f.bytes;
        log.push("fog " + f.count);
      } catch (e) {
        log.push("fog fail");
      }
    }
    if (host && window.GroundedPets) {
      try {
        const o = window.GroundedPets.maxOmniTool(host);
        host = o.bytes;
        log.push("omni " + o.levels.join("/"));
      } catch (e) {
        log.push("omni fail");
      }
    }
    if (host) {
      try {
        const c = clearStatusEffects(host);
        host = c.bytes;
        log.push("status clear");
      } catch (e) {
        /* ignore */
      }
    }
    return { hostBytes: host, worldBytes: world, log };
  }

  window.GroundedPresets = {
    applyOpPreset,
    clearStatusEffects,
  };
})();
