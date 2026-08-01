(() => {
  "use strict";

  const CHAR_NAMES = [
    "Cloud", "Barret", "Tifa", "Aeris", "Red XIII",
    "Yuffie", "Cait Sith", "Vincent", "Cid",
  ];

  const MATERIA_NAMES = {
    0x00: "MP Plus", 0x01: "HP Plus", 0x02: "Speed Plus", 0x03: "Magic Plus",
    0x04: "Luck Plus", 0x05: "EXP Plus", 0x06: "Gil Plus", 0x07: "Enemy Away",
    0x08: "Enemy Lure", 0x09: "Chocobo Lure", 0x0A: "Pre-emptive", 0x0B: "Long Range",
    0x0C: "Mega All", 0x0D: "Counter Attack", 0x0E: "Slash-All", 0x0F: "Double Cut",
    0x10: "Cover", 0x11: "Underwater", 0x12: "HP <-> MP", 0x13: "W-Magic",
    0x14: "W-Summon", 0x15: "W-Item", 0x17: "All", 0x18: "Counter",
    0x19: "Magic Counter", 0x1A: "MP Turbo", 0x1B: "MP Absorb", 0x1C: "HP Absorb",
    0x1D: "Elemental", 0x1E: "Added Effect", 0x1F: "Sneak Attack", 0x20: "Final Attack",
    0x21: "Added Cut", 0x22: "Steal As Well", 0x23: "Quadra Magic", 0x24: "Steal",
    0x25: "Sense", 0x27: "Throw", 0x28: "Morph", 0x29: "Deathblow",
    0x2A: "Manipulate", 0x2B: "Mime", 0x2C: "Enemy Skill", 0x30: "Master Command",
    0x31: "Fire", 0x32: "Ice", 0x33: "Earth", 0x34: "Lightning",
    0x35: "Restore", 0x36: "Heal", 0x37: "Revive", 0x38: "Seal",
    0x39: "Mystify", 0x3A: "Transform", 0x3B: "Exit", 0x3C: "Poison",
    0x3D: "Demi", 0x3E: "Barrier", 0x40: "Comet", 0x41: "Time",
    0x44: "Destruct", 0x45: "Contain", 0x46: "FullCure", 0x47: "Shield",
    0x48: "Ultima", 0x49: "Master Magic", 0x4A: "Choco/Mog", 0x4B: "Shiva",
    0x4C: "Ifrit", 0x4D: "Ramuh", 0x4E: "Titan", 0x4F: "Odin",
    0x50: "Leviathan", 0x51: "Bahamut", 0x52: "Kujata", 0x53: "Alexander",
    0x54: "Phoenix", 0x55: "Neo Bahamut", 0x56: "Hades", 0x57: "Typhoon",
    0x58: "Bahamut ZERO", 0x59: "Knights of Round", 0x5A: "Master Summon",
  };

  const ITEM_NAMES = [
    "Potion", "Hi-Potion", "X-Potion", "Ether", "Turbo Ether", "Elixir", "Megalixir", "Phoenix Down",
    "Antidote", "Soft", "Maiden's Kiss", "Cornucopia", "Echo Screen", "Hyper", "Tranquilizer", "Remedy",
    "Smoke Bomb", "Speed Drink", "Hero Drink", "Vaccine", "Grenade", "Shrapnel", "Right Arm", "Hourglass",
    "Kiss of Death", "Spider Web", "Dream Powder", "Mute Mask", "War Gong", "Loco weed", "Fire Fang", "Fire Veil",
    "Antarctic Wind", "Ice Crystal", "Bolt Plume", "Swift Bolt", "Earth Drum", "Earth Mallet", "Deadly Waste", "M-Tentacles",
    "Stardust", "Vampire Fang", "Ghost Hand", "Vagyrisk Claw", "Light Curtain", "Lunar Curtain", "Mirror", "Holy Torch",
    "Bird Wing", "Dragon Scales", "Impaler", "Shrivel", "Eye drop", "Molotov", "S-Mine", "8-inch Cannon",
    "Graviball", "T/S Bomb", "Ink", "Dazers", "Dragon Fang", "Cauldron", "Sylkis Greens", "Reagan Greens",
    "Mimett Greens", "Curiel Greens", "Pahsana Greens", "Tantal Greens", "Krakka Greens", "Gysahl Greens", "Tent", "Power Source",
    "Guard Source", "Magic Source", "Mind Source", "Speed Source", "Luck Source", "Zeio Nut", "Carob Nut", "Porov Nut",
    "Pram Nut", "Lasan Nut", "Sahara Nut", "Luchile Nut", "Pepio Nut", "Battery", "Tissue", "Omnislash",
    "Catastrophe", "Final Heaven", "Great Gospel", "Cosmo Memory", "All Creation", "Chaos", "Highwind", "1/35 Soldier",
    "Super Sweeper", "Masamune Blade", "Save Crystal", "Combat Diary", "Autograph", "Gambler", "Desert Rose", "Earth Harp",
    "Guide Book",
  ];
  while (ITEM_NAMES.length < 128) ITEM_NAMES.push(`Unused Item ${ITEM_NAMES.length}`);

  ITEM_NAMES.push(
    "Buster Sword", "Mythril Saber", "Hardedge", "Butterfly Edge", "Enhance Sword", "Organics", "Crystal Sword", "Force Stealer",
    "Rune Blade", "Murasame", "Nail Bat", "Yoshiyuki", "Apocalypse", "Heaven's Cloud", "Ragnarok", "Ultima Weapon",
    "Leather Glove", "Metal Knuckle", "Mythril Claw", "Grand Glove", "Tiger Fang", "Diamond Knuckle", "Dragon Claw", "Crystal Glove",
    "Motor Drive", "Platinum Fist", "Kaiser Knuckle", "Work Glove", "Powersoul", "Master Fist", "God's Hand", "Premium Heart",
    "Gatling Gun", "Assault Gun", "Cannon Ball", "Atomic Scissors", "Heavy Vulcan", "Chainsaw", "Microlaser", "A·M Cannon",
    "W Machine Gun", "Drill Arm", "Solid Bazooka", "Rocket Punch", "Enemy Launcher", "Pile Banger", "Max Ray", "Missing Score",
    "Mythril Clip", "Diamond Pin", "Silver Barrette", "Gold Barrette", "Adaman Clip", "Crystal Comb", "Magic Comb", "Plus Barrette",
    "Centclip", "Hairpin", "Seraph Comb", "Behemoth Horn", "Spring Gun Clip", "Limited Moon",
    "Guard Stick", "Mythril Rod", "Full Metal Staff", "Striking Staff", "Prism Staff", "Aurora Rod", "Wizard Staff", "Wizer Staff",
    "Fairy Tale", "Umbrella", "Princess Guard",
    "Spear", "Slash Lance", "Trident", "Mast Ax", "Partisan", "Viper Halberd", "Javelin", "Grow Lance",
    "Mop", "Dragoon Lance", "Scimitar", "Flayer", "Spirit Lance", "Venus Gospel",
    "4-point Shuriken", "Boomerang", "Pinwheel", "Razor Ring", "Hawkeye", "Crystal Cross", "Wind Slash", "Twin Viper",
    "Spiral Shuriken", "Superball", "Magic Shuriken", "Rising Sun", "Oritsuru", "Conformer",
    "Yellow M-phone", "Green M-phone", "Blue M-phone", "Red M-phone", "Crystal M-phone", "White M-phone", "Black M-phone", "Silver M-phone",
    "Trumpet Shell", "Gold M-phone", "Battle Trumpet", "Starlight Phone", "HP Shout",
    "Quicksilver", "Shotgun", "Shortbarrel", "Lariat", "Winchester", "Peacemaker", "Buntline", "Long Barrel R",
    "Silver Rifle", "Sniper CR", "Supershot ST", "Outsider", "Death Penalty", "Masamune"
  );

  ITEM_NAMES.push(
    "Bronze Bangle", "Iron Bangle", "Titan Bangle", "Mythril Armlet", "Carbon Bangle", "Silver Armlet", "Gold Armlet", "Diamond Bangle",
    "Crystal Bangle", "Platinum Bangle", "Rune Armlet", "Edincoat", "Wizard Bracelet", "Adaman Bangle", "Gigas Armlet", "Imperial Guard",
    "Aegis Armlet", "Fourth Bracelet", "Warrior Bangle", "Shinra Beta", "Shinra Alpha", "Four Slots", "Fire Armlet", "Aurora Armlet",
    "Bolt Armlet", "Dragon Armlet", "Minerva Band", "Escort Guard", "Mystile", "Ziedrich", "Precious Watch", "Chocobracelet"
  );

  ITEM_NAMES.push(
    "Power Wrist", "Protect Vest", "Earring", "Talisman", "Choco Feather", "Amulet", "Champion Belt", "Poison Ring",
    "Tough Ring", "Circlet", "Star Pendant", "Silver Glasses", "Headband", "Fairy Ring", "Jem Ring", "White Cape",
    "Sprint Shoes", "Peace Ring", "Ribbon", "Fire Ring", "Ice Ring", "Bolt Ring", "Tetra Elemental", "Safety Bit",
    "Fury Ring", "Curse Ring", "Protect Ring", "Cat's Bell", "Reflect Ring", "Water Ring", "Sneak Glove", "HypnoCrown"
  );

  while (ITEM_NAMES.length < 320) ITEM_NAMES.push(`Unknown ${ITEM_NAMES.length}`);

  function itemName(id) {
    if (id === 0x1ff) return "(Empty)";
    if (id < 0 || id >= ITEM_NAMES.length) return `Item #${id}`;
    return ITEM_NAMES[id] || `Item #${id}`;
  }

  function itemCategory(id) {
    if (id < 128) return "Item";
    if (id < 256) return "Weapon";
    if (id < 288) return "Armor";
    if (id < 320) return "Accessory";
    return "Unknown";
  }

  function materiaName(id) {
    if (id === 0xff) return "(Empty)";
    return MATERIA_NAMES[id] || `Materia #${id}`;
  }

  const KEY_ITEMS = [
    // byte 0
    "Cotton Dress", "Satin Dress", "Silk Dress", "Wig", "Dyed Wig", "Blonde Wig", "Glass Tiara", "Ruby Tiara",
    // byte 1
    "Diamond Tiara", "Cologne", "Flower Cologne", "Sexy Cologne", "Member's Card", "Lingerie", "Mystery Panties", "Bikini Briefs",
    // byte 2
    "Pharmacy Coupon", "Disinfectant", "Deodorant", "Digestive",
    "Huge Materia (Fort Condor)", "Huge Materia (Corel)", "Huge Materia (Underwater)", "Huge Materia (Rocket)",
    // byte 3
    "Key to Ancients", "Letter to a Daughter", "Letter to a Wife", "Lunar Harp",
    "Basement Key", "Key to Sector 5", "Keycard 60", "Keycard 62",
    // byte 4
    "Keycard 65", "Keycard 66", "Keycard 68",
    "Midgar Parts 1", "Midgar Parts 2", "Midgar Parts 3", "Midgar Parts 4", "Midgar Parts 5",
    // byte 5
    "PHS", "Gold Ticket", "Keystone", "Leviathan Scales", "Glacier Map", "A Coupon", "B Coupon", "C Coupon",
    // byte 6
    "Black Materia", "Mythril", "Snowboard",
  ];

  const KEY_ITEM_TIPS = {
    "PHS": "Received after Kalm flashback / early Disc 1.",
    "Gold Ticket": "Gold Saucer — Dio’s gift after first visit events.",
    "Keystone": "Temple of the Ancients path / Bone Village dig.",
    "Lunar Harp": "Bone Village excavation (missable timing).",
    "Key to Sector 5": "Wall Market / Sector 5 progression.",
    "Basement Key": "Shinra Mansion (Nibelheim).",
    "Mythril": "Kalm traveler / Mythril Mine related.",
    "Snowboard": "Icicle Inn — required for Great Glacier.",
    "Glacier Map": "Icicle Inn / Great Glacier.",
    "Black Materia": "Temple of the Ancients climax.",
    "Huge Materia (Fort Condor)": "Win Fort Condor huge materia battle.",
    "Huge Materia (Corel)": "Corel train huge materia event.",
    "Huge Materia (Underwater)": "Underwater Reactor huge materia.",
    "Huge Materia (Rocket)": "Rocket Town / Sister Ray sequence.",
    "Leviathan Scales": "Wutai / Godo side content.",
    "Key to Ancients": "Late-game Northern Cave / Ancients path.",
  };

  const TURTLE_FLYERS = [
    { bit: 0x01, name: "Flyer 1", where: "Sector 7 Slums" },
    { bit: 0x02, name: "Flyer 2", where: "Shinra Building 1F" },
    { bit: 0x04, name: "Flyer 3", where: "Gold Saucer — Ghost Hotel" },
    { bit: 0x08, name: "Flyer 4", where: "Cosmo Canyon Inn 2F" },
    { bit: 0x10, name: "Flyer 5", where: "Cosmo Canyon near shop" },
    { bit: 0x20, name: "Flyer 6", where: "Wutai — trap room" },
    { bit: 0x40, name: "Flyer 7", where: "Wutai — Turtle Paradise front" },
    { bit: 0x80, name: "Reward claimed", where: "Talked to Turtle Paradise for all-flyer reward" },
  ];

  const ENEMY_SKILLS = [
    { name: "Frog Song", enemy: "Touch Me (Gongaga jungle / Mythril Mine area)" },
    { name: "L4 Suicide", enemy: "Mu (Chocobo Farm grass) / Mandragora" },
    { name: "Magic Hammer", enemy: "Razor Weed (Wutai grass)" },
    { name: "White Wind", enemy: "Zemzelett (Junon area)" },
    { name: "Big Guard", enemy: "Beachplug (Costa del Sol beach)" },
    { name: "Angel Whisper", enemy: "Pollensalta (Northern Cave)" },
    { name: "Dragon Force", enemy: "Dark Dragon (Northern Cave)" },
    { name: "Death Force", enemy: "Adamantaimai (Wutai coast)" },
    { name: "Flame Breath", enemy: "Dragon (Mt. Nibel)" },
    { name: "Laser", enemy: "Death Machine (Midgar Raid) / Dark Dragon" },
    { name: "Matra Magic", enemy: "Custom Sweeper (Midgar highways)" },
    { name: "Bad Breath", enemy: "Malboro (Gaea’s Cliff / Northern Cave)" },
    { name: "Beta", enemy: "Midgar Zolom (Marshes) — Manipulate" },
    { name: "Aqualung", enemy: "Harpy (Corel desert) / Jenova∙LIFE" },
    { name: "Trine", enemy: "Materia Keeper (Mt. Nibel) / Godo" },
    { name: "Magic Breath", enemy: "Stilva (Gaea’s Cliff)" },
    { name: "????", enemy: "Jersey (Shinra Mansion)" },
    { name: "Goblin Punch", enemy: "Goblin (Goblin Island)" },
    { name: "Chocobuckle", enemy: "Chocobo Level X tricks / L4/L5 Death setup" },
    { name: "L5 Death", enemy: "Jersey / Parasite (Northern Cave)" },
    { name: "Death Sentence", enemy: "Sneaky Step / Gi Spector (Cosmo Canyon)" },
    { name: "Roulette", enemy: "Death Dealer (Northern Cave)" },
    { name: "Shadow Flare", enemy: "Dragon Zombie / Safer∙Sephiroth" },
    { name: "Pandora's Box", enemy: "Dragon Zombie (Northern Cave) — once ever" },
  ];

  const ENEMY_SKILL_MATERIA_ID = 0x2c;

  function enemySkillMask(ap) {
    return (Number(ap) || 0) & 0xffffff;
  }

  function setEnemySkillBit(ap, bit, on) {
    let mask = enemySkillMask(ap);
    if (on) mask |= 1 << bit;
    else mask &= ~(1 << bit);
    return mask & 0xffffff;
  }

  function keyItemOwned(keyItems, index) {
    if (!keyItems || index < 0 || index >= 64) return false;
    const byte = keyItems[index >> 3] ?? 0;
    return (byte & (1 << (index & 7))) !== 0;
  }

  function setKeyItemOwned(keyItems, index, owned) {
    if (!keyItems || index < 0 || index >= 64) return;
    const bi = index >> 3;
    const bit = 1 << (index & 7);
    if (owned) keyItems[bi] |= bit;
    else keyItems[bi] &= ~bit;
  }

  // Cloud cumulative EXP at each level (measured). Close enough for other chars.
  const CLOUD_EXP = [
    0, 0, 128, 250, 400, 520, 610, 616, 949, 1384, 1934, 2614, 3588, 4610, 5809, 7200,
    8797, 10614, 12665, 14965, 17528, 20368, 24161, 27694, 31555, 35759, 40321, 45255, 50576, 56299, 62438,
    69008, 77066, 84643, 92701, 101255, 110320, 119910, 130040, 140725, 151980, 163820, 176259, 189312, 202994, 217320,
    232305, 247963, 264309, 281358, 299125, 317625, 336972, 356881, 377667, 399245, 421630, 444836, 468878, 493771, 519530,
    546170, 581467, 610297, 640064, 670784, 702471, 735141, 768808, 803488, 839195, 875945, 913752, 952632, 992599, 1033669,
    1075856, 1119176, 1163643, 1209273, 1256080, 1304080, 1389359, 1441133, 1494178, 1548509, 1604141, 1661090, 1719371, 1778999, 1839990,
    1902360, 1966123, 2031295, 2097892, 2165929, 2235421, 2306384, 2378833, 2452783,
  ];

  function expForLevel(level, charId) {
    const L = Math.max(1, Math.min(99, level | 0));
    // Char-specific tables vary slightly; Cloud curve is the shared baseline.
    void charId;
    return CLOUD_EXP[L] ?? 0;
  }

  function expToNextForLevel(level, charId) {
    const L = Math.max(1, Math.min(99, level | 0));
    if (L >= 99) return 0;
    return Math.max(0, expForLevel(L + 1, charId) - expForLevel(L, charId));
  }

  const VEHICLE_BITS = [
    { bit: 0x01, name: "Buggy" },
    { bit: 0x04, name: "Tiny Bronco" },
    { bit: 0x10, name: "Highwind" },
    { bit: 0x20, name: "Highwind (flying flag)" },
  ];

  const LOADOUT_PRESETS = [
    {
      id: "midgar-op",
      name: "Midgar OP",
      desc: "Fat gil, healing stock, Cover + All + Restore",
      apply(slot, helpers) {
        slot.gil = 500000;
        helpers.stockItems(slot, [0, 1, 3, 7, 8, 9, 15, 70], 99);
        helpers.ensureMateria(slot, [0x10, 0x17, 0x35, 0x31, 0x32, 0x34], true);
      },
    },
    {
      id: "speedrun-kit",
      name: "Speedrun kit",
      desc: "Lean consumables + Enemy Skill + Underwater ready",
      apply(slot, helpers) {
        slot.gil = Math.max(slot.gil, 100000);
        helpers.stockItems(slot, [1, 3, 5, 7, 15], 50);
        helpers.ensureMateria(slot, [0x2c, 0x11, 0x24, 0x35], true);
      },
    },
    {
      id: "postgame-farm",
      name: "Post-game farm",
      desc: "Max gil/GP, all materia mastered, all limits",
      apply(slot, helpers) {
        slot.gil = 99999999;
        slot.gp = 10000;
        slot.battlePoints = 65535;
        helpers.maxChars(slot);
        helpers.allMateriaMastered(slot);
      },
    },
    {
      id: "date-aeris",
      name: "Perfect date: Aeris",
      desc: "Max Aeris love, zero the others",
      apply(slot) {
        slot.love = slot.love || {};
        slot.love.aeris = 255;
        slot.love.battleAeris = 255;
        slot.love.tifa = 0;
        slot.love.battleTifa = 0;
        slot.love.yuffie = 0;
        slot.love.battleYuffie = 0;
        slot.love.barret = 0;
        slot.love.battleBarret = 0;
      },
    },
    {
      id: "date-tifa",
      name: "Perfect date: Tifa",
      desc: "Max Tifa love, zero the others",
      apply(slot) {
        slot.love = slot.love || {};
        slot.love.tifa = 255;
        slot.love.battleTifa = 255;
        slot.love.aeris = 0;
        slot.love.battleAeris = 0;
        slot.love.yuffie = 0;
        slot.love.battleYuffie = 0;
        slot.love.barret = 0;
        slot.love.battleBarret = 0;
      },
    },
  ];

  // Character record stores a relative weapon index into that char's weapon list.
  const WEAPON_RANGE_BY_CHAR = {
    0: { start: 128, count: 16 }, // Cloud
    1: { start: 160, count: 16 }, // Barret
    2: { start: 144, count: 16 }, // Tifa
    3: { start: 190, count: 11 }, // Aeris
    4: { start: 176, count: 14 }, // Red XIII
    5: { start: 215, count: 14 }, // Yuffie
    6: { start: 229, count: 13 }, // Cait Sith
    7: { start: 242, count: 13 }, // Vincent
    8: { start: 201, count: 14 }, // Cid
    9: { start: 128, count: 16 }, // Young Cloud (Cloud weapons)
    10: { start: 255, count: 1 }, // Sephiroth (Masamune)
  };

  function weaponsForChar(charId) {
    const range = WEAPON_RANGE_BY_CHAR[charId] || WEAPON_RANGE_BY_CHAR[0];
    const list = [];
    for (let i = 0; i < range.count; i++) {
      const absolute = range.start + i;
      list.push({ relative: i, absolute, name: itemName(absolute) });
    }
    return list;
  }

  function armorsList() {
    return Array.from({ length: 32 }, (_, i) => ({
      relative: i,
      absolute: 256 + i,
      name: itemName(256 + i),
    }));
  }

  function accessoriesList() {
    return [
      { relative: 255, absolute: null, name: "(None)" },
      ...Array.from({ length: 32 }, (_, i) => ({
        relative: i,
        absolute: 288 + i,
        name: itemName(288 + i),
      })),
    ];
  }

  function equipmentSelectHtml(options, selectedRelative) {
    const selected = Number(selectedRelative);
    const has = options.some((o) => o.relative === selected);
    let html = options
      .map(
        (o) =>
          `<option value="${o.relative}"${o.relative === selected ? " selected" : ""}>${escapeHtml(o.name)}</option>`
      )
      .join("");
    if (!has && Number.isFinite(selected)) {
      html =
        `<option value="${selected}" selected>Unknown #${selected}</option>` + html;
    }
    return html;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const FF_TEXT = (() => {
    const map = {};
    for (let i = 0; i <= 9; i++) map[i] = String(i);
    for (let i = 0; i < 26; i++) {
      map[0x0a + i] = String.fromCharCode(65 + i);
      map[0x24 + i] = String.fromCharCode(97 + i);
    }
    map[0x3e] = "!"; map[0x3f] = "?"; map[0x40] = "·"; map[0x41] = ".";
    map[0x44] = '"'; map[0x45] = '"'; map[0x46] = "/";
    map[0x49] = "("; map[0x4a] = ")"; map[0x4b] = ":"; map[0x4c] = ",";
    map[0x4e] = "'"; map[0x4f] = "'"; map[0x50] = " "; map[0x60] = " ";
    return map;
  })();

  const FF_TEXT_REV = (() => {
    const rev = {};
    for (const [k, v] of Object.entries(FF_TEXT)) {
      if (v.length === 1 && rev[v] === undefined) rev[v] = Number(k);
    }
    return rev;
  })();

  function decodeFFText(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0xff) break;
      out += FF_TEXT[b] ?? "";
    }
    return out;
  }

  function encodeFFText(str, length) {
    const out = new Uint8Array(length);
    out.fill(0xff);
    let i = 0;
    for (const ch of str) {
      if (i >= length - 1) break;
      const code = FF_TEXT_REV[ch];
      if (code === undefined) continue;
      out[i++] = code;
    }
    return out;
  }

  const MATERIA_OPTIONS = Object.keys(MATERIA_NAMES)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => ({ id, name: MATERIA_NAMES[id] }));

  const ITEM_OPTIONS = ITEM_NAMES.map((name, id) => ({ id, name, category: itemCategory(id) }))
    .filter((x) => !x.name.startsWith("Unused") && !x.name.startsWith("Unknown"));

  window.FF7Data = {
    CHAR_NAMES,
    ITEM_NAMES,
    MATERIA_NAMES,
    MATERIA_OPTIONS,
    ITEM_OPTIONS,
    WEAPON_RANGE_BY_CHAR,
    KEY_ITEMS,
    KEY_ITEM_TIPS,
    TURTLE_FLYERS,
    ENEMY_SKILLS,
    ENEMY_SKILL_MATERIA_ID,
    CLOUD_EXP,
    VEHICLE_BITS,
    LOADOUT_PRESETS,
    itemName,
    itemCategory,
    materiaName,
    keyItemOwned,
    setKeyItemOwned,
    enemySkillMask,
    setEnemySkillBit,
    expForLevel,
    expToNextForLevel,
    weaponsForChar,
    armorsList,
    accessoriesList,
    equipmentSelectHtml,
    decodeFFText,
    encodeFFText,
  };
})();
