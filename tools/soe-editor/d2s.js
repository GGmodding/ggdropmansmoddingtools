(() => {
  "use strict";

  const MAGIC = [0x55, 0xaa, 0x55, 0xaa];
  const CLASSES = ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"];
  const STAT_META = {
    0: { key: "strength", bits: 10, shift: 0 },
    1: { key: "energy", bits: 10, shift: 0 },
    2: { key: "dexterity", bits: 10, shift: 0 },
    3: { key: "vitality", bits: 10, shift: 0 },
    4: { key: "statpts", bits: 10, shift: 0 },
    5: { key: "newskills", bits: 8, shift: 0 },
    6: { key: "hp", bits: 21, shift: 8 },
    7: { key: "maxhp", bits: 21, shift: 8 },
    8: { key: "mana", bits: 21, shift: 8 },
    9: { key: "maxmana", bits: 21, shift: 8 },
    10: { key: "stamina", bits: 21, shift: 8 },
    11: { key: "maxstamina", bits: 21, shift: 8 },
    12: { key: "level", bits: 7, shift: 0 },
    13: { key: "experience", bits: 32, shift: 0 },
    14: { key: "gold", bits: 25, shift: 0 },
    15: { key: "goldbank", bits: 25, shift: 0 },
  };
  const EDIT_KEYS = Object.values(STAT_META).map((m) => m.key);

  const QUEST_OFF = 0x14f;
  const QUEST_LEN = 298;
  const QUEST_HEADER = 10;
  const QUEST_DIFF = 96;
  const WP_OFF = 0x279;
  const WP_LEN = 81;
  const WP_HEADER = 8;
  const WP_DIFF = 24;
  const DIFF_OFF = 0xa8;
  const PROG_OFF = 0x25;
  const QUEST_DONE = 0x1001;
  const WP_ALL = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  const NPC_OFF = 0x2c9;
  const DIFF_NAMES = ["Normal", "Nightmare", "Hell"];

  const QUEST_DEFS = [
    { act: 1, off: 2, name: "Den of Evil", skill: 1 },
    { act: 1, off: 4, name: "Sisters' Burial Grounds" },
    { act: 1, off: 6, name: "Tools of the Trade" },
    { act: 1, off: 8, name: "The Search for Cain" },
    { act: 1, off: 10, name: "The Forgotten Tower" },
    { act: 1, off: 12, name: "Sisters to the Slaughter" },
    { act: 2, off: 18, name: "Radament's Lair", skill: 1 },
    { act: 2, off: 20, name: "The Horadric Staff" },
    { act: 2, off: 22, name: "Tainted Sun" },
    { act: 2, off: 24, name: "Arcane Sanctuary" },
    { act: 2, off: 26, name: "The Summoner" },
    { act: 2, off: 28, name: "The Seven Tombs" },
    { act: 3, off: 34, name: "Lam Esen's Tome", stat: 5 },
    { act: 3, off: 36, name: "Khalim's Will" },
    { act: 3, off: 38, name: "Blade of the Old Religion" },
    { act: 3, off: 40, name: "The Golden Bird", extra: 0x0040 },
    { act: 3, off: 42, name: "The Blackened Temple" },
    { act: 3, off: 44, name: "The Guardian" },
    { act: 4, off: 50, name: "The Fallen Angel", skill: 2 },
    { act: 4, off: 52, name: "Terror's End" },
    { act: 4, off: 54, name: "Hell's Forge" },
    { act: 5, off: 70, name: "Siege on Harrogath" },
    { act: 5, off: 72, name: "Rescue on Mount Arreat" },
    { act: 5, off: 74, name: "Prison of Ice (Malah +10 all res)", extra: 0x0180, malah: true },
    { act: 5, off: 76, name: "Betrayal of Harrogath" },
    { act: 5, off: 78, name: "Rite of Passage" },
    { act: 5, off: 80, name: "Eve of Destruction" },
  ];
  const QUEST_TRAVEL = [0, 14, 16, 30, 32, 46, 48, 62, 64];

  function u16(bytes, off) {
    return bytes[off] | (bytes[off + 1] << 8);
  }
  function setU16(bytes, off, value) {
    bytes[off] = value & 0xff;
    bytes[off + 1] = (value >> 8) & 0xff;
  }

  function questBase(diff) {
    return QUEST_OFF + QUEST_HEADER + diff * QUEST_DIFF;
  }
  function wpBitsOff(diff) {
    return WP_OFF + WP_HEADER + diff * WP_DIFF + 2;
  }

  function countWaypoints(bytes, diff) {
    let n = 0;
    const off = wpBitsOff(diff);
    for (let i = 0; i < 40; i++) {
      if (bytes[off + (i >> 3)] & (1 << (i & 7))) n++;
    }
    return n;
  }

  function summarizeProgress(bytes) {
    const diffs = DIFF_NAMES.map((name, diff) => {
      const base = questBase(diff);
      const quests = QUEST_DEFS.map((q) => ({
        name: q.name,
        act: q.act,
        done: !!(u16(bytes, base + q.off) & 1),
      }));
      const done = quests.filter((q) => q.done).length;
      return {
        name,
        quests,
        questsDone: done,
        questsTotal: QUEST_DEFS.length,
        waypoints: countWaypoints(bytes, diff),
        waypointsTotal: 40,
        act: bytes[DIFF_OFF + diff] & 7,
        active: !!(bytes[DIFF_OFF + diff] & 0x80),
      };
    });
    return { diffs, progression: bytes[PROG_OFF] };
  }

  function unlockProgress(parsed, opts) {
    opts = opts || {};
    const diffs = opts.diffs || [0, 1, 2];
    const grantRewards = opts.rewards !== false;
    const bytes = parsed.bytes;
    if (bytes[QUEST_OFF] !== 0x57 || bytes[QUEST_OFF + 1] !== 0x6f) {
      throw new Error("Quest block (Woo!) not found — this save may be corrupt");
    }
    if (bytes[WP_OFF] !== 0x57 || bytes[WP_OFF + 1] !== 0x53) {
      throw new Error("Waypoint block (WS) not found — this save may be corrupt");
    }
    let skillGain = 0;
    let statGain = 0;
    let malahGain = 0;
    let active = 0;
    for (let d = 0; d < 3; d++) {
      if (bytes[DIFF_OFF + d] & 0x80) active = d;
    }
    for (const diff of diffs) {
      const base = questBase(diff);
      for (const off of QUEST_TRAVEL) setU16(bytes, base + off, 1);
      bytes[base + 83] = 0x80;
      for (const q of QUEST_DEFS) {
        const cur = u16(bytes, base + q.off);
        if (grantRewards && !(cur & 1)) {
          skillGain += q.skill || 0;
          statGain += q.stat || 0;
        }
        if (q.malah && !(cur & 0x80)) malahGain += 10;
        setU16(bytes, base + q.off, QUEST_DONE | (q.extra || 0));
      }
      const wpOff = WP_OFF + WP_HEADER + diff * WP_DIFF;
      bytes[wpOff] = 0x02;
      bytes[wpOff + 1] = 0x01;
      for (let i = 0; i < WP_ALL.length; i++) bytes[wpOff + 2 + i] = WP_ALL[i];
    }
    for (let d = 0; d < 3; d++) bytes[DIFF_OFF + d] = 0x04;
    bytes[DIFF_OFF + active] = 0x84;
    bytes[PROG_OFF] = 0x0f;
    parsed.progression = 0x0f;
    if (bytes[NPC_OFF] === 0x01 && bytes[NPC_OFF + 1] === 0x77) {
      for (let i = 4; i < 52; i++) bytes[NPC_OFF + i] = 0xff;
    }
    if (grantRewards) {
      parsed.stats.newskills = Math.min(255, (parsed.stats.newskills || 0) + skillGain);
      parsed.stats.statpts = Math.min(1023, (parsed.stats.statpts || 0) + statGain);
    }
    return { skillGain, statGain, malahGain };
  }

  // Arreat Summit 1.10+ totals required to *be* this level.
  const EXP_TABLE = [
    0, 0, 500, 1500, 3750, 7875, 14175, 22680, 32886, 44396, 57715, 72144, 90180, 112725, 140906, 176132, 220165,
    275207, 344008, 430010, 537513, 671891, 839864, 1049830, 1312287, 1640359, 2050449, 2563061, 3203826, 3902260,
    4663553, 5493363, 6397855, 7383752, 8458379, 9629723, 10906488, 12298162, 13815086, 15468534, 17270791, 19235252,
    21376515, 23710491, 26254525, 29027522, 32050088, 35344686, 38935798, 42850109, 47116709, 51767302, 56836449,
    62361819, 68384473, 74949165, 82104680, 89904191, 98405658, 107672256, 117772849, 128782495, 140783010, 153863570,
    168121381, 183662396, 200602101, 219066380, 239192444, 261129853, 285041630, 311105466, 339515048, 370481492,
    404234916, 441026148, 481128591, 524840254, 572485967, 624419793, 681027665, 742730244, 809986056, 883294891,
    963201521, 1050299747, 1145236814, 1248718217, 1361512946, 1484459201, 1618470619, 1764543065, 1923762030,
    2097310703, 2286478756, 2492671933, 2717422497, 2962400612, 3229426756, 3520485254,
  ];

  function findAscii(bytes, s, from) {
    const need = [];
    for (let i = 0; i < s.length; i++) need.push(s.charCodeAt(i));
    for (let i = from || 0; i <= bytes.length - need.length; i++) {
      let ok = true;
      for (let j = 0; j < need.length; j++) {
        if (bytes[i + j] !== need[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  function readName(bytes) {
    let out = "";
    for (let i = 0; i < 16; i++) {
      const c = bytes[0x14 + i];
      if (!c) break;
      out += String.fromCharCode(c);
    }
    return out;
  }

  function writeName(bytes, name) {
    const clean = String(name || "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 15);
    for (let i = 0; i < 16; i++) bytes[0x14 + i] = i < clean.length ? clean.charCodeAt(i) : 0;
    return clean;
  }

  function checksum(bytes) {
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = i >= 12 && i < 16 ? 0 : bytes[i];
      sum = ((sum << 1) | (sum >>> 31)) + b;
      sum >>>= 0;
    }
    return sum;
  }

  function applyChecksum(bytes) {
    bytes[8] = bytes.length & 0xff;
    bytes[9] = (bytes.length >>> 8) & 0xff;
    bytes[10] = (bytes.length >>> 16) & 0xff;
    bytes[11] = (bytes.length >>> 24) & 0xff;
    bytes[12] = bytes[13] = bytes[14] = bytes[15] = 0;
    const sum = checksum(bytes);
    bytes[12] = sum & 0xff;
    bytes[13] = (sum >>> 8) & 0xff;
    bytes[14] = (sum >>> 16) & 0xff;
    bytes[15] = (sum >>> 24) & 0xff;
    return bytes;
  }

  function bitReader(bytes, start) {
    let bit = 0;
    const abs = () => start + (bit >> 3);
    return {
      read(n) {
        let v = 0;
        for (let i = 0; i < n; i++) {
          const byte = bytes[start + (bit >> 3)];
          if (byte === undefined) throw new Error("Unexpected end of stats block");
          v |= ((byte >> (bit & 7)) & 1) << i;
          bit++;
        }
        return v >>> 0;
      },
      byteOffset: () => start + Math.ceil(bit / 8),
      abs,
    };
  }

  function bitWriter() {
    const out = [];
    let cur = 0;
    let n = 0;
    return {
      write(value, bits) {
        let v = value >>> 0;
        for (let i = 0; i < bits; i++) {
          if (v & 1) cur |= 1 << n;
          v >>>= 1;
          n++;
          if (n === 8) {
            out.push(cur);
            cur = 0;
            n = 0;
          }
        }
      },
      finish() {
        if (n) out.push(cur);
        return out;
      },
    };
  }

  function emptyStats() {
    return {
      strength: 0,
      energy: 0,
      dexterity: 0,
      vitality: 0,
      statpts: 0,
      newskills: 0,
      hp: 0,
      maxhp: 0,
      mana: 0,
      maxmana: 0,
      stamina: 0,
      maxstamina: 0,
      level: 1,
      experience: 0,
      gold: 0,
      goldbank: 0,
    };
  }

  function parseStats(bytes, gfOff, ifOff) {
    const reader = bitReader(bytes, gfOff + 2);
    const stats = emptyStats();
    const extra = [];
    const present = [];
    for (;;) {
      const id = reader.read(9);
      if (id === 0x1ff) break;
      const meta = STAT_META[id];
      if (!meta) throw new Error("Unknown character stat id " + id + " — this save may use a newer SoE format");
      const raw = reader.read(meta.bits);
      const value = meta.shift ? Math.floor(raw / (1 << meta.shift)) : raw;
      stats[meta.key] = value;
      present.push(id);
    }
    if (reader.byteOffset() > ifOff + 2) {
      throw new Error("Stats block overran the skill header");
    }
    return { stats, extra, present };
  }

  function writeStats(stats, presentIds) {
    const writer = bitWriter();
    const ids = [];
    const seen = new Set();
    for (const id of presentIds || []) {
      if (STAT_META[id] && !seen.has(id)) {
        ids.push(id);
        seen.add(id);
      }
    }
    for (const id of Object.keys(STAT_META).map(Number)) {
      if (seen.has(id)) continue;
      const meta = STAT_META[id];
      const value = Number(stats[meta.key] || 0);
      if (value) {
        ids.push(id);
        seen.add(id);
      }
    }
    ids.sort((a, b) => a - b);
    for (const id of ids) {
      const meta = STAT_META[id];
      let value = Number(stats[meta.key] || 0);
      if (value < 0) value = 0;
      const max = (1 << meta.bits) - 1;
      let raw = meta.shift ? value * (1 << meta.shift) : value;
      if (raw > max) raw = max;
      writer.write(id, 9);
      writer.write(raw, meta.bits);
    }
    writer.write(0x1ff, 9);
    return Uint8Array.from(writer.finish());
  }

  function parse(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 800) throw new Error("File is too small to be a Diablo II character save");
    if (!(bytes[0] === 0x55 && bytes[1] === 0xaa && bytes[2] === 0x55 && bytes[3] === 0xaa)) {
      throw new Error("Not a Diablo II .d2s save (missing 55 AA 55 AA header)");
    }
    const version = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    if (version !== 0x60 && version !== 0x61) {
      throw new Error("Unsupported d2s version 0x" + version.toString(16));
    }
    const gfOff = findAscii(bytes, "gf", 0x2f0);
    const ifOff = findAscii(bytes, "if", gfOff > 0 ? gfOff : 0x2f0);
    const jmOff = findAscii(bytes, "JM", ifOff > 0 ? ifOff : 0x300);
    if (gfOff < 0 || ifOff < 0 || jmOff < 0) throw new Error("Could not find gf/if/JM markers — close the game and try again");
    const { stats, present } = parseStats(bytes, gfOff, ifOff);
    const skills = [];
    for (let i = 0; i < 30; i++) skills.push(bytes[ifOff + 2 + i] || 0);
    const classId = bytes[0x28];
    const status = bytes[0x24];
    const headerLevel = bytes[0x2b];
    if (!stats.level) stats.level = headerLevel || 1;
    const Items = typeof window !== "undefined" ? window.SoEItems : require("./items.js");
    let items = null;
    let itemsError = "";
    let itemSuffix = bytes.slice(jmOff);
    if (Items && Items.parseCharSection) {
      try {
        items = Items.parseCharSection(bytes, jmOff);
        itemSuffix = null;
      } catch (err) {
        itemsError = err.message || String(err);
      }
    }
    return {
      bytes,
      version,
      name: readName(bytes),
      classId,
      className: CLASSES[classId] || "Unknown",
      status,
      hardcore: !!(status & 0x04),
      died: !!(status & 0x08),
      expansion: !!(status & 0x20),
      progression: bytes[0x25],
      progress: summarizeProgress(bytes),
      stats,
      present,
      skills,
      gfOff,
      ifOff,
      jmOff,
      midPad: bytes.slice(ifOff + 32, jmOff),
      items,
      itemsError,
      itemSuffix,
    };
  }

  function write(parsed) {
    const src = parsed.bytes;
    const statsBytes = writeStats(parsed.stats, parsed.present);
    const prefix = src.slice(0, parsed.gfOff + 2);
    const mid = parsed.midPad && parsed.midPad.length ? parsed.midPad : new Uint8Array(0);
    const Items = typeof window !== "undefined" ? window.SoEItems : require("./items.js");
    const suffix =
      parsed.items && Items && Items.writeCharSection
        ? Items.writeCharSection(parsed.items)
        : parsed.itemSuffix || src.slice(parsed.jmOff);
    const out = new Uint8Array(prefix.length + statsBytes.length + 2 + 30 + mid.length + suffix.length);
    out.set(prefix, 0);
    out.set(statsBytes, prefix.length);
    let o = prefix.length + statsBytes.length;
    out[o++] = 0x69; // i
    out[o++] = 0x66; // f
    for (let i = 0; i < 30; i++) out[o++] = Math.max(0, Math.min(127, Number(parsed.skills[i] || 0)));
    out.set(mid, o);
    o += mid.length;
    out.set(suffix, o);
    writeName(out, parsed.name);
    out[0x24] = (parsed.hardcore ? 0x04 : 0) | (parsed.died ? 0x08 : 0) | 0x20;
    out[0x25] = parsed.progression != null ? parsed.progression & 0xff : out[0x25];
    out[0x28] = parsed.classId & 0xff;
    out[0x2b] = Math.max(1, Math.min(99, Number(parsed.stats.level || 1)));
    return applyChecksum(out);
  }

  function expForLevel(level) {
    const lv = Math.max(1, Math.min(99, Number(level) || 1));
    return EXP_TABLE[lv] || 0;
  }

  function verify(bytes) {
    const stored =
      bytes[12] | (bytes[13] << 8) | (bytes[14] << 16) | (bytes[15] << 24);
    const copy = Uint8Array.from(bytes);
    copy[12] = copy[13] = copy[14] = copy[15] = 0;
    const calc = checksum(copy);
    return (stored >>> 0) === (calc >>> 0);
  }

  const api = {
    MAGIC,
    CLASSES,
    DIFF_NAMES,
    QUEST_DEFS,
    EDIT_KEYS,
    EXP_TABLE,
    parse,
    write,
    checksum,
    applyChecksum,
    expForLevel,
    verify,
    readName,
    summarizeProgress,
    unlockProgress,
  };

  if (typeof window !== "undefined") window.SoESave = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
