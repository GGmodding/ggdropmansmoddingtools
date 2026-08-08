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

  function uniqueDbEntry(id) {
    if (id == null || !window.LEItems || !window.LEItems.DB || !window.LEItems.DB.uniques) return null;
    return window.LEItems.DB.uniques[id] || window.LEItems.DB.uniques[String(id)] || null;
  }

  function uniqueMatchesBase(uniqueId, baseType) {
    const u = uniqueDbEntry(uniqueId);
    return !!(u && Number(u.base) === Number(baseType));
  }

  /**
   * Season unique / set / legendary — verified on live offline items:
   * [5,n1,n2,base,sub,q(7-9),0,m1,m2,m3,uidHi,uidLo, roll×8, …optional woven affixes…, lp?]
   */
  function unpackSeasonUnique(data) {
    if (!isSeasonLayout(data) || data.length < 20) return null;
    const quality = data[5];
    if (quality < 7 || quality > 9) return null;

    const baseType = data[3];
    const subType = data[4];
    const uid = ((data[10] & 255) << 8) | (data[11] & 255);
    const uidOk = uniqueMatchesBase(uid, baseType) || !!uniqueDbEntry(uid);
    if (!uidOk && quality < 9) return null;

    const uniqueId = uid;
    const uniqueRolls = data.slice(12, 20);
    const affixes = [];
    let legendaryPotential = 0;
    let form = quality >= 9 ? "season-legendary" : "season-unique";

    if (data.length === 21) {
      legendaryPotential = data[20] || 0;
    } else if (data.length > 21) {
      const maybeCount = data[20];
      if (maybeCount > 0 && maybeCount <= 8) {
        let i = 21;
        const parsed = [];
        for (let n = 0; n < maybeCount && i + 2 < data.length; n++, i += 3) {
          let tier = data[i];
          let sealed = false;
          if (tier >= 16) {
            sealed = true;
            tier = tier & 0x0f;
          }
          if (tier > 7 || data[i + 1] <= 0) {
            parsed.length = 0;
            break;
          }
          parsed.push({ tier, id: data[i + 1], roll: data[i + 2], sealed });
        }
        if (parsed.length) {
          affixes.push(...parsed);
          form = "season-legendary";
        }
      }
      legendaryPotential = data[data.length - 1] || 0;
    }

    return {
      layout: "season-unique",
      seasonUniqueForm: form,
      versionFlag: data[0],
      baseType,
      subType,
      quality,
      implicits: [data[7] || 0, data[8] || 0, data[9] || 0],
      forgingPotential: 0,
      uniqueId,
      affixes,
      uniqueRolls,
      legendaryPotential,
      weaversWill: 0,
      baseOffset: 3,
      noise1: data[1],
      noise2: data[2],
      mid1: data[7],
      mid2: data[8],
      mid3: data[9],
    };
  }

  function unpackSeason(data) {
    if (!isSeasonLayout(data) || isClassicLayout(data)) return null;

    // Rare / magic / exalted (quality 0–3)
    // Layout: [5,n1,n2,base,sub,q,flag,fp,impl0,impl1,impl2,affixCount,(tier,id,roll)*]
    if (data.length >= 12 && data[5] <= 3) {
      const baseType = data[3];
      const subType = data[4];
      const quality = data[5];
      const forgingPotential = data[7] || 0;
      const implicits = [data[8] || 0, data[9] || 0, data[10] || 0];
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
        implicits,
        forgingPotential,
        uniqueId: null,
        affixes,
        uniqueRolls: [],
        legendaryPotential: 0,
        weaversWill: 0,
        baseOffset: 3,
        noise1: data[1],
        noise2: data[2],
        seasonFlag: data[6] || 0,
        mid1: data[8],
        mid2: data[9],
        mid3: data[10],
      };
    }

    const asUnique = unpackSeasonUnique(data);
    if (asUnique) return asUnique;

    // Fallback speculative season parse (unknown high quality)
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
    return {
      layout: "season",
      versionFlag,
      baseType,
      subType,
      quality,
      implicits: [],
      forgingPotential: data[baseOff + 3] || 0,
      uniqueId: null,
      affixes: [],
      uniqueRolls: [],
      legendaryPotential: 0,
      weaversWill: 0,
      baseOffset: baseOff,
      speculative: true,
    };
  }

  /**
   * Pack a Season unique/set (q7/8) or legendary (q9).
   */
  function packSeasonUnique(item) {
    const baseType = clampByte(item.baseType);
    const subType = clampByte(item.subType);
    let quality = clampByte(item.quality != null ? item.quality : RARITY.UNIQUE);
    const uniqueId = Number(item.uniqueId);
    if (!Number.isFinite(uniqueId) || uniqueId < 0) {
      throw new Error("Season unique pack requires uniqueId.");
    }
    const u = uniqueDbEntry(uniqueId);
    const isSet = item.isSet || quality === RARITY.SET || !!(u && u.set);
    const affixes = (item.affixes || []).slice(0, 8);
    const wantLegendary =
      quality === RARITY.LEGENDARY || quality === 9 || affixes.length > 0;

    const r1 = item.noise1 != null ? clampByte(item.noise1) : Math.floor(Math.random() * 256);
    const r2 = item.noise2 != null ? clampByte(item.noise2) : Math.floor(Math.random() * 256);
    const m1 = item.mid1 != null ? clampByte(item.mid1) : Math.floor(Math.random() * 256);
    const m2 = item.mid2 != null ? clampByte(item.mid2) : Math.floor(Math.random() * 256);
    const m3 = item.mid3 != null ? clampByte(item.mid3) : Math.floor(Math.random() * 256);
    const rolls = [];
    for (let i = 0; i < 8; i++) {
      const src = item.uniqueRolls && item.uniqueRolls[i];
      rolls.push(clampByte(src != null ? src : 255));
    }
    const lp = clampByte(item.legendaryPotential != null ? item.legendaryPotential : 0);
    const uidHi = Math.floor(uniqueId / 256) & 255;
    const uidLo = uniqueId % 256;

    if (!wantLegendary) {
      quality = isSet ? RARITY.SET : RARITY.UNIQUE;
      return [5, r1, r2, baseType, subType, quality, 0, m1, m2, m3, uidHi, uidLo, ...rolls, lp];
    }

    quality = RARITY.LEGENDARY;
    const data = [5, r1, r2, baseType, subType, quality, 0, 255, 255, 255, uidHi, uidLo, ...rolls];
    data.push(affixes.length);
    for (const a of affixes) {
      let tier = clampByte(a.tier != null ? a.tier : 0);
      if (tier > 7) tier = 0;
      if (a.sealed) tier = (tier & 0x0f) | 0x10;
      data.push(tier, clampByte((Number(a.id) || 0) & 255), clampByte(a.roll != null ? a.roll : 255));
    }
    data.push(lp);
    return data;
  }

  const SEASON_UNIQUE_MAX_LP = 4;

  /**
   * Max unique rolls (and LP optional) in-place on a Season unique without rebuilding.
   * Returns { changed, isUnique } — isUnique true means do not fall through to affix maxing.
   */
  function maxSeasonUniqueRolls(data, opts) {
    opts = opts || {};
    const packed = unpackSeasonUnique(data);
    if (!packed) return { changed: 0, isUnique: false };
    let n = 0;
    const rollStart = 12;
    for (let i = 0; i < 8; i++) {
      const idx = rollStart + i;
      if (idx < data.length && data[idx] !== 255) {
        data[idx] = 255;
        n += 1;
      }
    }
    if (opts.maxLp) {
      const lpTarget = clampByte(opts.lpValue != null ? opts.lpValue : SEASON_UNIQUE_MAX_LP);
      const lpIdx =
        data.length === 21 || packed.seasonUniqueForm === "season-unique"
          ? 20
          : data.length - 1;
      if (lpIdx > 0 && lpIdx < data.length && data[lpIdx] !== lpTarget) {
        data[lpIdx] = lpTarget;
        n += 1;
      }
    }
    return { changed: n, isUnique: true };
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
   * [5,n1,n2,base,sub,q,flag,fp,impl0,impl1,impl2,count,(tier,id,roll)*]
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
    const flag = item.seasonFlag != null ? clampByte(item.seasonFlag) : 0;
    const implSrc =
      item.implicits && item.implicits.length
        ? item.implicits
        : [item.mid1, item.mid2, item.mid3];
    const implicits = [];
    for (let i = 0; i < 3; i++) {
      const v = implSrc[i];
      implicits.push(clampByte(v != null ? v : 255));
    }
    const affixes = (item.affixes || []).slice(0, 6);
    const data = [
      5,
      r1,
      r2,
      baseType,
      subType,
      quality,
      flag,
      fp,
      implicits[0],
      implicits[1],
      implicits[2],
      affixes.length,
    ];
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

  /**
   * Max Season rare affix rolls and/or implicit rolls in-place.
   * Returns { changed, isSeasonRare }.
   */
  function maxSeasonRareRolls(data, opts) {
    opts = opts || {};
    if (!isSeasonLayout(data) || data.length < 12 || data[5] > 3) {
      return { changed: 0, isSeasonRare: false };
    }
    let n = 0;
    if (opts.maxImplicits !== false) {
      for (let i = 8; i <= 10; i++) {
        if (data[i] !== 255) {
          data[i] = 255;
          n += 1;
        }
      }
    }
    if (opts.maxAffixes !== false) {
      const count = Math.min(6, data[11] || 0);
      for (let a = 0; a < count; a++) {
        const idx = 12 + a * 3 + 2;
        if (idx < data.length && data[idx] !== 255) {
          data[idx] = 255;
          n += 1;
        }
      }
    }
    return { changed: n, isSeasonRare: true };
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
    let data;
    if (uniqueId != null && Number.isFinite(uniqueId)) {
      // Prefer Season unique pack so S4 characters can load the item
      data = packSeasonUnique(opts);
    } else {
      data = packSeasonRare(opts);
    }
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
    unpackSeasonUnique,
    unpackBestEffort,
    packClassic,
    packSeasonRare,
    maxSeasonRareRolls,
    packSeasonUnique,
    maxSeasonUniqueRolls,
    createSavedItem,
    clampByte,
    uniqueDbEntry,
    uniqueMatchesBase,
  };
})();
