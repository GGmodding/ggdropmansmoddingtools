(() => {
  "use strict";

  const C = window.GroundedCsav;

  const PERK_PATH = "/Script/Maine.PerkComponent";
  const PUC_PATH = "/Script/Maine.PlayerUpgradeComponent";
  const MAX_PHASE = 2; // 0 = unlocked P1, 1 = P2, 2 = P3
  const MAX_PERK_SLOTS_UPGRADE = 3; // molar-bought slot upgrades (2 base + 3 = 5)
  /** G2 packs phase + 3 trailing i32s (16 bytes); G1 used 12. */
  const ENTRY_TAIL = 16;

  const DISPLAY_NAMES = {
    KillFists: "Little Fist",
    KillUnarmed: "Little Fist",
    KillAxe: "Chopper",
    KillHammer: "Smashin'",
    KillSpear: "Javelineer",
    KillDagger: "Assassin",
    KillBow: "Sharpshooter",
    KillClub: "Smasher",
    KillSword: "Swordmaster",
    KillStaff: "Staff Master",
    PerfectBlockTotal: "Parry Master",
    Ambush: "Ambush",
    Frenzy: "Frenzy",
    MaxHealth: "Meat Shield",
    MaxStamina: "Buff Lungs",
    FallDamage: "Daredevil",
    HarvestGrass: "Grass Master",
    GrassMaster: "Grass Master",
    HarvestRock: "Rock Cracker",
    RockCracker: "Rock Cracker",
    CozinessHauling: "Coupled Comfort / Hauling",
    Discover4Leaf: "4-Leaf Clover",
    GoldCardColection: "Cardio Collection",
    Luck: "Lucky",
    StatueCollection: "Sculpture",
    DiscoverJuiceBoxes: "Juicy",
    DiscoverAllPOI: "Natural Explorer",
    DiscoverPond: "Pond Explorer",
    DepleteStamina: "Cardio Fan",
    ReviveFriend: "Mom Genes",
    PickupMint: "Fresh Defense",
    EatSpicyCandy: "Spicy Safety",
    EatSourCandy: "Sour Sensation",
    VenomResistance: "Venom Resistance",
    DefencePoint: "Guard Dog",
    PheromoneShot: "Pheromone Shot",
    BlazinBelch: "Blazin' Belch",
    BardicInspiration: "Bardic Inspiration",
    RecruitMaster: "Recruit Master",
    BlockingMaster: "Blocking Master",
    CritMachine: "Crit Machine",
    WebMaster: "Web Master",
    KillAnt: "Ant-nihilator",
    KillBroodmother: "Broodmother Bane",
    KillWolfSpider: "Wolf Spider Whacker",
    KillHazeEncounter: "Haze Specialist",
    KillMant: "Mant Masher",
    KillMantis: "Mantis Menace",
    KillSchmector: "Director's Cut",
    KillAssistantManager: "Corporate Raider",
    KillWaspQueen: "Wasp Warrior",
    FriendlyFire: "Friendly Fire",
    BefriendAntQueens: "Ant Queen Ally",
  };

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 120 || off + 4 + len > buf.length) return null;
    const raw = buf.subarray(off + 4, off + 4 + len - 1);
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== 0 && (c < 32 || c > 126)) return null;
    }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) return null;
    return { s, next: off + 4 + len, len };
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

  function payloadAfterScriptPath(buf, pathAt, pathStr) {
    let o = pathAt + pathStr.length + 1;
    const fs = readFString(buf, o);
    if (fs && fs.s.length >= 4 && fs.s.length < 64) return fs.next;
    return o;
  }

  function parsePerkComponent(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const nameAt = indexOfAscii(buf, PERK_PATH, 0);
    if (nameAt < 0) return { ok: false, entries: [] };
    let off = payloadAfterScriptPath(buf, nameAt, PERK_PATH);
    if (off + 9 > buf.length) return { ok: false, entries: [] };
    const tag = buf[off];
    off += 1;
    const count = C.readU32(buf, off);
    off += 4;
    const unk = C.readU32(buf, off);
    off += 4;
    if (count < 1 || count > 120) return { ok: false, entries: [] };
    const entries = [];
    for (let i = 0; i < count; i++) {
      const fs = readFString(buf, off);
      if (!fs || fs.next + ENTRY_TAIL > buf.length) {
        return { ok: entries.length > 0, tag, count, unk, entries, nameAt, size: buf.length };
      }
      const phaseAt = fs.next;
      const phase = new DataView(buf.buffer, buf.byteOffset + phaseAt, 4).getInt32(0, true);
      const b = new DataView(buf.buffer, buf.byteOffset + phaseAt + 4, 4).getInt32(0, true);
      const c = new DataView(buf.buffer, buf.byteOffset + phaseAt + 8, 4).getInt32(0, true);
      const d = new DataView(buf.buffer, buf.byteOffset + phaseAt + 12, 4).getInt32(0, true);
      if (phase < -1 || phase > 20) {
        return { ok: entries.length > 0, tag, count, unk, entries, nameAt, size: buf.length };
      }
      entries.push({
        id: fs.s,
        display: DISPLAY_NAMES[fs.s] || fs.s,
        phase,
        phaseAt,
        b,
        c,
        d,
        unlocked: phase >= 0,
      });
      off = phaseAt + ENTRY_TAIL;
    }
    return { ok: entries.length > 0, tag, count, unk, entries, nameAt, size: buf.length };
  }

  function parsePerksUpgrade(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const nameAt = indexOfAscii(buf, PUC_PATH, 0);
    if (nameAt < 0) return null;
    let off = payloadAfterScriptPath(buf, nameAt, PUC_PATH);
    if (off + 9 > buf.length) return null;
    off += 1; // tag
    const count = C.readU32(buf, off);
    off += 4;
    off += 4; // unk
    if (count < 1 || count > 32) return null;
    for (let i = 0; i < count; i++) {
      const fs = readFString(buf, off);
      if (!fs || fs.next + 8 > buf.length) return null;
      const levelAt = fs.next;
      const level = new DataView(buf.buffer, buf.byteOffset + levelAt, 4).getInt32(0, true);
      if (fs.s === "Perks") {
        return { level, levelAt, name: "Perks", max: MAX_PERK_SLOTS_UPGRADE };
      }
      off = levelAt + 8;
    }
    return null;
  }

  function writePerkPhase(rawPlayer, perkIndex, phase) {
    const parsed = parsePerkComponent(rawPlayer);
    if (!parsed.ok || perkIndex < 0 || perkIndex >= parsed.entries.length) {
      throw new Error("Mutation entry not found.");
    }
    const n = Math.max(-1, Math.min(MAX_PHASE, Math.floor(Number(phase))));
    if (!Number.isFinite(n)) throw new Error("Invalid mutation phase.");
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    const e = parsed.entries[perkIndex];
    new DataView(buf.buffer, buf.byteOffset + e.phaseAt, 4).setInt32(0, n, true);
    return { bytes: buf, id: e.id, phase: n };
  }

  function unlockAllMutations(rawPlayer, phase) {
    const target =
      phase == null ? MAX_PHASE : Math.max(0, Math.min(MAX_PHASE, Math.floor(Number(phase))));
    let buf = new Uint8Array(C.toBytes(rawPlayer));
    const parsed = parsePerkComponent(buf);
    if (!parsed.ok) throw new Error("Could not parse PerkComponent.");
    let changed = 0;
    for (let i = 0; i < parsed.entries.length; i++) {
      const e = parsed.entries[i];
      if (e.phase !== target) {
        new DataView(buf.buffer, buf.byteOffset + e.phaseAt, 4).setInt32(0, target, true);
        changed++;
      }
    }
    return { bytes: buf, changed, phase: target, total: parsed.entries.length };
  }

  function writePerksSlotUpgrade(rawPlayer, level) {
    const info = parsePerksUpgrade(rawPlayer);
    if (!info) throw new Error("Perks upgrade not found in PlayerUpgradeComponent.");
    const n = Math.max(0, Math.min(MAX_PERK_SLOTS_UPGRADE, Math.floor(Number(level))));
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    new DataView(buf.buffer, buf.byteOffset + info.levelAt, 4).setInt32(0, n, true);
    return { bytes: buf, level: n, slots: 2 + n };
  }

  window.GroundedPerks = {
    parsePerkComponent,
    parsePerksUpgrade,
    writePerkPhase,
    unlockAllMutations,
    writePerksSlotUpgrade,
    DISPLAY_NAMES,
    MAX_PHASE,
    MAX_PERK_SLOTS_UPGRADE,
  };
})();
