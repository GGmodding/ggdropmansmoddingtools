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
    // Allow nested SaveGame_*/ prefix leftovers
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

  function tierXpCost(rankId, tier) {
    const rank = RANKS.find((r) => r.id === rankId);
    if (!rank) return 0;
    const t = Math.max(1, Math.min(5, tier | 0));
    if (Array.isArray(rank.xpPerTier)) return rank.xpPerTier[t - 1] || rank.xpPerTier[0];
    return rank.xpPerTier;
  }

  /** TotalXP at the start of a given rank/tier (XP into current tier = 0). */
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

  function getCashBalance(inventory) {
    if (!inventory || !Array.isArray(inventory.Items)) return 0;
    for (const raw of inventory.Items) {
      if (typeof raw !== "string") continue;
      try {
        const item = JSON.parse(raw);
        if (item && (item.DataType === "CashData" || item.ID === "cash") && typeof item.CashBalance === "number") {
          return item.CashBalance;
        }
      } catch (_) { /* skip */ }
    }
    return 0;
  }

  function setCashBalance(inventory, value) {
    if (!inventory) return false;
    if (!Array.isArray(inventory.Items)) inventory.Items = [];
    const amount = Number(value) || 0;
    let found = false;
    for (let i = 0; i < inventory.Items.length; i++) {
      const raw = inventory.Items[i];
      if (typeof raw !== "string") continue;
      try {
        const item = JSON.parse(raw);
        if (item && (item.DataType === "CashData" || item.ID === "cash")) {
          item.CashBalance = amount;
          item.Quantity = item.Quantity > 0 ? item.Quantity : 1;
          item.ID = item.ID || "cash";
          item.DataType = "CashData";
          inventory.Items[i] = JSON.stringify(item);
          found = true;
          break;
        }
      } catch (_) { /* skip */ }
    }
    if (!found) {
      const template = inventory.Items.find((x) => typeof x === "string" && x.includes("GameVersion"));
      let gameVersion = "0.3.5f3";
      if (template) {
        try {
          const t = JSON.parse(template);
          if (t.GameVersion) gameVersion = t.GameVersion;
        } catch (_) { /* keep default */ }
      }
      inventory.Items.push(JSON.stringify({
        DataType: "CashData",
        DataVersion: 0,
        GameVersion: gameVersion,
        ID: "cash",
        Quantity: 1,
        CashBalance: amount,
      }));
    }
    return true;
  }

  function listProducts(products) {
    if (!products || typeof products !== "object") return [];
    const out = [];
    const arrays = [];
    for (const key of Object.keys(products)) {
      if (Array.isArray(products[key])) arrays.push({ key, arr: products[key] });
    }
    for (const { key, arr } of arrays) {
      arr.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        if (typeof item.Name !== "string" && typeof item.ID !== "string") return;
        out.push({
          source: key,
          index,
          name: item.Name || "",
          id: item.ID || "",
          drugType: item.DrugType,
          properties: Array.isArray(item.Properties) ? item.Properties.slice() : [],
          mainColor: item.AppearanceSettings && item.AppearanceSettings.MainColor
            ? { ...item.AppearanceSettings.MainColor }
            : null,
          secondaryColor: item.AppearanceSettings && item.AppearanceSettings.SecondaryColor
            ? { ...item.AppearanceSettings.SecondaryColor }
            : null,
        });
      });
    }
    // Deduplicate by id+name if same product appears in multiple lists
    const seen = new Set();
    return out.filter((p) => {
      const sig = p.source + ":" + p.index;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  function updateProduct(products, source, index, patch) {
    if (!products || !Array.isArray(products[source])) return false;
    const item = products[source][index];
    if (!item || typeof item !== "object") return false;
    if (patch.name != null) item.Name = String(patch.name);
    if (patch.mainColor && item.AppearanceSettings) {
      item.AppearanceSettings.MainColor = {
        ...(item.AppearanceSettings.MainColor || {}),
        ...patch.mainColor,
      };
    }
    if (patch.secondaryColor && item.AppearanceSettings) {
      item.AppearanceSettings.SecondaryColor = {
        ...(item.AppearanceSettings.SecondaryColor || {}),
        ...patch.secondaryColor,
      };
    }
    return true;
  }

  function rgbaToHex(c) {
    if (!c) return "#888888";
    const r = Math.round(Number(c.r) || 0);
    const g = Math.round(Number(c.g) || 0);
    const b = Math.round(Number(c.b) || 0);
    return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
  }

  function hexToRgba(hex, a = 255) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return { r: 128, g: 128, b: 128, a };
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  }

  function buildFromFileList(fileEntries) {
    // fileEntries: [{ relativePath, text }]
    const paths = fileEntries.map((f) => f.relativePath);
    const root = detectCommonRoot(paths);
    const files = {};
    for (const f of fileEntries) {
      let rel = stripRootPrefix(f.relativePath, root);
      if (!rel || !/\.json$/i.test(rel)) continue;
      // If user selected parent Saves folder, keep SaveGame_N/... paths
      if (/^SaveGame_\d+\//i.test(rel)) {
        // Prefer deepest single SaveGame if only one
      }
      files[normalizePath(rel)] = { text: f.text, data: null, dirty: false };
    }

    // Unwrap SaveGame_* so KEY_FILES paths resolve. If several slots were loaded, keep the lowest number.
    const topFolders = [...new Set(
      Object.keys(files).map((k) => k.split("/")[0]).filter((p) => /^SaveGame_\d+$/i.test(p))
    )].sort((a, b) => {
      const na = Number((a.match(/(\d+)/) || [])[1]) || 0;
      const nb = Number((b.match(/(\d+)/) || [])[1]) || 0;
      return na - nb;
    });

    let slotName = root && /^SaveGame_\d+$/i.test(root) ? root : null;
    if (topFolders.length) {
      slotName = topFolders[0];
      const unwrapped = {};
      for (const [k, v] of Object.entries(files)) {
        if (!k.startsWith(slotName + "/")) continue;
        const next = k.slice(slotName.length + 1);
        if (next) unwrapped[next] = v;
      }
      if (Object.keys(unwrapped).length) {
        Object.keys(files).forEach((k) => delete files[k]);
        Object.assign(files, unwrapped);
      }
    }

    if (!isScheduleSave(files)) {
      throw new Error("Not a Schedule I save — need Money.json / Rank.json / Game.json from a SaveGame folder.");
    }
    return { files, rootName: slotName || root || "SaveGame_1" };
  }

  async function buildFromZip(arrayBuffer) {
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
    return buildFromFileList(entries);
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

  window.Schedule1Save = {
    RANKS,
    TIER_LABELS,
    KEY_FILES,
    normalizePath,
    parseJsonText,
    serializeJson,
    isScheduleSave,
    findFile,
    getJson,
    ensureFile,
    markDirty,
    flushJson,
    flushAll,
    tierXpCost,
    totalXpForRankTier,
    rankLabel,
    getCashBalance,
    setCashBalance,
    listProducts,
    updateProduct,
    rgbaToHex,
    hexToRgba,
    buildFromFileList,
    buildFromZip,
    toZipBlob,
    dirtyCount,
  };
})();
