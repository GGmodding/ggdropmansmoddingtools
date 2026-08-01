(() => {
  "use strict";

  /** Common item IDs players actually stuff in pockets / racks. */
  const ITEM_IDS = [
    "cash", "ogkush", "sourdiesel", "greencrack", "granddaddypurple",
    "meth", "cocaine", "soil", "longlifesoil", "extralonglifesoil",
    "fertilizer", "water", "pgr", "speedgrow", "baggie", "jar",
    "ogkushseed", "sourdieselseed", "greencrackseed", "granddaddypurpleseed",
    "pseudo", "lowqualitypseudo", "standardqualitypseudo", "highqualitypseudo",
    "acid", "phosphorus", "iodine", "gasoline", "motor oil", "motoroil",
    "banana", "cuke", "paracetamol", "donut", "energydrink", "viagor",
    "mouthwash", "flumedicine", "megabean", "chili", "battery", "addy",
    "horsesemen", "trashbag", "bed", "growtent", "plasticpot", "airpot",
  ];

  const PRODUCT_EFFECTS = [
    "foggy", "brighteyed", "giraffying", "cyclopean", "zombifying", "sneaky",
    "caloriedense", "tropicthunder", "sedating", "spicy", "calming",
    "disorienting", "glowie", "slippery", "electrifying", "explosive",
    "antiepileptic", "athletic", "balding", "brightEyed", "calorific",
    "euphoric", "focused", "gingeritis", "jennerising", "laxative",
    "longfaced", "paranoia", "refreshing", "schizophrenia", "seizureinducing",
    "smelly", "spicy", "thoughtprovoking", "toxic",
  ];

  const RELATION_TIERS = [
    { max: 0.5, label: "Hostile", tone: "bad" },
    { max: 1.5, label: "Cold", tone: "warn" },
    { max: 2.5, label: "Neutral", tone: "muted" },
    { max: 3.5, label: "Friendly", tone: "ok" },
    { max: 4.5, label: "Trusted", tone: "ok" },
    { max: 99, label: "Loyal", tone: "accent" },
  ];

  const STORAGE_KITS = {
    grow: [
      { id: "soil", qty: 20 },
      { id: "fertilizer", qty: 20 },
      { id: "water", qty: 20 },
      { id: "ogkushseed", qty: 10 },
      { id: "speedgrow", qty: 10 },
      { id: "pgr", qty: 10 },
    ],
    mix: [
      { id: "cuke", qty: 20 },
      { id: "banana", qty: 20 },
      { id: "paracetamol", qty: 20 },
      { id: "energydrink", qty: 20 },
      { id: "mouthwash", qty: 20 },
      { id: "flumedicine", qty: 20 },
    ],
    meth: [
      { id: "pseudo", qty: 20 },
      { id: "acid", qty: 20 },
      { id: "phosphorus", qty: 20 },
      { id: "iodine", qty: 20 },
      { id: "gasoline", qty: 20 },
    ],
  };

  const PRESETS = [
    {
      id: "starter-boost",
      name: "Starter Boost",
      blurb: "Pocket cash, bank seed money, Street Rat V.",
      apply: ["money", "rank"],
    },
    {
      id: "empire-keys",
      name: "Empire Keys",
      blurb: "Own every property + business found in the save.",
      apply: ["properties"],
    },
    {
      id: "street-cred",
      name: "Street Cred",
      blurb: "Max relationships + unlock every NPC.",
      apply: ["npcs"],
    },
    {
      id: "kingpin-run",
      name: "Kingpin Run",
      blurb: "Kingpin I, fat bank, loyal streets, own the map.",
      apply: ["money", "rank", "properties", "npcs"],
    },
  ];

  function relationLabel(delta) {
    const n = Number(delta);
    if (Number.isNaN(n)) return "Unknown";
    for (const t of RELATION_TIERS) {
      if (n <= t.max) return t.label;
    }
    return "Loyal";
  }

  window.Schedule1Data = {
    ITEM_IDS,
    PRODUCT_EFFECTS,
    RELATION_TIERS,
    STORAGE_KITS,
    PRESETS,
    relationLabel,
  };
})();
