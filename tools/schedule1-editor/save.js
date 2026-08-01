(() => {
  "use strict";

  const RANKS = [
    { id: 0, name: "Street Rat", xpPerTier: 200 },
    { id: 1, name: "Hoodlum", xpPerTier: 400 },
    { id: 2, name: "Peddler", xpPerTier: 625 },
    { id: 3, name: "Hustler", xpPerTier: [625, 825, 825, 825, 825] },
    { id: 4, name: "Bagman", xpPerTier: 1025 },
    { id: 5, name: "Enforcer", xpPerTier: 1250 },
    { id: 6, name: "Shot Caller", xpPerTier: 1450 },
    { id: 7, name: "Block Boss", xpPerTier: 1675 },
    { id: 8, name: "Underlord", xpPerTier: 1875 },
    { id: 9, name: "Baron", xpPerTier: 2075 },
    { id: 10, name: "Kingpin", xpPerTier: 2300 },
  ];

  const TIER_LABELS = ["I", "II", "III", "IV", "V"];

  const KEY_FILES = {
    money: "Money.json",
    rank: "Rank.json",
    game: "Game.json",
    time: "Time.json",
    metadata: "Metadata.json",
    products: "Products.json",
    inventory: "Players/Player_0/Inventory.json",
    appearance: "Players/Player_0/Appearance.json",
    clothing: "Players/Player_0/Clothing.json",
    vehicles: "OwnedVehicles.json",
    variables: "Variables.json",
    quests: "Quests.json",
  };

  function normalizePath(p) {
    return String(p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }

  function stripRootPrefix(path, rootName) {
    const p = normalizePath(path);
    if (!rootName) return p;
    const prefix = rootName.replace(/\/+$/, "") + "/";
    if (p === rootName || p === rootName.replace(/\/+$/, "")) return "";
    if (p.startsWith(prefix)) return p.slice(prefix.length);
    return p;
  }

  function detectCommonRoot(paths) {
    if (!paths.length) return "";
    const parts = paths.map((p) => normalizePath(p).split("/").filter(Boolean));
    if (parts.some((p) => p.length < 2)) return "";
    const first = parts[0][0];
    if (parts.every((p) => p[0] === first)) return first;
    return "";
  }

  function parseJsonText(text, label) {
    try {
      return JSON.parse(String(text).replace(/^\uFEFF/, ""));
    } catch (err) {
      throw new Error("Invalid JSON in " + label + ": " + (err && err.message ? err.message : err));
    }
  }

  function serializeJson(data) {
    return JSON.stringify(data, null, 4).replace(/\n/g, "\r\n") + "\r\n";
  }

  function safeParse(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function isScheduleSave(files) {
    const keys = Object.keys(files);
    return keys.some((k) => /(^|\/)Money\.json$/i.test(k)) ||
      keys.some((k) => /(^|\/)Rank\.json$/i.test(k)) ||
      keys.some((k) => /(^|\/)Game\.json$/i.test(k));
  }

  function findFile(files, relativePath) {
    const want = normalizePath(relativePath).toLowerCase();
    for (const key of Object.keys(files)) {
      if (normalizePath(key).toLowerCase() === want) return key;
    }
    for (const key of Object.keys(files)) {
      const n = normalizePath(key).toLowerCase();
      if (n.endsWith("/" + want) || n === want) return key;
    }
    return null;
  }

  function getJson(files, relativePath) {
    const key = findFile(files, relativePath);
    if (!key) return null;
    const entry = files[key];
    if (entry.data != null) return entry.data;
    entry.data = parseJsonText(entry.text, key);
    return entry.data;
  }

  function ensureFile(files, relativePath, fallback) {
    let key = findFile(files, relativePath);
    if (!key) {
      key = normalizePath(relativePath);
      files[key] = {
        text: serializeJson(fallback),
        data: JSON.parse(JSON.stringify(fallback)),
        dirty: true,
      };
    }
    return getJson(files, key);
  }

  function markDirty(files, relativePath) {
    const key = findFile(files, relativePath);
    if (key) files[key].dirty = true;
  }

  function flushJson(files, relativePath) {
    const key = findFile(files, relativePath);
    if (!key) return;
    const entry = files[key];
    if (entry.data == null) return;
    entry.text = serializeJson(entry.data);
    entry.dirty = true;
  }

  function flushAll(files) {
    for (const key of Object.keys(files)) {
      const entry = files[key];
      if (entry.data != null && entry.dirty) {
        entry.text = serializeJson(entry.data);
      }
    }
  }

  function setEntryData(files, path, data) {
    const key = findFile(files, path) || normalizePath(path);
    if (!files[key]) {
      files[key] = { text: "", data: null, dirty: false };
    }
    files[key].data = data;
    files[key].text = serializeJson(data);
    files[key].dirty = true;
  }

  function detectSaveGameFolders(fileMap) {
    return [...new Set(
      Object.keys(fileMap).map((k) => k.split("/")[0]).filter((p) => /^SaveGame_\d+$/i.test(p))
    )].sort((a, b) => {
      const na = Number((a.match(/(\d+)/) || [])[1]) || 0;
      const nb = Number((b.match(/(\d+)/) || [])[1]) || 0;
      return na - nb;
    });
  }

  function unwrapSlot(fileMap, slotName) {
    const unwrapped = {};
    for (const [k, v] of Object.entries(fileMap)) {
      if (!k.startsWith(slotName + "/")) continue;
      const next = k.slice(slotName.length + 1);
      if (next) unwrapped[next] = v;
    }
    return unwrapped;
  }

  function buildFileMap(fileEntries) {
    const paths = fileEntries.map((f) => f.relativePath);
    const root = detectCommonRoot(paths);
    const files = {};
    for (const f of fileEntries) {
      const rel = stripRootPrefix(f.relativePath, root);
      if (!rel || !/\.json$/i.test(rel)) continue;
      files[normalizePath(rel)] = { text: f.text, data: null, dirty: false };
    }
    return { files, root };
  }

  function buildFromFileList(fileEntries, options = {}) {
    const { files: mapped, root } = buildFileMap(fileEntries);
    const topFolders = detectSaveGameFolders(mapped);
    const availableSlots = topFolders.slice();
    let slotName = options.preferredSlot || null;

    if (topFolders.length) {
      if (!slotName || !topFolders.includes(slotName)) slotName = topFolders[0];
      const unwrapped = unwrapSlot(mapped, slotName);
      if (!Object.keys(unwrapped).length) {
        throw new Error("Slot " + slotName + " had no JSON files.");
      }
      if (!isScheduleSave(unwrapped)) {
        throw new Error("Slot " + slotName + " does not look like a Schedule I save.");
      }
      return {
        files: unwrapped,
        rootName: slotName,
        availableSlots,
        rawEntries: fileEntries,
      };
    }

    if (!isScheduleSave(mapped)) {
      throw new Error("Not a Schedule I save — need Money.json / Rank.json / Game.json from a SaveGame folder.");
    }
    return {
      files: mapped,
      rootName: (root && /^SaveGame/i.test(root) ? root : null) || "SaveGame_1",
      availableSlots: [],
      rawEntries: fileEntries,
    };
  }

  async function buildFromZip(arrayBuffer, options = {}) {
    if (typeof JSZip === "undefined") throw new Error("JSZip failed to load.");
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = [];
    const jobs = [];
    zip.forEach((path, file) => {
      if (file.dir || !/\.json$/i.test(path)) return;
      jobs.push(
        file.async("string").then((text) => {
          entries.push({ relativePath: path, text });
        })
      );
    });
    await Promise.all(jobs);
    if (!entries.length) throw new Error("ZIP had no .json files.");
    return buildFromFileList(entries, options);
  }

  async function toZipBlob(files, folderName) {
    if (typeof JSZip === "undefined") throw new Error("JSZip failed to load.");
    flushAll(files);
    const zip = new JSZip();
    const root = folderName || "SaveGame";
    for (const [rel, entry] of Object.entries(files)) {
      zip.file(root + "/" + normalizePath(rel), entry.text);
    }
    return zip.generateAsync({ type: "blob" });
  }

  function dirtyCount(files) {
    return Object.values(files).filter((f) => f.dirty).length;
  }

  function tierXpCost(rankId, tier) {
    const rank = RANKS.find((r) => r.id === rankId);
    if (!rank) return 0;
    const t = Math.max(1, Math.min(5, tier | 0));
    if (Array.isArray(rank.xpPerTier)) return rank.xpPerTier[t - 1] || rank.xpPerTier[0];
    return rank.xpPerTier;
  }

  function totalXpForRankTier(rankId, tier) {
    let total = 0;
    for (const rank of RANKS) {
      if (rank.id > rankId) break;
      const maxTier = rank.id === rankId ? Math.max(0, (tier | 0) - 1) : 5;
      for (let t = 1; t <= maxTier; t++) total += tierXpCost(rank.id, t);
    }
    return total;
  }

  function rankLabel(rankId, tier) {
    const rank = RANKS.find((r) => r.id === rankId);
    const name = rank ? rank.name : "Rank " + rankId;
    const t = Math.max(1, Math.min(99, tier | 0));
    const roman = TIER_LABELS[t - 1] || String(t);
    return name + " " + roman;
  }

  function guessGameVersion(files) {
    for (const key of [KEY_FILES.game, KEY_FILES.money, KEY_FILES.rank, KEY_FILES.products]) {
      const data = getJson(files, key);
      if (data && data.GameVersion) return data.GameVersion;
    }
    return "0.3.5f3";
  }

  function makeItemString(id, quantity, gameVersion, extra = {}) {
    const obj = {
      DataType: id === "cash" ? "CashData" : "ItemData",
      DataVersion: 0,
      GameVersion: gameVersion,
      ID: id || "",
      Quantity: Number(quantity) || 0,
      ...extra,
    };
    if (id === "cash" && obj.CashBalance == null) obj.CashBalance = 0;
    return JSON.stringify(obj);
  }

  function parseItemSlot(raw) {
    if (raw == null) return { id: "", quantity: 0, rawType: "empty", data: null };
    if (typeof raw === "object") {
      return {
        id: raw.ID || "",
        quantity: raw.Quantity || 0,
        rawType: raw.DataType || "object",
        data: raw,
        cash: raw.CashBalance,
      };
    }
    if (typeof raw !== "string" || !raw.trim()) {
      return { id: "", quantity: 0, rawType: "empty", data: null };
    }
    const data = safeParse(raw);
    if (!data) return { id: "", quantity: 0, rawType: "raw", data: null, raw };
    return {
      id: data.ID || "",
      quantity: data.Quantity || 0,
      rawType: data.DataType || "ItemData",
      data,
      cash: data.CashBalance,
    };
  }

  function writeItemSlot(existingRaw, id, quantity, gameVersion, cashBalance) {
    const prev = parseItemSlot(existingRaw);
    const cleanId = String(id || "").trim();
    const qty = Number(quantity) || 0;
    if (!cleanId && qty <= 0 && cashBalance == null) {
      return makeItemString("", 0, gameVersion);
    }
    const base = prev.data && typeof prev.data === "object" ? { ...prev.data } : {
      DataType: cleanId === "cash" ? "CashData" : "ItemData",
      DataVersion: 0,
      GameVersion: gameVersion,
    };
    base.ID = cleanId;
    base.Quantity = cleanId === "cash" ? Math.max(1, qty || 1) : qty;
    base.GameVersion = base.GameVersion || gameVersion;
    if (cleanId === "cash") {
      base.DataType = "CashData";
      base.CashBalance = cashBalance != null ? Number(cashBalance) : (base.CashBalance || 0);
    } else if (base.DataType === "CashData") {
      base.DataType = "ItemData";
      delete base.CashBalance;
    }
    return JSON.stringify(base);
  }

  function getCashBalance(inventory) {
    if (!inventory || !Array.isArray(inventory.Items)) return 0;
    for (const raw of inventory.Items) {
      const slot = parseItemSlot(raw);
      if (slot.rawType === "CashData" || slot.id === "cash") return Number(slot.cash) || 0;
    }
    return 0;
  }

  function setCashBalance(inventory, value) {
    if (!inventory) return false;
    if (!Array.isArray(inventory.Items)) inventory.Items = [];
    const amount = Number(value) || 0;
    const gv = (inventory.Items[0] && parseItemSlot(inventory.Items[0]).data && parseItemSlot(inventory.Items[0]).data.GameVersion) || "0.3.5f3";
    for (let i = 0; i < inventory.Items.length; i++) {
      const slot = parseItemSlot(inventory.Items[i]);
      if (slot.rawType === "CashData" || slot.id === "cash") {
        inventory.Items[i] = writeItemSlot(inventory.Items[i], "cash", 1, gv, amount);
        return true;
      }
    }
    inventory.Items.push(writeItemSlot(null, "cash", 1, gv, amount));
    return true;
  }

  function listInventorySlots(inventory) {
    if (!inventory || !Array.isArray(inventory.Items)) return [];
    return inventory.Items.map((raw, index) => {
      const slot = parseItemSlot(raw);
      return {
        index,
        id: slot.id,
        quantity: slot.quantity,
        type: slot.rawType,
        cash: slot.cash,
        isCash: slot.rawType === "CashData" || slot.id === "cash",
      };
    });
  }

  function setInventorySlot(inventory, index, id, quantity, gameVersion) {
    if (!inventory || !Array.isArray(inventory.Items)) return false;
    if (index < 0 || index >= inventory.Items.length) return false;
    const prev = parseItemSlot(inventory.Items[index]);
    if (prev.isCash || prev.rawType === "CashData" || prev.id === "cash") {
      inventory.Items[index] = writeItemSlot(inventory.Items[index], "cash", 1, gameVersion, prev.cash || 0);
      return true;
    }
    inventory.Items[index] = writeItemSlot(inventory.Items[index], id, quantity, gameVersion);
    return true;
  }

  function prettyNameFromPath(path) {
    const parts = normalizePath(path).split("/");
    // Properties/Sweatshop.json -> Sweatshop
    // Properties/Sweatshop/Property.json -> Sweatshop
    // Businesses/Laundromat/Business.json -> Laundromat
    // NPCs/Austin Steiner/NPC.json -> Austin Steiner
    if (/Property\.json$/i.test(path) || /Business\.json$/i.test(path) || /NPC\.json$/i.test(path)) {
      return decodeURIComponent(parts[parts.length - 2] || parts[parts.length - 1]);
    }
    return decodeURIComponent((parts[parts.length - 1] || "").replace(/\.json$/i, ""));
  }

  function listOwnership(files) {
    const out = [];
    for (const key of Object.keys(files)) {
      const n = normalizePath(key);
      const isProp = /^Properties\//i.test(n) && (/Property\.json$/i.test(n) || (/^Properties\/[^/]+\.json$/i.test(n)));
      const isBiz = /^Businesses\//i.test(n) && /Business\.json$/i.test(n);
      if (!isProp && !isBiz) continue;
      let data;
      try {
        data = getJson(files, key);
      } catch (_) {
        continue;
      }
      if (!data || typeof data !== "object") continue;
      if (!("IsOwned" in data) && !data.PropertyCode) continue;
      out.push({
        path: key,
        kind: isBiz ? "business" : "property",
        name: prettyNameFromPath(key),
        code: data.PropertyCode || "",
        owned: !!data.IsOwned,
      });
    }
    out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    return out;
  }

  function setOwned(files, path, owned) {
    const data = getJson(files, path);
    if (!data) return false;
    data.IsOwned = !!owned;
    flushJson(files, path);
    return true;
  }

  function ownAll(files, kind) {
    let n = 0;
    for (const row of listOwnership(files)) {
      if (kind && row.kind !== kind) continue;
      if (setOwned(files, row.path, true)) n += 1;
    }
    return n;
  }

  function listNpcs(files) {
    const folders = new Map();
    for (const key of Object.keys(files)) {
      const m = /^NPCs\/([^/]+)\//i.exec(normalizePath(key));
      if (!m) continue;
      const name = decodeURIComponent(m[1]);
      if (!folders.has(name)) folders.set(name, { name, files: {} });
      const base = "NPCs/" + m[1] + "/";
      const rest = normalizePath(key).slice(base.length);
      folders.get(name).files[rest] = key;
    }
    const rows = [];
    for (const folder of folders.values()) {
      const npcPath = folder.files["NPC.json"];
      const relPath = folder.files["Relationship.json"];
      const custPath = folder.files["CustomerData.json"];
      let npc = null;
      let rel = null;
      let cust = null;
      try { if (npcPath) npc = getJson(files, npcPath); } catch (_) { /* */ }
      try { if (relPath) rel = getJson(files, relPath); } catch (_) { /* */ }
      try { if (custPath) cust = getJson(files, custPath); } catch (_) { /* */ }
      rows.push({
        name: folder.name,
        npcPath,
        relPath,
        custPath,
        id: (npc && npc.ID) || "",
        dataType: (npc && npc.DataType) || "",
        recruited: !!(npc && npc.Recruited),
        hasRecruitedField: !!(npc && Object.prototype.hasOwnProperty.call(npc, "Recruited")),
        relation: rel && rel.RelationDelta != null ? Number(rel.RelationDelta) : null,
        unlocked: rel ? !!rel.Unlocked : null,
        dependence: cust && cust.Dependence != null ? Number(cust.Dependence) : null,
        isCustomer: !!custPath,
        isSupplier: !!(npc && /Supplier/i.test(npc.DataType || "")),
        isDealer: !!(npc && (/Dealer/i.test(npc.DataType || "") || npc.Recruited)),
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  function updateNpc(files, row, patch) {
    if (row.npcPath && (patch.recruited != null || patch.ensureRecruitedField)) {
      const npc = getJson(files, row.npcPath);
      if (npc) {
        if (patch.recruited != null) {
          npc.Recruited = !!patch.recruited;
        } else if (patch.ensureRecruitedField && !Object.prototype.hasOwnProperty.call(npc, "Recruited")) {
          npc.Recruited = false;
        }
        flushJson(files, row.npcPath);
      }
    }
    if (row.relPath && (patch.relation != null || patch.unlocked != null)) {
      const rel = getJson(files, row.relPath);
      if (rel) {
        if (patch.relation != null) rel.RelationDelta = Number(patch.relation);
        if (patch.unlocked != null) rel.Unlocked = !!patch.unlocked;
        flushJson(files, row.relPath);
      }
    }
    if (row.custPath && patch.dependence != null) {
      const cust = getJson(files, row.custPath);
      if (cust) {
        cust.Dependence = Number(patch.dependence);
        flushJson(files, row.custPath);
      }
    }
  }

  function readAppearance(files) {
    const data = getJson(files, KEY_FILES.appearance);
    if (!data) return null;
    const skin =
      data.SkinColor || data.Skincolour || data.skinColor || data.Skin || null;
    return {
      data,
      gender: data.Gender != null ? data.Gender : data.gender,
      weight: data.Weight != null ? data.Weight : data.weight,
      skin,
    };
  }

  function writeAppearance(files, patch) {
    const data = getJson(files, KEY_FILES.appearance);
    if (!data) return false;
    if (patch.gender != null) {
      if ("Gender" in data || !("gender" in data)) data.Gender = Number(patch.gender);
      else data.gender = Number(patch.gender);
    }
    if (patch.weight != null) {
      if ("Weight" in data || !("weight" in data)) data.Weight = Number(patch.weight);
      else data.weight = Number(patch.weight);
    }
    if (patch.skin) {
      const key = ("SkinColor" in data) ? "SkinColor"
        : ("Skincolour" in data) ? "Skincolour"
          : ("skinColor" in data) ? "skinColor"
            : "SkinColor";
      data[key] = { ...(typeof data[key] === "object" && data[key] ? data[key] : {}), ...patch.skin };
    }
    flushJson(files, KEY_FILES.appearance);
    return true;
  }

  function floatRgbToHex(c) {
    if (!c) return "#c4a484";
    const to8 = (v) => {
      const n = Number(v);
      if (Number.isNaN(n)) return 128;
      return n <= 1 ? Math.round(n * 255) : Math.round(n);
    };
    return "#" + [to8(c.r), to8(c.g), to8(c.b)].map((x) =>
      Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")
    ).join("");
  }

  function hexToFloatRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return { r: 0.77, g: 0.64, b: 0.52 };
    const n = parseInt(m[1], 16);
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  function listQuests(files) {
    const out = [];
    for (const key of Object.keys(files)) {
      const n = normalizePath(key);
      const looksQuest = /quest/i.test(n) || /Quest/.test(n);
      let data;
      try {
        data = getJson(files, key);
      } catch (_) {
        continue;
      }
      if (!data || typeof data !== "object") continue;
      const type = String(data.DataType || "");
      if (!looksQuest && !/quest/i.test(type)) continue;

      // Collection file with Entries / Quests arrays
      const arrays = ["Quests", "Entries", "ActiveQuests", "CompletedQuests", "QuestEntries"];
      let handled = false;
      for (const arrKey of arrays) {
        if (!Array.isArray(data[arrKey])) continue;
        handled = true;
        data[arrKey].forEach((q, index) => {
          if (!q || typeof q !== "object") return;
          out.push(normalizeQuestRow(key, arrKey, index, q));
        });
      }
      if (handled) continue;

      if (
        "State" in data || "Status" in data || "Completed" in data ||
        "QuestState" in data || "Objectives" in data || /quest/i.test(type)
      ) {
        out.push(normalizeQuestRow(key, null, null, data));
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function normalizeQuestRow(path, arrayKey, index, q) {
    const state = q.State != null ? q.State
      : q.QuestState != null ? q.QuestState
        : q.Status != null ? q.Status
          : q.Completed === true ? 2
            : q.Completed === false ? 0
              : null;
    return {
      path,
      arrayKey,
      index,
      name: q.Name || q.Title || q.ID || q.QuestID || prettyNameFromPath(path),
      id: q.ID || q.QuestID || "",
      state,
      completed: q.Completed === true || state === 2,
      raw: q,
    };
  }

  function setQuestState(files, row, state) {
    const data = getJson(files, row.path);
    if (!data) return false;
    const target = row.arrayKey != null ? data[row.arrayKey][row.index] : data;
    if (!target) return false;
    if ("State" in target) target.State = state;
    else if ("QuestState" in target) target.QuestState = state;
    else if ("Status" in target) target.Status = state;
    if ("Completed" in target) target.Completed = state === 2;
    // Objectives: mark complete if present
    if (state === 2 && Array.isArray(target.Objectives)) {
      target.Objectives = target.Objectives.map((o) => {
        if (!o || typeof o !== "object") return o;
        const copy = { ...o };
        if ("Completed" in copy) copy.Completed = true;
        if ("State" in copy) copy.State = 2;
        return copy;
      });
    }
    flushJson(files, row.path);
    return true;
  }

  function completeAllQuests(files) {
    let n = 0;
    for (const row of listQuests(files)) {
      if (setQuestState(files, row, 2)) n += 1;
    }
    return n;
  }

  function listVehicles(files) {
    const data = getJson(files, KEY_FILES.vehicles);
    if (!data) return { present: false, vehicles: [], raw: null };
    const vehicles = [];
    const pushVeh = (v, index, source) => {
      if (!v || typeof v !== "object") return;
      vehicles.push({
        index,
        source,
        name: v.Name || v.VehicleCode || v.Code || v.ID || ("Vehicle " + (index + 1)),
        code: v.VehicleCode || v.Code || v.ID || "",
        guid: v.GUID || v.Guid || "",
      });
    };
    if (Array.isArray(data)) {
      data.forEach((v, i) => pushVeh(v, i, "root"));
    } else if (Array.isArray(data.Vehicles)) {
      data.Vehicles.forEach((v, i) => pushVeh(v, i, "Vehicles"));
    } else if (Array.isArray(data.OwnedVehicles)) {
      data.OwnedVehicles.forEach((v, i) => pushVeh(v, i, "OwnedVehicles"));
    } else {
      // Treat as opaque blob — still allow snapshot/restore
      vehicles.push({ index: 0, source: "opaque", name: "OwnedVehicles blob", code: "", guid: "" });
    }
    return { present: true, vehicles, raw: data };
  }

  function vehicleSnapshotKey(folderName, orgName) {
    return "s1_vehicle_snap_" + String(folderName || "SaveGame") + "_" + String(orgName || "org");
  }

  function saveVehicleSnapshot(files, folderName) {
    const key = findFile(files, KEY_FILES.vehicles);
    if (!key) throw new Error("No OwnedVehicles.json in this save.");
    const entry = files[key];
    if (entry.data != null) flushJson(files, key);
    const game = getJson(files, KEY_FILES.game);
    const org = (game && game.OrganisationName) || "org";
    const snapKey = vehicleSnapshotKey(folderName, org);
    const payload = {
      savedAt: new Date().toISOString(),
      folderName,
      org,
      text: entry.text,
    };
    localStorage.setItem(snapKey, JSON.stringify(payload));
    return payload;
  }

  function restoreVehicleSnapshot(files, folderName) {
    const game = getJson(files, KEY_FILES.game);
    const org = (game && game.OrganisationName) || "org";
    const snapKey = vehicleSnapshotKey(folderName, org);
    const raw = localStorage.getItem(snapKey);
    if (!raw) throw new Error("No vehicle snapshot saved yet for this org/slot.");
    const payload = JSON.parse(raw);
    const data = parseJsonText(payload.text, "vehicle snapshot");
    setEntryData(files, KEY_FILES.vehicles, data);
    return payload;
  }

  function listCreatedProducts(files) {
    const out = [];
    // Products/CreatedProducts/*.json
    for (const key of Object.keys(files)) {
      if (!/^Products\/CreatedProducts\/[^/]+\.json$/i.test(normalizePath(key))) continue;
      let data;
      try { data = getJson(files, key); } catch (_) { continue; }
      if (!data || typeof data !== "object") continue;
      out.push({
        path: key,
        source: "file",
        name: data.Name || prettyNameFromPath(key),
        id: data.ID || "",
        drugType: data.DrugType,
        properties: Array.isArray(data.Properties) ? data.Properties.slice() : [],
        mainColor: data.AppearanceSettings && data.AppearanceSettings.MainColor
          ? { ...data.AppearanceSettings.MainColor } : null,
        secondaryColor: data.AppearanceSettings && data.AppearanceSettings.SecondaryColor
          ? { ...data.AppearanceSettings.SecondaryColor } : null,
      });
    }
    // Arrays inside Products.json (CreatedWeed / CreatedMeth / CreatedCocaine / MixRecipes with Name)
    const products = getJson(files, KEY_FILES.products);
    if (products) {
      for (const key of Object.keys(products)) {
        if (!Array.isArray(products[key])) continue;
        products[key].forEach((item, index) => {
          if (!item || typeof item !== "object") return;
          if (typeof item.Name !== "string" && typeof item.ID !== "string") return;
          if (!Array.isArray(item.Properties) && !item.AppearanceSettings) return;
          out.push({
            path: KEY_FILES.products,
            source: key,
            index,
            name: item.Name || "",
            id: item.ID || "",
            drugType: item.DrugType,
            properties: Array.isArray(item.Properties) ? item.Properties.slice() : [],
            mainColor: item.AppearanceSettings && item.AppearanceSettings.MainColor
              ? { ...item.AppearanceSettings.MainColor } : null,
            secondaryColor: item.AppearanceSettings && item.AppearanceSettings.SecondaryColor
              ? { ...item.AppearanceSettings.SecondaryColor } : null,
          });
        });
      }
    }
    return out;
  }

  function updateCreatedProduct(files, row, patch) {
    if (row.source === "file") {
      const data = getJson(files, row.path);
      if (!data) return false;
      if (patch.name != null) data.Name = String(patch.name);
      if (patch.properties) data.Properties = patch.properties.slice();
      if (patch.mainColor) {
        data.AppearanceSettings = data.AppearanceSettings || {};
        data.AppearanceSettings.MainColor = { ...(data.AppearanceSettings.MainColor || {}), ...patch.mainColor };
      }
      if (patch.secondaryColor) {
        data.AppearanceSettings = data.AppearanceSettings || {};
        data.AppearanceSettings.SecondaryColor = { ...(data.AppearanceSettings.SecondaryColor || {}), ...patch.secondaryColor };
      }
      flushJson(files, row.path);
      return true;
    }
    const products = getJson(files, KEY_FILES.products);
    if (!products || !Array.isArray(products[row.source])) return false;
    const item = products[row.source][row.index];
    if (!item) return false;
    if (patch.name != null) item.Name = String(patch.name);
    if (patch.properties) item.Properties = patch.properties.slice();
    if (patch.mainColor && item.AppearanceSettings) {
      item.AppearanceSettings.MainColor = { ...(item.AppearanceSettings.MainColor || {}), ...patch.mainColor };
    }
    if (patch.secondaryColor && item.AppearanceSettings) {
      item.AppearanceSettings.SecondaryColor = { ...(item.AppearanceSettings.SecondaryColor || {}), ...patch.secondaryColor };
    }
    flushJson(files, KEY_FILES.products);
    return true;
  }

  function discoverProducts(files, ids) {
    const products = getJson(files, KEY_FILES.products);
    if (!products) return 0;
    if (!Array.isArray(products.DiscoveredProducts)) products.DiscoveredProducts = [];
    let n = 0;
    for (const id of ids) {
      if (!products.DiscoveredProducts.includes(id)) {
        products.DiscoveredProducts.push(id);
        n += 1;
      }
    }
    flushJson(files, KEY_FILES.products);
    return n;
  }

  function rgbaToHex(c) {
    if (!c) return "#888888";
    const r = Math.round(Number(c.r) || 0);
    const g = Math.round(Number(c.g) || 0);
    const b = Math.round(Number(c.b) || 0);
    // Created products often use 0-255; if values look like 0-1 floats, scale
    if (r <= 1 && g <= 1 && b <= 1 && (Number(c.r) <= 1)) {
      return floatRgbToHex(c);
    }
    return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
  }

  function hexToRgba(hex, a = 255) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return { r: 128, g: 128, b: 128, a };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }

  /** Walk property/business object graphs + standalone rack Data.json files. */
  function listStorageRacks(files) {
    const racks = [];

    function considerContents(path, locator, contents, mutate, meta = {}) {
      if (!contents || !Array.isArray(contents.Items)) return;
      racks.push({
        path,
        locator,
        label: locator,
        isRackLike: meta.isRackLike !== false,
        slots: contents.Items.map((raw, index) => {
          const s = parseItemSlot(raw);
          return { index, id: s.id, quantity: s.quantity };
        }),
        mutate,
      });
    }

    // Standalone Data.json under Objects/*storagerack*
    for (const key of Object.keys(files)) {
      const n = normalizePath(key);
      if (!/storagerack/i.test(n) || !/Data\.json$/i.test(n)) continue;
      let data;
      try { data = getJson(files, key); } catch (_) { continue; }
      if (!data || !data.Contents) continue;
      considerContents(key, prettyNameFromPath(n.replace(/\/Data\.json$/i, "")), data.Contents, (items) => {
        data.Contents.Items = items;
        flushJson(files, key);
      }, { isRackLike: true });
    }

    // Property JSON with Objects[].BaseData nested Contents
    for (const key of Object.keys(files)) {
      const n = normalizePath(key);
      if (!(/^Properties\//i.test(n) || /^Businesses\//i.test(n))) continue;
      if (!/\.json$/i.test(n)) continue;
      if (/\/Objects\//i.test(n)) continue;
      let data;
      try { data = getJson(files, key); } catch (_) { continue; }
      if (!data || !Array.isArray(data.Objects)) continue;
      data.Objects.forEach((obj, objIndex) => {
        if (!obj || typeof obj.BaseData !== "string") return;
        const base = safeParse(obj.BaseData);
        if (!base || !base.Contents || !Array.isArray(base.Contents.Items)) return;
        const itemStr = safeParse(base.ItemString || "{}") || {};
        const rackName = itemStr.ID || base.DataType || ("object-" + objIndex);
        const idBlob = String(rackName);
        const typeBlob = String(base.DataType || "") + " " + String(obj.DataType || "");
        const isRackLike = /storagerack|rack|shelf|cabinet|locker|filingcabinet/i.test(idBlob);
        const isPlaceableStorage = /PlaceableStorage/i.test(typeBlob);
        if (!isRackLike && !isPlaceableStorage) return;
        considerContents(
          key,
          prettyNameFromPath(key) + " / " + rackName,
          base.Contents,
          (items) => {
            base.Contents.Items = items;
            obj.BaseData = JSON.stringify(base);
            flushJson(files, key);
          },
          { isRackLike }
        );
      });
    }

    return racks;
  }

  function fillStorageRack(rack, kitItems, gameVersion) {
    const items = rack.slots.map((s, i) => {
      // preserve existing structure via mutate path — rebuild strings
      return makeItemString("", 0, gameVersion);
    });
    const limit = Math.min(items.length, kitItems.length);
    for (let i = 0; i < limit; i++) {
      items[i] = makeItemString(kitItems[i].id, kitItems[i].qty, gameVersion);
    }
    rack.mutate(items);
  }

  function fillAllStorage(files, kitItems) {
    const gv = guessGameVersion(files);
    const racks = listStorageRacks(files).filter((r) => r.isRackLike);
    for (const rack of racks) fillStorageRack(rack, kitItems, gv);
    return racks.length;
  }

  function listProducts(products) {
    return listCreatedProducts({ [KEY_FILES.products]: { text: "", data: products, dirty: false } })
      .filter((p) => p.source !== "file");
  }

  function updateProduct(products, source, index, patch) {
    // legacy shim used by older app paths
    if (!products || !Array.isArray(products[source])) return false;
    const item = products[source][index];
    if (!item || typeof item !== "object") return false;
    if (patch.name != null) item.Name = String(patch.name);
    if (patch.properties) item.Properties = patch.properties.slice();
    if (patch.mainColor && item.AppearanceSettings) {
      item.AppearanceSettings.MainColor = { ...(item.AppearanceSettings.MainColor || {}), ...patch.mainColor };
    }
    if (patch.secondaryColor && item.AppearanceSettings) {
      item.AppearanceSettings.SecondaryColor = { ...(item.AppearanceSettings.SecondaryColor || {}), ...patch.secondaryColor };
    }
    return true;
  }

  window.Schedule1Save = {
    RANKS,
    TIER_LABELS,
    KEY_FILES,
    normalizePath,
    parseJsonText,
    serializeJson,
    safeParse,
    isScheduleSave,
    findFile,
    getJson,
    ensureFile,
    markDirty,
    flushJson,
    flushAll,
    setEntryData,
    tierXpCost,
    totalXpForRankTier,
    rankLabel,
    guessGameVersion,
    parseItemSlot,
    writeItemSlot,
    makeItemString,
    getCashBalance,
    setCashBalance,
    listInventorySlots,
    setInventorySlot,
    listOwnership,
    setOwned,
    ownAll,
    listNpcs,
    updateNpc,
    readAppearance,
    writeAppearance,
    floatRgbToHex,
    hexToFloatRgb,
    listQuests,
    setQuestState,
    completeAllQuests,
    listVehicles,
    saveVehicleSnapshot,
    restoreVehicleSnapshot,
    listCreatedProducts,
    updateCreatedProduct,
    discoverProducts,
    listProducts,
    updateProduct,
    listStorageRacks,
    fillStorageRack,
    fillAllStorage,
    rgbaToHex,
    hexToRgba,
    buildFromFileList,
    buildFromZip,
    toZipBlob,
    dirtyCount,
  };
})();
