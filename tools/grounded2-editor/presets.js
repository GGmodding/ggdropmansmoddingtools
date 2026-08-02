(() => {
  "use strict";

  const C = window.GroundedCsav;

  /** Zero common status blobs after their short-name FString when present. */
  const STATUS_PATHS = [
    "/Script/Maine.VenomComponent",
    "/Script/Maine.PoisonGasComponent",
    "/Script/Maine.CorrosionComponent",
    "/Script/Maine.BodyTemperatureComponent",
    "/Script/Maine.StatusEffectComponent",
  ];

  /** Building / craft staples seen in Augusta saves + upgrade stones / eggs. */
  const BUILD_RESOURCES = [
    ["FiberRaw", 999],
    ["FiberDry", 999],
    ["FiberWoven", 500],
    ["Sap", 999],
    ["Clay", 999],
    ["Twig", 999],
    ["GrassPlank", 999],
    ["CloverTop", 500],
    ["ThistleNeedle", 500],
    ["AcornTop", 200],
    ["AcornShell", 200],
    ["AcornBits", 200],
    ["StoneShale", 500],
    ["Mushroom", 200],
    ["GrubHide", 200],
    ["GrubGoop", 200],
    ["Web", 200],
    ["Nectar", 200],
    ["Honeydew", 200],
    ["FlowerPetal", 200],
    ["HedgeBerry", 100],
    ["PumpinSeed", 50],
    ["TarantulaChunk", 50],
    ["UpgradeArmor1", 50],
    ["UpgradeWeapon1", 50],
    ["BandageTier3", 50],
    ["ORCChip", 20],
  ];

  const FOOD_BUNDLE = [
    ["FoodHotDog", 20],
    ["FoodDonut", 20],
    ["FoodCookieSandwich", 20],
    ["FoodApple", 20],
    ["GranolaBar", 20],
    ["SmoothieFiber", 20],
    ["SmoothieHealingReceived", 20],
    ["DewDrop", 50],
    ["JuiceDrop", 50],
    ["SodaDrop", 50],
  ];

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 80 || off + 4 + len > buf.length) return null;
    return { next: off + 4 + len };
  }

  function indexOfAscii(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from || 0); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function clearStatusEffects(rawPlayer) {
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    let touched = 0;
    for (const path of STATUS_PATHS) {
      const at = indexOfAscii(buf, path, 0);
      if (at < 0) continue;
      let off = at + path.length + 1;
      const fs = readFString(buf, off);
      if (fs) off = fs.next;
      const end = Math.min(buf.length, off + 32);
      for (let i = off; i < end; i++) {
        if (buf[i] !== 0) {
          buf[i] = 0;
          touched++;
        }
      }
    }
    return { bytes: buf, touched };
  }

  function addItemList(rawPlayer, pairs) {
    const Inv = window.GroundedInventory;
    if (!Inv || !rawPlayer) throw new Error("Inventory API / HostPlayer required.");
    let host = new Uint8Array(C.toBytes(rawPlayer));
    const log = [];
    let ok = 0;
    let fail = 0;
    for (const [name, qty] of pairs) {
      try {
        const r = Inv.addInventoryItem(host, name, qty);
        host = r.bytes;
        log.push(name + "×" + (r.stack || qty));
        ok++;
      } catch (e) {
        fail++;
      }
    }
    return { bytes: host, ok, fail, log };
  }

  function applyBuildResources(rawPlayer) {
    return addItemList(rawPlayer, BUILD_RESOURCES);
  }

  function applyFoodBundle(rawPlayer) {
    return addItemList(rawPlayer, FOOD_BUNDLE);
  }

  function applyTamingEggs(rawPlayer) {
    const eggs = (window.GroundedHatching && window.GroundedHatching.TAMING_EGGS) || [
      "Taming_EggAnt",
      "Taming_EggBlackAnt",
      "Taming_EggLadybug",
      "Taming_EggOrb",
    ];
    return addItemList(
      rawPlayer,
      eggs.map((n) => [n, 5]).concat([["AntEgg", 5]])
    );
  }

  function maxStackUpgrades(rawPlayer, rawWorld) {
    const P = window.GroundedPlayer;
    if (!P) throw new Error("Player module missing.");
    const parsed = P.parseMolars(rawPlayer, rawWorld);
    const stackUpgrades = {};
    for (const e of parsed.stackUpgrades || []) stackUpgrades[e.name] = 20;
    const upgrades = {};
    for (const e of parsed.upgrades || []) upgrades[e.name] = 20;
    return P.writeMolars(rawPlayer, rawWorld, { stackUpgrades, upgrades });
  }

  function applyOpPreset(rawPlayer, rawWorld) {
    let host = rawPlayer ? new Uint8Array(C.toBytes(rawPlayer)) : null;
    let world = rawWorld ? new Uint8Array(C.toBytes(rawWorld)) : null;
    const log = [];
    const P = window.GroundedPlayer;
    const G = window.GroundedGear;
    const Perks = window.GroundedPerks;
    const Progress = window.GroundedProgress;
    const Tech = window.GroundedTech;

    if (host && P) {
      try {
        const v = P.writePlayerVitals(host, { health: 200, hunger: 5, thirst: 5 });
        host = v.bytes;
        log.push("vitals");
      } catch (e) {
        log.push("vitals fail");
      }
      try {
        const m = P.writeMolars(host, world, {
          milkMolars: 999,
          goldenMolars: 999,
          rawScience: 999999,
        });
        if (m.hostBytes) host = m.hostBytes;
        if (m.worldBytes) world = m.worldBytes;
        log.push("molars/science");
      } catch (e) {
        log.push("molars fail");
      }
      try {
        const s = maxStackUpgrades(host, world);
        if (s.hostBytes) host = s.hostBytes;
        if (s.worldBytes) world = s.worldBytes;
        log.push("stack upgrades");
      } catch (e) {
        log.push("stacks fail");
      }
    }
    if (host && G) {
      try {
        const w = G.applyOneShotWeapons(host, { ngPlus: true });
        host = w.bytes;
        log.push("oneshot x" + w.changed);
        const a = G.applyGodArmor(host, { ngPlus: true });
        host = a.bytes;
        log.push("armor x" + a.changed);
      } catch (e) {
        log.push("gear fail");
      }
    }
    if (host && Perks) {
      try {
        const u = Perks.unlockAllMutations(host, Perks.MAX_PHASE);
        host = u.bytes;
        log.push("mutations x" + u.changed);
      } catch (e) {
        log.push("mutations fail");
      }
    }
    if (host && Progress && Progress.completeAllAchievements) {
      try {
        const a = Progress.completeAllAchievements(host);
        host = a.bytes;
        log.push("achievements");
      } catch (e) {
        log.push("ach fail");
      }
    }
    if (world && Progress && Progress.completeAllQuests) {
      try {
        const q = Progress.completeAllQuests(world);
        world = q.bytes;
        log.push("quests x" + q.changed);
      } catch (e) {
        log.push("quests fail");
      }
    }
    if (world && Progress && Progress.unlockAllBuildingsFromSave) {
      try {
        const b = Progress.unlockAllBuildingsFromSave(world);
        world = b.bytes;
        log.push("buildings +" + b.added);
      } catch (e) {
        log.push("buildings fail");
      }
    }
    if (world && Tech) {
      try {
        const a = Tech.unlockAnalyzeStarter(world);
        world = a.bytes;
        log.push("analyze +" + a.added);
      } catch (e) {
        log.push("analyze fail");
      }
    }
    if (world && window.GroundedMap) {
      try {
        const f = window.GroundedMap.revealAllFog(world);
        world = f.bytes;
        log.push("fog " + f.count);
      } catch (e) {
        log.push("fog fail");
      }
    }
    if (host && window.GroundedPets) {
      try {
        const o = window.GroundedPets.maxOmniTool(host);
        host = o.bytes;
        log.push("omni " + o.levels.join("/"));
      } catch (e) {
        log.push("omni fail");
      }
      try {
        const b = window.GroundedPets.maxBuggyTiers(host, 3);
        host = b.bytes;
        log.push("buggy tier " + b.tier);
      } catch (e) {
        log.push("buggy skip");
      }
    }
    if (world && window.GroundedHatching) {
      try {
        const h = window.GroundedHatching.finishHatcheryJobs(world);
        world = h.bytes;
        log.push("hatch jobs " + h.jobs);
      } catch (e) {
        log.push("hatch fail");
      }
    }
    if (host) {
      try {
        const r = applyBuildResources(host);
        host = r.bytes;
        log.push("resources +" + r.ok);
      } catch (e) {
        log.push("resources fail");
      }
      try {
        const e = applyTamingEggs(host);
        host = e.bytes;
        log.push("eggs +" + e.ok);
      } catch (e) {
        log.push("eggs fail");
      }
      try {
        const c = clearStatusEffects(host);
        host = c.bytes;
        log.push("status clear");
      } catch (e) {
        /* ignore */
      }
    }
    return { hostBytes: host, worldBytes: world, log };
  }

  window.GroundedPresets = {
    applyOpPreset,
    applyBuildResources,
    applyFoodBundle,
    applyTamingEggs,
    maxStackUpgrades,
    clearStatusEffects,
    BUILD_RESOURCES,
    FOOD_BUNDLE,
  };
})();
