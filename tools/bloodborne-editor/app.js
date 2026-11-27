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
  let loadedInv = [];      // inventory records as loaded
  const invInputs = {};    // slot -> count <input> (stackable goods only)
  const swapInputs = {};   // slot -> 'change into' <input> (weapons and armor)
  const NO_SWAP = new Set([1000000, 1000]); // bare fists / hunter's pocket slots: leave alone
  let pendingAdds = [];    // [{ kind, baseId, name, count }] new items to append on save
  const ITEMS = window.BBItems || { goods: [], weapons: [], armor: [] };
  const NAMES = { goods: new Map(ITEMS.goods), weapon: new Map(ITEMS.weapons), armor: new Map(ITEMS.armor) };

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
    $("dirty-pill").hidden = !(S.FIELDS.some((f) => cur[f.id] !== loadedValues[f.id]) || invDirty());
  }

  function buildFields() {
    const host = $("fields");
    host.innerHTML = "";
    for (const [g, title] of [["main", "Progress"], ["stat", "Attributes"], ["vitals", "Health & Stamina (experimental)"]]) {
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
    for (const id of ["character", "inventory", "notes"]) {
      const p = $("panel-" + id);
      const on = id === name;
      p.hidden = !on;
      p.classList.toggle("is-active", on);
    }
  }

  /* ---- inventory ---- */
  function itemName(r) {
    const m = NAMES[r.type];
    return (m && m.get(r.baseId)) || ("Unknown " + r.type + " (" + r.baseId + ")");
  }

  function invCounts() {
    const c = {};
    for (const r of loadedInv) {
      const inp = invInputs[r.slot];
      if (inp && Number(inp.value) !== r.count) c[r.slot] = Number(inp.value);
    }
    return c;
  }
  // slot -> { baseId, name } for every weapon/armor row whose "change into" box names one valid item
  function resolveSwap(r, txt) {
    txt = (txt || "").trim().toLowerCase();
    if (!txt) return null;
    const list = KIND_LIST[r.type]();
    let hit = list.find((g) => (g[1] + " (" + g[0] + ")").toLowerCase() === txt);
    if (!hit) { const m = list.filter((g) => g[1].toLowerCase().indexOf(txt) >= 0); if (m.length === 1) hit = m[0]; }
    return hit ? { baseId: hit[0], name: hit[1] } : null;
  }
  function invSwaps() {
    const out = [];
    for (const r of loadedInv) {
      const inp = swapInputs[r.slot];
      if (!inp) continue;
      const hit = resolveSwap(r, inp.value);
      if (hit && hit.baseId !== r.baseId) out.push({ slot: r.slot, baseId: hit.baseId, name: hit.name });
    }
    return out;
  }
  function invDirty() { return Object.keys(invCounts()).length > 0 || pendingAdds.length > 0 || invSwaps().length > 0; }

  function buildEdited() {
    let out = S.applyInventory(S.applyFields(original, currentValues()), invCounts());
    for (const w of invSwaps()) out = S.replaceItem(out, w.slot, w.baseId);
    for (const p of pendingAdds) out = S.addItem(out, p.kind, p.baseId, p.count);
    return out;
  }

  /* ---- adding new items ---- */
  const VALID = window.BBValid || null;
  function onlyValid(list, key) {
    if (!VALID || !VALID[key]) return list;
    const s = new Set(VALID[key]);
    return list.filter((g) => s.has(g[0]));
  }
  const KIND_LIST = {
    goods: () => onlyValid(ITEMS.goods, "goods"),
    weapon: () => onlyValid(ITEMS.weapons, "weapon"),
    armor: () => onlyValid(ITEMS.armor, "armor"),
  };
  function addKind() { return $("add-kind").value; }
  function ownedGoodsIds() {
    const s = new Set();
    for (const r of loadedInv) if (r.type === "goods") s.add(r.baseId);
    for (const p of pendingAdds) if (p.kind === "goods") s.add(p.baseId);
    return s;
  }
  function refreshAddList() {
    const dl = $("add-list");
    if (!dl) return;
    dl.innerHTML = "";
    const kind = addKind();
    const owned = kind === "goods" ? ownedGoodsIds() : new Set();
    for (const g of KIND_LIST[kind]()) {
      if (owned.has(g[0])) continue;
      const o = document.createElement("option");
      o.value = g[1] + " (" + g[0] + ")";
      dl.appendChild(o);
    }
    $("add-count").disabled = kind !== "goods";
  }
  function renderPending() {
    const ul = $("add-pending");
    ul.innerHTML = "";
    pendingAdds.forEach((p, i) => {
      const li = document.createElement("li");
      li.textContent = p.name + " (" + p.kind + ")" + (p.kind === "goods" ? " x" + p.count : "") + "  ";
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Remove";
      b.addEventListener("click", () => { pendingAdds.splice(i, 1); renderPending(); refreshAddList(); markDirty(); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    ul.hidden = pendingAdds.length === 0;
  }
  function addPending() {
    if (!original) { fail("Load a save first."); return; }
    const kind = addKind();
    const list = KIND_LIST[kind]();
    const txt = $("add-item").value.trim().toLowerCase();
    const count = kind === "goods" ? Math.trunc(Number($("add-count").value)) : 1;
    if (!(count >= S.COUNT_MIN && count <= S.COUNT_MAX)) { fail("Count must be " + S.COUNT_MIN + " to " + S.COUNT_MAX + "."); return; }
    const owned = kind === "goods" ? ownedGoodsIds() : new Set();
    let hit = list.find((g) => (g[1] + " (" + g[0] + ")").toLowerCase() === txt);
    if (!hit) { const m = list.filter((g) => !owned.has(g[0]) && g[1].toLowerCase().indexOf(txt) >= 0); if (txt && m.length === 1) hit = m[0]; }
    if (!hit) { fail("Pick one item from the list (type part of the name and choose it)."); return; }
    if (owned.has(hit[0])) { fail(hit[1] + " is already in your inventory - change its count in the table instead."); return; }
    pendingAdds.push({ kind, baseId: hit[0], name: hit[1], count });
    $("add-item").value = "";
    renderPending(); refreshAddList(); markDirty();
    setStatus("Queued " + hit[1] + ". It is added when you install or download.");
  }

  function renderInventory() {
    const body = $("inv-table").querySelector("tbody");
    body.innerHTML = "";
    for (const k of Object.keys(invInputs)) delete invInputs[k];
    for (const k of Object.keys(swapInputs)) delete swapInputs[k];
    for (const r of loadedInv) {
      const tr = document.createElement("tr");
      tr.dataset.search = (itemName(r) + " " + r.type + " " + r.baseId).toLowerCase();
      const cells = [r.slot, itemName(r), r.type, r.baseId];
      for (const c of cells) { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); }
      const td = document.createElement("td");
      if (r.type === "goods") {
        const inp = document.createElement("input");
        inp.type = "number";
        inp.min = S.COUNT_MIN;
        inp.max = S.COUNT_MAX;
        inp.step = "1";
        inp.value = r.count;
        inp.style.width = "5.5rem";
        inp.addEventListener("input", markDirty);
        invInputs[r.slot] = inp;
        td.appendChild(inp);
      } else {
        td.textContent = r.count;
      }
      tr.appendChild(td);
      const td2 = document.createElement("td");
      if ((r.type === "weapon" || r.type === "armor") && !NO_SWAP.has(r.baseId)) {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.setAttribute("list", "swap-list-" + r.type);
        inp.placeholder = "change into...";
        inp.autocomplete = "off";
        inp.style.width = "14rem";
        inp.addEventListener("input", markDirty);
        swapInputs[r.slot] = inp;
        td2.appendChild(inp);
      }
      tr.appendChild(td2);
      body.appendChild(tr);
    }
    for (const kind of ["weapon", "armor"]) {
      const dl = $("swap-list-" + kind);
      if (!dl) continue;
      dl.innerHTML = "";
      for (const g of KIND_LIST[kind]()) { const o = document.createElement("option"); o.value = g[1] + " (" + g[0] + ")"; dl.appendChild(o); }
    }
    $("inv-summary").textContent = loadedInv.length + " items found in the main inventory table.";
    refreshAddList();
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
    pendingAdds = [];
    loadedInv = S.readInventory(bytes);
    renderPending();
    renderInventory();
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
      const edited = buildEdited();

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
      pendingAdds = [];
      loadedInv = S.readInventory(edited);
      renderPending();
      renderInventory();
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
        download(buildEdited(), fileName);
        setStatus("Downloaded edited " + fileName + ". Close the game, keep a backup, then replace the file in SPRJ0005.");
      } catch (e) { fail("Cannot save: " + e.message); }
    });

    $("btn-level").addEventListener("click", () => { inputs.level.value = S.levelFromStats(currentValues()); markDirty(); });
    $("btn-max").addEventListener("click", () => {
      for (const id of S.STAT_IDS) inputs[id].value = 99;
      inputs.level.value = S.levelFromStats(currentValues());
      markDirty();
    });
    $("btn-reset").addEventListener("click", () => { if (loadedValues) { fillInputs(loadedValues); pendingAdds = []; renderPending(); renderInventory(); markDirty(); } });
    $("btn-add-item").addEventListener("click", addPending);
    $("add-kind").addEventListener("change", () => { $("add-item").value = ""; refreshAddList(); });
    $("inv-search").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const tr of $("inv-table").querySelectorAll("tbody tr")) tr.hidden = q && tr.dataset.search.indexOf(q) < 0;
    });

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
