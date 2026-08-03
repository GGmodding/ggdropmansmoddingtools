#!/usr/bin/env node
"use strict";

/**
 * GGdropman SoD2 cheat-table save bridge.
 * CE Lua ticks call: node ct-cli.js <command> <save.sav> [args...]
 *
 * Requires Node on PATH. Always writes a .bak next to the save before mutating.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = __dirname;
const MODULES = [
  "save.js",
  "traits.js",
  "skills.js",
  "vitals.js",
  "survivors-roster.js",
  "enclaves.js",
  "inventory.js",
  "map.js",
  "vehicles.js",
  "facilities.js",
  "presets.js",
  "wgs.js",
];

function loadSod2() {
  const sandbox = {
    window: {},
    console,
    Uint8Array,
    DataView,
    ArrayBuffer,
    BigInt,
    Number,
    Math,
    String,
    Array,
    Object,
    Map,
    Set,
    Error,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    undefined,
    Boolean,
    RegExp,
    Date,
    Promise,
    TextDecoder,
    TextEncoder,
  };
  vm.createContext(sandbox);
  for (const f of MODULES) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    vm.runInContext(src, sandbox, { filename: f });
  }
  const S = sandbox.window.Sod2Save;
  if (!S || !S.openSave) throw new Error("Failed to load Sod2Save modules");
  return S;
}

function usage() {
  return [
    "GGdropman SoD2 ct-cli — save bridge for Cheat Engine",
    "",
    "Usage:",
    "  node ct-cli.js help",
    "  node ct-cli.js list <save.sav>",
    "  node ct-cli.js validate <save.sav>",
    "  node ct-cli.js field <save.sav> <fieldId> <value>",
    "  node ct-cli.js preset <save.sav> <presetId>",
    "  node ct-cli.js action <save.sav> <actionId> [args...]",
    "",
    "Presets: " +
      "god-community, heal-roster, hero-roster, max-skills, garage-day,",
    "         open-map, base-ready, locker-polish, friendly-enclaves, full-comfort",
    "",
    "Actions:",
    "  influence [n=9999]     stockpile [n=999]     fill-resources [n=500]",
    "  zero-threats           midday",
    "  heal-all               clear-fatigue         promote-heroes",
    "  enclave-max-infl       friendly-enclaves",
    "  max-stacks [n=999]     repair-weapons [n=9999]",
    "  reveal-map             clear-infest          survey-all",
    "  radio-reset            radio-charges [n=99]  clear-missions",
    "  clear-completed        abandon-outposts",
    "  repair-vehicles        refuel-vehicles       reveal-vehicles",
    "  teleport-vehicles      spawn-plane           vehicle-extra <id> [index]",
    "  convert-plane [index]  repair-facilities     complete-facilities",
    "  spawn-item <category> <classPath> [stack=99] [locker=0]",
    "  spawn-kit <kitId> [locker=0]",
    "",
    "Kits: ammo-all, meds, throwables, stimulants, loadout-assault, resources, snacks",
    "Vehicles: spawn-vehicle <id|path>   ids: plane,golfcart,rv,sport4x4,coupe,sedan,hatchback,utility,van,taxi,suv,classictruck",
  ].join("\n");
}

/** Curated locker spawn packs (paths from Dayton ItemLibrary catalogs). */
const SPAWN_KITS = {
    "ammo-all": [
      ["ammo", "/Game/Items/Ammo/Ammo_9mm.Ammo_9mm_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_45.Ammo_45_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_5_56.Ammo_5_56_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_7_62.Ammo_7_62_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_Shell.Ammo_Shell_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_357.Ammo_357_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_44.Ammo_44_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_50_Cal.Ammo_50_Cal_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_40mm.Ammo_40mm_C", 99],
    ],
    meds: [
      ["consumable", "/Game/Items/Consumables/Bandage.Bandage_C", 99],
      ["consumable", "/Game/Items/Consumables/FirstAidKit.FirstAidKit_C", 50],
      ["consumable", "/Game/Items/Consumables/MildPainkillers.MildPainkillers_C", 99],
      ["consumable", "/Game/Items/Consumables/StandardPainkillers.StandardPainkillers_C", 99],
      ["consumable", "/Game/Items/Consumables/PotentPainkillers.PotentPainkillers_C", 50],
      ["consumable", "/Game/Items/Consumables/PlagueCure_HomeMade.PlagueCure_HomeMade_C", 20],
    ],
    stimulants: [
      ["consumable", "/Game/Items/Consumables/MildStims.MildStims_C", 99],
      ["consumable", "/Game/Items/Consumables/StandardStims.StandardStims_C", 99],
      ["consumable", "/Game/Items/Consumables/PotentStims.PotentStims_C", 50],
      ["consumable", "/Game/Items/Consumables/Consumable_Stamina_Espresso.Consumable_Stamina_Espresso_C", 50],
    ],
    throwables: [
      ["consumable", "/Game/Items/Consumables/Throwables/grenade_m67_throwable.grenade_m67_throwable_C", 50],
      ["consumable", "/Game/Items/Consumables/Throwables/grenade_molotov_throwable.grenade_molotov_throwable_C", 50],
      ["consumable", "/Game/Items/Consumables/Throwables/pipe_bomb_throwable.pipe_bomb_throwable_C", 50],
      ["consumable", "/Game/Items/Consumables/Throwables/grenade_flashbang_throwable.grenade_flashbang_throwable_C", 50],
      ["consumable", "/Game/Items/Consumables/Throwables/grenade_decoy_smokebomb_throwable.grenade_decoy_smokebomb_throwable_C", 50],
      ["consumable", "/Game/Items/Consumables/Throwables/grenade_FuelBomb_throwable.grenade_FuelBomb_throwable_C", 30],
    ],
    snacks: [
      ["consumable", "/Game/Items/Consumables/Snacks.Snacks_C", 99],
      ["consumable", "/Game/Items/Consumables/NutritiousSnacks.NutritiousSnacks_C", 99],
    ],
    resources: [
      ["resource", "/Game/Items/ResourceItems/Food/CoffeeFoodResourceItem.CoffeeFoodResourceItem_C", 1],
      ["resource", "/Game/Items/ResourceItems/Materials/GenericMaterialsResourceItem.GenericMaterialsResourceItem_C", 1],
      ["resource", "/Game/Items/ResourceItems/Meds/OTCMedsResourceItem.OTCMedsResourceItem_C", 1],
      ["resource", "/Game/Items/ResourceItems/Ammo/MilitaryAmmoResourceItem.MilitaryAmmoResourceItem_C", 1],
      ["resource", "/Game/Items/ResourceItems/Ammo/HuntingAmmoResourceItem.HuntingAmmoResourceItem_C", 1],
    ],
    "loadout-assault": [
      ["ranged", "/Game/Items/RangedWeapons/Assault_AR15.Assault_AR15_C", 1],
      ["ranged", "/Game/Items/RangedWeapons/Assault_AK47_Classic.Assault_AK47_Classic_C", 1],
      ["ranged", "/Game/Items/RangedWeapons/Pistol_M1911_Auto.Pistol_M1911_Auto_C", 1],
      ["ammo", "/Game/Items/Ammo/Ammo_5_56.Ammo_5_56_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_7_62.Ammo_7_62_C", 999],
      ["ammo", "/Game/Items/Ammo/Ammo_45.Ammo_45_C", 999],
      ["consumable", "/Game/Items/Consumables/Bandage.Bandage_C", 50],
      ["consumable", "/Game/Items/Consumables/PotentStims.PotentStims_C", 20],
      ["melee", "/Game/Items/MeleeWeapons/MeleeWeapon_Bladed_Axe_Tactical.MeleeWeapon_Bladed_Axe_Tactical_C", 1],
    ],
  };

function openFile(S, savPath) {
  const abs = path.resolve(savPath);
  if (!fs.existsSync(abs)) throw new Error("Save not found: " + abs);
  const buf = fs.readFileSync(abs);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const save = S.openSave(ab, path.basename(abs));
  return { abs, save };
}

function ensureAll(S, save) {
  try {
    S.discoverCommunityFields(save);
  } catch (_) {}
  try {
    S.discoverSurvivors(save);
  } catch (_) {}
  try {
    S.discoverEnclaves(save);
  } catch (_) {}
  try {
    S.discoverInventories(save);
  } catch (_) {}
  try {
    S.discoverMapQuest(save);
  } catch (_) {}
  try {
    if (S.discoverMapSites) S.discoverMapSites(save);
  } catch (_) {}
  try {
    if (S.discoverMissions) S.discoverMissions(save);
  } catch (_) {}
  try {
    if (S.discoverRadioCommands) S.discoverRadioCommands(save);
  } catch (_) {}
  try {
    S.discoverVehicles(save);
  } catch (_) {}
  try {
    S.discoverFacilities(save);
  } catch (_) {}
}

function backup(abs) {
  const bak = abs + ".bak";
  fs.copyFileSync(abs, bak);
  return bak;
}

function writeSave(S, abs, save) {
  const out = S.buildSave(save);
  fs.writeFileSync(abs, Buffer.from(out));
}

function setIf(S, save, id, value) {
  try {
    if (save.fields && save.fields[id] && save.fields[id].available) {
      S.setFieldValue(save, id, value);
      return true;
    }
  } catch (_) {}
  return false;
}

function fillStockpile(S, save, amount) {
  let n = 0;
  const ids = S.STOCKPILE_IDS || ["food", "meds", "ammo", "materials", "fuel", "parts"];
  for (const id of ids) if (setIf(S, save, id, amount)) n++;
  if (setIf(S, save, "prestige", Math.max(amount, 999))) n++;
  return n;
}

function polishLockers(S, save, stackMax, durMax) {
  let stacks = 0;
  let guns = 0;
  const lockers = save.inventories || [];
  for (let i = 0; i < lockers.length; i++) {
    try {
      if (S.maxAllInventoryStacks) stacks += S.maxAllInventoryStacks(save, i, stackMax) || 0;
    } catch (_) {}
    try {
      if (S.repairAllInventoryWeapons) guns += S.repairAllInventoryWeapons(save, i, durMax) || 0;
    } catch (_) {}
  }
  return { stacks, guns };
}

function runAction(S, save, actionId, args) {
  const a = String(actionId || "").toLowerCase();
  ensureAll(S, save);

  if (a === "influence") {
    const n = Number(args[0] != null ? args[0] : 9999);
    if (!setIf(S, save, "influence", n)) throw new Error("Influence field not available");
    return "influence → " + n;
  }
  if (a === "stockpile") {
    const n = Number(args[0] != null ? args[0] : 999);
    return "stockpile fields ×" + fillStockpile(S, save, n) + " @" + n;
  }
  if (a === "fill-resources") {
    const n = Number(args[0] != null ? args[0] : 500);
    const ids = [...(S.STOCKPILE_IDS || []), "prestige"];
    let c = 0;
    for (const id of ids) if (setIf(S, save, id, n)) c++;
    return "resources ×" + c + " @" + n;
  }
  if (a === "zero-threats") {
    let c = 0;
    for (const id of ["plagueHearts", "infestationsToday"]) if (setIf(S, save, id, 0)) c++;
    return "threats cleared ×" + c;
  }
  if (a === "midday") {
    if (!setIf(S, save, "timeOfDay", 720)) throw new Error("TimeOfDay not available");
    return "time → midday (720)";
  }
  if (a === "heal-all") {
    const n = S.healAllSurvivors ? S.healAllSurvivors(save) : 0;
    return "healed " + n + " survivors";
  }
  if (a === "clear-fatigue") {
    const n = S.clearAllFatigue ? S.clearAllFatigue(save) : 0;
    return "cleared fatigue on " + n;
  }
  if (a === "promote-heroes") {
    const n = S.promoteAllToHero ? S.promoteAllToHero(save) : 0;
    return "promoted " + n + " to Hero";
  }
  if (a === "enclave-max-infl") {
    const n = S.bulkSetEnclaveInfluence ? S.bulkSetEnclaveInfluence(save, 9999) : 0;
    return "enclave influence ×" + n;
  }
  if (a === "friendly-enclaves") {
    const bits = [];
    if (S.bulkSetEnclaveInfluence) bits.push("infl " + S.bulkSetEnclaveInfluence(save, 9999));
    if (S.bulkSetEnclaveBools) {
      bits.push(
        "flags " +
          S.bulkSetEnclaveBools(save, {
            displayOnMap: true,
            tradesPrestige: false,
            disbandsOnRecruit: false,
            hideRecruitability: false,
          })
      );
    }
    return bits.join(" · ") || "no enclaves";
  }
  if (a === "max-stacks") {
    const n = Number(args[0] != null ? args[0] : 999);
    const r = polishLockers(S, save, n, 9999);
    return "stacks×" + r.stacks;
  }
  if (a === "repair-weapons") {
    const n = Number(args[0] != null ? args[0] : 9999);
    const r = polishLockers(S, save, 999, n);
    return "weapons×" + r.guns;
  }
  if (a === "reveal-map") {
    const n = S.revealAllMapSites ? S.revealAllMapSites(save) : 0;
    return "sites revealed " + n;
  }
  if (a === "clear-infest") {
    const n = S.clearAllInfestedOutposts ? S.clearAllInfestedOutposts(save) : 0;
    return "cleared infest " + n;
  }
  if (a === "survey-all") {
    const n = S.setAllSitesSurveyed ? S.setAllSitesSurveyed(save) : 0;
    return "surveyed " + n;
  }
  if (a === "radio-reset") {
    const n = S.resetRadioCooldowns ? S.resetRadioCooldowns(save) : 0;
    return "radio cooldowns " + n;
  }
  if (a === "radio-charges") {
    const n = Number(args[0] != null ? args[0] : 99);
    const c = S.setAllRadioCharges ? S.setAllRadioCharges(save, n) : 0;
    return "radio charges ×" + c + " @" + n;
  }
  if (a === "clear-missions") {
    const n = S.clearLooseMissions ? S.clearLooseMissions(save) : 0;
    return "cleared missions " + n;
  }
  if (a === "clear-completed") {
    const n = S.clearCompletedMissions ? S.clearCompletedMissions(save) : 0;
    return "cleared completed log " + n;
  }
  if (a === "abandon-outposts") {
    const n = S.abandonAllOutposts ? S.abandonAllOutposts(save) : 0;
    return "abandoned outposts " + n;
  }
  if (a === "repair-vehicles") {
    const n = S.repairAllVehicles ? S.repairAllVehicles(save) : 0;
    return "repaired vehicles " + n;
  }
  if (a === "refuel-vehicles") {
    const n = S.refuelAllVehicles ? S.refuelAllVehicles(save) : 0;
    return "refueled vehicles " + n;
  }
  if (a === "reveal-vehicles") {
    const n = S.revealAllVehicles ? S.revealAllVehicles(save) : 0;
    return "revealed vehicles " + n;
  }
  if (a === "teleport-vehicles") {
    const r = S.teleportVehiclesNearBase ? S.teleportVehiclesNearBase(save) : { count: 0 };
    return "teleported " + (r.count != null ? r.count : r) + " near base";
  }
  if (a === "spawn-plane") {
    const r = S.spawnVehicleExtraNearBase(save, "plane");
    return "spawned Plane → #" + (r.index + 1) + " class " + r.shortName;
  }
  if (a === "vehicle-extra") {
    const extraId = args[0] || "plane";
    let idx = args[1] != null ? Number(args[1]) : (save.vehicles || []).length - 1;
    if (idx < 0 || !save.vehicles || idx >= save.vehicles.length) {
      throw new Error("Bad vehicle index (have " + ((save.vehicles && save.vehicles.length) || 0) + ")");
    }
    const r = S.applyVehicleExtra(save, idx, extraId);
    return "vehicle #" + (idx + 1) + " → " + r.shortName;
  }
  if (a === "convert-plane") {
    let idx = args[0] != null ? Number(args[0]) : (save.vehicles || []).length - 1;
    if (idx < 0 || !save.vehicles || idx >= save.vehicles.length) {
      throw new Error("Bad vehicle index");
    }
    const r = S.applyVehicleExtra(save, idx, "plane");
    return "vehicle #" + (idx + 1) + " → Plane";
  }
  if (a === "repair-facilities") {
    const n = S.repairAllFacilities ? S.repairAllFacilities(save) : 0;
    return "repaired facilities " + n;
  }
  if (a === "complete-facilities") {
    const n = S.completeAllFacilities ? S.completeAllFacilities(save) : 0;
    return "completed facilities " + n;
  }
  if (a === "spawn-item") {
    const category = args[0];
    const classPath = args[1];
    const stack = args[2] != null ? Number(args[2]) : 99;
    const locker = args[3] != null ? Number(args[3]) : 0;
    if (!category || !classPath) throw new Error("spawn-item needs <category> <classPath>");
    if (!S.addInventoryItem) throw new Error("Inventory API missing");
    S.addInventoryItem(save, locker, category, classPath, stack);
    return "spawned " + classPath + " ×" + stack + " into locker #" + locker + " (" + category + ")";
  }
  if (a === "spawn-kit") {
    const kitId = String(args[0] || "").toLowerCase();
    const locker = args[1] != null ? Number(args[1]) : 0;
    const kit = SPAWN_KITS[kitId];
    if (!kit) {
      throw new Error("Unknown kit. Use: " + Object.keys(SPAWN_KITS).join(", "));
    }
    if (!S.addInventoryItem) throw new Error("Inventory API missing");
    let n = 0;
    const errors = [];
    for (const [category, classPath, stack] of kit) {
      try {
        S.addInventoryItem(save, locker, category, classPath, stack);
        n++;
      } catch (err) {
        errors.push((classPath.split(".").pop() || classPath) + ": " + (err.message || String(err)));
      }
    }
    let msg = "kit " + kitId + " → " + n + "/" + kit.length + " items in locker #" + locker;
    if (errors.length) msg += "\nSkipped: " + errors.slice(0, 5).join("; ");
    return msg;
  }
  if (a === "spawn-vehicle" || a === "spawn-veh") {
    const id = args[0] || "plane";
    if (!S.spawnVehicleExtraNearBase) throw new Error("Vehicle API missing");
    const r = S.spawnVehicleExtraNearBase(save, id);
    return (
      "spawned vehicle " +
      (r.shortName || id) +
      " → #" +
      (r.index + 1) +
      " near base (reload community in-game to see it)"
    );
  }

  throw new Error("Unknown action: " + actionId + "\n\n" + usage());
}

function cmdList(S, savPath) {
  const { abs, save } = openFile(S, savPath);
  ensureAll(S, save);
  const fields = save.fields || {};
  const infl = fields.influence && fields.influence.available ? fields.influence.value : "?";
  const lines = [
    "Save: " + abs,
    "Type: " + (save.saveType || S.SAVE_TYPE || "?"),
    "Influence: " + infl,
    "Survivors: " + ((save.survivors && save.survivors.length) || 0),
    "Enclaves: " + ((save.enclaves && save.enclaves.length) || 0),
    "Inventories: " + ((save.inventories && save.inventories.length) || 0),
    "Map sites: " + ((save.mapSites && save.mapSites.length) || 0),
    "Vehicles: " + ((save.vehicles && save.vehicles.length) || 0),
    "Facilities: " + ((save.facilities && save.facilities.length) || 0),
    "Loose missions: " + ((save.looseMissions && save.looseMissions.length) || 0),
  ];
  if (save.vehicles && save.vehicles.length) {
    lines.push(
      "Vehicle classes: " +
        (save.vehicleClasses || []).map((c) => c.shortName || c.path).join(", ")
    );
  }
  return lines.join("\n");
}

function cmdValidate(S, savPath) {
  const { abs, save } = openFile(S, savPath);
  const ok = S.roundTripOk(save);
  return ok ? "OK round-trip: " + abs : "FAIL round-trip: " + abs;
}

function cmdField(S, savPath, fieldId, value) {
  const { abs, save } = openFile(S, savPath);
  ensureAll(S, save);
  if (!fieldId) throw new Error("fieldId required");
  if (value == null) throw new Error("value required");
  const bak = backup(abs);
  S.setFieldValue(save, fieldId, value);
  writeSave(S, abs, save);
  return "Set " + fieldId + " → " + value + "\nBackup: " + bak + "\nWrote: " + abs;
}

function cmdPreset(S, savPath, presetId) {
  const { abs, save } = openFile(S, savPath);
  ensureAll(S, save);
  const bak = backup(abs);
  const r = S.applyEditorPreset(save, presetId);
  writeSave(S, abs, save);
  return (
    "Preset " +
    r.id +
    " (" +
    r.title +
    "): " +
    r.summary +
    "\nBackup: " +
    bak +
    "\nWrote: " +
    abs
  );
}

function cmdAction(S, savPath, actionId, args) {
  const { abs, save } = openFile(S, savPath);
  const bak = backup(abs);
  const summary = runAction(S, save, actionId, args);
  writeSave(S, abs, save);
  return summary + "\nBackup: " + bak + "\nWrote: " + abs;
}

function main(argv) {
  const args = argv.slice(2);
  const cmd = (args[0] || "help").toLowerCase();
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(usage());
    return 0;
  }

  const S = loadSod2();

  if (cmd === "list") {
    console.log(cmdList(S, args[1]));
    return 0;
  }
  if (cmd === "validate") {
    console.log(cmdValidate(S, args[1]));
    return 0;
  }
  if (cmd === "field") {
    console.log(cmdField(S, args[1], args[2], args[3]));
    return 0;
  }
  if (cmd === "preset") {
    console.log(cmdPreset(S, args[1], args[2]));
    return 0;
  }
  if (cmd === "action") {
    console.log(cmdAction(S, args[1], args[2], args.slice(3)));
    return 0;
  }

  console.error(usage());
  throw new Error("Unknown command: " + cmd);
}

try {
  const code = main(process.argv);
  process.exit(code == null ? 0 : code);
} catch (err) {
  console.error("ERROR: " + (err && err.message ? err.message : String(err)));
  process.exit(1);
}
