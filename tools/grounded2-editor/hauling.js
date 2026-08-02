(() => {
  "use strict";

  const C = window.GroundedCsav;
  const Inv = window.GroundedInventory;

  const FULL_TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
  const HAUL_PATH = "/Script/Maine.HaulingComponent";
  const HEAT_PATH = "/Script/Maine.HeatHazardComponent";

  function indexOfAscii(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from || 0); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function parseHauling(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const haulAt = indexOfAscii(buf, HAUL_PATH, 0);
    if (haulAt < 0) return { ok: false, items: [] };
    const heatAt = indexOfAscii(buf, HEAT_PATH, haulAt);
    const end = heatAt > haulAt ? heatAt : Math.min(buf.length, haulAt + 8000);
    const items = [];
    let i = haulAt;
    while (i < end) {
      const at = indexOfAscii(buf, FULL_TABLE, i);
      if (at < 0 || at >= end) break;
      if (Inv && typeof Inv.parseItemRecord === "function") {
        const rec = Inv.parseItemRecord(buf, at - 4, end);
        if (rec) {
          items.push({ ...rec, region: "hauling" });
          i = rec.end;
          continue;
        }
      }
      i = at + 1;
    }
    return { ok: true, items, haulAt, end, size: buf.length };
  }

  window.GroundedHauling = {
    parseHauling,
  };
})();
