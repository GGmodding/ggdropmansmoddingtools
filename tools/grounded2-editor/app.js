import { decompress as oozDecompress } from "./vendor/index.js";

(() => {
  "use strict";

  const C = window.GroundedCsav;
  const H = window.GroundedHeader;
  const P = window.GroundedPlayer;
  const S = window.GroundedSave;
  const G = window.GroundedGear;
  const Perks = window.GroundedPerks;
  const Progress = window.GroundedProgress;
  const Tech = window.GroundedTech;
  const Inv = window.GroundedInventory;
  const Stor = window.GroundedStorage;
  const Cal = window.GroundedCalendar;
  const Pos = window.GroundedPosition;
  const Presets = window.GroundedPresets;
  const MapFog = window.GroundedMap;
  const Pets = window.GroundedPets;
  const Haul = window.GroundedHauling;
  const D = window.GroundedData;
  const $ = (id) => document.getElementById(id);

  const PANELS = [
    "overview",
    "meta",
    "vitals",
    "gear",
    "mutations",
    "progress",
    "tech",
    "world",
    "chests",
    "pets",
    "inventory",
    "features",
    "cheats",
  ];

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
        el.innerHTML = "—";
        if (wrap) wrap.classList.add("is-empty");
        continue;
      }
      filled++;
      if (wrap) wrap.classList.remove("is-empty");
      const meta =
        it.kind === "armor"
          ? "L" + it.level + " · " + (it.mid || "None")
          : "L" + it.level + " · " + (it.enhancement || "None");
      const canMax = !/Trinket|Accessory/i.test(it.name);
      el.innerHTML =
        "<div><code>" +
        escapeHtml(it.name) +
        "</code></div>" +
        "<div class=\"equip-slot__meta\">" +
        escapeHtml(meta) +
        "</div>" +
        (canMax
          ? "<div class=\"equip-slot__actions\"><button type=\"button\" class=\"btn btn-doll-max\" data-slot=\"" +
            escapeHtml(id) +
            "\">Max</button></div>"
          : "");
    }
    if (hint) {
      hint.textContent = filled
        ? filled + " equipped slot(s). Max applies one-shot / god path to that piece."
        : "No equipped gear parsed (empty hands / unknown item names).";
    }
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
          Math.round(it.durability * 10) / 10 +
          "</td>" +
          "<td><button type=\"button\" class=\"btn btn-gear-max\" data-idx=\"" +
          idx +
          "\">Max</button></td>" +
          "</tr>"
        );
      })
      .join("");
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

  function refreshMutationsEditor() {
    const hint = $("mut-hint");
    const tbody = $("mut-table").querySelector("tbody");
    if (!state.hostRaw || !Perks) {
      hint.textContent = "Load a save to edit mutations.";
      tbody.innerHTML = "";
      return;
    }
    const parsed = Perks.parsePerkComponent(state.hostRaw);
    const slots = Perks.parsePerksUpgrade(state.hostRaw);
    if (slots) {
      $("mut-slots").disabled = false;
      $("mut-slots").value = slots.level;
      $("mut-slots-hint").textContent = " → " + (2 + slots.level) + " equip slots";
      $("btn-mut-slots").disabled = false;
    } else {
      $("mut-slots").disabled = true;
      $("mut-slots-hint").textContent = " (Perks upgrade not in this save yet)";
      $("btn-mut-slots").disabled = true;
    }
    if (!parsed.ok) {
      hint.textContent = "Could not parse PerkComponent.";
      tbody.innerHTML = "";
      return;
    }
    const unlocked = parsed.entries.filter((e) => e.phase >= 0).length;
    hint.textContent =
      parsed.entries.length +
      " mutations · " +
      unlocked +
      " unlocked · phase −1 locked, 0–2 = I–III.";
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
          "<td><input type=\"number\" min=\"-1\" max=\"2\" step=\"1\" value=\"" +
          e.phase +
          "\" data-mut-phase=\"" +
          idx +
          "\" style=\"width:4rem\" /></td>" +
          "<td>" +
          "<button type=\"button\" class=\"btn btn-mut-set\" data-idx=\"" +
          idx +
          "\">Set</button> " +
          "<button type=\"button\" class=\"btn btn-mut-max\" data-idx=\"" +
          idx +
          "\">III</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function refreshQuestsEditor() {
    const hint = $("quest-hint");
    const tbody = $("quest-table").querySelector("tbody");
    if (!state.worldRaw || !Progress) {
      hint.textContent = "Load a save with World.csav to edit quests.";
      tbody.innerHTML = "";
      return;
    }
    const parsed = Progress.parseQuests(state.worldRaw);
    if (!parsed.ok) {
      hint.textContent = "No QuestManager / Table_Quests_ALL entries found.";
      tbody.innerHTML = "";
      return;
    }
    const done = parsed.quests.filter((q) => q.complete).length;
    hint.textContent =
      parsed.quests.length + " quests · " + done + " complete · edits rewrite World.csav.";
    tbody.innerHTML = parsed.quests
      .map((q) => {
        const status = q.complete
          ? "complete"
          : q.active
            ? "active " + q.doneSteps + "/" + q.stepCount
            : "locked " + q.doneSteps + "/" + q.stepCount;
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(q.display) +
          "</td>" +
          "<td><code>" +
          escapeHtml(q.id) +
          "</code></td>" +
          "<td>" +
          q.doneSteps +
          "/" +
          q.stepCount +
          "</td>" +
          "<td>" +
          escapeHtml(status) +
          "</td>" +
          "<td>" +
          (q.complete
            ? "—"
            : "<button type=\"button\" class=\"btn btn-quest-done\" data-id=\"" +
              escapeHtml(q.id) +
              "\">Complete</button>") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function commitWorldRaw(bytes) {
    state.worldRaw = bytes;
    setFile("World.csav", C.compressCsav(bytes));
    setDirty(true);
    refreshAll();
  }

  function refreshTechEditor() {
    const hint = $("tech-hint");
    const knowBody = $("tech-know-table").querySelector("tbody");
    const analBody = $("tech-anal-table").querySelector("tbody");
    if (!state.worldRaw || !Tech) {
      hint.textContent = "Load World.csav to browse knowledge / analyzed lists.";
      knowBody.innerHTML = "";
      analBody.innerHTML = "";
      return;
    }
    const parsed = Tech.parsePartyTech(state.worldRaw);
    if (!parsed.ok) {
      hint.textContent = "Could not parse PartyComponent tech lists.";
      knowBody.innerHTML = "";
      analBody.innerHTML = "";
      return;
    }
    hint.textContent =
      parsed.knowledge.length +
      " knowledge · " +
      parsed.analyzed.length +
      " analyzed" +
      (parsed.knowledgeCountMatches ? "" : " · knowledge count field nonstandard (adds still insert records)");
    knowBody.innerHTML = parsed.knowledge
      .map((k) => "<tr><td><code>" + escapeHtml(k.name) + "</code></td></tr>")
      .join("");
    analBody.innerHTML = parsed.analyzed
      .map((k) => "<tr><td><code>" + escapeHtml(k.name) + "</code></td></tr>")
      .join("");
  }

  function refreshWorldEditor() {
    if (Cal && state.worldRaw) {
      const cal = Cal.parseCalendar(state.worldRaw);
      if (cal.ok) {
        $("cal-day").value = Math.round(cal.day * 100) / 100;
        $("cal-hour").value = Math.round(cal.hourHint * 100) / 100;
        $("cal-hint").textContent =
          "Day " + cal.day.toFixed(2) + " · ~" + cal.hourHint.toFixed(1) + "h";
      } else {
        $("cal-hint").textContent = "CalendarComponent not parsed.";
      }
    }
    if (Progress && state.worldRaw && Progress.parseBuildings) {
      const b = Progress.parseBuildings(state.worldRaw);
      $("build-hint").textContent = b.ok
        ? b.entries.length + " unlocked buildings"
        : "No building unlock list found.";
      $("build-table").querySelector("tbody").innerHTML = b.ok
        ? b.entries
            .slice(0, 200)
            .map((e) => "<tr><td><code>" + escapeHtml(e.name) + "</code></td></tr>")
            .join("")
        : "";
    }
    if (Progress && state.hostRaw && Progress.parseAchievements) {
      const a = Progress.parseAchievements(state.hostRaw);
      const unlocked = a.ok ? a.entries.filter((e) => e.unlocked).length : 0;
      $("ach-hint").textContent = a.ok
        ? a.entries.length + " achievements · " + unlocked + " unlocked"
        : "AchievementsComponent not parsed.";
      $("ach-table").querySelector("tbody").innerHTML = a.ok
        ? a.entries
            .map(
              (e) =>
                "<tr><td><code>" +
                escapeHtml(e.id) +
                "</code></td><td>" +
                (e.unlocked ? "done" : "locked") +
                "</td></tr>"
            )
            .join("")
        : "";
    }
    if (MapFog && state.worldRaw) {
      const fog = MapFog.parseFog(state.worldRaw);
      $("fog-hint").textContent = fog.ok
        ? "Fog blob " +
          fog.count +
          " bytes · " +
          fog.pct +
          "% revealed (" +
          fog.revealed +
          " ff / " +
          fog.fogged +
          " zero)"
        : "FogOfWarComponent not parsed.";
      const survey = MapFog.parseSurvey(state.worldRaw);
      $("survey-hint").textContent = survey.ok
        ? "ResourceSurvey: tag " + survey.tag + " · " + survey.note
        : "ResourceSurveyComponent not found.";
    }
  }

  function refreshPetsEditor() {
    if (Pets && state.hostRaw) {
      const omni = Pets.parseOmni(state.hostRaw);
      $("omni-hint").textContent = omni.ok
        ? "Version " + omni.version + " · tiers [" + omni.levels.join(", ") + "]"
        : "OmniToolComponent not found.";
      const pets = Pets.parsePetStorage(state.hostRaw);
      $("pet-hint").textContent = pets.ok
        ? pets.items.length +
          " item(s) in PetStorage" +
          (pets.hasMaster ? " (PetMaster present)" : "")
        : "PetStorageComponent not found.";
      $("pet-table").querySelector("tbody").innerHTML = pets.ok
        ? pets.items
            .map(
              (it) =>
                "<tr><td><code>" +
                escapeHtml(it.name) +
                "</code></td><td>" +
                it.stack +
                "</td></tr>"
            )
            .join("") || "<tr><td colspan=\"2\">Empty.</td></tr>"
        : "";
      const buggy = Pets.parseBuggy(state.hostRaw);
      $("buggy-hint").textContent = buggy.ok
        ? "PlayerBuggyUpgradeComponent tag " + buggy.tag + " — " + buggy.note
        : "PlayerBuggyUpgradeComponent not found.";
    }
    if (Haul && state.hostRaw) {
      const haul = Haul.parseHauling(state.hostRaw);
      $("haul-hint").textContent = haul.ok
        ? haul.items.length + " hauled item(s)."
        : "HaulingComponent not found.";
      $("haul-table").querySelector("tbody").innerHTML = haul.ok
        ? haul.items.length
          ? haul.items
              .map(
                (it) =>
                  "<tr><td><code>" +
                  escapeHtml(it.name) +
                  "</code></td><td>" +
                  it.stack +
                  "</td><td>" +
                  escapeHtml(it.enhancement === "None" ? "—" : it.enhancement || "—") +
                  "</td></tr>"
              )
              .join("")
          : "<tr><td colspan=\"3\">Nothing hauled right now.</td></tr>"
        : "";
    }
  }

  function snapshotSlotStats(hostRaw, worldRaw) {
    const snap = {
      gear: 0,
      mutations: 0,
      buildings: 0,
      knowledge: 0,
      quests: 0,
      fogPct: null,
      omni: null,
    };
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
      if (worldRaw && Progress && Progress.parseBuildings) {
        const b = Progress.parseBuildings(worldRaw);
        if (b.ok) snap.buildings = b.entries.length;
      }
    } catch (_) {}
    try {
      if (worldRaw && Progress && Progress.parseQuests) {
        const q = Progress.parseQuests(worldRaw);
        if (q.ok) snap.quests = q.entries.length;
      }
    } catch (_) {}
    try {
      if (worldRaw && Tech) {
        const t = Tech.parsePartyTech(worldRaw);
        if (t && t.ok && t.knowledge) snap.knowledge = t.knowledge.length;
      }
    } catch (_) {}
    try {
      if (hostRaw && P) snap.molars = P.parseMolars(hostRaw, worldRaw);
    } catch (_) {}
    try {
      if (worldRaw && MapFog) {
        const f = MapFog.parseFog(worldRaw);
        if (f.ok) snap.fogPct = f.pct;
      }
    } catch (_) {}
    try {
      if (hostRaw && Pets) {
        const o = Pets.parseOmni(hostRaw);
        if (o.ok) snap.omni = o.levels.join("/");
      }
    } catch (_) {}
    return snap;
  }

  function refreshChestsEditor() {
    const hint = $("chest-hint");
    const sel = $("chest-select");
    const tbody = $("chest-edit-table").querySelector("tbody");
    if (!state.worldRaw || !Stor) {
      hint.textContent = "Load World.csav to browse storage.";
      sel.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }
    const listed = Stor.listStorages(state.worldRaw);
    if (!listed.ok) {
      hint.textContent =
        "No chest/storage inventories found in this World (place chests in-game first).";
      sel.innerHTML = "";
      tbody.innerHTML = "";
      return;
    }
    const prev = sel.value;
    sel.innerHTML = listed.storages
      .map(
        (s, i) =>
          "<option value=\"" +
          i +
          "\">" +
          escapeHtml(s.label) +
          " (" +
          s.itemCount +
          ")</option>"
      )
      .join("");
    if (prev && Number(prev) < listed.storages.length) sel.value = prev;
    const idx = Number(sel.value) || 0;
    const st = listed.storages[idx];
    hint.textContent =
      listed.storages.length + " storages · viewing “" + st.label + "”.";
    tbody.innerHTML = st.items
      .map((it, i) => {
        return (
          "<tr><td><code>" +
          escapeHtml(it.name) +
          "</code></td><td>" +
          it.stack +
          "</td><td><button type=\"button\" class=\"btn btn-chest-rm\" data-i=\"" +
          i +
          "\">Remove</button></td></tr>"
        );
      })
      .join("");
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
    refreshGearTable();
    refreshMutationsEditor();
    refreshQuestsEditor();
    refreshTechEditor();
    refreshWorldEditor();
    refreshChestsEditor();
    refreshPetsEditor();

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
        setStatus(
          r.changed
            ? "God mode armor applied to " + r.changed + " item(s)."
            : "No armor pieces found to upgrade (craft/equip armor first)."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-sleekarmor").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = G.applySleekArmor(state.hostRaw);
        commitHostRaw(r.bytes);
        setStatus(
          r.changed
            ? "Sleek armor applied to " + r.changed + " item(s) @ " + r.level + "."
            : "No armor pieces found to upgrade."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
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
    $("btn-sleek-ngp").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = G.applySleekArmor(state.hostRaw, { ngPlus: true });
        commitHostRaw(r.bytes);
        setStatus(
          r.changed
            ? "Sleek NG+ armor: " + r.changed + " item(s) @ Sleek " + r.level + "."
            : "No armor pieces found to upgrade."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("gear-table").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-gear-max");
      if (!btn) return;
      try {
        const idx = Number(btn.getAttribute("data-idx"));
        const values = maxSingleGear(idx);
        setStatus("Maxed " + values.name + ": " + JSON.stringify(values));
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
        const item = doll.slots[slot];
        if (!item) throw new Error("Empty slot.");
        const idx = G.gearIndexForDollItem(state.hostRaw, item);
        if (idx < 0) throw new Error("That slot is not smithable here (trinket?).");
        const values = maxSingleGear(idx);
        setStatus("Maxed equipped " + values.name + ".");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-mut-refresh").addEventListener("click", () => refreshAll());
    $("btn-mut-slots").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = Perks.writePerksSlotUpgrade(state.hostRaw, $("mut-slots").value);
        commitHostRaw(r.bytes);
        setStatus("Mutation slots upgrade → " + r.level + " (equip " + r.slots + ").");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-mut-unlock").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const r = Perks.unlockAllMutations(state.hostRaw, Perks.MAX_PHASE);
        commitHostRaw(r.bytes);
        setStatus(
          "Unlocked " + r.changed + " / " + r.total + " mutations to phase " + r.phase + "."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("mut-table").addEventListener("click", (e) => {
      const setBtn = e.target.closest(".btn-mut-set");
      const maxBtn = e.target.closest(".btn-mut-max");
      if (!setBtn && !maxBtn) return;
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not decompressed.");
        const idx = Number((setBtn || maxBtn).getAttribute("data-idx"));
        let phase = Perks.MAX_PHASE;
        if (setBtn) {
          const inp = $("mut-table").querySelector(
            'input[data-mut-phase="' + idx + '"]'
          );
          phase = inp ? inp.value : 0;
        }
        const r = Perks.writePerkPhase(state.hostRaw, idx, phase);
        commitHostRaw(r.bytes);
        setStatus("Set " + r.id + " → phase " + r.phase + ".");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-quest-refresh").addEventListener("click", () => refreshAll());
    $("btn-quest-complete-all").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        if (
          !confirm(
            "Mark all " +
              (Progress.parseQuests(state.worldRaw).quests || []).length +
              " quests complete in World.csav?"
          )
        ) {
          return;
        }
        const r = Progress.completeAllQuests(state.worldRaw);
        commitWorldRaw(r.bytes);
        setStatus("Completed " + r.changed + " / " + r.total + " quests.");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("quest-table").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-quest-done");
      if (!btn) return;
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const id = btn.getAttribute("data-id");
        const r = Progress.completeQuest(state.worldRaw, id);
        commitWorldRaw(r.bytes);
        setStatus("Completed quest " + id + " (" + r.steps + " steps).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-tech-refresh").addEventListener("click", () => refreshAll());
    $("btn-tech-analyze").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.unlockAnalyzeStarter(state.worldRaw);
        commitWorldRaw(r.bytes);
        setStatus("Analyze starter: +" + r.added + " (skipped " + r.skipped + ").");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-tech-chips").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.unlockTechChips(state.worldRaw);
        commitWorldRaw(r.bytes);
        setStatus("TechChips: +" + r.added + " (skipped " + r.skipped + ").");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-tech-add-know").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.addKnowledgeItem(state.worldRaw, $("tech-know-name").value);
        commitWorldRaw(r.bytes);
        setStatus("Knowledge " + r.mode + ": " + r.added);
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-tech-add-anal").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World.csav not decompressed.");
        const r = Tech.addAnalyzedItem(state.worldRaw, $("tech-anal-name").value);
        commitWorldRaw(r.bytes);
        setStatus("Analyzed " + r.mode + ": " + r.added);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-cal-apply").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World not loaded.");
        const r = Cal.writeCalendarDay(state.worldRaw, $("cal-day").value);
        commitWorldRaw(r.bytes);
        setStatus("Calendar day → " + r.day);
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    function setHour(h) {
      try {
        if (!state.worldRaw) throw new Error("World not loaded.");
        const r = Cal.writeTimeOfDay(state.worldRaw, h);
        commitWorldRaw(r.bytes);
        setStatus("Time of day → hour " + h);
      } catch (err) {
        alert(err.message || String(err));
      }
    }
    $("btn-cal-dawn").addEventListener("click", () => setHour(6));
    $("btn-cal-noon").addEventListener("click", () => setHour(12));
    $("btn-cal-dusk").addEventListener("click", () => setHour(18));
    $("btn-build-refresh").addEventListener("click", () => refreshAll());
    $("btn-build-unlock").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World not loaded.");
        const r = Progress.unlockAllBuildingsFromSave(state.worldRaw);
        commitWorldRaw(r.bytes);
        setStatus(
          "Buildings +" + r.added + " (skipped " + r.skipped + ", owned " + r.owned + ")."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-ach-complete").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not loaded.");
        const r = Progress.completeAllAchievements(state.hostRaw);
        commitHostRaw(r.bytes);
        setStatus("Achievements updated (" + r.changed + " flag writes, " + r.total + " entries).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-fog-reveal").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World not loaded.");
        const r = MapFog.revealAllFog(state.worldRaw);
        commitWorldRaw(r.bytes);
        setStatus("Fog revealed (" + r.count + " bytes → 0xFF; was " + r.wasRevealed + " already).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-omni-max").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not loaded.");
        const r = Pets.maxOmniTool(state.hostRaw, Pets.OMNI_MAX_LEVEL);
        commitHostRaw(r.bytes);
        setStatus(
          "Omni tiers " +
            (r.was || []).join("/") +
            " → " +
            r.levels.join("/") +
            " (" +
            r.changed +
            " changed)."
        );
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-chest-refresh").addEventListener("click", () => refreshChestsEditor());
    $("chest-select").addEventListener("change", () => refreshChestsEditor());
    $("btn-chest-add").addEventListener("click", () => {
      try {
        if (!state.worldRaw) throw new Error("World not loaded.");
        const idx = Number($("chest-select").value);
        const r = Stor.addStorageItem(
          state.worldRaw,
          idx,
          $("chest-add-name").value,
          $("chest-add-qty").value
        );
        commitWorldRaw(r.bytes);
        setStatus("Chest add: " + JSON.stringify(r.mode || r));
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("chest-edit-table").addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-chest-rm");
      if (!btn) return;
      try {
        const idx = Number($("chest-select").value);
        const r = Stor.removeStorageItem(state.worldRaw, idx, Number(btn.getAttribute("data-i")));
        commitWorldRaw(r.bytes);
        setStatus("Removed " + r.removed + " from " + r.storage);
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    $("btn-op-preset").addEventListener("click", () => {
      try {
        if (!state.hostRaw && !state.worldRaw) throw new Error("Load a save first.");
        if (!confirm("Apply OP preset (vitals, molars, gear, mutations, quests, buildings, analyze)?")) {
          return;
        }
        const r = Presets.applyOpPreset(state.hostRaw, state.worldRaw);
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
        setStatus("OP preset: " + r.log.join(", "));
      } catch (err) {
        alert(err.message || String(err));
      }
    });
    $("btn-status-clear").addEventListener("click", () => {
      try {
        if (!state.hostRaw) throw new Error("HostPlayer not loaded.");
        const r = Presets.clearStatusEffects(state.hostRaw);
        commitHostRaw(r.bytes);
        setStatus("Cleared status bytes (" + r.touched + " nonzero → 0).");
      } catch (err) {
        alert(err.message || String(err));
      }
    });
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
            throw new Error("Compare folder needs HostPlayer.csav and/or World.csav.");
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
            "buildings: " + a.buildings + " → " + b.buildings,
            "quests: " + a.quests + " → " + b.quests,
            "knowledge: " + a.knowledge + " → " + b.knowledge,
            "fog %: " + (a.fogPct ?? "—") + " → " + (b.fogPct ?? "—"),
            "omni: " + (a.omni ?? "—") + " → " + (b.omni ?? "—"),
            "milk molars: " + (molA.milkMolars ?? "—") + " → " + (molB.milkMolars ?? "—"),
            "golden molars: " + (molA.goldenMolars ?? "—") + " → " + (molB.goldenMolars ?? "—"),
            "raw science: " + (molA.rawScience ?? "—") + " → " + (molB.rawScience ?? "—"),
          ];
          if ($("compare-out")) $("compare-out").textContent = lines.join("\n");
          setStatus("Compared against folder (" + files.length + " files).");
        } catch (err) {
          alert(err.message || String(err));
        }
      });
      input.click();
    });

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
