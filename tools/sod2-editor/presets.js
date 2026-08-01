(() => {
  "use strict";

  /**
   * One-click multi-tab presets for the SoD2 editor.
   * Each preset returns a short result summary string for the status bar.
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before presets.js");

  const STOCKPILE_IDS = ["food", "meds", "ammo", "materials", "fuel", "parts"];
  const THREAT_IDS = ["plagueHearts", "infestationsToday"];

  function ensure(save) {
    try {
      if (S.discoverCommunityFields) S.discoverCommunityFields(save);
    } catch (_) {}
    try {
      if (S.discoverSurvivors) S.discoverSurvivors(save);
    } catch (_) {}
    try {
      if (S.discoverEnclaves) S.discoverEnclaves(save);
    } catch (_) {}
    try {
      if (S.discoverInventories) S.discoverInventories(save);
    } catch (_) {}
    try {
      if (S.discoverMapQuest) S.discoverMapQuest(save);
    } catch (_) {}
    try {
      if (S.discoverVehicles) S.discoverVehicles(save);
    } catch (_) {}
    try {
      if (S.discoverFacilities) S.discoverFacilities(save);
    } catch (_) {}
  }

  function setIf(save, id, value) {
    try {
      if (save.fields && save.fields[id] && save.fields[id].available) {
        S.setFieldValue(save, id, value);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function fillStockpile(save, amount) {
    let n = 0;
    for (const id of STOCKPILE_IDS) if (setIf(save, id, amount)) n++;
    if (setIf(save, "prestige", Math.max(amount, 999))) n++;
    return n;
  }

  function zeroThreats(save) {
    let n = 0;
    for (const id of THREAT_IDS) if (setIf(save, id, 0)) n++;
    return n;
  }

  const PRESETS = [
    {
      id: "god-community",
      title: "God community",
      blurb: "Influence 9999, stockpile 999, prestige up, threats cleared, time → midday.",
      apply(save) {
        ensure(save);
        const bits = [];
        if (setIf(save, "influence", 9999)) bits.push("influence");
        bits.push(fillStockpile(save, 999) + " stockpile fields");
        bits.push(zeroThreats(save) + " threats cleared");
        if (setIf(save, "timeOfDay", 720)) bits.push("midday");
        if (S.bulkSetEnclaveInfluence) {
          try {
            bits.push("enclave infl ×" + S.bulkSetEnclaveInfluence(save, 9999));
          } catch (_) {}
        }
        return bits.join(" · ");
      },
    },
    {
      id: "heal-roster",
      title: "Heal all survivors",
      blurb: "Full health/stamina and clear fatigue, sickness, plague timer, trauma, addictions.",
      apply(save) {
        ensure(save);
        const n = S.healAllSurvivors ? S.healAllSurvivors(save) : 0;
        return "healed " + n + " survivors";
      },
    },
    {
      id: "hero-roster",
      title: "Promote all to Hero",
      blurb: "Standing → Hero and standing progress filled where present.",
      apply(save) {
        ensure(save);
        const n = S.promoteAllToHero ? S.promoteAllToHero(save) : 0;
        return "promoted " + n + " survivors";
      },
    },
    {
      id: "max-skills",
      title: "Max all skills",
      blurb: "Every survivor’s skills → level 7.",
      apply(save) {
        ensure(save);
        let n = 0;
        if (!S.maxAllSkills || !save.survivors) return "no skills API";
        for (let i = 0; i < save.survivors.length; i++) {
          try {
            S.maxAllSkills(save, i);
            n++;
          } catch (_) {}
        }
        return "maxed skills on " + n + " survivors";
      },
    },
    {
      id: "garage-day",
      title: "Garage day",
      blurb: "Repair + refuel every vehicle and reveal them on the map.",
      apply(save) {
        ensure(save);
        const bits = [];
        if (S.repairAllVehicles) bits.push("repaired " + S.repairAllVehicles(save));
        if (S.revealAllVehicles) bits.push("revealed " + S.revealAllVehicles(save));
        return bits.join(" · ") || "no vehicles";
      },
    },
    {
      id: "open-map",
      title: "Open the map",
      blurb: "All map sites Advanced, vehicles revealed, radio cooldowns reset, charges 99.",
      apply(save) {
        ensure(save);
        const bits = [];
        if (S.revealAllMapSites) bits.push("sites " + S.revealAllMapSites(save));
        if (S.revealAllVehicles) bits.push("vehicles " + S.revealAllVehicles(save));
        if (S.resetRadioCooldowns) bits.push("radio cd " + S.resetRadioCooldowns(save));
        if (S.setAllRadioCharges) bits.push("charges " + S.setAllRadioCharges(save, 99));
        return bits.join(" · ") || "nothing mapped";
      },
    },
    {
      id: "base-ready",
      title: "Base ready",
      blurb: "All current facility slots → Completed / repaired.",
      apply(save) {
        ensure(save);
        const n = S.repairAllFacilities ? S.repairAllFacilities(save) : 0;
        return "repaired " + n + " facility slots";
      },
    },
    {
      id: "locker-polish",
      title: "Polish lockers",
      blurb: "Max stacks to 999 and repair weapons to 9999 in every ItemLibrary.",
      apply(save) {
        ensure(save);
        let stacks = 0;
        let guns = 0;
        const lockers = save.inventories || [];
        for (let i = 0; i < lockers.length; i++) {
          try {
            if (S.maxAllInventoryStacks) stacks += S.maxAllInventoryStacks(save, i, 999) || 0;
          } catch (_) {}
          try {
            if (S.repairAllInventoryWeapons) guns += S.repairAllInventoryWeapons(save, i, 9999) || 0;
          } catch (_) {}
        }
        return "stacks×" + stacks + " · weapons×" + guns;
      },
    },
    {
      id: "friendly-enclaves",
      title: "Friendly enclaves",
      blurb: "All enclave influence 9999, show on map, normal trade, keep-alive, show recruit.",
      apply(save) {
        ensure(save);
        const bits = [];
        if (S.bulkSetEnclaveInfluence) bits.push("infl " + S.bulkSetEnclaveInfluence(save, 9999));
        if (S.bulkSetEnclaveBools) {
          try {
            bits.push("flags " + S.bulkSetEnclaveBools(save, {
              displayOnMap: true,
              tradesPrestige: false,
              disbandsOnRecruit: false,
              hideRecruitability: false,
            }));
          } catch (_) {}
        }
        return bits.join(" · ") || "no enclaves";
      },
    },
    {
      id: "full-comfort",
      title: "Full comfort (kitchen sink)",
      blurb: "God community + heal + heroes + garage + open map + base ready + locker polish + friendly enclaves.",
      apply(save) {
        ensure(save);
        const parts = [];
        for (const id of [
          "god-community",
          "heal-roster",
          "hero-roster",
          "garage-day",
          "open-map",
          "base-ready",
          "locker-polish",
          "friendly-enclaves",
        ]) {
          const p = PRESETS.find((x) => x.id === id);
          if (!p) continue;
          try {
            parts.push(p.title + ": " + p.apply(save));
          } catch (err) {
            parts.push(p.title + ": " + (err.message || String(err)));
          }
        }
        return parts.join(" | ");
      },
    },
  ];

  function applyPreset(save, presetId) {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) throw new Error("Unknown preset: " + presetId);
    ensure(save);
    const summary = preset.apply(save);
    save.dirty = true;
    return { id: preset.id, title: preset.title, summary };
  }

  S.EDITOR_PRESETS = PRESETS;
  S.applyEditorPreset = applyPreset;
})();
