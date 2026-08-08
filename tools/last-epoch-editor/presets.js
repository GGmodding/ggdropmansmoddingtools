(() => {
  "use strict";

  /**
   * Offline presets — apply to a loaded character save (EPOCH JSON).
   * Gear uses Season rare packs; container IDs: 6=Belt, 7=Gloves.
   */

  const PRESET_VERSION = 8;
  const MONOLITH_LEVEL = 62;

  /** Armor / jewelry slots only (weapons untouched).
   * LE container IDs: 6=Belt, 7=Gloves (not swapped).
   */
  const GEAR_SLOTS = [
    { containerID: 2, label: "Helmet", baseType: 0 },
    { containerID: 3, label: "Body Armor", baseType: 1 },
    { containerID: 7, label: "Gloves", baseType: 2 },
    { containerID: 8, label: "Boots", baseType: 3 },
    { containerID: 6, label: "Belt", baseType: 4 },
    { containerID: 9, label: "Amulet", baseType: 21 },
    { containerID: 10, label: "Ring 1", baseType: 20 },
    { containerID: 11, label: "Ring 2", baseType: 20 },
    { containerID: 12, label: "Relic", baseType: 22 },
  ];

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

  function affixTierForLevel(level) {
    // In-game T1..T7 = stored tier 0..6. Roll 255 only maxes the chosen tier.
    const lv = Math.max(1, Number(level) || 1);
    if (lv >= 60) return 6;
    if (lv >= 50) return 5;
    if (lv >= 40) return 4;
    if (lv >= 30) return 3;
    if (lv >= 20) return 2;
    if (lv >= 10) return 1;
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

  function bestSubtype(baseType, level, allowedSubs) {
    const lv = Math.max(1, Math.min(100, Number(level) || 1));
    const bases = window.LEItems && window.LEItems.DB && window.LEItems.DB.bases;
    const b = bases && bases[baseType];
    if (!b || !b.subs) return 0;
    const allow = allowedSubs && allowedSubs.length ? new Set(allowedSubs.map(Number)) : null;
    let best = { sid: 0, lvl: -1 };
    for (const [sid, s] of Object.entries(b.subs)) {
      const id = Number(sid);
      if (allow && !allow.has(id)) continue;
      const req = Number(s && s.lvl) || 0;
      if (req > lv) continue;
      if (req > best.lvl || (req === best.lvl && id > best.sid)) {
        best = { sid: id, lvl: req };
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
      const subType = bestSubtype(22, lv, ladder);
      if (subType == null) return null;
      return { baseType: 22, subType, source: "relic-ladder" };
    }

    // Always use the slot's base type + best usable subtype for this level.
    // Do not reuse an equipped subtype (can be under-level junk or over-level illegal).
    const subType = bestSubtype(slot.baseType, lv, null);
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

  function buildGearItem(slot, affixIds, level, identity) {
    const codec = window.LEItemCodec;
    if (!codec) throw new Error("Item codec unavailable.");
    const baseType = slot.baseType;
    // Relics: keep class ladder subtype from identity. Everything else: best for level.
    let subType;
    if (baseType === 22 && identity && identity.subType != null) {
      subType = identity.subType;
    } else {
      subType = bestSubtype(baseType, level, null);
    }
    if (subType == null) throw new Error("No usable subtype for " + (slot.label || baseType));
    const filtered = filterAffixesForLevel(affixIds, baseType, level);
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

  function equipGearSet(data, pools, level) {
    const items = window.LESave.ensureSavedItems(data);
    const target = new Set(GEAR_SLOTS.map((s) => s.containerID));
    let moved = 0;
    let equipped = 0;
    let skipped = 0;
    const reqLevels = [];

    // Snapshot relic ladders BEFORE moving equipped gear
    const identities = new Map();
    for (const slot of GEAR_SLOTS) {
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

    for (const slot of GEAR_SLOTS) {
      const identity = identities.get(slot.containerID);
      if (slot.baseType === 22 && !identity) {
        skipped += 1;
        continue;
      }
      try {
        const pool = pools[slot.containerID] || [25, 13, 17, 24];
        const item = buildGearItem(slot, pool, level, identity || null);
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
   * Level 62 · campaign done · Monolith of Fate entry · defensive rares.
   * Keeps weapons / off-hand and all passive/skill allocations.
   * Gear path matches Swift + armor (level-correct bases, class-safe relics, max rolls).
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
    const gear = equipGearSet(data, SWIFT_DEFENSE_AFFIX_POOLS, MONOLITH_LEVEL);
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
      ": Lv62 monolith start + max-rolled defense gear (class-safe relics, level-correct bases). Trees untouched.";

    return summary;
  }

  /**
   * Replace armor/jewelry with level-scaled Season rares (Mercurial boots + defenses).
   * Does not change level, quests, waypoints, monolith, trees, or weapons.
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
    const gear = equipGearSet(data, SWIFT_DEFENSE_AFFIX_POOLS, level);
    const minReq = (gear.reqLevels || []).reduce(
      (m, r) => Math.min(m, Number(r.req) || 0),
      999
    );
    return {
      level,
      gearMoved: gear.moved,
      gearEquipped: gear.equipped,
      skipped: gear.skipped || 0,
      reqLevels: gear.reqLevels || [],
      masteryRestored,
      chosenMastery: Number(data.chosenMastery) || 0,
      version: PRESET_VERSION,
      note:
        "v" +
        PRESET_VERSION +
        ": max-rolled Season rares (tier-scaled), highest wearable bases for your level (class-safe relics). Quests untouched." +
        (minReq < 999 ? " Lowest base req among pieces: " + minReq + "." : ""),
    };
  }

  window.LEPresets = {
    MONOLITH_LEVEL,
    PRESET_VERSION,
    GEAR_SLOTS,
    DEFENSE_SLOTS: GEAR_SLOTS,
    applyMonolithStart,
    applySwiftDefenseGear,
    bestSubtype,
  };
})();
