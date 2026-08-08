(() => {
  "use strict";

  /**
   * Offline presets — apply to a loaded character save (EPOCH JSON).
   * Gear uses classic rare packs (safe to write); Season loot is left alone except replaced slots.
   */

  const MONOLITH_LEVEL = 62;

  /** Armor / jewelry slots only (weapons untouched). */
  const GEAR_SLOTS = [
    { containerID: 2, label: "Helmet", baseType: 0 },
    { containerID: 3, label: "Body Armor", baseType: 1 },
    { containerID: 6, label: "Gloves", baseType: 2 },
    { containerID: 8, label: "Boots", baseType: 3 },
    { containerID: 7, label: "Belt", baseType: 4 },
    { containerID: 9, label: "Amulet", baseType: 21 },
    { containerID: 10, label: "Ring 1", baseType: 20 },
    { containerID: 11, label: "Ring 2", baseType: 20 },
    { containerID: 12, label: "Relic", baseType: 22 },
  ];

  /** Preferred affix lists per slot (IDs must be < 256). Boots lead with Mercurial MS. */
  const DEFENSE_AFFIX_POOLS = {
    2: [25, 1, 80, 13], // Life, Defense, Insulation, Fire
    3: [25, 52, 1, 80], // Life, Ox, Defense, Insulation
    6: [25, 45, 80, 24], // Life, Phys res, Insulation, Lightning
    8: [25, 8, 80, 1], // Life, Dodge, Insulation, Defense
    7: [25, 31, 80, 17], // Life, Armor, Insulation, Cold
    9: [25, 80, 45, 22], // Life, Insulation, Phys, Regen
    10: [25, 80, 13, 7], // Life, Insulation, Fire, Void
    11: [25, 80, 17, 24], // Life, Insulation, Cold, Lightning
    12: [25, 80, 45, 10], // Life, Insulation, Phys, Necrotic
  };

  /** Movement + defense: boots get Mercurial; other slots armor/life/res. */
  const SWIFT_DEFENSE_AFFIX_POOLS = {
    2: [25, 1, 31, 80], // Life, Defense, Turtle, Insulation
    3: [25, 52, 1, 80], // Life, Ox, Defense, Insulation
    6: [25, 45, 80, 8], // Life, Phys res, Insulation, Dodge
    8: [28, 1, 25, 80], // Mercurial MS, Defense, Life, Insulation
    7: [25, 31, 80, 45], // Life, Turtle, Insulation, Phys
    9: [25, 80, 45, 13], // Life, Insulation, Phys, Fire
    10: [25, 80, 17, 24], // Life, Insulation, Cold, Lightning
    11: [25, 80, 13, 7], // Life, Insulation, Fire, Void
    12: [25, 80, 45, 31], // Life, Insulation, Phys, Turtle (if allowed) / filtered
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

  function affixRows(ids, _level) {
    // Season rares in live saves use tier 0 + max rolls (255), not classic T7.
    return (ids || []).slice(0, 4).map((id) => ({
      id: Number(id),
      tier: 0,
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
    if (best.lvl < 0 && allow && allow.size) {
      // Owned subtype above level — still prefer something from the character
      return [...allow][0];
    }
    return best.sid;
  }

  function unpackItem(it) {
    if (!it || !window.LEItemCodec) return null;
    return window.LEItemCodec.unpackBestEffort(it.data);
  }

  /**
   * Prefer base/subtype already on this save.
   * Relics are class-locked — only reuse the currently equipped relic, never invent/randomize.
   */
  function resolveSlotIdentity(data, slot, level) {
    const items = window.LESave.ensureSavedItems(data);
    const ownedSubs = [];

    for (const it of items) {
      const p = unpackItem(it);
      if (!p || p.baseType == null) continue;
      const bt = Number(p.baseType);
      const st = Number(p.subType) || 0;
      const cid = Number(it.containerID);

      // Equipped in this slot wins (must already be legal for the character)
      if (cid === slot.containerID) {
        return { baseType: bt, subType: st, source: "equipped" };
      }

      // Relics: ignore other inventory/loot — those may be other classes
      if (slot.baseType === 22) continue;

      if (bt === slot.baseType) ownedSubs.push(st);
    }

    if (slot.baseType === 22) return null;

    if (ownedSubs.length) {
      const subType = bestSubtype(slot.baseType, level, ownedSubs);
      return { baseType: slot.baseType, subType, source: "owned" };
    }

    return {
      baseType: slot.baseType,
      subType: bestSubtype(slot.baseType, level, null),
      source: "level",
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
    const baseType = identity && identity.baseType != null ? identity.baseType : slot.baseType;
    const subType =
      identity && identity.subType != null
        ? identity.subType
        : bestSubtype(baseType, level, null);
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

    // Snapshot identities BEFORE moving equipped gear (keeps class-correct relics/armor)
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
      if (!identity) {
        skipped += 1;
        continue;
      }
      const pool = pools[slot.containerID] || [25, 13, 17, 24];
      items.push(buildGearItem(slot, pool, level, identity));
      equipped += 1;
    }
    return {
      moved,
      equipped,
      skipped,
      level: Number(level) || 1,
      classId: Number(data.characterClass),
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
   * Keeps weapons / off-hand. Clears passive allocations so level unspent applies in-game.
   */
  function applyMonolithStart(data) {
    if (!data || typeof data !== "object") throw new Error("No character data.");
    const LESave = window.LESave;
    const LEProgress = window.LEProgress;
    if (!LESave) throw new Error("Save helpers unavailable.");
    if (!LEProgress) throw new Error("Progress database unavailable.");
    if (!window.LEItemCodec) throw new Error("Item codec unavailable.");

    const summary = {
      level: MONOLITH_LEVEL,
      quests: 0,
      waypoints: 0,
      flags: 0,
      gearMoved: 0,
      gearEquipped: 0,
      passivesCleared: 0,
    };

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

    resetMonolithStart(data);

    const gear = equipDefenseSet(data, MONOLITH_LEVEL);
    summary.gearMoved = gear.moved;
    summary.gearEquipped = gear.equipped;

    const tree = LESave.ensurePassiveTree(data);
    summary.passivesCleared = LESave.spentTreePoints(tree);
    LESave.dumpTreePointsToUnspent(tree, { gameRecalc: true });

    if (typeof data.gold !== "number" || data.gold < 50000) {
      data.gold = 100000;
      summary.gold = 100000;
    }

    if (typeof data.respecs !== "number" || data.respecs < 20) {
      data.respecs = 50;
    }

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

    const level = Math.max(1, Math.min(100, Number(data.level) || 1));
    const gear = equipGearSet(data, SWIFT_DEFENSE_AFFIX_POOLS, level);
    return {
      level,
      gearMoved: gear.moved,
      gearEquipped: gear.equipped,
      skipped: gear.skipped || 0,
      note:
        "Season-packed max-rolled rares using your character's existing item bases/subtypes (class-safe relics). Quests untouched.",
    };
  }

  window.LEPresets = {
    MONOLITH_LEVEL,
    GEAR_SLOTS,
    DEFENSE_SLOTS: GEAR_SLOTS,
    applyMonolithStart,
    applySwiftDefenseGear,
    bestSubtype,
  };
})();
