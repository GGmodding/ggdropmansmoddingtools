(() => {
  "use strict";

  const SAVE_PATH = "%USERPROFILE%\\Saved Games\\Grounded";

  const CONSOLE_HINTS = [
    {
      cmd: SAVE_PATH,
      desc: "Steam world folders live here — each slot is a directory with HostPlayer.csav, World.csav, SaveGameHeaderData.savheader.",
    },
    {
      cmd: "Cheat table",
      desc: "Download GGdropmanGroundedV1.0.CT — live super speed / super jump / vitals / free build while the game runs (Cheat Engine).",
    },
    {
      cmd: "Close Grounded first",
      desc: "Overwrite while the game is running can corrupt the slot or get clobbered by autosave/cloud sync. Use the .CT for in-session cheats instead.",
    },
    {
      cmd: "Oodle rewrite",
      desc: "Edited .csav files are rewritten as Oodle copy-blocks (CC 06). Larger than Kraken, but the game loads them.",
    },
    {
      cmd: "Game Pass",
      desc: "Xbox/PC Game Pass keeps saves in WGS packages — export to Steam format in-game before using this editor. For .CT attach Maine-WinGDK-Shipping and re-Fetch bases.",
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
      note: "Mighty/Bulky/Sleek smithing; One-shot + God/Sleek armor; NG+ XV buttons for high New Game+ tiers.",
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
      note: "PerkComponent phases (−1 locked, 0–2); slot upgrades. Equipped mutation loadout is set in-game (not a stable save field).",
    },
    {
      id: "tech",
      title: "BURG.L / recipes / tech",
      status: "beta",
      note: "PartyComponent: analyzed items + knowledge (Recipe*/TechChip*). Starter analyze + TechChip unlock buttons.",
    },
    {
      id: "progress",
      title: "Purchases / buildings / achievements",
      status: "beta",
      note: "BURG.L purchase list, building blueprint unlocks, bestiary/boss keys/SCABs knowledge bulk, AchievementsComponent flags.",
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
      note: "Mirror mode copies HostPlayer → all Player_*.csav; Solo mode edits only the selected player file.",
    },
    {
      id: "presets",
      title: "OP preset / loadout export",
      status: "beta",
      note: "One-click OP (+ NG+ XV) and JSON loadout export of vitals/gear/mutations.",
    },
    {
      id: "compare",
      title: "Compare another slot",
      status: "beta",
      note: "Diff gear/mutations/purchases/buildings/knowledge/molars against a second folder.",
    },
    {
      id: "safety",
      title: "Safer writes",
      status: "beta",
      note: "Change summary + confirm before Save/Install; Oodle round-trip dry-run; browser cannot detect Grounded process (Task Manager / PowerShell tip).",
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
      note: "Chests tab with filter + duplicate-into-all; add/remove/stack like HostPlayer bags",
    },
    {
      id: "unsupported",
      title: "Coziness / pets / equipped mutation loadout",
      status: "n/a",
      note: "No clean save fields found. Super speed / super jump are in GGdropmanGroundedV1.0.CT (runtime).",
    },
    {
      id: "cheattable",
      title: "Cheat Engine table",
      status: "live",
      note: "GGdropmanGroundedV1.0.CT — ACTIVATE then Super Speed / Super Jump / No-clip fly / vitals / science / world toggles.",
    },
    {
      id: "world",
      title: "World / base state",
      status: "beta",
      note: "World.csav: molars/science + chests + progress unlocks; other actors still browse-only",
    },
  ];

  window.GroundedData = {
    SAVE_PATH,
    CONSOLE_HINTS,
    FEATURE_MATRIX,
  };
})();
