(() => {
  "use strict";

  const S = window.Schedule1Save;
  const D = window.Schedule1Data;
  const $ = (id) => document.getElementById(id);

  const PANELS = [
    "overview", "money", "rank", "inventory", "properties", "npcs",
    "appearance", "quests", "vehicles", "products", "storage", "presets", "files",
  ];

  const state = {
    files: null,
    folderName: "SaveGame_1",
    dirty: false,
    activeFile: null,
    rawEntries: null,
    availableSlots: [],
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function showEditor(show) {
    $("empty-state").hidden = show;
    $("tabs").hidden = !show;
    PANELS.forEach((id) => {
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

  function money() { return S.getJson(state.files, S.KEY_FILES.money); }
  function rank() { return S.getJson(state.files, S.KEY_FILES.rank); }
  function game() { return S.getJson(state.files, S.KEY_FILES.game); }
  function time() { return S.getJson(state.files, S.KEY_FILES.time); }
  function metadata() { return S.getJson(state.files, S.KEY_FILES.metadata); }
  function inventory() { return S.getJson(state.files, S.KEY_FILES.inventory); }

  function formatLastPlayed(m) {
    if (!m) return "";
    if (typeof m.LastPlayedDate === "string") return m.LastPlayedDate;
    const d = m.LastPlayedDate;
    if (d && typeof d === "object" && d.Year) {
      return [d.Year, d.Month, d.Day].map((n) => String(n).padStart(2, "0")).join("-") +
        " " + [d.Hour, d.Minute].map((n) => String(n).padStart(2, "0")).join(":");
    }
    return "";
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

  function fillItemDatalist() {
    const dl = $("item-id-list");
    dl.innerHTML = D.ITEM_IDS.map((id) => "<option value=\"" + escapeAttr(id) + "\"></option>").join("");
  }

  function writeForms() {
    if (!state.files) return;
    const g = game();
    const t = time();
    const m = metadata();
    const mon = money();
    const r = rank();
    const inv = inventory();
    const owned = S.listOwnership(state.files);
    const npcs = S.listNpcs(state.files);

    $("f-org").value = (g && g.OrganisationName) || "";
    $("f-game-version").value = (g && g.GameVersion) || (mon && mon.GameVersion) || "";
    $("f-days").value = t && t.ElapsedDays != null ? t.ElapsedDays : "";
    $("f-tod").value = t && t.TimeOfDay != null ? t.TimeOfDay : "";
    $("f-last-played").value = formatLastPlayed(m);

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
    const ownedN = owned.filter((x) => x.owned).length;
    $("overview-meta").innerHTML =
      "<span>Org <strong>" + escapeHtml(org) + "</strong></span>" +
      "<span>Rank <strong>" + escapeHtml(rankText) + "</strong></span>" +
      "<span>Bank <strong>$" + escapeHtml(String(bank)) + "</strong></span>" +
      "<span>Owned <strong>" + ownedN + "/" + owned.length + "</strong></span>" +
      "<span>People <strong>" + npcs.length + "</strong></span>" +
      "<span>Files <strong>" + Object.keys(state.files).length + "</strong></span>";

    renderInventory();
    renderOwnership();
    renderNpcs();
    renderAppearance();
    renderQuests();
    renderVehicles();
    renderProducts();
    renderRacks();
    renderPresets();
    renderFileList();
  }

  function applyOverview() {
    const g = game();
    if (g) {
      g.OrganisationName = $("f-org").value;
      S.flushJson(state.files, S.KEY_FILES.game);
    }
    const t = time();
    if (t) {
      t.ElapsedDays = Number($("f-days").value) || 0;
      if ($("f-tod").value !== "") t.TimeOfDay = Number($("f-tod").value) || 0;
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
      if ($("f-lifetime").value !== "") mon.LifetimeEarnings = Number($("f-lifetime").value) || 0;
      S.flushJson(state.files, S.KEY_FILES.money);
    }
    const inv = inventory();
    if (inv) {
      S.setCashBalance(inv, Number($("f-cash").value) || 0);
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
    S.flushJson(state.files, S.KEY_FILES.rank);
    markEdited();
    writeForms();
  }

  function renderInventory() {
    const tbody = $("inv-table").querySelector("tbody");
    tbody.innerHTML = "";
    const inv = inventory();
    if (!inv) {
      tbody.innerHTML = "<tr><td colspan='4'>No Players/Player_0/Inventory.json</td></tr>";
      return;
    }
    const gv = S.guessGameVersion(state.files);
    for (const slot of S.listInventorySlots(inv)) {
      const tr = document.createElement("tr");
      if (slot.isCash) {
        tr.innerHTML =
          "<td>" + slot.index + "</td>" +
          "<td><code>cash</code> <span class='tone-accent'>$" + escapeHtml(String(slot.cash || 0)) + "</span></td>" +
          "<td>—</td><td>CashData</td>";
      } else {
        tr.innerHTML =
          "<td>" + slot.index + "</td>" +
          "<td><input type='text' list='item-id-list' data-act='id' value=\"" + escapeAttr(slot.id) + "\" /></td>" +
          "<td><input type='number' min='0' data-act='qty' value=\"" + escapeAttr(slot.quantity) + "\" style='width:5.5rem' /></td>" +
          "<td>" + escapeHtml(slot.type) + "</td>";
        tr.querySelectorAll("input").forEach((input) => {
          input.addEventListener("change", () => {
            const id = tr.querySelector("[data-act='id']").value;
            const qty = Number(tr.querySelector("[data-act='qty']").value) || 0;
            S.setInventorySlot(inv, slot.index, id, qty, gv);
            S.flushJson(state.files, S.KEY_FILES.inventory);
            markEdited();
            renderFileList();
          });
        });
      }
      tbody.appendChild(tr);
    }
  }

  function renderOwnership() {
    const tbody = $("own-table").querySelector("tbody");
    tbody.innerHTML = "";
    const rows = S.listOwnership(state.files);
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='4'>No property/business ownership files found.</td></tr>";
      return;
    }
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(row.name) + "</td>" +
        "<td>" + escapeHtml(row.kind) + "</td>" +
        "<td><code>" + escapeHtml(row.code) + "</code></td>" +
        "<td><input type='checkbox' " + (row.owned ? "checked" : "") + " /></td>";
      tr.querySelector("input").addEventListener("change", (e) => {
        S.setOwned(state.files, row.path, e.target.checked);
        markEdited();
        writeForms();
      });
      tbody.appendChild(tr);
    }
  }

  function renderNpcs() {
    const tbody = $("npc-table").querySelector("tbody");
    tbody.innerHTML = "";
    const q = ($("npc-search").value || "").trim().toLowerCase();
    const rows = S.listNpcs(state.files).filter((n) => {
      if (!q) return true;
      return (n.name + " " + n.id + " " + n.dataType).toLowerCase().includes(q);
    });
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='7'>No NPCs folder in this save.</td></tr>";
      return;
    }
    for (const row of rows) {
      const role = row.isDealer ? "Dealer"
        : row.isSupplier ? "Supplier"
          : row.isCustomer ? "Customer"
            : (row.dataType || "NPC");
      const tier = row.relation == null ? "—" : D.relationLabel(row.relation);
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(row.name) + "<div class='hint' style='margin:0'><code>" + escapeHtml(row.id) + "</code></div></td>" +
        "<td>" + escapeHtml(role) + "</td>" +
        "<td><input type='number' step='0.1' min='0' max='5' style='width:5rem' value=\"" +
          (row.relation == null ? "" : escapeAttr(row.relation)) + "\" data-act='rel' " +
          (row.relPath ? "" : "disabled") + " /></td>" +
        "<td class='tone-accent'>" + escapeHtml(tier) + "</td>" +
        "<td><input type='checkbox' data-act='unlock' " + (row.unlocked ? "checked" : "") + " " +
          (row.relPath ? "" : "disabled") + " /></td>" +
        "<td><input type='checkbox' data-act='recruit' " + (row.recruited ? "checked" : "") + " " +
          (row.npcPath ? "" : "disabled") + " /></td>" +
        "<td><input type='number' step='0.05' min='0' max='1' style='width:5rem' value=\"" +
          (row.dependence == null ? "" : escapeAttr(row.dependence)) + "\" data-act='dep' " +
          (row.custPath ? "" : "disabled") + " /></td>";

      const apply = () => {
        const patch = {};
        const relEl = tr.querySelector("[data-act='rel']");
        const unlockEl = tr.querySelector("[data-act='unlock']");
        const recruitEl = tr.querySelector("[data-act='recruit']");
        const depEl = tr.querySelector("[data-act='dep']");
        if (relEl && !relEl.disabled) patch.relation = Number(relEl.value);
        if (unlockEl && !unlockEl.disabled) patch.unlocked = unlockEl.checked;
        if (recruitEl && !recruitEl.disabled) {
          patch.recruited = recruitEl.checked;
          patch.ensureRecruitedField = true;
        }
        if (depEl && !depEl.disabled && depEl.value !== "") patch.dependence = Number(depEl.value);
        S.updateNpc(state.files, row, patch);
        markEdited();
        renderNpcs();
        renderFileList();
      };
      tr.querySelectorAll("input").forEach((el) => el.addEventListener("change", apply));
      tbody.appendChild(tr);
    }
  }

  function renderAppearance() {
    const info = S.readAppearance(state.files);
    const missing = !info;
    $("appearance-missing").hidden = !missing;
    $("appearance-form").hidden = missing;
    $("look-preview").hidden = missing;
    if (missing) return;
    if (info.gender != null) $("f-gender").value = String(info.gender);
    if (info.weight != null) $("f-weight").value = info.weight;
    const hex = S.floatRgbToHex(info.skin);
    $("f-skin").value = hex;
    $("look-face").style.background = hex;
  }

  function applyAppearance() {
    if (!S.readAppearance(state.files)) return;
    S.writeAppearance(state.files, {
      gender: Number($("f-gender").value),
      weight: Number($("f-weight").value),
      skin: S.hexToFloatRgb($("f-skin").value),
    });
    markEdited();
    renderAppearance();
    renderFileList();
  }

  function renderQuests() {
    const tbody = $("quest-table").querySelector("tbody");
    tbody.innerHTML = "";
    const rows = S.listQuests(state.files);
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='4'>No quest data detected in this save.</td></tr>";
      return;
    }
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(row.name) + "</td>" +
        "<td><code>" + escapeHtml(row.id) + "</code></td>" +
        "<td><select data-act='state'>" +
          [0, 1, 2].map((s) =>
            "<option value='" + s + "'" + (row.state === s ? " selected" : "") + ">" + s + "</option>"
          ).join("") +
        "</select></td>" +
        "<td><code>" + escapeHtml(row.path) + "</code></td>";
      tr.querySelector("select").addEventListener("change", (e) => {
        S.setQuestState(state.files, row, Number(e.target.value));
        markEdited();
        renderFileList();
      });
      tbody.appendChild(tr);
    }
  }

  function renderVehicles() {
    const info = S.listVehicles(state.files);
    $("vehicles-missing").hidden = info.present;
    const tbody = $("veh-table").querySelector("tbody");
    tbody.innerHTML = "";
    if (!info.present) {
      tbody.innerHTML = "<tr><td colspan='3'>—</td></tr>";
      $("veh-snap-meta").textContent = "";
      return;
    }
    if (!info.vehicles.length) {
      tbody.innerHTML = "<tr><td colspan='3'>OwnedVehicles.json present (opaque / empty list).</td></tr>";
    } else {
      for (const v of info.vehicles) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + escapeHtml(v.name) + "</td>" +
          "<td><code>" + escapeHtml(v.code) + "</code></td>" +
          "<td><code>" + escapeHtml(v.guid) + "</code></td>";
        tbody.appendChild(tr);
      }
    }
    try {
      const g = game();
      const org = (g && g.OrganisationName) || "org";
      const key = "s1_vehicle_snap_" + state.folderName + "_" + org;
      const raw = localStorage.getItem(key);
      if (raw) {
        const snap = JSON.parse(raw);
        $("veh-snap-meta").textContent = "Polaroid on file from " + snap.savedAt + " (" + (snap.org || org) + ").";
      } else {
        $("veh-snap-meta").textContent = "No polaroid saved in this browser yet.";
      }
    } catch (_) {
      $("veh-snap-meta").textContent = "";
    }
  }

  function renderProducts() {
    const tbody = $("product-table").querySelector("tbody");
    tbody.innerHTML = "";
    const q = ($("product-search").value || "").trim().toLowerCase();
    const rows = S.listCreatedProducts(state.files).filter((p) => {
      if (!q) return true;
      return (p.name + " " + p.id + " " + (p.properties || []).join(" ")).toLowerCase().includes(q);
    });
    if (!rows.length) {
      tbody.innerHTML = "<tr><td colspan='5'>No created mixes found. Discover base strains or mix in-game first.</td></tr>";
      return;
    }
    for (const p of rows) {
      const tr = document.createElement("tr");
      const mainHex = p.mainColor ? S.rgbaToHex(p.mainColor) : "#888888";
      const secHex = p.secondaryColor ? S.rgbaToHex(p.secondaryColor) : "#888888";
      tr.innerHTML =
        "<td><input type='text' data-act='name' value=\"" + escapeAttr(p.name) + "\" /></td>" +
        "<td><code>" + escapeHtml(p.id) + "</code></td>" +
        "<td><input class='effects-input' type='text' data-act='fx' list='fx-list' value=\"" +
          escapeAttr((p.properties || []).join(", ")) + "\" title='Comma-separated effect IDs' /></td>" +
        "<td>" + (p.mainColor ? "<input type='color' data-act='main' value='" + mainHex + "' />" : "—") + "</td>" +
        "<td>" + (p.secondaryColor ? "<input type='color' data-act='sec' value='" + secHex + "' />" : "—") + "</td>";
      tr.querySelectorAll("input").forEach((input) => {
        input.addEventListener("change", () => {
          const patch = {};
          if (input.dataset.act === "name") patch.name = input.value;
          if (input.dataset.act === "fx") {
            patch.properties = input.value.split(",").map((s) => s.trim()).filter(Boolean);
          }
          if (input.dataset.act === "main") patch.mainColor = S.hexToRgba(input.value);
          if (input.dataset.act === "sec") patch.secondaryColor = S.hexToRgba(input.value);
          S.updateCreatedProduct(state.files, p, patch);
          markEdited();
          renderFileList();
        });
      });
      tbody.appendChild(tr);
    }
    // effects datalist once
    if (!document.getElementById("fx-list")) {
      const dl = document.createElement("datalist");
      dl.id = "fx-list";
      dl.innerHTML = D.PRODUCT_EFFECTS.map((e) => "<option value=\"" + escapeAttr(e) + "\"></option>").join("");
      document.body.appendChild(dl);
    }
  }

  function renderRacks() {
    const tbody = $("rack-table").querySelector("tbody");
    tbody.innerHTML = "";
    const racks = S.listStorageRacks(state.files);
    if (!racks.length) {
      tbody.innerHTML = "<tr><td colspan='4'>No storage rack Contents found.</td></tr>";
      return;
    }
    for (const rack of racks) {
      const filled = rack.slots.filter((s) => s.id).length;
      const preview = rack.slots.filter((s) => s.id).slice(0, 4)
        .map((s) => s.id + "×" + s.quantity).join(", ") || "empty";
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escapeHtml(rack.label) +
          (rack.isRackLike ? "" : " <span class='tone-muted'>(storage)</span>") + "</td>" +
        "<td>" + rack.slots.length + "</td>" +
        "<td>" + filled + "</td>" +
        "<td><code>" + escapeHtml(preview) + "</code></td>";
      tbody.appendChild(tr);
    }
  }

  function renderPresets() {
    const grid = $("preset-grid");
    grid.innerHTML = "";
    for (const preset of D.PRESETS) {
      const card = document.createElement("div");
      card.className = "preset-card";
      card.innerHTML =
        "<h3>" + escapeHtml(preset.name) + "</h3>" +
        "<p>" + escapeHtml(preset.blurb) + "</p>" +
        "<button type='button' class='btn btn--accent'>Apply</button>";
      card.querySelector("button").addEventListener("click", () => applyPreset(preset));
      grid.appendChild(card);
    }
  }

  function applyPreset(preset) {
    if (!state.files) return;
    if (preset.apply.includes("money")) {
      const mon = money();
      if (mon) {
        mon.OnlineBalance = Math.max(Number(mon.OnlineBalance) || 0, 100000);
        mon.Networth = Math.max(Number(mon.Networth) || 0, mon.OnlineBalance);
        S.flushJson(state.files, S.KEY_FILES.money);
      }
      const inv = inventory();
      if (inv) {
        S.setCashBalance(inv, Math.max(S.getCashBalance(inv), 25000));
        S.flushJson(state.files, S.KEY_FILES.inventory);
      }
    }
    if (preset.apply.includes("rank")) {
      const r = rank();
      if (r) {
        if (preset.id === "kingpin-run") {
          r.Rank = 10; r.Tier = 1; r.XP = 0;
          r.TotalXP = S.totalXpForRankTier(10, 1);
        } else {
          r.Rank = 0; r.Tier = 5; r.XP = 0;
          r.TotalXP = S.totalXpForRankTier(0, 5);
        }
        S.flushJson(state.files, S.KEY_FILES.rank);
      }
    }
    if (preset.apply.includes("properties")) {
      S.ownAll(state.files);
    }
    if (preset.apply.includes("npcs")) {
      for (const row of S.listNpcs(state.files)) {
        S.updateNpc(state.files, row, {
          relation: 5,
          unlocked: true,
          recruited: (/dealer/i.test(row.dataType) || row.hasRecruitedField || row.isDealer) ? true : undefined,
          ensureRecruitedField: /dealer/i.test(row.name) || row.isDealer,
          dependence: row.custPath ? 0.85 : undefined,
        });
      }
    }
    markEdited();
    writeForms();
    setStatus("Preset applied: " + preset.name);
    switchTab("overview");
  }

  function renderFileList() {
    const list = $("file-list");
    list.innerHTML = "";
    if (!state.files) return;
    const keys = Object.keys(state.files).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const entry = state.files[key];
      const row = document.createElement("button");
      row.type = "button";
      row.className = "file-row" + (entry.dirty ? " is-dirty" : "") + (state.activeFile === key ? " is-active" : "");
      row.innerHTML = "<code>" + escapeHtml(key) + "</code><span>" +
        (entry.dirty ? "edited" : formatBytes(entry.text.length)) + "</span>";
      row.addEventListener("click", () => {
        state.activeFile = key;
        if (entry.data == null) {
          try { entry.data = S.parseJsonText(entry.text, key); } catch (_) { /* show text */ }
        }
        $("raw-json").value = entry.data != null
          ? JSON.stringify(entry.data, null, 2)
          : entry.text;
        $("raw-json").readOnly = false;
        $("btn-raw-apply").disabled = false;
        $("btn-raw-format").disabled = false;
        setStatus("Editing " + key);
        renderFileList();
      });
      list.appendChild(row);
    }
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function updateSlotSelect() {
    const wrap = $("slot-wrap");
    const sel = $("slot-select");
    if (!state.availableSlots.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    sel.innerHTML = state.availableSlots.map((s) =>
      "<option value=\"" + escapeAttr(s) + "\"" + (s === state.folderName ? " selected" : "") + ">" +
      escapeHtml(s) + "</option>"
    ).join("");
  }

  function afterLoad(label) {
    showEditor(true);
    updateSlotSelect();
    writeForms();
    for (const e of Object.values(state.files)) e.dirty = false;
    setDirty(false);
    setStatus("Loaded " + label + " · " + Object.keys(state.files).length + " JSON · exporting as " + state.folderName);
    switchTab("overview");
  }

  async function loadFromFileList(fileList, preferredSlot) {
    const entries = [];
    const files = [...fileList].filter((f) =>
      /\.json$/i.test(f.name) || /\.json$/i.test(f.webkitRelativePath || "")
    );
    if (!files.length) throw new Error("No .json files found.");
    for (const file of files) {
      entries.push({
        relativePath: file.webkitRelativePath || file.name,
        text: await file.text(),
      });
    }
    const built = S.buildFromFileList(entries, { preferredSlot });
    state.files = built.files;
    state.folderName = built.rootName;
    state.rawEntries = built.rawEntries;
    state.availableSlots = built.availableSlots || [];
    afterLoad(files.length + " files");
  }

  async function loadFromZipFile(file, preferredSlot) {
    const buf = await file.arrayBuffer();
    const built = await S.buildFromZip(buf, { preferredSlot });
    state.files = built.files;
    state.folderName = built.rootName;
    state.rawEntries = built.rawEntries;
    state.availableSlots = built.availableSlots || [];
    afterLoad("ZIP: " + file.name);
  }

  async function switchSlot(slotName) {
    if (!state.rawEntries) return;
    const built = S.buildFromFileList(state.rawEntries, { preferredSlot: slotName });
    state.files = built.files;
    state.folderName = built.rootName;
    state.availableSlots = built.availableSlots || [];
    afterLoad("slot " + slotName);
  }

  async function downloadZip(asBackup) {
    if (!state.files) return;
    applyOverview();
    applyMoney();
    applyRank();
    applyAppearance();
    const blob = await S.toZipBlob(state.files, state.folderName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (state.folderName || "SaveGame") + (asBackup ? "_backup.zip" : "_edited.zip");
    a.click();
    URL.revokeObjectURL(url);
    if (!asBackup) {
      for (const e of Object.values(state.files)) e.dirty = false;
      setDirty(false);
      renderFileList();
      $("install-modal").hidden = false;
      setStatus("Downloaded edited ZIP.");
    } else {
      setStatus("Backup ZIP downloaded.");
    }
  }

  function bindUi() {
    fillRankSelect();
    fillItemDatalist();

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    ["f-org", "f-days", "f-tod"].forEach((id) => $(id).addEventListener("change", applyOverview));
    ["f-bank", "f-cash", "f-networth", "f-lifetime"].forEach((id) => $(id).addEventListener("change", applyMoney));
    ["f-rank", "f-tier", "f-xp", "f-total-xp"].forEach((id) => $(id).addEventListener("change", () => applyRank()));
    ["f-gender", "f-weight", "f-skin"].forEach((id) => $(id).addEventListener("change", applyAppearance));
    $("f-skin").addEventListener("input", () => {
      $("look-face").style.background = $("f-skin").value;
    });

    $("btn-sync-total-xp").addEventListener("click", () => applyRank({ syncTotal: true }));
    $("btn-rank-kingpin").addEventListener("click", () => {
      $("f-rank").value = "10";
      $("f-tier").value = "1";
      $("f-xp").value = "0";
      applyRank({ syncTotal: true });
    });
    $("btn-money-100k").addEventListener("click", () => { $("f-bank").value = "100000"; applyMoney(); });
    $("btn-money-1m").addEventListener("click", () => { $("f-bank").value = "1000000"; applyMoney(); });
    $("btn-cash-50k").addEventListener("click", () => { $("f-cash").value = "50000"; applyMoney(); });

    $("btn-inv-fill-empty").addEventListener("click", () => {
      const inv = inventory();
      if (!inv) return;
      const id = ($("inv-fill-id").value || "").trim();
      const qty = Number($("inv-fill-qty").value) || 0;
      if (!id) return alert("Pick an item ID first.");
      const gv = S.guessGameVersion(state.files);
      for (const slot of S.listInventorySlots(inv)) {
        if (slot.isCash || slot.id) continue;
        S.setInventorySlot(inv, slot.index, id, qty, gv);
      }
      S.flushJson(state.files, S.KEY_FILES.inventory);
      markEdited();
      renderInventory();
    });
    $("btn-inv-clear").addEventListener("click", () => {
      const inv = inventory();
      if (!inv) return;
      const gv = S.guessGameVersion(state.files);
      for (const slot of S.listInventorySlots(inv)) {
        if (slot.isCash) continue;
        S.setInventorySlot(inv, slot.index, "", 0, gv);
      }
      S.flushJson(state.files, S.KEY_FILES.inventory);
      markEdited();
      renderInventory();
    });

    $("btn-own-all").addEventListener("click", () => {
      const n = S.ownAll(state.files);
      markEdited();
      writeForms();
      setStatus("Owned " + n + " properties/businesses.");
    });
    $("btn-own-props").addEventListener("click", () => {
      const n = S.ownAll(state.files, "property");
      markEdited(); writeForms(); setStatus("Owned " + n + " properties.");
    });
    $("btn-own-biz").addEventListener("click", () => {
      const n = S.ownAll(state.files, "business");
      markEdited(); writeForms(); setStatus("Owned " + n + " businesses.");
    });

    $("npc-search").addEventListener("input", renderNpcs);
    $("btn-npc-loyal").addEventListener("click", () => {
      for (const row of S.listNpcs(state.files)) {
        S.updateNpc(state.files, row, { relation: 5, unlocked: true });
      }
      markEdited(); renderNpcs(); setStatus("All relations set to Loyal.");
    });
    $("btn-npc-unlock").addEventListener("click", () => {
      for (const row of S.listNpcs(state.files)) {
        S.updateNpc(state.files, row, { unlocked: true });
      }
      markEdited(); renderNpcs(); setStatus("All NPCs unlocked.");
    });
    $("btn-npc-recruit").addEventListener("click", () => {
      let n = 0;
      for (const row of S.listNpcs(state.files)) {
        if (!row.npcPath) continue;
        S.updateNpc(state.files, row, { recruited: true, ensureRecruitedField: true, unlocked: true });
        n += 1;
      }
      markEdited(); renderNpcs(); setStatus("Recruited flag set on " + n + " NPC files.");
    });

    $("btn-quests-complete").addEventListener("click", () => {
      const n = S.completeAllQuests(state.files);
      markEdited(); renderQuests(); setStatus("Completed " + n + " quest entries.");
    });
    $("btn-quests-reset").addEventListener("click", () => {
      let n = 0;
      for (const row of S.listQuests(state.files)) {
        if (S.setQuestState(state.files, row, 0)) n += 1;
      }
      markEdited(); renderQuests(); setStatus("Reset " + n + " quest entries.");
    });

    $("btn-veh-snap").addEventListener("click", () => {
      try {
        const snap = S.saveVehicleSnapshot(state.files, state.folderName);
        setStatus("Vehicle polaroid saved (" + snap.savedAt + ").");
        renderVehicles();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-veh-restore").addEventListener("click", () => {
      try {
        const snap = S.restoreVehicleSnapshot(state.files, state.folderName);
        markEdited();
        renderVehicles();
        renderFileList();
        setStatus("Restored vehicle polaroid from " + snap.savedAt);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("product-search").addEventListener("input", renderProducts);
    $("btn-discover-base").addEventListener("click", () => {
      const n = S.discoverProducts(state.files, [
        "ogkush", "sourdiesel", "greencrack", "granddaddypurple", "meth", "cocaine",
      ]);
      markEdited(); writeForms();
      setStatus("Discovered " + n + " new product IDs.");
    });

    $("btn-kit-grow").addEventListener("click", () => {
      const n = S.fillAllStorage(state.files, D.STORAGE_KITS.grow);
      markEdited(); renderRacks(); setStatus("Grow kit applied to " + n + " racks.");
    });
    $("btn-kit-mix").addEventListener("click", () => {
      const n = S.fillAllStorage(state.files, D.STORAGE_KITS.mix);
      markEdited(); renderRacks(); setStatus("Mix kit applied to " + n + " racks.");
    });
    $("btn-kit-meth").addEventListener("click", () => {
      const n = S.fillAllStorage(state.files, D.STORAGE_KITS.meth);
      markEdited(); renderRacks(); setStatus("Meth chem kit applied to " + n + " racks.");
    });

    $("btn-raw-apply").addEventListener("click", () => {
      if (!state.activeFile || !state.files[state.activeFile]) return;
      try {
        const data = S.parseJsonText($("raw-json").value, state.activeFile);
        S.setEntryData(state.files, state.activeFile, data);
        markEdited();
        writeForms();
        setStatus("Applied raw JSON to " + state.activeFile);
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-raw-format").addEventListener("click", () => {
      try {
        const data = JSON.parse($("raw-json").value);
        $("raw-json").value = JSON.stringify(data, null, 2);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("folder-input").addEventListener("change", async (e) => {
      try { await loadFromFileList(e.target.files); }
      catch (err) { setStatus(err.message || String(err)); alert(err.message || String(err)); }
      e.target.value = "";
    });
    $("zip-input").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try { await loadFromZipFile(file); }
      catch (err) { setStatus(err.message || String(err)); alert(err.message || String(err)); }
      e.target.value = "";
    });
    $("slot-select").addEventListener("change", async (e) => {
      try { await switchSlot(e.target.value); }
      catch (err) { alert(err.message || String(err)); }
    });

    $("btn-save").addEventListener("click", () => downloadZip(false));
    $("btn-backup").addEventListener("click", () => downloadZip(true));
    $("btn-close-modal").addEventListener("click", () => { $("install-modal").hidden = true; });
    $("install-modal").addEventListener("click", (e) => {
      if (e.target === $("install-modal")) $("install-modal").hidden = true;
    });

    if (window.GGSaveFolders) {
      GGSaveFolders.wireEditor("schedule1", {
        setStatus,
        async onDirectory(handle) {
          const collected = await GGSaveFolders.collectFilesFromDirectory(
            handle,
            (name) => /\.json$/i.test(name)
          );
          if (!collected.length) throw new Error("No .json files in that folder.");
          const entries = [];
          for (const item of collected) {
            entries.push({
              relativePath: item.relativePath,
              text: await item.file.text(),
            });
          }
          const built = S.buildFromFileList(entries, {});
          state.files = built.files;
          state.folderName = built.rootName || handle.name;
          state.rawEntries = built.rawEntries;
          state.availableSlots = built.availableSlots || [];
          afterLoad(handle.name + " · " + collected.length + " JSON");
        },
      });
    }

    const overlay = $("drop-overlay");
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
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
    window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener("drop", async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      overlay.hidden = true;
      const items = e.dataTransfer.files;
      if (!items || !items.length) return;
      try {
        const first = items[0];
        if (/\.zip$/i.test(first.name) || first.type === "application/zip") await loadFromZipFile(first);
        else await loadFromFileList(items);
      } catch (err) {
        setStatus(err.message || String(err));
        alert(err.message || String(err));
      }
    });
  }

  bindUi();
})();
