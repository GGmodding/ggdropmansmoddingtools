(() => {
  "use strict";

  const DB_NAME = "soe-editor-vault";
  const DB_VER = 1;
  const STORE = "items";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          s.createIndex("uniqueId", "uniqueId", { unique: false });
          s.createIndex("code", "code", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
  }

  function reqAs(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function bytesToB64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function metaFromItem(item) {
    return {
      name: (window.SoEItems && window.SoEItems.displayName(item)) || item.code || "item",
      code: item.code || "",
      quality: item.quality || 0,
      uniqueId: item.quality === 7 && item.uniqueId != null ? item.uniqueId : null,
      ethereal: !!item.ethereal,
      sockets: item.sockets || 0,
      raw: Uint8Array.from(item.raw),
      added: Date.now(),
    };
  }

  async function list() {
    const db = await openDb();
    const rows = await reqAs(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    db.close();
    return (rows || []).sort((a, b) => (b.added || 0) - (a.added || 0));
  }

  async function addItem(item) {
    if (!item || !item.raw) throw new Error("Nothing to store");
    const rec = metaFromItem(item);
    const db = await openDb();
    const id = await reqAs(db.transaction(STORE, "readwrite").objectStore(STORE).add(rec));
    db.close();
    rec.id = id;
    return rec;
  }

  async function addMany(items) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const ids = [];
    for (const item of items) {
      if (!item || !item.raw) continue;
      ids.push(reqAs(store.add(metaFromItem(item))));
    }
    await Promise.all(ids);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return ids.length;
  }

  async function remove(id) {
    const db = await openDb();
    await reqAs(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
    db.close();
  }

  async function get(id) {
    const db = await openDb();
    const rec = await reqAs(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
    db.close();
    return rec || null;
  }

  async function clear() {
    const db = await openDb();
    await reqAs(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
    db.close();
  }

  function recordToItem(rec) {
    const raw = rec.raw instanceof Uint8Array ? rec.raw : new Uint8Array(rec.raw);
    return window.SoEItems.parseItem(raw, 0);
  }

  async function exportPayload() {
    const rows = await list();
    return {
      v: 1,
      game: "soe",
      exported: new Date().toISOString(),
      items: rows.map((r) => ({
        name: r.name,
        code: r.code,
        quality: r.quality,
        uniqueId: r.uniqueId,
        ethereal: r.ethereal,
        sockets: r.sockets,
        raw: bytesToB64(r.raw),
      })),
    };
  }

  async function importPayload(payload) {
    if (!payload || !Array.isArray(payload.items)) throw new Error("Not a vault export");
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let n = 0;
    for (const row of payload.items) {
      if (!row || !row.raw) continue;
      const rec = {
        name: row.name || row.code || "item",
        code: row.code || "",
        quality: row.quality || 0,
        uniqueId: row.uniqueId != null ? row.uniqueId : null,
        ethereal: !!row.ethereal,
        sockets: row.sockets || 0,
        raw: b64ToBytes(row.raw),
        added: Date.now(),
      };
      store.add(rec);
      n++;
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return n;
  }

  const api = {
    list,
    addItem,
    addMany,
    remove,
    get,
    clear,
    recordToItem,
    exportPayload,
    importPayload,
    bytesToB64,
    b64ToBytes,
  };

  if (typeof window !== "undefined") window.SoEVault = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
