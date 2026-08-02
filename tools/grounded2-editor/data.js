(() => {
  "use strict";

  const SAVE_PATH = "%USERPROFILE%\\Saved Games\\Grounded2";

  const CONSOLE_HINTS = [
    {
      cmd: "Cheat Engine table",
      desc: "Download GGdropmanGrounded2V1.0.CT — live super speed / jump / fly / vitals / free build while Augusta runs.",
    },
    {
      cmd: SAVE_PATH,
      desc: "Steam / PC world folders live here — each slot is a directory with HostPlayer.csav, World.csav, SaveGameHeaderData.savheader.",
    },
    {
      cmd: "Close Grounded 2 first",
      desc: "Overwrite while Augusta is running can corrupt the slot or get clobbered by autosave / Steam Cloud. Use the .CT for in-session cheats instead.",
    },
    {
      cmd: "Oodle rewrite",
      desc: "Edited .csav files are rewritten as Oodle copy-blocks (CC 06).",
    },
    {
      cmd: "Steam Cloud",
      desc: "Turn off cloud sync before testing installs.",
    },
    {
      cmd: "Backup",
      desc: "Download Backup ZIP before installing edits.",
    },
  ];

  const FEATURE_MATRIX = [
    { id: "header", title: "Save header / world name", status: "live", note: "Rename world in-place" },
    { id: "vitals", title: "Host player vitals", status: "beta", note: "HealthLOD + Survival hunger/thirst" },
    { id: "molars", title: "Milk molars / party / Raw Science", status: "beta", note: "Host + World balances + stack upgrades" },
    { id: "gear", title: "Weapons & armor", status: "beta", note: "One-shot / God / Sleek / NG+ XV" },
    { id: "mutations", title: "Mutations / perks", status: "beta", note: "Unlock all III + per-row phase" },
    { id: "quests", title: "Quests", status: "beta", note: "Complete one/all Table_Quests_ALL" },
    { id: "tech", title: "Knowledge / analyze", status: "beta", note: "PartyComponent lists + starter analyze" },
    { id: "buildings", title: "Buildings", status: "beta", note: "Unlock all known building blueprints" },
    { id: "achievements", title: "Achievements", status: "beta", note: "Complete all AchievementsComponent flags" },
    { id: "calendar", title: "Calendar / time", status: "beta", note: "Day float + dawn/noon/dusk" },
    { id: "fog", title: "Fog of war", status: "beta", note: "Fill FogOfWarComponent blob with 0xFF" },
    { id: "survey", title: "Resource survey", status: "pending", note: "Component is a tiny header — no id list yet" },
    { id: "chests", title: "Chests / storage", status: "beta", note: "Edit when World has storage inventories" },
    { id: "omni", title: "Omni-tool tiers", status: "beta", note: "Max 4 OmniToolComponent levels" },
    { id: "pets", title: "Pet storage", status: "beta", note: "Read PetStorage items; no tame spawn yet" },
    { id: "buggy", title: "Buggy tier", status: "beta", note: "Max embedded *_Buggy character tier (Buffin Barrel style)" },
    { id: "hatch", title: "Hatchery finish", status: "beta", note: "Push AntHatch job progress to 100 / clear remain time" },
    { id: "eggs", title: "Taming eggs", status: "beta", note: "Give Taming_Egg* stacks for Hatchery" },
    { id: "resources", title: "Building resource dump", status: "beta", note: "Preset stacks of mats + upgrade stones" },
    { id: "hauling", title: "Hauling pouch", status: "beta", note: "Read-only HaulingComponent skim" },
    { id: "presets", title: "OP preset", status: "beta", note: "Unlocks + fog + omni + buggy + hatch + resources + eggs" },
    { id: "status", title: "Clear status ailments", status: "beta", note: "Best-effort zero venom/poison/corrosion/temp blobs" },
    { id: "compare", title: "Compare another slot", status: "beta", note: "Folder pick vs loaded Host/World stats" },
    { id: "inventory", title: "Inventory", status: "beta", note: "Add/remove/stack HostPlayer bags" },
    { id: "multiplayer", title: "Player_*.csav mirror", status: "beta", note: "Mirror or solo write modes" },
    { id: "travel", title: "Teleport / position", status: "pending", note: "No scale(1,1,1) transform on this HostPlayer — use .CT teleport-to-aim while playing" },
    { id: "cheattable", title: "Cheat Engine table", status: "beta", note: "GGdropmanGrounded2V1.0.CT — ACTIVATE (AOB) then speed / jump / fly / vitals / world toggles" },
  ];

  window.GroundedData = {
    SAVE_PATH,
    CONSOLE_HINTS,
    FEATURE_MATRIX,
  };
})();
