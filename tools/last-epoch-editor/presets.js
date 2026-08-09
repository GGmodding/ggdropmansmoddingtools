(() => {
  "use strict";

  /**
   * Offline presets — apply to a loaded character save (EPOCH JSON).
   * Gear uses Season rare packs; container IDs: 6=Belt, 7=Gloves.
   */

  const PRESET_VERSION = 15;
  const MONOLITH_LEVEL = 62;

  /** Armor / jewelry slots.
   * LE container IDs: 6=Belt, 7=Gloves.
   * Base types verified vs LETools/unique DB: 2=Belt, 4=Gloves.
   */
  const GEAR_SLOTS = [
    { containerID: 2, label: "Helmet", baseType: 0 },
    { containerID: 3, label: "Body Armor", baseType: 1 },
    { containerID: 7, label: "Gloves", baseType: 4 },
    { containerID: 8, label: "Boots", baseType: 3 },
    { containerID: 6, label: "Belt", baseType: 2 },
    { containerID: 9, label: "Amulet", baseType: 20 },
    { containerID: 10, label: "Ring 1", baseType: 21 },
    { containerID: 11, label: "Ring 2", baseType: 21 },
    { containerID: 12, label: "Relic", baseType: 22 },
  ];

  /**
   * Save characterClass → LETools classRequirement bitflag.
   * Mage/Primalist are swapped vs 1<<classId because LETools enum order differs.
   */
  const CLASS_REQ_FLAG = {
    0: 2, // Mage
    1: 1, // Primalist
    2: 4, // Sentinel
    3: 8, // Acolyte
    4: 16, // Rogue
  };

  function classReqFlag(classId) {
    const f = CLASS_REQ_FLAG[Number(classId)];
    return f != null ? f : 0;
  }

  function subtypeClassScore(cr, flag) {
    const c = Number(cr) || 0;
    if (flag && (c & flag)) return 2; // class family match
    if (c === 0) return 1; // universal
    return 0; // other class
  }

  /**
   * Class → 1H weapon + off-hand (base type IDs from items DB / unique evidence).
   * 0 Mage, 1 Primalist, 2 Sentinel, 3 Acolyte, 4 Rogue
   */
  const CLASS_WEAPON_LOADOUTS = {
    0: { weapon: 10, offhand: 19 }, // Wand + Catalyst
    1: { weapon: 7, offhand: 18 }, // Mace + Shield
    2: { weapon: 9, offhand: 18 }, // Sword + Shield
    3: { weapon: 8, offhand: 19 }, // Sceptre + Catalyst
    4: { weapon: 6, offhand: 6 }, // Dual daggers
  };

  /** Affix pools keyed by base type for weapons / off-hands. */
  const WEAPON_AFFIX_BY_BASE = {
    5: [2, 5, 12, 55], // 1H Axe: attack speed / crit / fire / ignite
    6: [2, 5, 12, 55], // Dagger
    7: [2, 5, 12, 55], // 1H Mace
    8: [4, 5, 12, 55], // Sceptre
    9: [2, 5, 12, 55], // 1H Sword: Deft, Assassin's, Pyromancer's, of Conflagration
    10: [4, 5, 12, 55], // Wand
    18: [1, 3, 25, 80], // Shield
    19: [4, 5, 12, 55], // Catalyst
  };

  function weaponSlotsForClass(classId) {
    const load =
      CLASS_WEAPON_LOADOUTS[Number(classId)] || CLASS_WEAPON_LOADOUTS[2];
    return [
      { containerID: 4, label: "Weapon", baseType: load.weapon },
      { containerID: 5, label: "Off-hand", baseType: load.offhand },
    ];
  }

  /** Preferred affix lists per slot (IDs must be < 256). Boots lead with Mercurial MS. */
  const DEFENSE_AFFIX_POOLS = {
    2: [25, 1, 80, 13], // Helmet: Life, Defense, Insulation, Fire
    3: [25, 52, 1, 80], // Body: Life, Ox, Defense, Insulation
    7: [25, 45, 80, 24], // Gloves: Life, Phys res, Insulation, Lightning
    8: [25, 8, 80, 1], // Boots: Life, Dodge, Insulation, Defense
    6: [25, 31, 80, 17], // Belt: Life, Armor, Insulation, Cold
    9: [25, 80, 45, 22], // Amulet: Life, Insulation, Phys, Regen
    10: [25, 80, 13, 7], // Ring: Life, Insulation, Fire, Void
    11: [25, 80, 17, 24], // Ring: Life, Insulation, Cold, Lightning
    12: [25, 80, 45, 10], // Relic: Life, Insulation, Phys, Necrotic
  };

  /** Movement + defense: boots get Mercurial; other slots armor/life/res. */
  const SWIFT_DEFENSE_AFFIX_POOLS = {
    2: [25, 1, 31, 80], // Helmet
    3: [25, 52, 1, 80], // Body
    7: [25, 45, 80, 8], // Gloves
    8: [28, 1, 25, 80], // Boots: Mercurial MS, Defense, Life, Insulation
    6: [25, 31, 80, 45], // Belt
    9: [25, 80, 45, 13], // Amulet
    10: [25, 80, 17, 24], // Ring
    11: [25, 80, 13, 7], // Ring
    12: [25, 80, 45, 31], // Relic
  };

  function affixMeta(id) {
    const db = window.LEAffixes && window.LEAffixes.AFFIXES;
    if (!db) return null;
    return db[id] || db[String(id)] || null;
  }

  function affixAllowedOnBase(id, baseType) {
    const a = affixMeta(id);
    if (!a) return false;
    const on = a.on || [];
    return on.includes(Number(baseType));
  }

  function filterAffixesForLevel(ids, baseType, level) {
    const lv = Math.max(1, Number(level) || 1);
    const out = [];
    const fallbacks = [25, 13, 17, 24, 45, 8, 1, 31, 80];
    const tryAdd = (id) => {
      const n = Number(id);
      if (!Number.isFinite(n) || n < 0 || n > 255) return;
      if (out.includes(n)) return;
      const a = affixMeta(n);
      if (!a) return;
      if ((Number(a.lvl) || 0) > lv) return;
      if (!affixAllowedOnBase(n, baseType)) return;
      out.push(n);
    };
    for (const id of ids || []) {
      tryAdd(id);
      if (out.length >= 4) break;
    }
    for (const id of fallbacks) {
      if (out.length >= 4) break;
      tryAdd(id);
    }
    return out.slice(0, 4);
  }

  /** Preferred prefixes/suffixes for exalted 2P+2S packing (IDs must be ≤255). */
  const EXALT_PREFIX_PREFS = {
    // by base type
    0: [34, 53, 70, 73], // Helmet: Manafused, ManaBeforeHP, Ursine, Reptilian
    1: [34, 95, 96, 53], // Body: Manafused, Thorny, Reflective
    2: [12, 16, 23, 30, 26, 4], // Belt: elem/phys hybrids that can roll belts
    3: [28, 71], // Boots: Mercurial first
    4: [2, 4, 5, 66, 69], // Gloves: Deft, Shade's, Assassin's, Alchemist, Leech
    18: [3, 81, 95, 89], // Shield: Guardian's, Protective, Thorny
    19: [4, 38, 34, 5], // Catalyst
    20: [34, 38, 5, 9, 30], // Amulet
    21: [5, 38, 9, 30, 12], // Ring
    22: [34, 5, 30, 70, 4], // Relic
    5: [2, 5, 12, 30],
    6: [2, 5, 12, 30],
    7: [2, 5, 12, 30],
    8: [4, 12, 5, 30],
    9: [2, 5, 12, 30],
    10: [4, 12, 5, 30],
  };

  const EXALT_SUFFIX_PREFS = {
    0: [25, 80, 1, 31, 45, 13],
    1: [25, 52, 1, 80, 45, 31],
    2: [25, 80, 45, 31, 17, 24],
    3: [25, 1, 80, 8, 45],
    4: [25, 45, 80, 8, 31],
    18: [25, 1, 3, 80, 45, 74],
    19: [25, 8, 13, 24, 7],
    20: [25, 80, 45, 13, 22],
    21: [25, 80, 17, 24, 13],
    22: [25, 80, 45, 31, 10],
    5: [55, 20, 44, 58, 91],
    6: [55, 20, 44, 58, 91],
    7: [55, 20, 44, 58, 91],
    8: [55, 20, 11, 58],
    9: [55, 20, 44, 58, 91],
    10: [55, 11, 56, 58],
  };

  function listAffixesOfType(baseType, type, level) {
    const db = window.LEAffixes && window.LEAffixes.AFFIXES;
    if (!db) return [];
    const lv = Math.max(1, Number(level) || 1);
    const out = [];
    for (const [id, a] of Object.entries(db)) {
      const n = Number(id);
      if (!Number.isFinite(n) || n < 0 || n > 255) continue;
      if (!a || Number(a.t) !== Number(type)) continue;
      if ((Number(a.lvl) || 0) > lv) continue;
      if (!affixAllowedOnBase(n, baseType)) continue;
      out.push(n);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  /**
   * Build a valid exalted line: 2 prefixes + 2 suffixes (packable IDs ≤255).
   * Preferred lists first, then any allowed affix of that type.
   */
  function pickBalancedAffixes(baseType, level, preferredIds) {
    const prefs = preferredIds || [];
    const prefixPrefs = (EXALT_PREFIX_PREFS[baseType] || []).concat(prefs);
    const suffixPrefs = (EXALT_SUFFIX_PREFS[baseType] || []).concat(prefs);

    const pickType = (type, preferred, need) => {
      const out = [];
      const tryAdd = (id) => {
        const n = Number(id);
        if (!Number.isFinite(n) || n < 0 || n > 255) return;
        if (out.includes(n)) return;
        const a = affixMeta(n);
        if (!a || Number(a.t) !== type) return;
        if ((Number(a.lvl) || 0) > Number(level || 1)) return;
        if (!affixAllowedOnBase(n, baseType)) return;
        out.push(n);
      };
      for (const id of preferred) {
        tryAdd(id);
        if (out.length >= need) return out;
      }
      for (const id of listAffixesOfType(baseType, type, level)) {
        tryAdd(id);
        if (out.length >= need) return out;
      }
      return out;
    };

    const prefixes = pickType(0, prefixPrefs, 2);
    const suffixes = pickType(1, suffixPrefs, 2);
    // Prefer 2P+2S order. If a base cannot roll enough of one type, fill remaining.
    let combined = prefixes.concat(suffixes);
    if (combined.length < 4) {
      const filler = filterAffixesForLevel(prefs.concat(combined), baseType, level);
      for (const id of filler) {
        if (combined.length >= 4) break;
        if (!combined.includes(id)) combined.push(id);
      }
    }
    return combined.slice(0, 4);
  }

  function affixTierForLevel(level) {
    // Season rare packs only reliably apply low tier bytes (0–1) + roll.
    // Roll 255 maxes the mod; UI T labels are cosmetic for Season rares.
    void level;
    return 0;
  }

  function affixRows(ids, level) {
    const tier = affixTierForLevel(level);
    return (ids || []).slice(0, 4).map((id) => ({
      id: Number(id),
      tier,
      roll: 255,
      sealed: false,
    }));
  }

  function maxPackedRolls(item) {
    if (!item || !Array.isArray(item.data)) return 0;
    if (window.LEItems && typeof window.LEItems.maxAffixRolls === "function") {
      return window.LEItems.maxAffixRolls(item.data);
    }
    // Fallback: season affix roll bytes only
    const d = item.data;
    if (!(d[0] >= 2 && d.length >= 12 && d[5] <= 3)) return 0;
    let n = 0;
    const count = Math.min(6, d[11] || 0);
    for (let a = 0; a < count; a++) {
      const i = 12 + a * 3 + 2;
      if (i < d.length && d[i] !== 255) {
        d[i] = 255;
        n += 1;
      }
    }
    return n;
  }

  function subtypeLevel(baseType, subType) {
    const bases = window.LEItems && window.LEItems.DB && window.LEItems.DB.bases;
    const b = bases && bases[baseType];
    const s = b && b.subs && (b.subs[subType] || b.subs[String(subType)]);
    return Number(s && s.lvl) || 0;
  }

  function bestSubtype(baseType, level, allowedSubs, opts) {
    opts = opts || {};
    const lv = Math.max(1, Math.min(100, Number(level) || 1));
    const bases = window.LEItems && window.LEItems.DB && window.LEItems.DB.bases;
    const b = bases && bases[baseType];
    if (!b || !b.subs) return 0;
    const allow = allowedSubs && allowedSubs.length ? new Set(allowedSubs.map(Number)) : null;
    const flag = opts.classId != null ? classReqFlag(opts.classId) : 0;
    let best = { sid: 0, lvl: -1, score: -1 };
    for (const [sid, s] of Object.entries(b.subs)) {
      const id = Number(sid);
      if (allow && !allow.has(id)) continue;
      const req = Number(s && s.lvl) || 0;
      if (req > lv) continue;
      const score = subtypeClassScore(s && s.cr, flag);
      if (
        score > best.score ||
        (score === best.score && req > best.lvl) ||
        (score === best.score && req === best.lvl && id > best.sid)
      ) {
        best = { sid: id, lvl: req, score };
      }
    }
    // Never return an over-level subtype (even if it was previously on the character)
    if (best.lvl < 0) return allow && allow.size ? null : 0;
    return best.sid;
  }

  /** Class relic ladders in the items DB (contiguous subtype id ranges). */
  const RELIC_LADDERS = [
    [0, 10],
    [11, 19],
    [20, 28],
    [29, 37],
    [38, 46],
    [47, 56],
    [57, 60],
    [61, 71],
  ];

  function relicLadderSubs(seedSub) {
    const sid = Number(seedSub);
    if (!Number.isFinite(sid)) return null;
    for (const [lo, hi] of RELIC_LADDERS) {
      if (sid >= lo && sid <= hi) {
        const out = [];
        for (let i = lo; i <= hi; i++) out.push(i);
        return out;
      }
    }
    return [sid];
  }

  function unpackItem(it) {
    if (!it || !window.LEItemCodec) return null;
    return window.LEItemCodec.unpackBestEffort(it.data);
  }

  /**
   * Armor/jewelry: highest subtype this character can equip at their current level.
   * Relics: stay on the class ladder already on the save (equipped first).
   */
  function resolveSlotIdentity(data, slot, level) {
    const lv = Math.max(1, Math.min(100, Number(level) || 1));
    const items = window.LESave.ensureSavedItems(data);

    // Relics are class-locked — never invent another class's relic
    if (slot.baseType === 22) {
      let seed = null;
      for (const it of items) {
        if (Number(it.containerID) !== slot.containerID) continue;
        const p = unpackItem(it);
        if (!p || Number(p.baseType) !== 22) continue;
        seed = Number(p.subType) || 0;
        break;
      }
      if (seed == null) return null;
      const ladder = relicLadderSubs(seed);
      const subType = bestSubtype(22, lv, ladder, { classId: data.characterClass });
      if (subType == null) return null;
      return { baseType: 22, subType, source: "relic-ladder" };
    }

    // Always use the slot's base type + best usable subtype for this level.
    // Prefer class-affinity families when classRequirement data is present.
    const subType = bestSubtype(slot.baseType, lv, null, { classId: data.characterClass });
    if (subType == null) return null;
    return {
      baseType: slot.baseType,
      subType,
      source: "level",
      reqLevel: subtypeLevel(slot.baseType, subType),
    };
  }

  function nextInventoryPosition(items) {
    let maxY = -1;
    for (const it of items) {
      if (Number(it.containerID) !== 1) continue;
      const y = Number(it.inventoryPosition && it.inventoryPosition.y) || 0;
      if (y > maxY) maxY = y;
    }
    return { x: 0, y: maxY + 1 };
  }

  function buildGearItem(slot, affixIds, level, identity, classId, opts) {
    opts = opts || {};
    const codec = window.LEItemCodec;
    if (!codec) throw new Error("Item codec unavailable.");
    const baseType = slot.baseType;
    // Relics: keep class ladder subtype from identity. Everything else: best for level+class.
    let subType;
    if (baseType === 22 && identity && identity.subType != null) {
      subType = identity.subType;
    } else {
      subType = bestSubtype(baseType, level, null, { classId });
    }
    if (subType == null) throw new Error("No usable subtype for " + (slot.label || baseType));
    const filtered = opts.balancedAffixes
      ? pickBalancedAffixes(baseType, level, affixIds)
      : filterAffixesForLevel(affixIds, baseType, level);
    const item = codec.createSavedItem({
      baseType,
      subType,
      quality: 3,
      forgingPotential: 255,
      affixes: affixRows(filtered, level),
      implicits: [255, 255, 255],
      containerID: slot.containerID,
      x: 0,
      y: 0,
      quantity: 1,
    });
    maxPackedRolls(item);
    return item;
  }

  function equipGearSet(data, pools, level, opts) {
    opts = opts || {};
    const items = window.LESave.ensureSavedItems(data);
    const slots = GEAR_SLOTS.slice();
    if (opts.includeWeapons !== false) {
      slots.push(...weaponSlotsForClass(data.characterClass));
    }
    const mergedPools = Object.assign({}, pools);
    for (const slot of slots) {
      if (mergedPools[slot.containerID]) continue;
      if (WEAPON_AFFIX_BY_BASE[slot.baseType]) {
        mergedPools[slot.containerID] = WEAPON_AFFIX_BY_BASE[slot.baseType];
      }
    }
    const target = new Set(slots.map((s) => s.containerID));
    let moved = 0;
    let equipped = 0;
    let skipped = 0;
    const reqLevels = [];

    // Snapshot relic ladders BEFORE moving equipped gear
    const identities = new Map();
    for (const slot of slots) {
      const id = resolveSlotIdentity(data, slot, level);
      if (id) identities.set(slot.containerID, id);
    }

    for (const it of items) {
      const cid = Number(it.containerID);
      if (!target.has(cid)) continue;
      const pos = nextInventoryPosition(items);
      it.containerID = 1;
      it.inventoryPosition = pos;
      moved += 1;
    }

    for (const slot of slots) {
      const identity = identities.get(slot.containerID);
      if (slot.baseType === 22 && !identity) {
        skipped += 1;
        continue;
      }
      try {
        const pool = mergedPools[slot.containerID] || [25, 13, 17, 24];
        const item = buildGearItem(slot, pool, level, identity || null, data.characterClass, {
          balancedAffixes: !!opts.balancedAffixes,
        });
        items.push(item);
        equipped += 1;
        const packed = unpackItem(item);
        reqLevels.push({
          slot: slot.label,
          baseType: packed && packed.baseType,
          subType: packed && packed.subType,
          req: packed != null ? subtypeLevel(packed.baseType, packed.subType) : 0,
        });
      } catch (_err) {
        skipped += 1;
      }
    }
    return {
      moved,
      equipped,
      skipped,
      level: Number(level) || 1,
      classId: Number(data.characterClass),
      weapons: opts.includeWeapons !== false,
      reqLevels,
      version: PRESET_VERSION,
    };
  }

  function equipDefenseSet(data, level) {
    const lv = level != null ? level : MONOLITH_LEVEL;
    return equipGearSet(data, DEFENSE_AFFIX_POOLS, lv);
  }

  function resetMonolithStart(data) {
    data.monolithDepth = 0;
    data.maxCorruption = 0;
    data.monolithEchoesConquered = 0;
    data.monolithTimelinesConquered = 0;
    data.currentMonolithRunTimelineID = 1;
    if (data.currentMonolithRunDifficulty != null) data.currentMonolithRunDifficulty = 0;
    data.previousMonolithEchoTimelineID = 0;
    data.timelineDifficultyUnlocks = [{ timelineID: 1, progress: [1] }];
    data.timelineCompletion = [];
    data.timelineDifficultyCompletion = [];
  }

  /**
   * Level 62 · campaign done · Monolith of Fate entry · defensive rares + class weapons.
   * Keeps all passive/skill allocations. Gear path matches Swift + armor.
   */
  function applyMonolithStart(data) {
    if (!data || typeof data !== "object") throw new Error("No character data.");
    const LESave = window.LESave;
    const LEProgress = window.LEProgress;
    if (!LESave) throw new Error("Save helpers unavailable.");
    if (!LEProgress) throw new Error("Progress database unavailable.");
    if (!window.LEItemCodec || typeof window.LEItemCodec.packSeasonRare !== "function") {
      throw new Error("Season item codec unavailable.");
    }

    const summary = {
      level: MONOLITH_LEVEL,
      quests: 0,
      waypoints: 0,
      flags: 0,
      gearMoved: 0,
      gearEquipped: 0,
      skipped: 0,
      masteryRestored: false,
      chosenMastery: 0,
      version: PRESET_VERSION,
    };

    // Preserve mastery before anything else (same as Swift)
    summary.masteryRestored = !!LESave.restoreMasteryChoice(data);
    summary.chosenMastery = Number(data.chosenMastery) || 0;

    data.level = MONOLITH_LEVEL;
    data.currentExp = 0;
    data.portalUnlocked = true;
    data.reachedTown = true;
    data.focusedQuest = -1;
    data.clickedUnlockMasteriesButton = true;

    summary.quests = LESave.applyCampaignQuests(data);
    summary.waypoints = LESave.unlockAllKnownWaypoints(data);
    summary.flags = LESave.mergeCampaignFlags(data);
    LESave.unlockMasteries(data);
    LESave.unlockWaypoints(data, ["MonolithHub", "EoT", "Mastery"]);
    summary.masteryRestored = summary.masteryRestored || !!LESave.restoreMasteryChoice(data);
    summary.chosenMastery = Number(data.chosenMastery) || 0;

    resetMonolithStart(data);

    // Same max-rolled, level-matched, class-safe gear path as Swift + armor
    const gear = equipGearSet(data, SWIFT_DEFENSE_AFFIX_POOLS, MONOLITH_LEVEL, {
      includeWeapons: true,
    });
    summary.gearMoved = gear.moved;
    summary.gearEquipped = gear.equipped;
    summary.skipped = gear.skipped || 0;
    summary.reqLevels = gear.reqLevels || [];

    // Keep existing passive + skill point allocations (do not respec trees).

    if (typeof data.gold !== "number" || data.gold < 50000) {
      data.gold = 100000;
      summary.gold = 100000;
    }

    if (typeof data.respecs !== "number" || data.respecs < 20) {
      data.respecs = 50;
    }

    summary.note =
      "v" +
      PRESET_VERSION +
      ": Lv62 monolith start + max-rolled defense gear + class 1H/off-hand (class-safe relics, level-correct bases). Trees untouched.";

    return summary;
  }

  /**
   * Replace armor/jewelry/weapons with level-scaled Season rares (Mercurial boots + defenses + class 1H/OH).
   * Does not change level, quests, waypoints, monolith, or trees.
   */
  function applySwiftDefenseGear(data) {
    if (!data || typeof data !== "object") throw new Error("No character data.");
    if (!window.LESave) throw new Error("Save helpers unavailable.");
    if (!window.LEItemCodec || typeof window.LEItemCodec.packSeasonRare !== "function") {
      throw new Error("Season item codec unavailable.");
    }

    // Don't let Save overwrite mastery with form none / keep Gaspar pick intact
    const masteryRestored = window.LESave.restoreMasteryChoice(data);

    const level = Math.max(1, Math.min(100, Number(data.level) || 1));
    const gear = equipGearSet(data, SWIFT_DEFENSE_AFFIX_POOLS, level, { includeWeapons: true });
    const minReq = (gear.reqLevels || []).reduce(
      (m, r) => Math.min(m, Number(r.req) || 0),
      999
    );
    return {
      level,
      gearMoved: gear.moved,
      gearEquipped: gear.equipped,
      skipped: gear.skipped || 0,
      weapons: !!gear.weapons,
      reqLevels: gear.reqLevels || [],
      masteryRestored,
      chosenMastery: Number(data.chosenMastery) || 0,
      version: PRESET_VERSION,
      note:
        "v" +
        PRESET_VERSION +
        ": max-rolled Season rares (tier-scaled), highest wearable bases + class 1H/off-hand (class-safe relics). Quests untouched." +
        (minReq < 999 ? " Lowest base req among pieces: " + minReq + "." : ""),
    };
  }

  /**
   * Same class-safe bases / weapons as Swift, but each piece aims for 2 prefixes + 2 suffixes
   * (exalted line) with max rolls at the tier unlocked by current level.
   */
  function applyExaltedDefenseGear(data) {
    if (!data || typeof data !== "object") throw new Error("No character data.");
    if (!window.LESave) throw new Error("Save helpers unavailable.");
    if (!window.LEItemCodec || typeof window.LEItemCodec.packSeasonRare !== "function") {
      throw new Error("Season item codec unavailable.");
    }

    const masteryRestored = window.LESave.restoreMasteryChoice(data);
    const level = Math.max(1, Math.min(100, Number(data.level) || 1));
    const gear = equipGearSet(data, SWIFT_DEFENSE_AFFIX_POOLS, level, {
      includeWeapons: true,
      balancedAffixes: true,
    });
    const minReq = (gear.reqLevels || []).reduce(
      (m, r) => Math.min(m, Number(r.req) || 0),
      999
    );
    return {
      level,
      gearMoved: gear.moved,
      gearEquipped: gear.equipped,
      skipped: gear.skipped || 0,
      weapons: !!gear.weapons,
      balancedAffixes: true,
      reqLevels: gear.reqLevels || [],
      masteryRestored,
      chosenMastery: Number(data.chosenMastery) || 0,
      version: PRESET_VERSION,
      note:
        "v" +
        PRESET_VERSION +
        ": exalted defenses — 2 prefixes + 2 suffixes, max rolls, class-safe bases + 1H/off-hand. Quests untouched." +
        (minReq < 999 ? " Lowest base req among pieces: " + minReq + "." : ""),
    };
  }

  /**
   * Strongest legal defensive ring for Season rare packing (ids ≤255, 2P+2S).
   * Note: true "+% to All Resistances" (of Defiance) only rolls on shields.
   * Rings get elemental Insulation + Life as the best res/tank pair.
   */
  const MAXED_DEFENSE_RING_AFFIXES = [
    { id: 83, tier: 0, roll: 255 }, // Philosopher's — potion→ward
    { id: 9, tier: 0, roll: 255 }, // Shimmering — elemental damage
    { id: 80, tier: 0, roll: 255 }, // of Insulation — up to +75% elemental res
    { id: 25, tier: 0, roll: 255 }, // of Life — flat health
  ];

  function createMaxedDefenseRing(data) {
    if (!data || typeof data !== "object") throw new Error("No character data.");
    if (!window.LESave) throw new Error("Save helpers unavailable.");
    const codec = window.LEItemCodec;
    if (!codec || typeof codec.createSavedItem !== "function") {
      throw new Error("Season item codec unavailable.");
    }

    const level = Math.max(1, Math.min(100, Number(data.level) || 1));
    const subType = bestSubtype(21, level, null, { classId: data.characterClass });
    if (subType == null) throw new Error("No wearable ring subtype for this level.");

    const affixes = MAXED_DEFENSE_RING_AFFIXES.filter((a) => {
      const meta = affixMeta(a.id);
      if (!meta) return false;
      if ((Number(meta.lvl) || 0) > level) return false;
      return affixAllowedOnBase(a.id, 21);
    }).slice(0, 4);

    // Fallback if Philosopher's is over-level: swap in Assassin's / keep res pair
    while (affixes.length < 4) {
      for (const id of [5, 38, 45, 13, 17, 24, 7, 10]) {
        if (affixes.some((a) => a.id === id)) continue;
        if (!affixAllowedOnBase(id, 21)) continue;
        const meta = affixMeta(id);
        if (!meta || (Number(meta.lvl) || 0) > level) continue;
        affixes.push({ id, tier: 0, roll: 255 });
        if (affixes.length >= 4) break;
      }
      break;
    }

    const items = window.LESave.ensureSavedItems(data);
    const pos = nextInventoryPosition(items);
    const item = codec.createSavedItem({
      baseType: 21,
      subType,
      quality: 3,
      forgingPotential: 255,
      affixes: affixRows(
        affixes.map((a) => a.id),
        level
      ),
      implicits: [255, 255, 255],
      containerID: 1,
      x: pos.x,
      y: pos.y,
      quantity: 1,
    });
    maxPackedRolls(item);
    items.push(item);

    const req = subtypeLevel(21, subType);
    return {
      level,
      subType,
      req,
      affixes: affixes.map((a) => a.id),
      position: pos,
      version: PRESET_VERSION,
      note:
        "Max legal defensive ring (Season). Insulation ≈ +75% elemental res + Life. " +
        "Cannot store arbitrary 999% — game maps roll 255 into each affix’s fixed range. " +
        "True all-res (of Defiance) is shield-only.",
    };
  }

  /**
   * Inject/max classic craft stacks [1, baseType, subType] for the given base types.
   */
  function grantCraftStacks(data, baseTypes, opts) {
    opts = opts || {};
    const qty = Math.max(1, Math.min(99999999, Number(opts.quantity) || 9999));
    const note = opts.note || "";
    if (!window.LESave) throw new Error("Save helpers unavailable.");
    const items = window.LESave.ensureSavedItems(data);
    const bases = (window.LEItems && window.LEItems.DB && window.LEItems.DB.bases) || {};
    const catalog = [];
    for (const baseType of baseTypes) {
      const b = bases[baseType] || bases[String(baseType)];
      if (!b || !b.subs) continue;
      for (const sid of Object.keys(b.subs)) {
        catalog.push({ baseType: Number(baseType), subType: Number(sid) });
      }
    }
    if (!catalog.length) {
      throw new Error("No craft subtypes found for bases " + baseTypes.join(", "));
    }

    let updated = 0;
    let created = 0;

    function findStack(baseType, subType) {
      for (const it of items) {
        const d = it.data;
        if (!Array.isArray(d) || d.length < 3) continue;
        if ((d[0] === 0 || d[0] === 1) && Number(d[1]) === baseType && Number(d[2]) === subType) {
          return it;
        }
      }
      return null;
    }

    let cursor = nextInventoryPosition(items);
    for (const { baseType, subType } of catalog) {
      const existing = findStack(baseType, subType);
      if (existing) {
        existing.quantity = qty;
        updated += 1;
      } else {
        items.push({
          itemData: null,
          data: [1, baseType, subType],
          inventoryPosition: { x: cursor.x, y: cursor.y },
          quantity: qty,
          containerID: 1,
          formatVersion: 2,
        });
        created += 1;
        cursor.x += 1;
        if (cursor.x >= 12) {
          cursor.x = 0;
          cursor.y += 1;
        }
      }
    }

    return {
      quantity: qty,
      updated,
      created,
      total: catalog.length,
      version: PRESET_VERSION,
      note: note || ("Granted " + catalog.length + " craft stacks at ×" + qty + "."),
    };
  }

  /** All forge Runes + Glyphs. */
  function grantForgeMaterials(data, opts) {
    opts = opts || {};
    return grantCraftStacks(data, [102, 103], {
      quantity: opts.quantity,
      note: "Granted all Runes + Glyphs at ×" + (opts.quantity || 9999) + " (classic craft stacks).",
    });
  }

  /** All Affix Shard subtypes (~500). Packs into inventory (may extend below visible bag). */
  function grantAffixShards(data, opts) {
    opts = opts || {};
    return grantCraftStacks(data, [101], {
      quantity: opts.quantity,
      note:
        "Granted all Affix Shards at ×" +
        (opts.quantity || 9999) +
        " (~500 stacks; may sit below the visible inventory grid).",
    });
  }

  window.LEPresets = {
    MONOLITH_LEVEL,
    PRESET_VERSION,
    GEAR_SLOTS,
    DEFENSE_SLOTS: GEAR_SLOTS,
    CLASS_WEAPON_LOADOUTS,
    CLASS_REQ_FLAG,
    weaponSlotsForClass,
    applyMonolithStart,
    applySwiftDefenseGear,
    applyExaltedDefenseGear,
    createMaxedDefenseRing,
    grantForgeMaterials,
    grantAffixShards,
    bestSubtype,
  };
})();
