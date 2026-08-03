(() => {
  "use strict";

  const SAVE_PATH = "%LOCALAPPDATA%\\Sandfall\\Saved\\SaveGames\\<SteamID>";

  const RESOURCE_FIELDS = [
    { key: "Consumable_Respec", label: "Recoat", max: 9999 },
    { key: "Consumable_LuminaPoint", label: "Lumina points (bag)", max: 9999 },
    { key: "HealingTint_Shard", label: "Healing Tint", max: 99 },
    { key: "EnergyTint_Shard", label: "Energy Tint", max: 99 },
    { key: "ReviveTint_Shard", label: "Revive Tint", max: 99 },
    { key: "PartyHealShard", label: "Party Heal", max: 99 },
    { key: "UpgradeMaterial_Level1", label: "Chroma Catalyst", max: 9999 },
    { key: "UpgradeMaterial_Level2", label: "Polished Chroma Catalyst", max: 9999 },
    { key: "UpgradeMaterial_Level3", label: "Resplendent Chroma Catalyst", max: 9999 },
    { key: "UpgradeMaterial_Level4", label: "Grandiose Chroma Catalyst", max: 9999 },
    { key: "UpgradeMaterial_Level5", label: "Perfect Chroma Catalyst", max: 9999 },
  ];

  const CHAR_ALIASES = {
    Frey: "Gustave",
    Gustave: "Gustave",
    Lune: "Lune",
    Maelle: "Maelle",
    Sciel: "Sciel",
    Monoco: "Monoco",
    Verso: "Verso",
    Sophie: "Sophie",
    Alicia: "Alicia",
  };

  const FEATURE_MATRIX = [
    { id: "gold", title: "Chroma (Gold)", status: "live", note: "Root Gold IntProperty" },
    { id: "resources", title: "Resources / tints / catalysts", status: "live", note: "Edits counts for items already in InventoryItems map" },
    { id: "characters", title: "Character level / AP / lumina", status: "live", note: "Per character save-state ints" },
    { id: "inventory", title: "Full inventory list", status: "live", note: "Browse Name→Int map; add-new requires in-game pickup first" },
    { id: "pictos", title: "Pictos unlock / master", status: "soon", note: "PassiveEffectsProgressions array — needs insert/clone" },
    { id: "weapons", title: "Weapon levels", status: "soon", note: "WeaponProgressions array" },
    { id: "exploration", title: "Esquie / paint break", status: "soon", note: "ExplorationProgression byte flags" },
  ];

  const NOTES = [
    { tip: "Save path", detail: SAVE_PATH + " — files named EXPEDITION_0.sav …" },
    { tip: "Backup first", detail: "Copy the SteamID folder or use Download Backup before overwriting." },
    { tip: "Close the game", detail: "Expedition 33 must be fully closed or Steam Cloud may clobber edits." },
    { tip: "Missing items", detail: "Inventory keys only edit if the item already exists in the save map." },
    { tip: "SavesContainer.sav", detail: "Leave the container file alone unless you know you need it for slot metadata." },
  ];

  window.E33Data = {
    SAVE_PATH,
    RESOURCE_FIELDS,
    CHAR_ALIASES,
    FEATURE_MATRIX,
    NOTES,
    displayChar(name) {
      return CHAR_ALIASES[name] || name;
    },
  };
})();
