(() => {
  "use strict";
  const S = window.BBSave;
  const $ = (id) => document.getElementById(id);

  let original = null;     // Uint8Array as on disk when loaded - never modified
  let loadedValues = null;
  let fileName = "userdata0000";
  let rootHandle = null;   // folder the user picked (for backups)
  let saveHandle = null;   // FileSystemFileHandle of userdata0000, when found via folder
  const inputs = {};

  const canPick = typeof window.showDirectoryPicker === "function";

  function setStatus(msg) { $("status").textContent = msg; }
  function fail(msg) { setStatus(msg); alert(msg); }

  /* ---- remember the picked folder (IndexedDB) ---- */
  function idb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open("bb-editor", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("handles");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function rememberRoot(h) {
    try {
      const db = await idb();
      db.transaction("handles", "readwrite").objectStore("handles").put(h, "root");
    } catch (e) { /* remembering is optional */ }
  }
  async function recallRoot() {
    try {
      const db = await idb();
      return await new Promise((resolve) => {
        const q = db.transaction("handles").objectStore("handles").get("root");
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }

  /* ---- form ---- */
  function currentValues() {
    const v = {};
    for (const f of S.FIELDS) v[f.id] = Number(inputs[f.id].value);
    return v;
  }

  function markDirty() {
    if (!loadedValues) return;
    const cur = currentValues();
    $("dirty-pill").hidden = !S.FIELDS.some((f) => cur[f.id] !== loadedValues[f.id]);
  }

  function buildFields() {
    const host = $("fields");
    host.innerHTML = "";
    for (const [g, title] of [["main", "Progress"], ["stat", "Attributes"]]) {
      const h = document.createElement("div");
      h.className = "bb-section-title";
      h.textContent = title;
      host.appendChild(h);
      for (const f of S.FIELDS.filter((x) => x.group === g)) {
        const wrap = document.createElement("label");
        wrap.className = "bb-field";
        wrap.textContent = f.label;
        const input = document.createElement("input");
        input.type = "number";
        input.step = "1";
        input.addEventListener("input", markDirty);
        wrap.appendChild(input);
        const small = document.createElement("small");
        small.textContent = f.min + " to " + f.max.toLocaleString();
        wrap.appendChild(small);
        host.appendChild(wrap);
        inputs[f.id] = input;
      }
    }
  }

  function fillInputs(values) {
    for (const f of S.FIELDS) inputs[f.id].value = values[f.id];
    markDirty();
  }

  function showTab(name) {
    for (const t of document.querySelectorAll(".tab")) t.classList.toggle("is-active", t.dataset.tab === name);
    for (const id of ["character", "notes"]) {
      const p = $("panel-" + id);
      const on = id === name;
      p.hidden = !on;
      p.classList.toggle("is-active", on);
    }
  }

  /* ---- loading ---- */
  function loadBytes(bytes, name, where) {
    const check = S.validate(bytes);
    if (!check.ok) { fail(check.error); return false; }
    original = bytes;
    fileName = name || "userdata0000";
    loadedValues = S.readFields(bytes);
    $("char-name").textContent = "Character: " + S.readName(bytes) + "  (" + (where || fileName) + ")";
    $("empty-state").hidden = true;
    $("tabs").hidden = false;
    showTab("character");
    fillInputs(loadedValues);
    $("btn-backup").disabled = false;
    $("btn-save").disabled = false;
    $("btn-install").disabled = !(saveHandle && rootHandle);
    return true;
  }

  async function loadFile(file) {
    try {
      saveHandle = null;
      rootHandle = null;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (loadBytes(bytes, file.name)) {
        setStatus("Loaded " + fileName + ". Edit the values, then Download Edited Save (or use Find Save to install directly).");
      }
    } catch (e) {
      setStatus("Could not read the file: " + e.message);
    }
  }

  async function searchIn(root) {
    setStatus("Searching " + root.name + " ...");
    const found = await S.findSave(root);
    if (!found) {
      fail("No userdata0000 found inside \"" + root.name + "\". Pick the bbport-windows folder (the one with Bloodborne.exe), " +
        "and make sure you have started the game at least once so it created a save.");
      return;
    }
    const file = await found.fileHandle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    saveHandle = found.fileHandle;
    rootHandle = root;
    if (loadBytes(bytes, "userdata0000", found.path)) {
      await rememberRoot(root);
      setStatus("Found and loaded " + found.path + ". Close the game, edit, then Install to Save Folder.");
    }
  }

  async function pickFolder() {
    if (!canPick) { fail("Your browser can't open folders. Use Chrome or Edge, or use Load Save."); return; }
    try {
      const root = await window.showDirectoryPicker({ id: "bbport", mode: "readwrite" });
      await searchIn(root);
    } catch (e) {
      if (e && e.name !== "AbortError") setStatus("Could not open the folder: " + e.message);
    }
  }

  async function findSave() {
    if (!canPick) { fail("Your browser can't open folders. Use Chrome or Edge, or use Load Save."); return; }
    const remembered = await recallRoot();
    if (remembered) {
      try {
        let perm = await remembered.queryPermission({ mode: "readwrite" });
        if (perm !== "granted") perm = await remembered.requestPermission({ mode: "readwrite" });
        if (perm === "granted") { await searchIn(remembered); return; }
      } catch (e) { /* fall through to the picker */ }
    }
    await pickFolder();
  }

  /* ---- saving ---- */
  function download(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  async function install() {
    if (!original || !saveHandle || !rootHandle) return;
    try {
      const edited = S.applyFields(original, currentValues());

      // Refuse if the file changed on disk since loading (the game may have autosaved).
      const disk = new Uint8Array(await (await saveHandle.getFile()).arrayBuffer());
      if (!sameBytes(disk, original)) {
        fail("The save on disk changed since you loaded it (the game may be running). Close the game, click Find Save again, and redo your edits.");
        return;
      }

      // Backup of the original into <picked folder>/bb_editor_backups
      const bdir = await rootHandle.getDirectoryHandle("bb_editor_backups", { create: true });
      const bname = "userdata0000_" + stamp() + ".bak";
      const bh = await bdir.getFileHandle(bname, { create: true });
      const bw = await bh.createWritable();
      await bw.write(original);
      await bw.close();

      const w = await saveHandle.createWritable();
      await w.write(edited);
      await w.close();

      const after = new Uint8Array(await (await saveHandle.getFile()).arrayBuffer());
      if (!sameBytes(after, edited)) throw new Error("Verification failed after writing. Restore the backup " + bname + ".");

      original = edited;
      loadedValues = S.readFields(edited);
      markDirty();
      setStatus("Installed. Original saved as bb_editor_backups/" + bname + ". Start the game to check it loads.");
    } catch (e) {
      fail("Install failed: " + e.message);
    }
  }

  function init() {
    buildFields();
    if (!canPick) {
      $("btn-find").disabled = true;
      $("btn-pick").disabled = true;
      $("btn-find").title = "Needs Chrome or Edge";
    }
    $("file-input").addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
    $("btn-find").addEventListener("click", findSave);
    $("btn-pick").addEventListener("click", pickFolder);
    $("btn-install").addEventListener("click", install);
    for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => showTab(t.dataset.tab));

    $("btn-backup").addEventListener("click", () => {
      if (!original) return;
      download(original, fileName + "_backup_" + stamp() + ".bak");
      setStatus("Backup downloaded (the original, unedited bytes).");
    });

    $("btn-save").addEventListener("click", () => {
      if (!original) return;
      try {
        download(S.applyFields(original, currentValues()), fileName);
        setStatus("Downloaded edited " + fileName + ". Close the game, keep a backup, then replace the file in SPRJ0005.");
      } catch (e) { fail("Cannot save: " + e.message); }
    });

    $("btn-level").addEventListener("click", () => { inputs.level.value = S.levelFromStats(currentValues()); markDirty(); });
    $("btn-max").addEventListener("click", () => {
      for (const id of S.STAT_IDS) inputs[id].value = 99;
      inputs.level.value = S.levelFromStats(currentValues());
      markDirty();
    });
    $("btn-reset").addEventListener("click", () => { if (loadedValues) fillInputs(loadedValues); });

    let depth = 0;
    window.addEventListener("dragenter", (e) => { e.preventDefault(); depth++; $("drop-overlay").hidden = false; });
    window.addEventListener("dragleave", (e) => { e.preventDefault(); if (--depth <= 0) { depth = 0; $("drop-overlay").hidden = true; } });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault(); depth = 0; $("drop-overlay").hidden = true;
      if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
  }

  init();
})();
