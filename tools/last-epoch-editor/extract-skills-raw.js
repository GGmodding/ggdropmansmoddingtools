/**
 * Re-extract _skills_raw.json from %TEMP%/le-skillTrees.ts including
 * node positions (transform x/y) and requirements for visual trees.
 *
 * Usage: node extract-skills-raw.js [path/to/le-skillTrees.ts]
 */
const fs = require("fs");
const path = require("path");

const src =
  process.argv[2] || path.join(process.env.TEMP || "", "le-skillTrees.ts");
const out = path.join(__dirname, "_skills_raw.json");

if (!fs.existsSync(src)) {
  console.error("Missing", src);
  process.exit(1);
}

const text = fs.readFileSync(src, "utf8");
const start = text.indexOf("export const skillTrees");
if (start < 0) {
  console.error("Could not find export const skillTrees");
  process.exit(1);
}
const eq = text.indexOf("=", start);
const body = text.slice(eq + 1);

// Match top-level tree keys: mush9: { ... nodes ... }
const treeRe = /\n  (?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_-]+)):\s*\{\s*\n\s*nodes:\s*\{/g;
const trees = [];
let m;
while ((m = treeRe.exec(body))) {
  trees.push({ id: m[1] || m[2] || m[3], index: m.index });
}

const skills = {};
const nodesOut = {};

function extractBlock(srcText, fromIdx) {
  // fromIdx points at start of "id: {"; find matching braces for the tree object
  const braceStart = srcText.indexOf("{", fromIdx);
  let depth = 0;
  for (let i = braceStart; i < srcText.length; i++) {
    const ch = srcText[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return srcText.slice(braceStart, i + 1);
    }
  }
  return null;
}

function parseNodeChunk(chunk, nid) {
  const nameM = /nodeName:\s*'((?:\\'|[^'])*)'/.exec(chunk) || /nodeName:\s*"((?:\\"|[^"])*)"/.exec(chunk);
  const maxM = /maxPoints:\s*(-?\d+)/.exec(chunk);
  const descM =
    /description:\s*'((?:\\'|[^'])*)'/.exec(chunk) ||
    /description:\s*"((?:\\"|[^"])*)"/.exec(chunk) ||
    /description:\s*`([^`]*)`/.exec(chunk);
  const xM = /transform:\s*\{[^}]*\bx:\s*(-?\d+(?:\.\d+)?)/.exec(chunk);
  const yM = /transform:\s*\{[^}]*\by:\s*(-?\d+(?:\.\d+)?)/.exec(chunk);
  // requirements array
  const reqs = [];
  const reqBlock = /requirements:\s*\[([\s\S]*?)\]/.exec(chunk);
  if (reqBlock) {
    const re = /node:\s*(\d+)[\s\S]*?requirement:\s*(\d+)/g;
    let rm;
    while ((rm = re.exec(reqBlock[1]))) {
      reqs.push({ n: Number(rm[1]), r: Number(rm[2]) });
    }
  }
  const name = nameM ? nameM[1].replace(/\\'/g, "'").replace(/\\"/g, '"') : "Node " + nid;
  let desc = descM ? descM[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, "\n") : "";
  // Truncate huge descriptions
  if (desc.length > 280) desc = desc.slice(0, 277) + "…";
  return {
    name,
    maxPoints: maxM ? Number(maxM[1]) : 0,
    description: desc,
    x: xM ? Number(xM[1]) : null,
    y: yM ? Number(yM[1]) : null,
    requirements: reqs,
  };
}

for (let ti = 0; ti < trees.length; ti++) {
  const tree = trees[ti];
  const abs = tree.index; // relative to body
  const block = extractBlock(body, abs);
  if (!block) continue;

  // Ability / name hints
  const abilityM = /ability:\s*'([^']+)'/.exec(block) || /ability:\s*"([^"]+)"/.exec(block);
  const ability = abilityM ? abilityM[1] : tree.id;

  // Prefer node 0 name as skill name
  const nodes = {};
  const nodeRe = /(?:^|\n)\s*'(\d+)':\s*\{/g;
  let nm;
  const nodeStarts = [];
  while ((nm = nodeRe.exec(block))) {
    nodeStarts.push({ id: nm[1], index: nm.index });
  }
  for (let ni = 0; ni < nodeStarts.length; ni++) {
    const ns = nodeStarts[ni];
    const next = nodeStarts[ni + 1] ? nodeStarts[ni + 1].index : block.length;
    const chunk = block.slice(ns.index, next);
    nodes[ns.id] = parseNodeChunk(chunk, ns.id);
  }

  const rootName = (nodes["0"] && nodes["0"].name) || tree.id;
  skills[tree.id] = {
    name: rootName,
    ability,
  };
  nodesOut[tree.id] = nodes;
}

const payload = { skills, nodes: nodesOut };
fs.writeFileSync(out, JSON.stringify(payload));
console.log(
  "Wrote",
  out,
  "trees",
  Object.keys(skills).length,
  "MB",
  (fs.statSync(out).size / 1024 / 1024).toFixed(2)
);

// sanity
const mush = nodesOut.mush9;
if (mush) {
  console.log(
    "mush9 node1",
    mush["1"] && { name: mush["1"].name, x: mush["1"].x, y: mush["1"].y, reqs: mush["1"].requirements }
  );
}
