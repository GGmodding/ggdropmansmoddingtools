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

  const INSERTABLE_RESOURCES = RESOURCE_FIELDS.map((f) => f.key);

  const COLLECTIBLE_KEYS = [
    "MusicRecord_1",
    "MusicRecord_2",
    "MusicRecord_3",
    "MusicRecord_4",
    "MusicRecord_5",
    "Quest_ApprenticesJournal",
  ];

  const TINT_LEVEL_BASES = [
    { base: "Consumable_Health_Level", label: "Healing Tint Shard Level" },
    { base: "Consumable_Energy_Level", label: "Energy Tint Shard Level" },
    { base: "Consumable_Revive_Level", label: "Revive Tint Shard Level" },
  ];

  const ATTR_LABELS = {
    0: "Vitality",
    1: "Might",
    2: "Agility",
    3: "Defense",
    4: "Luck",
    5: "Speed",
  };

  const EXPLORATION_LABELS = {
    0: "Capacity 0",
    1: "Capacity 1",
    2: "Capacity 2",
    3: "Capacity 3",
    4: "Paint Break / Climb",
    5: "Capacity 5",
  };

  const WORLD_MAP_LABELS = {
    0: "Base",
    1: "Harden Lands",
    2: "Swim",
    3: "Swim Boost",
    4: "Fly (Esquie)",
    5: "Invalid",
  };

  const KNOWN_MAPS = [
    "Level_SpringMeadows_Main_V2",
    "Level_Lumiere_Main",
    "Level_FlyingWaters_Main",
    "Level_AncientSanctuary_Main",
    "Level_StoneWaveCliffs_Main",
    "Level_ForgottenBattlefield_Main",
    "Level_OldLumiere_Main",
    "Level_Monolith_Main",
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
    { id: "resources", title: "Resources + insert missing keys", status: "live", note: "Edit or insert Recoat / catalysts / tints" },
    { id: "tints", title: "Tint shard levels", status: "live", note: "Rewrite Consumable_*_Level0–2 keys" },
    { id: "characters", title: "Character level / AP / lumina / exclude", status: "live", note: "Per character save-state" },
    { id: "attributes", title: "Assigned attributes", status: "live", note: "ECharacterAttribute map ints" },
    { id: "skills", title: "Skills list", status: "live", note: "Unlocked / equipped Name arrays (view)" },
    { id: "weapons", title: "Weapon levels", status: "live", note: "WeaponProgressions CurrentLevel 1–33" },
    { id: "pictos", title: "Pictos", status: "live", note: "Edit learnt/steps when present in save" },
    { id: "exploration", title: "Exploration capacities", status: "live", note: "Lists unlocked exploration / world-map flags" },
    { id: "spawn", title: "Map / spawn tag", status: "live", note: "In-place rewrite when length fits" },
    { id: "collectibles", title: "Journals / music (inventory insert)", status: "live", note: "Insert known MusicRecord / Quest keys" },
    { id: "steam-ach", title: "Steam achievements", status: "live", note: "Local Node CLI — Steam Achievements tab" },
  ];

  const NOTES = [
    { tip: "Save path", detail: SAVE_PATH + " — files named EXPEDITION_0.sav …" },
    { tip: "Backup first", detail: "Copy the SteamID folder or use Download Backup before overwriting." },
    { tip: "Close the game", detail: "Expedition 33 must be fully closed or Steam Cloud may clobber edits." },
    { tip: "Insert keys", detail: "Resources can insert missing items. Always backup — test inserts on a copy first." },
    { tip: "Map / spawn length", detail: "MapToLoad and spawn tags only rewrite in-place when the new string fits the old byte budget." },
  ];

  window.E33Data = {
    SAVE_PATH,
    RESOURCE_FIELDS,
    INSERTABLE_RESOURCES,
    COLLECTIBLE_KEYS,
    TINT_LEVEL_BASES,
    ATTR_LABELS,
    EXPLORATION_LABELS,
    WORLD_MAP_LABELS,
    KNOWN_MAPS,
    CHAR_ALIASES,
    FEATURE_MATRIX,
    NOTES,
    displayChar(name) {
      return CHAR_ALIASES[name] || name;
    },
    attrLabel(index) {
      return ATTR_LABELS[index] || "Attribute " + index;
    },
  };
})();
