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

  function isSaveName(name) {
    return /^EXPEDITION_\d+\.sav$/i.test(name) || /^EXPEDITION_\d+_.+\.sav$/i.test(name);
  }

  function isContainerName(name) {
    return /^SavesContainer\.sav$/i.test(name);
  }

  function formatBytes(n) {
    if (!n) return "0 B";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function formatPlaytime(sec) {
    if (sec == null || !Number.isFinite(sec)) return "—";
    const s = Math.floor(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h) return h + "h " + m + "m";
    if (m) return m + "m " + r + "s";
    return r + "s";
  }

  async function readFileAsBytes(file) {
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async function readZip(file) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded.");
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    const names = Object.keys(zip.files);
    for (const name of names) {
      const zf = zip.files[name];
      if (zf.dir) continue;
      const base = basename(name);
      if (!isSaveName(base) && !isContainerName(base) && !/\.sav$/i.test(base)) continue;
      const bytes = new Uint8Array(await zf.async("uint8array"));
      entries.push({ name: base, path: name, bytes, file: null });
    }
    return entries;
  }

  async function readFileEntriesFromList(fileList) {
    const entries = [];
    for (const file of fileList) {
      const name = file.name;
      if (/\.zip$/i.test(name)) {
        const inner = await readZip(file);
        entries.push(...inner);
        continue;
      }
      if (!/\.sav$/i.test(name)) continue;
      const bytes = await readFileAsBytes(file);
      entries.push({
        name,
        path: file.webkitRelativePath || name,
        bytes,
        file,
      });
    }
    return entries;
  }

  function pickPrimary(entries) {
    const slots = entries.filter((e) => /^EXPEDITION_\d+\.sav$/i.test(e.name));
    if (slots.length) {
      slots.sort((a, b) => {
        const na = Number((a.name.match(/EXPEDITION_(\d+)/i) || [])[1] || 99);
        const nb = Number((b.name.match(/EXPEDITION_(\d+)/i) || [])[1] || 99);
        return na - nb;
      });
      return slots[0];
    }
    const any = entries.filter((e) => isSaveName(e.name));
    if (any.length) {
      any.sort((a, b) => b.bytes.length - a.bytes.length);
      return any[0];
    }
    return entries.find((e) => /\.sav$/i.test(e.name) && !isContainerName(e.name)) || entries[0] || null;
  }

  window.E33Save = {
    isSaveName,
    isContainerName,
    basename,
    formatBytes,
    formatPlaytime,
    readZip,
    readFileEntriesFromList,
    pickPrimary,
  };
})();
