(() => {
  "use strict";

  const G = window.E33Gvas;
  const S = window.E33Save;
  const D = window.E33Data;
  const $ = (id) => document.getElementById(id);

  const PANELS = ["overview", "resources", "characters", "inventory", "features", "notes"];

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
        const disabled = r.present ? "" : " disabled";
        const val = r.present ? r.value : "";
        const note = r.present ? "" : " (not in save)";
        return (
          "<label>" +
          escapeHtml(r.label) +
          note +
          '<input data-res="' +
          escapeHtml(r.id) +
          '" type="number" min="0" step="1" value="' +
          escapeHtml(String(val)) +
          '"' +
          disabled +
          " /></label>"
        );
      })
      .join("");
    const missing = rows.filter((r) => !r.present).map((r) => r.label);
    $("resources-hint").textContent = missing.length
      ? "Missing from this save (pick up in-game first): " + missing.join(", ")
      : "All listed resources are present in this save.";
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
      if (input.disabled || input.value === "") return;
      const key = input.getAttribute("data-res");
      const n = Math.max(0, Number(input.value) | 0);
      if (key === "gold") {
        const r = G.writeIntProperty(bytes, "Gold", n);
        bytes = r.bytes;
        applied.push("Gold=" + n);
      } else {
        const r = G.writeInventoryItem(bytes, key, n);
        bytes = r.bytes;
        applied.push(key + "=" + n);
      }
    });
    state.bytes = bytes;
    setDirty(true);
    refreshAll();
    setStatus("Resources applied: " + (applied.join(", ") || "nothing"));
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
    $("btn-resources-max").addEventListener("click", () => {
      const inputs = $("resources-grid").querySelectorAll("input[data-res]");
      inputs.forEach((input) => {
        if (input.disabled) return;
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
