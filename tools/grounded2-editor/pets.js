(() => {
  "use strict";

  const C = window.GroundedCsav;
  const Inv = window.GroundedInventory;

  const OMNI_PATH = "/Script/Maine.OmniToolComponent";
  const PET_MASTER = "/Script/Maine.PetMasterComponent";
  const PET_STORAGE = "/Script/Maine.PetStorageComponent";
  const BUGGY_PATH = "/Script/Maine.PlayerBuggyUpgradeComponent";
  const FULL_TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";

  const OMNI_TIER_COUNT = 4;
  const OMNI_MAX_LEVEL = 4;

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

  function afterShortName(buf, pathAt, pathStr) {
    let o = pathAt + pathStr.length + 1;
    if (o + 4 > buf.length) return o;
    const len = new DataView(buf.buffer, buf.byteOffset + o, 4).getInt32(0, true);
    if (len > 0 && len < 80 && o + 4 + len <= buf.length) return o + 4 + len;
    return o;
  }

  /**
   * Observed: version u8 (2) + 4× u32 levels + trailing zeros before next component size.
   */
  function parseOmni(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const at = indexOfAscii(buf, OMNI_PATH, 0);
    if (at < 0) return { ok: false };
    const payload = afterShortName(buf, at, OMNI_PATH);
    if (payload + 1 + OMNI_TIER_COUNT * 4 > buf.length) return { ok: false };
    const version = buf[payload];
    const levels = [];
    const dv = new DataView(buf.buffer, buf.byteOffset + payload + 1, OMNI_TIER_COUNT * 4);
    for (let i = 0; i < OMNI_TIER_COUNT; i++) levels.push(dv.getUint32(i * 4, true));
    return { ok: true, at, payload, version, levels };
  }

  function maxOmniTool(rawPlayer, level) {
    const lv = Math.max(1, Math.min(10, Number(level) || OMNI_MAX_LEVEL));
    const omni = parseOmni(rawPlayer);
    if (!omni.ok) throw new Error("OmniToolComponent not found.");
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    const dv = new DataView(buf.buffer, buf.byteOffset + omni.payload + 1, OMNI_TIER_COUNT * 4);
    let changed = 0;
    for (let i = 0; i < OMNI_TIER_COUNT; i++) {
      const prev = dv.getUint32(i * 4, true);
      if (prev !== lv) {
        dv.setUint32(i * 4, lv, true);
        changed++;
      }
    }
    return {
      bytes: buf,
      levels: Array(OMNI_TIER_COUNT).fill(lv),
      changed,
      was: omni.levels,
    };
  }

  function parsePetStorage(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const at = indexOfAscii(buf, PET_STORAGE, 0);
    if (at < 0) return { ok: false, items: [] };
    const payload = afterShortName(buf, at, PET_STORAGE);
    // Region until next Maine script after storage (often VisualCustomization / PlayerState)
    let end = indexOfAscii(buf, "/Script/Maine.", payload + 8);
    if (end < 0) end = Math.min(buf.length, payload + 20000);
    // Prefer stopping before a large jump into unrelated systems — cap scan
    end = Math.min(end > payload ? end : payload + 12000, payload + 20000);
    const items = [];
    let i = payload;
    while (i < end) {
      const tAt = indexOfAscii(buf, FULL_TABLE, i);
      if (tAt < 0 || tAt >= end) break;
      if (Inv && typeof Inv.parseItemRecord === "function") {
        const rec = Inv.parseItemRecord(buf, tAt - 4, end);
        if (rec) {
          items.push({ ...rec, region: "pet-storage" });
          i = rec.end;
          continue;
        }
      }
      i = tAt + 1;
    }
    const masterAt = indexOfAscii(buf, PET_MASTER, 0);
    return { ok: true, at, payload, items, hasMaster: masterAt >= 0 };
  }

  function parseBuggy(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const at = indexOfAscii(buf, BUGGY_PATH, 0);
    if (at < 0) return { ok: false };
    const payload = afterShortName(buf, at, BUGGY_PATH);
    const tag =
      payload + 4 <= buf.length
        ? new DataView(buf.buffer, buf.byteOffset + payload, 4).getUint32(0, true)
        : null;
    return {
      ok: true,
      at,
      payload,
      tag,
      note: "Upgrade list empty / not catalogued on this HostPlayer — no safe max-all yet.",
    };
  }

  window.GroundedPets = {
    parseOmni,
    maxOmniTool,
    parsePetStorage,
    parseBuggy,
    OMNI_MAX_LEVEL,
  };
})();
