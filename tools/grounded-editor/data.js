(() => {
  "use strict";

  const SAVE_PATH = "%USERPROFILE%\\Saved Games\\Grounded";

  const CONSOLE_HINTS = [
    {
      cmd: SAVE_PATH,
      desc: "Steam world folders live here — each slot is a directory with HostPlayer.csav, World.csav, SaveGameHeaderData.savheader.",
    },
    {
      cmd: "Close Grounded first",
      desc: "Overwrite while the game is running can corrupt the slot or get clobbered by autosave/cloud sync.",
    },
    {
      cmd: "Oodle rewrite",
      desc: "Edited .csav files are rewritten as Oodle copy-blocks (CC 06). Larger than Kraken, but the game loads them.",
    },
    {
      cmd: "Game Pass",
      desc: "Xbox/PC Game Pass keeps saves in WGS packages — export to Steam format in-game before using this editor.",
    },
    {
      cmd: "Backup",
      desc: "Download Backup ZIP before installing edits. Keep a copy of LOGOUT-SAVE / latest GameTime folder.",
    },
  ];

  const FEATURE_MATRIX = [
    {
      id: "header",
      title: "Save header / world name",
      status: "live",
      note: "Parse SaveGameHeaderData.savheader; rename world in-place (same byte budget)",
    },
    {
      id: "vitals",
      title: "Host player vitals",
      status: "beta",
      note: "HealthComponent float + SurvivalComponent hunger/thirst floats on HostPlayer.csav",
    },
    {
      id: "molars",
      title: "Milk & golden molars",
      status: "beta",
      note: "Personal points before PlayerUpgradeComponent; golden points before StackSize upgrades; Raw Science before PartyComponent.",
    },
    {
      id: "gear",
      title: "Weapons & armor (smithing)",
      status: "beta",
      note: "Smithing level/path on HostPlayer gear. Paper-doll for equipped slots. One-shot = Mighty IX + amp; god armor = Bulky IX.",
    },
    {
      id: "inventory",
      title: "Inventory add/remove",
      status: "beta",
      note: "Clone/remove HostPlayer InventoryComponent records; bump stacks in place",
    },
    {
      id: "mutations",
      title: "Mutations / perks",
      status: "beta",
      note: "PerkComponent phases (−1 locked, 0–2); PlayerUpgrade Perks for equip slot count. Equipped loadout still set in-game.",
    },
    {
      id: "tech",
      title: "BURG.L / recipes / tech",
      status: "beta",
      note: "PartyComponent: analyzed items + knowledge (Recipe*/TechChip*). Starter analyze + TechChip unlock buttons.",
    },
    {
      id: "travel",
      title: "Position / teleport",
      status: "beta",
      note: "HostPlayer transform XYZ before scale(1,1,1); landmark presets are approximate",
    },
    {
      id: "calendar",
      title: "Time / calendar",
      status: "beta",
      note: "World CalendarComponent day float; dawn/noon/dusk adjust fractional day",
    },
    {
      id: "hauling",
      title: "Hauling / hot pouch",
      status: "beta",
      note: "Read-only list of HaulingComponent items (empty when not carrying)",
    },
    {
      id: "catalog",
      title: "Item catalog browser",
      status: "beta",
      note: "Filterable HostPlayer + World soft-path scan on the Items tab",
    },
    {
      id: "multiplayer",
      title: "Multiplayer Player_*.csav",
      status: "beta",
      note: "HostPlayer edits mirrored to all Player_*.csav in the slot on write",
    },
    {
      id: "safety",
      title: "Safer writes",
      status: "beta",
      note: "Change summary on Overview; confirm dialog lists dirty files before Save ZIP / Install",
    },
    {
      id: "science",
      title: "Raw Science",
      status: "beta",
      note: "u32 before PartyComponent in World.csav (Vitals & Molars tab)",
    },
    {
      id: "chests",
      title: "Storage contents",
      status: "beta",
      note: "Chests tab: list World InventoryComponents; add/remove/stack like HostPlayer bags",
    },
    {
      id: "world",
      title: "World / base state",
      status: "beta",
      note: "World.csav: molars/science + chest inventory edits; other actors still browse-only",
    },
  ];

  window.GroundedData = {
    SAVE_PATH,
    CONSOLE_HINTS,
    FEATURE_MATRIX,
  };
})();
