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
      id: "inventory",
      title: "Item path scan",
      status: "beta",
      note: "Lists BP_/item soft paths from HostPlayer + World — stack edits not safe yet",
    },
    {
      id: "science",
      title: "Raw Science / Milk Molars",
      status: "soon",
      note: "Values are buried in World.csav / player upgrade blobs — needs more mapping",
    },
    {
      id: "chests",
      title: "Storage contents",
      status: "soon",
      note: "Named chests are editable in hex with care; structured editor TBD",
    },
    {
      id: "world",
      title: "World / base state",
      status: "soon",
      note: "World.csav is large (~MB uncompressed); browse-only item scan for now",
    },
  ];

  window.GroundedData = {
    SAVE_PATH,
    CONSOLE_HINTS,
    FEATURE_MATRIX,
  };
})();
