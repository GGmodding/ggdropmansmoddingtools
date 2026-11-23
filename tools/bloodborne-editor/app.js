(() => {
  "use strict";
  const S = window.BBSave;
  const $ = (id) => document.getElementById(id);

  let original = null; // Uint8Array as loaded - never modified
  let loadedValues = null;
  let fileName = "userdata0000";
  const inputs = {};

  function setStatus(msg) { $("status").textContent = msg; }

  function currentValues() {
    const v = {};
    for (const f of S.FIELDS) v[f.id] = Number(inputs[f.id].value);
    return v;
  }

  function markDirty() {
    if (!loadedValues) return;
    const cur = currentValues();
    const dirty = S.FIELDS.some((f) => cur[f.id] !== loadedValues[f.id]);
    $("dirty-pill").hidden = !dirty;
  }

  function buildFields() {
    const host = $("fields");
    host.innerHTML = "";
    const groups = [["main", "Progress"], ["stat", "Attributes"]];
    for (const [g, title] of groups) {
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

  async function loadFile(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = S.validate(bytes);
      if (!check.ok) { setStatus(check.error); alert(check.error); return; }
      original = bytes;
      fileName = file.name || "userdata0000";
      loadedValues = S.readFields(bytes);
      $("char-name").textContent = "Character: " + S.readName(bytes) + "  (" + fileName + ")";
      $("empty-state").hidden = true;
      $("tabs").hidden = false;
      showTab("character");
      fillInputs(loadedValues);
      $("btn-backup").disabled = false;
      $("btn-save").disabled = false;
      setStatus("Loaded " + fileName + ". Edit the values, then Download Edited Save.");
    } catch (e) {
      setStatus("Could not read the file: " + e.message);
    }
  }

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

  function init() {
    buildFields();
    $("file-input").addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
    for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => showTab(t.dataset.tab));

    $("btn-backup").addEventListener("click", () => {
      if (!original) return;
      download(original, fileName + "_backup_" + stamp() + ".bak");
      setStatus("Backup downloaded (the original, unedited bytes).");
    });

    $("btn-save").addEventListener("click", () => {
      if (!original) return;
      try {
        const edited = S.applyFields(original, currentValues());
        download(edited, fileName);
        setStatus("Downloaded edited " + fileName + ". Close the game, keep a backup, then replace the file in SPRJ0005.");
      } catch (e) {
        setStatus("Cannot save: " + e.message);
        alert("Cannot save: " + e.message);
      }
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
