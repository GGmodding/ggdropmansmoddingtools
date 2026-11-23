(() => {
  "use strict";

  // Bloodborne PC port (bbport) main save: userdata0000, plain unencrypted data.
  // The player block starts at file offset 33720 and mirrors the layout in live game memory.
  const EXPECTED_SIZE = 1310720;
  const NAME_OFFSET = 33888;
  const NAME_MAX_CHARS = 16;

  const FIELDS = [
    { id: "level", label: "Level", offset: 33864, min: 1, max: 999999, group: "main" },
    { id: "insight", label: "Insight", offset: 33852, min: 0, max: 9999, group: "main" },
    { id: "echoes", label: "Blood Echoes", offset: 33868, min: 0, max: 2000000000, group: "main" },
    { id: "vitality", label: "Vitality", offset: 33784, min: 1, max: 99, group: "stat" },
    { id: "endurance", label: "Endurance", offset: 33792, min: 1, max: 99, group: "stat" },
    { id: "strength", label: "Strength", offset: 33808, min: 1, max: 99, group: "stat" },
    { id: "skill", label: "Skill", offset: 33816, min: 1, max: 99, group: "stat" },
    { id: "bloodtinge", label: "Bloodtinge", offset: 33824, min: 1, max: 99, group: "stat" },
    { id: "arcane", label: "Arcane", offset: 33832, min: 1, max: 99, group: "stat" },
  ];
  const STAT_IDS = FIELDS.filter((f) => f.group === "stat").map((f) => f.id);

  function view(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  function readName(bytes) {
    let s = "";
    const v = view(bytes);
    for (let i = 0; i < NAME_MAX_CHARS; i++) {
      const c = v.getUint16(NAME_OFFSET + i * 2, true);
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
      return { ok: false, error: "No character name found where expected - not editing this file." };
    }
    return { ok: true };
  }

  function readFields(bytes) {
    const v = view(bytes);
    const out = {};
    for (const f of FIELDS) out[f.id] = v.getInt32(f.offset, true);
    return out;
  }

  // Returns a modified COPY; the input is never changed.
  function applyFields(bytes, values) {
    const copy = new Uint8Array(bytes);
    const v = view(copy);
    for (const f of FIELDS) {
      if (!(f.id in values)) continue;
      const n = Math.trunc(Number(values[f.id]));
      if (!Number.isFinite(n)) throw new Error(f.label + " is not a number.");
      if (n < -2147483648 || n > 2147483647) throw new Error(f.label + " is out of range.");
      v.setInt32(f.offset, n, true);
    }
    return copy;
  }

  // Level = total of the six stats - 50 (inferred from one original save: stats totalling 67 -> level 17).
  function levelFromStats(values) {
    let total = 0;
    for (const id of STAT_IDS) total += Number(values[id]) || 0;
    return Math.max(1, total - 50);
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

  const api = { EXPECTED_SIZE, NAME_OFFSET, FIELDS, STAT_IDS, readName, validate, readFields, applyFields, levelFromStats, findSave };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.BBSave = api;
})();
