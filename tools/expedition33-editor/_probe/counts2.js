"use strict";
const fs = require("fs");
const buf = fs.readFileSync(
  "C:/Users/Owner/AppData/Local/Sandfall/Saved/SaveGames/76561197960271872/EXPEDITION_0.sav"
);
// Before first PassiveEffectName (75602)
console.log("before PEP entry", buf.slice(75580, 75610).toString("hex"));
console.log("u32 at 75598", buf.readUInt32LE(75598));
console.log("u32 at 75594", buf.readUInt32LE(75594));

// Before first DefinitionID (72144)
console.log("before WP entry", buf.slice(72120, 72150).toString("hex"));
console.log("u32 at 72140", buf.readUInt32LE(72140));

// Dump WP header from StructProperty through first entry
const wpAfter = 71971;
console.log(buf.slice(wpAfter, 72150).toString("hex"));
console.log(buf.slice(wpAfter, 72150).toString("latin1").replace(/[^\x20-\x7e]/g, "."));

// Dump PEP header similarly  
const pepAfter = 75431;
console.log("\nPEP header");
console.log(buf.slice(pepAfter, 75610).toString("hex"));
console.log(buf.slice(pepAfter, 75610).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
