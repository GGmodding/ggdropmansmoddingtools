(() => {
  "use strict";

  const S = window.SubnauticaSave;
  const D = window.SubnauticaData;
  const Inv = window.SubnauticaInventory;
  const Pda = window.SubnauticaPda;
  const Enc = window.SubnauticaEncyclopedia;
  const Rad = window.SubnauticaRadiation;
  const Pos = window.SubnauticaPosition;
  const Base = window.SubnauticaBase;
  const Veh = window.SubnauticaVehicles;
  const Story = window.SubnauticaStory;
  const Vit = window.SubnauticaVitals;
  const $ = (id) => document.getElementById(id);

  const PANELS = ["overview", "mode", "vitals", "inventory", "tools", "cheats", "presets", "files"];

  const state = {
    files: null,
    folderName: "slot0000",
    dirty: false,
    activeFile: null,
    rawEntries: null,
    availableSlots: [],
    inventory: null,
    compareFiles: null,
    shotUrl: null,
  };

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("dirty-pill").hidden = !dirty;
    $("btn-save").disabled = !state.files;
    $("btn-backup").disabled = !state.files;
    if ($("btn-install")) $("btn-install").disabled = !state.files;
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

  function info() {
    return state.files ? S.getGameInfo(state.files) : null;
  }

  function fillModeSelect() {
    const sel = $("f-mode");
    sel.innerHTML = "";
    for (const m of D.GAME_MODES) {
      const opt = document.createElement("option");
      opt.value = String(m.id);
      opt.textContent = m.id + " · " + m.name;
      sel.appendChild(opt);
    }
  }

  function boolField(obj, key, fallback = false) {
    if (!obj || obj[key] == null) return fallback;
    return !!obj[key];
  }

  function globalObjectsKey() {
    return state.files ? S.findByBasename(state.files, "global-objects.bin") : null;
  }

  function getGlobalBytes() {
    const key = globalObjectsKey();
    if (!key) return null;
    const entry = state.files[key];
    if (!entry || !entry.bytes) return null;
    return entry.bytes instanceof Uint8Array
      ? entry.bytes
      : new Uint8Array(entry.bytes);
  }

  function setGlobalBytes(bytes) {
    const key = globalObjectsKey();
    if (!key) throw new Error("global-objects.bin missing.");
    state.files[key].bytes = bytes;
    state.files[key].dirty = true;
    state.files[key].kind = "bin";
    markEdited();
  }

  function sceneObjectsKey() {
    return state.files ? S.findByBasename(state.files, "scene-objects.bin") : null;
  }

  function getSceneBytes() {
    const key = sceneObjectsKey();
    if (!key) return null;
    const entry = state.files[key];
    if (!entry || !entry.bytes) return null;
    return entry.bytes instanceof Uint8Array
      ? entry.bytes
      : new Uint8Array(entry.bytes);
  }

  function setSceneBytes(bytes) {
    const key = sceneObjectsKey();
    if (!key) throw new Error("scene-objects.bin missing.");
    state.files[key].bytes = bytes;
    state.files[key].dirty = true;
    state.files[key].kind = "bin";
    markEdited();
  }

  function refreshPdaStatus() {
    const el = $("pda-status");
    if (!el) return;
    const bytes = getSceneBytes();
    if (!bytes) {
      el.textContent = "No scene-objects.bin — PDA unlocks unavailable.";
      return;
    }
    const n = Pda.countUnlocked(bytes);
    const e = Enc.countEncyclopedia(bytes);
    const techTotal =
      window.SubnauticaTechIds && window.SubnauticaTechIds.length
        ? window.SubnauticaTechIds.length
        : "?";
    const encyTotal =
      window.SubnauticaEncyKeys && window.SubnauticaEncyKeys.length
        ? window.SubnauticaEncyKeys.length
        : "?";
    const bp =
      n == null
        ? "blueprints unread"
        : "blueprints " + n + "/" + techTotal;
    const ency =
      e == null
        ? "encyclopedia unread"
        : "encyclopedia " + e + "/" + encyTotal;
    el.textContent = "Unlocked in save: " + bp + " · " + ency + ".";
  }

  function refreshRadiationStatus() {
    const el = $("radiation-status");
    if (!el) return;
    const bytes = getSceneBytes();
    if (!bytes) {
      el.textContent = "No scene-objects.bin — radiation tools unavailable.";
      return;
    }
    const parsed = Rad.parseRadiation(bytes);
    if (!parsed.ok) {
      el.textContent = parsed.error;
      return;
    }
    el.textContent =
      "Aurora radiation: " +
      (parsed.radiationFixed ? "fixed" : "leaking") +
      " · radius " +
      (Math.round(parsed.currentRadius * 10) / 10) +
      " (console: fixleaks).";
  }

  function refreshBaseStatus() {
    const el = $("base-status");
    if (!el) return;
    const bytes = getGlobalBytes();
    if (!bytes) {
      el.textContent = "No global-objects.bin — base flood tools unavailable.";
      return;
    }
    const s = Base.status(bytes);
    if (!s.sims) {
      el.textContent =
        "No BaseFloodSim found (no habitat, or flood data not present). Hull strength is not a save field.";
      return;
    }
    el.textContent =
      "Base flood: " +
      s.sims +
      " sim(s), " +
      s.wet +
      "/" +
      s.cells +
      " wet cells. Hull strength is computed in-game from base shape.";
  }

  function refreshVehicleStatus() {
    const el = $("vehicle-status");
    if (!el) return;
    const bytes = getGlobalBytes();
    if (!bytes) {
      el.textContent = "No global-objects.bin — vehicle tools unavailable.";
      return;
    }
    const s = Veh.status(bytes);
    el.textContent =
      "Vehicles: Seamoth ×" +
      s.seamoth +
      " · Prawn ×" +
      s.exosuit +
      " · Cyclops control ×" +
      s.cyclops +
      " · EnergyMixin ×" +
      s.energyMixins +
      ". Module editing not supported yet.";
  }

  function refreshStoryStatus() {
    const el = $("story-status");
    if (!el) return;
    const scene = getSceneBytes();
    const global = getGlobalBytes();
    const parts = [];
    if (scene) {
      const goals = Story.parseStoryGoals(scene);
      parts.push(
        goals.ok
          ? "Story goals completed: " + goals.goals.length
          : goals.error
      );
      const prison = Story.parsePrison(scene);
      if (prison.ok) {
        parts.push(
          "Emperor babies: " +
            (prison.babiesHatched ? "hatched" : "not hatched")
        );
      }
    } else {
      parts.push("No scene-objects.bin");
    }
    if (global) {
      const rocket = Story.parseRocket(global);
      parts.push(
        rocket.ok
          ? "Neptune rocket stage: " + rocket.stage
          : "No rocket in save"
      );
    }
    el.textContent = parts.join(" · ");
  }

  function refreshVitals() {
    const missing = $("vitals-missing");
    const body = $("vitals-body");
    if (!missing || !body) return;
    const bytes = getSceneBytes();
    if (!bytes) {
      missing.hidden = false;
      body.hidden = true;
      missing.textContent = "No scene-objects.bin — vitals unavailable.";
      return;
    }
    const parsed = Vit.parseVitals(bytes);
    if (!parsed.ok) {
      missing.hidden = false;
      body.hidden = true;
      missing.textContent = parsed.error;
      return;
    }
    missing.hidden = true;
    body.hidden = false;
    $("v-health").value = Vit.round1(parsed.health);
    $("v-food").value = Vit.round1(parsed.food);
    $("v-water").value = Vit.round1(parsed.water);
    $("v-oxygen").value = Vit.round1(parsed.oxygen);
    $("v-infection").value = Vit.round1(parsed.infection);
    $("vitals-hint").textContent =
      "Loaded from scene-objects.bin · O₂ max depends on tanks (45 base). Infection 0 = clear.";
  }

  function applyVitalsFromForm() {
    const bytes = getSceneBytes();
    if (!bytes) throw new Error("No scene-objects.bin loaded.");
    const result = Vit.writeVitals(bytes, {
      health: $("v-health").value,
      food: $("v-food").value,
      water: $("v-water").value,
      oxygen: $("v-oxygen").value,
      infection: $("v-infection").value,
    });
    setSceneBytes(result.bytes);
    $("v-health").value = Vit.round1(result.values.health);
    $("v-food").value = Vit.round1(result.values.food);
    $("v-water").value = Vit.round1(result.values.water);
    $("v-oxygen").value = Vit.round1(result.values.oxygen);
    $("v-infection").value = Vit.round1(result.values.infection);
    return result.values;
  }

  function roundPos(n) {
    return Math.round(Number(n) * 10) / 10;
  }

  function refreshPosition() {
    const missing = $("pos-missing");
    const body = $("pos-body");
    if (!missing || !body) return;
    const bytes = getSceneBytes();
    if (!bytes) {
      missing.hidden = false;
      body.hidden = true;
      missing.textContent = "No scene-objects.bin — position unavailable.";
      return;
    }
    const parsed = Pos.parsePosition(bytes);
    if (!parsed.ok) {
      missing.hidden = false;
      body.hidden = true;
      missing.textContent = parsed.error;
      return;
    }
    missing.hidden = true;
    body.hidden = false;
    $("p-x").value = roundPos(parsed.x);
    $("p-y").value = roundPos(parsed.y);
    $("p-z").value = roundPos(parsed.z);
  }

  function renderPosWarps() {
    const wrap = $("pos-warps");
    if (!wrap) return;
    wrap.innerHTML = Pos.WARPS.filter((w) => !w.surface)
      .map(
        (w) =>
          "<button type=\"button\" class=\"btn\" data-warp=\"" +
          escapeHtml(w.id) +
          "\" title=\"" +
          escapeHtml(w.x + ", " + w.y + ", " + w.z) +
          "\">" +
          escapeHtml(w.title) +
          "</button>"
      )
      .join("");
  }

  function applyPositionFromForm() {
    const bytes = getSceneBytes();
    if (!bytes) throw new Error("No scene-objects.bin loaded.");
    const result = Pos.writePosition(bytes, {
      x: $("p-x").value,
      y: $("p-y").value,
      z: $("p-z").value,
    });
    setSceneBytes(result.bytes);
    $("p-x").value = roundPos(result.values.x);
    $("p-y").value = roundPos(result.values.y);
    $("p-z").value = roundPos(result.values.z);
    return result.values;
  }

  function refreshInventory(keepContainer) {
    const prev = keepContainer ? $("inv-container").value : "";
    const bytes = getGlobalBytes();
    const missing = !bytes;
    $("inv-missing").hidden = !missing;
    $("inv-body").hidden = missing;
    if (missing) {
      state.inventory = null;
      return;
    }
    state.inventory = Inv.parseInventory(bytes);
    const sel = $("inv-container");
    sel.innerHTML = state.inventory.containers
      .map((c) => {
        const label =
          (c.id === state.inventory.primaryParent ? "Main · " : "") +
          c.count +
          " items · " +
          c.id.slice(0, 8) +
          "…";
        return (
          "<option value=\"" +
          escapeHtml(c.id) +
          "\">" +
          escapeHtml(label) +
          "</option>"
        );
      })
      .join("");
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
    else if (state.inventory.primaryParent) sel.value = state.inventory.primaryParent;
    renderInventoryTable();
  }

  function fillInvDatalist() {
    const db = window.SubnauticaClassIds;
    const dl = $("inv-item-list");
    if (!db || !db.curated) {
      dl.innerHTML = "";
      return;
    }
    dl.innerHTML = db.curated
      .map(
        (x) =>
          "<option value=\"" +
          escapeHtml(x.name) +
          "\"></option>"
      )
      .join("");
  }

  function renderInvKits() {
    const wrap = $("inv-kits");
    if (!wrap || !D.INVENTORY_KITS) return;
    const buttons = D.INVENTORY_KITS.map(
      (k) =>
        "<button type=\"button\" class=\"btn\" data-kit=\"" +
        escapeHtml(k.id) +
        "\" title=\"" +
        escapeHtml(k.body) +
        "\">" +
        escapeHtml(k.title) +
        "</button>"
    ).join("");
    wrap.innerHTML =
      "<span class=\"hint\" style=\"align-self:center\">Kits</span>" + buttons;
  }

  function resolveAddClassId(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
      return q.toLowerCase();
    }
    const db = window.SubnauticaClassIds;
    const lower = q.toLowerCase();
    if (db && db.curated) {
      const exact = db.curated.find(
        (x) => x.name.toLowerCase() === lower || x.spawn === lower
      );
      if (exact) return exact.id;
      const soft = db.curated.find((x) => x.name.toLowerCase().includes(lower));
      if (soft) return soft.id;
    }
    if (db && db.names) {
      for (const [id, name] of Object.entries(db.names)) {
        if (String(name).toLowerCase() === lower) return id;
      }
    }
    if (state.inventory) {
      const hit = state.inventory.items.find(
        (it) =>
          it.name.toLowerCase() === lower || it.name.toLowerCase().includes(lower)
      );
      if (hit) return hit.classId;
    }
    return null;
  }

  function renderInventoryTable() {
    if (!state.inventory) return;
    const parent = $("inv-container").value;
    const filter = ($("inv-filter").value || "").trim().toLowerCase();
    const rows = state.inventory.items.filter((it) => {
      if (parent && it.parent !== parent) return false;
      if (!filter) return true;
      return (
        it.name.toLowerCase().includes(filter) ||
        it.classId.includes(filter) ||
        it.id.includes(filter)
      );
    });
    $("inv-hint").textContent =
      rows.length +
      " item(s) in this container · " +
      rows.filter((r) => r.safe).length +
      " safely editable.";
    $("inv-table").querySelector("tbody").innerHTML = rows
      .map((it) => {
        return (
          "<tr>" +
          "<td><input type=\"checkbox\" data-inv-id=\"" +
          escapeHtml(it.id) +
          "\" " +
          (it.safe ? "" : "disabled ") +
          "/></td>" +
          "<td>" +
          escapeHtml(it.name) +
          "</td>" +
          "<td><code>" +
          escapeHtml(it.classId.slice(0, 13)) +
          "…</code></td>" +
          "<td>" +
          it.size +
          "</td>" +
          "<td class=\"" +
          (it.safe ? "tone-ok" : "tone-muted") +
          "\">" +
          (it.safe ? "Yes" : "Skip") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function selectedInvIds() {
    return [...document.querySelectorAll("#inv-table input[data-inv-id]:checked")].map(
      (el) => el.getAttribute("data-inv-id")
    );
  }

  function refreshScreenshot() {
    const wrap = $("overview-shot-wrap");
    const img = $("overview-shot");
    if (!wrap || !img) return;
    if (state.shotUrl) {
      URL.revokeObjectURL(state.shotUrl);
      state.shotUrl = null;
    }
    if (!state.files) {
      wrap.hidden = true;
      return;
    }
    const key =
      S.findByBasename(state.files, "screenshot.jpg") ||
      S.findByBasename(state.files, "screenshot.jpeg") ||
      S.findByBasename(state.files, "screenshot.png");
    if (!key || !state.files[key] || !state.files[key].bytes) {
      wrap.hidden = true;
      return;
    }
    const bytes = state.files[key].bytes;
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const blob = new Blob([u8], {
      type: /\.png$/i.test(key) ? "image/png" : "image/jpeg",
    });
    state.shotUrl = URL.createObjectURL(blob);
    img.src = state.shotUrl;
    wrap.hidden = false;
  }

  function summarizeSlot(files, label) {
    const g = S.getGameInfo(files) || {};
    const globalKey = S.findByBasename(files, "global-objects.bin");
    const sceneKey = S.findByBasename(files, "scene-objects.bin");
    const globalBytes =
      globalKey && files[globalKey] && files[globalKey].bytes
        ? files[globalKey].bytes instanceof Uint8Array
          ? files[globalKey].bytes
          : new Uint8Array(files[globalKey].bytes)
        : null;
    const sceneBytes =
      sceneKey && files[sceneKey] && files[sceneKey].bytes
        ? files[sceneKey].bytes instanceof Uint8Array
          ? files[sceneKey].bytes
          : new Uint8Array(files[sceneKey].bytes)
        : null;
    let items = null;
    let safe = null;
    if (globalBytes) {
      const inv = Inv.parseInventory(globalBytes);
      items = inv.items.length;
      safe = inv.items.filter((i) => i.safe).length;
    }
    let vitals = null;
    if (sceneBytes) {
      const v = Vit.parseVitals(sceneBytes);
      if (v.ok) {
        vitals =
          "HP " +
          Vit.round1(v.health) +
          " / food " +
          Vit.round1(v.food) +
          " / water " +
          Vit.round1(v.water) +
          " / O₂ " +
          Vit.round1(v.oxygen);
      }
    }
    let goals = null;
    let ency = null;
    let bp = null;
    if (sceneBytes) {
      const sg = Story.parseStoryGoals(sceneBytes);
      if (sg.ok) goals = sg.goals.length;
      ency = Enc.countEncyclopedia(sceneBytes);
      bp = Pda.countUnlocked(sceneBytes);
    }
    return {
      label,
      mode: S.modeName(g.gameMode),
      gameTime: S.formatGameTime(g.gameTime),
      changeSet: g.changeSet,
      items,
      safe,
      vitals,
      goals,
      ency,
      bp,
      seamoth: g.seamothPresent,
      cyclops: g.cyclopsPresent,
      base: g.basePresent,
    };
  }

  function renderCompare() {
    const out = $("compare-out");
    const clearBtn = $("btn-compare-clear");
    if (!out) return;
    if (!state.compareFiles || !state.files) {
      out.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      return;
    }
    const a = summarizeSlot(state.files, state.folderName || "Current");
    const b = summarizeSlot(state.compareFiles, "Other");
    const lines = [
      "A = " + a.label,
      "B = " + b.label,
      "",
      "Mode:     " + a.mode + "  vs  " + b.mode,
      "Time:     " + a.gameTime + "  vs  " + b.gameTime,
      "Build:    " + a.changeSet + "  vs  " + b.changeSet,
      "Items:    " +
        a.items +
        " (" +
        a.safe +
        " editable)  vs  " +
        b.items +
        " (" +
        b.safe +
        " editable)",
      "Vitals:   " + (a.vitals || "—") + "  vs  " + (b.vitals || "—"),
      "PDA bp:   " + a.bp + "  vs  " + b.bp,
      "Ency:     " + a.ency + "  vs  " + b.ency,
      "Goals:    " + a.goals + "  vs  " + b.goals,
      "Flags:    seamoth/cyclops/base " +
        !!a.seamoth +
        "/" +
        !!a.cyclops +
        "/" +
        !!a.base +
        "  vs  " +
        !!b.seamoth +
        "/" +
        !!b.cyclops +
        "/" +
        !!b.base,
    ];
    out.textContent = lines.join("\n");
    out.hidden = false;
    if (clearBtn) clearBtn.hidden = false;
  }

  async function installToFolder() {
    if (!state.files) return;
    if (typeof window.showDirectoryPicker !== "function") {
      alert(
        "Install to Folder needs Chrome/Edge with the File System Access API.\n\nUse Save ZIP and extract into your Desktop slot copy instead."
      );
      return;
    }
    applyFormsToInfo();
    let dir;
    try {
      dir = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch {
      return;
    }
    if (
      !confirm(
        "Write all edited slot files into the folder you just picked?\n\nPick the slot00xx folder (Desktop copy), not Program Files."
      )
    ) {
      return;
    }
    let written = 0;
    for (const [path, entry] of Object.entries(state.files)) {
      if (entry.deleteOnSave) continue;
      const name = path.split(/[\\/]/).pop();
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      if (entry.kind === "json" || entry.data) {
        const text =
          entry.data != null
            ? S.serializeJson(entry.data)
            : entry.text || "";
        await writable.write(text);
      } else if (entry.bytes) {
        const u8 =
          entry.bytes instanceof Uint8Array
            ? entry.bytes
            : new Uint8Array(entry.bytes);
        await writable.write(u8);
      } else {
        await writable.close();
        continue;
      }
      await writable.close();
      written++;
    }
    setDirty(false);
    setStatus("Installed " + written + " file(s) into the selected folder.");
  }

  function writeForms() {
    if (!state.files) return;
    const g = info();
    if (!g) return;

    $("f-mode").value = String(g.gameMode != null ? g.gameMode : 0);
    $("f-gametime").value = g.gameTime != null ? g.gameTime : 0;
    $("f-changeset").value = g.changeSet != null ? g.changeSet : "";
    $("f-username").value = g.userName != null ? g.userName : "";
    $("f-machine").value = g.machineName != null ? g.machineName : "";
    $("f-dateticks").value = g.dateTicks != null ? g.dateTicks : "";
    $("f-startticks").value = g.startTicks != null ? g.startTicks : "";
    $("f-cyclops").checked = boolField(g, "cyclopsPresent");
    $("f-seamoth").checked = boolField(g, "seamothPresent");
    $("f-base").checked = boolField(g, "basePresent");
    $("f-fallback").checked = boolField(g, "isFallback");

    const mode = S.modeName(g.gameMode);
    const report = S.integrityReport(state.files);
    const ok = report.filter((r) => r.present && !r.markedDelete).length;
    $("overview-meta").innerHTML =
      "<span>Slot <strong>" + escapeHtml(state.folderName) + "</strong></span>" +
      "<span>Mode <strong>" + escapeHtml(mode) + "</strong></span>" +
      "<span>Time <strong>" + escapeHtml(S.formatGameTime(g.gameTime)) + "</strong></span>" +
      "<span>Build <strong>" + escapeHtml(String(g.changeSet != null ? g.changeSet : "—")) + "</strong></span>" +
      "<span>Core files <strong>" + ok + "/" + report.length + "</strong></span>" +
      "<span>Files <strong>" + Object.keys(state.files).length + "</strong></span>";

    renderIntegrity();
    refreshInventory(true);
    refreshPdaStatus();
    refreshRadiationStatus();
    refreshBaseStatus();
    refreshVehicleStatus();
    refreshStoryStatus();
    refreshScreenshot();
    renderCompare();
    refreshVitals();
    refreshPosition();
    renderPresets();
    renderCheats();
    renderFileList();
  }

  function applyFormsToInfo() {
    const g = info();
    if (!g) return;
    g.gameMode = Number($("f-mode").value);
    g.gameTime = Number($("f-gametime").value);
    const cs = $("f-changeset").value.trim();
    if (cs !== "") g.changeSet = Number(cs);
    const un = $("f-username").value.trim();
    if (un !== "") g.userName = un;
    const mn = $("f-machine").value.trim();
    if (mn !== "") g.machineName = mn;
    const dt = $("f-dateticks").value.trim();
    if (dt !== "") g.dateTicks = Number(dt);
    const st = $("f-startticks").value.trim();
    if (st !== "") g.startTicks = Number(st);
    g.cyclopsPresent = $("f-cyclops").checked;
    g.seamothPresent = $("f-seamoth").checked;
    g.basePresent = $("f-base").checked;
    g.isFallback = $("f-fallback").checked;
    S.flushGameInfo(state.files);
    markEdited();
  }

  function formatBytes(n) {
    if (!n) return "0 B";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function renderIntegrity() {
    const report = S.integrityReport(state.files);
    const el = $("integrity-list");
    el.innerHTML = report.map((r) => {
      let tone = "tone-bad";
      let status = "Missing";
      if (r.present && r.markedDelete) {
        tone = "tone-warn";
        status = "Marked delete";
      } else if (r.present) {
        tone = "tone-ok";
        status = formatBytes(r.size);
      }
      return (
        "<div class=\"integrity-row\">" +
        "<div><code>" + escapeHtml(r.name) + "</code>" +
        "<span class=\"integrity-role\">" + escapeHtml(r.role) + "</span></div>" +
        "<strong class=\"" + tone + "\">" + escapeHtml(status) + "</strong>" +
        "</div>"
      );
    }).join("");
  }

  function renderPresets() {
    $("preset-grid").innerHTML = D.PRESETS.map((p) =>
      "<article class=\"preset-card\">" +
      "<h3>" + escapeHtml(p.title) + "</h3>" +
      "<p>" + escapeHtml(p.body) + "</p>" +
      "<button type=\"button\" class=\"btn btn--accent\" data-preset=\"" + escapeHtml(p.id) + "\">Apply</button>" +
      "</article>"
    ).join("");
  }

  function renderCheats() {
    const q = ($("cheat-search").value || "").trim().toLowerCase();
    const rows = D.CONSOLE_CHEATS.filter((c) => {
      if (!q) return true;
      return c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
    });
    $("cheat-table").querySelector("tbody").innerHTML = rows.map((c) =>
      "<tr>" +
      "<td><code class=\"cheat-cmd\">" + escapeHtml(c.cmd) + "</code></td>" +
      "<td>" + escapeHtml(c.desc) + "</td>" +
      "<td><button type=\"button\" class=\"btn\" data-copy=\"" + escapeHtml(c.cmd) + "\">Copy</button></td>" +
      "</tr>"
    ).join("");
  }

  function renderFileList() {
    const rows = S.listFiles(state.files);
    $("file-list").innerHTML = rows.map((r) => {
      const classes = ["file-row"];
      if (r.dirty) classes.push("is-dirty");
      if (r.deleteOnSave) classes.push("is-delete");
      const tag = r.deleteOnSave ? " · delete" : r.dirty ? " · edited" : "";
      return (
        "<button type=\"button\" class=\"" + classes.join(" ") + "\" data-file=\"" + escapeHtml(r.path) + "\">" +
        "<code>" + escapeHtml(r.path) + "</code>" +
        "<span>" + escapeHtml(r.kind + " · " + formatBytes(r.size) + tag) + "</span>" +
        "</button>"
      );
    }).join("");

    const giKey = S.findByBasename(state.files, S.GAMEINFO);
    if (giKey && state.files[giKey]) {
      state.activeFile = giKey;
      const entry = state.files[giKey];
      if (entry.data) $("raw-json").value = JSON.stringify(entry.data, null, 2);
      else $("raw-json").value = entry.text || "";
      $("btn-raw-apply").disabled = false;
      $("btn-raw-format").disabled = false;
      $("raw-label").textContent = "Raw JSON · " + giKey;
    }
  }

  function afterLoad(label) {
    showEditor(true);
    writeForms();
    setDirty(false);
    updateSlotUi();
    setStatus("Loaded " + label);
  }

  function updateSlotUi() {
    const wrap = $("slot-wrap");
    const sel = $("slot-select");
    if (!state.availableSlots.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    sel.innerHTML = state.availableSlots.map((s) =>
      "<option value=\"" + escapeHtml(s) + "\"" +
      (s === state.folderName ? " selected" : "") + ">" + escapeHtml(s) + "</option>"
    ).join("");
  }

  async function loadFromEntries(entries, preferredSlot, folderHint) {
    const built = S.buildFromFileList(entries, { preferredSlot, folderHint });
    state.files = built.files;
    state.folderName = built.rootName || folderHint || "slot0000";
    state.rawEntries = built.rawEntries || entries;
    state.availableSlots = built.availableSlots || [];
    afterLoad(state.folderName + " · " + Object.keys(state.files).length + " files");
  }

  async function loadCompareFromFileList(fileList) {
    if (!state.files) throw new Error("Load a primary slot first, then compare.");
    if (!fileList || !fileList.length) throw new Error("No compare files selected.");
    let entries;
    if (fileList.length === 1 && /\.zip$/i.test(fileList[0].name)) {
      entries = await S.readZip(fileList[0]);
    } else {
      entries = await S.readFileEntriesFromList(fileList);
    }
    if (!entries.length) throw new Error("Could not read compare slot.");
    const hint =
      (fileList[0].webkitRelativePath || fileList[0].name || "")
        .split(/[\\/]/)[0] || "other";
    const built = S.buildFromFileList(entries, { folderHint: hint });
    state.compareFiles = built.files;
    renderCompare();
    setStatus("Loaded compare slot: " + (built.rootName || hint));
  }

  function programFilesHint() {
    return (
      "Chrome blocked that folder (Program Files / system files).\n\n" +
      "Do one of these:\n" +
      "1) Open Folder → copy slot00xx to Desktop → Load Folder on the Desktop copy\n" +
      "2) Load Files → multi-select gameinfo.json, *.bin, screenshot.jpg inside the slot\n" +
      "3) Zip the slot in Explorer → Load ZIP"
    );
  }

  async function loadFromFileList(fileList) {
    if (!fileList || !fileList.length) {
      throw new Error(programFilesHint());
    }
    // Single ZIP via the multi-file picker
    if (fileList.length === 1 && /\.zip$/i.test(fileList[0].name)) {
      await loadFromZipFile(fileList[0]);
      return;
    }
    const entries = await S.readFileEntriesFromList(fileList);
    if (!entries.length) throw new Error(programFilesHint());
    const hint = (fileList[0].webkitRelativePath || fileList[0].name || "").split(/[\\/]/)[0] || "slot0000";
    await loadFromEntries(entries, null, hint);
  }

  async function loadFromZipFile(file) {
    const entries = await S.readZip(file);
    await loadFromEntries(entries, null, file.name.replace(/\.zip$/i, ""));
  }

  async function switchSlot(slotName) {
    if (!state.rawEntries) return;
    await loadFromEntries(state.rawEntries, slotName);
  }

  async function downloadZip(isBackup) {
    if (!state.files) return;
    applyFormsToInfo();
    const blob = await S.buildZipBlob(state.files, state.folderName);
    const name = (isBackup ? "backup-" : "edited-") + state.folderName + ".zip";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setDirty(false);
    setStatus((isBackup ? "Backup" : "Save") + " ZIP downloaded: " + name);
    if (!isBackup) $("install-modal").hidden = false;
  }

  function bindUi() {
    fillModeSelect();
    fillInvDatalist();
    renderInvKits();
    renderPosWarps();

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    $("inv-container").addEventListener("change", renderInventoryTable);
    $("inv-filter").addEventListener("input", renderInventoryTable);
    $("btn-inv-refresh").addEventListener("click", () => refreshInventory(true));
    $("inv-check-all").addEventListener("change", (e) => {
      document
        .querySelectorAll("#inv-table input[data-inv-id]:not(:disabled)")
        .forEach((el) => {
          el.checked = e.target.checked;
        });
    });
    $("inv-kits").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-kit]");
      if (!btn) return;
      try {
        const kit = D.INVENTORY_KITS.find((k) => k.id === btn.getAttribute("data-kit"));
        if (!kit) return;
        const parent = $("inv-container").value;
        if (!parent) return alert("Pick a container first.");
        if (
          !confirm(
            "Add “" +
              kit.title +
              "” to the selected container?\n\n" +
              kit.body +
              "\n\nNeeds at least one simple cloneable item already in the save."
          )
        ) {
          return;
        }
        const bytes = getGlobalBytes();
        const result = Inv.addKit(bytes, { parentId: parent, entries: kit.entries });
        setGlobalBytes(result.bytes);
        refreshInventory(true);
        renderFileList();
        setStatus(
          "Kit “" + kit.title + "”: added " + result.added + " item(s). Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-inv-remove").addEventListener("click", () => {
      try {
        const ids = selectedInvIds();
        if (!ids.length) return alert("Select one or more editable items first.");
        const bytes = getGlobalBytes();
        const result = Inv.removeItems(bytes, ids);
        setGlobalBytes(result.bytes);
        refreshInventory(true);
        renderFileList();
        setStatus("Removed " + result.removed + " item(s) from global-objects.bin.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-inv-clear").addEventListener("click", () => {
      try {
        const parent = $("inv-container").value;
        if (!parent) return;
        if (!confirm("Remove all safely-editable items from this container?")) return;
        const bytes = getGlobalBytes();
        const result = Inv.clearContainer(bytes, parent);
        setGlobalBytes(result.bytes);
        refreshInventory(true);
        renderFileList();
        setStatus("Cleared " + result.removed + " item(s).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-inv-clear-all").addEventListener("click", () => {
      try {
        if (
          !confirm(
            "Remove ALL safely-editable items from every locker/inventory in this save?\n\nComplex items are left alone."
          )
        ) {
          return;
        }
        const bytes = getGlobalBytes();
        const result = Inv.clearAllContainers(bytes);
        setGlobalBytes(result.bytes);
        refreshInventory(true);
        renderFileList();
        setStatus("Cleared " + result.removed + " item(s) across all containers.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-inv-strip-tools").addEventListener("click", () => {
      try {
        const parent = $("inv-container").value;
        if (
          !confirm(
            "Strip tools (knife, scanner, builder, seaglide, cutter, etc.) from the selected container?\n\nCancel and use Clear if you want everything gone."
          )
        ) {
          return;
        }
        const bytes = getGlobalBytes();
        const result = Inv.stripTools(bytes, parent || null);
        setGlobalBytes(result.bytes);
        refreshInventory(true);
        renderFileList();
        setStatus("Stripped " + result.removed + " tool(s).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-inv-add").addEventListener("click", () => {
      try {
        const classId = resolveAddClassId($("inv-add-name").value);
        if (!classId) {
          return alert("Pick an item name from the list (or paste a class ID GUID).");
        }
        const qty = Number($("inv-add-qty").value) || 1;
        const parent = $("inv-container").value;
        const bytes = getGlobalBytes();
        const result = Inv.addItems(bytes, { classId, parentId: parent, count: qty });
        setGlobalBytes(result.bytes);
        refreshInventory(true);
        renderFileList();
        setStatus(
          "Added " +
            result.added +
            " × " +
            Inv.itemName(result.classId) +
            " to container."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    [
      "f-mode", "f-gametime", "f-changeset", "f-username", "f-machine",
      "f-dateticks", "f-startticks", "f-cyclops", "f-seamoth", "f-base", "f-fallback",
    ].forEach((id) => {
      const el = $(id);
      const evt = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(evt, () => {
        applyFormsToInfo();
        writeForms();
      });
    });

    $("btn-mode-creative").addEventListener("click", () => {
      $("f-mode").value = "3";
      applyFormsToInfo();
      writeForms();
      setStatus("Mode set to Creative.");
    });
    $("btn-mode-survival").addEventListener("click", () => {
      $("f-mode").value = "0";
      applyFormsToInfo();
      writeForms();
      setStatus("Mode set to Survival.");
    });
    $("btn-mode-freedom").addEventListener("click", () => {
      $("f-mode").value = "1";
      applyFormsToInfo();
      writeForms();
      setStatus("Mode set to Freedom.");
    });
    $("btn-reset-time").addEventListener("click", () => {
      $("f-gametime").value = "0";
      applyFormsToInfo();
      writeForms();
      setStatus("gameTime reset to 0.");
    });
    $("btn-reset-time-tools").addEventListener("click", () => {
      $("btn-reset-time").click();
    });

    $("btn-story-drop").addEventListener("click", () => {
      const ok = confirm(
        "Mark scene-objects.bin for removal from the download ZIP?\n\n" +
        "After extract you MUST copy scene-objects.bin from a fresh same-mode save into this slot, " +
        "or the game may fail to load. global-objects.bin (base/vehicles) is kept."
      );
      if (!ok) return;
      if (!S.markSceneObjectsDeleted(state.files, true)) {
        alert("No scene-objects.bin in this slot.");
        return;
      }
      markEdited();
      writeForms();
      setStatus("scene-objects.bin will be omitted from the next ZIP.");
    });
    $("btn-story-keep").addEventListener("click", () => {
      S.markSceneObjectsDeleted(state.files, false);
      markEdited();
      writeForms();
      setStatus("scene-objects.bin will be included again.");
    });

    $("btn-pda-unlock-all").addEventListener("click", () => {
      try {
        const bytes = getSceneBytes();
        if (!bytes) throw new Error("scene-objects.bin missing from this slot.");
        if (
          !confirm(
            "Unlock all PDA blueprints in scene-objects.bin?\n\n" +
              "This mirrors the console command “unlock all”. Backup first, then Save ZIP."
          )
        ) {
          return;
        }
        const result = Pda.unlockAllPda(bytes);
        setSceneBytes(result.bytes);
        refreshPdaStatus();
        renderFileList();
        setStatus(
          "PDA unlocks: " +
            result.before +
            " → " +
            result.after +
            " (+" +
            result.added +
            "). Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-ency-unlock-all").addEventListener("click", () => {
      try {
        const bytes = getSceneBytes();
        if (!bytes) throw new Error("scene-objects.bin missing from this slot.");
        if (
          !confirm(
            "Unlock all encyclopedia / databank entries in scene-objects.bin?\n\n" +
              "This mirrors the console command “ency all”. Backup first, then Save ZIP."
          )
        ) {
          return;
        }
        const g = info();
        const result = Enc.unlockAllEncyclopedia(bytes, {
          timestamp: g && g.gameTime != null ? Number(g.gameTime) : 480,
        });
        setSceneBytes(result.bytes);
        refreshPdaStatus();
        renderFileList();
        setStatus(
          "Encyclopedia: " +
            result.before +
            " → " +
            result.after +
            " (+" +
            result.added +
            "). Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-fix-radiation").addEventListener("click", () => {
      try {
        const bytes = getSceneBytes();
        if (!bytes) throw new Error("scene-objects.bin missing from this slot.");
        if (
          !confirm(
            "Set LeakingRadiation to fixed with radius 0?\n\nSame idea as console “fixleaks”. Backup first."
          )
        ) {
          return;
        }
        const result = Rad.fixRadiation(bytes);
        setSceneBytes(result.bytes);
        refreshRadiationStatus();
        renderFileList();
        setStatus(
          "Aurora radiation fixed (was " +
            (result.before.radiationFixed ? "already fixed" : "leaking") +
            ", radius " +
            Math.round(result.before.currentRadius) +
            "). Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-unflood-bases").addEventListener("click", () => {
      try {
        const bytes = getGlobalBytes();
        if (!bytes) throw new Error("global-objects.bin missing from this slot.");
        if (
          !confirm(
            "Zero all BaseFloodSim water cells in global-objects.bin?\n\nUnfloods habitats. Hull strength is not stored in the save."
          )
        ) {
          return;
        }
        const result = Base.unfloodBases(bytes);
        setGlobalBytes(result.bytes);
        refreshBaseStatus();
        renderFileList();
        setStatus(
          "Unflooded bases: cleared " +
            result.cleared +
            "/" +
            result.cells +
            " cells across " +
            result.sims +
            " sim(s). Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-refill-vehicles").addEventListener("click", () => {
      try {
        const bytes = getGlobalBytes();
        if (!bytes) throw new Error("global-objects.bin missing from this slot.");
        if (!confirm("Set every EnergyMixin energy to its maxEnergy?")) return;
        const result = Veh.refillEnergy(bytes);
        setGlobalBytes(result.bytes);
        refreshVehicleStatus();
        renderFileList();
        setStatus(
          "Refilled " +
            result.refilled +
            "/" +
            result.total +
            " EnergyMixin(s). Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-story-aurora").addEventListener("click", () => {
      try {
        const bytes = getSceneBytes();
        if (!bytes) throw new Error("scene-objects.bin missing.");
        if (
          !confirm(
            "Add Aurora exploration story goals if missing?\n\n" +
              Story.AURORA_GOALS.join(", ")
          )
        ) {
          return;
        }
        const result = Story.addStoryGoals(bytes, Story.AURORA_GOALS);
        setSceneBytes(result.bytes);
        refreshStoryStatus();
        renderFileList();
        setStatus(
          "Story goals: +" + result.added + " (now " + result.after + "). Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-story-babies").addEventListener("click", () => {
      try {
        const bytes = getSceneBytes();
        if (!bytes) throw new Error("scene-objects.bin missing.");
        if (!confirm("Set PrisonManager.babiesHatched = true?")) return;
        const result = Story.setBabiesHatched(bytes, true);
        setSceneBytes(result.bytes);
        refreshStoryStatus();
        renderFileList();
        setStatus("Emperor babies marked hatched. Save ZIP to apply.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-story-rocket").addEventListener("click", () => {
      try {
        const bytes = getGlobalBytes();
        if (!bytes) throw new Error("global-objects.bin missing.");
        if (
          !confirm(
            "Set Neptune rocket currentRocketStage to 5 (fully built)?\n\nOnly works if a rocket already exists in the save."
          )
        ) {
          return;
        }
        const result = Story.forceRocketReady(bytes);
        setGlobalBytes(result.bytes);
        refreshStoryStatus();
        renderFileList();
        setStatus(
          "Rocket stage " +
            result.before +
            " → " +
            result.stage +
            ". Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-vitals-refresh").addEventListener("click", () => refreshVitals());
    $("btn-vitals-apply").addEventListener("click", () => {
      try {
        const v = applyVitalsFromForm();
        renderFileList();
        setStatus(
          "Vitals applied · HP " +
            Vit.round1(v.health) +
            " · food " +
            Vit.round1(v.food) +
            " · water " +
            Vit.round1(v.water) +
            " · O₂ " +
            Vit.round1(v.oxygen) +
            " · infection " +
            Vit.round1(v.infection) +
            ". Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-vitals-fill").addEventListener("click", () => {
      try {
        const bytes = getSceneBytes();
        if (!bytes) throw new Error("scene-objects.bin missing from this slot.");
        const cur = Vit.parseVitals(bytes);
        if (!cur.ok) throw new Error(cur.error);
        const result = Vit.writeVitals(bytes, {
          health: 100,
          food: 100,
          water: 100,
          infection: cur.infection,
          oxygen: Math.max(cur.oxygen, 45),
        });
        setSceneBytes(result.bytes);
        refreshVitals();
        renderFileList();
        setStatus("Filled health / food / water. Save ZIP to apply.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-vitals-cure").addEventListener("click", () => {
      try {
        $("v-infection").value = 0;
        applyVitalsFromForm();
        renderFileList();
        setStatus("Infection set to 0. Save ZIP to apply.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-pos-refresh").addEventListener("click", () => refreshPosition());
    $("btn-pos-apply").addEventListener("click", () => {
      try {
        const v = applyPositionFromForm();
        renderFileList();
        setStatus(
          "Position set to " +
            roundPos(v.x) +
            ", " +
            roundPos(v.y) +
            ", " +
            roundPos(v.z) +
            ". Save ZIP to apply."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-pos-surface").addEventListener("click", () => {
      $("p-y").value = -2;
      try {
        applyPositionFromForm();
        renderFileList();
        setStatus("Y set to −2 (near surface). Save ZIP to apply.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("pos-warps").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-warp]");
      if (!btn) return;
      const warp = Pos.WARPS.find((w) => w.id === btn.getAttribute("data-warp"));
      if (!warp || warp.surface) return;
      if (
        !confirm(
          "Warp to " +
            warp.title +
            "?\n\n" +
            warp.x +
            ", " +
            warp.y +
            ", " +
            warp.z +
            "\n\nYou may spawn inside terrain — keep a backup."
        )
      ) {
        return;
      }
      try {
        $("p-x").value = warp.x;
        $("p-y").value = warp.y;
        $("p-z").value = warp.z;
        applyPositionFromForm();
        renderFileList();
        setStatus("Warped to " + warp.title + ". Save ZIP to apply.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("cheat-search").addEventListener("input", renderCheats);
    $("cheat-table").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-copy]");
      if (!btn) return;
      const cmd = btn.getAttribute("data-copy");
      try {
        await navigator.clipboard.writeText(cmd);
        setStatus("Copied: " + cmd);
      } catch {
        prompt("Copy command:", cmd);
      }
    });

    $("preset-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-preset]");
      if (!btn) return;
      const preset = D.PRESETS.find((p) => p.id === btn.getAttribute("data-preset"));
      if (!preset) return;
      const g = info();
      if (!g) return;
      preset.apply(g);
      S.flushGameInfo(state.files);
      markEdited();
      writeForms();
      setStatus("Applied preset: " + preset.title);
    });

    $("file-list").addEventListener("click", (e) => {
      const row = e.target.closest("button[data-file]");
      if (!row) return;
      const path = row.getAttribute("data-file");
      const entry = state.files[path];
      if (!entry) return;
      state.activeFile = path;
      if (entry.kind === "json" || /\.json$/i.test(path)) {
        if (entry.data) $("raw-json").value = JSON.stringify(entry.data, null, 2);
        else $("raw-json").value = entry.text || "";
        $("btn-raw-apply").disabled = false;
        $("btn-raw-format").disabled = false;
        $("raw-label").textContent = "Raw JSON · " + path;
      } else {
        $("raw-json").value = "(binary file — " + formatBytes(S.fileSize(entry)) + " — not editable as text)";
        $("btn-raw-apply").disabled = true;
        $("btn-raw-format").disabled = true;
        $("raw-label").textContent = "Binary · " + path;
      }
    });

    $("btn-raw-apply").addEventListener("click", () => {
      if (!state.activeFile || !state.files[state.activeFile]) return;
      try {
        const key = state.activeFile;
        const data = S.parseJsonText($("raw-json").value, key);
        S.setEntryData(state.files, key, data);
        markEdited();
        writeForms();
        setStatus("Applied raw JSON to " + key);
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

    $("files-input").addEventListener("change", async (e) => {
      try { await loadFromFileList(e.target.files); }
      catch (err) { setStatus(err.message || String(err)); alert(err.message || String(err)); }
      e.target.value = "";
    });
    $("folder-input").addEventListener("change", async (e) => {
      try {
        if (!e.target.files || !e.target.files.length) {
          throw new Error(programFilesHint());
        }
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
    if ($("btn-install")) {
      $("btn-install").addEventListener("click", () => {
        installToFolder().catch((err) => alert(err.message || String(err)));
      });
    }
    if ($("compare-files-input")) {
      $("compare-files-input").addEventListener("change", async (e) => {
        try {
          await loadCompareFromFileList(e.target.files);
        } catch (err) {
          alert(err.message || String(err));
        }
        e.target.value = "";
      });
    }
    if ($("compare-folder-input")) {
      $("compare-folder-input").addEventListener("change", async (e) => {
        try {
          await loadCompareFromFileList(e.target.files);
        } catch (err) {
          alert(err.message || String(err));
        }
        e.target.value = "";
      });
    }
    if ($("btn-compare-clear")) {
      $("btn-compare-clear").addEventListener("click", () => {
        state.compareFiles = null;
        renderCompare();
        setStatus("Cleared compare slot.");
      });
    }
    $("btn-close-modal").addEventListener("click", () => { $("install-modal").hidden = true; });
    $("install-modal").addEventListener("click", (e) => {
      if (e.target === $("install-modal")) $("install-modal").hidden = true;
    });

    if (window.GGSaveFolders) {
      GGSaveFolders.wireEditor("subnautica", {
        setStatus,
        async onDirectory(handle) {
          try {
            const collected = await GGSaveFolders.collectFilesFromDirectory(
              handle,
              (name) => /\.(json|bin|jpg|jpeg|png|dat)$/i.test(name),
              "",
              0,
              6
            );
            if (!collected.length) {
              throw new Error(
                "No save files readable in “" + handle.name + "”.\n\n" + programFilesHint()
              );
            }
            const entries = [];
            for (const item of collected) {
              const name = item.name;
              if (/\.json$/i.test(name)) {
                entries.push({ relativePath: item.relativePath, text: await item.file.text(), bytes: null });
              } else {
                entries.push({ relativePath: item.relativePath, text: null, bytes: await item.file.arrayBuffer() });
              }
            }
            await loadFromEntries(entries, null, handle.name);
          } catch (err) {
            const msg = (err && err.message) || String(err);
            if (/not allowed|permission|security|system/i.test(msg)) {
              throw new Error(programFilesHint());
            }
            throw err;
          }
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
