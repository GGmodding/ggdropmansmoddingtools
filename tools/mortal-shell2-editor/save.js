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
    return /\.(sav|bak)$/i.test(name);
  }

  function formatBytes(n) {
    if (!n) return "0 B";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  async function readFileAsBytes(file) {
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  async function readZip(file) {
    if (typeof JSZip === "undefined") throw new Error("JSZip not loaded.");
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    for (const name of Object.keys(zip.files)) {
      const zf = zip.files[name];
      if (zf.dir) continue;
      const base = basename(name);
      if (!isSaveName(base)) continue;
      entries.push({
        name: base,
        path: name,
        bytes: new Uint8Array(await zf.async("uint8array")),
        file: null,
      });
    }
    return entries;
  }

  async function readFileEntriesFromList(fileList) {
    const entries = [];
    for (const file of fileList) {
      const name = file.name;
      if (/\.zip$/i.test(name)) {
        entries.push(...(await readZip(file)));
        continue;
      }
      if (!isSaveName(name)) continue;
      entries.push({
        name,
        path: file.webkitRelativePath || name,
        bytes: await readFileAsBytes(file),
        file,
      });
    }
    return entries;
  }

  function pickPrimary(entries) {
    const savs = entries.filter((e) => /\.sav$/i.test(e.name) && !/backup/i.test(e.name));
    if (savs.length) {
      savs.sort((a, b) => b.bytes.length - a.bytes.length);
      return savs[0];
    }
    const any = entries.filter((e) => isSaveName(e.name));
    if (any.length) {
      any.sort((a, b) => b.bytes.length - a.bytes.length);
      return any[0];
    }
    return entries[0] || null;
  }

  window.MortalShell2Save = {
    isSaveName,
    basename,
    formatBytes,
    readZip,
    readFileEntriesFromList,
    pickPrimary,
  };
})();
