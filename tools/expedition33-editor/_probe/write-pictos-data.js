"use strict";
const fs = require("fs");
const j = require("../picto-ids.json");
const src =
  "(() => {\n  \"use strict\";\n  window.E33PictoIds = " +
  JSON.stringify(j) +
  ";\n})();\n";
fs.writeFileSync(__dirname + "/../pictos-data.js", src);
console.log("wrote", src.length);
