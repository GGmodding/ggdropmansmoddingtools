(() => {
  "use strict";

  const G = window.MortalShell2Gvas;
  const S = window.MortalShell2Save;
  const D = window.MortalShell2Data;
  const $ = (id) => document.getElementById(id);

  const PANELS = ["overview", "player", "properties", "inventory", "notes"];

  const state = {
    fileName: "SaveSlot.sav",
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
    if (show) {
      const active = document.querySelector(".tab.is-active");
      switchTab((active && active.dataset.tab) || "overview");
    } else {
      PANELS.forEach((id) => {
        $("panel-" + id).hidden = true;
      });
    }
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      const on = panel.id === "panel-" + tab;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    });
  }

  function formatValue(prop) {
    if (prop.value == null) return "—";
    if (typeof prop.value === "number") {
      if (!Number.isInteger(prop.value)) return String(Math.round(prop.value * 1000) / 1000);
      return String(prop.value);
    }
    if (typeof prop.value === "boolean") return prop.value ? "true" : "false";
    return String(prop.value);
  }

  function refreshAll() {
    if (!state.bytes) return;
    const header = G.parseHeader(state.bytes);
    const props = G.uniqueProps(G.scanProperties(state.bytes));
    const curated = G.matchCurated(state.bytes, D.CURATED_FIELDS);
    const drops = G.parseDropItems(state.bytes);
    const assets = G.listAssets(state.bytes);

    $("overview-meta").innerHTML =
      "<span>File <strong>" +
      escapeHtml(state.fileName) +
      "</strong></span>" +
      "<span>Size <strong>" +
      escapeHtml(S.formatBytes(header.size)) +
      "</strong></span>" +
      "<span>GVAS <strong>" +
      (header.looksGvas ? "yes @" + header.gvasAt : "not at start") +
      "</strong></span>" +
      "<span>Class <strong>" +
      escapeHtml(header.saveClass || "—") +
      "</strong></span>" +
      "<span>Properties <strong>" +
      props.length +
      "</strong></span>" +
      "<span>Known fields <strong>" +
      curated.length +
      "</strong></span>";

    const missing = $("player-missing");
    const body = $("player-fields");
    if (!curated.length) {
      missing.hidden = false;
      body.innerHTML = "";
    } else {
      missing.hidden = true;
      body.innerHTML = curated
        .map((row) => {
          const p = row.prop;
          const isBool = p.type === "BoolProperty";
          if (isBool) {
            return (
              '<label class="check"><input id="c-' +
              escapeHtml(row.field.id) +
              '" type="checkbox"' +
              (p.value ? " checked" : "") +
              " /> " +
              escapeHtml(row.field.label) +
              " <code>" +
              escapeHtml(p.name) +
              "</code></label>"
            );
          }
          return (
            "<label>" +
            escapeHtml(row.field.label) +
            " <code>" +
            escapeHtml(p.name) +
            "</code>" +
            '<input id="c-' +
            escapeHtml(row.field.id) +
            '" type="number" step="any" value="' +
            escapeHtml(formatValue(p)) +
            '" /></label>'
          );
        })
        .join("");
    }

    const q = ($("prop-search").value || "").toLowerCase();
    const filtered = props.filter((p) => {
      if (!q) return true;
      return (p.name + " " + p.type + " " + formatValue(p)).toLowerCase().includes(q);
    });
    $("prop-hint").textContent = filtered.length + " / " + props.length + " unique properties.";
    $("prop-table").querySelector("tbody").innerHTML = filtered
      .slice(0, 400)
      .map((p, i) => {
        const id = "p-" + i;
        const disabled = p.editable ? "" : " disabled";
        const input =
          p.type === "BoolProperty"
            ? '<input data-name="' +
              escapeHtml(p.name) +
              '" data-type="' +
              escapeHtml(p.type) +
              '" type="checkbox"' +
              (p.value ? " checked" : "") +
              disabled +
              " />"
            : '<input data-name="' +
              escapeHtml(p.name) +
              '" data-type="' +
              escapeHtml(p.type) +
              '" type="text" value="' +
              escapeHtml(formatValue(p)) +
              '"' +
              disabled +
              " />";
        const apply = p.editable
          ? '<button type="button" class="btn" data-apply="' + id + '" data-name="' + escapeHtml(p.name) + '" data-type="' + escapeHtml(p.type) + '">Apply</button>'
          : "";
        return (
          "<tr><td><code>" +
          escapeHtml(p.name) +
          "</code></td><td>" +
          escapeHtml(p.type) +
          "</td><td>" +
          (p.hits > 1 ? p.hits : "") +
          "</td><td>" +
          input +
          "</td><td>" +
          apply +
          "</td></tr>"
        );
      })
      .join("");

    $("inv-hint").textContent =
      drops.length +
      " DropItems stacks · " +
      assets.length +
      " unique /Game/ paths (path mentions, not extra counts).";
    const dropRows = drops.map(
      (it) =>
        "<tr><td><code>" +
        escapeHtml(it.short) +
        "</code></td><td>" +
        '<input data-drop="' +
        escapeHtml(it.path) +
        '" type="number" step="1" value="' +
        it.amount +
        '" /></td><td><button type="button" class="btn" data-drop-apply="' +
        escapeHtml(it.path) +
        '">Apply</button></td></tr>'
    );
    const assetRows = assets.slice(0, 200).map(
      (it) =>
        "<tr><td><code>" +
        escapeHtml(it.id) +
        "</code></td><td>" +
        it.count +
        "</td><td></td></tr>"
    );
    $("inv-table").querySelector("tbody").innerHTML = dropRows.concat(assetRows).join("");

    $("notes-table").querySelector("tbody").innerHTML = D.NOTES.map(
      (n) =>
        "<tr><td>" +
        escapeHtml(n.tip) +
        "</td><td>" +
        escapeHtml(n.detail) +
        "</td></tr>"
    ).join("");
  }

  function fillSlotSelect() {
    const wrap = $("slot-wrap");
    const sel = $("slot-select");
    const savs = state.entries.filter((e) => S.isSaveName(e.name));
    if (savs.length < 2) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    sel.innerHTML = savs
      .map(
        (e) =>
          "<option value=\"" +
          escapeHtml(e.name) +
          "\"" +
          (e.name === state.fileName ? " selected" : "") +
          ">" +
          escapeHtml(e.name) +
          " · " +
          S.formatBytes(e.bytes.length) +
          "</option>"
      )
      .join("");
  }

  async function loadEntries(entries, preferredName) {
    if (!entries.length) throw new Error("No .sav/.bak files found.");
    state.entries = entries;
    let primary = null;
    if (preferredName) primary = entries.find((e) => e.name === preferredName) || null;
    if (!primary) primary = S.pickPrimary(entries);
    if (!primary) throw new Error("No usable .sav in selection.");
    state.fileName = primary.name;
    state.bytes = primary.bytes;
    showEditor(true);
    fillSlotSelect();
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
      await loadEntries(await S.readZip(fileList[0]));
      return;
    }
    await loadEntries(await S.readFileEntriesFromList(fileList));
  }

  function downloadBytes(isBackup) {
    if (!state.bytes) return;
    if (!isBackup) flushEdits({ silent: true });
    const name = (isBackup ? "backup-" : "edited-") + state.fileName;
    const blob = new Blob([state.bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    if (!isBackup) setDirty(false);
    setStatus((isBackup ? "Backup" : "Save") + " downloaded: " + name);
  }

  async function installToFolder() {
    if (!state.bytes) return;
    if (typeof window.showDirectoryPicker !== "function") {
      alert("Install to Folder needs Chrome/Edge. Use Save .sav instead.");
      return;
    }
    flushEdits({ silent: true });
    let dir;
    try {
      dir = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch {
      return;
    }
    if (!confirm("Write " + state.fileName + " into the folder you picked?\n\nQuit Mortal Shell 2 fully first. A running game will overwrite this slot.")) {
      return;
    }
    const handle = await dir.getFileHandle(state.fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(state.bytes);
    await writable.close();
    setDirty(false);
    setStatus("Installed " + state.fileName + " into selected folder.");
  }

  function applyPlayer(opts) {
    const silent = opts && opts.silent;
    const skipRefresh = opts && opts.skipRefresh;
    const curated = G.matchCurated(state.bytes, D.CURATED_FIELDS);
    let bytes = state.bytes;
    let n = 0;
    for (const row of curated) {
      const el = $("c-" + row.field.id);
      if (!el) continue;
      const next = row.prop.type === "BoolProperty" ? el.checked : el.value;
      bytes = G.writeValue(bytes, row.prop, next);
      const life = D.WALLET_LIFETIME && D.WALLET_LIFETIME[row.field.id];
      if (life) {
        try {
          bytes = G.writeNamed(bytes, life, next, "IntProperty");
        } catch (_) {}
      }
      if (row.field.id === "gloom") {
        try {
          bytes = G.writeNamed(bytes, "LostGloomAmount", 0, "IntProperty");
        } catch (_) {}
      }
      n += 1;
    }
    state.bytes = bytes;
    setDirty(true);
    if (!skipRefresh) refreshAll();
    if (!silent) setStatus("Applied " + n + " player field(s). Save/Install writes them to disk.");
  }

  function flushEdits(opts) {
    applyPlayer({ silent: true, skipRefresh: true });
    const table = $("inv-table");
    if (table) {
      table.querySelectorAll("input[data-drop]").forEach((input) => {
        try {
          state.bytes = G.writeDropItem(state.bytes, input.getAttribute("data-drop"), input.value);
        } catch (_) {}
      });
    }
    if (!opts || !opts.skipRefresh) refreshAll();
  }

  function applyPropButton(btn) {
    const row = btn.closest("tr");
    const input = row && row.querySelector("input[data-name]");
    if (!input) return;
    const name = input.getAttribute("data-name");
    const type = input.getAttribute("data-type");
    const value = input.type === "checkbox" ? input.checked : input.value;
    state.bytes = G.writeNamed(state.bytes, name, value, type);
    setDirty(true);
    refreshAll();
    setStatus("Wrote " + name + ".");
  }

  function bindUi() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    $("btn-player-refresh").addEventListener("click", () => refreshAll());
    $("btn-player-apply").addEventListener("click", () => {
      try {
        applyPlayer();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("prop-search").addEventListener("input", () => refreshAll());
    $("prop-table").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-apply]");
      if (!btn) return;
      try {
        applyPropButton(btn);
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("inv-table").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-drop-apply]");
      if (!btn) return;
      const path = btn.getAttribute("data-drop-apply");
      const input = $("inv-table").querySelector('input[data-drop="' + path.replace(/"/g, '\\"') + '"]');
      if (!input) return;
      try {
        state.bytes = G.writeDropItem(state.bytes, path, input.value);
        setDirty(true);
        refreshAll();
        setStatus("Wrote DropItems " + path.split("/").pop() + ".");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("slot-select").addEventListener("change", async () => {
      const name = $("slot-select").value;
      try {
        await loadEntries(state.entries, name);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    const onFiles = async (e) => {
      try {
        await loadFromFileList(e.target.files);
      } catch (err) {
        alert(err.message || String(err));
      }
      e.target.value = "";
    };
    $("files-input").addEventListener("change", onFiles);
    $("folder-input").addEventListener("change", onFiles);
    $("zip-input").addEventListener("change", onFiles);

    $("btn-save").addEventListener("click", () => downloadBytes(false));
    $("btn-backup").addEventListener("click", () => downloadBytes(true));
    $("btn-install").addEventListener("click", () => {
      installToFolder().catch((err) => alert(err.message || String(err)));
    });

    const overlay = $("drop-overlay");
    function hasFiles(e) {
      const types = e.dataTransfer && e.dataTransfer.types;
      if (!types) return false;
      return Array.from(types).indexOf("Files") >= 0;
    }
    window.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      overlay.hidden = false;
    });
    window.addEventListener("dragleave", (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
    overlay.addEventListener("click", () => {
      overlay.hidden = true;
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.hidden = true;
    });
    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      overlay.hidden = true;
      if (!hasFiles(e)) return;
      try {
        await loadFromFileList(e.dataTransfer.files);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    if (window.GGSaveFolders) {
      GGSaveFolders.wireEditor("mortalshell2", {
        setStatus,
        async onDirectory(handle) {
          try {
            const files = [];
            async function walk(dir, depth) {
              if (depth > 4) return;
              for await (const [name, ent] of dir.entries()) {
                if (ent.kind === "file" && S.isSaveName(name)) files.push(await ent.getFile());
                else if (ent.kind === "directory") await walk(ent, depth + 1);
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
