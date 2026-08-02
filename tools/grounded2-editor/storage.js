(() => {
  "use strict";

  const C = window.GroundedCsav;
  const Inv = window.GroundedInventory;

  const FULL_TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
  const INV_PATH = "/Script/Maine.InventoryComponent";

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 300 || off + 4 + len > buf.length) return null;
    const raw = buf.subarray(off + 4, off + 4 + len - 1);
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== 0 && (c < 32 || c > 126)) return null;
    }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    return { s, next: off + 4 + len, len };
  }

  function indexOfAscii(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from || 0); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function findAll(buf, ascii) {
    const hits = [];
    let i = 0;
    while (true) {
      const at = indexOfAscii(buf, ascii, i);
      if (at < 0) break;
      hits.push(at);
      i = at + 1;
    }
    return hits;
  }

  function shortLabel(pathOrName) {
    const s = String(pathOrName || "Storage");
    const m = s.match(/BP_([A-Za-z0-9_]+)/);
    if (m) return m[1].replace(/_C$/, "");
    if (s.length < 40 && /^[A-Za-z]/.test(s)) return s;
    return "Storage";
  }

  function findStorageMeta(buf, invAt) {
    let building = null;
    let customName = null;
    for (let o = invAt - 4; o > Math.max(0, invAt - 600); o--) {
      const fs = readFString(buf, o);
      if (!fs) continue;
      if (
        !building &&
        /\/Buildings\/Storage\/|BP_Storage|BP_.*Chest|BP_.*Basket|BP_.*Fridge|BP_.*Crate|BP_.*Pallet|BP_.*Box/i.test(
          fs.s
        )
      ) {
        building = fs.s;
      }
      if (
        !customName &&
        fs.s.length >= 2 &&
        fs.s.length <= 40 &&
        /^[A-Za-z0-9][A-Za-z0-9 _'-]*$/.test(fs.s) &&
        !/^None$|^BP_|^\/Game|^\/Script|^Table_/i.test(fs.s) &&
        !/Component$/i.test(fs.s)
      ) {
        // Prefer names that look like player-renamed storage (spaces / mixed case)
        if (/\s/.test(fs.s) || /gear|chest|box|loot|stuff|storage/i.test(fs.s)) {
          customName = fs.s;
        }
      }
      if (building && customName) break;
    }
    return { building, customName };
  }

  function readCountHeader(buf, invAt) {
    // G2: /Script/…InventoryComponent + FString "InventoryComponent" then optional pad + count
    let dataAt = invAt + INV_PATH.length + 1;
    const shortLen = new DataView(buf.buffer, buf.byteOffset + dataAt, 4).getInt32(0, true);
    if (shortLen > 1 && shortLen < 64 && dataAt + 4 + shortLen <= buf.length) {
      dataAt = dataAt + 4 + shortLen;
    }
    if (dataAt + 5 > buf.length) return { countOff: -1, count: 0, editable: false };
    let countOff = dataAt;
    let count = C.readU32(buf, countOff);
    if ((count > 500 || count === 0) && buf[dataAt] === 0) {
      countOff = dataAt + 1;
      count = C.readU32(buf, countOff);
    }
    const editable = count >= 0 && count <= 500;
    return { countOff: editable ? countOff : -1, count: editable ? count : 0, editable };
  }

  function parseItemsInRange(buf, from, to, maxItems) {
    const items = [];
    const limit =
      typeof maxItems === "number" && maxItems > 0 ? maxItems : 500;
    let i = from;
    while (items.length < limit && i < to) {
      const at = indexOfAscii(buf, FULL_TABLE, i);
      if (at < 0 || at >= to) break;
      const pathLenOff = at - 4;
      if (pathLenOff < from) {
        i = at + 1;
        continue;
      }
      if (!Inv || typeof Inv.parseItemRecord !== "function") break;
      const rec = Inv.parseItemRecord(buf, pathLenOff, to);
      if (!rec || rec.end > to) {
        i = at + 1;
        continue;
      }
      items.push(rec);
      i = rec.end; // skip whole record — avoid nested false Table_AllItems hits
    }
    return items;
  }

  function listStorages(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const hits = findAll(buf, INV_PATH);
    const storages = [];
    for (let hi = 0; hi < hits.length; hi++) {
      const invAt = hits[hi];
      const end = hits[hi + 1] || Math.min(buf.length, invAt + 120000);
      const meta = findStorageMeta(buf, invAt);
      const hdr = readCountHeader(buf, invAt);
      const isBuildingStorage = !!(
        meta.building &&
        /Storage|Chest|Basket|Fridge|Crate|Pallet|Box/i.test(meta.building)
      );
      // Prefer header count when sane; otherwise scan until next inventory
      const maxItems = hdr.editable && hdr.count > 0 ? hdr.count : 0;
      const items = parseItemsInRange(
        buf,
        invAt,
        end,
        maxItems > 0 ? maxItems : 200
      );
      if (!isBuildingStorage && !meta.customName && items.length === 0) continue;
      // Drop non-storage actors that only have a stray item scrape
      if (!isBuildingStorage && !meta.customName && items.length > 0) {
        // Keep small inventories (key holders / stations) that parse cleanly
        if (items.length > 12) continue;
      }
      const label =
        meta.customName || shortLabel(meta.building) || "Storage " + (hi + 1);
      storages.push({
        index: storages.length,
        invIndex: hi,
        invAt,
        end,
        label,
        building: meta.building ? shortLabel(meta.building) : null,
        customName: meta.customName,
        count: hdr.count,
        countOff: hdr.countOff,
        editableCount: hdr.editable && hdr.countOff >= 0,
        itemCount: items.length,
        items,
      });
    }
    return { ok: storages.length > 0, storages, size: buf.length };
  }

  function getStorage(rawWorld, storageIndex) {
    const listed = listStorages(rawWorld);
    if (!listed.ok || storageIndex < 0 || storageIndex >= listed.storages.length) {
      throw new Error("Storage not found.");
    }
    return listed.storages[storageIndex];
  }

  function removeStorageItem(rawWorld, storageIndex, itemIndex) {
    const buf = new Uint8Array(C.toBytes(rawWorld));
    const st = getStorage(buf, storageIndex);
    if (itemIndex < 0 || itemIndex >= st.items.length) {
      throw new Error("Storage item not found.");
    }
    if (st.items.length <= 0) throw new Error("Storage is empty.");
    const it = st.items[itemIndex];
    const out = new Uint8Array(buf.length - it.size);
    out.set(buf.subarray(0, it.start), 0);
    out.set(buf.subarray(it.end), it.start);
    if (st.editableCount && st.countOff >= 0) {
      const next = Math.max(0, st.count - 1);
      C.writeU32(out, st.countOff, next);
    }
    return { bytes: out, removed: it.name, storage: st.label };
  }

  function setStorageStack(rawWorld, storageIndex, itemIndex, stackCount) {
    const buf = new Uint8Array(C.toBytes(rawWorld));
    const st = getStorage(buf, storageIndex);
    const it = st.items[itemIndex];
    if (!it) throw new Error("Storage item not found.");
    if (it.stackOff < 0) throw new Error("Stack offset not found for " + it.name);
    const qty = Math.max(1, Math.min(9999, Math.floor(Number(stackCount) || 1)));
    new DataView(buf.buffer, buf.byteOffset + it.stackOff, 4).setInt32(0, qty, true);
    return { bytes: buf, name: it.name, stack: qty, storage: st.label };
  }

  function addStorageItem(rawWorld, storageIndex, itemName, stackCount) {
    if (!Inv || typeof Inv.addInventoryItem !== "function") {
      throw new Error("Inventory helpers not loaded.");
    }
    const name = String(itemName || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(name)) {
      throw new Error("Invalid item id.");
    }
    const qty = Math.max(1, Math.min(9999, Math.floor(Number(stackCount) || 1)));
    let buf = new Uint8Array(C.toBytes(rawWorld));
    let st = getStorage(buf, storageIndex);

    // Bump existing stack in this storage
    const existing = st.items.findIndex((x) => x.name === name && x.stackOff >= 0);
    if (existing >= 0) {
      const it = st.items[existing];
      const next = Math.min(9999, it.stack + qty);
      new DataView(buf.buffer, buf.byteOffset + it.stackOff, 4).setInt32(0, next, true);
      return {
        bytes: buf,
        added: name,
        stack: next,
        mode: "stack",
        storage: st.label,
      };
    }

    if (!st.items.length) {
      throw new Error(
        "Empty storage has no clone template. Put one item in-game first, or pick a non-empty chest."
      );
    }

    // Prefer a simple stackable record as template (last item is often a complex leftover)
    const prefs = (Inv && Inv.TEMPLATE_PREFS) || [];
    let tmpl = null;
    for (const pref of prefs) {
      tmpl = st.items.find((x) => x.name === pref && x.stackOff >= 0);
      if (tmpl) break;
    }
    if (!tmpl) {
      const simple = st.items
        .filter(
          (x) =>
            x.stackOff >= 0 &&
            x.size >= 130 &&
            x.size <= 220 &&
            x.mid === "None" &&
            x.enhancement === "None"
        )
        .sort((a, b) => a.size - b.size);
      tmpl = simple[0] || st.items.find((x) => x.stackOff >= 0);
    }
    if (!tmpl) {
      throw new Error(
        "No stackable template item in this storage. Add a simple material in-game first."
      );
    }

    const prevCount = st.count;
    const prevItems = st.items.length;
    const countOff = st.countOff;
    const editableCount = st.editableCount;
    const slice = buf.slice(tmpl.start, tmpl.end);
    const insertAt = st.items[st.items.length - 1].end;
    let out = new Uint8Array(buf.length + slice.length);
    out.set(buf.subarray(0, insertAt), 0);
    out.set(slice, insertAt);
    out.set(buf.subarray(insertAt), insertAt + slice.length);

    // Bump header so the clone is included when count-limited parsers re-scan
    if (editableCount && countOff >= 0) {
      C.writeU32(out, countOff, Math.max(prevCount, prevItems) + 1);
    }

    st = getStorage(out, storageIndex);
    const clone =
      st.items.find((x) => x.start === insertAt) ||
      st.items[st.items.length - 1];
    if (!clone) throw new Error("Clone failed.");

    // Local FString replace
    const encodedName = (() => {
      const s = name;
      const u = new Uint8Array(4 + s.length + 1);
      C.writeU32(u, 0, s.length + 1);
      for (let i = 0; i < s.length; i++) u[4 + i] = s.charCodeAt(i);
      return u;
    })();
    const oldBytes = 4 + clone.nameLen;
    const delta = encodedName.length - oldBytes;
    const cloneStart = clone.start;
    if (delta === 0) {
      out.set(encodedName, clone.nameOff);
    } else {
      const grown = new Uint8Array(out.length + delta);
      grown.set(out.subarray(0, clone.nameOff), 0);
      grown.set(encodedName, clone.nameOff);
      grown.set(out.subarray(clone.nameOff + oldBytes), clone.nameOff + encodedName.length);
      out = grown;
    }

    st = getStorage(out, storageIndex);
    const renamed =
      st.items.find((x) => x.start === cloneStart && x.name === name) ||
      st.items.find((x) => x.name === name && x.start >= cloneStart - 4) ||
      st.items.filter((x) => x.name === name).pop();
    if (!renamed || renamed.name !== name) {
      throw new Error("Clone rename failed for " + name);
    }
    if (renamed.guidOff >= 0 && renamed.guidOff + 16 <= out.length) {
      const g = new Uint8Array(16);
      if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(g);
      else for (let i = 0; i < 16; i++) g[i] = (Math.random() * 256) | 0;
      out.set(g, renamed.guidOff);
    }
    if (renamed.stackOff < 0) {
      throw new Error("Clone has no stack field for " + name);
    }
    new DataView(out.buffer, out.byteOffset + renamed.stackOff, 4).setInt32(0, qty, true);

    if (editableCount && countOff >= 0) {
      st = getStorage(out, storageIndex);
      C.writeU32(out, countOff, st.items.length);
    }

    st = getStorage(out, storageIndex);
    const final =
      st.items.find((x) => x.start === cloneStart && x.name === name) ||
      st.items.filter((x) => x.name === name).pop();

    return {
      bytes: out,
      added: name,
      stack: final ? final.stack : qty,
      mode: "clone",
      storage: st.label,
      count: st.items.length,
    };
  }

  function duplicateItemToAllChests(rawWorld, itemName, stackCount) {
    const name = String(itemName || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(name)) {
      throw new Error("Invalid item id.");
    }
    const qty = Math.max(1, Math.min(9999, Math.floor(Number(stackCount) || 1)));
    let buf = new Uint8Array(C.toBytes(rawWorld));
    const listed = listStorages(buf);
    let touched = 0;
    let skipped = 0;
    for (let i = 0; i < listed.storages.length; i++) {
      const st = listed.storages[i];
      if (!st.items.length) {
        skipped++;
        continue;
      }
      try {
        // Re-resolve index after prior mutations
        const now = listStorages(buf);
        const match = now.storages.find(
          (s) => s.invAt === st.invAt || s.label === st.label
        );
        if (!match || !match.items.length) {
          skipped++;
          continue;
        }
        const r = addStorageItem(buf, match.index, name, qty);
        buf = new Uint8Array(r.bytes);
        touched++;
      } catch (_) {
        skipped++;
      }
    }
    return { bytes: buf, touched, skipped, item: name, stack: qty };
  }

  window.GroundedStorage = {
    listStorages,
    getStorage,
    removeStorageItem,
    setStorageStack,
    addStorageItem,
    duplicateItemToAllChests,
  };
})();
