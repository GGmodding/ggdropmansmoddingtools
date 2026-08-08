(() => {
  "use strict";

  /**
   * Base class IDs from CharacterClassID (Il2CppLE / save characterClass).
   * Order verified against GameAssembly strings + local saves
   * (e.g. Sentinel = 2, Acolyte = 3).
   */
  const CLASSES = [
    { id: 0, name: "Mage", masteries: ["Sorcerer", "Spellblade", "Runemaster"] },
    { id: 1, name: "Primalist", masteries: ["Beastmaster", "Shaman", "Druid"] },
    { id: 2, name: "Sentinel", masteries: ["Void Knight", "Forge Guard", "Paladin"] },
    { id: 3, name: "Acolyte", masteries: ["Necromancer", "Lich", "Warlock"] },
    { id: 4, name: "Rogue", masteries: ["Bladedancer", "Marksman", "Falconer"] },
  ];

  /**
   * Known currency / material fingerprints matched against savedItems[].data.
   * Match is prefix-based so extra trailing bytes still count.
   */
  const CURRENCY_FINGERPRINTS = [
    { name: "Ascendancy Rune", data: [1, 102, 5] },
    { name: "Rune of Ascendance (alt)", data: [1, 102] },
  ];

  /** Short data arrays under this length are treated as possible stacks when qty is high. */
  const CURRENCY_HEURISTIC = {
    maxDataLength: 8,
    minQuantity: 2,
  };

  const LEVEL_CAP = 100;

  function classById(id) {
    return CLASSES.find((c) => c.id === Number(id)) || null;
  }

  function masteryName(classId, masteryId) {
    const cls = classById(classId);
    if (!cls) return `Mastery ${masteryId}`;
    // Save files use 1..3 for the three masteries; 0 / -1 = none.
    const idx = Number(masteryId) - 1;
    if (idx < 0 || idx >= cls.masteries.length) {
      if (Number(masteryId) === 0 || Number(masteryId) === -1) return "(none)";
      return `Mastery ${masteryId}`;
    }
    return cls.masteries[idx];
  }

  function dataMatchesPrefix(itemData, prefix) {
    if (!Array.isArray(itemData) || itemData.length < prefix.length) return false;
    return prefix.every((v, i) => Number(itemData[i]) === Number(v));
  }

  function identifyCurrency(item) {
    if (!item || !Array.isArray(item.data)) return null;
    for (const fp of CURRENCY_FINGERPRINTS) {
      if (dataMatchesPrefix(item.data, fp.data)) return fp.name;
    }
    return null;
  }

  function isLikelyCurrency(item) {
    if (!item || !Array.isArray(item.data)) return false;
    if (identifyCurrency(item)) return true;
    const qty = Number(item.quantity) || 0;
    return (
      item.data.length > 0 &&
      item.data.length <= CURRENCY_HEURISTIC.maxDataLength &&
      qty >= CURRENCY_HEURISTIC.minQuantity
    );
  }

  function formatDataPreview(data) {
    if (!Array.isArray(data)) return "";
    const slice = data.slice(0, 10);
    const more = data.length > 10 ? ",…" : "";
    return `[${slice.join(",")}${more}]`;
  }

  /** Inventory footprint [w,h] by base type (Last Epoch bag cells). */
  const ITEM_SIZES = {
    0: [2, 2], // Helmet
    1: [2, 3], // Body
    2: [2, 2], // Gloves
    3: [2, 2], // Boots
    4: [2, 1], // Belt
    5: [1, 3],
    6: [1, 3],
    7: [1, 3],
    8: [1, 3],
    9: [1, 3],
    10: [1, 3],
    11: [1, 3],
    12: [2, 4],
    13: [2, 4],
    14: [2, 4],
    15: [2, 4],
    16: [2, 4],
    17: [2, 4],
    18: [2, 3], // Quiver
    19: [2, 3], // Shield
    20: [1, 1], // Ring
    21: [1, 1], // Amulet
    22: [2, 2], // Relic
    23: [2, 4],
    25: [1, 1],
    26: [1, 1],
    27: [1, 1],
    28: [1, 1],
    29: [1, 2],
    30: [2, 2],
    31: [2, 2],
    32: [1, 3],
    33: [2, 3],
    34: [2, 4],
    35: [4, 4],
  };

  const INV_COLS = 12;
  const INV_ROWS = 12;
  const STASH_COLS = 12;
  const STASH_ROWS = 17;

  function itemSizeForBase(baseType) {
    return ITEM_SIZES[Number(baseType)] || [2, 2];
  }

  window.LEData = {
    CLASSES,
    CURRENCY_FINGERPRINTS,
    CURRENCY_HEURISTIC,
    LEVEL_CAP,
    ITEM_SIZES,
    INV_COLS,
    INV_ROWS,
    STASH_COLS,
    STASH_ROWS,
    classById,
    masteryName,
    identifyCurrency,
    isLikelyCurrency,
    formatDataPreview,
    itemSizeForBase,
  };
})();
