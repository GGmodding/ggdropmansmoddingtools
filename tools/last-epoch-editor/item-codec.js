(() => {
  "use strict";

  /**
   * Offline save item packing for Last Epoch.
   *
   * Season 4+ rares (data[0]=5):
   *   [5, rng, rng, base, sub, quality0-3, 0, fp, m1, m2, m3, count, (tier,id,roll)*count, 0]
   *
   * Classic (data[0]=0/1) — legacy only. Writing classic rares unloads Season characters.
   */

  const RARITY = {
    NORMAL: 0,
    MAGIC: 1,
    RARE: 2,
    EXALTED: 3,
    UNIQUE: 7,
    SET: 8,
    LEGENDARY: 9,
  };

  function clampByte(n) {
    n = Number(n) || 0;
    if (n < 0) return 0;
    if (n > 255) return 255;
    return Math.floor(n);
  }

  function isClassicLayout(data) {
    return Array.isArray(data) && data.length >= 9 && (data[0] === 0 || data[0] === 1);
  }

  function isSeasonLayout(data) {
    return Array.isArray(data) && data.length >= 8 && data[0] >= 2 && data[0] !== 255;
  }

  function isUniqueLikeRarity(r) {
    return r === RARITY.UNIQUE || r === RARITY.SET || r === RARITY.LEGENDARY || r === 4 || r === 5 || r === 6;
  }

  function unpackSeason(data) {
    if (!isSeasonLayout(data) || isClassicLayout(data)) return null;

    // Rare / magic / exalted (quality 0–3)
    if (data.length >= 12 && data[5] <= 3) {
      const baseType = data[3];
      const subType = data[4];
      const quality = data[5];
      const forgingPotential = data[7] || 0;
      const count = Math.min(6, data[11] || 0);
      const affixes = [];
      let i = 12;
      for (let n = 0; n < count && i + 2 < data.length; n++, i += 3) {
        let tier = data[i];
        let sealed = false;
        if (tier >= 16) {
          sealed = true;
          tier = tier & 0x0f;
        }
        affixes.push({
          tier,
          id: data[i + 1],
          roll: data[i + 2],
          sealed,
        });
      }
      return {
        layout: "season",
        versionFlag: data[0],
        baseType,
        subType,
        quality,
        implicits: [],
        forgingPotential,
        uniqueId: null,
        affixes,
        uniqueRolls: [],
        legendaryPotential: 0,
        weaversWill: 0,
        baseOffset: 3,
      };
    }

    // Unique / legendary / set — speculative
    let baseOff = 3;
    if (window.LEItems && window.LEItems.DB && window.LEItems.DB.bases) {
      const bases = window.LEItems.DB.bases;
      for (const off of [3, 1, 2, 4]) {
        if (data.length > off + 2 && bases[String(data[off])]) {
          baseOff = off;
          break;
        }
      }
    }
    const versionFlag = data[0];
    const baseType = data[baseOff];
    const subType = data[baseOff + 1];
    const quality = data[baseOff + 2];
    const fpOrUniqueHi = data[baseOff + 3] || 0;
    const uniqueOrCount = data[baseOff + 4] || 0;
    const uniqueLike = isUniqueLikeRarity(quality);
    let uniqueId = null;
    let forgingPotential = fpOrUniqueHi;
    let affixes = [];
    let uniqueRolls = [];
    let legendaryPotential = 0;
    const payloadStart = baseOff + 5;

    if (uniqueLike) {
      let cand = null;
      if (fpOrUniqueHi === 0) {
        if (uniqueOrCount > 0 && uniqueOrCount < 255) cand = uniqueOrCount;
      } else {
        cand = fpOrUniqueHi * 256 + uniqueOrCount;
      }
      if (
        cand != null &&
        window.LEItems &&
        window.LEItems.DB &&
        window.LEItems.DB.uniques &&
        window.LEItems.DB.uniques[cand]
      ) {
        uniqueId = cand;
      }
      uniqueRolls = data.slice(payloadStart, Math.min(data.length, payloadStart + 8));
      if (data.length > payloadStart + 8) legendaryPotential = data[data.length - 1] || 0;
    } else {
      const count = Math.min(6, uniqueOrCount);
      let i = payloadStart;
      for (let n = 0; n < count && i + 2 < data.length; n++, i += 3) {
        affixes.push({
          tier: data[i],
          id: data[i + 1],
          roll: data[i + 2],
          sealed: false,
          speculative: true,
        });
      }
    }

    return {
      layout: "season",
      versionFlag,
      baseType,
      subType,
      quality,
      implicits: [],
      forgingPotential,
      uniqueId,
      affixes,
      uniqueRolls,
      legendaryPotential,
      weaversWill: 0,
      baseOffset: baseOff,
    };
  }

  function unpackClassic(data) {
    if (!isClassicLayout(data)) return null;
    const versionFlag = data[0];
    const baseType = data[1];
    const subType = data[2];
    const quality = data[3];
    const implicits = [data[4] || 0, data[5] || 0, data[6] || 0];
    const fpOrUniqueHi = data[7] || 0;
    const uniqueOrCount = data[8] || 0;

    const uniqueLike = isUniqueLikeRarity(quality) || quality === 7 || quality === 8;
    let uniqueId = null;
    let forgingPotential = fpOrUniqueHi;
    let affixes = [];
    let uniqueRolls = [];
    let legendaryPotential = 0;
    let weaversWill = 0;

    if (uniqueLike) {
      uniqueId = fpOrUniqueHi * 256 + uniqueOrCount;
      if (uniqueId > 2000 && uniqueOrCount > 0) {
        uniqueId = uniqueOrCount;
        forgingPotential = fpOrUniqueHi;
      } else if (fpOrUniqueHi === 0) {
        uniqueId = uniqueOrCount;
        forgingPotential = 0;
      }
      const rollEnd = Math.min(data.length - 1, 17);
      uniqueRolls = data.slice(9, rollEnd);
      if (data.length > 17) legendaryPotential = data[17] || 0;
      else if (data.length > 9) legendaryPotential = data[data.length - 1] || 0;
    } else {
      forgingPotential = fpOrUniqueHi;
      const count = Math.min(6, uniqueOrCount);
      let i = 9;
      for (let n = 0; n < count && i + 2 < data.length; n++, i += 3) {
        let id = data[i + 1];
        let sealed = false;
        if (id > 255) {
          sealed = true;
          id = id - 256;
        }
        affixes.push({
          tier: data[i],
          id,
          roll: data[i + 2],
          sealed,
        });
      }
      if (i < data.length) weaversWill = data[data.length - 1] || 0;
    }

    return {
      layout: "classic",
      versionFlag,
      baseType,
      subType,
      quality,
      implicits,
      forgingPotential,
      uniqueId,
      affixes,
      uniqueRolls,
      legendaryPotential,
      weaversWill,
    };
  }

  /**
   * Season 4+ rare/magic/exalted pack. Verified against live offline gear that loads.
   */
  function packSeasonRare(item) {
    const baseType = clampByte(item.baseType);
    const subType = clampByte(item.subType);
    let quality = clampByte(
      item.quality != null ? item.quality : item.rarity != null ? item.rarity : 2
    );
    if (quality > 3) quality = 3;
    const fp = clampByte(item.forgingPotential != null ? item.forgingPotential : 40);
    const r1 = item.noise1 != null ? clampByte(item.noise1) : Math.floor(Math.random() * 256);
    const r2 = item.noise2 != null ? clampByte(item.noise2) : Math.floor(Math.random() * 256);
    const m1 = item.mid1 != null ? clampByte(item.mid1) : Math.floor(Math.random() * 256);
    const m2 = item.mid2 != null ? clampByte(item.mid2) : Math.floor(Math.random() * 256);
    const m3 = item.mid3 != null ? clampByte(item.mid3) : 16 + Math.floor(Math.random() * 16);
    const affixes = (item.affixes || []).slice(0, 6);
    const data = [5, r1, r2, baseType, subType, quality, 0, fp, m1, m2, m3, affixes.length];
    for (const a of affixes) {
      // In-game Season rares use low tiers (often 0) + high rolls — not classic T7.
      let tier = clampByte(a.tier != null ? a.tier : 0);
      if (tier > 7) tier = 0;
      if (a.sealed) tier = (tier & 0x0f) | 0x10;
      const id = Number(a.id) || 0;
      data.push(tier, clampByte(id & 255), clampByte(a.roll != null ? a.roll : 255));
    }
    data.push(0);
    return data;
  }

  function packClassic(item) {
    const baseType = clampByte(item.baseType);
    const subType = clampByte(item.subType);
    let quality = clampByte(item.quality != null ? item.quality : item.rarity);
    const implicits = (item.implicits || [255, 255, 255]).map(clampByte);
    while (implicits.length < 3) implicits.push(255);
    const fp = clampByte(item.forgingPotential != null ? item.forgingPotential : 255);
    const data = [1, baseType, subType, quality, implicits[0], implicits[1], implicits[2]];

    const uniqueId = item.uniqueId != null && item.uniqueId !== "" ? Number(item.uniqueId) : null;
    if (uniqueId != null && Number.isFinite(uniqueId)) {
      if (quality < 7) quality = item.isSet ? RARITY.SET : RARITY.UNIQUE;
      data[3] = quality;
      const hi = Math.floor(uniqueId / 256);
      const lo = uniqueId % 256;
      data.push(hi, lo);
      const rolls = item.uniqueRolls || [];
      for (let i = 0; i < 8; i++) data.push(clampByte(rolls[i] != null ? rolls[i] : 255));
      data.push(clampByte(item.legendaryPotential || 0));
    } else {
      data.push(fp);
      const affixes = (item.affixes || []).slice(0, 6);
      data.push(affixes.length);
      for (const a of affixes) {
        let id = Number(a.id) || 0;
        if (a.sealed) id = id + 256;
        data.push(
          clampByte(a.tier != null ? a.tier : 6),
          clampByte(id & 255),
          clampByte(a.roll != null ? a.roll : 255)
        );
      }
    }
    return data;
  }

  function unpackBestEffort(data) {
    if (!Array.isArray(data) || !data.length) return null;
    const season = unpackSeason(data);
    if (season) return season;
    const classic = unpackClassic(data);
    if (classic) return classic;

    const rarity = data[0];
    const baseType = data[1];
    const subType = data[2];
    let uniqueId = null;
    if (data.length >= 4 && isUniqueLikeRarity(rarity)) {
      const u = data[2] | (data[3] << 8);
      if (window.LEItems && window.LEItems.DB.uniques[u]) uniqueId = u;
    }
    const affixes = [];
    if (data.length >= 12) {
      for (let i = Math.max(9, data.length - 12); i + 2 < data.length; i += 3) {
        const tier = data[i];
        const id = data[i + 1];
        const roll = data[i + 2];
        if (tier <= 7 && id > 0) affixes.push({ tier, id, roll, sealed: false, speculative: true });
      }
    }
    return {
      layout: "unknown",
      versionFlag: rarity,
      baseType,
      subType,
      quality: rarity,
      implicits: data.slice(4, 7),
      forgingPotential: data[7] || 0,
      uniqueId,
      affixes,
      uniqueRolls: [],
      legendaryPotential: data[data.length - 1] || 0,
      weaversWill: 0,
    };
  }

  function createSavedItem(opts) {
    const uniqueId = opts.uniqueId != null && opts.uniqueId !== "" ? Number(opts.uniqueId) : null;
    const data =
      uniqueId != null && Number.isFinite(uniqueId) ? packClassic(opts) : packSeasonRare(opts);
    return {
      itemData: null,
      data,
      inventoryPosition: {
        x: Number(opts.x) || 0,
        y: Number(opts.y) || 0,
      },
      quantity: Math.max(1, Number(opts.quantity) || 1),
      containerID: Number(opts.containerID != null ? opts.containerID : 1),
      formatVersion: 2,
    };
  }

  window.LEItemCodec = {
    RARITY,
    isClassicLayout,
    isSeasonLayout,
    unpackClassic,
    unpackSeason,
    unpackBestEffort,
    packClassic,
    packSeasonRare,
    createSavedItem,
    clampByte,
  };
})();
