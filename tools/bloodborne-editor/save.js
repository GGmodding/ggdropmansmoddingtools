(() => {
  "use strict";

  // Bloodborne PC port (bbport) main save: userdata0000, plain unencrypted data.
  // The player block starts at file offset 33720 and mirrors the layout in live game memory.
  const EXPECTED_SIZE = 1310720;
  const NAME_OFFSET = 33888; // only the position in the layout we first saw; real position is found by locate()
  const NAME_MAX_CHARS = 16;

  const FIELDS = [
    { id: "level", label: "Level", rel: -24, min: 1, max: 999999, group: "main" },
    { id: "insight", label: "Insight", rel: -36, min: 0, max: 9999, group: "main" },
    { id: "echoes", label: "Blood Echoes", rel: -20, min: 0, max: 2000000000, group: "main" },
    { id: "vitality", label: "Vitality", rel: -104, min: 1, max: 99, group: "stat" },
    { id: "endurance", label: "Endurance", rel: -96, min: 1, max: 99, group: "stat" },
    { id: "strength", label: "Strength", rel: -80, min: 1, max: 99, group: "stat" },
    { id: "skill", label: "Skill", rel: -72, min: 1, max: 99, group: "stat" },
    { id: "bloodtinge", label: "Bloodtinge", rel: -64, min: 1, max: 99, group: "stat" },
    { id: "arcane", label: "Arcane", rel: -56, min: 1, max: 99, group: "stat" },
  ];
  const STAT_IDS = FIELDS.filter((f) => f.group === "stat").map((f) => f.id);

  function view(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  // The game rewrites the save with its sections shifted by varying amounts, so absolute offsets are
  // unreliable. Every field keeps a fixed distance from the character name, so we find the name first.
  const anchorCache = new WeakMap();
  function plausibleName(v, n) {
    let len = 0;
    for (; len < NAME_MAX_CHARS; len++) {
      const c = v.getUint16(n + len * 2, true);
      if (c === 0) break;
      const ok = c >= 32 && c <= 126; // printable ASCII (names like "SAVE (male)" exist)
      if (!ok) return false;
    }
    if (len < 1 || len >= NAME_MAX_CHARS) return false;
    const first = v.getUint16(n, true);
    return first > 32;
  }
  function locate(bytes) {
    if (!bytes || bytes.length !== EXPECTED_SIZE) return -1;
    if (anchorCache.has(bytes)) return anchorCache.get(bytes);
    const v = view(bytes);
    const rel = (id) => FIELDS.find((f) => f.id === id).rel;
    let found = -1;
    for (let n = 256; n < EXPECTED_SIZE - 64 && found < 0; n += 2) {
      if (!plausibleName(v, n)) continue;
      let ok = true;
      for (const id of STAT_IDS) {
        const x = v.getInt32(n + rel(id), true);
        if (x < 1 || x > 99) { ok = false; break; }
      }
      if (!ok) continue;
      const ins = v.getInt32(n + rel("insight"), true), lvl = v.getInt32(n + rel("level"), true), ech = v.getInt32(n + rel("echoes"), true);
      if (ins < 0 || lvl < 1 || lvl > 999999 || ech < 0) continue; // loose: only used to find the block
      found = n;
    }
    anchorCache.set(bytes, found);
    return found;
  }
  const SEQ_REL = 34256; // item-acquisition counter, distance from the name (confirmed in-game)
  const INV_REL = 452; // inventory table starts this many bytes after the name
  function invStart(bytes) {
    const n = locate(bytes);
    if (n < 0) throw new Error("Could not locate the character data in this save.");
    return n + INV_REL;
  }

  function readName(bytes) {
    let s = "";
    const n = locate(bytes);
    if (n < 0) return "";
    const v = view(bytes);
    for (let i = 0; i < NAME_MAX_CHARS; i++) {
      const c = v.getUint16(n + i * 2, true);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  function validate(bytes) {
    if (!bytes || bytes.length !== EXPECTED_SIZE) {
      return {
        ok: false,
        error:
          "This file is " + (bytes ? bytes.length : 0) + " bytes; the main save (userdata0000) should be " +
          EXPECTED_SIZE + ". Pick userdata0000, not backup or userdata0010.",
      };
    }
    if (!readName(bytes)) {
      return { ok: false, error: "Could not find a character (name + stats) in this file - not editing it. Make sure it is userdata0000 from a game with a created character." };
    }
    return { ok: true };
  }

  function readFields(bytes) {
    const v = view(bytes);
    const n = locate(bytes);
    if (n < 0) throw new Error("Could not locate the character data in this save.");
    const out = {};
    for (const f of FIELDS) out[f.id] = v.getInt32(n + f.rel, true);
    return out;
  }

  // Returns a modified COPY; the input is never changed.
  function applyFields(bytes, values) {
    const base = locate(bytes);
    if (base < 0) throw new Error("Could not locate the character data in this save.");
    const copy = new Uint8Array(bytes);
    const v = view(copy);
    for (const f of FIELDS) {
      if (!(f.id in values)) continue;
      const n = Math.trunc(Number(values[f.id]));
      if (!Number.isFinite(n)) throw new Error(f.label + " is not a number.");
      if (n < -2147483648 || n > 2147483647) throw new Error(f.label + " is out of range.");
      v.setInt32(base + f.rel, n, true);
    }
    return copy;
  }

  // Level = total of the six stats - 50 (inferred from one original save: stats totalling 67 -> level 17).
  function levelFromStats(values) {
    let total = 0;
    for (const id of STAT_IDS) total += Number(values[id]) || 0;
    return Math.max(1, total - 50);
  }

  // ---- Inventory: 1984 slots of 16 bytes [sort key][handle][item ID][count] starting at 0x8624 ----
  // (start is found per-file with invStart(): name offset + INV_REL)
  const INV_SLOTS = 1984;
  const REC = 16;
  const COUNT_MIN = 1;
  const COUNT_MAX = 99;

  function classify(handle, id) {
    const hc = handle >>> 28, ic = id >>> 28;
    if (hc === 0xB && ic === 4) return { type: "goods", baseId: id & 0xFFFFFF };
    if (hc === 8 && ic === 0) return { type: "weapon", baseId: id };
    if (hc === 9 && ic === 1) return { type: "armor", baseId: id & 0xFFFFFF };
    if (hc === 0xA && ic === 2) return { type: "accessory", baseId: id & 0xFFFFFF };
    return { type: "unknown", baseId: id };
  }

  function readInventory(bytes) {
    const v = view(bytes);
    const INV_START = invStart(bytes);
    const out = [];
    for (let slot = 0; slot < INV_SLOTS; slot++) {
      const o = INV_START + slot * REC;
      const key = v.getUint32(o, true), handle = v.getUint32(o + 4, true);
      const id = v.getUint32(o + 8, true), count = v.getUint32(o + 12, true);
      if (handle === 0 && id === 0xFFFFFFFF) continue; // empty slot
      const c = classify(handle, id);
      out.push({ slot, offset: o, key, handle, itemId: id, count, type: c.type, baseId: c.baseId });
    }
    return out;
  }

  // counts: { slot: newCount }. Only stackable goods that are already in the inventory can change.
  // Returns a modified COPY; the input is never changed.
  function applyInventory(bytes, counts) {
    const INV_START = invStart(bytes);
    const copy = new Uint8Array(bytes);
    const v = view(copy);
    for (const k of Object.keys(counts)) {
      const slot = Number(k);
      if (!(slot >= 0 && slot < INV_SLOTS)) throw new Error("Bad inventory slot " + k + ".");
      const o = INV_START + slot * REC;
      const handle = v.getUint32(o + 4, true), id = v.getUint32(o + 8, true);
      if (classify(handle, id).type !== "goods") throw new Error("Slot " + slot + " is not a stackable item.");
      const n = Math.trunc(Number(counts[k]));
      if (!Number.isFinite(n) || n < COUNT_MIN || n > COUNT_MAX) {
        throw new Error("Item count must be " + COUNT_MIN + " to " + COUNT_MAX + " (slot " + slot + ").");
      }
      v.setUint32(o + 12, n, true);
    }
    return copy;
  }

  // Folders that never hold the save; skipping them keeps the search fast.
  const SKIP_DIRS = /^(_internal|_redist|game|bin|bundled|cache|shader|shader_catalog|tools|launcher|licenses|patches|mods|companions|download\d*|temp\d*|fonts|screenshots|captures|log|trophy.*|dlss|out|docs|scripts|node_modules|\.git)$/i;

  let WEAPON_TPL = (typeof window !== "undefined" && window.BBWeaponTpl) || {};
  function setWeaponTemplates(t) { WEAPON_TPL = t || {}; }

  // Weapons and armor each have TWO records: one in the inventory table, and a 60-byte "instance" entry
  // [handle][id][13 words] in a table before it.
  function instanceEntryWords(kind, id) {
    const NONE = 0x80000000;
    if (kind === "armor") return [1, 0, 1, NONE, 0, NONE, 0, NONE, 0, NONE, 0, NONE, 0];
    const lvl = Math.floor((id % 10000) / 100), base = id - lvl * 100;
    const t = WEAPON_TPL[String(base)] || [200, -1, -1, -1, -1, -1];
    const sl = t.slice(1).map((x) => (x < 0 ? NONE : x));
    return [t[0], 0, 1, sl[0], 0, sl[1], 0, sl[2], 0, sl[3], 0, sl[4], 0];
  }

  // ---- Weapons / armor: the game keeps a typed "instance array" of 4096 records starting at 0x54.
  // empty = 8 bytes, weapon/armor = 60 bytes, rune = 40 bytes. A new weapon/armor replaces one empty
  // 8-byte record by a 60-byte record, so everything after it moves 52 bytes later. The file has a
  // large block of unused zero bytes near the end, so the last 52 bytes of the data area are dropped.
  const HEADER_PATCH = false; // the other editor leaves the header alone
  const GA_START = 0x54, GA_COUNT = 4096;
  const GA_SIZE = { 8: 60, 9: 60, 0xB: 8, 0xC: 40 };
  function gaIsEmpty(w0, w1) { return (w0 === 0 && w1 === 0xFFFFFFFF) || (w0 === 0xFFFFFFFF && w1 === 0); }
  function gaWalk(v, len) {
    const recs = [];
    let o = GA_START;
    for (let i = 0; i < GA_COUNT; i++) {
      if (o + 8 > len) return null;
      const w0 = v.getUint32(o, true), w1 = v.getUint32(o + 4, true);
      let size;
      if (gaIsEmpty(w0, w1)) size = 8;
      else { size = GA_SIZE[w0 >>> 28]; if (!size) return null; }
      recs.push({ i, o, size, handle: w0, empty: size === 8 && gaIsEmpty(w0, w1) });
      o += size;
    }
    return { recs, end: o };
  }
  // End of the real data: the big zero area, then a small chunk, then a ~4 KB zero gap, then ~21 bytes.
  function findDataEnd(bytes, from) {
    let best = null, run = 0, runStart = 0;
    const n = bytes.length;
    for (let o = from; o <= n; o++) {
      const z = o < n && bytes[o] === 0;
      if (z) { if (!run) runStart = o; run++; }
      else { if (run >= 65536 && (!best || run > best.len)) best = { start: runStart, end: o, len: run }; run = 0; }
    }
    if (!best) return -1;
    let o = best.end;
    while (o < n) {
      let zr = 0, k = o;
      while (k < n && bytes[k] === 0) { zr++; k++; }
      if (zr >= 2048) return k + 64;
      o = zr ? k : o + 1;
      if (o - best.end > 4096) return -1;
    }
    return -1;
  }

  // The game numbers each weapon/armor handle by its position in this array (handle & 0xFFFF == record index),
  // so the new record must go into the empty slot whose index is the new handle number.
  function insertInstance(bytes, kind, minIdx, id, baseId) {
    const copy = new Uint8Array(bytes);
    const v = view(copy);
    const walk = gaWalk(v, copy.length);
    if (!walk) throw new Error("Could not read the item table of this save, so nothing was changed.");
    const vac = walk.recs.find((r) => r.empty);
    if (!vac) throw new Error("The item table is full.");
    const handle = ((kind === "armor" ? 0x90800000 : 0x80800000) | minIdx) >>> 0;
    const S = findDataEnd(copy, vac.o + 8);
    if (S < 0 || S + 52 > copy.length) throw new Error("This save has an unexpected layout (no safe room to add gear), so nothing was changed.");
    // shift [vac+8, S) forward by 52
    copy.copyWithin(vac.o + 60, vac.o + 8, S);
    const words = [handle >>> 0, id >>> 0].concat(instanceEntryWords(kind, baseId).map((w) => w >>> 0));
    words.forEach((w, k) => v.setUint32(vac.o + k * 4, w, true));
    // the file header holds section offsets/sizes; the game bumps these by 52 when it adds gear itself
    if (HEADER_PATCH) [4, 6, 7, 9, 11, 13, 15, 17, 19].forEach((k) => { const q = k * 4; v.setUint32(q, (v.getUint32(q, true) + 52) >>> 0, true); });
    const chk = gaWalk(v, copy.length);
    if (!chk || chk.end !== walk.end + 52) throw new Error("Internal check failed while adding gear, so nothing was changed.");
    return { copy, handle };
  }

  // Appends a new item. Returns a modified COPY. kind: "goods" | "weapon" | "armor".
  // Each new inventory record takes the next number from the save's item counter (key = counter, counter + 1).
  function addItem(bytes, kind, baseId, count) {
    if (kind !== "goods" && kind !== "weapon" && kind !== "armor") throw new Error("Unknown item kind.");
    if (locate(bytes) < 0) throw new Error("Could not locate the character data in this save.");
    const n = kind === "goods" ? Math.trunc(Number(count)) : 1;
    if (!(n >= COUNT_MIN && n <= COUNT_MAX)) throw new Error("Count must be " + COUNT_MIN + " to " + COUNT_MAX + ".");
    // pass 1: read-only checks and pick the handle
    {
      const base0 = locate(bytes), v0 = view(bytes), st0 = base0 + INV_REL;
      let free0 = -1, maxH = 0;
      const hg = (0xB0000000 | baseId) >>> 0;
      for (let slot = 0; slot < INV_SLOTS; slot++) {
        const o = st0 + slot * REC;
        const h = v0.getUint32(o + 4, true), i = v0.getUint32(o + 8, true);
        if (kind === "goods" && h === hg) throw new Error("You already have this item - change its count instead.");
        if (free0 < 0 && h === 0 && i === 0xFFFFFFFF) free0 = slot;
        const t = classify(h, i).type;
        if (t === "weapon" || t === "armor") maxH = Math.max(maxH, h & 0xFFFF);
      }
      if (free0 < 0) throw new Error("Inventory is full.");
      var maxHandle = maxH;
    }
    let work = bytes, handle, id;
    if (kind === "goods") {
      handle = (0xB0000000 | baseId) >>> 0; id = (0x40000000 | baseId) >>> 0;
    } else {
      id = kind === "armor" ? (0x10000000 | baseId) >>> 0 : baseId >>> 0;
      const gw = gaWalk(view(bytes), bytes.length);
      if (gw) for (const r of gw.recs) if (!r.empty && (r.handle >>> 28 === 8 || r.handle >>> 28 === 9)) maxHandle = Math.max(maxHandle, r.handle & 0xFFFF);
      const ins = insertInstance(bytes, kind, maxHandle + 1, id, baseId); // minIdx param = new handle number
      work = ins.copy; handle = ins.handle;
    }
    // pass 2: inventory record (the table may have moved, so locate again)
    const base = locate(work);
    if (base < 0) throw new Error("Could not locate the character data after editing.");
    const start = base + INV_REL, seqOff = base + SEQ_REL;
    const copy = new Uint8Array(work);
    const v = view(copy);
    const seq = v.getUint32(seqOff, true);
    if (seq < 1 || seq > 0xFFF) throw new Error("Unexpected item counter value (" + seq + "); not editing this save.");
    let free = -1;
    for (let slot = 0; slot < INV_SLOTS; slot++) {
      const o = start + slot * REC;
      if (v.getUint32(o + 4, true) === 0 && v.getUint32(o + 8, true) === 0xFFFFFFFF) { free = slot; break; }
    }
    if (free < 0) throw new Error("Inventory is full.");
    const o = start + free * REC;
    v.setUint32(o, kind === "goods" ? seq : 0, true);
    v.setUint32(o + 4, handle, true);
    v.setUint32(o + 8, id, true);
    v.setUint32(o + 12, n, true);
    if (kind === "goods") v.setUint32(seqOff, seq + 1, true);
    return copy;
  }

  // Changes an item you already own (weapon or armor) into a different item of the same kind.
  // This is what the other working editor does: the game's own record is kept and only the item ID changes
  // (in the item table and in the inventory). Returns a modified COPY.
  function replaceItem(bytes, slot, newBaseId) {
    const base = locate(bytes);
    if (base < 0) throw new Error("Could not locate the character data in this save.");
    const copy = new Uint8Array(bytes);
    const v = view(copy);
    const o = base + INV_REL + slot * REC;
    if (!(slot >= 0 && slot < INV_SLOTS)) throw new Error("Bad inventory slot.");
    const handle = v.getUint32(o + 4, true), id = v.getUint32(o + 8, true);
    const c = classify(handle, id);
    if (c.type !== "weapon" && c.type !== "armor") throw new Error("Only weapons and armor can be changed this way.");
    const newId = c.type === "armor" ? (0x10000000 | newBaseId) >>> 0 : newBaseId >>> 0;
    const walk = gaWalk(v, copy.length);
    if (!walk) throw new Error("Could not read the item table of this save, so nothing was changed.");
    const rec = walk.recs.find((r) => !r.empty && r.handle === handle);
    if (!rec) throw new Error("The item table has no record for this item, so nothing was changed.");
    if (v.getUint32(rec.o + 4, true) !== id) throw new Error("Item table and inventory disagree about this item; nothing was changed.");
    v.setUint32(rec.o + 4, newId, true);
    v.setUint32(o + 8, newId, true);
    if (c.type === "weapon") {
      // fresh durability and empty gem sockets for the new weapon
      instanceEntryWords("weapon", newBaseId).forEach((w, k) => v.setUint32(rec.o + 8 + k * 4, w >>> 0, true));
    }
    return copy;
  }

  async function descend(dir, parts) {
    let cur = dir;
    for (const p of parts) {
      try { cur = await cur.getDirectoryHandle(p); } catch (e) { return null; }
    }
    return cur;
  }

  // Looks below a picked folder for the main save (userdata0000 of the right size).
  // `root` is a FileSystemDirectoryHandle (or anything with entries()/kind/getFile()/getDirectoryHandle()).
  // Returns { result, scanned, capped, wrongSize } - result is null when nothing was found.
  async function findSave(root, maxDepth = 8, maxEntries = 60000) {
    const info = { result: null, scanned: 0, capped: false, wrongSize: [] };

    async function search(start, startPath) {
      const queue = [{ dir: start, depth: 0, path: startPath }];
      while (queue.length && !info.result) {
        const { dir, depth, path } = queue.shift();
        for await (const [name, h] of dir.entries()) {
          if (++info.scanned > maxEntries) { info.capped = true; return; }
          if (h.kind === "file") {
            if (/^userdata0000$/i.test(name)) {
              const f = await h.getFile();
              if (f.size === EXPECTED_SIZE) { info.result = { fileHandle: h, dirHandle: dir, path: path + "/" + name }; return; }
              info.wrongSize.push(path + "/" + name + " (" + f.size + " bytes)");
            }
          } else if (depth < maxDepth && !SKIP_DIRS.test(name)) {
            queue.push({ dir: h, depth: depth + 1, path: path + "/" + name });
          }
        }
      }
    }

    // 1) the usual location, tried directly (works whether the port folder or its parent was picked)
    const fast = [["user", "savedata"], ["bbport-windows", "user", "savedata"], ["savedata"]];
    for (const parts of fast) {
      const d = await descend(root, parts);
      if (d) { await search(d, root.name + "/" + parts.join("/")); if (info.result) return info; }
    }
    // 2) general search of the picked folder
    if (!info.capped) await search(root, root.name);
    return info;
  }

  const api = { locate, EXPECTED_SIZE, NAME_OFFSET, FIELDS, STAT_IDS, readName, validate, readFields, applyFields, levelFromStats, findSave, readInventory, applyInventory, addItem, replaceItem, setWeaponTemplates, COUNT_MIN, COUNT_MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.BBSave = api;
})();
