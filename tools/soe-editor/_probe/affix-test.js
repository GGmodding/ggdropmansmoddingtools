const Items = require("../items.js");

function check(name, ok, extra) {
  console.log(ok ? "ok" : "FAIL", name, extra || "");
  if (!ok) process.exitCode = 1;
}

const place = { location: 0, panel: 1, x: 0, y: 0 };
const cap = Items.spawnItem("cap", place, {});
check("spawn cap", cap.code === "cap" && !cap.parseError, Items.displayName(cap));

const sturdy = Items.searchAffixes("sturdy", "prefix", cap)[0];
check("search sturdy", !!(sturdy && sturdy.n === "Sturdy"), JSON.stringify(sturdy && { i: sturdy.i, t: sturdy.t, d: sturdy.d }));
check("sturdy uses defense text", !!(sturdy && /enhanced defense/i.test(sturdy.d || "")), sturdy && sturdy.d);
Items.addAffix(cap, "prefix", sturdy.i);
check(
  "magic sturdy cap",
  cap.quality === 4 && cap.prefix === sturdy.i && cap.mods.some((m) => m.id === 16),
  JSON.stringify({ q: cap.quality, prefix: cap.prefix, name: Items.displayName(cap), mods: cap.mods })
);

const health = Items.searchAffixes("of health", "suffix", cap)[0];
check("search of health", !!(health && /health/i.test(health.n)), health && health.d);
check("health uses damage reduced text", !!(health && /damage reduced/i.test(health.d || "")), health && health.d);

const whale = Items.searchAffixes("life", "suffix", cap)[0] || Items.searchAffixes("whale", "suffix", cap, { fit: false })[0];
check("whale uses life text", !!(whale && /to life/i.test(whale.d || "")), whale && { n: whale.n, d: whale.d });
Items.addAffix(cap, "suffix", health.i);
check(
  "prefix+suffix still magic",
  cap.quality === 4 && cap.suffix === health.i && !cap.parseError,
  JSON.stringify({ q: cap.quality, suffix: cap.suffix, name: Items.displayName(cap), mods: cap.mods })
);

const second = Items.searchAffixes("jagged", "prefix", cap)[0] || Items.searchAffixes("fine", "prefix", cap)[0];
check("second prefix exists", !!second, second && second.n);
if (second) {
  Items.addAffix(cap, "prefix", second.i);
  check(
    "second prefix becomes rare",
    cap.quality === 6 && (cap.rareAffixes || []).filter(Boolean).length >= 3 && !cap.parseError,
    JSON.stringify({ q: cap.quality, aff: cap.rareAffixes, name: Items.displayName(cap), mods: cap.mods, err: cap.parseError })
  );
}

const shako = (Items.spawnCatalog("harlequin", "unique") || [])[0];
check("find shako", !!shako, shako && shako.n);
if (shako) {
  const item = Items.spawnUnique(shako.id, place, {});
  const before = item.mods.length;
  const whale = Items.searchAffixes("whale", "suffix", item, { fit: false })[0];
  Items.addAffix(item, "suffix", whale.i);
  check(
    "unique keeps id and gains hp",
    item.quality === 7 && item.uniqueId === shako.id && item.mods.length >= before && item.mods.some((m) => m.id === 7) && !item.parseError,
    JSON.stringify({ q: item.quality, id: item.uniqueId, extras: item.extraAffixes, mods: item.mods.map((m) => [m.id, m.values]), err: item.parseError })
  );
}

const slots = Items.itemAffixSlots(cap);
check("slots on rare", slots.mode === "rare" && slots.prefixes.length + slots.suffixes.length >= 2, JSON.stringify(slots));

const helm = Items.spawnItem("fhl", place, {});
helm.parseError = "simulated";
check("edit allowed on parse error", Items.canEditAffixes(helm), helm.parseError);
Items.setAffixSlot(helm, "prefix", 0, sturdy.i);
Items.setAffixSlot(helm, "suffix", 0, health.i);
check(
  "helm prefix suffix picks",
  helm.quality === 4 && helm.prefix === sturdy.i && helm.suffix === health.i && !helm.parseError && Items.displayName(helm).includes("Sturdy"),
  JSON.stringify({ q: helm.quality, name: Items.displayName(helm), prefix: helm.prefix, suffix: helm.suffix, err: helm.parseError })
);

const rolled = Items.spawnItem("fhl", place, {});
Items.setAffixSlot(rolled, "prefix", 0, sturdy.i);
const ed = rolled.mods.find((m) => m.id === 16);
check("sturdy starts at max roll", !!(ed && ed.values[0] > 0), ed && ed.values);
const setEd = Items.setModValue(rolled, rolled.mods.findIndex((m) => m.id === 16), 0, 400);
check("custom enhanced defense 400", setEd.value === 400 && !setEd.clamped && rolled.mods.some((m) => m.id === 16 && m.values[0] === 400), JSON.stringify(setEd));
const again = Items.parseItem(rolled.raw, 0);
check("custom ed roundtrip", again.mods.some((m) => m.id === 16 && m.values[0] === 400) && !again.parseError, JSON.stringify(again.mods));

const capDef = Items.setItemDefense(rolled, 999);
check("item defense 999", capDef.value === 999 && rolled.defense === 999 && !capDef.clamped, JSON.stringify({ def: rolled.defense, r: capDef }));
const defAgain = Items.parseItem(rolled.raw, 0);
check("defense 999 roundtrip", defAgain.defense === 999 && !defAgain.parseError, defAgain.defense);

const resHelm = Items.spawnItem("fhl", place, {});
const crimson = Items.searchAffixes("crimson", "prefix", resHelm, { fit: false }).find((a) => /fire resist/i.test(a.d || "")) || Items.searchAffixes("ruby", "prefix", resHelm, { fit: false })[0];
check("fire resist prefix exists", !!crimson, crimson && { n: crimson.n, d: crimson.d, m: crimson.m });
Items.setAffixSlot(resHelm, "prefix", 0, crimson.i);
const fireIdx = resHelm.mods.findIndex((m) => m.id === 39);
check("fire resist applied", fireIdx >= 0, JSON.stringify(resHelm.mods));
const clamped = Items.setModValue(resHelm, fireIdx, 0, 999);
check("fire resist 999 clamps to save max", clamped.clamped && clamped.value === clamped.max && clamped.max === 205, JSON.stringify(clamped));
const fireBack = Items.parseItem(resHelm.raw, 0);
check("clamped resist roundtrip", fireBack.mods.some((m) => m.id === 39 && m.values[0] === 205), JSON.stringify(fireBack.mods));

const white = Items.spawnItem("fhl", place, {});
Items.addMod(white, 39);
check("add fire resist property", white.mods.some((m) => m.id === 39) && !white.parseError, JSON.stringify(white.mods));
Items.setModValue(white, white.mods.findIndex((m) => m.id === 39), 0, 80);
check("typed resist 80", white.mods.some((m) => m.id === 39 && m.values[0] === 80), JSON.stringify(white.mods));
Items.removeMod(white, white.mods.findIndex((m) => m.id === 39));
check("remove property", !white.mods.some((m) => m.id === 39) && !white.parseError, JSON.stringify(white.mods));

const shakoItem = Items.spawnItem("uap", place, {});
Items.setQuality(shakoItem, 7, { uniqueId: 248, applyMods: true });
check(
  "quality to harlequin",
  shakoItem.quality === 7 && shakoItem.uniqueId === 248 && !shakoItem.parseError && Items.displayName(shakoItem).includes("Harlequin"),
  JSON.stringify({ q: shakoItem.quality, id: shakoItem.uniqueId, name: Items.displayName(shakoItem), err: shakoItem.parseError })
);
Items.setPersonalized(shakoItem, "God");
check("personalize", shakoItem.personalized && shakoItem.personalizedName === "God" && !shakoItem.parseError, shakoItem.personalizedName);
const named = Items.parseItem(shakoItem.raw, 0);
check("personalize roundtrip", named.personalizedName === "God" && !named.parseError, named.personalizedName);

const stats = Items.listSavableStats("fire resist");
check("savable stat catalog", stats.some((s) => s.id === 39), stats.slice(0, 3));

const d2i = Items.parseD2i(Items.itemBytes(shakoItem));
check("d2i roundtrip", d2i.uniqueId === 248 && d2i.personalizedName === "God", Items.displayName(d2i));

const sockHelm = Items.spawnItem("fhl", place, { sockets: 2 });
Items.insertSocketed(sockHelm, Items.spawnItem("r01"));
check("socket filler", sockHelm.socketedItems && sockHelm.socketedItems.length === 1 && sockHelm.socketedItems[0].code === "r01" && !sockHelm.parseError, JSON.stringify(sockHelm.socketedItems && sockHelm.socketedItems[0]));
Items.setIndestructible(sockHelm, true);
check("indestructible", sockHelm.maxDur === 0 && !sockHelm.parseError, sockHelm.maxDur);
Items.setItemDefense(sockHelm, 120);
check("extras defense", sockHelm.defense === 120 && !sockHelm.parseError, sockHelm.defense);

check("on kill property listed", Items.listSavableStats("on kill").some((s) => s.id === 196), Items.listSavableStats("on kill").map((s) => s.label).slice(0, 5));
const procs = Items.listSkillProcs("uber diablo on kill");
check(
  "uber diablo on kill presets",
  procs.some((p) => p.id === 196 && (p.skillName === "UberDiabSummon" || p.skillId === 592)),
  procs.slice(0, 6).map((p) => p.label)
);
const procHelm = Items.spawnItem("fhl", place, {});
const summon = procs.find((p) => p.skillId === 592 && p.id === 196) || procs[0];
Items.addMod(procHelm, summon.id, summon.values);
check(
  "add uber diablo on kill",
  procHelm.mods.some((m) => m.id === 196 && m.values[1] === 592) && !procHelm.parseError,
  JSON.stringify(procHelm.mods)
);
const procBack = Items.parseItem(procHelm.raw, 0);
check(
  "uber diablo on kill roundtrip",
  procBack.mods.some((m) => m.id === 196 && m.values[1] === 592 && m.values[2] === 100) && !procBack.parseError,
  JSON.stringify(procBack.mods)
);
check("skill name lookup", Items.skillName(592) === "UberDiabSummon", Items.skillName(592));
