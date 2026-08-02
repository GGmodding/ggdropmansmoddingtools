import { decompress as oozDecompress } from "./vendor/index.js";

(() => {
  "use strict";

  const C = window.GroundedCsav;
  const H = window.GroundedHeader;
  const P = window.GroundedPlayer;
  const S = window.GroundedSave;
  const G = window.GroundedGear;
  const Inv = window.GroundedInventory;
  const D = window.GroundedData;
  const $ = (id) => document.getElementById(id);

  const PANELS = ["overview", "meta", "vitals", "gear", "inventory", "features", "cheats"];

  const state = {
    slotName: "GroundedSave",
    files: new Map(), // name -> Uint8Array
    slots: new Map(),
    hostRaw: null,
    worldRaw: null,
    dirty: false,
    screenshotUrl: null,
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
    setFile("HostPlayer.csav", hostCsavBytes);
    for (const name of [...state.files.keys()]) {
      if (/^Player_.+\.csav$/i.test(name)) {
        state.files.set(name, hostCsavBytes);
      }
    }
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
              '" type="number" min="0" max="99" step="1" value="' +
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
    state.hostRaw = result.bytes;
    const csav = C.compressCsav(state.hostRaw);
    syncPlayerCopies(csav);
    setDirty(true);
    refreshAll();
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

  function commitHostRaw(bytes) {
    state.hostRaw = bytes;
    syncPlayerCopies(C.compressCsav(state.hostRaw));
    setDirty(true);
    refreshAll();
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
      const tier = P.GIANT_STACK_TIER || 20;
      const inputs = document.querySelectorAll(
        "#stack-upgrade-grid input[data-stack-upgrade]"
      );
      if (!inputs.length) {
        alert("No stack size upgrades found in this save.");
        return;
      }
      inputs.forEach((el) => {
        el.value = String(tier);
      });
      try {
        const values = applyMolars();
        setStatus("Giant stacks (tier " + tier + "): " + JSON.stringify(values));
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
      downloadZip(false).catch((err) => alert(err.message || String(err)));
    });
    $("btn-backup").addEventListener("click", () => {
      downloadZip(true).catch((err) => alert(err.message || String(err)));
    });
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
