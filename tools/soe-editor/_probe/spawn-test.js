const Items = require("../items.js");

function check(name, cond, extra) {
  if (!cond) {
    console.log("FAIL", name, extra || "");
    process.exitCode = 1;
  } else console.log("ok", name, extra || "");
}

const place = { location: 0, panel: 1, x: 0, y: 0 };

const zod = Items.spawnSimple("r33", place);
check("zod", zod.code === "r33" && zod.simple === 1 && !zod.parseError, Items.displayName(zod));

const jew = Items.spawnSimple("jew", place);
check("jewel", jew.code === "jew" && jew.quality === 2 && !jew.parseError && jew.mods.length === 0, Items.displayName(jew));

const monarch = Items.spawnItem("uit", place, {});
check(
  "monarch",
  monarch.code === "uit" && monarch.quality === 2 && monarch.defense === 148 && monarch.maxDur === 86 && monarch.dur === 86 && !monarch.parseError,
  JSON.stringify({ def: monarch.defense, dur: monarch.maxDur, name: Items.displayName(monarch) })
);

const ethMon = Items.spawnItem("uit", place, { ethereal: 1, sockets: 4 });
check(
  "eth 4os monarch",
  ethMon.ethereal === 1 && ethMon.sockets === 4 && ethMon.defense === Math.floor(148 * 1.5) && !ethMon.parseError,
  JSON.stringify({ def: ethMon.defense, dur: ethMon.maxDur, sock: ethMon.sockets })
);

const shako = (Items.spawnCatalog("harlequin crest", "unique") || [])[0];
check("shako row", shako && shako.name === "Harlequin Crest" && shako.code === "uap", JSON.stringify(shako && { n: shako.name, id: shako.id }));

const crest = Items.spawnUnique(shako.id, place, {});
check(
  "harlequin",
  crest.quality === 7 &&
    crest.uniqueId === shako.id &&
    crest.code === "uap" &&
    !crest.parseError &&
    Items.displayName(crest) === "Harlequin Crest" &&
    crest.mods.some((m) => m.id === 127 && m.values[0] === 2) &&
    crest.mods.some((m) => m.id === 216 && m.values[0] === 8),
  JSON.stringify({ name: Items.displayName(crest), q: crest.quality, id: crest.uniqueId, mods: crest.mods.map((m) => [m.id, m.values]) })
);

const wraith = (Items.spawnCatalog("wraithflight", "unique") || [])[0];
check("wraithflight row", wraith && wraith.name === "Wraithflight" && wraith.code === "7gl" && wraith.id === 386, JSON.stringify(wraith));
if (wraith) {
  const wf = Items.spawnUnique(wraith.id, place, {});
  check(
    "wraithflight spawn",
    wf.quality === 7 && wf.uniqueId === 386 && wf.code === "7gl" && !wf.parseError && Items.displayName(wf).startsWith("Wraithflight"),
    JSON.stringify({ name: Items.displayName(wf), id: wf.uniqueId, code: wf.code, eth: wf.ethereal })
  );
}

const gnasher = Items.spawnUnique(0, place, {});
check(
  "gnasher",
  gnasher.quality === 7 &&
    gnasher.code === "hax" &&
    !gnasher.parseError &&
    gnasher.mods.some((m) => m.id === 17 && m.values[0] === 50) &&
    gnasher.mods.some((m) => m.id === 359 && m.values[1] === 358),
  JSON.stringify({ name: Items.displayName(gnasher), mods: gnasher.mods.map((m) => [m.id, m.values]) })
);

const storm = (Items.spawnCatalog("stormshield", "unique") || [])[0];
check("find stormshield", storm && storm.kind === "unique", storm && storm.name);
if (storm) {
  const item = Items.spawnUnique(storm.id, place, {});
  check(
    "stormshield",
    item.quality === 7 && item.code === "uit" && item.maxDur === 0 && !item.parseError,
    JSON.stringify({ name: Items.displayName(item), dur: item.maxDur, def: item.defense, mods: item.mods.length })
  );
}

const arachnid = (Items.spawnCatalog("arachnid", "unique") || [])[0];
check("find arachnid", !!(arachnid && arachnid.name.includes("Arachnid")));
if (arachnid) {
  const item = Items.spawnUnique(arachnid.id, place, {});
  check(
    "arachnid",
    item.quality === 7 && !item.parseError && item.mods.some((m) => m.id === 204),
    JSON.stringify({ name: Items.displayName(item), charged: item.mods.filter((m) => m.id === 204), err: item.parseError })
  );
}

const catalog = Items.spawnCatalog("phase", "base");
check("phase blade base", catalog.some((h) => /phase blade/i.test(h.name)), catalog.map((h) => h.name).slice(0, 5));

const ascend = Items.listAscendancy();
check("ascendancy groups", ascend.some((g) => g.group === "Class stones" && g.items.some((u) => /Lich/i.test(u.n))), JSON.stringify(ascend.map((g) => g.group)));
const lich = (ascend.find((g) => g.group === "Class stones") || { items: [] }).items.find((u) => /Lich/i.test(u.n));
if (lich) {
  const item = Items.spawnUnique(lich.i, place, {});
  const tier = (item.mods || []).find((m) => m.id === 296);
  check(
    "lich stone",
    item.quality === 7 && item.version === 103 && !item.parseError && tier && tier.values[0] === 1433 && tier.values[1] === 33,
    JSON.stringify({ name: Items.displayName(item), v: item.version, mods: item.mods, err: item.parseError })
  );
}
const cairn = (ascend.find((g) => g.group === "Cairn") || { items: [] }).items[0];
if (cairn) {
  const item = Items.spawnUnique(cairn.i, place, {});
  check("cairn", item.quality === 7 && item.code === "ascc" && !item.parseError, Items.displayName(item));
}

if (process.exitCode) console.log("FAILED");
else console.log("ALL OK");
