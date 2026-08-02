import { decompress as oozDecompress } from "./vendor/index.js";

(() => {
  "use strict";

  const C = window.GroundedCsav;
  const H = window.GroundedHeader;
  const P = window.GroundedPlayer;
  const S = window.GroundedSave;
  const Inv = window.GroundedInventory;
  const D = window.GroundedData;
  const $ = (id) => document.getElementById(id);

  const PANELS = ["overview", "meta", "vitals", "inventory", "features", "cheats"];

  const state = {
    slotName: "Grounded2Save",
    files: new Map(),
    originalFiles: new Map(),
    slots: new Map(),
    hostRaw: null,
    worldRaw: null,
    dirty: false,
    screenshotUrl: null,
    catalogItems: [],
  };

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("dirty-pill").hidden = !dirty;
    const has = state.files.size > 0;
    $("btn-save").disabled = !has;
    $("btn-backup").disabled = !has;
    $("btn-install").disabled = !has;
    refreshChangeSummary();
  }

  function snapshotOriginals() {
    state.originalFiles = new Map();
    for (const [n, bytes] of state.files.entries()) {
      state.originalFiles.set(n, bytes.slice(0));
    }
  }

  function changedFileSummary() {
    const rows = [];
    for (const [name, bytes] of state.files.entries()) {
      const orig = state.originalFiles.get(name);
      if (!orig) {
        rows.push({ name, kind: "new", before: 0, after: bytes.length });
        continue;
      }
      if (orig.length !== bytes.length) {
        rows.push({
          name,
          kind: "resized",
          before: orig.length,
          after: bytes.length,
        });
        continue;
      }
      let same = true;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== orig[i]) {
          same = false;
          break;
        }
      }
      if (!same) {
        rows.push({
          name,
          kind: "edited",
          before: orig.length,
          after: bytes.length,
        });
      }
    }
    return rows;
  }

  function refreshChangeSummary() {
    const el = $("change-summary");
    if (!el) return;
    if (!state.files.size) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const rows = changedFileSummary();
    if (!rows.length) {
      el.hidden = true;
      el.textContent = "No byte changes vs loaded originals.";
      return;
    }
    el.hidden = false;
    el.innerHTML =
      "<strong>Pending writes</strong> (" +
      rows.length +
      " file" +
      (rows.length === 1 ? "" : "s") +
      "): " +
      rows
        .map(
          (r) =>
            "<code>" +
            escapeHtml(r.name) +
            "</code> " +
            r.kind +
            " " +
            S.formatBytes(r.before) +
            " → " +
            S.formatBytes(r.after)
        )
        .join(" · ");
  }

  function confirmWrite(actionLabel) {
    const rows = changedFileSummary();
    const lines = [
      actionLabel + " will write " + (rows.length || state.files.size) + " file(s).",
      "",
      "Close Grounded 2 (Augusta) first so the game cannot overwrite your edits.",
      "",
    ];
    if (rows.length) {
      lines.push("Changed:");
      for (const r of rows.slice(0, 12)) {
        lines.push(
          "- " +
            r.name +
            " (" +
            r.kind +
            ", " +
            S.formatBytes(r.before) +
            " → " +
            S.formatBytes(r.after) +
            ")"
        );
      }
      if (rows.length > 12) lines.push("- … +" + (rows.length - 12) + " more");
    } else {
      lines.push("No detected byte diffs vs load — writing full slot anyway.");
    }
    lines.push("", "Continue?");
    return confirm(lines.join("\n"));
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

  function getFile(name) {
    for (const [n, bytes] of state.files.entries()) {
      if (n.toLowerCase() === name.toLowerCase()) return bytes;
    }
    return null;
  }

  function setFile(name, bytes) {
    for (const n of state.files.keys()) {
      if (n.toLowerCase() === name.toLowerCase()) {
        state.files.set(n, bytes);
        return;
      }
    }
    state.files.set(name, bytes);
  }

  async function decompressPlayerFiles() {
    state.hostRaw = null;
    state.worldRaw = null;
    const host = getFile("HostPlayer.csav");
    if (host) {
      try {
        state.hostRaw = await C.decompressCsav(host, oozDecompress);
      } catch (err) {
        throw new Error(
          "Failed to decompress HostPlayer.csav (" +
            (err.message || err) +
            "). Try Chrome/Edge with WebAssembly SIMD enabled."
        );
      }
    }
    const world = getFile("World.csav");
    if (world) {
      setStatus("Decompressing World.csav…");
      try {
        state.worldRaw = await C.decompressCsav(world, oozDecompress);
      } catch (err) {
        console.warn("World.csav decompress failed", err);
        state.worldRaw = null;
      }
    }
  }

  function syncPlayerCopies(hostCsavBytes) {
    const mode = ($("player-edit-mode") && $("player-edit-mode").value) || "mirror";
    const selected =
      ($("player-file-select") && $("player-file-select").value) || "HostPlayer.csav";
    if (mode === "solo") {
      setFile(selected, hostCsavBytes);
      return;
    }
    setFile("HostPlayer.csav", hostCsavBytes);
    for (const name of [...state.files.keys()]) {
      if (/^Player_.+\.csav$/i.test(name)) {
        state.files.set(name, hostCsavBytes);
      }
    }
  }

  function commitHostRaw(bytes) {
    state.hostRaw = bytes;
    syncPlayerCopies(C.compressCsav(bytes));
    setDirty(true);
    refreshAll();
  }

  function slotOptionLabel(key) {
    if (key === "(loose)") return "(selected files)";
    const meta = P.parseSlotFolderName(key);
    const bits = [];
    if (meta.kind && meta.kind !== "manual") bits.push(meta.kind);
    if (meta.area) bits.push(meta.area);
    if (meta.gameTime) bits.push(meta.gameTime);
    return bits.length ? key + " — " + bits.join(" · ") : key;
  }

  function populateSlotSelect(preferredKey) {
    const sel = $("slot-select");
    const keys = [...state.slots.keys()].sort((a, b) => {
      if (a === "(loose)") return 1;
      if (b === "(loose)") return -1;
      return (
        S.scoreSlot(b, state.slots.get(b)) - S.scoreSlot(a, state.slots.get(a))
      );
    });
    if (keys.length <= 1) {
      $("slot-wrap").hidden = true;
      return;
    }
    $("slot-wrap").hidden = false;
    sel.innerHTML = keys
      .map(
        (k) =>
          "<option value=\"" +
          escapeHtml(k) +
          "\"" +
          (k === preferredKey ? " selected" : "") +
          ">" +
          escapeHtml(slotOptionLabel(k)) +
          "</option>"
      )
      .join("");
  }

  function populatePlayerFileSelect() {
    const sel = $("player-file-select");
    if (!sel) return;
    const names = [...state.files.keys()]
      .filter((n) => /^HostPlayer\.csav$/i.test(n) || /^Player_.+\.csav$/i.test(n))
      .sort((a, b) => {
        if (/^HostPlayer/i.test(a)) return -1;
        if (/^HostPlayer/i.test(b)) return 1;
        return a.localeCompare(b);
      });
    sel.innerHTML = names
      .map((n) => "<option value=\"" + escapeHtml(n) + "\">" + escapeHtml(n) + "</option>")
      .join("");
  }

  async function loadSlot(slotKey) {
    const files = state.slots.get(slotKey);
    if (!files || !files.length) throw new Error("Empty slot.");
    state.slotName = slotKey === "(loose)" ? "Grounded2Save" : slotKey;
    setStatus("Reading slot files…");
    const materialized = await S.materializeSlot(files);
    state.slots.set(slotKey, materialized);
    state.files = new Map();
    for (const f of materialized) state.files.set(f.name, f.bytes);
    snapshotOriginals();
    if (!getFile("SaveGameHeaderData.savheader") && !getFile("HostPlayer.csav")) {
      throw new Error(
        "Slot missing SaveGameHeaderData.savheader / HostPlayer.csav.\n\n" +
          "Pick one save folder (e.g. a LOGOUT-SAVE), not only random files."
      );
    }
    setStatus("Decompressing HostPlayer.csav…");
    await decompressPlayerFiles();
    showEditor(true);
    setDirty(false);
    refreshAll();
    setStatus(
      "Loaded " +
        state.slotName +
        " · " +
        state.files.size +
        " files" +
        (state.hostRaw ? " · HostPlayer raw " + S.formatBytes(state.hostRaw.length) : "") +
        (state.worldRaw ? " · World raw " + S.formatBytes(state.worldRaw.length) : "")
    );
  }

  async function loadFromSlotMap(slotMap) {
    if (!slotMap.size) throw new Error("No .csav / .savheader files in selection.");
    state.slots = slotMap;
    const primary = S.pickPrimarySlot(slotMap);
    if (!primary) throw new Error("Could not pick a save slot.");
    populateSlotSelect(primary.key);
    await loadSlot(primary.key);
  }

  async function loadFromFileList(fileList) {
    if (!fileList || !fileList.length) throw new Error("No files selected.");
    setStatus("Indexing save files…");
    const slotMap = await S.indexFileList(fileList);
    if (!slotMap.size) {
      throw new Error(
        "No Grounded 2 save files found.\n\nExpected HostPlayer.csav, World.csav, or SaveGameHeaderData.savheader inside a slot folder."
      );
    }
    await loadFromSlotMap(slotMap);
  }

  async function loadFromDirectoryHandle(handle) {
    setStatus("Scanning “" + handle.name + "”…");
    const collected = await S.collectSlotFilesFromDirectory(handle, 3);
    if (!collected.length) {
      throw new Error(
        "No Grounded 2 save files in “" +
          handle.name +
          "”.\n\nPaste %USERPROFILE%\\Saved Games\\Grounded2 and pick that folder, or open one (ID-…) slot folder."
      );
    }
    const slotMap = new Map();
    for (const item of collected) {
      const key = S.normalizePath(item.relativePath).includes("/")
        ? S.dirname(item.relativePath)
        : S.looksLikeSlotFolderName(handle.name)
          ? handle.name
          : "(loose)";
      if (!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key).push({
        name: item.name,
        path: item.relativePath,
        file: item.file,
        bytes: null,
      });
    }
    await loadFromSlotMap(slotMap);
  }

  function refreshInventoryUi() {
    const hint = $("inv-hint");
    const tbody = $("inv-edit-table").querySelector("tbody");
    if (!state.hostRaw || !Inv) {
      hint.textContent = "Load a save to edit inventory.";
      tbody.innerHTML = "";
      return;
    }
    const parsed = Inv.parseInventory(state.hostRaw);
    if (!parsed.ok) {
      hint.textContent = "Could not parse InventoryComponent (G2 layout).";
      tbody.innerHTML = "";
      return;
    }
    hint.textContent =
      parsed.items.length +
      " items (component count " +
      parsed.count +
      ").";
    const names = [...new Set(parsed.items.map((it) => it.name))].sort();
    $("inv-item-names").innerHTML = names
      .map((n) => "<option value=\"" + escapeHtml(n) + "\"></option>")
      .join("");
    tbody.innerHTML = parsed.items
      .map((it, idx) => {
        const stackCtrl =
          it.stackOff >= 0
            ? "<input type=\"number\" min=\"1\" max=\"9999\" value=\"" +
              it.stack +
              "\" data-inv-stack=\"" +
              idx +
              "\" style=\"width:5rem\" />"
            : String(it.stack);
        return (
          "<tr><td><code>" +
          escapeHtml(it.name) +
          "</code></td><td>" +
          stackCtrl +
          "</td><td>" +
          escapeHtml(it.enhancement || "—") +
          "</td><td><button type=\"button\" class=\"btn\" data-inv-rm=\"" +
          idx +
          "\">Remove</button></td></tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("[data-inv-rm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        try {
          const idx = Number(btn.getAttribute("data-inv-rm"));
          const r = Inv.removeInventoryItem(state.hostRaw, idx);
          commitHostRaw(r.bytes);
          setStatus("Removed inventory item.");
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    });
    tbody.querySelectorAll("[data-inv-stack]").forEach((inp) => {
      inp.addEventListener("change", () => {
        try {
          const idx = Number(inp.getAttribute("data-inv-stack"));
          const r = Inv.setInventoryStack(state.hostRaw, idx, Number(inp.value));
          commitHostRaw(r.bytes);
          setStatus("Updated stack to " + r.stack + ".");
        } catch (err) {
          alert(err.message || String(err));
          refreshInventoryUi();
        }
      });
    });
  }

  function refreshCatalog() {
    const filter = (($("catalog-filter") && $("catalog-filter").value) || "")
      .trim()
      .toLowerCase();
    const blobs = [];
    if (state.hostRaw) blobs.push(state.hostRaw);
    if (state.worldRaw) blobs.push(state.worldRaw);
    if (!blobs.length) {
      state.catalogItems = [];
      $("catalog-hint").textContent = "Load a save to scan soft paths.";
      $("catalog-table").querySelector("tbody").innerHTML = "";
      return;
    }
    const merged = new Map();
    for (const b of blobs) {
      for (const it of P.listItemPaths(b)) {
        merged.set(it.id, (merged.get(it.id) || 0) + it.count);
      }
    }
    state.catalogItems = [...merged.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    const shown = state.catalogItems.filter(
      (it) => !filter || it.id.toLowerCase().includes(filter)
    );
    $("catalog-hint").textContent =
      shown.length + " / " + state.catalogItems.length + " unique soft-path ids.";
    $("catalog-table").querySelector("tbody").innerHTML = shown
      .slice(0, 300)
      .map(
        (it) =>
          "<tr><td><code>" +
          escapeHtml(it.id) +
          "</code></td><td>" +
          it.count +
          "</td></tr>"
      )
      .join("");
  }

  function refreshAll() {
    if (!state.files.size) return;
    const headerBytes = getFile("SaveGameHeaderData.savheader");
    let meta = null;
    if (headerBytes) {
      try {
        meta = H.parseHeader(headerBytes);
      } catch (err) {
        setStatus(err.message || String(err));
      }
    }

    const folderMeta = P.parseSlotFolderName(state.slotName);
    $("overview-meta").innerHTML =
      "<span>Slot <strong>" +
      escapeHtml(state.slotName) +
      "</strong></span>" +
      "<span>Kind <strong>" +
      escapeHtml(folderMeta.kind) +
      "</strong></span>" +
      "<span>World <strong>" +
      escapeHtml((meta && meta.worldName) || "—") +
      "</strong></span>" +
      "<span>Area <strong>" +
      escapeHtml((meta && meta.areaName) || folderMeta.area || "—") +
      "</strong></span>" +
      "<span>Version <strong>" +
      escapeHtml((meta && meta.gameVersion) || "—") +
      "</strong></span>" +
      "<span>HostPlayer <strong>" +
      escapeHtml(state.hostRaw ? S.formatBytes(state.hostRaw.length) : "—") +
      "</strong></span>" +
      "<span>World <strong>" +
      escapeHtml(state.worldRaw ? S.formatBytes(state.worldRaw.length) : "—") +
      "</strong></span>";

    $("overview-files").innerHTML = [...state.files.entries()]
      .map(
        ([name, bytes]) =>
          "<div class=\"file-list__row\"><code>" +
          escapeHtml(name) +
          "</code><span>" +
          S.formatBytes(bytes.length) +
          "</span></div>"
      )
      .join("");

    const shot = getFile("SaveGameScreenshot.jpg") || getFile("SaveGameScreenshot.jpeg") || getFile("SaveGameScreenshot.png");
    const shotWrap = $("overview-shot");
    if (shot) {
      if (state.screenshotUrl) URL.revokeObjectURL(state.screenshotUrl);
      state.screenshotUrl = URL.createObjectURL(new Blob([shot]));
      $("overview-img").src = state.screenshotUrl;
      shotWrap.hidden = false;
    } else {
      shotWrap.hidden = true;
    }

    populatePlayerFileSelect();

    if (meta) {
      $("f-version").value = meta.gameVersion || "";
      $("f-saveid").value = meta.saveId || "";
      $("f-world").value = (meta.worldName || "").trimEnd();
      $("f-area").value = meta.areaName || "";
      $("f-level").value = meta.levelName || "";
      $("f-player").value = meta.playerKey || "";
    }

    const vitals = state.hostRaw ? P.parsePlayerVitals(state.hostRaw) : { ok: false };
    const missing = $("vitals-missing");
    const body = $("vitals-body");
    if (!vitals.ok) {
      missing.hidden = false;
      body.hidden = true;
    } else {
      missing.hidden = true;
      body.hidden = false;
      $("v-health").value =
        vitals.health != null ? Math.round(vitals.health * 10) / 10 : "";
      $("v-hunger").value =
        vitals.hunger != null ? Math.round(vitals.hunger * 100) / 100 : "";
      $("v-thirst").value =
        vitals.thirst != null ? Math.round(vitals.thirst * 100) / 100 : "";
    }

    const molars = P.parseMolars(state.hostRaw, state.worldRaw);
    const molMissing = $("molars-missing");
    const molBody = $("molars-body");
    if (!molars.ok) {
      molMissing.hidden = false;
      molBody.hidden = true;
    } else {
      molMissing.hidden = true;
      molBody.hidden = false;
      $("v-milk").disabled = !molars._personal;
      $("v-golden").disabled = !molars._party;
      $("v-science").disabled = !molars._science;
      $("v-milk").value = molars.milkMolars != null ? molars.milkMolars : "";
      $("v-golden").value = molars.goldenMolars != null ? molars.goldenMolars : "";
      $("v-science").value = molars.rawScience != null ? molars.rawScience : "";

      $("upgrade-grid").innerHTML = (molars.upgrades || [])
        .map(
          (e) =>
            "<label>" +
            escapeHtml(e.name) +
            "<input type=\"number\" min=\"0\" max=\"20\" step=\"1\" data-upgrade=\"" +
            escapeHtml(e.name) +
            "\" value=\"" +
            e.level +
            "\" /></label>"
        )
        .join("") || "<p class=\"hint\">No personal upgrade tiers parsed.</p>";

      $("stack-upgrade-grid").innerHTML = (molars.stackUpgrades || [])
        .map(
          (e) =>
            "<label>" +
            escapeHtml(e.name) +
            "<input type=\"number\" min=\"0\" max=\"99\" step=\"1\" data-stack-upgrade=\"" +
            escapeHtml(e.name) +
            "\" value=\"" +
            e.level +
            "\" /></label>"
        )
        .join("") || "<p class=\"hint\">No stack upgrades found.</p>";
    }

    refreshInventoryUi();
    refreshCatalog();

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

    $("cheat-table").querySelector("tbody").innerHTML = D.CONSOLE_HINTS.map(
      (c) =>
        "<tr><td><code>" +
        escapeHtml(c.cmd) +
        "</code></td><td>" +
        escapeHtml(c.desc) +
        "</td></tr>"
    ).join("");

    refreshChangeSummary();
  }

  function applyVitals() {
    if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
    const result = P.writePlayerVitals(state.hostRaw, {
      health: $("v-health").value,
      hunger: $("v-hunger").value,
      thirst: $("v-thirst").value,
      third: $("v-thirst").value,
    });
    commitHostRaw(result.bytes);
    return result.values;
  }

  function collectUpgradeInputs() {
    const upgrades = {};
    document.querySelectorAll("#upgrade-grid input[data-upgrade]").forEach((el) => {
      upgrades[el.getAttribute("data-upgrade")] = el.value;
    });
    return upgrades;
  }

  function collectStackUpgradeInputs() {
    const stackUpgrades = {};
    document
      .querySelectorAll("#stack-upgrade-grid input[data-stack-upgrade]")
      .forEach((el) => {
        stackUpgrades[el.getAttribute("data-stack-upgrade")] = el.value;
      });
    return stackUpgrades;
  }

  function applyMolars() {
    if (!state.hostRaw && !state.worldRaw) {
      throw new Error("HostPlayer / World not decompressed.");
    }
    const result = P.writeMolars(state.hostRaw, state.worldRaw, {
      milkMolars: $("v-milk").disabled ? "" : $("v-milk").value,
      goldenMolars: $("v-golden").disabled ? "" : $("v-golden").value,
      rawScience: $("v-science").disabled ? "" : $("v-science").value,
      upgrades: collectUpgradeInputs(),
      stackUpgrades: collectStackUpgradeInputs(),
    });
    if (result.hostBytes) {
      state.hostRaw = result.hostBytes;
      syncPlayerCopies(C.compressCsav(state.hostRaw));
    }
    if (result.worldBytes) {
      state.worldRaw = result.worldBytes;
      setFile("World.csav", C.compressCsav(state.worldRaw));
    }
    setDirty(true);
    refreshAll();
    return result.values;
  }

  async function runOodleDryRun() {
    const lines = [];
    let ok = 0;
    let fail = 0;
    for (const [name, packed] of state.files.entries()) {
      if (!C.isCsavName(name)) continue;
      try {
        const raw = await C.decompressCsav(packed, oozDecompress);
        const recompressed = C.compressCsav(raw);
        const round = await C.decompressCsav(recompressed, oozDecompress);
        if (raw.length !== round.length) {
          fail++;
          lines.push(name + ": FAIL length " + raw.length + " → " + round.length);
          continue;
        }
        let same = true;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] !== round[i]) {
            same = false;
            break;
          }
        }
        if (!same) {
          fail++;
          lines.push(name + ": FAIL byte mismatch after round-trip");
        } else {
          ok++;
          lines.push(
            name +
              ": OK raw " +
              S.formatBytes(raw.length) +
              " → packed " +
              S.formatBytes(recompressed.length)
          );
        }
      } catch (err) {
        fail++;
        lines.push(name + ": ERROR " + (err.message || err));
      }
    }
    $("dry-run-out").textContent =
      "Oodle dry-run: " + ok + " ok, " + fail + " fail\n" + lines.join("\n");
  }

  async function downloadZip(isBackup) {
    if (!state.files.size) return;
    if (!isBackup && !confirmWrite("Save ZIP")) return;
    const blob = await S.buildSlotZip(
      state.slotName,
      [...state.files.entries()].map(([name, bytes]) => ({ name, bytes }))
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      (isBackup ? "backup-" : "edited-") +
      String(state.slotName || "grounded2").replace(/[^\w.-]+/g, "_") +
      ".zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setStatus((isBackup ? "Backup" : "Edited") + " ZIP downloaded.");
  }

  async function installToFolder() {
    if (!state.files.size) return;
    if (!confirmWrite("Install")) return;
    if (!window.showDirectoryPicker) {
      alert("Install needs the File System Access API (Chrome / Edge).");
      return;
    }
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    for (const [name, bytes] of state.files.entries()) {
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();
    }
    setStatus("Installed " + state.files.size + " files into “" + dir.name + "”.");
  }

  function applyHeader() {
    const hdr = getFile("SaveGameHeaderData.savheader");
    if (!hdr) throw new Error("No SaveGameHeaderData.savheader in slot.");
    const r = H.rewriteWorldName(hdr, $("f-world").value);
    setFile("SaveGameHeaderData.savheader", r.bytes);
    setDirty(true);
    refreshAll();
    setStatus("World name set to “" + r.value + "”.");
  }

  function bindUi() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
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
    $("slot-select").addEventListener("change", async () => {
      try {
        await loadSlot($("slot-select").value);
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("player-edit-mode").addEventListener("change", () => refreshAll());
    $("player-file-select").addEventListener("change", async () => {
      try {
        const mode = $("player-edit-mode").value;
        const selected = $("player-file-select").value;
        const target = mode === "solo" ? selected : "HostPlayer.csav";
        const bytes = getFile(target) || getFile("HostPlayer.csav");
        if (bytes) {
          state.hostRaw = await C.decompressCsav(bytes, oozDecompress);
          refreshAll();
        }
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-backup").addEventListener("click", () => downloadZip(true));
    $("btn-save").addEventListener("click", () => downloadZip(false));
    $("btn-install").addEventListener("click", async () => {
      try {
        await installToFolder();
      } catch (err) {
        if (err && err.name === "AbortError") return;
        alert(err.message || String(err));
      }
    });

    $("btn-meta-apply").addEventListener("click", () => {
      try {
        applyHeader();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-meta-refresh").addEventListener("click", () => refreshAll());

    $("btn-vitals-refresh").addEventListener("click", () => refreshAll());
    $("btn-vitals-apply").addEventListener("click", () => {
      try {
        const v = applyVitals();
        setStatus("Applied vitals: " + JSON.stringify(v));
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-vitals-fill").addEventListener("click", () => {
      $("v-health").value = "100";
      $("v-hunger").value = "5";
      $("v-thirst").value = "5";
      $("btn-vitals-apply").click();
    });

    $("btn-molars-refresh").addEventListener("click", () => refreshAll());
    $("btn-molars-apply").addEventListener("click", () => {
      try {
        const v = applyMolars();
        setStatus("Applied molars/science: " + JSON.stringify(v));
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-molars-add").addEventListener("click", () => {
      if (!$("v-milk").disabled) {
        $("v-milk").value = String(
          Math.min(100000, (Number($("v-milk").value) || 0) + 50)
        );
      }
      if (!$("v-golden").disabled) {
        $("v-golden").value = String(
          Math.min(100000, (Number($("v-golden").value) || 0) + 50)
        );
      }
      if (!$("v-science").disabled) {
        $("v-science").value = String(
          Math.min(5000000, (Number($("v-science").value) || 0) + 1000)
        );
      }
      $("btn-molars-apply").click();
    });
    $("btn-giant-stacks").addEventListener("click", () => {
      document
        .querySelectorAll("#stack-upgrade-grid input[data-stack-upgrade]")
        .forEach((el) => {
          el.value = String(P.GIANT_STACK_TIER);
        });
      $("btn-molars-apply").click();
    });

    $("btn-inv-refresh").addEventListener("click", () => refreshInventoryUi());
    $("btn-inv-add").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("Load a save first.");
        const name = $("inv-add-name").value.trim();
        const qty = Number($("inv-add-qty").value) || 1;
        if (!name) throw new Error("Enter an item id.");
        const r = Inv.addInventoryItem(state.hostRaw, name, qty);
        commitHostRaw(r.bytes);
        setStatus(
          r.mode === "stack"
            ? "Stacked " + name + " → " + r.stack
            : "Added " + name + " × " + qty
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("catalog-filter").addEventListener("input", () => refreshCatalog());

    $("btn-dry-run").addEventListener("click", () => {
      runOodleDryRun().catch((err) => alert(err.message || String(err)));
    });
    $("btn-check-game").addEventListener("click", () => {
      alert(
        "The browser cannot see running processes.\n\n" +
          "In PowerShell:\n" +
          "Get-Process Augusta*,Grounded*,Maine* -ErrorAction SilentlyContinue | Format-Table Name,Id -AutoSize\n\n" +
          "Close the Grounded 2 / Augusta shipping exe before Install."
      );
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
      window.GGSaveFolders.wireEditor("grounded2", {
        setStatus,
        async onDirectory(handle) {
          try {
            await loadFromDirectoryHandle(handle);
          } catch (err) {
            setStatus(err.message || String(err));
            alert(err.message || String(err));
          }
        },
      });
    }
  }

  bindUi();
  setStatus("Ready — Oodle/ooz loaded. Pick a Grounded 2 slot.");
})();
