(() => {
  "use strict";

  const TIMELINES = [
    { id: 1, name: "Fall of the Outcasts", level: 62 },
    { id: 2, name: "The Stolen Lance", level: 66 },
    { id: 3, name: "The Black Sun", level: 70 },
    { id: 4, name: "Blood, Frost, and Death", level: 74 },
    { id: 5, name: "Ending the Storm", level: 78 },
    { id: 6, name: "Fall of the Empire", level: 82 },
    { id: 7, name: "Reign of Dragons", level: 85 },
    { id: 8, name: "The Last Ruin", level: 90 },
    { id: 9, name: "The Age of Winter", level: 90 },
    { id: 10, name: "Spirits of Fire", level: 90 },
  ];

  /** Known faction IDs from offline saves */
  const FACTIONS = [
    { id: 1, name: "Merchant's Guild" },
    { id: 2, name: "Circle of Fortune" },
    { id: 3, name: "Circle of Fortune (alt id)" },
  ];

  const IDOL_CONTAINERS = [
    { id: 29, label: "Idol panel" },
    { id: 32, label: "Idols" },
  ];
  /** @deprecated use IDOL_CONTAINERS — kept for older callers */
  const IDOL_CONTAINER = 32;
  const BLESSING_CONTAINERS = [
    { id: 82, label: "Blessing 1" },
    { id: 83, label: "Blessing 2" },
    { id: 84, label: "Blessing 3" },
    { id: 85, label: "Blessing 4" },
  ];
  /** Extra blessing-ish containers seen on some chars */
  const BLESSING_EXTRA = [
    { id: 33, label: "Blessing / Extra 33" },
    { id: 34, label: "Blessing / Extra 34" },
    { id: 35, label: "Blessing / Extra 35" },
  ];

  const ARENA_TIERS = 20;
  const DUNGEON_IDS = [
    { id: 0, name: "Lightless Arbor" },
    { id: 1, name: "Soulfire Bastion" },
    { id: 2, name: "Temporal Sanctum" },
  ];

  function timelineName(id) {
    const t = TIMELINES.find((x) => x.id === Number(id));
    return t ? t.name : "Timeline " + id;
  }

  function factionName(id) {
    const f = FACTIONS.find((x) => x.id === Number(id));
    return f ? f.name : "Faction " + id;
  }

  function emptyFaction(id) {
    return {
      id: Number(id),
      isMember: true,
      hasEverJoined: true,
      rank: 1,
      reputation: 0,
      favor: 0,
      factionSpecific: {},
    };
  }

  function ensureTimelineEntry(list, timelineId) {
    let row = list.find((r) => Number(r.timelineID) === Number(timelineId));
    if (!row) {
      row = { timelineID: Number(timelineId), progress: [0] };
      list.push(row);
    }
    if (!Array.isArray(row.progress)) row.progress = [0];
    return row;
  }

  window.LEEndgame = {
    TIMELINES,
    FACTIONS,
    IDOL_CONTAINER,
    IDOL_CONTAINERS,
    BLESSING_CONTAINERS,
    BLESSING_EXTRA,
    ARENA_TIERS,
    DUNGEON_IDS,
    timelineName,
    factionName,
    emptyFaction,
    ensureTimelineEntry,
  };
})();
