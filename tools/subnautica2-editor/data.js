(() => {
  "use strict";

  const CONSOLE_HINTS = [
    { cmd: "UE4SS / in-game mods", desc: "Most SN2 cheats are mod-based (UE4SS), not a built-in F3 console like SN1." },
    { cmd: "Backup before edits", desc: "Early Access patches can invalidate .sav files — keep .bak copies." },
    { cmd: "%LOCALAPPDATA%\\Subnautica2\\Saved\\SaveGames", desc: "Live save folder (Steam / Epic)." },
  ];

  window.Subnautica2Data = {
    CONSOLE_HINTS,
    SAVE_PATH: "%LOCALAPPDATA%\\Subnautica2\\Saved\\SaveGames",
  };
})();
