/**
 * Builds skills-db.js from datamined skillTrees + optional sprite map.
 * Usage: node build-skills-db.js [sprites.json]
 */
const fs = require("fs");
const path = require("path");

const root = __dirname;
const rawPath = path.join(root, "_skills_raw.json");
const outPath = path.join(root, "skills-db.js");

if (!fs.existsSync(rawPath)) {
  console.error("Missing _skills_raw.json — run skillTrees extract first");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
let sprites = {};
let nodeIcons = {};

const spriteArg = process.argv[2];
if (spriteArg && fs.existsSync(spriteArg)) {
  const s = JSON.parse(fs.readFileSync(spriteArg, "utf8"));
  sprites = s.sprites || s;
  nodeIcons = s.nodeIcons || {};
}

const skills = {};
for (const [id, meta] of Object.entries(raw.skills)) {
  const nodes = raw.nodes[id] || {};
  const compactNodes = {};
  for (const [nid, node] of Object.entries(nodes)) {
    compactNodes[nid] = {
      n: node.name,
      m: node.maxPoints,
      d: node.description || "",
    };
    if (node.x != null && Number.isFinite(Number(node.x))) compactNodes[nid].x = Number(node.x);
    if (node.y != null && Number.isFinite(Number(node.y))) compactNodes[nid].y = Number(node.y);
    if (Array.isArray(node.requirements) && node.requirements.length) {
      compactNodes[nid].r = node.requirements.map((req) => ({
        n: Number(req.n != null ? req.n : req.node),
        r: Number(req.r != null ? req.r : req.requirement) || 0,
      }));
    }
    if (nodeIcons[id] && nodeIcons[id][nid]) {
      compactNodes[nid].i = nodeIcons[id][nid];
    }
  }
  skills[id] = {
    name: meta.name,
    ability: meta.ability || id,
    sprite: sprites[id] || null,
    nodes: compactNodes,
  };
}

const payload = JSON.stringify(skills);
const file = `(() => {
  "use strict";
  const SKILLS = ${payload};

  function spriteToIconClass(sprite) {
    if (!sprite || typeof sprite !== "string") return null;
    // a-r-204 -> icons-r-204
    if (sprite.startsWith("a-r-")) return "icons icons-" + sprite.slice(2);
    if (sprite.startsWith("r-")) return "icons icons-" + sprite;
    return null;
  }

  function getSkill(id) {
    if (!id) return null;
    return SKILLS[id] || null;
  }

  function skillName(id) {
    const s = getSkill(id);
    return (s && s.name) || id || "Unknown skill";
  }

  function nodeMeta(treeId, nodeId) {
    const s = getSkill(treeId);
    if (!s || !s.nodes) return null;
    return s.nodes[String(nodeId)] || null;
  }

  function nodeName(treeId, nodeId) {
    const n = nodeMeta(treeId, nodeId);
    return (n && n.n) || ("Node " + nodeId);
  }

  function nodeMaxPoints(treeId, nodeId) {
    const n = nodeMeta(treeId, nodeId);
    if (!n || n.m == null) return null;
    return n.m;
  }

  function skillIconClass(id) {
    const s = getSkill(id);
    return spriteToIconClass(s && s.sprite);
  }

  function nodeIconClass(treeId, nodeId) {
    const n = nodeMeta(treeId, nodeId);
    if (n && n.i) return spriteToIconClass(n.i);
    // fallback: skill root icon
    return skillIconClass(treeId);
  }

  function allSkillOptions() {
    return Object.keys(SKILLS)
      .map((id) => ({ id, name: SKILLS[id].name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function isPassiveTreeId(id) {
    return /^(pr|mg|rg|ac|kn|se|sn)-\\d+$/i.test(String(id || ""));
  }

  /** characterClass id -> passive tree id in skills DB */
  const PASSIVE_TREE_BY_CLASS = {
    0: "mg-1", // Mage
    1: "pr-1", // Primalist
    2: "kn-1", // Sentinel
    3: "ac-1", // Acolyte
    4: "rg-1", // Rogue
  };

  function passiveTreeIdForClass(classId) {
    return PASSIVE_TREE_BY_CLASS[Number(classId)] || null;
  }

  function nodeRequirements(treeId, nodeId) {
    const n = nodeMeta(treeId, nodeId);
    return (n && Array.isArray(n.r) ? n.r : []) || [];
  }

  function nodePosition(treeId, nodeId) {
    const n = nodeMeta(treeId, nodeId);
    if (!n || n.x == null || n.y == null) return null;
    return { x: Number(n.x), y: Number(n.y) };
  }

  function treeHasLayout(treeId) {
    const s = getSkill(treeId);
    if (!s || !s.nodes) return false;
    return Object.values(s.nodes).some((n) => n && n.x != null && n.y != null);
  }

  window.LESkills = {
    SKILLS,
    PASSIVE_TREE_BY_CLASS,
    getSkill,
    skillName,
    nodeMeta,
    nodeName,
    nodeMaxPoints,
    nodeRequirements,
    nodePosition,
    treeHasLayout,
    skillIconClass,
    nodeIconClass,
    spriteToIconClass,
    allSkillOptions,
    isPassiveTreeId,
    passiveTreeIdForClass,
  };
})();
`;

fs.writeFileSync(outPath, file);
console.log("Wrote", outPath, "skills:", Object.keys(skills).length, "bytes:", file.length);
