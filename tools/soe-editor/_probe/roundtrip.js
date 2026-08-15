const fs = require("fs");
const path = require("path");
const Save = require("../d2s.js");

const sample = process.argv[2] || path.join(process.env.USERPROFILE, "Documents", "Diablo II", "Saves", "GGminions.d2s");
const buf = fs.readFileSync(sample);
const bytes = new Uint8Array(buf);
console.log("file", sample, "len", bytes.length, "verify", Save.verify(bytes));
const parsed = Save.parse(bytes);
console.log(JSON.stringify({
  name: parsed.name,
  className: parsed.className,
  classId: parsed.classId,
  hardcore: parsed.hardcore,
  stats: parsed.stats,
  present: parsed.present,
  skillsSum: parsed.skills.reduce((a, b) => a + b, 0),
  gfOff: parsed.gfOff,
  ifOff: parsed.ifOff,
  jmOff: parsed.jmOff,
  midPad: Array.from(parsed.midPad),
}, null, 2));

const written = Save.write(parsed);
console.log("rewrite len", written.length, "verify", Save.verify(written), "same", written.length === bytes.length);

parsed.stats.newskills = 20;
parsed.stats.statpts = 50;
parsed.stats.strength = 100;
parsed.skills[0] = 5;
const edited = Save.write(parsed);
const again = Save.parse(edited);
console.log("edited verify", Save.verify(edited), "str", again.stats.strength, "pts", again.stats.statpts, "skills0", again.skills[0], "newskills", again.stats.newskills, "name", again.name);
