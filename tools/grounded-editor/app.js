import { decompress as oozDecompress } from "./vendor/index.js";

(() => {
  "use strict";

  const C = window.GroundedCsav;
  const H = window.GroundedHeader;
  const P = window.GroundedPlayer;
  const S = window.GroundedSave;
  const G = window.GroundedGear;
  const Inv = window.GroundedInventory;
  const Stor = window.GroundedStorage;
  const Perks = window.GroundedPerks;
  const Tech = window.GroundedTech;
  const Progress = window.GroundedProgress;
  const Presets = window.GroundedPresets;
  const Pos = window.GroundedPosition;
  const Cal = window.GroundedCalendar;
  const Haul = window.GroundedHauling;
  const D = window.GroundedData;
  const $ = (id) => document.getElementById(id);

  const PANELS = [
    "overview",
    "meta",
    "vitals",
    "gear",
    "mutations",
    "tech",
    "progress",
    "travel",
    "inventory",
    "chests",
    "features",
    "cheats",
  ];

  const state = {
    slotName: "GroundedSave",
    files: new Map(), // name -> Uint8Array
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
      "Close Grounded (Maine-Win64-Shipping) first so the game cannot overwrite your edits.",
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

  function fileList() {
    return [...state.files.entries()].map(([name, bytes]) => ({ name, bytes }));
  }

  function getFile(name) {
    for (const [n, bytes] of state.files.entries()) {
      if (n.toLowerCase() === name.toLowerCase()) return bytes;
    }
    return null;
  }

  function setFile(name, bytes) {
    // preserve original casing if present
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

  async function loadEditTargetPlayer() {
    const mode = ($("player-edit-mode") && $("player-edit-mode").value) || "mirror";
    const selected =
      ($("player-file-select") && $("player-file-select").value) || "HostPlayer.csav";
    const target =
      mode === "solo" ? selected : "HostPlayer.csav";
    const bytes = getFile(target) || getFile("HostPlayer.csav");
    if (!bytes) {
      state.hostRaw = null;
      return;
    }
    state.hostRaw = await C.decompressCsav(bytes, oozDecompress);
  }

  function commitSelectedPlayerRaw(bytes) {
    const packed = C.compressCsav(bytes);
    state.hostRaw = bytes;
    syncPlayerCopies(packed);
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

  async function loadSlot(slotKey) {
    const files = state.slots.get(slotKey);
    if (!files || !files.length) throw new Error("Empty slot.");
    state.slotName = slotKey === "(loose)" ? "GroundedSave" : slotKey;
    setStatus("Reading slot files…");
    const materialized = await S.materializeSlot(files);
    // keep lazy refs replaced with bytes in the slot map for later switches
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

  async function loadFromEntries(entries) {
    if (!entries.length) throw new Error("No Grounded save files found.");
    await loadFromSlotMap(S.groupEntriesBySlot(entries));
  }

  async function loadFromFileList(fileList) {
    if (!fileList || !fileList.length) throw new Error("No files selected.");
    setStatus("Indexing save files…");
    const slotMap = await S.indexFileList(fileList);
    if (!slotMap.size) {
      throw new Error(
        "No Grounded save files found.\n\nExpected HostPlayer.csav, World.csav, or SaveGameHeaderData.savheader inside a slot folder."
      );
    }
    const slotCount = [...slotMap.keys()].filter((k) => k !== "(loose)").length;
    if (slotCount > 1) {
      setStatus("Found " + slotCount + " slots — loading best match…");
    }
    await loadFromSlotMap(slotMap);
  }

  async function loadFromDirectoryHandle(handle) {
    setStatus("Scanning “" + handle.name + "”…");
    const collected = await S.collectSlotFilesFromDirectory(handle, 3);
    if (!collected.length) {
      throw new Error(
        "No Grounded save files in “" +
          handle.name +
          "”.\n\nPaste %USERPROFILE%\\Saved Games\\Grounded and pick that folder, or open one (ID-…) slot folder."
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
    const slotCount = [...slotMap.keys()].filter((k) => k !== "(loose)").length;
    if (slotCount > 1) {
      setStatus("Found " + slotCount + " slots — loading best match…");
    }
    await loadFromSlotMap(slotMap);
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

    const shot =
      getFile("SaveGameScreenshot.jpg") ||
      getFile("SaveGameScreenshot.jpeg") ||
      getFile("SaveGameScreenshot.png");
    if (state.screenshotUrl) URL.revokeObjectURL(state.screenshotUrl);
    if (shot) {
      const blob = new Blob([shot], { type: "image/jpeg" });
      state.screenshotUrl = URL.createObjectURL(blob);
      $("overview-img").src = state.screenshotUrl;
      $("overview-shot").hidden = false;
    } else {
      $("overview-shot").hidden = true;
    }

    $("overview-files").innerHTML = fileList()
      .map((f) => {
        let note = S.formatBytes(f.bytes.length);
        try {
          if (/\.csav$/i.test(f.name)) {
            const h = C.unwrapCsavHeader(f.bytes);
            note +=
              " · raw " +
              S.formatBytes(h.uncompressedSize) +
              " · cmp " +
              S.formatBytes(h.compressedSize);
          }
        } catch {
          /* ignore */
        }
        return (
          "<div class=\"file-row\"><code>" +
          escapeHtml(f.name) +
          "</code><span class=\"tone-muted\">" +
          escapeHtml(note) +
          "</span></div>"
        );
      })
      .join("");

    if (meta) {
      $("f-version").value = meta.gameVersion || "";
      $("f-saveid").value = meta.saveId || "";
      $("f-world").value = meta.worldName || "";
      $("f-area").value = meta.areaName || "";
      $("f-level").value = meta.levelName || "";
      $("f-player").value = meta.playerKey || "";
      const cap = meta._worldNameHit ? meta._worldNameHit.capacity : "?";
      $("meta-hint").textContent =
        "In-place rename max " + cap + " characters for this header.";
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
    const molarsMissing = $("molars-missing");
    const molarsBody = $("molars-body");
    if (!molars.ok) {
      molarsMissing.hidden = false;
      molarsBody.hidden = true;
    } else {
      molarsMissing.hidden = true;
      molarsBody.hidden = false;
      $("v-milk").value = molars.milkMolars != null ? molars.milkMolars : "";
      $("v-golden").value = molars.goldenMolars != null ? molars.goldenMolars : "";
      $("v-science").value = molars.rawScience != null ? molars.rawScience : "";
      $("v-milk").disabled = molars.milkMolars == null;
      $("v-golden").disabled = molars.goldenMolars == null;
      $("v-science").disabled = molars.rawScience == null;
      const grid = $("upgrade-grid");
      const known = ["Health", "Stamina", "Thirst", "Healing", "Perks"];
      const byName = new Map(molars.upgrades.map((u) => [u.name, u.level]));
      const names = [
        ...known.filter((n) => byName.has(n)),
        ...molars.upgrades.map((u) => u.name).filter((n) => !known.includes(n)),
      ];
      if (!names.length) {
        grid.innerHTML =
          '<p class="hint">No personal upgrade tiers found on HostPlayer.</p>';
      } else {
        grid.innerHTML = names
          .map(
            (name) =>
              "<label>" +
              escapeHtml(name) +
              ' <input data-upgrade="' +
              escapeHtml(name) +
              '" type="number" min="0" max="20" step="1" value="' +
              (byName.get(name) ?? 0) +
              '" /></label>'
          )
          .join("");
      }

      const stackGrid = $("stack-upgrade-grid");
      const stackByName = new Map(
        (molars.stackUpgrades || []).map((u) => [u.name, u.level])
      );
      const stackNames = [
        ...(P.STACK_UPGRADE_NAMES || []).filter((n) => stackByName.has(n)),
        ...(molars.stackUpgrades || [])
          .map((u) => u.name)
          .filter((n) => !(P.STACK_UPGRADE_NAMES || []).includes(n)),
      ];
      $("btn-giant-stacks").disabled = !stackNames.length;
      if (!stackNames.length) {
        stackGrid.innerHTML =
          '<p class="hint">No StackSize.* upgrades found in World.csav.</p>';
      } else {
        stackGrid.innerHTML = stackNames
          .map((name) => {
            const label = name.replace(/^StackSize\./, "");
            return (
              "<label>" +
              escapeHtml(label) +
              ' <input data-stack-upgrade="' +
              escapeHtml(name) +
              '" type="number" min="0" max="' +
              (P.STACK_LEVEL_MAX || 9999) +
              '" step="1" value="' +
              (stackByName.get(name) ?? 0) +
              '" /></label>'
            );
          })
          .join("");
      }
    }

    const items = [];
    if (state.hostRaw) items.push(...P.listItemPaths(state.hostRaw));
    if (state.worldRaw) items.push(...P.listItemPaths(state.worldRaw));
    const merged = new Map();
    for (const it of items) merged.set(it.id, (merged.get(it.id) || 0) + it.count);
    const sorted = [...merged.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    state.catalogItems = sorted;
    $("inv-hint").textContent =
      sorted.length + " unique item/BP paths (HostPlayer + World).";
    $("inv-table").querySelector("tbody").innerHTML = sorted
      .slice(0, 250)
      .map(
        (it) =>
          "<tr><td><code>" +
          escapeHtml(it.id) +
          "</code></td><td>" +
          it.count +
          "</td></tr>"
      )
      .join("");

    refreshGearTable();
    refreshInventoryEditor();
    refreshChestsEditor();
    refreshMutationsEditor();
    refreshTechEditor();
    refreshProgressEditor();
    refreshTravelEditor();
    refreshHauling();
    refreshCatalog();
    refreshPlayerFileSelect();

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
  }

  async function downloadZip(isBackup) {
    const blob = await S.buildSlotZip(state.slotName, fileList());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      (isBackup ? "backup-" : "edited-") +
      state.slotName.replace(/[<>:"/\\|?*]/g, "_") +
      ".zip";
    a.click();
    URL.revokeObjectURL(url);
    setDirty(false);
    setStatus((isBackup ? "Backup" : "Save") + " ZIP downloaded.");
  }

  async function installToFolder() {
    if (typeof window.showDirectoryPicker !== "function") {
      alert("Install to Folder needs Chrome/Edge. Use Save ZIP instead.");
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
          state.files.size +
          " files into the folder you picked as slot contents?\n\nClose Grounded first."
      )
    ) {
      return;
    }
    for (const [name, bytes] of state.files.entries()) {
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
    }
    setDirty(false);
    setStatus("Installed " + state.files.size + " files into selected folder.");
  }

  function applyHeader() {
    const header = getFile("SaveGameHeaderData.savheader");
    if (!header) throw new Error("No SaveGameHeaderData.savheader in slot.");
    const r = H.rewriteWorldName(header, $("f-world").value);
    setFile("SaveGameHeaderData.savheader", r.bytes);
    setDirty(true);
    refreshAll();
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

  function applyOpPreset(ngPlus) {
    if (!Presets) throw new Error("Presets module missing.");
    if (!state.hostRaw && !state.worldRaw) {
      throw new Error("Load a save first.");
    }
    const r = Presets.applyOpPreset(state.hostRaw, state.worldRaw, {
      ngPlus: !!ngPlus,
    });
    if (r.hostBytes) {
      state.hostRaw = r.hostBytes;
      syncPlayerCopies(C.compressCsav(state.hostRaw));
    }
    if (r.worldBytes) {
      state.worldRaw = r.worldBytes;
      setFile("World.csav", C.compressCsav(state.worldRaw));
    }
    setDirty(true);
    refreshAll();
    return r;
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
          lines.push(
            name +
              ": FAIL length " +
              raw.length +
              " → " +
              round.length
          );
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
          lines.push(name + ": FAIL byte mismatch after recompress");
        } else {
          ok++;
          lines.push(
            name +
              ": OK raw " +
              S.formatBytes(raw.length) +
              " · packed " +
              S.formatBytes(packed.length) +
              " → rewrite " +
              S.formatBytes(recompressed.length)
          );
        }
      } catch (err) {
        fail++;
        lines.push(name + ": ERROR " + (err.message || err));
      }
    }
    return { ok, fail, lines };
  }

  function snapshotSlotStats(hostRaw, worldRaw) {
    const snap = { gear: 0, mutations: 0, purchases: 0, buildings: 0, knowledge: 0 };
    try {
      if (hostRaw && G) snap.gear = G.parseGear(hostRaw).items.length;
    } catch (_) {}
    try {
      if (hostRaw && Perks) {
        snap.mutations = Perks.parsePerkComponent(hostRaw).entries.filter(
          (e) => e.phase >= 0
        ).length;
      }
    } catch (_) {}
    try {
      if (worldRaw && Progress) {
        const p = Progress.parsePurchases(worldRaw);
        if (p.ok) snap.purchases = p.entries.length;
        const b = Progress.parseBuildings(worldRaw);
        if (b.ok) snap.buildings = b.entries.length;
      }
    } catch (_) {}
    try {
      if (worldRaw && Tech) {
        const t = Tech.parsePartyTech(worldRaw);
        if (t && t.ok && t.knowledge) snap.knowledge = t.knowledge.length;
      }
    } catch (_) {}
    try {
      if (hostRaw && P) {
        snap.molars = P.parseMolars(hostRaw, worldRaw);
      }
    } catch (_) {}
    return snap;
  }

  function refreshInventoryEditor() {
    const hint = $("inv-hint");
    const tbody = $("inv-edit-table").querySelector("tbody");
    const list = $("inv-item-names");
    if (!state.hostRaw || !Inv) {
      hint.textContent = "HostPlayer not loaded.";
      tbody.innerHTML = "";
      list.innerHTML = "";
      return;
    }
    const inv = Inv.parseInventory(state.hostRaw);
    if (!inv.ok) {
      hint.textContent = "Could not parse inventory records.";
      tbody.innerHTML = "";
      return;
    }
    hint.textContent =
      inv.items.length +
      " bag items (header count " +
      inv.count +
      "). Add clones a template if the id is new.";
    tbody.innerHTML = inv.items
      .map((it, idx) => {
        return (
          "<tr>" +
          "<td><code>" +
          escapeHtml(it.name) +
          "</code></td>" +
          "<td><input data-inv-stack=\"" +
          idx +
          "\" type=\"number\" min=\"1\" max=\"9999\" value=\"" +
          it.stack +
          "\" style=\"width:5rem\" /></td>" +
          "<td>" +
          escapeHtml(it.enhancement === "None" ? "—" : it.enhancement) +
          "</td>" +
          "<td>" +
          "<button type=\"button\" class=\"btn btn-inv-apply-stack\" data-idx=\"" +
          idx +
          "\">Set</button> " +
          "<button type=\"button\" class=\"btn btn-inv-remove\" data-idx=\"" +
          idx +
          "\">Remove</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    const names = new Set(inv.items.map((x) => x.name));
    if (state.hostRaw) {
      for (const it of P.listItemPaths(state.hostRaw)) names.add(it.id);
    }
    if (state.worldRaw) {
      for (const it of P.listItemPaths(state.worldRaw)) names.add(it.id);
    }
    for (const pref of Inv.TEMPLATE_PREFS || []) names.add(pref);
    list.innerHTML = [...names]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 400)
      .map((n) => "<option value=\"" + escapeHtml(n) + "\"></option>")
      .join("");
  }

  function refreshGearTable() {
    const missing = $("gear-missing");
    const tbody = $("gear-table").querySelector("tbody");
    refreshEquipDoll();
    if (!state.hostRaw || !G) {
      missing.hidden = false;
      tbody.innerHTML = "";
      return;
    }
    const gear = G.parseGear(state.hostRaw);
    if (!gear.ok) {
      missing.hidden = false;
      tbody.innerHTML = "";
      return;
    }
    missing.hidden = true;
    tbody.innerHTML = gear.items
      .map((it, idx) => {
        const armorPath =
          it.kind === "armor" ? escapeHtml(it.mid || "—") : "—";
        const weaponPath =
          it.kind === "armor" ? "—" : escapeHtml(it.enhancement || "—");
        return (
          "<tr data-gear-idx=\"" +
          idx +
          "\">" +
          "<td><code>" +
          escapeHtml(it.name) +
          "</code></td>" +
          "<td>" +
          escapeHtml(it.region) +
          "</td>" +
          "<td>" +
          escapeHtml(it.kind) +
          "</td>" +
          "<td>" +
          it.level +
          "</td>" +
          "<td>" +
          weaponPath +
          "</td>" +
          "<td>" +
          armorPath +
          "</td>" +
          "<td>" +
          (Math.round(it.durability * 10) / 10) +
          "</td>" +
          "<td><button type=\"button\" class=\"btn btn-gear-max\" data-idx=\"" +
          idx +
          "\">Max</button></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function refreshEquipDoll() {
    const hint = $("doll-hint");
    const slotIds = ["head", "chest", "legs", "mainhand", "offhand", "trinket"];
    if (!state.hostRaw || !G || typeof G.parseEquipmentDoll !== "function") {
      slotIds.forEach((id) => {
        const el = $("doll-" + id);
        if (el) el.innerHTML = "—";
        const wrap = el && el.closest(".equip-slot");
        if (wrap) wrap.classList.add("is-empty");
      });
      if (hint) hint.textContent = "HostPlayer not loaded.";
      return;
    }
    const doll = G.parseEquipmentDoll(state.hostRaw);
    let filled = 0;
    for (const id of slotIds) {
      const el = $("doll-" + id);
      const wrap = el && el.closest(".equip-slot");
      const it = doll.slots[id];
      if (!el) continue;
      if (!it) {
        el.innerHTML = "Empty";
        if (wrap) {
          wrap.classList.add("is-empty");
          const act = wrap.querySelector(".equip-slot__actions");
          if (act) act.remove();
        }
        continue;
      }
      filled++;
      if (wrap) wrap.classList.remove("is-empty");
      const path =
        it.kind === "armor"
          ? it.mid && it.mid !== "None"
            ? it.mid
            : "—"
          : it.enhancement && it.enhancement !== "None"
            ? it.enhancement
            : "—";
      el.innerHTML =
        "<code>" +
        escapeHtml(it.name) +
        "</code>" +
        "<div class=\"equip-slot__meta\">Lv " +
        it.level +
        " · " +
        escapeHtml(path) +
        "</div>";
      let act = wrap.querySelector(".equip-slot__actions");
      if (!act) {
        act = document.createElement("div");
        act.className = "equip-slot__actions";
        wrap.appendChild(act);
      }
      const canMax = it.kind === "weapon" || it.kind === "armor" || it.kind === "shield";
      act.innerHTML = canMax
        ? "<button type=\"button\" class=\"btn btn-doll-max\" data-slot=\"" +
          id +
          "\">Max</button>"
        : "";
    }
    if (hint) {
      hint.textContent = doll.ok
        ? filled + " equipped slot(s) from EquipmentComponent."
        : "No equipped gear found.";
    }
  }

  function commitHostRaw(bytes) {
    commitSelectedPlayerRaw(bytes);
  }

  function commitWorldRaw(bytes) {
    state.worldRaw = bytes;
    setFile("World.csav", C.compressCsav(state.worldRaw));
    setDirty(true);
    refreshAll();
  }

  function refreshChestsEditor() {
    const hint = $("chest-hint");
    const sel = $("chest-select");
    const tbody = $("chest-edit-table").querySelector("tbody");
    const list = $("chest-item-names");
    if (!state.worldRaw || !Stor) {
      hint.textContent = "World.csav not loaded.";
      sel.innerHTML = "";
      tbody.innerHTML = "";
      list.innerHTML = "";
      return;
    }
    const listed = Stor.listStorages(state.worldRaw);
    if (!listed.ok) {
      hint.textContent = "No storage inventories found in World.csav.";
      sel.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }

    const filter = (($("chest-filter") && $("chest-filter").value) || "")
      .trim()
      .toLowerCase();
    const filtered = listed.storages
      .map((st, i) => ({ st, i }))
      .filter(({ st }) => {
        if (!filter) return true;
        const hay = (st.label + " " + (st.building || "")).toLowerCase();
        return hay.includes(filter);
      });

    const prev = sel.value;
    sel.innerHTML = filtered
      .map(({ st, i }) => {
        const tag = st.building ? " · " + st.building : "";
        const label =
          st.label + tag + " (" + st.itemCount + " item" + (st.itemCount === 1 ? "" : "s") + ")";
        return (
          "<option value=\"" +
          i +
          "\">" +
          escapeHtml(label) +
          "</option>"
        );
      })
      .join("");
    if (prev !== "" && filtered.some(({ i }) => String(i) === prev)) {
      sel.value = prev;
    }
    const idx = Number(sel.value || (filtered[0] && filtered[0].i) || 0);
    const st = listed.storages[idx];
    if (!st) {
      hint.textContent = filter
        ? "No chests match filter."
        : "Select a storage.";
      tbody.innerHTML = "";
      return;
    }
    hint.textContent =
      st.label +
      (st.building ? " [" + st.building + "]" : "") +
      " — " +
      st.items.length +
      " item(s)" +
      (st.editableCount ? ", header count " + st.count : ", count header unknown") +
      (filter ? " · filter “" + filter + "” (" + filtered.length + ")" : "") +
      ".";
    tbody.innerHTML = st.items
      .map((it, i) => {
        return (
          "<tr>" +
          "<td><code>" +
          escapeHtml(it.name) +
          "</code></td>" +
          "<td><input data-chest-stack=\"" +
          i +
          "\" type=\"number\" min=\"1\" max=\"9999\" value=\"" +
          it.stack +
          "\" style=\"width:5rem\" /></td>" +
          "<td>" +
          escapeHtml(it.enhancement === "None" ? "—" : it.enhancement) +
          "</td>" +
          "<td>" +
          "<button type=\"button\" class=\"btn btn-chest-apply-stack\" data-idx=\"" +
          i +
          "\">Set</button> " +
          "<button type=\"button\" class=\"btn btn-chest-remove\" data-idx=\"" +
          i +
          "\">Remove</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    const names = new Set(st.items.map((x) => x.name));
    for (const s of listed.storages) {
      for (const it of s.items) names.add(it.name);
    }
    if (Inv && Inv.TEMPLATE_PREFS) {
      for (const pref of Inv.TEMPLATE_PREFS) names.add(pref);
    }
    list.innerHTML = [...names]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 400)
      .map((n) => "<option value=\"" + escapeHtml(n) + "\"></option>")
      .join("");
  }

  function refreshProgressEditor() {
    const hint = $("prog-hint");
    if (!hint) return;
    const achBody = $("prog-ach-table") && $("prog-ach-table").querySelector("tbody");
    if (!state.worldRaw && !state.hostRaw) {
      hint.textContent = "Load a save first.";
      return;
    }
    let purchaseN = "—";
    let buildingN = "—";
    let achN = "—";
    if (state.worldRaw && Progress) {
      try {
        const p = Progress.parsePurchases(state.worldRaw);
        purchaseN = p.ok ? String(p.entries.length) : "parse fail";
      } catch (_) {
        purchaseN = "err";
      }
      try {
        const b = Progress.parseBuildings(state.worldRaw);
        buildingN = b.ok ? String(b.entries.length) : "parse fail";
      } catch (_) {
        buildingN = "err";
      }
    }
    if (state.hostRaw && Progress) {
      try {
        const a = Progress.parseAchievements(state.hostRaw);
        achN = a.ok ? a.entries.length + " (" + a.entries.filter((e) => e.unlocked).length + " flagged)" : "parse fail";
        if (achBody && a.ok) {
          achBody.innerHTML = a.entries
            .map(
              (e) =>
                "<tr><td><code>" +
                escapeHtml(e.id) +
                "</code></td><td>" +
                e.a +
                "," +
                e.b +
                "," +
                e.c +
                "," +
                e.d +
                "</td></tr>"
            )
            .join("");
        }
      } catch (_) {
        achN = "err";
      }
    }
    if ($("prog-purchase-count")) $("prog-purchase-count").textContent = purchaseN;
    if ($("prog-building-count")) $("prog-building-count").textContent = buildingN;
    if ($("prog-ach-count")) $("prog-ach-count").textContent = achN;
    hint.textContent =
      "Purchases " +
      purchaseN +
      " · Buildings " +
      buildingN +
      " · Achievements " +
      achN +
      ". Equipped mutation loadout is not a stable save field (unlock/phase only).";
  }

  function refreshMutationsEditor() {
    const hint = $("mut-hint");
    const tbody = $("mut-table").querySelector("tbody");
    const slotsEl = $("mut-slots");
    const slotsHint = $("mut-slots-hint");
    if (!state.hostRaw || !Perks) {
      hint.textContent = "HostPlayer not loaded.";
      tbody.innerHTML = "";
      return;
    }
    const parsed = Perks.parsePerkComponent(state.hostRaw);
    const slots = Perks.parsePerksUpgrade(state.hostRaw);
    if (slots) {
      slotsEl.value = String(slots.level);
      slotsHint.textContent = "→ " + (2 + slots.level) + " equip slots";
    } else {
      slotsEl.value = "0";
      slotsHint.textContent = "Perks upgrade not found";
    }
    if (!parsed.ok) {
      hint.textContent = "Could not parse PerkComponent.";
      tbody.innerHTML = "";
      return;
    }
    const unlocked = parsed.entries.filter((e) => e.unlocked).length;
    hint.textContent =
      parsed.entries.length +
      " mutations · " +
      unlocked +
      " unlocked (phase ≥ 0). Equipped loadout is still chosen in-game.";
    tbody.innerHTML = parsed.entries
      .map((e, idx) => {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(e.display) +
          "</td>" +
          "<td><code>" +
          escapeHtml(e.id) +
          "</code></td>" +
          "<td><input data-mut-phase=\"" +
          idx +
          "\" type=\"number\" min=\"-1\" max=\"2\" value=\"" +
          e.phase +
          "\" style=\"width:4.5rem\" /></td>" +
          "<td>" +
          "<button type=\"button\" class=\"btn btn-mut-set\" data-idx=\"" +
          idx +
          "\">Set</button> " +
          "<button type=\"button\" class=\"btn btn-mut-max\" data-idx=\"" +
          idx +
          "\">Max</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function knowledgeKind(name) {
    if (/^Recipe/i.test(name)) return "recipe";
    if (/^TechChip/i.test(name)) return "tech chip";
    if (/^Bestiary/i.test(name)) return "bestiary";
    if (/^POI/i.test(name)) return "POI";
    if (/^AudioLog/i.test(name)) return "audio log";
    return "other";
  }

  function refreshTechEditor() {
    const hint = $("tech-hint");
    const treesHint = $("tech-trees-hint");
    const aBody = $("tech-analyzed-table").querySelector("tbody");
    const kBody = $("tech-know-table").querySelector("tbody");
    const list = $("tech-item-names");
    if (!state.worldRaw || !Tech) {
      hint.textContent = "World.csav not loaded.";
      aBody.innerHTML = "";
      kBody.innerHTML = "";
      return;
    }
    const parsed = Tech.parsePartyTech(state.worldRaw);
    if (!parsed.ok) {
      hint.textContent = "Could not parse PartyComponent tech lists.";
      aBody.innerHTML = "";
      kBody.innerHTML = "";
      return;
    }
    hint.textContent =
      parsed.analyzed.length +
      " analyzed · " +
      parsed.knowledge.length +
      " knowledge entries · " +
      parsed.techTrees.length +
      " tech-tree refs.";
    treesHint.textContent = parsed.techTrees.length
      ? parsed.techTrees.map((t) => t.name).join(", ")
      : "None found near PartyComponent.";
    aBody.innerHTML = parsed.analyzed
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (e) =>
          "<tr><td><code>" +
          escapeHtml(e.name) +
          "</code></td><td>" +
          e.a +
          "</td><td>" +
          e.b +
          "</td><td>" +
          e.c +
          "</td></tr>"
      )
      .join("");
    kBody.innerHTML = parsed.knowledge
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (e) =>
          "<tr><td><code>" +
          escapeHtml(e.name) +
          "</code></td><td>" +
          escapeHtml(knowledgeKind(e.name)) +
          "</td></tr>"
      )
      .join("");
    const names = new Set();
    for (const e of parsed.analyzed) names.add(e.name);
    for (const e of parsed.knowledge) names.add(e.name);
    for (const n of Tech.ANALYZE_STARTER || []) names.add(n);
    list.innerHTML = [...names]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 500)
      .map((n) => "<option value=\"" + escapeHtml(n) + "\"></option>")
      .join("");
  }

  function refreshTravelEditor() {
    const posHint = $("pos-hint");
    const calHint = $("cal-hint");
    const preset = $("pos-preset");
    if (Pos && preset && !preset.options.length) {
      preset.innerHTML =
        "<option value=\"\">Custom</option>" +
        Pos.PRESETS.map(
          (p) =>
            "<option value=\"" +
            escapeHtml(p.id) +
            "\">" +
            escapeHtml(p.label) +
            "</option>"
        ).join("");
    }
    if (!state.hostRaw || !Pos) {
      posHint.textContent = "HostPlayer not loaded.";
    } else {
      const pos = Pos.findPosition(state.hostRaw);
      if (!pos.ok) {
        posHint.textContent = "Position not found.";
      } else {
        $("pos-x").value = String(Math.round(pos.x * 100) / 100);
        $("pos-y").value = String(Math.round(pos.y * 100) / 100);
        $("pos-z").value = String(Math.round(pos.z * 100) / 100);
        posHint.textContent =
          "Transform at byte " + pos.off + " (scale marker " + pos.scaleAt + ").";
      }
    }
    if (!state.worldRaw || !Cal) {
      calHint.textContent = "World.csav not loaded.";
      return;
    }
    const cal = Cal.parseCalendar(state.worldRaw);
    if (!cal.ok) {
      calHint.textContent = "CalendarComponent not found.";
      return;
    }
    $("cal-day").value = String(Math.round(cal.day * 1000) / 1000);
    $("cal-hour").value = String(Math.round(cal.hourHint * 100) / 100);
    calHint.textContent =
      "Day float " +
      cal.day.toFixed(3) +
      " · hour hint " +
      cal.hourHint.toFixed(2) +
      " (fractional day × 24, best-effort).";
  }

  function refreshHauling() {
    const hint = $("haul-hint");
    const tbody = $("haul-table").querySelector("tbody");
    if (!hint || !tbody) return;
    if (!state.hostRaw || !Haul) {
      hint.textContent = "HostPlayer not loaded.";
      tbody.innerHTML = "";
      return;
    }
    const haul = Haul.parseHauling(state.hostRaw);
    if (!haul.ok) {
      hint.textContent = "HaulingComponent not found.";
      tbody.innerHTML = "";
      return;
    }
    hint.textContent =
      haul.items.length +
      " hauled item(s). Add/remove uses the bag inventory editor while empty.";
    tbody.innerHTML = haul.items.length
      ? haul.items
          .map(
            (it) =>
              "<tr><td><code>" +
              escapeHtml(it.name) +
              "</code></td><td>" +
              it.stack +
              "</td><td>" +
              escapeHtml(it.enhancement === "None" ? "—" : it.enhancement) +
              "</td></tr>"
          )
          .join("")
      : "<tr><td colspan=\"3\">Nothing hauled right now.</td></tr>";
  }

  function refreshCatalog() {
    const hint = $("catalog-hint");
    const tbody = $("catalog-table") && $("catalog-table").querySelector("tbody");
    if (!tbody) return;
    const q = (($("catalog-filter") && $("catalog-filter").value) || "")
      .trim()
      .toLowerCase();
    const items = (state.catalogItems || []).filter(
      (it) => !q || it.id.toLowerCase().includes(q)
    );
    if (hint) {
      hint.textContent =
        items.length +
        " shown" +
        (q ? " matching “" + q + "”" : "") +
        " of " +
        (state.catalogItems || []).length +
        ".";
    }
    tbody.innerHTML = items
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

  function refreshPlayerFileSelect() {
    const sel = $("player-file-select");
    const hint = $("player-file-hint");
    if (!sel) return;
    const prev = sel.value;
    const players = [...state.files.keys()].filter(
      (n) =>
        /^HostPlayer\.csav$/i.test(n) || /^Player_.+\.csav$/i.test(n)
    );
    sel.innerHTML = players
      .map((n) => "<option value=\"" + escapeHtml(n) + "\">" + escapeHtml(n) + "</option>")
      .join("");
    if (prev && players.some((n) => n === prev)) sel.value = prev;
    const mode = ($("player-edit-mode") && $("player-edit-mode").value) || "mirror";
    if (hint) {
      if (!players.length) {
        hint.textContent = "No HostPlayer / Player_*.csav in this slot.";
      } else if (mode === "solo") {
        hint.textContent =
          players.length +
          " player file(s). Solo mode: edits write only to “" +
          (sel.value || "HostPlayer.csav") +
          "”.";
      } else {
        hint.textContent =
          players.length +
          " player file(s). Mirror mode: HostPlayer edits copy to all Player_*.csav on write.";
      }
    }
  }

  function maxSingleGear(idx) {
    if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
    const gear = G.parseGear(state.hostRaw);
    const it = gear.items[idx];
    if (!it) throw new Error("Item not found.");
    const patch =
      it.kind === "armor"
        ? {
            level: G.MAX_SMITH_LEVEL,
            mid: "Bulky",
            durability: G.GOD_DURABILITY,
            fullDurabilityHead: true,
          }
        : {
            level: G.MAX_SMITH_LEVEL,
            enhancement: "Mighty",
            attackMult: G.ONE_SHOT_ATTACK_MULT,
            durability: G.GOD_DURABILITY,
            fullDurabilityHead: true,
          };
    const result = G.writeGearItem(state.hostRaw, idx, patch);
    commitHostRaw(result.bytes);
    return result.values;
  }

  function bindUi() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    $("slot-select").addEventListener("change", async () => {
      try {
        await loadSlot($("slot-select").value);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-meta-refresh").addEventListener("click", () => refreshAll());
    $("btn-meta-apply").addEventListener("click", () => {
      try {
        applyHeader();
        setStatus("Header applied. Save ZIP / Install to keep changes.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-vitals-refresh").addEventListener("click", () => refreshAll());
    $("btn-vitals-apply").addEventListener("click", () => {
      try {
        const values = applyVitals();
        setStatus("Vitals applied: " + JSON.stringify(values));
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-vitals-fill").addEventListener("click", () => {
      $("v-health").value = 200;
      $("v-hunger").value = 5;
      $("v-thirst").value = 5;
      $("btn-vitals-apply").click();
    });

    $("btn-molars-refresh").addEventListener("click", () => refreshAll());
    $("btn-molars-apply").addEventListener("click", () => {
      try {
        const values = applyMolars();
        setStatus("Molars/upgrades applied: " + JSON.stringify(values));
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-giant-stacks").addEventListener("click", () => {
      const target = P.STACK_LIMIT_TARGET || 999;
      const inputs = document.querySelectorAll(
        "#stack-upgrade-grid input[data-stack-upgrade]"
      );
      if (!inputs.length) {
        alert("No stack size upgrades found in this save.");
        return;
      }
      inputs.forEach((el) => {
        const name = el.getAttribute("data-stack-upgrade");
        const tier =
          typeof P.tierForStackLimit === "function"
            ? P.tierForStackLimit(name, target)
            : P.GIANT_STACK_TIER || 199;
        el.value = String(tier);
      });
      try {
        const values = applyMolars();
        setStatus(
          "Stack limit ~" + target + ": " + JSON.stringify(values)
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-molars-add").addEventListener("click", () => {
      if (!$("v-milk").disabled) {
        $("v-milk").value = Math.max(0, Number($("v-milk").value || 0) + 50);
      }
      if (!$("v-golden").disabled) {
        $("v-golden").value = Math.max(0, Number($("v-golden").value || 0) + 50);
      }
      if (!$("v-science").disabled) {
        $("v-science").value = Math.max(0, Number($("v-science").value || 0) + 1000);
      }
      $("btn-molars-apply").click();
    });

    $("btn-gear-refresh").addEventListener("click", () => refreshAll());
    $("btn-oneshot").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = G.applyOneShotWeapons(state.hostRaw);
        commitHostRaw(r.bytes);
        setStatus("One-shot weapons applied to " + r.changed + " item(s).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-godarmor").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = G.applyGodArmor(state.hostRaw);
        commitHostRaw(r.bytes);
        setStatus("God mode armor applied to " + r.changed + " item(s).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-sleekarmor") &&
      $("btn-sleekarmor").addEventListener("click", () => {
        try {
          if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
          const r = G.applySleekArmor(state.hostRaw);
          commitHostRaw(r.bytes);
          setStatus("Sleek armor applied to " + r.changed + " item(s) @ " + r.level + ".");
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-oneshot-ngp") &&
      $("btn-oneshot-ngp").addEventListener("click", () => {
        try {
          if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
          const r = G.applyOneShotWeapons(state.hostRaw, { ngPlus: true });
          commitHostRaw(r.bytes);
          setStatus(
            "One-shot NG+ weapons: " + r.changed + " item(s) @ Mighty " + r.level + "."
          );
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-sleek-ngp") &&
      $("btn-sleek-ngp").addEventListener("click", () => {
        try {
          if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
          const r = G.applySleekArmor(state.hostRaw, { ngPlus: true });
          commitHostRaw(r.bytes);
          setStatus(
            "Sleek NG+ armor: " + r.changed + " item(s) @ Sleek " + r.level + "."
          );
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("gear-table").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-gear-max");
      if (!btn) return;
      try {
        const values = maxSingleGear(Number(btn.getAttribute("data-idx")));
        setStatus("Maxed gear: " + JSON.stringify(values));
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("equip-doll").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-doll-max");
      if (!btn) return;
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const slot = btn.getAttribute("data-slot");
        const doll = G.parseEquipmentDoll(state.hostRaw);
        const it = doll.slots[slot];
        if (!it) throw new Error("Slot empty.");
        const idx = G.gearIndexForDollItem(state.hostRaw, it);
        if (idx < 0) throw new Error("That slot is not smithable here (trinket?).");
        const values = maxSingleGear(idx);
        setStatus("Maxed " + slot + ": " + JSON.stringify(values));
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-inv-refresh").addEventListener("click", () => refreshAll());
    $("btn-inv-add").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = Inv.addInventoryItem(
          state.hostRaw,
          $("inv-add-name").value,
          $("inv-add-qty").value
        );
        commitHostRaw(r.bytes);
        setStatus(
          (r.mode === "stack" ? "Stacked " : "Added ") +
            r.added +
            " ×" +
            r.stack +
            (r.template ? " (cloned " + r.template + ")" : "")
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("inv-edit-table").addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".btn-inv-remove");
      const stackBtn = e.target.closest(".btn-inv-apply-stack");
      try {
        if (removeBtn) {
          if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
          const idx = Number(removeBtn.getAttribute("data-idx"));
          const r = Inv.removeInventoryItem(state.hostRaw, idx);
          commitHostRaw(r.bytes);
          setStatus("Removed " + r.removed + " (count " + r.count + ").");
        } else if (stackBtn) {
          if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
          const idx = Number(stackBtn.getAttribute("data-idx"));
          const input = document.querySelector(
            '#inv-edit-table input[data-inv-stack="' + idx + '"]'
          );
          const r = Inv.setInventoryStack(
            state.hostRaw,
            idx,
            input ? input.value : 1
          );
          commitHostRaw(r.bytes);
          setStatus("Set " + r.name + " stack to " + r.stack + ".");
        }
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("chest-select").addEventListener("change", () => refreshChestsEditor());
    $("chest-filter") &&
      $("chest-filter").addEventListener("input", () => refreshChestsEditor());
    $("btn-chest-refresh").addEventListener("click", () => refreshAll());
    $("btn-mut-refresh").addEventListener("click", () => refreshAll());
    $("btn-tech-refresh").addEventListener("click", () => refreshAll());
    $("btn-prog-refresh") &&
      $("btn-prog-refresh").addEventListener("click", () => refreshAll());
    $("btn-prog-purchases") &&
      $("btn-prog-purchases").addEventListener("click", () => {
        try {
          if (!state.worldRaw) throw new Error("World.csav not decompressed.");
          const r = Progress.unlockPurchaseCatalog(state.worldRaw);
          commitWorldRaw(r.bytes);
          setStatus(
            "BURG.L purchases: +" + r.added + " (skipped " + r.skipped + ")."
          );
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-prog-buildings") &&
      $("btn-prog-buildings").addEventListener("click", () => {
        try {
          if (!state.worldRaw) throw new Error("World.csav not decompressed.");
          const r = Progress.unlockAllBuildingsFromSave(state.worldRaw);
          commitWorldRaw(r.bytes);
          setStatus(
            "Buildings: +" +
              r.added +
              " (owned " +
              r.owned +
              ", skipped " +
              r.skipped +
              ")."
          );
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-prog-knowledge") &&
      $("btn-prog-knowledge").addEventListener("click", () => {
        try {
          if (!state.worldRaw) throw new Error("World.csav not decompressed.");
          const r = Progress.unlockAllKnowledgeCategories(state.worldRaw);
          commitWorldRaw(r.bytes);
          setStatus("Knowledge bulk: " + JSON.stringify(r.summary));
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-prog-achievements") &&
      $("btn-prog-achievements").addEventListener("click", () => {
        try {
          if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
          const r = Progress.completeAllAchievements(state.hostRaw);
          commitHostRaw(r.bytes);
          setStatus(
            "Achievements flagged: " + r.changed + " field(s) across " + r.total + "."
          );
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-tech-analyze").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.unlockAnalyzeStarter(state.worldRaw);
        commitWorldRaw(r.bytes);
        setStatus(
          "Analyze starter: added " + r.added + ", already had " + r.skipped + "."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-tech-chips").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.unlockTechChips(state.worldRaw);
        commitWorldRaw(r.bytes);
        setStatus(
          "TechChips: added " + r.added + ", already had " + r.skipped + "."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-tech-add-analyze").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.addAnalyzedItem(state.worldRaw, $("tech-analyze-name").value);
        commitWorldRaw(r.bytes);
        setStatus(
          (r.mode === "exists" ? "Already analyzed " : "Analyzed ") + r.added
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-tech-add-know").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.addKnowledgeItem(state.worldRaw, $("tech-know-name").value);
        commitWorldRaw(r.bytes);
        setStatus(
          (r.mode === "exists" ? "Already knew " : "Added knowledge ") + r.added
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-mut-slots").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = Perks.writePerksSlotUpgrade(state.hostRaw, $("mut-slots").value);
        commitHostRaw(r.bytes);
        setStatus("Mutation slots upgrade " + r.level + " (" + r.slots + " slots).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-mut-unlock").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = Perks.unlockAllMutations(state.hostRaw, Perks.MAX_PHASE);
        commitHostRaw(r.bytes);
        setStatus("Unlocked " + r.changed + "/" + r.total + " mutations at phase " + r.phase + ".");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("mut-table").addEventListener("click", (e) => {
      const setBtn = e.target.closest(".btn-mut-set");
      const maxBtn = e.target.closest(".btn-mut-max");
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        if (setBtn) {
          const idx = Number(setBtn.getAttribute("data-idx"));
          const input = document.querySelector(
            '#mut-table input[data-mut-phase="' + idx + '"]'
          );
          const r = Perks.writePerkPhase(
            state.hostRaw,
            idx,
            input ? input.value : 0
          );
          commitHostRaw(r.bytes);
          setStatus("Set " + r.id + " phase to " + r.phase + ".");
        } else if (maxBtn) {
          const idx = Number(maxBtn.getAttribute("data-idx"));
          const r = Perks.writePerkPhase(state.hostRaw, idx, Perks.MAX_PHASE);
          commitHostRaw(r.bytes);
          setStatus("Maxed " + r.id + " to phase " + r.phase + ".");
        }
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-chest-add").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const idx = Number($("chest-select").value || 0);
        const r = Stor.addStorageItem(
          state.worldRaw,
          idx,
          $("chest-add-name").value,
          $("chest-add-qty").value
        );
        commitWorldRaw(r.bytes);
        setStatus(
          (r.mode === "stack" ? "Stacked " : "Added ") +
            r.added +
            " ×" +
            r.stack +
            " in " +
            r.storage
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-chest-dup-all") &&
      $("btn-chest-dup-all").addEventListener("click", () => {
        try {
          if (!state.worldRaw) throw new Error("World.csav not decompressed.");
          const r = Stor.duplicateItemToAllChests(
            state.worldRaw,
            $("chest-add-name").value,
            $("chest-add-qty").value
          );
          commitWorldRaw(r.bytes);
          setStatus(
            "Duplicated " +
              r.item +
              " ×" +
              r.stack +
              " into " +
              r.touched +
              " chests (skipped " +
              r.skipped +
              ")."
          );
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("chest-edit-table").addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".btn-chest-remove");
      const stackBtn = e.target.closest(".btn-chest-apply-stack");
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const storIdx = Number($("chest-select").value || 0);
        if (removeBtn) {
          const idx = Number(removeBtn.getAttribute("data-idx"));
          const r = Stor.removeStorageItem(state.worldRaw, storIdx, idx);
          commitWorldRaw(r.bytes);
          setStatus("Removed " + r.removed + " from " + r.storage + ".");
        } else if (stackBtn) {
          const idx = Number(stackBtn.getAttribute("data-idx"));
          const input = document.querySelector(
            '#chest-edit-table input[data-chest-stack="' + idx + '"]'
          );
          const r = Stor.setStorageStack(
            state.worldRaw,
            storIdx,
            idx,
            input ? input.value : 1
          );
          commitWorldRaw(r.bytes);
          setStatus(
            "Set " + r.name + " ×" + r.stack + " in " + r.storage + "."
          );
        }
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    for (const id of ["files-input", "folder-input", "zip-input"]) {
      $(id).addEventListener("change", async (e) => {
        try {
          await loadFromFileList(e.target.files);
        } catch (err) {
          alert(err.message || String(err));
        }
        e.target.value = "";
      });
    }

    $("btn-save").addEventListener("click", () => {
      if (!confirmWrite("Save ZIP")) return;
      downloadZip(false).catch((err) => alert(err.message || String(err)));
    });
    $("btn-backup").addEventListener("click", () => {
      downloadZip(true).catch((err) => alert(err.message || String(err)));
    });
    $("btn-install").addEventListener("click", () => {
      if (!confirmWrite("Install to folder")) return;
      installToFolder().catch((err) => alert(err.message || String(err)));
    });

    if ($("catalog-filter")) {
      $("catalog-filter").addEventListener("input", () => refreshCatalog());
    }

    $("btn-pos-refresh") &&
      $("btn-pos-refresh").addEventListener("click", () => refreshAll());
    $("btn-cal-refresh") &&
      $("btn-cal-refresh").addEventListener("click", () => refreshAll());
    $("pos-preset") &&
      $("pos-preset").addEventListener("change", () => {
        const id = $("pos-preset").value;
        const p = (Pos.PRESETS || []).find((x) => x.id === id);
        if (!p) return;
        $("pos-x").value = p.x;
        $("pos-y").value = p.y;
        $("pos-z").value = p.z;
      });
    $("btn-pos-apply") &&
      $("btn-pos-apply").addEventListener("click", () => {
        try {
          if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
          const r = Pos.writePosition(
            state.hostRaw,
            $("pos-x").value,
            $("pos-y").value,
            $("pos-z").value
          );
          commitHostRaw(r.bytes);
          setStatus(
            "Position set to " +
              r.x.toFixed(1) +
              ", " +
              r.y.toFixed(1) +
              ", " +
              r.z.toFixed(1)
          );
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-cal-day") &&
      $("btn-cal-day").addEventListener("click", () => {
        try {
          if (!state.worldRaw) throw new Error("World.csav not decompressed.");
          const r = Cal.writeCalendarDay(state.worldRaw, $("cal-day").value);
          commitWorldRaw(r.bytes);
          setStatus("Calendar day set to " + r.day);
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    function setHour(h) {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Cal.writeTimeOfDay(state.worldRaw, h);
        commitWorldRaw(r.bytes);
        setStatus("Time-of-day hour hint → " + h + " (day " + r.day.toFixed(3) + ")");
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    $("btn-cal-dawn") && $("btn-cal-dawn").addEventListener("click", () => setHour(6));
    $("btn-cal-noon") && $("btn-cal-noon").addEventListener("click", () => setHour(12));
    $("btn-cal-dusk") && $("btn-cal-dusk").addEventListener("click", () => setHour(18));
    $("cal-hour") &&
      $("cal-hour").addEventListener("change", () => setHour($("cal-hour").value));

    $("player-edit-mode") &&
      $("player-edit-mode").addEventListener("change", async () => {
        try {
          await loadEditTargetPlayer();
          refreshAll();
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("player-file-select") &&
      $("player-file-select").addEventListener("change", async () => {
        try {
          const mode =
            ($("player-edit-mode") && $("player-edit-mode").value) || "mirror";
          if (mode === "solo") {
            await loadEditTargetPlayer();
          }
          refreshPlayerFileSelect();
          refreshAll();
        } catch (err) {
          alert(err.message || String(err));
        }
      });

    $("btn-op-preset") &&
      $("btn-op-preset").addEventListener("click", () => {
        try {
          if (
            !confirm(
              "Apply OP preset? This maxes vitals, molars, science, stacks, Sleek/Mighty gear, mutations, achievements, analyze/tech, purchases, buildings."
            )
          ) {
            return;
          }
          const r = applyOpPreset(false);
          setStatus("OP preset: " + (r.log || []).join(" · "));
          if ($("preset-hint")) {
            $("preset-hint").textContent = "OP applied: " + (r.log || []).join(" · ");
          }
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-op-ngp") &&
      $("btn-op-ngp").addEventListener("click", () => {
        try {
          if (
            !confirm(
              "Apply OP preset with NG+ XV smithing (Mighty/Sleek 15)?"
            )
          ) {
            return;
          }
          const r = applyOpPreset(true);
          setStatus("OP NG+ preset: " + (r.log || []).join(" · "));
          if ($("preset-hint")) {
            $("preset-hint").textContent =
              "OP NG+ applied: " + (r.log || []).join(" · ");
          }
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-export-loadout") &&
      $("btn-export-loadout").addEventListener("click", () => {
        try {
          if (!Presets) throw new Error("Presets module missing.");
          const data = Presets.exportLoadout(state.hostRaw, state.worldRaw);
          Presets.downloadJson(
            data,
            String(state.slotName || "grounded").replace(/[^\w.-]+/g, "_") +
              "-loadout.json"
          );
          setStatus("Exported loadout JSON.");
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-dry-run") &&
      $("btn-dry-run").addEventListener("click", async () => {
        try {
          if (!state.files.size) throw new Error("Load a save first.");
          setStatus("Running Oodle dry-run…");
          const r = await runOodleDryRun();
          const msg =
            "Oodle dry-run: " +
            r.ok +
            " OK, " +
            r.fail +
            " fail.\n\n" +
            r.lines.join("\n");
          if ($("compare-out")) $("compare-out").textContent = msg;
          setStatus("Oodle dry-run: " + r.ok + " OK, " + r.fail + " fail.");
          if (r.fail) alert(msg);
        } catch (err) {
          alert(err.message || String(err));
        }
      });
    $("btn-check-game") &&
      $("btn-check-game").addEventListener("click", async () => {
        const ps =
          "Get-Process Maine-Win64-Shipping,Grounded -ErrorAction SilentlyContinue | Format-Table Name,Id -AutoSize";
        let copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(ps);
            copied = true;
          }
        } catch (_) {}
        alert(
          "Browsers cannot list Windows processes.\n\n" +
            "Close Maine-Win64-Shipping (Grounded) in Task Manager before Install.\n\n" +
            "PowerShell check" +
            (copied ? " (copied to clipboard)" : "") +
            ":\n" +
            ps
        );
      });
    $("btn-compare-folder") &&
      $("btn-compare-folder").addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.webkitdirectory = true;
        input.multiple = true;
        input.addEventListener("change", async () => {
          try {
            if (!state.hostRaw && !state.worldRaw) {
              throw new Error("Load the primary save first.");
            }
            const files = [...(input.files || [])];
            if (!files.length) return;
            const byName = new Map();
            for (const f of files) {
              const base = f.name.split(/[/\\]/).pop();
              byName.set(base.toLowerCase(), f);
            }
            const hostF = byName.get("hostplayer.csav");
            const worldF = byName.get("world.csav");
            if (!hostF && !worldF) {
              throw new Error(
                "Compare folder needs HostPlayer.csav and/or World.csav."
              );
            }
            let otherHost = null;
            let otherWorld = null;
            if (hostF) {
              otherHost = await C.decompressCsav(
                new Uint8Array(await hostF.arrayBuffer()),
                oozDecompress
              );
            }
            if (worldF) {
              otherWorld = await C.decompressCsav(
                new Uint8Array(await worldF.arrayBuffer()),
                oozDecompress
              );
            }
            const a = snapshotSlotStats(state.hostRaw, state.worldRaw);
            const b = snapshotSlotStats(otherHost, otherWorld);
            const molA = a.molars || {};
            const molB = b.molars || {};
            const lines = [
              "Loaded vs compare folder",
              "gear: " + a.gear + " → " + b.gear,
              "mutations unlocked: " + a.mutations + " → " + b.mutations,
              "purchases: " + a.purchases + " → " + b.purchases,
              "buildings: " + a.buildings + " → " + b.buildings,
              "knowledge: " + a.knowledge + " → " + b.knowledge,
              "milk molars: " +
                (molA.milkMolars ?? "—") +
                " → " +
                (molB.milkMolars ?? "—"),
              "golden molars: " +
                (molA.goldenMolars ?? "—") +
                " → " +
                (molB.goldenMolars ?? "—"),
              "raw science: " +
                (molA.rawScience ?? "—") +
                " → " +
                (molB.rawScience ?? "—"),
            ];
            if ($("compare-out")) $("compare-out").textContent = lines.join("\n");
            setStatus("Compared against folder (" + files.length + " files).");
          } catch (err) {
            alert(err.message || String(err));
          }
        });
        input.click();
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
      window.GGSaveFolders.wireEditor("grounded", {
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
  setStatus("Ready — Oodle/ooz loaded. Pick a Grounded slot.");
})();
