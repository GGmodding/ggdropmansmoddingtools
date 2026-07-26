/**
 * Build progress-db.js: scene/waypoint catalog + campaign quest template.
 *
 * Usage:
 *   node build-progress-db.js [path/to/le-db.js] [path/to/_campaign_progress.json]
 *
 * Campaign template is extracted from a fully-progressed offline character save
 * (savedQuests + unlockedWaypointScenes). Waypoint candidates also come from
 * LET sceneList (non-monolith type 0/3 scenes).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const out = path.join(__dirname, "progress-db.js");
const leDbPath = process.argv[2] || path.join(process.env.TEMP || "", "le-db.js");
const campaignPath =
  process.argv[3] || path.join(__dirname, "_campaign_progress.json");

const ERA_NAMES = {
  0: "Era 0",
  1: "Era 1",
  2: "Era 2",
  3: "Era 3",
  4: "Era 4",
};

const HUBS = [
  "EoT",
  "MonolithHub",
  "WeaversHub",
  "Bazaar",
  "Observatory",
  "Mastery",
  "Graveyard",
];

function loadScenes() {
  if (!fs.existsSync(leDbPath)) {
    console.warn("No LET db at", leDbPath);
    return {};
  }
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(leDbPath, "utf8"), sandbox, { timeout: 30000 });
  return (sandbox.window.itemDB && sandbox.window.itemDB.sceneList) || {};
}

function loadCampaign() {
  if (!fs.existsSync(campaignPath)) {
    console.warn("No campaign template at", campaignPath);
    return null;
  }
  return JSON.parse(fs.readFileSync(campaignPath, "utf8"));
}

function isWaypointCandidate(id, sc) {
  if (!id || !sc) return false;
  if (id.startsWith("M_") || id.startsWith("R1") || id.startsWith("PCG_")) return false;
  if (id === "Neutral" || id === "PersistentUI") return false;
  if (HUBS.includes(id)) return true;
  if (id.startsWith("Arena_")) return true;
  return sc.type === 0 || sc.type === 3;
}

function main() {
  const sceneList = loadScenes();
  const campaign = loadCampaign();
  const scenes = {};
  const waypointIds = new Set();

  for (const [id, sc] of Object.entries(sceneList)) {
    scenes[id] = {
      era: sc.era != null ? Number(sc.era) : null,
      lvl: Number(sc.level) || 0,
      t: Number(sc.type) || 0,
    };
    if (isWaypointCandidate(id, sc)) waypointIds.add(id);
  }

  if (campaign && Array.isArray(campaign.unlockedWaypointScenes)) {
    for (const id of campaign.unlockedWaypointScenes) {
      if (id && id !== "PersistentUI") waypointIds.add(id);
      if (!scenes[id]) scenes[id] = { era: null, lvl: 0, t: 0 };
    }
  }

  for (const id of HUBS) {
    waypointIds.add(id);
    if (!scenes[id]) scenes[id] = { era: null, lvl: 0, t: 0 };
  }

  const waypoints = [...waypointIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const quests = (campaign && Array.isArray(campaign.savedQuests) ? campaign.savedQuests : []).map((q) => ({
    questID: Number(q.questID),
    questStepID: Number(q.questStepID) || 0,
    state: Number(q.state) || 0,
    questBranch: Number(q.questBranch) || 0,
    completeObjectives: Array.isArray(q.completeObjectives) ? q.completeObjectives.map(Number) : [],
    failedObjectives: Array.isArray(q.failedObjectives) ? q.failedObjectives.map(Number) : [],
    nolongerRelevantObjectives: Array.isArray(q.nolongerRelevantObjectives)
      ? q.nolongerRelevantObjectives.map(Number)
      : [],
    objectiveProgress: Array.isArray(q.objectiveProgress) ? q.objectiveProgress : [],
    trackStatus: Number(q.trackStatus) || 0,
  }));

  const oneTimeEvents = (campaign && Array.isArray(campaign.oneTimeEvents) ? campaign.oneTimeEvents : []).slice();
  const timelineDifficultyUnlocks =
    campaign && Array.isArray(campaign.timelineDifficultyUnlocks)
      ? campaign.timelineDifficultyUnlocks
      : [];

  const body = `(() => {
  "use strict";
  const SCENES = ${JSON.stringify(scenes)};
  const WAYPOINTS = ${JSON.stringify(waypoints)};
  const HUBS = ${JSON.stringify(HUBS)};
  const ERA_NAMES = ${JSON.stringify(ERA_NAMES)};
  const CAMPAIGN_QUESTS = ${JSON.stringify(quests)};
  const CAMPAIGN_ONE_TIME = ${JSON.stringify(oneTimeEvents)};
  const CAMPAIGN_TIMELINE_UNLOCKS = ${JSON.stringify(timelineDifficultyUnlocks)};

  function sceneName(id) {
    const sc = SCENES[id];
    if (!sc) return id;
    const era = sc.era != null && ERA_NAMES[sc.era] ? ERA_NAMES[sc.era] + " · " : "";
    return era + id + (sc.lvl ? " (lv " + sc.lvl + ")" : "");
  }

  function listWaypoints(opts) {
    const q = ((opts && opts.q) || "").toLowerCase();
    const unlocked = new Set((opts && opts.unlocked) || []);
    return WAYPOINTS.filter((id) => {
      if (!q) return true;
      return (id + " " + sceneName(id)).toLowerCase().includes(q);
    }).map((id) => ({
      id,
      name: sceneName(id),
      unlocked: unlocked.has(id),
      ...(SCENES[id] || {}),
    }));
  }

  window.LEProgress = {
    SCENES,
    WAYPOINTS,
    HUBS,
    ERA_NAMES,
    CAMPAIGN_QUESTS,
    CAMPAIGN_ONE_TIME,
    CAMPAIGN_TIMELINE_UNLOCKS,
    sceneName,
    listWaypoints,
  };
})();
`;

  fs.writeFileSync(out, body);
  console.log(
    "Wrote",
    out,
    "waypoints",
    waypoints.length,
    "scenes",
    Object.keys(scenes).length,
    "campaign quests",
    quests.length,
    "KB",
    Math.round(body.length / 1024)
  );
}

main();
