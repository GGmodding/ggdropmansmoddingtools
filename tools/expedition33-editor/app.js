(() => {
  "use strict";

  const G = window.E33Gvas;
  const S = window.E33Save;
  const D = window.E33Data;
  const $ = (id) => document.getElementById(id);

  const PANELS = [
    "overview",
    "resources",
    "characters",
    "weapons",
    "pictos",
    "exploration",
    "spawn",
    "collectibles",
    "inventory",
    "features",
    "achievements",
    "notes",
  ];

  const state = {
    fileName: "EXPEDITION_0.sav",
    bytes: null,
    entries: [],
    dirty: false,
    invFilter: "",
  };

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("dirty-pill").hidden = !dirty;
    $("btn-save").disabled = !state.bytes;
    $("btn-backup").disabled = !state.bytes;
    $("btn-install").disabled = !state.bytes;
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

  function buildResourcesGrid(parsed) {
    const grid = $("resources-grid");
    const rows = [
      {
        id: "gold",
        label: "Chroma (Gold)",
        value: parsed.gold,
        present: parsed.gold != null,
      },
      ...D.RESOURCE_FIELDS.map((f) => {
        const it = parsed.inventory.find((x) => x.key === f.key);
        return {
          id: f.key,
          label: f.label,
          value: it ? it.value : null,
          present: !!it,
          max: f.max,
        };
      }),
    ];
    grid.innerHTML = rows
      .map((r) => {
        const val = r.present ? r.value : "";
        const note = r.present ? "" : " (will insert on Apply/Insert)";
        return (
          "<label>" +
          escapeHtml(r.label) +
          note +
          '<input data-res="' +
          escapeHtml(r.id) +
          '" type="number" min="0" step="1" value="' +
          escapeHtml(String(val)) +
          '" /></label>'
        );
      })
      .join("");
    const missing = rows.filter((r) => !r.present && r.id !== "gold").map((r) => r.label);
    $("resources-hint").textContent = missing.length
      ? "Missing (insertable): " + missing.join(", ")
      : "All listed resources are present in this save.";

    const tintGrid = $("tint-levels-grid");
    tintGrid.innerHTML = D.TINT_LEVEL_BASES.map((t) => {
      const cur = parsed.tintLevels[t.base];
      const val = cur ? cur.level : "";
      return (
        "<label>" +
        escapeHtml(t.label) +
        '<input data-tint="' +
        escapeHtml(t.base) +
        '" type="number" min="0" max="2" step="1" value="' +
        escapeHtml(String(val)) +
        '" ' +
        (cur ? "" : "disabled") +
        " /></label>"
      );
    }).join("");
  }

  function buildCharacters(parsed) {
    const missing = $("characters-missing");
    const body = $("characters-body");
    if (!parsed.characters.length) {
      missing.hidden = false;
      body.innerHTML = "";
      return;
    }
    missing.hidden = true;
    body.innerHTML = parsed.characters
      .map((c, idx) => {
        const title = D.displayChar(c.name);
        const sub = title !== c.name ? " · hardcoded " + c.name : "";
        const attrHtml = (c.attributes || [])
          .map(
            (a) =>
              "<label>" +
              escapeHtml(D.attrLabel(a.index)) +
              '<input data-attr-at="' +
              a.valAt +
              '" type="number" min="0" step="1" value="' +
              a.value +
              '" /></label>'
          )
          .join("");
        const skillsU = (c.skillsUnlocked || []).map((s) => s.name).join(", ") || "—";
        const skillsE = (c.skillsEquipped || []).map((s) => s.name).join(", ") || "—";
        return (
          '<div class="char-card" data-char="' +
          idx +
          '">' +
          "<h3>" +
          escapeHtml(title) +
          "<span style=\"color:var(--muted);font-family:var(--font);font-size:0.85rem;font-weight:500\">" +
          escapeHtml(sub) +
          "</span></h3>" +
          '<div class="form-grid">' +
          "<label>Level<input data-field=\"level\" type=\"number\" min=\"1\" max=\"99\" step=\"1\" value=\"" +
          (c.level != null ? c.level : "") +
          "\" " +
          (c.levelAt == null ? "disabled" : "") +
          " /></label>" +
          "<label>Experience<input data-field=\"xp\" type=\"number\" min=\"0\" step=\"1\" value=\"" +
          (c.xp != null ? c.xp : "") +
          "\" " +
          (c.xpAt == null ? "disabled" : "") +
          " /></label>" +
          "<label>Attribute points<input data-field=\"actionPoints\" type=\"number\" min=\"0\" step=\"1\" value=\"" +
          (c.actionPoints != null ? c.actionPoints : "") +
          "\" " +
          (c.actionPointsAt == null ? "disabled" : "") +
          " /></label>" +
          "<label>Lumina (consumables)<input data-field=\"lumina\" type=\"number\" min=\"0\" step=\"1\" value=\"" +
          (c.lumina != null ? c.lumina : "") +
          "\" " +
          (c.luminaAt == null ? "disabled" : "") +
          " /></label>" +
          "</div>" +
          (attrHtml
            ? '<p class="hint" style="margin-top:0.85rem">Assigned attributes</p><div class="form-grid">' +
              attrHtml +
              "</div>"
            : '<p class="hint" style="margin-top:0.85rem">No AssignedAttributePoints map for this character yet.</p>') +
          '<p class="hint">Unlocked skills: ' +
          escapeHtml(skillsU) +
          "</p>" +
          '<p class="hint">Equipped skills: ' +
          escapeHtml(skillsE) +
          "</p>" +
          (c.excludedAt != null
            ? '<label class="check" style="margin-top:0.75rem;flex-direction:row"><input data-field="excluded" type="checkbox" ' +
              (c.excluded ? "checked" : "") +
              " /> Excluded from party</label>"
            : "") +
          "</div>"
        );
      })
      .join("");
  }

  function buildWeapons(parsed) {
    $("weapons-hint").textContent = parsed.weapons.length
      ? parsed.weapons.length + " weapon progression(s) in save."
      : "No WeaponProgressions entries yet.";
    $("weapons-table").querySelector("tbody").innerHTML = parsed.weapons
      .map(
        (w, i) =>
          "<tr><td><code>" +
          escapeHtml(w.name) +
          "</code></td><td><input data-wpn=\"" +
          i +
          "\" type=\"number\" min=\"1\" max=\"33\" value=\"" +
          (w.level != null ? w.level : 1) +
          "\" /></td><td><button type=\"button\" class=\"btn\" data-wpn-apply=\"" +
          i +
          "\">Set</button></td></tr>"
      )
      .join("");
  }

  function buildPictos(parsed) {
    const labels = (window.E33PictoIds && window.E33PictoIds.labels) || {};
    $("pictos-hint").textContent = parsed.pictos.length
      ? parsed.pictos.length + " picto progression(s) in save."
      : "No pictos in this save yet — use Unlock all, or unlock some in-game first.";
    $("pictos-table").querySelector("tbody").innerHTML = parsed.pictos
      .map(
        (p, i) =>
          "<tr><td><code>" +
          escapeHtml(p.name) +
          "</code>" +
          (labels[p.name]
            ? ' <span style="color:var(--muted)">' + escapeHtml(labels[p.name]) + "</span>"
            : "") +
          "</td><td><input data-pic-learnt=\"" +
          i +
          "\" type=\"checkbox\" " +
          (p.learnt ? "checked" : "") +
          " /></td><td><input data-pic-steps=\"" +
          i +
          "\" type=\"number\" min=\"0\" max=\"99\" value=\"" +
          (p.steps != null ? p.steps : 0) +
          "\" /></td><td><button type=\"button\" class=\"btn\" data-pic-apply=\"" +
          i +
          "\">Set</button></td></tr>"
      )
      .join("");
  }

  function buildExploration(parsed) {
    const ex = parsed.exploration.exploration || [];
    const wm = parsed.exploration.worldMap || [];
    let html = "<div class=\"meta-strip\">";
    html +=
      "<span>Exploration flags <strong>" +
      ex.length +
      "</strong></span><span>World map <strong>" +
      wm.length +
      "</strong></span></div>";
    html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>Type</th><th>Flag</th></tr></thead><tbody>';
    ex.forEach((c) => {
      html +=
        "<tr><td>Exploration</td><td>" +
        escapeHtml((D.EXPLORATION_LABELS[c.index] || "Enumerator " + c.index) + " · " + c.id) +
        "</td></tr>";
    });
    wm.forEach((c) => {
      html +=
        "<tr><td>World map</td><td>" +
        escapeHtml((D.WORLD_MAP_LABELS[c.index] || "Enumerator " + c.index) + " · " + c.id) +
        "</td></tr>";
    });
    if (!ex.length && !wm.length) {
      html += "<tr><td colspan=\"2\">No exploration capacity flags found.</td></tr>";
    }
    html += "</tbody></table></div>";
    $("exploration-body").innerHTML = html;
  }

  function buildSpawn(parsed) {
    $("f-map-edit").value = parsed.mapToLoad || "";
    $("f-spawn-edit").value = parsed.spawnTag || "";
    $("map-list").innerHTML = D.KNOWN_MAPS.map(
      (m) => "<option value=\"" + escapeHtml(m) + "\"></option>"
    ).join("");
    $("spawn-hint").textContent =
      "Current map length budget: " +
      (parsed.mapToLoad ? parsed.mapToLoad.length : 0) +
      " chars. Spawn: " +
      (parsed.spawnTag ? parsed.spawnTag.length : 0) +
      " chars.";
  }

  function buildCollectibles(parsed) {
    $("collectibles-table").querySelector("tbody").innerHTML = D.COLLECTIBLE_KEYS.map((key) => {
      const it = parsed.inventory.find((x) => x.key === key);
      return (
        "<tr><td><code>" +
        escapeHtml(key) +
        "</code></td><td><input data-col=\"" +
        escapeHtml(key) +
        "\" type=\"number\" min=\"0\" value=\"" +
        (it ? it.value : 0) +
        "\" /></td><td><button type=\"button\" class=\"btn\" data-col-apply=\"" +
        escapeHtml(key) +
        "\">" +
        (it ? "Set" : "Insert") +
        "</button></td></tr>"
      );
    }).join("");
  }

  function buildInventoryTable(parsed) {
    const filter = (state.invFilter || "").trim().toLowerCase();
    let items = parsed.inventory;
    if (filter) {
      items = items.filter((it) => it.key.toLowerCase().includes(filter));
    }
    $("inv-hint").textContent =
      parsed.inventory.length +
      " inventory keys · showing " +
      items.length +
      (filter ? ' matching "' + filter + '"' : "");
    $("inv-table").querySelector("tbody").innerHTML = items
      .map(
        (it) =>
          "<tr><td><code>" +
          escapeHtml(it.key) +
          "</code></td><td><input data-inv=\"" +
          escapeHtml(it.key) +
          "\" type=\"number\" min=\"0\" step=\"1\" value=\"" +
          it.value +
          "\" /></td><td><button type=\"button\" class=\"btn\" data-inv-apply=\"" +
          escapeHtml(it.key) +
          "\">Set</button></td></tr>"
      )
      .join("");
  }

  function refreshAll() {
    if (!state.bytes) return;
    const parsed = G.parseSave(state.bytes);
    if (!parsed.ok) {
      setStatus("Loaded file does not look like an Expedition 33 save.");
    }

    $("overview-meta").innerHTML =
      "<span>File <strong>" +
      escapeHtml(state.fileName) +
      "</strong></span>" +
      "<span>Chroma <strong>" +
      escapeHtml(parsed.gold != null ? String(parsed.gold) : "—") +
      "</strong></span>" +
      "<span>Map <strong>" +
      escapeHtml(parsed.mapToLoad || "—") +
      "</strong></span>" +
      "<span>Playtime <strong>" +
      escapeHtml(S.formatPlaytime(parsed.timePlayed)) +
      "</strong></span>" +
      "<span>Party <strong>" +
      escapeHtml(String(parsed.characters.length)) +
      "</strong></span>" +
      "<span>Inv keys <strong>" +
      escapeHtml(String(parsed.inventory.length)) +
      "</strong></span>" +
      "<span>Size <strong>" +
      escapeHtml(S.formatBytes(parsed.size)) +
      "</strong></span>";

    $("f-map").value = parsed.mapToLoad || "";
    $("f-time").value = S.formatPlaytime(parsed.timePlayed);
    $("f-ng").value = parsed.ngPlus != null ? parsed.ngPlus : "";
    $("f-ng").disabled = parsed.ngPlusAt == null && parsed.ngPlus == null;
    $("f-size").value = S.formatBytes(parsed.size);

    buildResourcesGrid(parsed);
    buildCharacters(parsed);
    buildWeapons(parsed);
    buildPictos(parsed);
    buildExploration(parsed);
    buildSpawn(parsed);
    buildCollectibles(parsed);
    buildInventoryTable(parsed);

    $("feature-table").querySelector("tbody").innerHTML = D.FEATURE_MATRIX.map(
      (f) =>
        "<tr><td>" +
        escapeHtml(f.title) +
        "</td><td><strong>" +
        escapeHtml(f.status) +
        "</strong></td><td>" +
        escapeHtml(f.note) +
        "</td></tr>"
    ).join("");

    $("notes-table").querySelector("tbody").innerHTML = D.NOTES.map(
      (n) =>
        "<tr><td>" +
        escapeHtml(n.tip) +
        "</td><td>" +
        escapeHtml(n.detail) +
        "</td></tr>"
    ).join("");
  }

  function fillSlotSelect(entries) {
    const slots = entries.filter((e) => /^EXPEDITION_\d+\.sav$/i.test(e.name));
    const wrap = $("slot-wrap");
    const sel = $("slot-select");
    if (slots.length < 2) {
      wrap.hidden = true;
      sel.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    sel.innerHTML = slots
      .map(
        (e) =>
          "<option value=\"" +
          escapeHtml(e.name) +
          "\"" +
          (e.name === state.fileName ? " selected" : "") +
          ">" +
          escapeHtml(e.name) +
          "</option>"
      )
      .join("");
  }

  async function loadEntries(entries, preferredName) {
    if (!entries.length) throw new Error("No .sav files found.");
    state.entries = entries;
    let primary = null;
    if (preferredName) {
      primary = entries.find((e) => e.name === preferredName) || null;
    }
    if (!primary) primary = S.pickPrimary(entries);
    if (!primary) throw new Error("No usable EXPEDITION_*.sav in selection.");
    if (!G.isExpeditionSave(primary.bytes)) {
      const maybe = entries.find((e) => G.isExpeditionSave(e.bytes));
      if (maybe) primary = maybe;
    }
    if (!G.isExpeditionSave(primary.bytes)) {
      throw new Error(
        primary.name + " is not a Clair Obscur: Expedition 33 expedition save (GVAS check failed)."
      );
    }
    state.fileName = primary.name;
    state.bytes = primary.bytes;
    fillSlotSelect(entries);
    showEditor(true);
    setDirty(false);
    refreshAll();
    setStatus(
      "Loaded " +
        state.fileName +
        " · " +
        S.formatBytes(state.bytes.length) +
        (entries.length > 1 ? " · " + entries.length + " files in folder" : "")
    );
  }

  async function loadFromFileList(fileList) {
    if (!fileList || !fileList.length) throw new Error("No files selected.");
    if (fileList.length === 1 && /\.zip$/i.test(fileList[0].name)) {
      const entries = await S.readZip(fileList[0]);
      await loadEntries(entries);
      return;
    }
    const entries = await S.readFileEntriesFromList(fileList);
    await loadEntries(entries);
  }

  function downloadBytes(isBackup) {
    if (!state.bytes) return;
    const name = (isBackup ? "backup-" : "edited-") + state.fileName;
    const blob = new Blob([state.bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setDirty(false);
    setStatus((isBackup ? "Backup" : "Save") + " downloaded: " + name);
  }

  async function installToFolder() {
    if (!state.bytes) return;
    if (typeof window.showDirectoryPicker !== "function") {
      alert("Install to Folder needs Chrome/Edge. Use Save .sav instead.");
      return;
    }
    let dir;
    try {
      dir = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch {
      return;
    }
    if (
      !confirm(
        "Write " +
          state.fileName +
          " into the folder you picked?\n\nClose Expedition 33 first."
      )
    ) {
      return;
    }
    const handle = await dir.getFileHandle(state.fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(state.bytes);
    await writable.close();
    setDirty(false);
    setStatus("Installed " + state.fileName + " into selected folder.");
  }

  function applyOverview() {
    let bytes = state.bytes;
    const ngEl = $("f-ng");
    if (!ngEl.disabled && ngEl.value !== "") {
      const n = Math.max(0, Number(ngEl.value) | 0);
      const parsed = G.parseSave(bytes);
      if (parsed.ngPlusAt != null) {
        const r = G.writeIntProperty(bytes, "FinishedGameCount", n);
        bytes = r.bytes;
      } else if (parsed.ngPlus == null) {
        throw new Error("FinishedGameCount is not in this save yet (finish the game / NG+ once).");
      }
    }
    state.bytes = bytes;
    setDirty(true);
    refreshAll();
  }

  function applyResources() {
    let bytes = state.bytes;
    const inputs = $("resources-grid").querySelectorAll("input[data-res]");
    const applied = [];
    inputs.forEach((input) => {
      if (input.value === "") return;
      const key = input.getAttribute("data-res");
      const n = Math.max(0, Number(input.value) | 0);
      if (key === "gold") {
        const r = G.writeIntProperty(bytes, "Gold", n);
        bytes = r.bytes;
        applied.push("Gold=" + n);
      } else {
        const r = G.ensureInventoryItem(bytes, key, n);
        bytes = r.bytes;
        applied.push(key + "=" + n + (r.inserted ? " (inserted)" : ""));
      }
    });
    $("tint-levels-grid").querySelectorAll("input[data-tint]").forEach((input) => {
      if (input.disabled || input.value === "") return;
      const base = input.getAttribute("data-tint");
      const r = G.setTintLevel(bytes, base, Number(input.value) | 0);
      bytes = r.bytes;
      applied.push(r.key);
    });
    state.bytes = bytes;
    setDirty(true);
    refreshAll();
    setStatus("Resources applied: " + (applied.join(", ") || "nothing"));
  }

  function insertMissingResources() {
    let bytes = state.bytes;
    const parsed = G.parseSave(bytes);
    const log = [];
    D.INSERTABLE_RESOURCES.forEach((key) => {
      if (parsed.inventory.find((x) => x.key === key)) return;
      const input = $("resources-grid").querySelector('input[data-res="' + key + '"]');
      const n = input && input.value !== "" ? Math.max(0, Number(input.value) | 0) : 1;
      const r = G.insertInventoryItem(bytes, key, n || 1);
      bytes = r.bytes;
      log.push(key);
    });
    state.bytes = bytes;
    setDirty(true);
    refreshAll();
    setStatus(log.length ? "Inserted: " + log.join(", ") : "Nothing missing to insert.");
  }

  function applyCharacters() {
    const parsed = G.parseSave(state.bytes);
    let bytes = state.bytes;
    const cards = $("characters-body").querySelectorAll(".char-card");
    cards.forEach((card) => {
      const idx = Number(card.getAttribute("data-char"));
      const c = parsed.characters[idx];
      if (!c) return;
      const level = card.querySelector('[data-field="level"]');
      const xp = card.querySelector('[data-field="xp"]');
      const ap = card.querySelector('[data-field="actionPoints"]');
      const lum = card.querySelector('[data-field="lumina"]');
      const excl = card.querySelector('[data-field="excluded"]');
      if (level && !level.disabled && c.levelAt != null) {
        bytes = G.writeCharacterField(bytes, c.levelAt, Number(level.value) | 0).bytes;
      }
      if (xp && !xp.disabled && c.xpAt != null) {
        bytes = G.writeCharacterField(bytes, c.xpAt, Number(xp.value) | 0).bytes;
      }
      if (ap && !ap.disabled && c.actionPointsAt != null) {
        bytes = G.writeCharacterField(bytes, c.actionPointsAt, Number(ap.value) | 0).bytes;
      }
      if (lum && !lum.disabled && c.luminaAt != null) {
        bytes = G.writeCharacterField(bytes, c.luminaAt, Number(lum.value) | 0).bytes;
      }
      if (excl && c.excludedAt != null) {
        bytes = G.writeCharacterExcluded(bytes, c.excludedAt, excl.checked).bytes;
      }
      card.querySelectorAll("input[data-attr-at]").forEach((input) => {
        const at = Number(input.getAttribute("data-attr-at"));
        bytes = G.writeAttribute(bytes, at, Number(input.value) | 0).bytes;
      });
    });
    state.bytes = bytes;
    setDirty(true);
    refreshAll();
    setStatus("Character fields applied.");
  }

  function bindUi() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    $("btn-overview-refresh").addEventListener("click", () => refreshAll());
    $("btn-overview-apply").addEventListener("click", () => {
      try {
        applyOverview();
        setStatus("Overview applied. Save .sav to download.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-resources-refresh").addEventListener("click", () => refreshAll());
    $("btn-resources-apply").addEventListener("click", () => {
      try {
        applyResources();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-resources-insert").addEventListener("click", () => {
      try {
        insertMissingResources();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-resources-max").addEventListener("click", () => {
      const inputs = $("resources-grid").querySelectorAll("input[data-res]");
      inputs.forEach((input) => {
        const key = input.getAttribute("data-res");
        if (key === "gold") input.value = 999999;
        else if (key.indexOf("UpgradeMaterial") === 0) input.value = 99;
        else if (key.indexOf("Tint") >= 0 || key === "PartyHealShard") input.value = 10;
        else input.value = 99;
      });
    });

    $("btn-characters-refresh").addEventListener("click", () => refreshAll());
    $("btn-characters-apply").addEventListener("click", () => {
      try {
        applyCharacters();
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-weapons-refresh").addEventListener("click", () => refreshAll());
    $("btn-weapons-max").addEventListener("click", () => {
      try {
        const parsed = G.parseSave(state.bytes);
        let bytes = state.bytes;
        parsed.weapons.forEach((w) => {
          if (w.levelAt != null) bytes = G.writeWeaponLevel(bytes, w.levelAt, 33).bytes;
        });
        state.bytes = bytes;
        setDirty(true);
        refreshAll();
        setStatus("All weapon levels set to 33.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("weapons-table").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-wpn-apply]");
      if (!btn) return;
      try {
        const i = Number(btn.getAttribute("data-wpn-apply"));
        const parsed = G.parseSave(state.bytes);
        const w = parsed.weapons[i];
        const input = $("weapons-table").querySelector('input[data-wpn="' + i + '"]');
        if (!w || !input) return;
        state.bytes = G.writeWeaponLevel(state.bytes, w.levelAt, Number(input.value) | 0).bytes;
        setDirty(true);
        refreshAll();
        setStatus("Weapon " + w.name + " level set.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("pictos-table").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-pic-apply]");
      if (!btn) return;
      try {
        const i = Number(btn.getAttribute("data-pic-apply"));
        const parsed = G.parseSave(state.bytes);
        const p = parsed.pictos[i];
        if (!p) return;
        const learnt = $("pictos-table").querySelector('input[data-pic-learnt="' + i + '"]').checked;
        const steps = Number(
          $("pictos-table").querySelector('input[data-pic-steps="' + i + '"]').value
        ) | 0;
        state.bytes = G.writePictoFlags(state.bytes, p.learntAt, p.stepsAt, learnt, steps).bytes;
        setDirty(true);
        refreshAll();
        setStatus("Picto " + p.name + " updated.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-pictos-unlock-all").addEventListener("click", () => {
      try {
        if (!state.bytes) throw new Error("Load a save first.");
        const ids = (window.E33PictoIds && window.E33PictoIds.safe) || [];
        if (!ids.length) throw new Error("Picto catalog missing (pictos-data.js).");
        if (
          !confirm(
            "Unlock and master " +
              ids.length +
              " pictos?\n\nAdds inventory + progression entries (safe catalog only). Backup first."
          )
        ) {
          return;
        }
        setStatus("Unlocking pictos…");
        const result = G.unlockAllPictos(state.bytes, ids, { master: true, level: 1, steps: 4 });
        state.bytes = result.bytes;
        setDirty(true);
        refreshAll();
        setStatus(
          "Unlocked pictos: +" +
            result.insertedInventory +
            " inventory, +" +
            result.insertedPassives +
            " mastery, +" +
            result.insertedWeapons +
            " levels (" +
            result.requested +
            " total)."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-pictos-refresh").addEventListener("click", () => refreshAll());

    $("btn-spawn-refresh").addEventListener("click", () => refreshAll());
    $("btn-spawn-apply").addEventListener("click", () => {
      try {
        let bytes = state.bytes;
        const map = ($("f-map-edit").value || "").trim();
        const tag = ($("f-spawn-edit").value || "").trim();
        if (map) bytes = G.writeMapToLoad(bytes, map).bytes;
        if (tag) bytes = G.writeSpawnTag(bytes, tag).bytes;
        state.bytes = bytes;
        setDirty(true);
        refreshAll();
        setStatus("Map / spawn applied.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-collect-refresh").addEventListener("click", () => refreshAll());
    $("btn-collect-insert-all").addEventListener("click", () => {
      try {
        let bytes = state.bytes;
        D.COLLECTIBLE_KEYS.forEach((key) => {
          bytes = G.ensureInventoryItem(bytes, key, 1).bytes;
        });
        state.bytes = bytes;
        setDirty(true);
        refreshAll();
        setStatus("Collectible keys ensured.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("collectibles-table").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-col-apply]");
      if (!btn) return;
      try {
        const key = btn.getAttribute("data-col-apply");
        const input = $("collectibles-table").querySelector('input[data-col="' + key + '"]');
        const n = Math.max(0, Number(input.value) | 0);
        state.bytes = G.ensureInventoryItem(state.bytes, key, n || 1).bytes;
        setDirty(true);
        refreshAll();
        setStatus(key + " = " + (n || 1));
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("inv-filter").addEventListener("input", (e) => {
      state.invFilter = e.target.value || "";
      if (state.bytes) buildInventoryTable(G.parseSave(state.bytes));
    });

    $("inv-table").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-inv-apply]");
      if (!btn) return;
      const key = btn.getAttribute("data-inv-apply");
      const input = $("inv-table").querySelector('input[data-inv="' + key + '"]');
      if (!input) return;
      try {
        const n = Math.max(0, Number(input.value) | 0);
        const r = G.writeInventoryItem(state.bytes, key, n);
        state.bytes = r.bytes;
        setDirty(true);
        refreshAll();
        setStatus("Set " + key + " = " + n);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("slot-select").addEventListener("change", async () => {
      const name = $("slot-select").value;
      const entry = state.entries.find((e) => e.name === name);
      if (!entry) return;
      try {
        await loadEntries(state.entries, name);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("files-input").addEventListener("change", async (e) => {
      try {
        await loadFromFileList(e.target.files);
      } catch (err) {
        alert(err.message || String(err));
      }
      e.target.value = "";
    });
    $("folder-input").addEventListener("change", async (e) => {
      try {
        await loadFromFileList(e.target.files);
      } catch (err) {
        alert(err.message || String(err));
      }
      e.target.value = "";
    });
    $("zip-input").addEventListener("change", async (e) => {
      try {
        await loadFromFileList(e.target.files);
      } catch (err) {
        alert(err.message || String(err));
      }
      e.target.value = "";
    });

    $("btn-save").addEventListener("click", () => downloadBytes(false));
    $("btn-backup").addEventListener("click", () => downloadBytes(true));
    $("btn-install").addEventListener("click", () => {
      installToFolder().catch((err) => alert(err.message || String(err)));
    });

    function copyText(text, label) {
      const done = () => setStatus("Copied " + label + " to clipboard.");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
          window.prompt("Copy this:", text);
        });
      } else {
        window.prompt("Copy this:", text);
      }
    }

    const ACH_LIST =
      "cd tools/steam-achievement-unlocker\nnpm install\nnode unlock.js --app e33 --list";
    const ACH_UNLOCK =
      "cd tools/steam-achievement-unlocker\nnpm install\nnode unlock.js --app expedition33 --unlock-all";
    const ACH_LOCK =
      "cd tools/steam-achievement-unlocker\nnode unlock.js --app e33 --lock-all";

    $("btn-ach-copy-list").addEventListener("click", () => copyText(ACH_LIST, "list command"));
    $("btn-ach-copy-unlock").addEventListener("click", () => copyText(ACH_UNLOCK, "unlock-all command"));
    $("btn-ach-copy-lock").addEventListener("click", () => copyText(ACH_LOCK, "lock-all command"));

    const overlay = $("drop-overlay");
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      overlay.hidden = false;
    });
    window.addEventListener("dragleave", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      overlay.hidden = true;
      try {
        await loadFromFileList(e.dataTransfer.files);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    if (window.GGSaveFolders) {
      GGSaveFolders.wireEditor("expedition33", {
        setStatus,
        async onDirectory(handle) {
          try {
            const files = [];
            async function walk(dir, depth) {
              if (depth > 4) return;
              for await (const [name, ent] of dir.entries()) {
                if (ent.kind === "file" && /\.sav$/i.test(name)) {
                  const f = await ent.getFile();
                  files.push(f);
                } else if (ent.kind === "directory" && name.toLowerCase() !== "backup") {
                  await walk(ent, depth + 1);
                }
              }
            }
            await walk(handle, 0);
            await loadFromFileList(files);
          } catch (err) {
            setStatus(err.message || String(err));
            alert(err.message || String(err));
          }
        },
      });
    }
  }

  bindUi();
})();
