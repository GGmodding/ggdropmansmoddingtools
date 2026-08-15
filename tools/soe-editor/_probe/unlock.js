const fs = require("fs");
const path = require("path");
const Save = require("../d2s.js");

const sample = process.argv[2] || path.join(process.env.USERPROFILE, "Documents", "Diablo II", "Saves", "GGminions.d2s");
const parsed = Save.parse(fs.readFileSync(sample));
console.log("before", parsed.progress.diffs.map((d) => ({
  name: d.name,
  q: d.questsDone + "/" + d.questsTotal,
  wp: d.waypoints,
  act: d.act,
  active: d.active,
})));
const result = Save.unlockProgress(parsed, { rewards: true });
console.log("gains", result);
const out = Save.write(parsed);
const again = Save.parse(out);
console.log("after", again.progress.diffs.map((d) => ({
  name: d.name,
  q: d.questsDone + "/" + d.questsTotal,
  wp: d.waypoints,
  act: d.act,
  active: d.active,
})));
console.log("verify", Save.verify(out), "skills", again.stats.newskills, "stats", again.stats.statpts, "prog", again.progression);
