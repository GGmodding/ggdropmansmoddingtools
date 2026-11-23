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

  function setStatus(msg) { $("status").textContent = msg; }
  function fail(msg) { setStatus(msg); alert(msg); }

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
    const info = await S.findSave(root);
    const found = info.result;
    if (!found) {
      let msg = "No usable userdata0000 found inside \"" + root.name + "\" (looked at " + info.scanned + " items).";
      if (info.capped) msg += " The search gave up because the folder is very large - pick the bbport-windows folder itself.";
      if (info.wrongSize.length) msg += " Found file(s) of the wrong size: " + info.wrongSize.join("; ") + ".";
      msg += " Pick the bbport-windows folder (the one with Bloodborne.exe), and start the game once so it creates a save.";
      fail(msg);
      return;
    }
    const file = await found.fileHandle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    saveHandle = found.fileHandle;
    rootHandle = root;
    if (loadBytes(bytes, "userdata0000", found.path)) {
      setStatus("Found and loaded " + found.path + ". Close the game, edit, then Install to Save Folder.");
    }
  }

  // Fallback for browsers without folder access: a plain folder chooser (read-only).
  async function loadFromFolderInput(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    const cands = files.filter((f) => /(^|\/)userdata0000$/i.test(f.webkitRelativePath || f.name));
    const good = cands.filter((f) => f.size === S.EXPECTED_SIZE);
    if (!good.length) {
      fail("No usable userdata0000 found in that folder (" + files.length + " files looked at" +
        (cands.length ? "; found " + cands.length + " userdata0000 of the wrong size" : "") +
        "). Pick the bbport-windows folder (the one with Bloodborne.exe).");
      return;
    }
    good.sort((x, y) => {
      const sx = /savedata/i.test(x.webkitRelativePath) ? 0 : 1, sy = /savedata/i.test(y.webkitRelativePath) ? 0 : 1;
      return sx - sy || x.webkitRelativePath.length - y.webkitRelativePath.length;
    });
    saveHandle = null;
    rootHandle = null;
    const bytes = new Uint8Array(await good[0].arrayBuffer());
    if (loadBytes(bytes, "userdata0000", good[0].webkitRelativePath)) {
      setStatus("Found " + good[0].webkitRelativePath + ". This browser can't write back to the folder: use Download Edited Save, " +
        "then replace the file yourself (Chrome or Edge can install directly).");
    }
  }

  async function findSave() {
    setStatus("Opening folder picker ...");
    if (typeof window.showDirectoryPicker !== "function") {
      setStatus("This browser can't open folders directly (" + (window.isSecureContext ? "no support" : "page not in a secure context") +
        "). Using the basic folder chooser instead.");
      $("folder-input").click();
      return;
    }
    try {
      const root = await window.showDirectoryPicker({ id: "bbport", mode: "readwrite" });
      await searchIn(root);
    } catch (e) {
      if (e && e.name === "AbortError") { setStatus("Folder picker cancelled."); return; }
      setStatus("Folder picker failed (" + (e && e.name) + ": " + (e && e.message) + "). Using the basic folder chooser instead.");
      alert("The browser refused direct folder access (" + (e && e.name) + "). I'll open the basic folder chooser instead.");
      $("folder-input").click();
    }
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
    $("file-input").addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
    $("btn-find").addEventListener("click", findSave);
    $("folder-input").addEventListener("change", (e) => { loadFromFolderInput(e.target.files); e.target.value = ""; });
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
