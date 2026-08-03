(() => {
  "use strict";

  /**
   * SoD2 vehicle editor (MapVehicleSaveCollection).
   *
   * Field map (per MapVehicleSave in VehicleSaves[]):
   *   VehicleClassIndex (Int) → VehicleClasses[AssetObjectProperty]
   *   Transform → Rotation(Quat) + Translation(Vector XYZ f32) + Scale3D
   *   FuelRatio, EngineHealthRatio, FrameHealthRatio, GasTankHealthRatio (Float 0–1)
   *   ZoneHealthRatios (Float array)
   *   Inventory (InventorySave) → Slots[] ItemInstanceSave.Index → Vehicle ItemLibrary ItemOrder
   *   ScoutedLevel (EScoutedLevel ByteProperty)
   *   VehicleGuid (Guid)
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before vehicles.js");

  const SCOUTED_LEVELS = [
    "EScoutedLevel::Hidden",
    "EScoutedLevel::Revealed",
    "EScoutedLevel::Scouted",
    "EScoutedLevel::Advanced",
  ];

  /**
   * Unused / cut vehicles still in the game assets.
   * Paths follow the same /Game/Art/Driveables/…Vehicle_*_C pattern as normal cars.
   * The Plane drives on the ground — it does not fly.
   */
  const EXTRA_VEHICLES = [
    {
      id: "plane",
      label: "Plane (unused)",
      path: "/Game/Art/Driveables/Plane/Vehicle_Plane.Vehicle_Plane_C",
      hint: "Secret unused vehicle. Drivable on land; does not fly.",
    },
    {
      id: "golfcart",
      label: "Golf cart (unused)",
      path: "/Game/Art/Driveables/GolfCart/Vehicle_GolfCart.Vehicle_GolfCart_C",
      hint: "Unused radio-call vehicle (large trunk in some builds).",
    },
    {
      id: "rv",
      label: "RV (unused)",
      path: "/Game/Art/Driveables/RV/Vehicle_RV.Vehicle_RV_C",
      hint: "Unused radio-call vehicle.",
    },
    {
      id: "sport4x4",
      label: "Sport 4-wheeler",
      path: "/Game/Art/Driveables/4wheeler_Sport/Vehicle_4wheeler_Sport.Vehicle_4wheeler_Sport_C",
    },
    {
      id: "coupe",
      label: "Sport coupe",
      path: "/Game/Art/Driveables/Sport_Coupe_Basic/Vehicle_sport_coupe_basic.Vehicle_sport_coupe_basic_C",
    },
    {
      id: "sedan",
      label: "Old sedan (green)",
      path: "/Game/Art/Driveables/Sedan_Old_Basic/Vehicle_Sedan_Old_Basic_green.Vehicle_Sedan_Old_Basic_green_C",
    },
    {
      id: "hatchback",
      label: "Hatchback (black)",
      path: "/Game/Art/Driveables/Hatchback_Basic/Vehicle_Hatchback_Basic_black.Vehicle_Hatchback_Basic_black_C",
    },
    {
      id: "utility",
      label: "Modern utility truck",
      path: "/Game/Art/Driveables/Truck_Modern_Utility/Vehicle_Truck_Modern_Utility.Vehicle_Truck_Modern_Utility_C",
    },
    {
      id: "van",
      label: "Apoc van",
      path: "/Game/Art/Driveables/Van_Apoc/Vehicle_van_apoc.vehicle_van_apoc_C",
    },
    {
      id: "taxi",
      label: "Iconic taxi",
      path: "/Game/Art/Driveables/Sedan_Iconic_Taxi/Vehicle_Sedan_Iconic_Taxi.Vehicle_Sedan_Iconic_Taxi_C",
    },
    {
      id: "suv",
      label: "Modern SUV (blue)",
      path: "/Game/Art/Driveables/SUV_Modern_Apoc/Vehicle_SUV_Modern_Apoc_blue.Vehicle_SUV_Modern_Apoc_blue_C",
    },
    {
      id: "classictruck",
      label: "Classic apoc truck",
      path: "/Game/Art/Driveables/Truck_Classic_Apoc/Vehicle_Truck_Classic_Apoc_Resto_black.Vehicle_Truck_Classic_Apoc_Resto_black_C",
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
      o += 9;
      const v = readStr(buf, o);
      return { next: v.next, name: name.s, type: type.s, value: v.s, valueOff: o, valueBytes: v.bytes };
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
      if (enumName.s === "None") return { next: o + 1, name: name.s, type: type.s, dataLenOff };
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
      return { next: v.next, name: name.s, type: type.s, value: v.s, valueOff: o, valueBytes: v.bytes };
    }
    if (type.s === "StructProperty") {
      const dataLenOff = o;
      const dataLen = i64(buf, o);
      o += 8;
      const st = readStr(buf, o);
      o = st.next + 17;
      return {
        next: o + dataLen,
        name: name.s,
        type: type.s,
        structType: st.s,
        dataLen,
        dataLenOff,
        payloadStart: o,
        payloadEnd: o + dataLen,
      };
    }
    if (type.s === "ArrayProperty") {
      const dataLenOff = o;
      const dataLen = i64(buf, o);
      o += 8;
      const et = readStr(buf, o);
      o = et.next + 1;
      const countOff = o;
      const count = u32(buf, o);
      o += 4;
      return {
        next: o + dataLen - 4,
        name: name.s,
        type: type.s,
        elemType: et.s,
        dataLen,
        dataLenOff,
        count,
        countOff,
        payloadStart: o,
        payloadEnd: o + dataLen - 4,
      };
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
        out.push({ nameOffset: i, type: type.s, typeNext: type.next });
      } catch (_) {}
    }
    return out;
  }

  function findNamedInRange(buf, from, to, propName, typeName) {
    const enc = encodeUeString(propName);
    const end = Math.min(buf.length, to);
    for (let i = from; i <= end - enc.length; i++) {
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
        if (i + enc.length + type.bytes <= to) return i;
      } catch (_) {}
    }
    return -1;
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

  function shortClassName(path) {
    if (!path) return "(unknown)";
    let base = String(path).split("/").pop() || path;
    if (base.includes(".")) base = base.split(".").pop() || base;
    return base.replace(/_C$/, "").replace(/^Vehicle_/i, "").replace(/^vehicle_/i, "");
  }

  function guidToHex(buf, off) {
    let s = "";
    for (let i = 0; i < 16; i++) s += (buf[off + i] & 0xff).toString(16).padStart(2, "0");
    return s;
  }

  function randomGuidBytes() {
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = (Math.random() * 256) | 0;
    return out;
  }

  function writeNewGuid(buf, off) {
    const g = randomGuidBytes();
    for (let i = 0; i < 16; i++) buf[off + i] = g[i];
  }

  function parseVehicleClasses(buf, start) {
    let o = start;
    o = readStr(buf, o).next;
    o = readStr(buf, o).next;
    const dataLenOff = o;
    const dataLen = i64(buf, o);
    o += 8;
    const et = readStr(buf, o);
    o = et.next + 1;
    const countOff = o;
    const count = u32(buf, o);
    o += 4;
    const classes = [];
    for (let i = 0; i < count; i++) {
      const v = readStr(buf, o);
      classes.push({
        index: i,
        path: v.s,
        shortName: shortClassName(v.s),
        valueOff: o,
        valueBytes: v.bytes,
      });
      o = v.next;
    }
    return { start, dataLenOff, dataLen, countOff, count, classes, end: o, elemType: et.s };
  }

  function parseTrunkSlots(buf, invStruct) {
    if (!invStruct || invStruct.payloadStart == null) return { slots: [], count: 0 };
    const slotsOff = findNamedInRange(buf, invStruct.payloadStart, invStruct.payloadEnd, "Slots", "ArrayProperty");
    if (slotsOff < 0) return { slots: [], count: 0, inv: invStruct };

    let o = slotsOff;
    o = readStr(buf, o).next;
    o = readStr(buf, o).next;
    const arrDataLenOff = o;
    const arrDataLen = i64(buf, o);
    o += 8;
    o = readStr(buf, o).next + 1;
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
      inv: invStruct,
      arrDataLenOff,
      arrDataLen,
      countOff,
      count,
      innerLenOff,
      innerLen,
      slots,
    };
  }

  function parseTransform(buf, tf) {
    if (!tf || tf.payloadStart == null) return null;
    let o = tf.payloadStart;
    const rotation = skipProperty(buf, o);
    o = rotation.next;
    const translation = skipProperty(buf, o);
    o = translation.next;
    const scale = skipProperty(buf, o);
    const xyz =
      translation.payloadStart != null && translation.dataLen >= 12
        ? {
            x: readF32(buf, translation.payloadStart),
            y: readF32(buf, translation.payloadStart + 4),
            z: readF32(buf, translation.payloadStart + 8),
            off: translation.payloadStart,
          }
        : null;
    return { rotation, translation, scale, xyz, transform: tf };
  }

  function discoverVehicles(save) {
    const buf = save.properties;
    const hits = findNamedProperties(buf, "VehicleSaves", "ArrayProperty");
    if (!hits.length) {
      save.vehicles = [];
      save.vehicleClasses = [];
      save.vehicleArray = null;
      save.vehicleCollection = null;
      save.vehicleTrunkLibraryIndex = null;
      return [];
    }

    const header = parseStructArrayHeader(buf, hits[0].nameOffset);
    const classHits = findNamedProperties(buf, "VehicleClasses", "ArrayProperty");
    let classInfo = { classes: [], count: 0 };
    if (classHits.length) {
      let best = classHits[0];
      for (const h of classHits) {
        if (Math.abs(h.nameOffset - hits[0].nameOffset) < Math.abs(best.nameOffset - hits[0].nameOffset)) {
          best = h;
        }
      }
      classInfo = parseVehicleClasses(buf, best.nameOffset);
    }

    const collectionHits = findNamedProperties(buf, "VehicleCollection", "StructProperty");
    let collection = null;
    if (collectionHits.length) {
      const name = readStr(buf, collectionHits[0].nameOffset);
      const type = readStr(buf, name.next);
      const dataLenOff = type.next;
      const dataLen = i64(buf, dataLenOff);
      let o = dataLenOff + 8;
      const st = readStr(buf, o);
      o = st.next + 17;
      collection = {
        nameOffset: collectionHits[0].nameOffset,
        dataLenOff,
        dataLen,
        payloadStart: o,
        payloadEnd: o + dataLen,
        structType: st.s,
      };
    }

    let trunkLibOff = -1;
    if (collection) {
      trunkLibOff = findNamedInRange(buf, collection.payloadStart, collection.payloadEnd, "ItemLibrary", "StructProperty");
    }

    if (S.discoverInventories && !save.inventories) {
      try {
        S.discoverInventories(save);
      } catch (_) {}
    }

    let trunkLibraryIndex = null;
    if (trunkLibOff >= 0 && save.inventories) {
      const idx = save.inventories.findIndex((inv) => inv.libOff === trunkLibOff);
      if (idx >= 0) {
        trunkLibraryIndex = idx;
        save.inventories[idx].label = "Vehicle trunk library (" + save.inventories[idx].totalItems + " items)";
      }
    }

    const vehicles = [];
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

      const classIndex = fields.VehicleClassIndex ? fields.VehicleClassIndex.value : null;
      const classPath =
        classIndex != null && classInfo.classes[classIndex] ? classInfo.classes[classIndex].path : null;
      const transform = parseTransform(buf, fields.Transform);
      const zones = [];
      const zoneField = fields.ZoneHealthRatios;
      if (zoneField && zoneField.count != null) {
        for (let z = 0; z < zoneField.count; z++) {
          zones.push({
            index: z,
            value: readF32(buf, zoneField.payloadStart + z * 4),
            off: zoneField.payloadStart + z * 4,
          });
        }
      }

      const trunk = parseTrunkSlots(buf, fields.Inventory);
      const filledSlots = trunk.slots.filter((s) => s.itemIndex != null && s.itemIndex >= 0).length;

      let guidHex = null;
      if (fields.VehicleGuid && fields.VehicleGuid.payloadStart != null) {
        guidHex = guidToHex(buf, fields.VehicleGuid.payloadStart);
      }

      vehicles.push({
        index: i,
        start,
        end: o,
        size: o - start,
        classIndex,
        classIndexOff: fields.VehicleClassIndex ? fields.VehicleClassIndex.valueOff : null,
        classPath,
        shortName: shortClassName(classPath),
        fuel: fields.FuelRatio ? fields.FuelRatio.value : null,
        fuelOff: fields.FuelRatio ? fields.FuelRatio.valueOff : null,
        engine: fields.EngineHealthRatio ? fields.EngineHealthRatio.value : null,
        engineOff: fields.EngineHealthRatio ? fields.EngineHealthRatio.valueOff : null,
        frame: fields.FrameHealthRatio ? fields.FrameHealthRatio.value : null,
        frameOff: fields.FrameHealthRatio ? fields.FrameHealthRatio.valueOff : null,
        gasTank: fields.GasTankHealthRatio ? fields.GasTankHealthRatio.value : null,
        gasTankOff: fields.GasTankHealthRatio ? fields.GasTankHealthRatio.valueOff : null,
        zones,
        transform,
        scoutedLevel: fields.ScoutedLevel ? fields.ScoutedLevel.value : null,
        scouted: fields.ScoutedLevel
          ? {
              value: fields.ScoutedLevel.value,
              valueOff: fields.ScoutedLevel.valueOff,
              valueBytes: fields.ScoutedLevel.valueBytes,
              dataLenOff: fields.ScoutedLevel.dataLenOff,
            }
          : null,
        indicatorTint: fields.IndicatorTint ? fields.IndicatorTint.value : null,
        guidHex,
        guidOff: fields.VehicleGuid ? fields.VehicleGuid.payloadStart : null,
        trunk,
        filledSlots,
        inventory: fields.Inventory || null,
      });
    }

    save.vehicles = vehicles;
    save.vehicleClasses = classInfo.classes;
    save.vehicleClassArray = classInfo;
    save.vehicleArray = header;
    save.vehicleCollection = collection;
    save.vehicleTrunkLibraryIndex = trunkLibraryIndex;
    save.vehicleTrunkLibOff = trunkLibOff >= 0 ? trunkLibOff : null;
    return vehicles;
  }

  function resolveVehicle(save, index) {
    if (!save.vehicles) discoverVehicles(save);
    const v = save.vehicles[index];
    if (!v) throw new Error("Invalid vehicle index");
    return v;
  }

  function clamp01(v) {
    v = Number(v);
    if (!Number.isFinite(v)) throw new Error("Invalid number");
    return Math.max(0, Math.min(1, v));
  }

  function setFloatField(save, off, value) {
    if (off == null) throw new Error("Missing float field");
    writeF32(save.properties, off, clamp01(value));
    save.dirty = true;
  }

  function setVehicleFuel(save, index, value) {
    const v = resolveVehicle(save, index);
    setFloatField(save, v.fuelOff, value);
    v.fuel = clamp01(value);
  }

  function setVehicleEngine(save, index, value) {
    const v = resolveVehicle(save, index);
    setFloatField(save, v.engineOff, value);
    v.engine = clamp01(value);
  }

  function setVehicleFrame(save, index, value) {
    const v = resolveVehicle(save, index);
    setFloatField(save, v.frameOff, value);
    v.frame = clamp01(value);
  }

  function setVehicleGasTank(save, index, value) {
    const v = resolveVehicle(save, index);
    setFloatField(save, v.gasTankOff, value);
    v.gasTank = clamp01(value);
  }

  function repairVehicle(save, index) {
    const v = resolveVehicle(save, index);
    if (v.fuelOff != null) {
      writeF32(save.properties, v.fuelOff, 1);
      v.fuel = 1;
    }
    if (v.engineOff != null) {
      writeF32(save.properties, v.engineOff, 1);
      v.engine = 1;
    }
    if (v.frameOff != null) {
      writeF32(save.properties, v.frameOff, 1);
      v.frame = 1;
    }
    if (v.gasTankOff != null) {
      writeF32(save.properties, v.gasTankOff, 1);
      v.gasTank = 1;
    }
    for (const z of v.zones || []) {
      writeF32(save.properties, z.off, 1);
      z.value = 1;
    }
    save.dirty = true;
    return true;
  }

  function repairAllVehicles(save) {
    discoverVehicles(save);
    let n = 0;
    for (let i = 0; i < save.vehicles.length; i++) {
      repairVehicle(save, i);
      n++;
    }
    return n;
  }

  function refuelVehicle(save, index, ratio) {
    ratio = ratio == null ? 1 : clamp01(ratio);
    setVehicleFuel(save, index, ratio);
  }

  function refuelAllVehicles(save, ratio) {
    discoverVehicles(save);
    ratio = ratio == null ? 1 : clamp01(ratio);
    let n = 0;
    for (const v of save.vehicles) {
      if (v.fuelOff == null) continue;
      writeF32(save.properties, v.fuelOff, ratio);
      v.fuel = ratio;
      n++;
    }
    save.dirty = true;
    return n;
  }

  function setVehicleClassIndex(save, index, classIndex) {
    const v = resolveVehicle(save, index);
    if (v.classIndexOff == null) throw new Error("No VehicleClassIndex");
    classIndex = Number(classIndex) | 0;
    if (classIndex < 0 || classIndex >= (save.vehicleClasses || []).length) {
      throw new Error("Class index out of range 0.." + ((save.vehicleClasses || []).length - 1));
    }
    writeI32(save.properties, v.classIndexOff, classIndex);
    v.classIndex = classIndex;
    v.classPath = save.vehicleClasses[classIndex].path;
    v.shortName = save.vehicleClasses[classIndex].shortName;
    save.dirty = true;
  }

  function setVehicleClassPath(save, classIndex, newPath) {
    discoverVehicles(save);
    const info = save.vehicleClassArray;
    const cls = info && info.classes[classIndex];
    if (!cls) throw new Error("Invalid class index");
    newPath = String(newPath || "").trim();
    if (!newPath) throw new Error("Empty class path");
    if (cls.path === newPath) return false;

    const newStr = encodeUeString(newPath);
    const delta = newStr.length - cls.valueBytes;
    let buf = spliceBuf(save.properties, cls.valueOff, cls.valueBytes, newStr);
    writeI64(buf, info.dataLenOff, info.dataLen + delta);
    if (delta) buf = adjustAncestorSizes(buf, cls.valueOff, delta, [info.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverVehicles(save);
    return true;
  }

  function addVehicleClass(save, classPath) {
    classPath = String(classPath || "").trim();
    if (!classPath.includes("/Game/")) {
      throw new Error("Class path should look like /Game/Art/Driveables/...");
    }
    discoverVehicles(save);
    const info = save.vehicleClassArray;
    if (!info || info.countOff == null) throw new Error("VehicleClasses array missing");

    const existing = (info.classes || []).findIndex((c) => c.path === classPath);
    if (existing >= 0) return existing;

    const encoded = encodeUeString(classPath);
    const insertAt = info.classes.length
      ? info.classes[info.classes.length - 1].valueOff + info.classes[info.classes.length - 1].valueBytes
      : info.countOff + 4;
    let buf = spliceBuf(save.properties, insertAt, 0, encoded);
    writeU32(buf, info.countOff, info.count + 1);
    writeI64(buf, info.dataLenOff, info.dataLen + encoded.length);
    buf = adjustAncestorSizes(buf, insertAt, encoded.length, [info.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverVehicles(save);
    return save.vehicleClasses.length - 1;
  }

  function ensureVehicleClass(save, classPath) {
    return addVehicleClass(save, classPath);
  }

  function applyVehicleExtra(save, vehicleIndex, extraIdOrPath) {
    let path = String(extraIdOrPath || "").trim();
    const preset = EXTRA_VEHICLES.find((e) => e.id === path || e.path === path);
    if (preset) path = preset.path;
    if (!path.includes("/Game/")) throw new Error("Unknown extra vehicle (use plane / golfcart / rv or a /Game/ path)");

    const classIndex = ensureVehicleClass(save, path);
    setVehicleClassIndex(save, vehicleIndex, classIndex);
    try {
      repairVehicle(save, vehicleIndex);
    } catch (_) {}
    try {
      setVehicleScoutedLevel(save, vehicleIndex, "EScoutedLevel::Advanced");
    } catch (_) {}
    discoverVehicles(save);
    return {
      classIndex,
      path,
      shortName: shortClassName(path),
      preset: preset || null,
    };
  }

  function spawnVehicleExtraNearBase(save, extraIdOrPath) {
    discoverVehicles(save);
    if (!save.vehicles || !save.vehicles.length) throw new Error("Need at least one vehicle to clone");
    const src = save.vehicles.length - 1;
    const idx = duplicateVehicle(save, src);
    const applied = applyVehicleExtra(save, idx, extraIdOrPath);
    try {
      const anchor = guessBaseAnchor(save);
      const n = save.vehicles.length;
      setVehicleTranslation(
        save,
        idx,
        anchor.x + 400 + (n % 5) * 350,
        anchor.y + 400 + Math.floor(n / 5) * 350,
        anchor.z + 40
      );
    } catch (_) {}
    discoverVehicles(save);
    return { index: idx, ...applied };
  }

  function setVehicleTranslation(save, index, x, y, z) {
    const v = resolveVehicle(save, index);
    if (!v.transform || !v.transform.xyz) throw new Error("No translation");
    const off = v.transform.xyz.off;
    writeF32(save.properties, off, Number(x));
    writeF32(save.properties, off + 4, Number(y));
    writeF32(save.properties, off + 8, Number(z));
    v.transform.xyz.x = Number(x);
    v.transform.xyz.y = Number(y);
    v.transform.xyz.z = Number(z);
    save.dirty = true;
  }

  function guessBaseAnchor(save) {
    discoverVehicles(save);
    const vehicles = save.vehicles || [];
    if (!vehicles.length) throw new Error("No vehicles");

    const scored = vehicles
      .filter((v) => v.transform && v.transform.xyz)
      .map((v) => {
        let score = v.filledSlots * 2;
        if (v.scoutedLevel && /Scouted|Advanced/.test(v.scoutedLevel)) score += 10;
        if (v.fuel > 0.05) score += 5;
        if (v.engine > 0.4) score += 2;
        return { v, score };
      })
      .sort((a, b) => b.score - a.score);

    if (!scored.length) throw new Error("No vehicle positions");
    const best = scored[0].v;
    const near = vehicles.filter((v) => {
      if (!v.transform || !v.transform.xyz) return false;
      const dx = v.transform.xyz.x - best.transform.xyz.x;
      const dy = v.transform.xyz.y - best.transform.xyz.y;
      return dx * dx + dy * dy < 25000 * 25000;
    });
    if (near.length >= 2) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const v of near) {
        sx += v.transform.xyz.x;
        sy += v.transform.xyz.y;
        sz += v.transform.xyz.z;
      }
      return {
        x: sx / near.length,
        y: sy / near.length,
        z: sz / near.length,
        sourceIndex: best.index,
        clusterSize: near.length,
      };
    }
    return {
      x: best.transform.xyz.x,
      y: best.transform.xyz.y,
      z: best.transform.xyz.z,
      sourceIndex: best.index,
      clusterSize: 1,
    };
  }

  function teleportVehiclesNearBase(save, opts) {
    opts = opts || {};
    const spacing = opts.spacing == null ? 400 : Number(opts.spacing);
    const anchor = opts.anchor || guessBaseAnchor(save);
    discoverVehicles(save);
    let n = 0;
    for (let i = 0; i < save.vehicles.length; i++) {
      const v = save.vehicles[i];
      if (!v.transform || !v.transform.xyz) continue;
      const x = anchor.x + (i % 5) * spacing;
      const y = anchor.y + Math.floor(i / 5) * spacing;
      const z = anchor.z;
      setVehicleTranslation(save, i, x, y, z);
      n++;
    }
    return { count: n, anchor };
  }

  function teleportVehicleTo(save, index, targetIndex) {
    const target = resolveVehicle(save, targetIndex);
    if (!target.transform || !target.transform.xyz) throw new Error("Target has no position");
    const t = target.transform.xyz;
    setVehicleTranslation(save, index, t.x + 350, t.y, t.z);
  }

  function setVehicleScoutedLevelAt(save, vehicle, enumValue, rediscover) {
    enumValue = String(enumValue || "").trim();
    if (!vehicle || !vehicle.scouted) throw new Error("ScoutedLevel unavailable");
    if (vehicle.scoutedLevel === enumValue) return false;
    const newStr = encodeUeString(enumValue);
    const delta = newStr.length - vehicle.scouted.valueBytes;
    let buf = spliceBuf(save.properties, vehicle.scouted.valueOff, vehicle.scouted.valueBytes, newStr);
    writeI64(buf, vehicle.scouted.dataLenOff, newStr.length);
    if (delta) buf = adjustAncestorSizes(buf, vehicle.scouted.valueOff, delta, [vehicle.scouted.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    if (rediscover !== false) discoverVehicles(save);
    return true;
  }

  function setVehicleScoutedLevel(save, index, enumValue) {
    if (!/^EScoutedLevel::[A-Za-z]+$/.test(String(enumValue || ""))) {
      throw new Error("Level must look like EScoutedLevel::Advanced");
    }
    const v = resolveVehicle(save, index);
    return setVehicleScoutedLevelAt(save, v, enumValue, true);
  }

  function revealAllVehicles(save, level) {
    level = level || "EScoutedLevel::Advanced";
    discoverVehicles(save);
    let n = 0;
    for (let i = save.vehicles.length - 1; i >= 0; i--) {
      if (setVehicleScoutedLevelAt(save, save.vehicles[i], level, false)) n++;
    }
    discoverVehicles(save);
    return n;
  }

  function setTrunkSlotIndex(save, vehicleIndex, slotIndex, itemOrderIndex) {
    const v = resolveVehicle(save, vehicleIndex);
    const slot = v.trunk && v.trunk.slots[slotIndex];
    if (!slot || slot.itemIndexOff == null) throw new Error("Invalid trunk slot");
    const n = Number(itemOrderIndex);
    if (!Number.isFinite(n) || n < -1) throw new Error("Index must be >= -1");
    writeI32(save.properties, slot.itemIndexOff, n | 0);
    slot.itemIndex = n | 0;
    save.dirty = true;
  }

  function clearTrunk(save, vehicleIndex) {
    const v = resolveVehicle(save, vehicleIndex);
    let n = 0;
    for (const slot of (v.trunk && v.trunk.slots) || []) {
      if (slot.itemIndexOff == null) continue;
      writeI32(save.properties, slot.itemIndexOff, -1);
      slot.itemIndex = -1;
      n++;
    }
    v.filledSlots = 0;
    save.dirty = true;
    return n;
  }

  function duplicateVehicle(save, index) {
    discoverVehicles(save);
    const src = save.vehicles[index];
    if (!src) throw new Error("Invalid vehicle index");
    const header = save.vehicleArray;
    if (!header) throw new Error("VehicleSaves header missing");

    const clone = save.properties.slice(src.start, src.end);
    if (src.guidOff != null) {
      const localGuid = src.guidOff - src.start;
      if (localGuid >= 0 && localGuid + 16 <= clone.length) writeNewGuid(clone, localGuid);
    }

    const insertEnd = save.vehicles[save.vehicles.length - 1].end;
    const delta = clone.length;
    let buf = spliceBuf(save.properties, insertEnd, 0, clone);
    writeU32(buf, header.countOff, header.count + 1);
    writeI64(buf, header.dataLenOff, header.dataLen + delta);
    writeI64(buf, header.innerLenOff, header.innerLen + delta);
    buf = adjustAncestorSizes(buf, insertEnd, delta, [header.dataLenOff, header.innerLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverVehicles(save);
    return save.vehicles.length - 1;
  }

  function removeVehicle(save, index) {
    discoverVehicles(save);
    const v = save.vehicles[index];
    if (!v) throw new Error("Invalid vehicle index");
    if (save.vehicles.length <= 1) throw new Error("Keep at least one vehicle");
    const header = save.vehicleArray;
    const size = v.end - v.start;
    let buf = spliceBuf(save.properties, v.start, size, null);
    writeU32(buf, header.countOff, header.count - 1);
    writeI64(buf, header.dataLenOff, header.dataLen - size);
    writeI64(buf, header.innerLenOff, header.innerLen - size);
    buf = adjustAncestorSizes(buf, v.start, -size, [header.dataLenOff, header.innerLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverVehicles(save);
    return save.vehicles.length;
  }

  function swapVehiclePositions(save, a, b) {
    const va = resolveVehicle(save, a);
    const vb = resolveVehicle(save, b);
    if (!va.transform || !va.transform.xyz || !vb.transform || !vb.transform.xyz) {
      throw new Error("Both vehicles need positions");
    }
    const ax = va.transform.xyz.x;
    const ay = va.transform.xyz.y;
    const az = va.transform.xyz.z;
    setVehicleTranslation(save, a, vb.transform.xyz.x, vb.transform.xyz.y, vb.transform.xyz.z);
    setVehicleTranslation(save, b, ax, ay, az);
  }

  function vehicleScoutedLevelLabel(v) {
    if (!v) return "—";
    return String(v).replace(/^EScoutedLevel::/, "");
  }

  function resolveTrunkItemLabel(save, itemOrderIndex) {
    if (itemOrderIndex == null || itemOrderIndex < 0) return "(empty)";
    if (!save.inventories) {
      try {
        if (S.discoverInventories) S.discoverInventories(save);
      } catch (_) {}
    }
    const libIdx = save.vehicleTrunkLibraryIndex;
    if (libIdx == null || !save.inventories[libIdx]) return "ItemOrder #" + itemOrderIndex;
    if (S.resolveItemOrderIndex) {
      const r = S.resolveItemOrderIndex(save.inventories[libIdx], itemOrderIndex);
      if (r && r.name) return r.name;
    }
    return "ItemOrder #" + itemOrderIndex;
  }

  S.VEHICLE_SCOUTED_LEVELS = SCOUTED_LEVELS;
  S.EXTRA_VEHICLES = EXTRA_VEHICLES;
  S.discoverVehicles = discoverVehicles;
  S.repairVehicle = repairVehicle;
  S.repairAllVehicles = repairAllVehicles;
  S.refuelVehicle = refuelVehicle;
  S.refuelAllVehicles = refuelAllVehicles;
  S.setVehicleFuel = setVehicleFuel;
  S.setVehicleEngine = setVehicleEngine;
  S.setVehicleFrame = setVehicleFrame;
  S.setVehicleGasTank = setVehicleGasTank;
  S.setVehicleClassIndex = setVehicleClassIndex;
  S.setVehicleClassPath = setVehicleClassPath;
  S.addVehicleClass = addVehicleClass;
  S.ensureVehicleClass = ensureVehicleClass;
  S.applyVehicleExtra = applyVehicleExtra;
  S.spawnVehicleExtraNearBase = spawnVehicleExtraNearBase;
  S.setVehicleTranslation = setVehicleTranslation;
  S.guessBaseAnchor = guessBaseAnchor;
  S.teleportVehiclesNearBase = teleportVehiclesNearBase;
  S.teleportVehicleTo = teleportVehicleTo;
  S.setVehicleScoutedLevel = setVehicleScoutedLevel;
  S.revealAllVehicles = revealAllVehicles;
  S.setTrunkSlotIndex = setTrunkSlotIndex;
  S.clearTrunk = clearTrunk;
  S.duplicateVehicle = duplicateVehicle;
  S.removeVehicle = removeVehicle;
  S.swapVehiclePositions = swapVehiclePositions;
  S.vehicleScoutedLevelLabel = vehicleScoutedLevelLabel;
  S.shortVehicleClassName = shortClassName;
  S.resolveTrunkItemLabel = resolveTrunkItemLabel;
})();
