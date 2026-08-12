"use strict";
const fs = require("fs");
const j = require("./DT_PictosDefinitions.json");
const rows = j[0].Rows;
const keys = Object.keys(rows);
console.log("rows", keys.length);
fs.writeFileSync(__dirname + "/picto-ids.txt", keys.join("\n"));
console.log(keys.slice(0, 20).join(", "), "...");

const t = fs.readFileSync(
  "C:/Users/Owner/.cursor/projects/c-Users-Owner-Downloads-ggdropmansmoddingtools/agent-tools/8c84b4ec-27e8-4da9-8a3a-1b02ca03abc5.txt",
  "utf8"
);
const paths = [...t.matchAll(/"path":"([^"]*[Pp]icto[^"]*)"/g)].map((m) => m[1]);
console.log("picto paths:\n" + paths.join("\n"));
const src = [...t.matchAll(/"path":"(src\/[^"]+)"/g)]
  .map((m) => m[1])
  .filter((p) => /pict|item|inventory|save/i.test(p));
console.log("src:\n" + src.join("\n"));
