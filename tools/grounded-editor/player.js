(() => {
  "use strict";

  const C = window.GroundedCsav;

  const PUC_PATH = "/Script/Maine.PlayerUpgradeComponent";
  const PARTY_PATH = "/Script/Maine.PartyComponent";
  const HEALTH_PATH = "/Script/Maine.HealthComponent";
  const SURVIVAL_PATH = "/Script/Maine.SurvivalComponent";

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

  function readI32(buf, o) {
    return new DataView(buf.buffer, buf.byteOffset + o, 4).getInt32(0, true);
  }

  function writeI32(buf, o, value) {
    new DataView(buf.buffer, buf.byteOffset + o, 4).setInt32(0, value, true);
  }

  function readFString(buf, o) {
    if (o < 0 || o + 4 > buf.length) return null;
    const len = readI32(buf, o);
    if (len <= 0 || len > 512 || o + 4 + len > buf.length) return null;
    const bytes = buf.subarray(o + 4, o + 4 + len);
    let end = bytes.length;
    if (end > 0 && bytes[end - 1] === 0) end -= 1;
    let s = "";
    for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i]);
    return { s, next: o + 4 + len, len };
  }

  /**
   * HealthComponent packs: uint8 marker + float32 current health (+ float32 sentinel -1).
   * Observed on live Steam 1.4.x HostPlayer.csav blobs. 0 is a valid saved value.
   */
  function findHealth(buf) {
    const hits = findAscii(buf, HEALTH_PATH);
    if (!hits.length) return null;
    const nameAt = hits[0];
    const dataAt = nameAt + HEALTH_PATH.length + 1;
    if (dataAt + 5 > buf.length) return null;
    const marker = buf[dataAt];
    const valueAt = dataAt + 1;
    const value = readF32(buf, valueAt);
    if (!Number.isFinite(value) || value < 0 || value > 10000) return null;
    return { nameAt, dataAt, marker, valueAt, value };
  }

  /**
   * SurvivalComponent: after the class path, a u32 then tightly packed float32 vitals
   * (often unaligned). Prefer fixed +5/+13/+21 when present, else heuristic cluster.
   */
  function findSurvival(buf) {
    const hits = findAscii(buf, SURVIVAL_PATH);
    if (!hits.length) return null;
    const nameAt = hits[0];
    const dataAt = nameAt + SURVIVAL_PATH.length + 1;
    if (dataAt + 40 > buf.length) return null;
    const flag = C.readU32(buf, dataAt);

    const fixedOffs = [5, 13, 21];
    const fixed = fixedOffs.map((off) => ({ off, v: readF32(buf, dataAt + off) }));
    const fixedOk = fixed.every(
      (p) => Number.isFinite(p.v) && p.v >= 0 && p.v <= 20
    );
    if (fixedOk && fixed[0].v >= 0.05) {
      return {
        nameAt,
        dataAt,
        flag,
        hungerAt: dataAt + fixed[0].off,
        thirstAt: dataAt + fixed[1].off,
        thirdAt: dataAt + fixed[2].off,
        hunger: fixed[0].v,
        thirst: fixed[1].v,
        third: fixed[2].v,
      };
    }

    const candidates = [];
    for (let off = 4; off <= 28; off++) {
      const v = readF32(buf, dataAt + off);
      if (!Number.isFinite(v)) continue;
      if (v >= 0.05 && v <= 10) candidates.push({ off, v });
    }
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

  /**
   * Unspent milk molars (personal upgrade points) sit immediately before
   * PlayerUpgradeComponent: u32 points, u32 zero, u32 pathLen(37), path.
   */
  function findPersonalMolars(buf) {
    const hits = findAscii(buf, PUC_PATH);
    if (!hits.length) return null;
    const nameAt = hits[0];
    if (nameAt < 12) return null;
    const pathLen = C.readU32(buf, nameAt - 4);
    const zero = C.readU32(buf, nameAt - 8);
    const pointsAt = nameAt - 12;
    const points = C.readU32(buf, pointsAt);
    if (pathLen !== PUC_PATH.length + 1) return null;
    if (zero !== 0) return null;
    if (points > 100000) return null;
    return { nameAt, pointsAt, points };
  }

  /**
   * Upgrade tiers inside PlayerUpgradeComponent:
   * u8 tag, u32 count, u32 unk, then {FString name, i32 level, i32 unk2}*.
   */
  function findUpgrades(buf) {
    const hits = findAscii(buf, PUC_PATH);
    if (!hits.length) return null;
    const nameAt = hits[0];
    let off = nameAt + PUC_PATH.length + 1;
    if (off + 9 > buf.length) return null;
    const tag = buf[off];
    off += 1;
    const count = C.readU32(buf, off);
    off += 4;
    const unk = C.readU32(buf, off);
    off += 4;
    if (count < 0 || count > 32) return null;
    const entries = [];
    for (let i = 0; i < count; i++) {
      const fs = readFString(buf, off);
      if (!fs) return null;
      if (fs.next + 8 > buf.length) return null;
      const levelAt = fs.next;
      const level = readI32(buf, levelAt);
      const unk2 = readI32(buf, levelAt + 4);
      if (level < 0 || level > 20) return null;
      entries.push({ name: fs.s, level, levelAt, unk2 });
      off = levelAt + 8;
    }
    return { nameAt, tag, count, unk, entries };
  }

  /**
   * Unspent golden/mega molars (party upgrade points) sit in World.csav
   * just before the StackSize.* upgrade list: u32 points, u32 aux, u32 count, u32 unk, entries…
   * (The u32 after PartyComponent is the party knowledge-list count — not molars.)
   */
  function findPartyMolars(buf) {
    if (!buf || !buf.length) return null;
    const hits = findAscii(buf, "StackSize.Food");
    if (!hits.length) return null;
    const firstNameAt = hits[0];
    const start = firstNameAt - 4;
    if (start < 16) return null;
    const nameLen = readI32(buf, start);
    if (nameLen !== "StackSize.Food".length + 1) return null;
    const count = C.readU32(buf, start - 8);
    if (count < 1 || count > 8) return null;
    const pointsAt = start - 16;
    const points = C.readU32(buf, pointsAt);
    if (points > 100000) return null;
    return { pointsAt, points, start, count };
  }

  /**
   * Raw Science (ScienceFound) sits immediately before PartyComponent in World.csav:
   * u32 science, u32 zero, u32 pathLen, path — same framing as personal molars.
   */
  function findRawScience(buf) {
    if (!buf || !buf.length) return null;
    const hits = findAscii(buf, PARTY_PATH);
    if (!hits.length) return null;
    const nameAt = hits[0];
    if (nameAt < 12) return null;
    const pathLen = C.readU32(buf, nameAt - 4);
    const zero = C.readU32(buf, nameAt - 8);
    const pointsAt = nameAt - 12;
    const points = C.readU32(buf, pointsAt);
    if (pathLen !== PARTY_PATH.length + 1) return null;
    if (zero !== 0) return null;
    if (points > 5000000) return null;
    return { nameAt, pointsAt, points };
  }

  /** Vanilla BURG.L stack tiers top out around 5; editor "giant" pushes higher. */
  const GIANT_STACK_TIER = 20;
  const STACK_UPGRADE_NAMES = [
    "StackSize.Food",
    "StackSize.Resource",
    "StackSize.Ammo",
  ];

  /**
   * Party item-stack upgrades in World.csav:
   * u32 count, u32 unk, then {FString name, i32 level, i32 unk2}*
   * Names: StackSize.Food / StackSize.Resource / StackSize.Ammo
   */
  function findStackUpgrades(buf) {
    if (!buf || !buf.length) return null;
    const hits = findAscii(buf, "StackSize.Food");
    if (!hits.length) return null;
    const firstNameAt = hits[0];
    const start = firstNameAt - 4;
    if (start < 8) return null;
    const nameLen = readI32(buf, start);
    if (nameLen !== "StackSize.Food".length + 1) return null;
    const count = C.readU32(buf, start - 8);
    const unk = C.readU32(buf, start - 4);
    if (count < 1 || count > 8) return null;
    let off = start;
    const entries = [];
    for (let i = 0; i < count; i++) {
      const fs = readFString(buf, off);
      if (!fs || !fs.s.startsWith("StackSize.")) return null;
      if (fs.next + 8 > buf.length) return null;
      const levelAt = fs.next;
      const level = readI32(buf, levelAt);
      const unk2 = readI32(buf, levelAt + 4);
      if (level < 0 || level > 99) return null;
      entries.push({ name: fs.s, level, levelAt, unk2 });
      off = levelAt + 8;
    }
    return { start, count, unk, entries };
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
      if (
        parsed._survival.thirdAt != null &&
        values.third != null &&
        values.third !== ""
      ) {
        const n = Math.max(0, Math.min(20, Number(values.third)));
        if (!Number.isFinite(n)) throw new Error("Invalid survival third.");
        writeF32(out, parsed._survival.thirdAt, n);
        applied.third = n;
      }
    }
    if (!Object.keys(applied).length) {
      throw new Error("No vitals fields to write (component pattern not found).");
    }
    return { bytes: out, values: applied };
  }

  function parseMolars(rawPlayer, rawWorld) {
    const host = rawPlayer ? C.toBytes(rawPlayer) : null;
    const world = rawWorld ? C.toBytes(rawWorld) : null;
    const personal = host ? findPersonalMolars(host) : null;
    const upgrades = host ? findUpgrades(host) : null;
    const party = world ? findPartyMolars(world) : null;
    const stacks = world ? findStackUpgrades(world) : null;
    const science = world ? findRawScience(world) : null;
    return {
      ok: !!(personal || party || upgrades || stacks || science),
      milkMolars: personal ? personal.points : null,
      goldenMolars: party ? party.points : null,
      rawScience: science ? science.points : null,
      upgrades: upgrades
        ? upgrades.entries.map((e) => ({ name: e.name, level: e.level }))
        : [],
      stackUpgrades: stacks
        ? stacks.entries.map((e) => ({ name: e.name, level: e.level }))
        : [],
      _personal: personal,
      _party: party,
      _upgrades: upgrades,
      _stacks: stacks,
      _science: science,
    };
  }

  function writeMolars(rawPlayer, rawWorld, values) {
    const hostOut = rawPlayer ? new Uint8Array(C.toBytes(rawPlayer)) : null;
    const worldOut = rawWorld ? new Uint8Array(C.toBytes(rawWorld)) : null;
    const parsed = parseMolars(hostOut, worldOut);
    const applied = {};

    if (
      hostOut &&
      parsed._personal &&
      values.milkMolars != null &&
      values.milkMolars !== ""
    ) {
      const n = Math.max(0, Math.min(100000, Math.floor(Number(values.milkMolars))));
      if (!Number.isFinite(n)) throw new Error("Invalid milk molars.");
      C.writeU32(hostOut, parsed._personal.pointsAt, n);
      applied.milkMolars = n;
    }

    if (
      worldOut &&
      parsed._party &&
      values.goldenMolars != null &&
      values.goldenMolars !== ""
    ) {
      const n = Math.max(
        0,
        Math.min(100000, Math.floor(Number(values.goldenMolars)))
      );
      if (!Number.isFinite(n)) throw new Error("Invalid golden molars.");
      C.writeU32(worldOut, parsed._party.pointsAt, n);
      applied.goldenMolars = n;
    }

    if (
      worldOut &&
      parsed._science &&
      values.rawScience != null &&
      values.rawScience !== ""
    ) {
      const n = Math.max(0, Math.min(5000000, Math.floor(Number(values.rawScience))));
      if (!Number.isFinite(n)) throw new Error("Invalid raw science.");
      C.writeU32(worldOut, parsed._science.pointsAt, n);
      applied.rawScience = n;
    }

    if (hostOut && parsed._upgrades && values.upgrades) {
      for (const e of parsed._upgrades.entries) {
        const raw = values.upgrades[e.name];
        if (raw == null || raw === "") continue;
        const n = Math.max(0, Math.min(20, Math.floor(Number(raw))));
        if (!Number.isFinite(n)) throw new Error("Invalid upgrade level for " + e.name);
        writeI32(hostOut, e.levelAt, n);
        applied["upgrade." + e.name] = n;
      }
    }

    if (worldOut && parsed._stacks && values.stackUpgrades) {
      for (const e of parsed._stacks.entries) {
        const raw = values.stackUpgrades[e.name];
        if (raw == null || raw === "") continue;
        const n = Math.max(0, Math.min(99, Math.floor(Number(raw))));
        if (!Number.isFinite(n)) {
          throw new Error("Invalid stack upgrade level for " + e.name);
        }
        writeI32(worldOut, e.levelAt, n);
        applied["stack." + e.name] = n;
      }
    }

    if (!Object.keys(applied).length) {
      throw new Error("No molar/upgrade fields to write.");
    }
    return { hostBytes: hostOut, worldBytes: worldOut, values: applied };
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
    parseMolars,
    writeMolars,
    listItemPaths,
    parseSlotFolderName,
    findHealth,
    findSurvival,
    findPersonalMolars,
    findPartyMolars,
    findRawScience,
    findUpgrades,
    findStackUpgrades,
    GIANT_STACK_TIER,
    STACK_UPGRADE_NAMES,
  };
})();
