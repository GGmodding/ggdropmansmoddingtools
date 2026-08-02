(() => {
  "use strict";

  const G = window.Subnautica2Gvas;
  const S = window.Subnautica2Save;
  const D = window.Subnautica2Data;
  const $ = (id) => document.getElementById(id);

  const PANELS = ["overview", "meta", "vitals", "inventory", "features", "cheats"];

  const state = {
    fileName: "savegame_0.sav",
    bytes: null,
    entries: [],
    dirty: false,
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

  function fillModeSelect(current) {
    const sel = $("f-mode");
    const modes = new Set(G.GAME_MODES);
    if (current) modes.add(current);
    sel.innerHTML = [...modes]
      .map(
        (m) =>
          "<option value=\"" +
          escapeHtml(m) +
          "\"" +
          (m === current ? " selected" : "") +
          ">" +
          escapeHtml(m) +
          "</option>"
      )
      .join("");
  }

  function refreshAll() {
    if (!state.bytes) return;
    const meta = G.parseMetadata(state.bytes);
    $("overview-meta").innerHTML =
      "<span>File <strong>" +
      escapeHtml(state.fileName) +
      "</strong></span>" +
      "<span>Slot <strong>" +
      escapeHtml(meta.slotName || "—") +
      "</strong></span>" +
      "<span>Name <strong>" +
      escapeHtml(meta.displayName || "—") +
      "</strong></span>" +
      "<span>Mode <strong>" +
      escapeHtml(meta.gameMode || "—") +
      "</strong></span>" +
      "<span>Size <strong>" +
      escapeHtml(S.formatBytes(meta.size)) +
      "</strong></span>" +
      "<span>Playtime <strong>" +
      escapeHtml(S.formatPlaytime(meta.playtimeSeconds)) +
      "</strong></span>" +
      "<span>MP <strong>" +
      (meta.isMultiplayer ? "yes" : "no") +
      "</strong></span>";

    $("f-slot").value = meta.slotName || "";
    $("f-display").value = (meta.displayName || "").trimEnd();
    fillModeSelect(meta.gameMode || "Survival");
    $("f-mode").value = meta.gameMode || "Survival";
    $("f-level").value = meta.levelName || "";
    $("f-build").value =
      (meta.buildNumber != null ? String(meta.buildNumber) : "—") +
      (meta.buildBranch ? " · " + meta.buildBranch : "");
    $("f-playtime").value = S.formatPlaytime(meta.playtimeSeconds);
    $("f-mp").checked = !!meta.isMultiplayer;

    const vitals = G.parseVitals(state.bytes);
    const missing = $("vitals-missing");
    const body = $("vitals-body");
    if (!vitals.ok) {
      missing.hidden = false;
      body.hidden = true;
    } else {
      missing.hidden = true;
      body.hidden = false;
      $("v-health").value = vitals.health != null ? Math.round(vitals.health * 10) / 10 : "";
      $("v-food").value = vitals.food != null ? Math.round(vitals.food * 10) / 10 : "";
      $("v-water").value = vitals.water != null ? Math.round(vitals.water * 10) / 10 : "";
      $("v-oxygen").value = vitals.oxygen != null ? Math.round(vitals.oxygen * 10) / 10 : "";
    }

    const items = G.listSoftItems(state.bytes);
    $("inv-hint").textContent =
      items.length +
      " unique DA_* paths scanned (mentions, not stack counts).";
    $("inv-table").querySelector("tbody").innerHTML = items
      .slice(0, 200)
      .map(
        (it) =>
          "<tr><td><code>" +
          escapeHtml(it.id) +
          "</code></td><td>" +
          it.count +
          "</td></tr>"
      )
      .join("");

    $("feature-table").querySelector("tbody").innerHTML = G.FEATURE_MATRIX.map(
      (f) =>
        "<tr><td>" +
        escapeHtml(f.title) +
        "</td><td><strong>" +
        escapeHtml(f.status) +
        "</strong></td><td>" +
        escapeHtml(f.note) +
        "</td></tr>"
    ).join("");

    $("cheat-table").querySelector("tbody").innerHTML = D.CONSOLE_HINTS.map(
      (c) =>
        "<tr><td><code>" +
        escapeHtml(c.cmd) +
        "</code></td><td>" +
        escapeHtml(c.desc) +
        "</td></tr>"
    ).join("");
  }

  async function loadEntries(entries, preferredName) {
    if (!entries.length) throw new Error("No .sav/.bak files found.");
    state.entries = entries;
    let primary = null;
    if (preferredName) {
      primary = entries.find((e) => e.name === preferredName) || null;
    }
    if (!primary) primary = S.pickPrimary(entries);
    if (!primary) throw new Error("No usable savegame_*.sav in selection.");
    state.fileName = primary.name;
    state.bytes = primary.bytes;
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
          " into the folder you picked?\n\nClose Subnautica 2 first."
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

  function applyMetadata() {
    let bytes = state.bytes;
    const display = ($("f-display").value || "").trim();
    if (display) {
      const r = G.rewriteStrProperty(bytes, "DisplayName", display);
      bytes = r.bytes;
    }
    const mode = $("f-mode").value;
    const cur = G.parseMetadata(bytes).gameMode;
    if (mode && cur && mode !== cur) {
      if (mode.length !== cur.length) {
        throw new Error(
          "Cannot change mode " +
            cur +
            " → " +
            mode +
            " in-place (length " +
            cur.length +
            " vs " +
            mode.length +
            "). Survival↔Creative works (both 8)."
        );
      }
      const r = G.rewriteStrProperty(bytes, "GameMode", mode);
      bytes = r.bytes;
    }
    const rBool = G.rewriteBoolProperty(bytes, "bIsMultiplayerSave", $("f-mp").checked);
    bytes = rBool.bytes;
    state.bytes = bytes;
    setDirty(true);
    refreshAll();
  }

  function bindUi() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    $("btn-meta-refresh").addEventListener("click", () => refreshAll());
    $("btn-meta-apply").addEventListener("click", () => {
      try {
        applyMetadata();
        setStatus("Metadata applied. Save .sav to download.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-vitals-refresh").addEventListener("click", () => refreshAll());
    $("btn-vitals-apply").addEventListener("click", () => {
      try {
        const result = G.writeVitals(state.bytes, {
          health: $("v-health").value,
          food: $("v-food").value,
          water: $("v-water").value,
          oxygen: $("v-oxygen").value,
        });
        state.bytes = result.bytes;
        setDirty(true);
        refreshAll();
        setStatus("Vitals applied: " + JSON.stringify(result.values));
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-vitals-fill").addEventListener("click", () => {
      $("v-health").value = 100;
      $("v-food").value = 100;
      $("v-water").value = 100;
      $("v-oxygen").value = 100;
      $("btn-vitals-apply").click();
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

    // Drag & drop
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
      GGSaveFolders.wireEditor("subnautica2", {
        setStatus,
        async onDirectory(handle) {
          try {
            const files = [];
            async function walk(dir, depth) {
              if (depth > 3) return;
              for await (const [name, ent] of dir.entries()) {
                if (ent.kind === "file" && S.isSaveName(name)) {
                  const f = await ent.getFile();
                  files.push(f);
                } else if (ent.kind === "directory") {
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

  // SN2 accent tweak
  document.documentElement.style.setProperty("--accent", "#6fd3ff");
  document.documentElement.style.setProperty("--accent-2", "#ffb347");

  bindUi();
})();
