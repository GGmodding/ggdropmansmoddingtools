(() => {
  "use strict";

  /**
   * SoD2 supply-locker inventory (ItemLibrarySave).
   * Classes arrays + instance arrays; stackables use StackCount, weapons use Durability.
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before inventory.js");

  const CATEGORIES = [
    {
      id: "ammo",
      label: "Ammo",
      classProp: "AmmoItemClasses",
      instProp: "AmmoItemInstances",
      orderEnum: "EItemTypeIndex::Ammo",
      kind: "stack",
    },
    {
      id: "consumable",
      label: "Consumable",
      classProp: "ConsumableItemClasses",
      instProp: "ConsumableItemInstances",
      orderEnum: "EItemTypeIndex::Consumable",
      kind: "stack",
    },
    {
      id: "misc",
      label: "Miscellaneous",
      classProp: "MiscellaneousItemClasses",
      instProp: "MiscellaneousItemInstances",
      orderEnum: "EItemTypeIndex::Miscellaneous",
      kind: "stack",
    },
    {
      id: "resource",
      label: "Resource packs",
      classProp: "ResourceItemClasses",
      instProp: "ResourceItemInstances",
      orderEnum: "EItemTypeIndex::Resource",
      kind: "simple",
    },
    {
      id: "melee",
      label: "Melee",
      classProp: "MeleeWeaponItemClasses",
      instProp: "MeleeWeaponItemInstances",
      orderEnum: "EItemTypeIndex::MeleeWeapon",
      kind: "weapon",
    },
    {
      id: "ranged",
      label: "Ranged",
      classProp: "RangedWeaponItemClasses",
      instProp: "RangedWeaponItemInstances",
      orderEnum: "EItemTypeIndex::RangedWeapon",
      kind: "weapon",
    },
    {
      id: "rangedMod",
      label: "Weapon mods",
      classProp: "RangedWeaponModItemClasses",
      instProp: "RangedWeaponModItemInstances",
      orderEnum: "EItemTypeIndex::RangedWeaponMod",
      kind: "simple",
    },
    {
      id: "backpack",
      label: "Backpacks",
      classProp: "BackpackItemClasses",
      instProp: "BackpackItemInstances",
      orderEnum: "EItemTypeIndex::Backpack",
      kind: "simple",
    },
    {
      id: "closeCombat",
      label: "Close combat",
      classProp: "CloseCombatItemClasses",
      instProp: "CloseCombatItemInstances",
      orderEnum: "EItemTypeIndex::CloseCombat",
      kind: "simple",
    },
    {
      id: "facilityMod",
      label: "Facility mods",
      classProp: "FacilityModItemClasses",
      instProp: "FacilityModItemInstances",
      orderEnum: "EItemTypeIndex::FacilityMod",
      kind: "simple",
    },
  ];

  function u32(buf, o) {
    return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  }

  function writeU32(buf, o, v) {
    v = v >>> 0;
    buf[o] = v & 0xff;
    buf[o + 1] = (v >>> 8) & 0xff;
    buf[o + 2] = (v >>> 16) & 0xff;
    buf[o + 3] = (v >>> 24) & 0xff;
  }

  function i32(buf, o) {
    return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) | 0;
  }

  function writeI32(buf, o, v) {
    writeU32(buf, o, v | 0);
  }

  function i64(buf, o) {
    return Number(BigInt(u32(buf, o)) | (BigInt(u32(buf, o + 4)) << 32n));
  }

  function writeI64(buf, o, v) {
    const n = BigInt(v);
    writeU32(buf, o, Number(n & 0xffffffffn));
    writeU32(buf, o + 4, Number((n >> 32n) & 0xffffffffn));
  }

  function asciiAt(buf, o, len) {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(buf[o + i]);
    return s;
  }

  function readStr(buf, o) {
    const len = u32(buf, o);
    if (len < 0 || o + 4 + len > buf.length) throw new Error("Bad UE string @" + o.toString(16));
    const s = len <= 1 ? "" : asciiAt(buf, o + 4, len - 1);
    return { s, next: o + 4 + len, bytes: 4 + len, len };
  }

  function encodeUeString(str) {
    const chars = Array.from(String(str));
    const len = chars.length + 1;
    const out = new Uint8Array(4 + len);
    writeU32(out, 0, len);
    for (let i = 0; i < chars.length; i++) out[4 + i] = chars[i].charCodeAt(0) & 0xff;
    out[4 + chars.length] = 0;
    return out;
  }

  function shortClassName(path) {
    if (!path) return "(empty)";
    const leaf = String(path).split("/").pop() || path;
    const noC = leaf.replace(/_C$/, "");
    const parts = noC.split(".");
    return parts[parts.length - 1] || noC;
  }

  function spliceBuf(buf, offset, deleteCount, insert) {
    const insertBytes = insert || new Uint8Array(0);
    const next = new Uint8Array(buf.length - deleteCount + insertBytes.length);
    next.set(buf.subarray(0, offset), 0);
    if (insertBytes.length) next.set(insertBytes, offset);
    next.set(buf.subarray(offset + deleteCount), offset + insertBytes.length);
    return next;
  }

  function adjustAncestorSizes(buf, point, delta, skipOffs) {
    if (!delta) return buf;
    const skip = new Set(skipOffs || []);
    const patches = [];

    const structType = encodeUeString("StructProperty");
    outerStruct: for (let i = 0; i <= buf.length - structType.length; i++) {
      for (let j = 0; j < structType.length; j++) {
        if (buf[i + j] !== structType[j]) continue outerStruct;
      }
      try {
        const dataLenOff = i + structType.length;
        if (skip.has(dataLenOff)) continue;
        const dataLen = i64(buf, dataLenOff);
        if (dataLen <= 0 || dataLen > buf.length) continue;
        let o = dataLenOff + 8;
        const st = readStr(buf, o);
        o = st.next + 17;
        if (point >= o && point < o + dataLen) patches.push({ off: dataLenOff, next: dataLen + delta });
      } catch (_) {}
    }

    const arrayType = encodeUeString("ArrayProperty");
    outerArr: for (let i = 0; i <= buf.length - arrayType.length; i++) {
      for (let j = 0; j < arrayType.length; j++) {
        if (buf[i + j] !== arrayType[j]) continue outerArr;
      }
      try {
        const dataLenOff = i + arrayType.length;
        if (skip.has(dataLenOff)) continue;
        const dataLen = i64(buf, dataLenOff);
        if (dataLen <= 0 || dataLen > buf.length) continue;
        let o = dataLenOff + 8;
        const et = readStr(buf, o);
        o = et.next + 1;
        if (point >= o && point < o + dataLen) patches.push({ off: dataLenOff, next: dataLen + delta });
      } catch (_) {}
    }

    for (const p of patches) writeI64(buf, p.off, p.next);
    return buf;
  }

  function skipProperty(buf, o) {
    const name = readStr(buf, o);
    o = name.next;
    if (name.s === "None") return { next: o, name: "None", type: "None" };
    const type = readStr(buf, o);
    o = type.next;

    if (type.s === "BoolProperty") {
      return { next: o + 10, name: name.s, type: type.s };
    }
    if (type.s === "NameProperty" || type.s === "StrProperty" || type.s === "AssetObjectProperty") {
      const dataLenOff = o;
      const dataLen = i64(buf, o);
      o += 8;
      o += 1;
      const valueOff = o;
      const v = readStr(buf, o);
      o = v.next;
      return {
        next: o,
        name: name.s,
        type: type.s,
        value: v.s,
        dataLenOff,
        dataLen,
        valueOff,
        valueBytes: v.bytes,
      };
    }
    if (type.s === "IntProperty" || type.s === "UInt32Property" || type.s === "FloatProperty") {
      o += 8;
      o += 1;
      const valueOff = o;
      const value = type.s === "FloatProperty" ? null : i32(buf, o);
      o += 4;
      return { next: o, name: name.s, type: type.s, value, valueOff };
    }
    if (type.s === "Int64Property" || type.s === "DoubleProperty" || type.s === "UInt64Property") {
      return { next: o + 17, name: name.s, type: type.s };
    }
    if (type.s === "ByteProperty") {
      o += 8;
      const enumName = readStr(buf, o);
      o = enumName.next;
      if (enumName.s === "None") o += 1;
      else {
        o += 1;
        o = readStr(buf, o).next;
      }
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "EnumProperty") {
      o += 8;
      o = readStr(buf, o).next + 1;
      o = readStr(buf, o).next;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "StructProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      const st = readStr(buf, o);
      o = st.next + 17 + dataLen;
      return { next: o, name: name.s, type: type.s, struct: st.s, dataLen };
    }
    if (type.s === "ArrayProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      const et = readStr(buf, o);
      o = et.next + 1 + dataLen;
      return { next: o, name: name.s, type: type.s, dataLen };
    }
    if (type.s === "MapProperty" || type.s === "SetProperty") {
      const dataLen = i64(buf, o);
      o += 8 + 5 + Math.max(0, dataLen - 4);
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "TextProperty") {
      const dataLen = i64(buf, o);
      return { next: o + 9 + dataLen, name: name.s, type: type.s };
    }
    throw new Error("Unsupported property " + type.s + " (" + name.s + ")");
  }

  function findNamedInRange(buf, from, to, propName, typeName) {
    const enc = encodeUeString(propName);
    for (let i = from; i <= to - enc.length; i++) {
      let ok = true;
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      try {
        const type = readStr(buf, i + enc.length);
        if (typeName && type.s !== typeName) continue;
        return i;
      } catch (_) {}
    }
    return -1;
  }

  function findAllItemLibraries(buf) {
    const enc = encodeUeString("ItemLibrary");
    const out = [];
    outer: for (let i = 0; i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      try {
        const type = readStr(buf, i + enc.length);
        if (type.s !== "StructProperty") continue;
        out.push(i);
      } catch (_) {}
    }
    return out;
  }

  function parseAssetClassArray(buf, start) {
    let o = start;
    const name = readStr(buf, o);
    o = name.next;
    const type = readStr(buf, o);
    o = type.next;
    const dataLenOff = o;
    const dataLen = i64(buf, o);
    o += 8;
    const et = readStr(buf, o);
    o = et.next;
    o += 1;
    const payloadStart = o;
    const countOff = o;
    const count = u32(buf, o);
    o += 4;
    const items = [];
    for (let i = 0; i < count; i++) {
      const valueOff = o;
      const v = readStr(buf, o);
      items.push({
        index: i,
        path: v.s,
        shortName: shortClassName(v.s),
        valueOff,
        valueBytes: v.bytes,
      });
      o = v.next;
    }
    return {
      name: name.s,
      start,
      dataLenOff,
      dataLen,
      countOff,
      count,
      payloadStart,
      items,
      next: payloadStart + dataLen,
    };
  }

  function readStackCountInStruct(buf, structPayloadStart, structPayloadEnd) {
    let o = structPayloadStart;
    while (o < structPayloadEnd) {
      const n = readStr(buf, o);
      if (n.s === "None") return null;
      if (n.s === "StackCount") {
        const t = readStr(buf, n.next);
        if (t.s === "IntProperty") {
          const valueOff = t.next + 9;
          return { value: i32(buf, valueOff), valueOff };
        }
      }
      o = skipProperty(buf, o).next;
    }
    return null;
  }

  function parseInstanceArray(buf, start, kind) {
    let o = start;
    const name = readStr(buf, o);
    o = name.next;
    const type = readStr(buf, o);
    o = type.next;
    const dataLenOff = o;
    const dataLen = i64(buf, o);
    o += 8;
    const et = readStr(buf, o);
    o = et.next;
    o += 1;
    const payloadStart = o;
    const countOff = o;
    const count = u32(buf, o);
    o += 4;
    const inName = readStr(buf, o);
    o = inName.next;
    const inType = readStr(buf, o);
    o = inType.next;
    const innerLenOff = o;
    const innerLen = i64(buf, o);
    o += 8;
    const st = readStr(buf, o);
    o = st.next;
    o += 17;

    const items = [];
    for (let i = 0; i < count; i++) {
      const itemStart = o;
      let classIndex = null;
      let classIndexOff = null;
      let durability = null;
      let durabilityOff = null;
      let maxDurability = null;
      let maxDurabilityOff = null;
      let stackCount = null;
      let stackCountOff = null;

      while (true) {
        const before = o;
        const pname = readStr(buf, o);
        if (pname.s === "None") {
          o = pname.next;
          break;
        }
        const ptype = readStr(buf, pname.next);

        if (ptype.s === "StructProperty" && pname.s === "StackInfo") {
          const dl = i64(buf, ptype.next);
          let so = ptype.next + 8;
          so = readStr(buf, so).next + 17;
          const stack = readStackCountInStruct(buf, so, so + dl);
          if (stack) {
            stackCount = stack.value;
            stackCountOff = stack.valueOff;
          }
          o = ptype.next + 8;
          o = readStr(buf, o).next + 17 + dl;
          continue;
        }

        if (ptype.s === "IntProperty" && pname.s === "ClassIndex") {
          classIndexOff = ptype.next + 9;
          classIndex = i32(buf, classIndexOff);
          o = classIndexOff + 4;
          continue;
        }

        if (ptype.s === "IntProperty" && pname.s === "Durability") {
          durabilityOff = ptype.next + 9;
          durability = i32(buf, durabilityOff);
          o = durabilityOff + 4;
          continue;
        }

        if (ptype.s === "IntProperty" && pname.s === "PreviousMaxDurability") {
          maxDurabilityOff = ptype.next + 9;
          maxDurability = i32(buf, maxDurabilityOff);
          o = maxDurabilityOff + 4;
          continue;
        }

        o = skipProperty(buf, before).next;
        if (o <= before) throw new Error("Stuck parsing instance @" + before.toString(16));
      }

      items.push({
        index: i,
        start: itemStart,
        end: o,
        size: o - itemStart,
        classIndex,
        classIndexOff,
        stackCount,
        stackCountOff,
        durability,
        durabilityOff,
        maxDurability,
        maxDurabilityOff,
        kind,
      });
    }

    return {
      name: name.s,
      start,
      dataLenOff,
      dataLen,
      countOff,
      count,
      innerLenOff,
      innerLen,
      payloadStart,
      structType: st.s,
      items,
      next: o,
    };
  }

  function parseItemOrder(buf, start) {
    if (start < 0) return null;
    let o = start;
    const name = readStr(buf, o);
    o = name.next;
    const type = readStr(buf, o);
    o = type.next;
    const dataLenOff = o;
    const dataLen = i64(buf, o);
    o += 8;
    const et = readStr(buf, o);
    o = et.next;
    o += 1;
    const payloadStart = o;
    const countOff = o;
    const count = u32(buf, o);
    o += 4;
    const entries = [];
    for (let i = 0; i < count; i++) {
      const valueOff = o;
      const v = readStr(buf, o);
      entries.push({ index: i, value: v.s, valueOff, valueBytes: v.bytes });
      o = v.next;
    }
    return {
      start,
      dataLenOff,
      dataLen,
      countOff,
      count,
      payloadStart,
      entries,
      next: payloadStart + dataLen,
    };
  }

  function parseLibrary(buf, libOff, index) {
    const name = readStr(buf, libOff);
    const type = readStr(buf, name.next);
    const dataLenOff = type.next;
    const dataLen = i64(buf, dataLenOff);
    let o = dataLenOff + 8;
    const st = readStr(buf, o);
    o = st.next + 17;
    const payloadStart = o;
    const payloadEnd = payloadStart + dataLen;

    const categories = {};
    let totalItems = 0;
    for (const cat of CATEGORIES) {
      const classOff = findNamedInRange(buf, payloadStart, payloadEnd, cat.classProp, "ArrayProperty");
      const instOff = findNamedInRange(buf, payloadStart, payloadEnd, cat.instProp, "ArrayProperty");
      if (classOff < 0 && instOff < 0) continue;
      let classes = { items: [], count: 0 };
      let instances = { items: [], count: 0 };
      try {
        if (classOff >= 0) classes = parseAssetClassArray(buf, classOff);
      } catch (_) {}
      try {
        if (instOff >= 0) instances = parseInstanceArray(buf, instOff, cat.kind);
      } catch (_) {}
      totalItems += instances.count || 0;
      categories[cat.id] = {
        def: cat,
        classes,
        instances,
      };
    }

    const orderOff = findNamedInRange(buf, payloadStart, payloadEnd, "ItemOrder", "ArrayProperty");
    let itemOrder = null;
    try {
      itemOrder = parseItemOrder(buf, orderOff);
    } catch (_) {}

    return {
      index,
      libOff,
      dataLenOff,
      dataLen,
      payloadStart,
      payloadEnd,
      categories,
      itemOrder,
      totalItems,
      label: null,
    };
  }

  function discoverInventories(save) {
    const buf = save.properties;
    const libs = findAllItemLibraries(buf);
    const inventories = [];
    for (let i = 0; i < libs.length; i++) {
      try {
        inventories.push(parseLibrary(buf, libs[i], i));
      } catch (err) {
        console.warn("ItemLibrary parse failed", i, err);
      }
    }
    inventories.sort((a, b) => b.totalItems - a.totalItems || b.dataLen - a.dataLen);
    inventories.forEach((inv, i) => {
      inv.listIndex = i;
      if (i === 0 && inv.totalItems > 0) inv.label = "Primary locker (" + inv.totalItems + " items)";
      else if (inv.totalItems === 0) inv.label = "Empty locker #" + (i + 1);
      else inv.label = "Locker #" + (i + 1) + " (" + inv.totalItems + " items)";
    });

    const catalog = new Map();
    for (const inv of inventories) {
      for (const cat of Object.values(inv.categories)) {
        for (const c of cat.classes.items || []) {
          if (!c.path) continue;
          if (!catalog.has(c.path)) catalog.set(c.path, { path: c.path, shortName: c.shortName, categoryId: cat.def.id });
        }
      }
    }

    save.inventories = inventories;
    save.itemCatalog = [...catalog.values()].sort((a, b) => a.shortName.localeCompare(b.shortName));
    return inventories;
  }

  function requireInv(save, listIndex) {
    if (!save.inventories) discoverInventories(save);
    const inv = save.inventories.find((x) => x.listIndex === listIndex) || save.inventories[listIndex];
    if (!inv) throw new Error("Invalid locker");
    return inv;
  }

  function resolveItem(save, listIndex, categoryId, itemIndex) {
    const inv = requireInv(save, listIndex);
    const cat = inv.categories[categoryId];
    if (!cat) throw new Error("Unknown category");
    const item = cat.instances.items[itemIndex];
    if (!item) throw new Error("Invalid item slot");
    const cls = cat.classes.items[item.classIndex] || null;
    return { inv, cat, item, cls };
  }

  function setStackCount(save, listIndex, categoryId, itemIndex, value) {
    const { item } = resolveItem(save, listIndex, categoryId, itemIndex);
    if (item.stackCountOff == null) throw new Error("This item has no StackCount");
    const n = Math.max(0, Math.min(999999, Number(value) | 0));
    writeI32(save.properties, item.stackCountOff, n);
    item.stackCount = n;
    save.dirty = true;
  }

  function setDurability(save, listIndex, categoryId, itemIndex, value) {
    const { item } = resolveItem(save, listIndex, categoryId, itemIndex);
    if (item.durabilityOff == null) throw new Error("This item has no Durability");
    const n = Math.max(0, Math.min(999999, Number(value) | 0));
    writeI32(save.properties, item.durabilityOff, n);
    item.durability = n;
    if (item.maxDurabilityOff != null && (item.maxDurability == null || item.maxDurability < n)) {
      writeI32(save.properties, item.maxDurabilityOff, n);
      item.maxDurability = n;
    }
    save.dirty = true;
  }

  function setClassIndex(save, listIndex, categoryId, itemIndex, classIndex) {
    const { cat, item } = resolveItem(save, listIndex, categoryId, itemIndex);
    if (item.classIndexOff == null) throw new Error("No ClassIndex");
    const idx = Number(classIndex) | 0;
    if (idx < 0 || idx >= cat.classes.count) throw new Error("ClassIndex out of range");
    writeI32(save.properties, item.classIndexOff, idx);
    item.classIndex = idx;
    save.dirty = true;
  }

  function patchInstanceClassIndex(clone, classIndex) {
    const needle = encodeUeString("ClassIndex");
    for (let i = 0; i <= clone.length - needle.length; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (clone[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      try {
        const type = readStr(clone, i + needle.length);
        if (type.s !== "IntProperty") continue;
        writeI32(clone, type.next + 9, classIndex);
        return true;
      } catch (_) {}
    }
    return false;
  }

  function patchInstanceStackCount(clone, stackCount) {
    const needle = encodeUeString("StackCount");
    for (let i = 0; i <= clone.length - needle.length; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (clone[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      try {
        const type = readStr(clone, i + needle.length);
        if (type.s !== "IntProperty") continue;
        writeI32(clone, type.next + 9, stackCount);
        return true;
      } catch (_) {}
    }
    return false;
  }

  function appendItemOrderEntry(buf, order, enumValue) {
    if (!order) return { buf, delta: 0, skip: [] };
    const encoded = encodeUeString(enumValue);
    const insertAt = order.entries.length
      ? order.entries[order.entries.length - 1].valueOff + order.entries[order.entries.length - 1].valueBytes
      : order.countOff + 4;
    let next = spliceBuf(buf, insertAt, 0, encoded);
    writeU32(next, order.countOff, order.count + 1);
    writeI64(next, order.dataLenOff, order.dataLen + encoded.length);
    next = adjustAncestorSizes(next, insertAt, encoded.length, [order.dataLenOff]);
    return { buf: next, delta: encoded.length, skip: [order.dataLenOff] };
  }

  function removeLastItemOrderOfType(buf, order, enumValue) {
    if (!order || !order.entries.length) return { buf, delta: 0 };
    let idx = -1;
    for (let i = order.entries.length - 1; i >= 0; i--) {
      if (order.entries[i].value === enumValue) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = order.entries.length - 1;
    const entry = order.entries[idx];
    let next = spliceBuf(buf, entry.valueOff, entry.valueBytes, null);
    writeU32(next, order.countOff, order.count - 1);
    writeI64(next, order.dataLenOff, order.dataLen - entry.valueBytes);
    next = adjustAncestorSizes(next, entry.valueOff, -entry.valueBytes, [order.dataLenOff]);
    return { buf: next, delta: -entry.valueBytes };
  }

  function duplicateItem(save, listIndex, categoryId, itemIndex, opts) {
    opts = opts || {};
    const { inv, cat, item } = resolveItem(save, listIndex, categoryId, itemIndex);
    const arr = cat.instances;
    let clone = save.properties.slice(item.start, item.end);
    if (opts.classIndex != null) patchInstanceClassIndex(clone, opts.classIndex | 0);
    if (opts.stackCount != null) patchInstanceStackCount(clone, opts.stackCount | 0);

    const insertAt = arr.items[arr.items.length - 1]
      ? arr.items[arr.items.length - 1].end
      : item.end;
    const delta = clone.length;
    let buf = spliceBuf(save.properties, insertAt, 0, clone);
    writeU32(buf, arr.countOff, arr.count + 1);
    writeI64(buf, arr.dataLenOff, arr.dataLen + delta);
    writeI64(buf, arr.innerLenOff, arr.innerLen + delta);
    buf = adjustAncestorSizes(buf, arr.payloadStart, delta, [arr.dataLenOff, arr.innerLenOff]);

    // ItemOrder (offsets may have shifted if order is after insert — rediscover after)
    save.properties = buf;
    save.dirty = true;
    discoverInventories(save);
    const inv2 = requireInv(save, listIndex);
    const order = inv2.itemOrder;
    if (order) {
      const res = appendItemOrderEntry(save.properties, order, cat.def.orderEnum);
      save.properties = res.buf;
      discoverInventories(save);
    }
  }

  function removeItem(save, listIndex, categoryId, itemIndex) {
    const { inv, cat, item } = resolveItem(save, listIndex, categoryId, itemIndex);
    const arr = cat.instances;
    if (arr.count <= 0) throw new Error("Nothing to remove");
    const size = item.size;
    let buf = spliceBuf(save.properties, item.start, size, null);
    writeU32(buf, arr.countOff, arr.count - 1);
    writeI64(buf, arr.dataLenOff, arr.dataLen - size);
    writeI64(buf, arr.innerLenOff, arr.innerLen - size);
    buf = adjustAncestorSizes(buf, arr.payloadStart, -size, [arr.dataLenOff, arr.innerLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverInventories(save);

    const inv2 = requireInv(save, listIndex);
    if (inv2.itemOrder) {
      const res = removeLastItemOrderOfType(save.properties, inv2.itemOrder, cat.def.orderEnum);
      save.properties = res.buf;
      discoverInventories(save);
    }
  }

  function addClassPath(save, listIndex, categoryId, classPath) {
    classPath = String(classPath || "").trim();
    if (!classPath.includes("/Game/")) throw new Error("Class path should look like /Game/Items/...");
    const inv = requireInv(save, listIndex);
    const cat = inv.categories[categoryId];
    if (!cat || !cat.classes.countOff) throw new Error("Category class list missing");

    const existing = cat.classes.items.findIndex((c) => c.path === classPath);
    if (existing >= 0) return existing;

    const encoded = encodeUeString(classPath);
    const classes = cat.classes;
    const insertAt = classes.items.length
      ? classes.items[classes.items.length - 1].valueOff + classes.items[classes.items.length - 1].valueBytes
      : classes.countOff + 4;
    let buf = spliceBuf(save.properties, insertAt, 0, encoded);
    writeU32(buf, classes.countOff, classes.count + 1);
    writeI64(buf, classes.dataLenOff, classes.dataLen + encoded.length);
    buf = adjustAncestorSizes(buf, classes.payloadStart, encoded.length, [classes.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverInventories(save);
    const inv2 = requireInv(save, listIndex);
    return inv2.categories[categoryId].classes.count - 1;
  }

  function addItem(save, listIndex, categoryId, classPathOrIndex, stackCount) {
    const inv = requireInv(save, listIndex);
    const cat = inv.categories[categoryId];
    if (!cat) throw new Error("Unknown category");
    if (!cat.instances.count) {
      throw new Error("No template instance in this category — duplicate from another locker first or pick a category that already has items");
    }

    let classIndex;
    if (typeof classPathOrIndex === "number" || /^[0-9]+$/.test(String(classPathOrIndex))) {
      classIndex = Number(classPathOrIndex) | 0;
      if (classIndex < 0 || classIndex >= cat.classes.count) throw new Error("Class index out of range");
    } else {
      classIndex = addClassPath(save, listIndex, categoryId, classPathOrIndex);
    }

    // Re-resolve after possible class add
    const inv2 = requireInv(save, listIndex);
    const cat2 = inv2.categories[categoryId];
    const template = cat2.instances.items.slice().sort((a, b) => a.size - b.size)[0];
    duplicateItem(save, listIndex, categoryId, template.index, {
      classIndex,
      stackCount: stackCount != null ? stackCount : cat2.def.kind === "stack" ? 99 : undefined,
    });
  }

  function maxAllStacks(save, listIndex, amount) {
    amount = amount == null ? 999 : amount;
    const inv = requireInv(save, listIndex);
    let n = 0;
    for (const cat of Object.values(inv.categories)) {
      if (cat.def.kind !== "stack") continue;
      for (let i = 0; i < cat.instances.items.length; i++) {
        if (cat.instances.items[i].stackCountOff == null) continue;
        setStackCount(save, listIndex, cat.def.id, i, amount);
        n++;
      }
    }
    return n;
  }

  function repairAllWeapons(save, listIndex, amount) {
    amount = amount == null ? 9999 : amount;
    const inv = requireInv(save, listIndex);
    let n = 0;
    for (const cat of Object.values(inv.categories)) {
      if (cat.def.kind !== "weapon") continue;
      for (let i = 0; i < cat.instances.items.length; i++) {
        if (cat.instances.items[i].durabilityOff == null) continue;
        setDurability(save, listIndex, cat.def.id, i, amount);
        n++;
      }
    }
    return n;
  }

  const ORDER_TYPE_TO_CATEGORY = {
    "EItemTypeIndex::Ammo": "ammo",
    "EItemTypeIndex::Consumable": "consumable",
    "EItemTypeIndex::Miscellaneous": "misc",
    "EItemTypeIndex::Resource": "resource",
    "EItemTypeIndex::MeleeWeapon": "melee",
    "EItemTypeIndex::RangedWeapon": "ranged",
    "EItemTypeIndex::RangedWeaponMod": "rangedMod",
    "EItemTypeIndex::Backpack": "backpack",
    "EItemTypeIndex::CloseCombat": "closeCombat",
    "EItemTypeIndex::FacilityMod": "facilityMod",
  };

  const EQUIPMENT_FIELDS = [
    { id: "BackpackItem", label: "Backpack" },
    { id: "RucksackItem", label: "Rucksack" },
    { id: "MeleeItem", label: "Melee" },
    { id: "CloseCombatItem", label: "Close combat" },
    { id: "RangedItem", label: "Ranged" },
    { id: "SidearmItem", label: "Sidearm" },
  ];

  function primaryLocker(save) {
    if (!save.inventories) discoverInventories(save);
    return save.inventories[0] || null;
  }

  function resolveItemOrderIndex(locker, orderIndex) {
    if (!locker || !locker.itemOrder) return null;
    if (orderIndex == null || orderIndex < 0 || orderIndex >= locker.itemOrder.count) return null;
    const orderType = locker.itemOrder.entries[orderIndex].value;
    const catId = ORDER_TYPE_TO_CATEGORY[orderType];
    if (!catId || !locker.categories[catId]) {
      return { orderIndex, orderType, catId: null, name: orderType.replace(/^EItemTypeIndex::/, ""), empty: false };
    }
    let instIdx = 0;
    for (let i = 0; i < orderIndex; i++) {
      if (locker.itemOrder.entries[i].value === orderType) instIdx++;
    }
    const cat = locker.categories[catId];
    const item = cat.instances.items[instIdx] || null;
    const cls = item && cat.classes.items[item.classIndex];
    return {
      orderIndex,
      orderType,
      catId,
      instIdx,
      item,
      classIndex: item ? item.classIndex : null,
      name: cls ? cls.shortName : "(" + catId + " #" + instIdx + ")",
      path: cls ? cls.path : null,
      stackCount: item ? item.stackCount : null,
      durability: item ? item.durability : null,
      lockerListIndex: locker.listIndex,
      empty: false,
    };
  }

  function findNamedInWindow(buf, from, to, propName, typeName) {
    return findNamedInRange(buf, from, to, propName, typeName);
  }

  function parseIndexInsideStruct(buf, structNameOff) {
    const name = readStr(buf, structNameOff);
    const type = readStr(buf, name.next);
    if (type.s !== "StructProperty") return null;
    const dataLen = i64(buf, type.next);
    let o = type.next + 8;
    o = readStr(buf, o).next + 17;
    const end = o + dataLen;
    let itemIndex = null;
    let itemIndexOff = null;
    while (o < end) {
      const n = readStr(buf, o);
      if (n.s === "None") break;
      const t = readStr(buf, n.next);
      if (n.s === "Index" && t.s === "IntProperty") {
        itemIndexOff = t.next + 9;
        itemIndex = i32(buf, itemIndexOff);
        o = itemIndexOff + 4;
      } else {
        o = skipProperty(buf, o).next;
      }
    }
    return {
      name: name.s,
      structOff: structNameOff,
      itemIndex,
      itemIndexOff,
    };
  }

  function parseEquipmentSave(buf, equipOff) {
    const name = readStr(buf, equipOff);
    const type = readStr(buf, name.next);
    const dataLenOff = type.next;
    const dataLen = i64(buf, dataLenOff);
    let o = dataLenOff + 8;
    o = readStr(buf, o).next + 17;
    const payloadStart = o;
    const payloadEnd = payloadStart + dataLen;
    const slots = {};
    for (const field of EQUIPMENT_FIELDS) {
      const off = findNamedInWindow(buf, payloadStart, payloadEnd, field.id, "StructProperty");
      if (off < 0) continue;
      const parsed = parseIndexInsideStruct(buf, off);
      if (parsed) {
        slots[field.id] = {
          id: field.id,
          label: field.label,
          itemIndex: parsed.itemIndex,
          itemIndexOff: parsed.itemIndexOff,
        };
      }
    }
    return { equipOff, dataLenOff, dataLen, slots };
  }

  function parseBagSlots(buf, invOff) {
    const name = readStr(buf, invOff);
    const type = readStr(buf, name.next);
    const dataLenOff = type.next;
    const dataLen = i64(buf, dataLenOff);
    let o = dataLenOff + 8;
    o = readStr(buf, o).next + 17;
    const payloadStart = o;
    const payloadEnd = payloadStart + dataLen;
    const slotsOff = findNamedInWindow(buf, payloadStart, payloadEnd, "Slots", "ArrayProperty");
    if (slotsOff < 0) return { invOff, dataLenOff, dataLen, slots: [], count: 0 };

    o = slotsOff;
    o = readStr(buf, o).next;
    o = readStr(buf, o).next;
    const arrDataLenOff = o;
    const arrDataLen = i64(buf, o);
    o += 8;
    o = readStr(buf, o).next + 1;
    const payloadArrStart = o;
    const countOff = o;
    const count = u32(buf, o);
    o += 4;
    o = readStr(buf, o).next;
    o = readStr(buf, o).next;
    const innerLenOff = o;
    const innerLen = i64(buf, o);
    o += 8;
    o = readStr(buf, o).next + 17;

    const slots = [];
    for (let i = 0; i < count; i++) {
      const slotStart = o;
      let itemIndex = null;
      let itemIndexOff = null;
      while (true) {
        const before = o;
        const n = readStr(buf, o);
        if (n.s === "None") {
          o = n.next;
          break;
        }
        const t = readStr(buf, n.next);
        if (n.s === "Index" && t.s === "IntProperty") {
          itemIndexOff = t.next + 9;
          itemIndex = i32(buf, itemIndexOff);
          o = itemIndexOff + 4;
        } else {
          o = skipProperty(buf, before).next;
        }
      }
      slots.push({
        index: i,
        start: slotStart,
        end: o,
        size: o - slotStart,
        itemIndex,
        itemIndexOff,
      });
    }

    return {
      invOff,
      dataLenOff,
      dataLen,
      arrDataLenOff,
      arrDataLen,
      countOff,
      count,
      innerLenOff,
      innerLen,
      payloadArrStart,
      slots,
    };
  }

  function attachSurvivorInventories(save) {
    if (!save.survivors) return [];
    if (!save.inventories) discoverInventories(save);
    const buf = save.properties;
    const locker = primaryLocker(save);

    for (let i = 0; i < save.survivors.length; i++) {
      const survivor = save.survivors[i];
      const from = survivor.firstNameOffset;
      const to =
        i + 1 < save.survivors.length
          ? save.survivors[i + 1].firstNameOffset
          : Math.min(buf.length, from + 250000);

      const equipOff = findNamedInWindow(buf, from, to, "Equipment", "StructProperty");
      const arwsOff = findNamedInWindow(buf, from, to, "ActiveRangedWeaponSlot", "ByteProperty");
      const invOff =
        arwsOff >= 0
          ? findNamedInWindow(buf, arwsOff, Math.min(arwsOff + 800, to), "Inventory", "StructProperty")
          : -1;

      let equipment = null;
      let bag = null;
      try {
        if (equipOff >= 0) equipment = parseEquipmentSave(buf, equipOff);
      } catch (err) {
        console.warn("Equipment parse failed", survivor.displayName, err);
      }
      try {
        if (invOff >= 0) bag = parseBagSlots(buf, invOff);
      } catch (err) {
        console.warn("Bag inventory parse failed", survivor.displayName, err);
      }

      const resolve = (itemIndex) => {
        if (itemIndex == null || itemIndex < 0) return { empty: true, itemIndex: itemIndex == null ? -1 : itemIndex };
        return resolveItemOrderIndex(locker, itemIndex) || {
          empty: false,
          itemIndex,
          name: "ItemOrder #" + itemIndex,
        };
      };

      const equipmentSlots = EQUIPMENT_FIELDS.map((field) => {
        const raw = equipment && equipment.slots[field.id];
        const itemIndex = raw ? raw.itemIndex : null;
        return {
          id: field.id,
          label: field.label,
          itemIndex: itemIndex == null ? -1 : itemIndex,
          itemIndexOff: raw ? raw.itemIndexOff : null,
          resolved: resolve(itemIndex),
        };
      });

      const bagSlots = (bag && bag.slots ? bag.slots : []).map((slot) => ({
        index: slot.index,
        itemIndex: slot.itemIndex == null ? -1 : slot.itemIndex,
        itemIndexOff: slot.itemIndexOff,
        resolved: resolve(slot.itemIndex),
      }));

      survivor.equipmentOff = equipOff;
      survivor.inventoryOff = invOff;
      survivor.equipmentSlots = equipmentSlots;
      survivor.bagSlots = bagSlots;
      survivor.bagMeta = bag;
    }

    return save.survivors;
  }

  function setSurvivorItemIndex(save, survivorIndex, target, value) {
    // target: { kind:'equipment', id:'MeleeItem' } or { kind:'bag', index:0 }
    if (!save.survivors || !save.survivors[survivorIndex] || !save.survivors[survivorIndex].equipmentSlots) {
      attachSurvivorInventories(save);
    }
    const survivor = save.survivors[survivorIndex];
    if (!survivor) throw new Error("Invalid survivor");

    let slot = null;
    if (target.kind === "equipment") {
      slot = survivor.equipmentSlots.find((s) => s.id === target.id);
    } else if (target.kind === "bag") {
      slot = survivor.bagSlots[target.index];
    }
    if (!slot || slot.itemIndexOff == null) throw new Error("Slot not editable");

    const locker = primaryLocker(save);
    const max = locker && locker.itemOrder ? locker.itemOrder.count - 1 : 999999;
    let n = Number(value);
    if (!Number.isFinite(n)) throw new Error("Index must be a number");
    n = n | 0;
    if (n < -1) n = -1;
    if (n > max) throw new Error("Index out of range (ItemOrder 0.." + max + ", or -1 empty)");

    writeI32(save.properties, slot.itemIndexOff, n);
    slot.itemIndex = n;
    save.dirty = true;
    attachSurvivorInventories(save);
  }

  function clearSurvivorSlot(save, survivorIndex, target) {
    setSurvivorItemIndex(save, survivorIndex, target, -1);
  }

  function listAssignableItems(save) {
    const locker = primaryLocker(save);
    if (!locker || !locker.itemOrder) return [];
    const out = [];
    for (let i = 0; i < locker.itemOrder.count; i++) {
      const r = resolveItemOrderIndex(locker, i);
      out.push({
        orderIndex: i,
        label: "#" + i + " " + ((r && r.name) || locker.itemOrder.entries[i].value),
        name: r && r.name,
        orderType: locker.itemOrder.entries[i].value,
      });
    }
    return out;
  }

  S.INVENTORY_CATEGORIES = CATEGORIES;
  S.EQUIPMENT_FIELDS = EQUIPMENT_FIELDS;
  S.discoverInventories = discoverInventories;
  S.setInventoryStackCount = setStackCount;
  S.setInventoryDurability = setDurability;
  S.setInventoryClassIndex = setClassIndex;
  S.duplicateInventoryItem = duplicateItem;
  S.removeInventoryItem = removeItem;
  S.addInventoryItem = addItem;
  S.addInventoryClassPath = addClassPath;
  S.maxAllInventoryStacks = maxAllStacks;
  S.repairAllInventoryWeapons = repairAllWeapons;
  S.shortItemClassName = shortClassName;
  S.attachSurvivorInventories = attachSurvivorInventories;
  S.setSurvivorItemIndex = setSurvivorItemIndex;
  S.clearSurvivorSlot = clearSurvivorSlot;
  S.resolveItemOrderIndex = resolveItemOrderIndex;
  S.listAssignableItems = listAssignableItems;
})();
