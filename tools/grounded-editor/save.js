(() => {
  "use strict";

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function basename(path) {
    const p = normalizePath(path);
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.slice(i + 1) : p;
  }

  function dirname(path) {
    const p = normalizePath(path);
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.slice(0, i) : "";
  }

  function isHeaderName(name) {
    return /^SaveGameHeaderData\.savheader$/i.test(name);
  }

  function isCsavName(name) {
    return /\.csav$/i.test(name);
  }

  function isScreenshotName(name) {
    return /^SaveGameScreenshot\.(jpg|jpeg|png)$/i.test(name);
  }

  function isSlotFileName(name) {
    return isHeaderName(name) || isCsavName(name) || isScreenshotName(name);
  }

  function looksLikeSlotFolderName(name) {
    return /^\((ID|PG)-[0-9A-Fa-f]+\)/i.test(name || "");
  }

  function formatBytes(n) {
    if (!n) return "0 B";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  async function readFileAsBytes(file) {
    return new Uint8Array(await file.arrayBuffer());
  }

  /** Group File / zip entries by slot folder name without requiring bytes yet. */
  function slotKeyFromPath(path, fileName) {
    const p = normalizePath(path || fileName);
    const parts = p.split("/").filter(Boolean);
    if (parts.length >= 2) return parts[parts.length - 2];
    return "(loose)";
  }

  function groupFilesBySlot(fileList) {
    const map = new Map();
    for (const file of fileList) {
      const name = file.name;
      if (!isSlotFileName(name)) continue;
      const rel = file.webkitRelativePath || file._groundedRelPath || name;
      const key = slotKeyFromPath(rel, name);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ name, path: normalizePath(rel), file, bytes: null });
    }
    return map;
  }

  function groupEntriesBySlot(entries) {
    const map = new Map();
    for (const e of entries) {
      const path = normalizePath(e.path || e.name);
      const fileName = basename(path) || e.name;
      if (!isSlotFileName(fileName) && !/\.zip$/i.test(fileName)) continue;
      const slotKey = slotKeyFromPath(path, fileName);
      if (!map.has(slotKey)) map.set(slotKey, []);
      map.get(slotKey).push({
        name: fileName,
        path,
        bytes: e.bytes || null,
        file: e.file || null,
      });
    }
    return map;
  }

  function scoreSlotMeta(slotKey, files) {
    let score = 0;
    for (const f of files) {
      if (isHeaderName(f.name)) score += 50;
      if (/^HostPlayer\.csav$/i.test(f.name)) score += 30;
      if (/^World\.csav$/i.test(f.name)) score += 20;
      if (isScreenshotName(f.name)) score += 5;
      if (isCsavName(f.name)) score += 2;
      if (f.bytes) score += Math.min(10, f.bytes.length / (1024 * 1024));
      else if (f.file) score += Math.min(10, (f.file.size || 0) / (1024 * 1024));
    }
    const meta = window.GroundedPlayer.parseSlotFolderName(slotKey);
    if (meta.kind === "logout") score += 8;
    if (meta.kind === "manual") score += 6;
    if (meta.kind === "autosave") score += 2;
    return score;
  }

  function pickPrimarySlot(slotMap) {
    let best = null;
    let bestScore = -1;
    for (const [key, files] of slotMap.entries()) {
      if (key === "(loose)" && slotMap.size > 1) continue;
      const s = scoreSlotMeta(key, files);
      if (s > bestScore) {
        bestScore = s;
        best = { key, files };
      }
    }
    return best;
  }

  async function ensureEntryBytes(entry) {
    if (entry.bytes) return entry;
    if (!entry.file) throw new Error("No data for " + entry.name);
    entry.bytes = await readFileAsBytes(entry.file);
    return entry;
  }

  async function materializeSlot(files) {
    const out = [];
    for (const f of files) {
      await ensureEntryBytes(f);
      out.push({ name: f.name, path: f.path, bytes: f.bytes, file: f.file });
    }
    return out;
  }

  async function readZip(file) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded.");
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    for (const name of Object.keys(zip.files)) {
      const zf = zip.files[name];
      if (zf.dir) continue;
      const base = basename(name);
      if (!isSlotFileName(base)) continue;
      const bytes = new Uint8Array(await zf.async("uint8array"));
      entries.push({ name: base, path: name, bytes, file: null });
    }
    return entries;
  }

  /**
   * Build slot map from a FileList / File[].
   * Does not read every World.csav in the tree — only indexes, then caller materializes one slot.
   */
  async function indexFileList(fileList) {
    const list = [...fileList];
    if (list.length === 1 && /\.zip$/i.test(list[0].name)) {
      const entries = await readZip(list[0]);
      return groupEntriesBySlot(entries);
    }

    // Expand nested zips but keep other files as lazy File refs
    const map = new Map();
    for (const file of list) {
      const name = file.name;
      if (/\.zip$/i.test(name)) {
        const inner = await readZip(file);
        for (const e of inner) {
          const key = slotKeyFromPath(e.path, e.name);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(e);
        }
        continue;
      }
      if (!isSlotFileName(name)) continue;
      const rel = file.webkitRelativePath || file._groundedRelPath || name;
      const key = slotKeyFromPath(rel, name);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        name,
        path: normalizePath(rel),
        file,
        bytes: null,
      });
    }
    return map;
  }

  async function readFileEntriesFromList(fileList) {
    // Legacy helper: fully materializes. Prefer indexFileList + materializeSlot.
    const map = await indexFileList(fileList);
    const entries = [];
    for (const [, files] of map.entries()) {
      for (const f of await materializeSlot(files)) entries.push(f);
    }
    return entries;
  }

  async function buildSlotZip(slotName, files) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded.");
    const zip = new JSZip();
    const folder = zip.folder(slotName || "GroundedSave");
    for (const f of files) {
      folder.file(f.name, f.bytes);
    }
    return zip.generateAsync({ type: "blob" });
  }

  /**
   * Walk a directory handle and attach synthetic relative paths so slot grouping works.
   * If the handle IS a slot folder, files get path "SlotName/file".
   * If the handle is the Grounded root, paths are "ChildSlot/file".
   */
  async function collectSlotFilesFromDirectory(rootHandle, maxDepth = 3) {
    const out = [];

    async function walk(dir, prefix, depth) {
      if (depth > maxDepth) return;
      for await (const [name, ent] of dir.entries()) {
        const rel = prefix ? prefix + "/" + name : name;
        if (ent.kind === "file" && isSlotFileName(name)) {
          const file = await ent.getFile();
          // Synthetic relative path for grouping (File.webkitRelativePath is empty here)
          try {
            Object.defineProperty(file, "_groundedRelPath", {
              value: rel,
              configurable: true,
            });
          } catch {
            file._groundedRelPath = rel;
          }
          out.push({ name, relativePath: rel, file, handle: ent });
        } else if (ent.kind === "directory") {
          await walk(ent, rel, depth + 1);
        }
      }
    }

    // If root itself looks like a slot, prefix with its name so grouping isn't "(loose)"
    const rootPrefix = looksLikeSlotFolderName(rootHandle.name)
      ? rootHandle.name
      : "";
    await walk(rootHandle, rootPrefix, 0);
    return out;
  }

  window.GroundedSave = {
    normalizePath,
    basename,
    dirname,
    isHeaderName,
    isCsavName,
    isScreenshotName,
    isSlotFileName,
    looksLikeSlotFolderName,
    formatBytes,
    readZip,
    readFileEntriesFromList,
    indexFileList,
    materializeSlot,
    groupEntriesBySlot,
    groupFilesBySlot,
    pickPrimarySlot,
    buildSlotZip,
    scoreSlot: scoreSlotMeta,
    collectSlotFilesFromDirectory,
  };
})();
