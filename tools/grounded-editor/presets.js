(() => {
  "use strict";

  /**
   * One-click presets + loadout JSON import/export.
   * Depends on other Grounded* modules already loaded.
   */
  function applyOpPreset(hostRaw, worldRaw, opts) {
    const o = opts || {};
    const ng = !!o.ngPlus;
    let host = hostRaw ? new Uint8Array(hostRaw) : null;
    let world = worldRaw ? new Uint8Array(worldRaw) : null;
    const log = [];

    if (host && window.GroundedPlayer) {
      try {
        const v = window.GroundedPlayer.writePlayerVitals(host, {
          health: 200,
          hunger: 5,
          thirst: 5,
        });
        host = v.bytes;
        log.push("vitals filled");
      } catch (e) {
        log.push("vitals: " + (e.message || e));
      }
      try {
        const m = window.GroundedPlayer.writeMolars(host, world, {
          milkMolars: 999,
          goldenMolars: 999,
          rawScience: 999999,
          stackUpgrades: {
            "StackSize.Food": 20,
            "StackSize.Resource": 20,
            "StackSize.Ammo": 20,
          },
        });
        host = m.hostBytes || host;
        world = m.worldBytes || world;
        log.push("molars/science/stacks");
      } catch (e) {
        log.push("molars: " + (e.message || e));
      }
    }

    if (host && window.GroundedGear) {
      try {
        const w = window.GroundedGear.applyOneShotWeapons(host, { ngPlus: ng });
        host = w.bytes;
        log.push("weapons Mighty " + w.level + " (" + w.changed + ")");
      } catch (e) {
        log.push("weapons: " + (e.message || e));
      }
      try {
        const a = window.GroundedGear.applySleekArmor(host, { ngPlus: ng });
        host = a.bytes;
        log.push("armor Sleek " + a.level + " (" + a.changed + ")");
      } catch (e) {
        log.push("armor: " + (e.message || e));
      }
    }

    if (host && window.GroundedPerks) {
      try {
        const u = window.GroundedPerks.unlockAllMutations(host, 2);
        host = u.bytes;
        log.push("mutations " + u.changed);
      } catch (e) {
        log.push("mutations: " + (e.message || e));
      }
      try {
        const s = window.GroundedPerks.writePerksSlotUpgrade(host, 3);
        host = s.bytes;
        log.push("mutation slots 5");
      } catch (e) {
        log.push("slots: " + (e.message || e));
      }
    }

    if (host && window.GroundedProgress) {
      try {
        const a = window.GroundedProgress.completeAllAchievements(host);
        host = a.bytes;
        log.push("achievements " + a.changed);
      } catch (e) {
        log.push("achievements: " + (e.message || e));
      }
    }

    if (world && window.GroundedProgress) {
      try {
        const b = window.GroundedProgress.unlockAllBuildingsFromSave(world);
        world = b.bytes;
        log.push("buildings +" + b.added);
      } catch (e) {
        log.push("buildings: " + (e.message || e));
      }
      try {
        const p = window.GroundedProgress.unlockPurchaseCatalog(world);
        world = p.bytes;
        log.push("purchases +" + p.added);
      } catch (e) {
        log.push("purchases: " + (e.message || e));
      }
    }

    if (world && window.GroundedTech) {
      try {
        const a = window.GroundedTech.unlockAnalyzeStarter(world);
        world = a.bytes;
        log.push("analyze +" + a.added);
      } catch (e) {
        log.push("analyze: " + (e.message || e));
      }
      try {
        const c = window.GroundedTech.unlockTechChips(world);
        world = c.bytes;
        log.push("techchips +" + c.added);
      } catch (e) {
        log.push("techchips: " + (e.message || e));
      }
    }

    if (world && window.GroundedProgress) {
      try {
        const k = window.GroundedProgress.unlockAllKnowledgeCategories(world);
        world = k.bytes;
        log.push("knowledge bulk");
      } catch (e) {
        log.push("knowledge: " + (e.message || e));
      }
    }

    return { hostBytes: host, worldBytes: world, log };
  }

  function exportLoadout(hostRaw, worldRaw) {
    const out = { version: 1, exportedAt: new Date().toISOString() };
    if (hostRaw && window.GroundedPlayer) {
      try {
        out.vitals = window.GroundedPlayer.parsePlayerVitals(hostRaw);
      } catch (_) {}
      try {
        out.molars = window.GroundedPlayer.parseMolars(hostRaw, worldRaw);
      } catch (_) {}
    }
    if (hostRaw && window.GroundedGear) {
      try {
        out.gear = window.GroundedGear.parseGear(hostRaw).items.map((it) => ({
          name: it.name,
          kind: it.kind,
          region: it.region,
          level: it.level,
          enhancement: it.enhancement,
          mid: it.mid,
          durability: it.durability,
        }));
        out.doll = window.GroundedGear.parseEquipmentDoll(hostRaw).slots;
        // strip non-serializable
        if (out.doll) {
          const clean = {};
          for (const [k, v] of Object.entries(out.doll)) {
            clean[k] = v
              ? { name: v.name, kind: v.kind, level: v.level, mid: v.mid, enhancement: v.enhancement }
              : null;
          }
          out.doll = clean;
        }
      } catch (_) {}
    }
    if (hostRaw && window.GroundedPerks) {
      try {
        const p = window.GroundedPerks.parsePerkComponent(hostRaw);
        out.mutations = p.entries.map((e) => ({
          id: e.id,
          display: e.display,
          phase: e.phase,
        }));
        out.perkSlots = window.GroundedPerks.parsePerksUpgrade(hostRaw);
      } catch (_) {}
    }
    return out;
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "grounded-loadout.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.GroundedPresets = {
    applyOpPreset,
    exportLoadout,
    downloadJson,
  };
})();
