(() => {
  "use strict";

  const SAVE_PATH = "%LOCALAPPDATA%\\MortalShell2\\Saved\\SaveGames";

  const WALLET_LIFETIME = {
    gold: "CumulativeGold",
    gloom: "CumulativeGloom",
    glimpses: "CumulativeGlimpses",
  };

  const CURATED_FIELDS = [
    { id: "gold", label: "Gold (HUD coins)", dropId: /ID_Gold/, keys: [], types: ["IntProperty"] },
    { id: "gloom", label: "Gloom (HUD souls)", dropId: /ID_Gloom/, keys: [], types: ["IntProperty"] },
    { id: "glimpses", label: "Glimpses", dropId: /ID_Glimpses/, keys: [], types: ["IntProperty"] },
    { id: "ventrium", label: "Ventrium", dropId: /ID_TFM_01_Ventrium|ID_Ventrium/, keys: [], types: ["IntProperty"] },
    { id: "laterite", label: "Laterite", dropId: /ID_TFM_02_Laterite|ID_Laterite/, keys: [], types: ["IntProperty"] },
    { id: "dorsalite", label: "Dorsalite", dropId: /Dorsalite/, keys: [], types: ["IntProperty"] },
    { id: "thoracium", label: "Thoracium", dropId: /Thoracium/, keys: [], types: ["IntProperty"] },
    { id: "ovums", label: "Ovums", dropId: /Ovum/, keys: [], types: ["IntProperty"] },
    { id: "cumGold", label: "Lifetime Gold", keys: ["CumulativeGold"], types: ["IntProperty"] },
    { id: "cumGloom", label: "Lifetime Gloom", keys: ["CumulativeGloom"], types: ["IntProperty"] },
    { id: "cumGlimpses", label: "Lifetime Glimpses", keys: ["CumulativeGlimpses"], types: ["IntProperty"] },
    { id: "lostGloom", label: "Lost Gloom (death pile)", keys: ["LostGloomAmount"], types: ["IntProperty"] },
    { id: "deaths", label: "Total Deaths", keys: ["TotalDeaths"], types: ["IntProperty"] },
    { id: "playtime", label: "Playtime (sec)", keys: ["TotalPlayTimeSeconds"], types: ["FloatProperty"] },
  ];

  const NOTES = [
    { tip: "Save path", detail: "%LOCALAPPDATA%\\MortalShell2\\Saved\\SaveGames — WorldState_0.sav is the live slot while the game is running." },
    { tip: "Wallet = DropItems", detail: "HUD coins are ID_Gold and souls are ID_Gloom inside DropItems. Save/Install now writes those fields automatically. Lifetime Cumulative* values are raised to match so the game does not clamp you back." },
    { tip: "Edits did not stick", detail: "Quit Mortal Shell 2 completely, load WorldState_0.sav, change Gold/Gloom, then Install over that same file. A running session or Steam Cloud will overwrite a live slot." },
    { tip: "Health is runtime", detail: "Current / max health and resolve live on the active shell in RAM. They are not written into WorldState_0.sav, so this editor cannot persist HP." },
    { tip: "Close the game", detail: "Quit Mortal Shell 2 fully before overwriting a .sav. The running process will clobber live writes." },
    { tip: "Steam Cloud", detail: "Disable cloud while testing installs if sync fights your edited slot." },
    { tip: "Always backup", detail: "Use Download Backup first. v1 only overwrites existing ints/bools/same-length strings — it cannot insert new DropItems keys." },
  ];

  window.MortalShell2Data = {
    SAVE_PATH,
    CURATED_FIELDS,
    WALLET_LIFETIME,
    NOTES,
  };
})();
