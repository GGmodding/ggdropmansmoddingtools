"use strict";
const fs = require("fs");
const https = require("https");
https
  .get(
    "https://raw.githubusercontent.com/Infarctus/CO-E33_Save_editor/reactjs/src-tauri/src/jsonmappings/pictomapping.rs",
    (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        const m = d.match(/r#"(\{[\s\S]*\})"#/);
        if (!m) throw new Error("no json in pictomapping.rs");
        const obj = JSON.parse(m[1]).Pictos;
        const safe = Object.entries(obj)
          .filter(([, label]) => !String(label).trim().endsWith("*"))
          .map(([id]) => id)
          .sort((a, b) => a.localeCompare(b));
        const labels = {};
        for (const id of safe) labels[id] = obj[id];
        const out = { safe, labels };
        fs.writeFileSync(__dirname + "/../picto-ids.json", JSON.stringify(out));
        console.log("safe pictos", safe.length);
        console.log(safe.slice(0, 15).join(", "));
      });
    }
  )
  .on("error", (e) => {
    console.error(e);
    process.exit(1);
  });
