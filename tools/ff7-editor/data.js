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
    itemName,
    itemCategory,
    materiaName,
    decodeFFText,
    encodeFFText,
  };
})();
