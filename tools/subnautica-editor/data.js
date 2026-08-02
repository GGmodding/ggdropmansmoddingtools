(() => {
  "use strict";

  const GAME_MODES = [
    { id: 0, name: "Survival", blurb: "Food, water, oxygen. Classic 4546B." },
    { id: 1, name: "Freedom", blurb: "No hunger or thirst. Still need oxygen." },
    { id: 2, name: "Hardcore", blurb: "One life. Save deletes on death." },
    { id: 3, name: "Creative", blurb: "Free build, no survival meters." },
  ];

  const REQUIRED_FILES = [
    { name: "gameinfo.json", role: "Menu metadata · mode · time · build" },
    { name: "global-objects.bin", role: "Player, bases, vehicles, inventories" },
    { name: "scene-objects.bin", role: "Story / world scene entities" },
    { name: "screenshot.jpg", role: "Load-menu thumbnail" },
  ];

  const OPTIONAL_HINTS = [
    { pattern: /^CellsCache\//i, note: "World cell cache (large; keep with the slot)" },
    { pattern: /^batch-/i, note: "Batch object cache" },
    { pattern: /^timecapsules\//i, note: "Time capsule data" },
  ];

  /** In-game console commands (F3 → unlock console, then Enter). Companion reference — not written into saves. */
  const CONSOLE_CHEATS = [
    { cmd: "item titanium 20", desc: "Spawn titanium ×20 (swap TechType + count)" },
    { cmd: "item copper 10", desc: "Spawn copper" },
    { cmd: "item quartz 10", desc: "Spawn quartz" },
    { cmd: "item silver 10", desc: "Spawn silver" },
    { cmd: "item gold 10", desc: "Spawn gold" },
    { cmd: "item diamond 5", desc: "Spawn diamond" },
    { cmd: "item lithium 10", desc: "Spawn lithium" },
    { cmd: "item lead 10", desc: "Spawn lead" },
    { cmd: "item scrapmetal 10", desc: "Spawn metal salvage" },
    { cmd: "item titaniumingot 5", desc: "Spawn titanium ingot" },
    { cmd: "item glass 5", desc: "Spawn glass" },
    { cmd: "item lubricant 5", desc: "Spawn lubricant" },
    { cmd: "item batterycell 2", desc: "Spawn battery" },
    { cmd: "item powercell 2", desc: "Spawn power cell" },
    { cmd: "item filteredwater 5", desc: "Spawn filtered water" },
    { cmd: "item cookedpeeper 5", desc: "Spawn cooked peeper" },
    { cmd: "oxygen", desc: "Refill oxygen" },
    { cmd: "health", desc: "Full health" },
    { cmd: "food", desc: "Full food" },
    { cmd: "water", desc: "Full water" },
    { cmd: "nocost", desc: "Toggle free crafting" },
    { cmd: "fastbuild", desc: "Instant habitat build" },
    { cmd: "fasthatch", desc: "Instant egg hatch" },
    { cmd: "fastgrow", desc: "Instant plant grow" },
    { cmd: "unlock all", desc: "Unlock all blueprints" },
    { cmd: "spawn seamoth", desc: "Spawn Seamoth at feet" },
    { cmd: "spawn cyclops", desc: "Spawn Cyclops (careful — big)" },
    { cmd: "spawn exosuit", desc: "Spawn Prawn Suit" },
    { cmd: "warp forward 100", desc: "Teleport forward 100m" },
    { cmd: "goto aurora", desc: "Warp near Aurora" },
    { cmd: "goto lostriver", desc: "Warp to Lost River" },
    { cmd: "goto lavazone", desc: "Warp to Inactive Lava Zone" },
    { cmd: "day", desc: "Set daytime" },
    { cmd: "night", desc: "Set nighttime" },
    { cmd: "speed 2", desc: "Game speed ×2 (1 = normal)" },
    { cmd: "ghost", desc: "No-clip / freecam-ish movement" },
    { cmd: "freedom", desc: "Switch mode Freedom (session)" },
    { cmd: "creative", desc: "Switch mode Creative (session)" },
    { cmd: "survival", desc: "Switch mode Survival (session)" },
    { cmd: "hardcore", desc: "Switch mode Hardcore (session)" },
  ];

  const PRESETS = [
    {
      id: "creative",
      title: "Creative mode",
      body: "Sets gameMode to Creative (3). Bases & inventory stay in the .bin files.",
      apply: (info) => { info.gameMode = 3; },
    },
    {
      id: "survival",
      title: "Survival mode",
      body: "Sets gameMode to Survival (0). Good after a Creative build session.",
      apply: (info) => { info.gameMode = 0; },
    },
    {
      id: "freedom",
      title: "Freedom mode",
      body: "No food/water pressure. gameMode = 1.",
      apply: (info) => { info.gameMode = 1; },
    },
    {
      id: "reset-clock",
      title: "Reset story clock",
      body: "Sets gameTime to 0 so PDA day counters line up for NG+ style runs.",
      apply: (info) => { info.gameTime = 0; },
    },
    {
      id: "flags-on",
      title: "Mark vehicles & base",
      body: "Turns on cyclops / seamoth / base present flags (menu icons).",
      apply: (info) => {
        info.cyclopsPresent = true;
        info.seamothPresent = true;
        info.basePresent = true;
      },
    },
  ];

  /** classId kits for inventory.js addKit — ids from prefabs.db / classids-db. */
  const INVENTORY_KITS = [
    {
      id: "starter",
      title: "Starter kit",
      body: "Knife, scanner, flashlight, beacon, builder, welder, seaglide, basic mats & food.",
      entries: [
        { id: "9de31592-85f0-4551-aea9-628ea063c7e2", count: 1 }, // Knife
        { id: "76a94e03-741a-4622-a049-4a06782dfe6a", count: 1 }, // Scanner
        { id: "12c95e66-fb54-47b3-87f1-8e318394b839", count: 1 }, // Flashlight
        { id: "7b019de0-db51-4017-8812-2531b808228d", count: 2 }, // Beacon
        { id: "c6f3c2fd-5b80-4aaf-81c3-f056651b868c", count: 1 }, // Builder
        { id: "9ef36033-b60c-4f8b-8c3a-b15035de3116", count: 1 }, // Welder
        { id: "422b14d3-69c6-43c9-8ceb-84d29f5c3a8b", count: 1 }, // Seaglide
        { id: "d4bfebc0-a5e6-47d3-b4a7-d5e47f614ed6", count: 2 }, // Battery
        { id: "c66b5dfa-7fe9-4688-b165-d2e2f4caa8d9", count: 10 }, // Titanium
        { id: "63e251a6-fb65-454b-84b0-4493e19f73cd", count: 5 }, // Copper
        { id: "8ef17c52-2aa8-46b6-ada3-c3e3c4a78dd6", count: 5 }, // Quartz
        { id: "22b0ce08-61c9-4442-a83d-ba7fb99f26b0", count: 4 }, // FilteredWater
        { id: "a9da9324-84ed-4a51-9ed3-a0969f455067", count: 4 }, // CookedPeeper
      ],
    },
    {
      id: "madloot",
      title: "Madloot (resources)",
      body: "Big stack of mid/late resources, wires, chips, glass, and power cells.",
      entries: [
        { id: "c66b5dfa-7fe9-4688-b165-d2e2f4caa8d9", count: 20 }, // Titanium
        { id: "41919ae1-1471-4841-a524-705feb9c2d20", count: 5 }, // TitaniumIngot
        { id: "63e251a6-fb65-454b-84b0-4493e19f73cd", count: 15 }, // Copper
        { id: "bcb52360-f014-4ca1-9cf2-9e32504c645f", count: 8 }, // CopperWire
        { id: "8ef17c52-2aa8-46b6-ada3-c3e3c4a78dd6", count: 15 }, // Quartz
        { id: "439b4b17-2f86-4706-8abd-8d2f68df782b", count: 10 }, // Silver
        { id: "3c5bd4db-953d-4d23-92be-f5a3b76b2e25", count: 10 }, // Gold
        { id: "b334fbb1-224b-4082-bb69-d4a39051aaca", count: 10 }, // Lead
        { id: "f65beedb-2d76-466b-abc8-37c474228157", count: 10 }, // Lithium
        { id: "ee7ef0cf-21ab-4c0c-871d-e477c5dfa1ce", count: 8 }, // Diamond
        { id: "5462a145-fdc1-464d-ad61-ec81920ec7e3", count: 8 }, // Magnetite
        { id: "7815b1b7-2830-418b-9b5d-19949b0ae9ec", count: 6 }, // Nickel
        { id: "6e7f3d62-7e76-4415-af64-5dcd88fc3fe4", count: 4 }, // Kyanite
        { id: "87293f19-cca3-46e6-bb3a-1f35e6368010", count: 6 }, // AluminumOxide / Ruby
        { id: "3b52098a-4b58-467c-a29a-1d1b6d92ec3e", count: 6 }, // Uraninite
        { id: "7965512f-39fe-4770-9060-98bf149bca2e", count: 10 }, // Glass
        { id: "86589e2f-bd06-447f-b23a-1f35e6368010", count: 5 }, // EnameledGlass
        { id: "4ae90608-40da-45ce-8480-e2f0133f96b2", count: 4 }, // PlasteelIngot
        { id: "316705da-ccc6-4ba4-832d-29d49f8db3cf", count: 4 }, // Aerogel
        { id: "96b1b863-2ff7-451b-aa38-8b3a06e72d63", count: 6 }, // Lubricant
        { id: "4021307d-b4d1-4a7d-bf3a-078ff2202aee", count: 6 }, // FiberMesh
        { id: "0b1fe733-31c5-44db-b6da-4d84b981b9d9", count: 6 }, // Silicone
        { id: "471852d4-03b6-4c47-9d4e-2ae893d63ff7", count: 4 }, // WiringKit
        { id: "7f63fa1b-2103-47d6-98ee-44dff7c52566", count: 3 }, // AdvancedWiringKit
        { id: "1eca71a0-6736-481f-be9d-bd5f6fc036a8", count: 4 }, // ComputerChip
        { id: "d4bfebc0-a5e6-47d3-b4a7-d5e47f614ed6", count: 4 }, // Battery
        { id: "f9f01e62-2983-4ebd-a67e-a904033b4a97", count: 4 }, // PowerCell
        { id: "f7fb4077-b4d7-443c-b367-349cc1d39cc8", count: 6 }, // DisinfectedWater
        { id: "30373750-1292-4034-9797-387cf576d150", count: 4 }, // NutrientBlock
      ],
    },
    {
      id: "tools",
      title: "Tool belt",
      body: "Laser cutter, propulsion cannon, stasis rifle, fire extinguisher, extra batteries.",
      entries: [
        { id: "d4aa649b-7508-44e4-89fb-29334f12a64e", count: 1 }, // LaserCutter
        { id: "d51f9ea1-c51c-4140-ab19-1744e342a2fe", count: 1 }, // PropulsionCannon
        { id: "160e99a7-cb46-409d-98e2-360a76ff92da", count: 1 }, // StasisRifle
        { id: "be2baa90-52b3-46d6-992d-5a2614f36af5", count: 1 }, // FireExtinguisher
        { id: "d4bfebc0-a5e6-47d3-b4a7-d5e47f614ed6", count: 4 }, // Battery
        { id: "f9f01e62-2983-4ebd-a67e-a904033b4a97", count: 2 }, // PowerCell
      ],
    },
  ];

  window.SubnauticaData = {
    GAME_MODES,
    REQUIRED_FILES,
    OPTIONAL_HINTS,
    CONSOLE_CHEATS,
    PRESETS,
    INVENTORY_KITS,
  };
})();