(() => {
  "use strict";

  /**
   * Classic offline save item packing (Ash06 / community formatVersion 2).
   * data[0]=1 (forging-potential era), then baseType, subType, quality/rarity,
   * 3 implicit rolls, FP, affixCount|uniqueId, then affix triples or unique rolls + LP.
   *
   * Affix IDs >= 256: low byte in the triple; sealed flag uses id+256 convention
   * (stored as sealed=true with id = storedId - 256 when storedId >= 256).
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
    // Season 4+ offline items often start with era flag 5+, then noise, then classic-ish fields.
    return Array.isArray(data) && data.length >= 8 && data[0] >= 2 && data[0] !== 255;
  }

  function isUniqueLikeRarity(r) {
    return r === RARITY.UNIQUE || r === RARITY.SET || r === RARITY.LEGENDARY || r === 4 || r === 5 || r === 6;
  }

  function unpackSeason(data) {
    if (!isSeasonLayout(data) || isClassicLayout(data)) return null;
    // Observed Season layout: [era, ?, ?, baseType, subType, quality, fp/uniqueHi, uniqueLo|affixCount, ...]
    // Prefer offsets that land on known base types when possible.
    let baseOff = 3;
    if (window.LEItems && window.LEItems.DB && window.LEItems.DB.bases) {
      const bases = window.LEItems.DB.bases;
      const candidates = [3, 1, 2, 4];
      for (const off of candidates) {
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
      // Also scan later bytes for a known unique id (season noise varies)
      if (uniqueId == null && window.LEItems && window.LEItems.DB && window.LEItems.DB.uniques) {
        for (let i = payloadStart; i < Math.min(data.length, payloadStart + 8); i++) {
          const v = data[i];
          if (v > 0 && window.LEItems.DB.uniques[v]) {
            uniqueId = v;
            break;
          }
          if (i + 1 < data.length) {
            const wide = data[i] * 256 + data[i + 1];
            if (wide > 0 && window.LEItems.DB.uniques[wide]) {
              uniqueId = wide;
              break;
            }
          }
        }
      }
      uniqueRolls = data.slice(payloadStart, Math.min(data.length, payloadStart + 8));
      if (data.length > payloadStart + 8) legendaryPotential = data[data.length - 1] || 0;
    } else {
      const count = Math.min(6, uniqueOrCount);
      let i = payloadStart;
      for (let n = 0; n < count && i + 2 < data.length; n++, i += 3) {
        let id = data[i + 1];
        let sealed = false;
        if (id >= 256) {
          sealed = true;
          id = id - 256;
        }
        affixes.push({
          tier: data[i],
          id,
          roll: data[i + 2],
          sealed,
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
      // Prefer treating [7]=FP when uniqueId would be nonsense & [8] alone matches
      if (uniqueId > 2000 && uniqueOrCount > 0) {
        // fallback: older style unique id only in [8], FP in [7]
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
        // sealed convention: id byte may be low byte of id+256; detect via high values on tier
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
      // Match Ash06 UniqueData: high byte at [7], low at [8]
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
        // Classic triples only store one byte for id — keep low byte; warn via id&255
        data.push(clampByte(a.tier != null ? a.tier : 6), clampByte(id & 255), clampByte(a.roll != null ? a.roll : 255));
      }
    }
    return data;
  }

  function unpackBestEffort(data) {
    if (!Array.isArray(data) || !data.length) return null;
    const classic = unpackClassic(data);
    if (classic) return classic;
    const season = unpackSeason(data);
    if (season) return season;

    // Unknown: expose header guesses + trailing triples as affixes
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
    const data = packClassic(opts);
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
    createSavedItem,
    clampByte,
  };
})();
