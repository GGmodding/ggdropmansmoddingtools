(() => {
  "use strict";

  const S = window.Schedule1Save;
  const $ = (id) => document.getElementById(id);

  const state = {
    files: null,
    folderName: "SaveGame",
    dirty: false,
    activeFile: null,
  };

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("dirty-pill").hidden = !dirty;
    $("btn-save").disabled = !state.files;
    $("btn-backup").disabled = !state.files;
  }

  function markEdited() {
    setDirty(true);
  }

  function showEditor(show) {
    $("empty-state").hidden = show;
    $("tabs").hidden = !show;
    ["overview", "money", "rank", "products", "files"].forEach((id) => {
      $("panel-" + id).hidden = !show;
    });
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === "panel-" + tab);
    });
  }

  function money() {
    return S.getJson(state.files, S.KEY_FILES.money);
  }

  function rank() {
    return S.getJson(state.files, S.KEY_FILES.rank);
  }

  function game() {
    return S.getJson(state.files, S.KEY_FILES.game);
  }

  function time() {
    return S.getJson(state.files, S.KEY_FILES.time);
  }

  function metadata() {
    return S.getJson(state.files, S.KEY_FILES.metadata);
  }

  function products() {
    return S.getJson(state.files, S.KEY_FILES.products);
  }

  function inventory() {
    return S.getJson(state.files, S.KEY_FILES.inventory);
  }

  function fillRankSelect() {
    const sel = $("f-rank");
    sel.innerHTML = "";
    for (const r of S.RANKS) {
      const opt = document.createElement("option");
      opt.value = String(r.id);
      opt.textContent = r.name;
      sel.appendChild(opt);
    }
  }

  function writeForms() {
    const g = game();
    const t = time();
    const m = metadata();
    const mon = money();
    const r = rank();
    const inv = inventory();

    $("f-org").value = (g && g.OrganisationName) || "";
    $("f-game-version").value = (g && g.GameVersion) || (mon && mon.GameVersion) || "";
    $("f-days").value = t && t.ElapsedDays != null ? t.ElapsedDays : "";
    $("f-last-played").value = (m && (m.LastPlayedDate || m.CreationDate)) || "";

    $("f-bank").value = mon && mon.OnlineBalance != null ? mon.OnlineBalance : 0;
    $("f-networth").value = mon && mon.Networth != null ? mon.Networth : 0;
    $("f-lifetime").value = mon && mon.LifetimeEarnings != null ? mon.LifetimeEarnings : 0;
    $("f-cash").value = inv ? S.getCashBalance(inv) : 0;

    if (r) {
      $("f-rank").value = String(r.Rank != null ? r.Rank : 0);
      $("f-tier").value = String(r.Tier != null ? r.Tier : 1);
      $("f-xp").value = r.XP != null ? r.XP : 0;
      $("f-total-xp").value = r.TotalXP != null ? r.TotalXP : 0;
    }

    const org = (g && g.OrganisationName) || "Unknown org";
    const rankText = r ? S.rankLabel(r.Rank, r.Tier) : "—";
    const bank = mon && mon.OnlineBalance != null ? Number(mon.OnlineBalance).toLocaleString() : "—";
    const days = t && t.ElapsedDays != null ? t.ElapsedDays : "—";
    $("overview-meta").innerHTML =
      "<span>Org <strong>" + escapeHtml(org) + "</strong></span>" +
      "<span>Rank <strong>" + escapeHtml(rankText) + "</strong></span>" +
      "<span>Bank <strong>$" + escapeHtml(String(bank)) + "</strong></span>" +
      "<span>Day <strong>" + escapeHtml(String(days)) + "</strong></span>" +
      "<span>Files <strong>" + Object.keys(state.files).length + "</strong></span>";

    renderProducts();
    renderFileList();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applyOverview() {
    const g = game();
    if (g) {
      g.OrganisationName = $("f-org").value;
      S.markDirty(state.files, S.KEY_FILES.game);
      S.flushJson(state.files, S.KEY_FILES.game);
    }
    const t = time();
    if (t) {
      t.ElapsedDays = Number($("f-days").value) || 0;
      S.markDirty(state.files, S.KEY_FILES.time);
      S.flushJson(state.files, S.KEY_FILES.time);
    }
    markEdited();
    writeForms();
  }

  function applyMoney() {
    const mon = money();
    if (mon) {
      mon.OnlineBalance = Number($("f-bank").value) || 0;
      mon.Networth = Number($("f-networth").value) || 0;
      mon.LifetimeEarnings = Number($("f-lifetime").value) || 0;
      S.markDirty(state.files, S.KEY_FILES.money);
      S.flushJson(state.files, S.KEY_FILES.money);
    }
    const inv = inventory();
    if (inv) {
      S.setCashBalance(inv, Number($("f-cash").value) || 0);
      S.markDirty(state.files, S.KEY_FILES.inventory);
      S.flushJson(state.files, S.KEY_FILES.inventory);
    }
    markEdited();
    writeForms();
  }

  function applyRank(opts = {}) {
    const r = rank();
    if (!r) {
      setStatus("No Rank.json in this save.");
      return;
    }
    const rankId = Number($("f-rank").value) || 0;
    const tier = Number($("f-tier").value) || 1;
    r.Rank = rankId;
    r.Tier = tier;
    r.XP = Number($("f-xp").value) || 0;
    if (opts.syncTotal) {
      r.TotalXP = S.totalXpForRankTier(rankId, tier) + r.XP;
      $("f-total-xp").value = r.TotalXP;
    } else {
      r.TotalXP = Number($("f-total-xp").value) || 0;
    }
    S.markDirty(state.files, S.KEY_FILES.rank);
    S.flushJson(state.files, S.KEY_FILES.rank);
    markEdited();
    writeForms();
  }

  function renderProducts() {
    const tbody = $("product-table").querySelector("tbody");
    tbody.innerHTML = "";
    const prod = products();
    if (!prod) {
      tbody.innerHTML = "<tr><td colspan='5'>No Products.json found.</td></tr>";
      return;
    }
    const q = ($("product-search").value || "").trim().toLowerCase();
    const rows = S.listProducts(prod).filter((p) => {
      if (!q) return true;
      return (p.name + " " + p.id + " " + p.source).toLowerCase().includes(q);
    });
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='5'>No products match.</td></tr>";
      return;
    }
    for (const p of rows) {
      const tr = document.createElement("tr");
      const mainHex = S.rgbaToHex(p.mainColor);
      const secHex = S.rgbaToHex(p.secondaryColor);
      tr.innerHTML =
        "<td><input type='text' data-act='name' value=\"" + escapeAttr(p.name) + "\" /></td>" +
        "<td><code>" + escapeHtml(p.id) + "</code></td>" +
        "<td>" + escapeHtml(p.source) + " #" + p.index + "</td>" +
        "<td>" + (p.mainColor
          ? "<input type='color' data-act='main' value='" + mainHex + "' />"
          : "—") + "</td>" +
        "<td>" + (p.secondaryColor
          ? "<input type='color' data-act='sec' value='" + secHex + "' />"
          : "—") + "</td>";
      tr.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", () => {
          const patch = {};
          if (input.dataset.act === "name") patch.name = input.value;
          if (input.dataset.act === "main") patch.mainColor = S.hexToRgba(input.value);
          if (input.dataset.act === "sec") patch.secondaryColor = S.hexToRgba(input.value);
          S.updateProduct(prod, p.source, p.index, patch);
          S.markDirty(state.files, S.KEY_FILES.products);
          S.flushJson(state.files, S.KEY_FILES.products);
          markEdited();
          renderFileList();
        });
      });
      tbody.appendChild(tr);
    }
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderFileList() {
    const list = $("file-list");
    list.innerHTML = "";
    const keys = Object.keys(state.files).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const entry = state.files[key];
      const row = document.createElement("button");
      row.type = "button";
      row.className = "file-row" + (entry.dirty ? " is-dirty" : "");
      row.innerHTML = "<code>" + escapeHtml(key) + "</code><span>" +
        (entry.dirty ? "edited" : formatBytes(entry.text.length)) + "</span>";
      row.addEventListener("click", () => {
        state.activeFile = key;
        if (entry.data == null) {
          try {
            entry.data = S.parseJsonText(entry.text, key);
          } catch (_) { /* show raw text */ }
        }
        $("raw-json").value = entry.data != null
          ? JSON.stringify(entry.data, null, 2)
          : entry.text;
        setStatus("Viewing " + key);
      });
      list.appendChild(row);
    }
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  async function loadFromFileList(fileList) {
    const entries = [];
    const files = [...fileList].filter((f) => /\.json$/i.test(f.name) || /\.json$/i.test(f.webkitRelativePath || ""));
    if (!files.length) throw new Error("No .json files found.");
    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;
      const text = await file.text();
      entries.push({ relativePath, text });
    }
    const built = S.buildFromFileList(entries);
    state.files = built.files;
    state.folderName = guessFolderName(entries) || built.rootName || "SaveGame";
    afterLoad(files.length + " files from folder");
  }

  function guessFolderName(entries) {
    for (const e of entries) {
      const parts = S.normalizePath(e.relativePath).split("/");
      const hit = parts.find((p) => /^SaveGame_\d+$/i.test(p));
      if (hit) return hit;
    }
    return null;
  }

  async function loadFromZipFile(file) {
    const buf = await file.arrayBuffer();
    const built = await S.buildFromZip(buf);
    state.files = built.files;
    state.folderName = built.rootName && /^SaveGame/i.test(built.rootName)
      ? built.rootName
      : "SaveGame_1";
    afterLoad("ZIP: " + file.name);
  }

  function afterLoad(label) {
    showEditor(true);
    writeForms();
    setDirty(false);
    // Clear dirty flags after initial parse flush isn't needed
    for (const e of Object.values(state.files)) e.dirty = false;
    setStatus("Loaded " + label + " · " + Object.keys(state.files).length + " JSON files · exporting as " + state.folderName);
    switchTab("overview");
  }

  async function downloadZip(asBackup) {
    if (!state.files) return;
    // Re-apply current form values so nothing is stale
    applyOverview();
    applyMoney();
    applyRank();
    const blob = await S.toZipBlob(state.files, state.folderName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (state.folderName || "SaveGame") + (asBackup ? "_backup.zip" : "_edited.zip");
    a.click();
    URL.revokeObjectURL(url);
    if (!asBackup) {
      setDirty(false);
      for (const e of Object.values(state.files)) {
        if (e.dirty) e.dirty = false;
      }
      renderFileList();
      $("install-modal").hidden = false;
      setStatus("Downloaded edited ZIP.");
    } else {
      setStatus("Backup ZIP downloaded (original loaded snapshot + any edits).");
    }
  }

  function bindForms() {
    ["f-org", "f-days"].forEach((id) => {
      $(id).addEventListener("change", applyOverview);
    });
    ["f-bank", "f-cash", "f-networth", "f-lifetime"].forEach((id) => {
      $(id).addEventListener("change", applyMoney);
    });
    ["f-rank", "f-tier", "f-xp", "f-total-xp"].forEach((id) => {
      $(id).addEventListener("change", () => applyRank());
    });
    $("btn-sync-total-xp").addEventListener("click", () => applyRank({ syncTotal: true }));
    $("btn-rank-kingpin").addEventListener("click", () => {
      $("f-rank").value = "10";
      $("f-tier").value = "1";
      $("f-xp").value = "0";
      applyRank({ syncTotal: true });
    });
    $("btn-money-100k").addEventListener("click", () => {
      $("f-bank").value = "100000";
      applyMoney();
    });
    $("btn-money-1m").addEventListener("click", () => {
      $("f-bank").value = "1000000";
      applyMoney();
    });
    $("btn-cash-50k").addEventListener("click", () => {
      $("f-cash").value = "50000";
      applyMoney();
    });
    $("product-search").addEventListener("input", renderProducts);
  }

  function bindUi() {
    fillRankSelect();
    bindForms();

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    $("folder-input").addEventListener("change", async (e) => {
      try {
        await loadFromFileList(e.target.files);
      } catch (err) {
        setStatus(err.message || String(err));
        alert(err.message || String(err));
      }
      e.target.value = "";
    });

    $("zip-input").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await loadFromZipFile(file);
      } catch (err) {
        setStatus(err.message || String(err));
        alert(err.message || String(err));
      }
      e.target.value = "";
    });

    $("btn-save").addEventListener("click", () => downloadZip(false));
    $("btn-backup").addEventListener("click", () => downloadZip(true));
    $("btn-close-modal").addEventListener("click", () => {
      $("install-modal").hidden = true;
    });
    $("install-modal").addEventListener("click", (e) => {
      if (e.target === $("install-modal")) $("install-modal").hidden = true;
    });

    // Drag & drop
    const overlay = $("drop-overlay");
    let dragDepth = 0;

    function hasFiles(e) {
      return e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
    }

    window.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth += 1;
      overlay.hidden = false;
    });
    window.addEventListener("dragleave", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay.hidden = true;
    });
    window.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    });
    window.addEventListener("drop", async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      overlay.hidden = true;
      const items = e.dataTransfer.files;
      if (!items || !items.length) return;
      try {
        const first = items[0];
        if (/\.zip$/i.test(first.name) || first.type === "application/zip") {
          await loadFromZipFile(first);
        } else {
          await loadFromFileList(items);
        }
      } catch (err) {
        setStatus(err.message || String(err));
        alert(err.message || String(err));
      }
    });
  }

  bindUi();
})();
