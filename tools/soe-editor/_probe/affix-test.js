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
