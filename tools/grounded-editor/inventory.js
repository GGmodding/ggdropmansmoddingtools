(() => {
  "use strict";

  const C = window.GroundedCsav;

  const FULL_TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
  const INV_PATH = "/Script/Maine.InventoryComponent";
  const EQ_PATH = "/Script/Maine.EquipmentComponent";

  const TEMPLATE_PREFS = [
    "SlimeMold",
    "Fiber",
    "Sap",
    "WeedStem",
    "Grass",
    "Pebblet",
    "PlantFiber",
    "Arrow",
    "Sprig",
    "Clay",
    "Quartzite",
  ];

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 120 || off + 4 + len > buf.length) return null;
    const raw = buf.subarray(off + 4, off + 4 + len - 1);
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== 0 && (c < 32 || c > 126)) return null;
    }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) return null;
    return { s, next: off + 4 + len, len };
  }

  function encodeFString(str) {
    const s = String(str || "");
    const out = new Uint8Array(4 + s.length + 1);
    C.writeU32(out, 0, s.length + 1);
    for (let i = 0; i < s.length; i++) out[4 + i] = s.charCodeAt(i);
    out[4 + s.length] = 0;
    return out;
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

  function invBounds(buf) {
    const invAt = indexOfAscii(buf, INV_PATH, 0);
    const eqAt = indexOfAscii(buf, EQ_PATH, 0);
    if (invAt < 0) return null;
    const dataAt = invAt + INV_PATH.length + 1;
    if (dataAt + 5 > buf.length) return null;
    // Observed: path\0, optional pad 0x00, then u32 count
    let countOff = dataAt;
    let count = C.readU32(buf, countOff);
    if ((count > 500 || count === 0) && buf[dataAt] === 0) {
      countOff = dataAt + 1;
      count = C.readU32(buf, countOff);
    }
    if (count < 1 || count > 500) return null;
    const end = eqAt > invAt ? eqAt : buf.length;
    return { invAt, dataAt, countOff, count, end };
  }

  function parseItemRecord(buf, pathLenOff, regionEnd) {
    const pathLen = C.readU32(buf, pathLenOff);
    if (pathLen !== FULL_TABLE.length + 1) return null;
    const tableAt = pathLenOff + 4;
    if (indexOfAscii(buf, FULL_TABLE, tableAt) !== tableAt) return null;
    const name = readFString(buf, tableAt + FULL_TABLE.length + 1);
    if (!name) return null;
    let off = name.next;
    if (off + 8 > buf.length) return null;
    off += 8; // head
    const enh = readFString(buf, off);
    if (!enh) return null;
    off = enh.next;
    if (off + 4 > buf.length) return null;
    const level = C.readU32(buf, off);
    off += 4;
    if (level > 50) return null;
    const mid = readFString(buf, off);
    if (!mid) return null;
    off = mid.next;
    const nextTable = indexOfAscii(buf, FULL_TABLE, off);
    let end;
    if (nextTable >= 0 && nextTable < regionEnd) {
      end = nextTable - 4;
    } else {
      end = regionEnd;
    }
    if (end <= pathLenOff + 20) return null;
    // stack: look back from durability float (end-4)
    let stack = 1;
    let stackOff = -1;
    let slot = 0;
    if (end - pathLenOff >= 40) {
      const durOff = end - 4;
      // common layout: GUID(16) + pad? + slot + stack + zeros + dur
      const midEnd = mid.next;
      const guidOff = midEnd + 12;
      if (guidOff + 16 + 9 <= durOff) {
        const maybePad = buf[guidOff + 16];
        let slotAt = guidOff + 16;
        if (maybePad === 0 && guidOff + 17 + 8 <= durOff) {
          // try pad-byte layout first
          const s1 = new DataView(
            buf.buffer,
            buf.byteOffset + guidOff + 17,
            4
          ).getInt32(0, true);
          const st1 = new DataView(
            buf.buffer,
            buf.byteOffset + guidOff + 21,
            4
          ).getInt32(0, true);
          if (st1 >= 1 && st1 <= 9999 && s1 >= -1 && s1 < 100000) {
            slot = s1;
            stack = st1;
            stackOff = guidOff + 21;
          }
        }
        if (stackOff < 0) {
          const s0 = new DataView(
            buf.buffer,
            buf.byteOffset + slotAt,
            4
          ).getInt32(0, true);
          const st0 = new DataView(
            buf.buffer,
            buf.byteOffset + slotAt + 4,
            4
          ).getInt32(0, true);
          if (st0 >= 1 && st0 <= 9999 && s0 >= -1 && s0 < 100000) {
            slot = s0;
            stack = st0;
            stackOff = slotAt + 4;
          }
        }
      }
    }
    return {
      name: name.s,
      nameOff: tableAt + FULL_TABLE.length + 1,
      nameLen: name.len,
      start: pathLenOff,
      end,
      size: end - pathLenOff,
      enhancement: enh.s,
      mid: mid.s,
      level,
      stack,
      stackOff,
      slot,
      guidOff: mid.next + 12,
    };
  }

  function parseInventory(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const bounds = invBounds(buf);
    if (!bounds) return { ok: false, items: [], count: 0 };
    const items = [];
    let i = bounds.dataAt;
    while (i < bounds.end) {
      const at = indexOfAscii(buf, FULL_TABLE, i);
      if (at < 0 || at >= bounds.end) break;
      const pathLenOff = at - 4;
      if (pathLenOff < bounds.dataAt) {
        i = at + 1;
        continue;
      }
      const it = parseItemRecord(buf, pathLenOff, bounds.end);
      if (it) items.push(it);
      i = at + 1;
    }
    return {
      ok: items.length > 0,
      items,
      count: bounds.count,
      countOff: bounds.countOff,
      bounds,
      size: buf.length,
    };
  }

  function randomGuid() {
    const g = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(g);
    } else {
      for (let i = 0; i < 16; i++) g[i] = (Math.random() * 256) | 0;
    }
    return g;
  }

  function replaceFString(buf, stringOff, oldLen, newStr) {
    const encoded = encodeFString(newStr);
    const oldBytes = 4 + oldLen;
    const delta = encoded.length - oldBytes;
    if (delta === 0) {
      const out = new Uint8Array(buf);
      out.set(encoded, stringOff);
      return { bytes: out, delta: 0 };
    }
    const out = new Uint8Array(buf.length + delta);
    out.set(buf.subarray(0, stringOff), 0);
    out.set(encoded, stringOff);
    out.set(buf.subarray(stringOff + oldBytes), stringOff + encoded.length);
    return { bytes: out, delta };
  }

  function removeInventoryItem(rawPlayer, index) {
    const parsed = parseInventory(rawPlayer);
    if (!parsed.ok || index < 0 || index >= parsed.items.length) {
      throw new Error("Inventory item not found.");
    }
    if (parsed.items.length <= 1) {
      throw new Error("Keep at least one inventory item (needed as a clone template).");
    }
    const it = parsed.items[index];
    const buf = C.toBytes(rawPlayer);
    const out = new Uint8Array(buf.length - it.size);
    out.set(buf.subarray(0, it.start), 0);
    out.set(buf.subarray(it.end), it.start);
    const newCount = Math.max(0, parsed.count - 1);
    C.writeU32(out, parsed.countOff, newCount);
    return {
      bytes: out,
      removed: it.name,
      count: newCount,
    };
  }

  function pickTemplate(items, wantedName) {
    if (wantedName) {
      const exact = items.find((x) => x.name === wantedName);
      if (exact) return exact;
    }
    for (const pref of TEMPLATE_PREFS) {
      const hit = items.find((x) => x.name === pref);
      if (hit) return hit;
    }
    // Prefer short plain records without trinket/accessory baggage
    const simple = items
      .filter((x) => x.size >= 130 && x.size <= 180 && x.mid === "None")
      .sort((a, b) => a.size - b.size);
    if (simple.length) return simple[0];
    return items[0];
  }

  function addInventoryItem(rawPlayer, itemName, stackCount) {
    const name = String(itemName || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(name)) {
      throw new Error("Invalid item id (use Table_AllItems name, e.g. Fiber).");
    }
    const qty = Math.max(1, Math.min(9999, Math.floor(Number(stackCount) || 1)));
    const parsed = parseInventory(rawPlayer);
    if (!parsed.ok) throw new Error("Could not parse HostPlayer inventory.");

    const existing = parsed.items.findIndex((x) => x.name === name);
    if (existing >= 0 && parsed.items[existing].stackOff >= 0) {
      // Bump stack on an existing stack when possible
      const buf = new Uint8Array(C.toBytes(rawPlayer));
      const it = parsed.items[existing];
      const next = Math.min(9999, it.stack + qty);
      new DataView(buf.buffer, buf.byteOffset + it.stackOff, 4).setInt32(
        0,
        next,
        true
      );
      return {
        bytes: buf,
        added: name,
        stack: next,
        mode: "stack",
        count: parsed.count,
      };
    }

    const tmpl = pickTemplate(parsed.items, null);
    if (!tmpl) throw new Error("No inventory template item to clone.");

    let buf = new Uint8Array(C.toBytes(rawPlayer));
    // Re-find template after ensuring we have fresh bytes
    let items = parseInventory(buf).items;
    let template = pickTemplate(items, tmpl.name);
    const slice = buf.slice(template.start, template.end);

    // Insert clone just before equipment boundary (after last inventory item)
    const insertAt = items[items.length - 1].end;
    let out = new Uint8Array(buf.length + slice.length);
    out.set(buf.subarray(0, insertAt), 0);
    out.set(slice, insertAt);
    out.set(buf.subarray(insertAt), insertAt + slice.length);

    // New clone is the last inventory item
    let inv = parseInventory(out);
    let cloneIdx = inv.items.length - 1;
    let clone = inv.items[cloneIdx];

    // Rename
    const renamed = replaceFString(out, clone.nameOff, clone.nameLen, name);
    out = renamed.bytes;
    inv = parseInventory(out);
    clone = inv.items[inv.items.length - 1];

    // New GUID
    if (clone.guidOff >= 0 && clone.guidOff + 16 <= out.length) {
      out.set(randomGuid(), clone.guidOff);
    }

    // Stack
    if (clone.stackOff >= 0) {
      new DataView(out.buffer, out.byteOffset + clone.stackOff, 4).setInt32(
        0,
        qty,
        true
      );
    }

    // Bump inventory count to match scanned items
    inv = parseInventory(out);
    C.writeU32(out, inv.countOff, inv.items.length);

    return {
      bytes: out,
      added: name,
      stack: qty,
      mode: "clone",
      template: template.name,
      count: inv.items.length,
    };
  }

  function setInventoryStack(rawPlayer, index, stackCount) {
    const parsed = parseInventory(rawPlayer);
    if (!parsed.ok || index < 0 || index >= parsed.items.length) {
      throw new Error("Inventory item not found.");
    }
    const it = parsed.items[index];
    if (it.stackOff < 0) throw new Error("Stack offset not found for " + it.name);
    const qty = Math.max(1, Math.min(9999, Math.floor(Number(stackCount) || 1)));
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    new DataView(buf.buffer, buf.byteOffset + it.stackOff, 4).setInt32(0, qty, true);
    return { bytes: buf, name: it.name, stack: qty };
  }

  window.GroundedInventory = {
    parseInventory,
    parseItemRecord,
    removeInventoryItem,
    addInventoryItem,
    setInventoryStack,
    TEMPLATE_PREFS,
  };
})();
