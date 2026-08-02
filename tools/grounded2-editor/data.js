(() => {
  "use strict";

  const SAVE_PATH = "%USERPROFILE%\\Saved Games\\Grounded2";

  const CONSOLE_HINTS = [
    {
      cmd: SAVE_PATH,
      desc: "Steam / PC world folders live here — each slot is a directory with HostPlayer.csav, World.csav, SaveGameHeaderData.savheader.",
    },
    {
      cmd: "Close Grounded 2 first",
      desc: "Overwrite while Augusta is running can corrupt the slot or get clobbered by autosave / Steam Cloud. Prefer a LOGOUT-SAVE or latest GameTime folder.",
    },
    {
      cmd: "Oodle rewrite",
      desc: "Edited .csav files are rewritten as Oodle copy-blocks (CC 06). Larger than Kraken, but the game loads them.",
    },
    {
      cmd: "Steam Cloud",
      desc: "Turn off cloud sync before testing installs, or Steam may restore the previous slot.",
    },
    {
      cmd: "Game Pass",
      desc: "Xbox/PC Game Pass keeps saves in WGS packages — export / copy to Steam Grounded2 format before using this editor.",
    },
    {
      cmd: "Backup",
      desc: "Download Backup ZIP before installing edits. Keep a copy of LOGOUT-SAVE / latest GameTime folder.",
    },
    {
      cmd: "vs Grounded 1",
      desc: "Same .csav wrapper, different component layout (short-name FString + HealthLOD). G1 catalogs / CT are not used here.",
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
      note: "HealthLODComponent float (+8) + SurvivalComponent hunger/thirst after short-name FString",
    },
    {
      id: "molars",
      title: "Milk molars / party points / Raw Science",
      status: "beta",
      note: "Personal points before PlayerUpgradeComponent; party points before StackSize.*; Raw Science before PartyComponent",
    },
    {
      id: "inventory",
      title: "Inventory add/remove",
      status: "beta",
      note: "Clone/remove HostPlayer InventoryComponent records; bump stacks in place (G2 short-name aware)",
    },
    {
      id: "multiplayer",
      title: "Multiplayer Player_*.csav",
      status: "beta",
      note: "Mirror mode copies HostPlayer → all Player_*.csav; Solo mode edits only the selected player file",
    },
    {
      id: "safety",
      title: "Safer writes",
      status: "beta",
      note: "Change summary + confirm before Save/Install; Oodle round-trip dry-run",
    },
    {
      id: "gear",
      title: "Weapons & armor (smithing)",
      status: "pending",
      note: "Needs Augusta item / smithing catalog — G1 backyard gear tables do not apply",
    },
    {
      id: "mutations",
      title: "Mutations / perks",
      status: "pending",
      note: "PerkComponent present; G2 perk id catalog not mapped yet",
    },
    {
      id: "tech",
      title: "Tech trees / recipes",
      status: "pending",
      note: "Snackbar / Augusta tech tables differ from BURG.L backyard trees",
    },
    {
      id: "chests",
      title: "Storage contents",
      status: "pending",
      note: "World chests exist; storage writer deferred until layout smoke-tested on G2",
    },
    {
      id: "cheattable",
      title: "Cheat Engine table",
      status: "n/a",
      note: "No Augusta .CT in this pass — use the save editor offline",
    },
  ];

  window.GroundedData = {
    SAVE_PATH,
    CONSOLE_HINTS,
    FEATURE_MATRIX,
  };
})();
