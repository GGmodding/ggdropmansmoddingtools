(() => {
  "use strict";

  /**
   * SoD2 base / facility editor.
   *
   * FacilitySlotSaves[] (FacilitySlotSave) — current homesite slots:
   *   ID (Name), facility (AssetObject path), FacilityState (EFacilityState),
   *   FacilityHealth (Float), Flags (Int), Mods/ModItems, buff collections
   *
   * HomesiteSlots[] (HomesiteSlotSave) — slot templates across known homesites:
   *   SlotId, facility, State, SlotPassive
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before facilities.js");

  const FACILITY_STATES = [
    "EFacilityState::Completed",
    "EFacilityState::Damaged",
    "EFacilityState::Building",
    "EFacilityState::Empty",
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

  function readF32(buf, o) {
    return new DataView(buf.buffer, buf.byteOffset + o, 4).getFloat32(0, true);
  }

  function writeF32(buf, o, v) {
    const tmp = new ArrayBuffer(4);
    new DataView(tmp).setFloat32(0, v, true);
    const b = new Uint8Array(tmp);
    buf[o] = b[0];
    buf[o + 1] = b[1];
    buf[o + 2] = b[2];
    buf[o + 3] = b[3];
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
      return { next: o + 10, name: name.s, type: type.s, value: !!buf[o + 8], valueOff: o + 8 };
    }
    if (type.s === "NameProperty" || type.s === "StrProperty" || type.s === "AssetObjectProperty") {
      const dataLenOff = o;
      o += 9;
      const v = readStr(buf, o);
      return {
        next: v.next,
        name: name.s,
        type: type.s,
        value: v.s,
        valueOff: o,
        valueBytes: v.bytes,
        dataLenOff,
      };
    }
    if (type.s === "IntProperty" || type.s === "UInt32Property") {
      o += 9;
      return { next: o + 4, name: name.s, type: type.s, value: i32(buf, o), valueOff: o };
    }
    if (type.s === "FloatProperty") {
      o += 9;
      return { next: o + 4, name: name.s, type: type.s, value: readF32(buf, o), valueOff: o };
    }
    if (type.s === "Int64Property" || type.s === "DoubleProperty" || type.s === "UInt64Property") {
      return { next: o + 17, name: name.s, type: type.s };
    }
    if (type.s === "ByteProperty") {
      const dataLenOff = o;
      o += 8;
      const enumName = readStr(buf, o);
      o = enumName.next;
      if (enumName.s === "None") {
        return { next: o + 1, name: name.s, type: type.s, value: buf[o], valueOff: o, dataLenOff, enumType: "None" };
      }
      o += 1;
      const v = readStr(buf, o);
      return {
        next: v.next,
        name: name.s,
        type: type.s,
        value: v.s,
        valueOff: o,
        valueBytes: v.bytes,
        dataLenOff,
        enumType: enumName.s,
      };
    }
    if (type.s === "EnumProperty") {
      o += 8;
      o = readStr(buf, o).next + 1;
      const v = readStr(buf, o);
      return { next: v.next, name: name.s, type: type.s, value: v.s };
    }
    if (type.s === "StructProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      o = readStr(buf, o).next + 17;
      return { next: o + dataLen, name: name.s, type: type.s };
    }
    if (type.s === "ArrayProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      o = readStr(buf, o).next + 1 + 4;
      return { next: o + dataLen - 4, name: name.s, type: type.s };
    }
    if (type.s === "MapProperty" || type.s === "SetProperty") {
      const dataLen = i64(buf, o);
      return { next: o + 8 + 5 + Math.max(0, dataLen - 4), name: name.s, type: type.s };
    }
    if (type.s === "TextProperty") {
      const dataLen = i64(buf, o);
      return { next: o + 9 + dataLen, name: name.s, type: type.s };
    }
    throw new Error("Unsupported " + type.s + " (" + name.s + ")");
  }

  function findNamedProperties(buf, propName, typeName) {
    const enc = encodeUeString(propName);
    const out = [];
    outer: for (let i = 0; i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      try {
        const type = readStr(buf, i + enc.length);
        if (typeName && type.s !== typeName) continue;
        out.push({ nameOffset: i, type: type.s });
      } catch (_) {}
    }
    return out;
  }

  function parseStructArrayHeader(buf, start) {
    let o = start;
    const name = readStr(buf, o);
    o = name.next;
    const type = readStr(buf, o);
    o = type.next;
    const dataLenOff = o;
    const dataLen = i64(buf, o);
    o += 8;
    const et = readStr(buf, o);
    o = et.next + 1;
    const countOff = o;
    const count = u32(buf, o);
    o += 4;
    o = readStr(buf, o).next;
    o = readStr(buf, o).next;
    const innerLenOff = o;
    const innerLen = i64(buf, o);
    o += 8;
    const st = readStr(buf, o);
    o = st.next + 17;
    return {
      name: name.s,
      start,
      dataLenOff,
      dataLen,
      countOff,
      count,
      innerLenOff,
      innerLen,
      structType: st.s,
      itemsStart: o,
    };
  }

  function shortFacilityName(path) {
    if (!path) return "(empty)";
    let base = String(path).split("/").pop() || path;
    if (base.includes(".")) base = base.split(".")[0];
    return base.replace(/_C$/, "");
  }

  function facilityKind(path, slotId) {
    const p = String(path || "");
    const id = String(slotId || "");
    if (/Outpost/i.test(id) || /Outpost/i.test(p)) return "outpost";
    if (/Parking/i.test(p) || /Parking/i.test(id)) return "parking";
    if (/Builtin|Built-In|BuiltIn/i.test(p) || /Builtin/i.test(id)) return "builtin";
    return "facility";
  }

  function parseFacilitySlots(buf, header, mode) {
    const items = [];
    let o = header.itemsStart;
    for (let i = 0; i < header.count; i++) {
      const start = o;
      const fields = {};
      while (true) {
        const before = o;
        const n = readStr(buf, o);
        if (n.s === "None") {
          o = n.next;
          break;
        }
        const p = skipProperty(buf, before);
        fields[p.name] = p;
        o = p.next;
      }

      const idField = fields.ID || fields.SlotId;
      const facField = fields.facility;
      const stateField = fields.FacilityState || fields.State;
      const healthField = fields.FacilityHealth;
      const flagsField = fields.Flags;
      const path = facField ? facField.value : "";
      const slotId = idField ? idField.value : "";

      items.push({
        index: i,
        start,
        end: o,
        size: o - start,
        mode,
        slotId,
        slotIdOff: idField
          ? {
              value: idField.value,
              valueOff: idField.valueOff,
              valueBytes: idField.valueBytes,
              dataLenOff: idField.dataLenOff,
            }
          : null,
        path,
        shortName: shortFacilityName(path),
        kind: facilityKind(path, slotId),
        facility: facField
          ? {
              value: facField.value,
              valueOff: facField.valueOff,
              valueBytes: facField.valueBytes,
              dataLenOff: facField.dataLenOff,
            }
          : null,
        state: stateField ? stateField.value : null,
        stateRef: stateField
          ? {
              value: stateField.value,
              valueOff: stateField.valueOff,
              valueBytes: stateField.valueBytes,
              dataLenOff: stateField.dataLenOff,
              enumType: stateField.enumType,
            }
          : null,
        health: healthField ? healthField.value : null,
        healthOff: healthField ? healthField.valueOff : null,
        flags: flagsField ? flagsField.value : null,
        flagsOff: flagsField ? flagsField.valueOff : null,
        modCount: fields.Mods && fields.Mods.count != null ? fields.Mods.count : null,
      });
    }
    return items;
  }

  function discoverFacilities(save) {
    const buf = save.properties;
    const slotHits = findNamedProperties(buf, "FacilitySlotSaves", "ArrayProperty");
    const homeHits = findNamedProperties(buf, "HomesiteSlots", "ArrayProperty");

    let facilitySlots = [];
    let facilityArray = null;
    if (slotHits.length) {
      facilityArray = parseStructArrayHeader(buf, slotHits[0].nameOffset);
      facilitySlots = parseFacilitySlots(buf, facilityArray, "current");
    }

    let homesiteSlots = [];
    let homesiteArray = null;
    if (homeHits.length) {
      homesiteArray = parseStructArrayHeader(buf, homeHits[0].nameOffset);
      homesiteSlots = parseFacilitySlots(buf, homesiteArray, "homesite");
    }

    const catalog = new Map();
    const states = new Set(FACILITY_STATES);
    for (const list of [facilitySlots, homesiteSlots]) {
      for (const f of list) {
        if (f.path) catalog.set(f.path, { path: f.path, shortName: f.shortName });
        if (f.state) states.add(f.state);
      }
    }

    save.facilitySlots = facilitySlots;
    save.facilityArray = facilityArray;
    save.homesiteSlots = homesiteSlots;
    save.homesiteArray = homesiteArray;
    save.facilityCatalog = [...catalog.values()].sort((a, b) => a.shortName.localeCompare(b.shortName));
    save.facilityStates = [...states].sort();
    save.facilityStats = {
      current: facilitySlots.length,
      homesite: homesiteSlots.length,
      outposts: facilitySlots.filter((f) => f.kind === "outpost").length,
      damaged: facilitySlots.filter((f) => f.state && /Damaged/i.test(f.state)).length,
    };
    return facilitySlots;
  }

  function resolveCurrent(save, index) {
    if (!save.facilitySlots) discoverFacilities(save);
    const f = save.facilitySlots[index];
    if (!f) throw new Error("Invalid facility slot");
    return f;
  }

  function resolveHomesite(save, index) {
    if (!save.homesiteSlots) discoverFacilities(save);
    const f = save.homesiteSlots[index];
    if (!f) throw new Error("Invalid homesite slot");
    return f;
  }

  function setAssetPath(save, ref, newPath) {
    if (!ref || ref.valueOff == null) throw new Error("Facility path unavailable");
    newPath = String(newPath || "").trim();
    if (!newPath) throw new Error("Empty facility path");
    if (ref.value === newPath) return false;
    const newStr = encodeUeString(newPath);
    const delta = newStr.length - ref.valueBytes;
    let buf = spliceBuf(save.properties, ref.valueOff, ref.valueBytes, newStr);
    writeI64(buf, ref.dataLenOff, newStr.length);
    if (delta) buf = adjustAncestorSizes(buf, ref.valueOff, delta, [ref.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    return true;
  }

  function setEnumValue(save, ref, enumValue) {
    if (!ref || ref.valueOff == null) throw new Error("State unavailable");
    enumValue = String(enumValue || "").trim();
    if (!/^EFacilityState::[A-Za-z]+$/.test(enumValue)) {
      throw new Error("State must look like EFacilityState::Completed");
    }
    if (ref.value === enumValue) return false;
    const newStr = encodeUeString(enumValue);
    const delta = newStr.length - ref.valueBytes;
    let buf = spliceBuf(save.properties, ref.valueOff, ref.valueBytes, newStr);
    writeI64(buf, ref.dataLenOff, newStr.length);
    if (delta) buf = adjustAncestorSizes(buf, ref.valueOff, delta, [ref.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    return true;
  }

  function setFacilityPath(save, index, newPath) {
    const f = resolveCurrent(save, index);
    const changed = setAssetPath(save, f.facility, newPath);
    if (changed) discoverFacilities(save);
    return changed;
  }

  function setFacilityState(save, index, state) {
    const f = resolveCurrent(save, index);
    const changed = setEnumValue(save, f.stateRef, state);
    if (changed) discoverFacilities(save);
    return changed;
  }

  function setFacilityHealth(save, index, value) {
    const f = resolveCurrent(save, index);
    if (f.healthOff == null) throw new Error("No FacilityHealth");
    const v = Number(value);
    if (!Number.isFinite(v)) throw new Error("Invalid health");
    writeF32(save.properties, f.healthOff, v);
    f.health = v;
    save.dirty = true;
  }

  function setFacilityFlags(save, index, value) {
    const f = resolveCurrent(save, index);
    if (f.flagsOff == null) throw new Error("No Flags");
    writeI32(save.properties, f.flagsOff, Number(value) | 0);
    f.flags = Number(value) | 0;
    save.dirty = true;
  }

  function repairFacility(save, index) {
    const f = resolveCurrent(save, index);
    let changed = false;
    if (f.stateRef && f.state !== "EFacilityState::Completed") {
      if (setEnumValue(save, f.stateRef, "EFacilityState::Completed")) changed = true;
    }
    discoverFacilities(save);
    const f2 = save.facilitySlots[index];
    if (f2 && f2.healthOff != null) {
      writeF32(save.properties, f2.healthOff, 0);
      f2.health = 0;
      save.dirty = true;
      changed = true;
    }
    return changed;
  }

  function repairAllFacilities(save) {
    discoverFacilities(save);
    let n = 0;
    for (let i = save.facilitySlots.length - 1; i >= 0; i--) {
      discoverFacilities(save);
      if (repairFacility(save, i)) n++;
    }
    discoverFacilities(save);
    return n;
  }

  function completeAllFacilities(save) {
    discoverFacilities(save);
    let n = 0;
    for (let i = save.facilitySlots.length - 1; i >= 0; i--) {
      discoverFacilities(save);
      if (setFacilityState(save, i, "EFacilityState::Completed")) n++;
    }
    return n;
  }

  function setHomesiteFacilityPath(save, index, newPath) {
    const f = resolveHomesite(save, index);
    const changed = setAssetPath(save, f.facility, newPath);
    if (changed) discoverFacilities(save);
    return changed;
  }

  function setHomesiteFacilityState(save, index, state) {
    const f = resolveHomesite(save, index);
    const changed = setEnumValue(save, f.stateRef, state);
    if (changed) discoverFacilities(save);
    return changed;
  }

  function facilityStateLabel(v) {
    if (!v) return "—";
    return String(v).replace(/^EFacilityState::/, "");
  }

  S.FACILITY_STATES = FACILITY_STATES;
  S.discoverFacilities = discoverFacilities;
  S.setFacilityPath = setFacilityPath;
  S.setFacilityState = setFacilityState;
  S.setFacilityHealth = setFacilityHealth;
  S.setFacilityFlags = setFacilityFlags;
  S.repairFacility = repairFacility;
  S.repairAllFacilities = repairAllFacilities;
  S.completeAllFacilities = completeAllFacilities;
  S.setHomesiteFacilityPath = setHomesiteFacilityPath;
  S.setHomesiteFacilityState = setHomesiteFacilityState;
  S.shortFacilityName = shortFacilityName;
  S.facilityStateLabel = facilityStateLabel;
})();
