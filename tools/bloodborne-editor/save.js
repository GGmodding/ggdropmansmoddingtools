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
      const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45 || c === 32;
      if (!ok) return false;
    }
    if (len < 1 || len >= NAME_MAX_CHARS) return false;
    const first = v.getUint16(n, true);
    return (first >= 65 && first <= 90) || (first >= 97 && first <= 122);
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
      if (ins < 0 || ins > 9999 || lvl < 1 || lvl > 999999 || ech < 0) continue;
      found = n;
    }
    anchorCache.set(bytes, found);
    return found;
  }
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

  const api = { locate, EXPECTED_SIZE, NAME_OFFSET, FIELDS, STAT_IDS, readName, validate, readFields, applyFields, levelFromStats, findSave, readInventory, applyInventory, COUNT_MIN, COUNT_MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.BBSave = api;
})();
