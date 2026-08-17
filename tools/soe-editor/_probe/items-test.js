const fs = require("fs");
const path = require("path");
const Save = require("../d2s.js");
const Items = require("../items.js");

const charPath = process.argv[2] || path.join(process.env.USERPROFILE, "Documents", "Diablo II", "Saves", "GGminions.d2s");
const stashPath = process.argv[3] || path.join(process.env.USERPROFILE, "Documents", "Diablo II", "Saves", "pd2_shared.stash");
const pd2Stash = path.join(process.env.USERPROFILE, "Documents", "Diablo II", "Saves-PD2-backup", "pd2_shared.stash");

function summarize(items) {
  return items.map((it) => ({
    name: Items.displayName(it),
    code: it.code,
    loc: it.location,
    panel: it.panel,
    x: it.x,
    y: it.y,
    eq: it.equipped,
    q: it.quantity,
    raw: it.raw.length,
  }));
}

const raw = fs.readFileSync(charPath);
const parsed = Save.parse(raw);
console.log("char", parsed.name, "itemsError", parsed.itemsError || "none", "player", parsed.items && parsed.items.player.length, "tail", parsed.items && parsed.items.pd2Tail.length);
if (parsed.itemsError) process.exit(1);
console.log(summarize(parsed.items.player));
const written = Save.write(parsed);
const again = Save.parse(written);
if (again.stats.experience !== parsed.stats.experience) {
  console.log("FAIL experience roundtrip", parsed.stats.experience, "->", again.stats.experience);
  process.exitCode = 1;
} else {
  console.log("ok experience roundtrip", again.stats.experience);
}
console.log("char rewrite", written.length, raw.length, "same", Buffer.from(written).equals(raw), "verify", Save.verify(written));

const hp = Items.spawnSimple("r33", { location: 0, panel: 1, x: 0, y: 0 });
console.log("spawn zod", Items.displayName(hp), hp.raw.length, hp.code, hp.simple);

const stash = Items.parseStash(fs.readFileSync(stashPath));
console.log("soe stash", stash.items.length);
const stashOut = Items.writeStash(stash);
console.log("soe stash rewrite", stashOut.length, fs.statSync(stashPath).size, "same", Buffer.from(stashOut).equals(fs.readFileSync(stashPath)));

if (fs.existsSync(pd2Stash)) {
  try {
    const p = Items.parseStash(fs.readFileSync(pd2Stash));
    console.log("pd2 stash", p.items.length, summarize(p.items).slice(0, 5));
    const out = Items.writeStash(p);
    console.log("pd2 rewrite", out.length, fs.statSync(pd2Stash).size, "same", Buffer.from(out).equals(fs.readFileSync(pd2Stash)), "verify", Items.d2Checksum(out) === require("../d2s.js").checksum(out));
  } catch (err) {
    console.log("pd2 stash FAIL", err.message);
  }
}

function check(name, ok, extra) {
  console.log(ok ? "ok" : "FAIL", name, extra || "");
  if (!ok) process.exitCode = 1;
}

const wp = Save.listWaypoints(parsed.bytes, 0);
check("waypoint list 39", wp.length === 39, wp.length);
Save.setAllWaypoints(parsed.bytes, 0, true);
check("all waypoints on", Save.listWaypoints(parsed.bytes, 0).every((w) => w.on), Save.listWaypoints(parsed.bytes, 0).filter((w) => w.on).length);
Save.setWaypoint(parsed.bytes, 0, 0, false);
check("toggle rogue camp off", !Save.listWaypoints(parsed.bytes, 0)[0].on);
Save.setQuestDone(parsed.bytes, 0, 2, true);
check("set den done", Save.summarizeProgress(parsed.bytes).diffs[0].quests[0].done);
Save.setNpcIntroduced(parsed.bytes, true);
check("npc intro", Save.npcIntroduced(parsed.bytes));
parsed.ladder = true;
parsed.died = false;
const withFlags = Save.write(parsed);
const againFlags = Save.parse(withFlags);
check("ladder survives write", againFlags.ladder && againFlags.expansion && !againFlags.died, JSON.stringify({ ladder: againFlags.ladder, exp: againFlags.expansion, died: againFlags.died, hc: againFlags.hardcore }));
Save.hireDefaultMerc(parsed);
check("hire merc", parsed.merc && parsed.merc.typeId === 4 && parsed.items.hasMerc, JSON.stringify(parsed.merc));
const withMerc = Save.write(parsed);
const againMerc = Save.parse(withMerc);
check("merc header roundtrip", againMerc.merc.typeId === 4 && againMerc.merc.nameId === 0, JSON.stringify(againMerc.merc));
