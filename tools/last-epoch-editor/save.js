(() => {
  "use strict";

  const PREFIX = "EPOCH";

  function emptyPassiveTree() {
    return {
      nodeIDs: [],
      nodePoints: [],
      nodesTaken: null,
      treeID: "",
      unspentPoints: 0,
      version: 2,
    };
  }

  function parseEpochPayload(text) {
    if (typeof text !== "string") throw new Error("Save must be text.");
    const trimmed = text.replace(/^\uFEFF/, "");
    if (!trimmed.startsWith(PREFIX)) {
      throw new Error('Not a Last Epoch save (missing "EPOCH" prefix).');
    }
    const jsonPart = trimmed.slice(PREFIX.length).trim();
    let data;
    try {
      data = JSON.parse(jsonPart);
    } catch (err) {
      throw new Error("Invalid JSON after EPOCH prefix: " + (err && err.message ? err.message : err));
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Save JSON root must be an object.");
    }
    return data;
  }

  function parseSaveText(text) {
    const data = parseEpochPayload(text);
    if (typeof data.characterName !== "string") {
      throw new Error('Save is missing "characterName" — is this a character slot file?');
    }
    return data;
  }

  function detectSaveKind(data) {
    if (!data || typeof data !== "object") return "unknown";
    if (typeof data.characterName === "string") return "character";
    if (Array.isArray(data.tabsv2) || data.stashType != null || Array.isArray(data.categories)) {
      return "stash-index";
    }
    if (data.tabId != null || (Array.isArray(data.savedItems) && data.displayName != null)) {
      return "stash-tab";
    }
    return "unknown";
  }

  function serializeSave(data) {
    return PREFIX + JSON.stringify(data);
  }

  function ensureGold(data) {
    if (typeof data.gold !== "number" || Number.isNaN(data.gold)) data.gold = 0;
    return data.gold;
  }

  function ensurePassiveTree(data) {
    if (!data.savedCharacterTree || typeof data.savedCharacterTree !== "object") {
      data.savedCharacterTree = emptyPassiveTree();
    }
    const t = data.savedCharacterTree;
    if (!Array.isArray(t.nodeIDs)) t.nodeIDs = [];
    if (!Array.isArray(t.nodePoints)) t.nodePoints = [];
    if (typeof t.unspentPoints !== "number") t.unspentPoints = 0;
    return t;
  }

  function ensureSkillTrees(data) {
    if (!Array.isArray(data.savedSkillTrees)) data.savedSkillTrees = [];
    for (const t of data.savedSkillTrees) {
      if (!Array.isArray(t.nodeIDs)) t.nodeIDs = [];
      if (!Array.isArray(t.nodePoints)) t.nodePoints = [];
      if (typeof t.unspentPoints !== "number") t.unspentPoints = 0;
      if (typeof t.treeID !== "string") t.treeID = "";
    }
    return data.savedSkillTrees;
  }

  function ensureSavedItems(data) {
    if (!Array.isArray(data.savedItems)) data.savedItems = [];
    return data.savedItems;
  }

  /** Align nodePoints length to nodeIDs (pad with 0 / truncate). */
  function syncTreeArrays(tree) {
    if (!tree) return;
    if (!Array.isArray(tree.nodeIDs)) tree.nodeIDs = [];
    if (!Array.isArray(tree.nodePoints)) tree.nodePoints = [];
    while (tree.nodePoints.length < tree.nodeIDs.length) tree.nodePoints.push(0);
    if (tree.nodePoints.length > tree.nodeIDs.length) {
      tree.nodePoints.length = tree.nodeIDs.length;
    }
  }

  function spentTreePoints(tree) {
    syncTreeArrays(tree);
    let sum = 0;
    for (const p of tree.nodePoints) sum += Number(p) || 0;
    return sum;
  }

  /**
   * Passive points granted by character level (first at 3 → 98 by 100).
   * Campaign/side quests can add more (~15); those are not modeled here.
   */
  function passivePointsFromLevel(level) {
    const lv = Math.max(1, Math.min(100, Number(level) || 1));
    return Math.max(0, lv - 2);
  }

  /**
   * Clear allocated nodes. For skill trees, adds freed points to unspentPoints.
   * For passives (gameRecalc), leave unspent at 0 — the game recomputes
   * unspent from level + quests − spent on load and ignores the save field.
   */
  function dumpTreePointsToUnspent(tree, opts) {
    syncTreeArrays(tree);
    let sum = 0;
    for (const p of tree.nodePoints) sum += Number(p) || 0;
    tree.nodeIDs = [];
    tree.nodePoints = [];
    if (opts && opts.gameRecalc) {
      tree.unspentPoints = 0;
    } else {
      tree.unspentPoints = (Number(tree.unspentPoints) || 0) + sum;
    }
    return sum;
  }

  function setAllNodePoints(tree, value) {
    syncTreeArrays(tree);
    const v = Math.max(0, Number(value) || 0);
    for (let i = 0; i < tree.nodePoints.length; i++) tree.nodePoints[i] = v;
  }

  function listCurrencyItems(data) {
    const items = ensureSavedItems(data);
    const out = [];
    items.forEach((item, index) => {
      if (window.LEData.isLikelyCurrency(item)) {
        out.push({ index, item });
      }
    });
    return out;
  }

  function cloneItem(item) {
    return JSON.parse(JSON.stringify(item));
  }

  function duplicateSavedItem(data, index) {
    const items = ensureSavedItems(data);
    if (index < 0 || index >= items.length) return -1;
    const copy = cloneItem(items[index]);
    if (!copy.inventoryPosition || typeof copy.inventoryPosition !== "object") {
      copy.inventoryPosition = { x: 0, y: 0 };
    } else {
      copy.inventoryPosition = {
        x: Number(copy.inventoryPosition.x) || 0,
        y: (Number(copy.inventoryPosition.y) || 0) + 1,
      };
    }
    items.push(copy);
    return items.length - 1;
  }

  function deleteSavedItems(data, indices) {
    const items = ensureSavedItems(data);
    const remove = new Set((indices || []).map(Number).filter((i) => i >= 0));
    if (!remove.size) return 0;
    const kept = [];
    for (let i = 0; i < items.length; i++) {
      if (!remove.has(i)) kept.push(items[i]);
    }
    const n = items.length - kept.length;
    data.savedItems = kept;
    return n;
  }

  function moveSavedItemsToInventory(data, indices) {
    const items = ensureSavedItems(data);
    let n = 0;
    for (const idx of indices || []) {
      const item = items[Number(idx)];
      if (!item) continue;
      item.containerID = 1;
      if (!item.inventoryPosition || typeof item.inventoryPosition !== "object") {
        item.inventoryPosition = { x: 0, y: 0 };
      }
      n += 1;
    }
    return n;
  }

  function ensureWaypoints(data) {
    if (!Array.isArray(data.unlockedWaypointScenes)) data.unlockedWaypointScenes = [];
    return data.unlockedWaypointScenes;
  }

  function ensureQuests(data) {
    if (!Array.isArray(data.savedQuests)) data.savedQuests = [];
    return data.savedQuests;
  }

  function ensureOneTimeEvents(data) {
    if (!Array.isArray(data.oneTimeEvents)) data.oneTimeEvents = [];
    return data.oneTimeEvents;
  }

  function unlockWaypoints(data, sceneIds) {
    const list = ensureWaypoints(data);
    const set = new Set(list);
    let added = 0;
    for (const id of sceneIds || []) {
      if (!id || set.has(id)) continue;
      set.add(id);
      list.push(id);
      added += 1;
    }
    data.unlockedWaypointScenes = list;
    return added;
  }

  function setWaypoints(data, sceneIds) {
    const unique = [];
    const set = new Set();
    for (const id of sceneIds || []) {
      if (!id || set.has(id)) continue;
      set.add(id);
      unique.push(id);
    }
    data.unlockedWaypointScenes = unique;
    return unique.length;
  }

  function unlockAllKnownWaypoints(data) {
    const ids = (window.LEProgress && window.LEProgress.WAYPOINTS) || [];
    return unlockWaypoints(data, ids);
  }

  /**
   * Unlock the Epoch mastery selection (all three mastery passive trees).
   * Does not force a chosenMastery — pick one in the Character panel if needed.
   * Mastery IDs in saves are 1..3 (0 = none).
   */
  function unlockMasteries(data) {
    if (!data || typeof data !== "object") return { ok: false };
    data.clickedUnlockMasteriesButton = true;

    const events = ensureOneTimeEvents(data);
    let eventsAdded = 0;
    if (!events.includes("EpochMasteryUnlock")) {
      events.push("EpochMasteryUnlock");
      eventsAdded = 1;
    }
    data.oneTimeEvents = events;

    const waypointsAdded = unlockWaypoints(data, ["Mastery"]);
    const restored = restoreMasteryChoice(data);

    return { ok: true, eventsAdded, waypointsAdded, restored };
  }

  /**
   * Keep / restore ascended mastery so gear presets don't force Gaspar again.
   * Saves use chosenMastery 1..3; 0 means unset. originalMastery remembers the last pick.
   */
  function restoreMasteryChoice(data) {
    if (!data || typeof data !== "object") return false;
    let chosen = Number(data.chosenMastery);
    let original = Number(data.originalMastery);
    if (!Number.isFinite(chosen) || chosen < 0) chosen = 0;
    if (!Number.isFinite(original) || original < 0) original = 0;

    let restored = false;
    if (chosen < 1 && original >= 1 && original <= 3) {
      data.chosenMastery = original;
      chosen = original;
      restored = true;
    }
    if (chosen >= 1 && chosen <= 3) {
      data.originalMastery = chosen;
      data.clickedUnlockMasteriesButton = true;
    }
    unlockWaypoints(data, ["Mastery"]);
    const events = ensureOneTimeEvents(data);
    if (!events.includes("EpochMasteryUnlock")) {
      events.push("EpochMasteryUnlock");
      data.oneTimeEvents = events;
    }
    return restored;
  }

  function applyCampaignQuests(data) {
    const template = (window.LEProgress && window.LEProgress.CAMPAIGN_QUESTS) || [];
    if (!template.length) return 0;
    const byId = new Map();
    for (const q of ensureQuests(data)) {
      if (q && q.questID != null) byId.set(Number(q.questID), q);
    }
    let n = 0;
    for (const t of template) {
      const copy = JSON.parse(JSON.stringify(t));
      byId.set(Number(copy.questID), copy);
      n += 1;
    }
    data.savedQuests = [...byId.values()].sort((a, b) => Number(a.questID) - Number(b.questID));
    return n;
  }

  function mergeCampaignFlags(data) {
    data.portalUnlocked = true;
    data.reachedTown = true;
    if (data.focusedQuest == null) data.focusedQuest = -1;

    const events = ensureOneTimeEvents(data);
    const set = new Set(events);
    let added = 0;
    const oneTime = (window.LEProgress && window.LEProgress.CAMPAIGN_ONE_TIME) || [];
    for (const ev of oneTime) {
      if (!ev || set.has(ev)) continue;
      set.add(ev);
      events.push(ev);
      added += 1;
    }
    data.oneTimeEvents = events;

    const timeline =
      window.LEProgress && Array.isArray(window.LEProgress.CAMPAIGN_TIMELINE_UNLOCKS)
        ? window.LEProgress.CAMPAIGN_TIMELINE_UNLOCKS
        : [];
    if (
      timeline.length &&
      (!Array.isArray(data.timelineDifficultyUnlocks) || !data.timelineDifficultyUnlocks.length)
    ) {
      data.timelineDifficultyUnlocks = JSON.parse(JSON.stringify(timeline));
    }
    return added;
  }

  window.LESave = {
    PREFIX,
    parseEpochPayload,
    parseSaveText,
    detectSaveKind,
    serializeSave,
    ensureGold,
    ensurePassiveTree,
    ensureSkillTrees,
    ensureSavedItems,
    syncTreeArrays,
    spentTreePoints,
    passivePointsFromLevel,
    dumpTreePointsToUnspent,
    setAllNodePoints,
    listCurrencyItems,
    cloneItem,
    duplicateSavedItem,
    deleteSavedItems,
    moveSavedItemsToInventory,
    ensureWaypoints,
    ensureQuests,
    ensureOneTimeEvents,
    unlockWaypoints,
    setWaypoints,
    unlockAllKnownWaypoints,
    unlockMasteries,
    restoreMasteryChoice,
    applyCampaignQuests,
    mergeCampaignFlags,
    emptyPassiveTree,
  };
})();
