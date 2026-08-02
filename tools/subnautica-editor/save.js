(() => {
  "use strict";

  const GAMEINFO = "gameinfo.json";
  const SLOT_RE = /^slot\d+$/i;

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function stripRootPrefix(path, rootName) {
    const p = normalizePath(path);
    if (!rootName) return p;
    const prefix = rootName.replace(/\/+$/, "") + "/";
    if (p === rootName || p === rootName.replace(/\/+$/, "")) return "";
    if (p.startsWith(prefix)) return p.slice(prefix.length);
    return p;
  }

  function detectCommonRoot(paths) {
    if (!paths.length) return "";
    const parts = paths.map((p) => normalizePath(p).split("/").filter(Boolean));
    if (parts.some((p) => p.length < 2)) return "";
    const first = parts[0][0];
    if (parts.every((p) => p[0] === first)) return first;
    return "";
  }

  function parseJsonText(text, label) {
    try {
      return JSON.parse(String(text).replace(/^\uFEFF/, ""));
    } catch (err) {
      throw new Error("Invalid JSON in " + label + ": " + (err && err.message ? err.message : err));
    }
  }

  /** Unity / community saves usually pretty-print with 2 spaces; keep LF. */
  function serializeJson(data) {
    return JSON.stringify(data, null, 2) + "\n";
  }

  function basename(path) {
    const p = normalizePath(path);
    const i = p.lastIndexOf("/");
    return i >= 0 ? p.slice(i + 1) : p;
  }

  function isJsonName(name) {
    return /\.json$/i.test(name);
  }

  function isBinaryName(name) {
    return /\.(bin|jpg|jpeg|png|dat)$/i.test(name);
  }

  function findFile(files, relativePath) {
    const want = normalizePath(relativePath).toLowerCase();
    for (const key of Object.keys(files)) {
      if (normalizePath(key).toLowerCase() === want) return key;
    }
    for (const key of Object.keys(files)) {
      const n = normalizePath(key).toLowerCase();
      if (n.endsWith("/" + want) || n === want) return key;
    }
    return null;
  }

  function findByBasename(files, name) {
    const want = String(name).toLowerCase();
    for (const key of Object.keys(files)) {
      if (basename(key).toLowerCase() === want) return key;
    }
    return null;
  }

  function isSubnauticaSave(files) {
    return !!findByBasename(files, GAMEINFO);
  }

  function getGameInfo(files) {
    const key = findByBasename(files, GAMEINFO);
    if (!key) return null;
    const entry = files[key];
    if (entry.data != null) return entry.data;
    entry.data = parseJsonText(entry.text, key);
    return entry.data;
  }

  function flushGameInfo(files) {
    const key = findByBasename(files, GAMEINFO);
    if (!key) return;
    const entry = files[key];
    if (entry.data == null) return;
    entry.text = serializeJson(entry.data);
    entry.bytes = null;
    entry.dirty = true;
    entry.kind = "json";
  }

  function setEntryData(files, path, data) {
    const key = findFile(files, path) || normalizePath(path);
    if (!files[key]) {
      files[key] = { kind: "json", text: "", data: null, bytes: null, dirty: false };
    }
    files[key].data = data;
    files[key].text = serializeJson(data);
    files[key].bytes = null;
    files[key].dirty = true;
    files[key].kind = "json";
  }

  function setGameInfo(files, data) {
    let key = findByBasename(files, GAMEINFO);
    if (!key) key = GAMEINFO;
    setEntryData(files, key, data);
  }

  function modeName(id) {
    const modes = (window.SubnauticaData && window.SubnauticaData.GAME_MODES) || [];
    const hit = modes.find((m) => m.id === Number(id));
    return hit ? hit.name : "Unknown (" + id + ")";
  }

  function formatGameTime(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s < 0) return "—";
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    return hours + "h " + mins + "m " + secs + "s (" + Math.round(s) + "s)";
  }

  function textByteLength(text) {
    if (text == null) return 0;
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return String(text).length;
  }

  function fileSize(entry) {
    if (!entry) return 0;
    if (entry.bytes) return entry.bytes.byteLength || entry.bytes.length || 0;
    if (entry.text != null) return textByteLength(entry.text);
    return 0;
  }

  function integrityReport(files) {
    const req = (window.SubnauticaData && window.SubnauticaData.REQUIRED_FILES) || [];
    return req.map((r) => {
      const key = findByBasename(files, r.name);
      const entry = key ? files[key] : null;
      return {
        name: r.name,
        role: r.role,
        present: !!entry,
        path: key,
        size: fileSize(entry),
        dirty: !!(entry && entry.dirty),
        markedDelete: !!(entry && entry.deleteOnSave),
      };
    });
  }

  function detectSlots(fileMap) {
    const slots = new Set();
    for (const k of Object.keys(fileMap)) {
      const top = normalizePath(k).split("/")[0];
      if (SLOT_RE.test(top)) slots.add(top);
    }
    return [...slots].sort((a, b) => {
      const na = Number((a.match(/(\d+)/) || [])[1]) || 0;
      const nb = Number((b.match(/(\d+)/) || [])[1]) || 0;
      return na - nb;
    });
  }

  function unwrapSlot(fileMap, slotName) {
    const unwrapped = {};
    for (const [k, v] of Object.entries(fileMap)) {
      if (!k.startsWith(slotName + "/")) continue;
      const next = k.slice(slotName.length + 1);
      if (next) unwrapped[next] = v;
    }
    return unwrapped;
  }

  function listFiles(files) {
    return Object.keys(files)
      .sort((a, b) => a.localeCompare(b))
      .map((path) => {
        const e = files[path];
        return {
          path,
          kind: e.kind || (isJsonName(path) ? "json" : isBinaryName(path) ? "bin" : "text"),
          size: fileSize(e),
          dirty: !!e.dirty,
          deleteOnSave: !!e.deleteOnSave,
        };
      });
  }

  function markSceneObjectsDeleted(files, deleted) {
    const key = findByBasename(files, "scene-objects.bin");
    if (!key) return false;
    files[key].deleteOnSave = !!deleted;
    files[key].dirty = true;
    return true;
  }

  function buildFileMap(fileEntries) {
    const paths = fileEntries.map((f) => f.relativePath);
    const root = detectCommonRoot(paths);
    const files = {};
    for (const f of fileEntries) {
      const rel = stripRootPrefix(f.relativePath, root);
      if (!rel) continue;
      const name = basename(rel);
      if (isJsonName(name)) {
        files[normalizePath(rel)] = {
          kind: "json",
          text: f.text != null ? f.text : new TextDecoder().decode(f.bytes),
          data: null,
          bytes: null,
          dirty: false,
        };
      } else {
        files[normalizePath(rel)] = {
          kind: isBinaryName(name) ? "bin" : "text",
          text: f.text != null ? f.text : null,
          data: null,
          bytes: f.bytes || null,
          dirty: false,
        };
      }
    }
    return { files, root };
  }

  function buildFromFileList(fileEntries, options = {}) {
    const { files: mapped, root } = buildFileMap(fileEntries);
    const topFolders = detectSlots(mapped);
    const availableSlots = topFolders.slice();
    let slotName = options.preferredSlot || null;

    if (topFolders.length) {
      if (!slotName || !topFolders.includes(slotName)) slotName = topFolders[0];
      const unwrapped = unwrapSlot(mapped, slotName);
      if (!Object.keys(unwrapped).length) {
        throw new Error("Slot " + slotName + " had no files.");
      }
      if (!isSubnauticaSave(unwrapped)) {
        throw new Error("Slot " + slotName + " is missing gameinfo.json.");
      }
      return {
        files: unwrapped,
        rootName: slotName,
        availableSlots,
        rawEntries: fileEntries,
        mappedRoot: mapped,
        commonRoot: root,
      };
    }

    if (!isSubnauticaSave(mapped)) {
      throw new Error("No gameinfo.json found. Load a slot00xx folder or SavedGames ZIP.");
    }
    return {
      files: mapped,
      rootName: root || options.folderHint || "slot0000",
      availableSlots: [],
      rawEntries: fileEntries,
      mappedRoot: mapped,
      commonRoot: root,
    };
  }

  async function readFileEntriesFromList(fileList) {
    const entries = [];
    for (const file of fileList) {
      const relativePath = normalizePath(file.webkitRelativePath || file.name);
      if (!relativePath || relativePath.endsWith("/")) continue;
      const name = basename(relativePath);
      if (isJsonName(name) || (!isBinaryName(name) && /\.(txt|cfg|xml)$/i.test(name))) {
        entries.push({ relativePath, text: await file.text(), bytes: null });
      } else {
        entries.push({ relativePath, text: null, bytes: await file.arrayBuffer() });
      }
    }
    return entries;
  }

  async function readZip(file) {
    if (!window.JSZip) throw new Error("JSZip failed to load.");
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    const tasks = [];
    zip.forEach((relativePath, zf) => {
      if (zf.dir) return;
      const path = normalizePath(relativePath);
      const name = basename(path);
      tasks.push(
        (async () => {
          if (isJsonName(name)) {
            entries.push({ relativePath: path, text: await zf.async("string"), bytes: null });
          } else {
            entries.push({ relativePath: path, text: null, bytes: await zf.async("arraybuffer") });
          }
        })()
      );
    });
    await Promise.all(tasks);
    return entries;
  }

  async function buildZipBlob(files, folderName) {
    if (!window.JSZip) throw new Error("JSZip failed to load.");
    flushGameInfo(files);
    const zip = new JSZip();
    const root = folderName || "slot0000";
    for (const [path, entry] of Object.entries(files)) {
      if (entry.deleteOnSave) continue;
      const outPath = root + "/" + normalizePath(path);
      if (entry.kind === "json" || (entry.text != null && !entry.bytes)) {
        zip.file(outPath, entry.text != null ? entry.text : serializeJson(entry.data || {}));
      } else if (entry.bytes) {
        zip.file(outPath, entry.bytes);
      } else if (entry.text != null) {
        zip.file(outPath, entry.text);
      }
    }
    return zip.generateAsync({ type: "blob" });
  }

  function switchSlotFromRaw(rawEntries, preferredSlot) {
    return buildFromFileList(rawEntries, { preferredSlot });
  }

  window.SubnauticaSave = {
    GAMEINFO,
    SLOT_RE,
    normalizePath,
    parseJsonText,
    serializeJson,
    findFile,
    findByBasename,
    isSubnauticaSave,
    getGameInfo,
    flushGameInfo,
    setGameInfo,
    setEntryData,
    basename,
    modeName,
    formatGameTime,
    integrityReport,
    listFiles,
    markSceneObjectsDeleted,
    buildFromFileList,
    readFileEntriesFromList,
    readZip,
    buildZipBlob,
    switchSlotFromRaw,
    fileSize,
  };
})();
