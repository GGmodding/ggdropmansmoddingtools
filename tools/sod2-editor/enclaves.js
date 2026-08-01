(() => {
  "use strict";

  /**
   * SoD2 enclave discovery / editing.
   * EnclaveSave blocks are keyed off BaseGuid + Influence; flags and type follow shortly after.
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before enclaves.js");

  const ENCLAVE_TYPES = [
    "EEnclaveType::Default",
    "EEnclaveType::Legacy",
    "EEnclaveType::AmbientMission",
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

  function nearestAfter(buf, from, propName, typeName, maxFwd) {
    const enc = encodeUeString(propName);
    const end = Math.min(buf.length, from + maxFwd);
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
        return i;
      } catch (_) {}
    }
    return -1;
  }

  function readIntProp(buf, nameOff) {
    const name = readStr(buf, nameOff);
    const type = readStr(buf, name.next);
    const dataLenOff = type.next;
    const valueOff = type.next + 9;
    return {
      nameOff,
      dataLenOff,
      valueOff,
      value: i32(buf, valueOff),
    };
  }

  function readBoolProp(buf, nameOff) {
    const name = readStr(buf, nameOff);
    const type = readStr(buf, name.next);
    const valueOff = type.next + 8;
    return {
      nameOff,
      valueOff,
      value: !!buf[valueOff],
    };
  }

  /** SoD2 named ByteProperty: dataLen, enumTypeName, pad(0), enumValueName */
  function readByteEnumProp(buf, nameOff) {
    const name = readStr(buf, nameOff);
    const type = readStr(buf, name.next);
    const dataLenOff = type.next;
    const dataLen = i64(buf, dataLenOff);
    let o = dataLenOff + 8;
    const enumType = readStr(buf, o);
    o = enumType.next;
    if (enumType.s === "None") {
      return { nameOff, dataLenOff, dataLen, enumType: "None", value: null, valueOff: o, valueBytes: 1 };
    }
    o += 1; // pad
    const value = readStr(buf, o);
    return {
      nameOff,
      dataLenOff,
      dataLen,
      enumType: enumType.s,
      value: value.s,
      valueOff: o,
      valueBytes: value.bytes,
    };
  }

  function readNameOrStrProp(buf, nameOff) {
    const name = readStr(buf, nameOff);
    const type = readStr(buf, name.next);
    const dataLenOff = type.next;
    const valueOff = type.next + 9;
    const value = readStr(buf, valueOff);
    return {
      nameOff,
      dataLenOff,
      valueOff,
      valueBytes: value.bytes,
      value: value.s,
    };
  }

  function extractTextBits(buf, nameOff) {
    const name = readStr(buf, nameOff);
    const type = readStr(buf, name.next);
    if (type.s !== "TextProperty") return {};
    const dataLenOff = type.next;
    const dataLen = i64(buf, dataLenOff);
    const start = type.next + 9;
    const end = start + dataLen;
    const strs = [];
    let o = start;
    while (o + 4 < end) {
      const len = u32(buf, o);
      if (len >= 2 && len < 400 && o + 4 + len <= end && buf[o + 4 + len - 1] === 0) {
        const s = asciiAt(buf, o + 4, len - 1);
        if (/^[\x20-\x7E]+$/.test(s) && s.length > 1) {
          strs.push({ s, off: o, bytes: 4 + len });
          o += 4 + len;
          continue;
        }
      }
      o++;
    }
    const loc = strs.find((x) => /Dayton\.|EnclaveName|Mission\./i.test(x.s));
    const guid = strs.find((x) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x.s));
    const plain =
      [...strs]
        .reverse()
        .find(
          (x) =>
            x.s.length >= 2 &&
            !/Dayton\.|EnclaveName|^[0-9a-f-]{36}$/i.test(x.s) &&
            !/^(None|Name|ru-RU)$/i.test(x.s) &&
            (/[ ]/.test(x.s) || /^[A-Za-z][A-Za-z0-9 '._-]{1,48}$/.test(x.s))
        ) || null;
    return {
      dataLenOff,
      dataLen,
      locKey: loc ? loc.s : null,
      guid: guid ? guid.s : null,
      display: plain ? plain.s : null,
      displayOff: plain ? plain.off : null,
      displayBytes: plain ? plain.bytes : null,
      strings: strs.map((x) => x.s),
    };
  }

  function relationshipHint(restockPath, source, schemaPath) {
    const blob = [restockPath, source, schemaPath].filter(Boolean).join(" ");
    if (/Hostile|Aggressive|War/i.test(blob)) return "Hostile?";
    if (/Allied|Ally/i.test(blob)) return "Allied?";
    if (/Friendly|Friend/i.test(blob)) return "Friendly?";
    if (/Neutral/i.test(blob)) return "Neutral?";
    return null;
  }

  function shortPath(p) {
    if (!p) return null;
    const parts = String(p).split("/");
    return parts[parts.length - 1] || p;
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
        const payloadStart = o;
        const payloadEnd = payloadStart + dataLen;
        if (point >= payloadStart && point < payloadEnd) {
          patches.push({ off: dataLenOff, next: dataLen + delta });
        }
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
        const payloadStart = o;
        const payloadEnd = payloadStart + dataLen;
        if (point >= payloadStart && point < payloadEnd) {
          patches.push({ off: dataLenOff, next: dataLen + delta });
        }
      } catch (_) {}
    }

    for (const p of patches) writeI64(buf, p.off, p.next);
    return buf;
  }

  function parseEnclaveAt(buf, baseGuidOff, index) {
    const inflOff = nearestAfter(buf, baseGuidOff, "Influence", "IntProperty", 160);
    if (inflOff < 0) return null;

    const depsOff = nearestAfter(buf, baseGuidOff, "NumMemberDepartures", "IntProperty", 280);
    const deathsOff = nearestAfter(buf, baseGuidOff, "NumMemberDeaths", "IntProperty", 340);
    const restockOff = nearestAfter(buf, baseGuidOff, "RestockSchema", "AssetObjectProperty", 900);
    const mapOff = nearestAfter(buf, baseGuidOff, "bDisplayOnMap", "BoolProperty", 1600);
    const typeOff = nearestAfter(buf, baseGuidOff, "EnclaveType", "ByteProperty", 1700);
    const prestigeOff = nearestAfter(buf, baseGuidOff, "bTradesUsingPrestige", "BoolProperty", 2000);
    const disbandOff = nearestAfter(buf, baseGuidOff, "bDisbandsOnAnyRecruit", "BoolProperty", 2100);
    const hideOff = nearestAfter(buf, baseGuidOff, "bHideRecruitability", "BoolProperty", 2200);
    const idOff = nearestAfter(buf, baseGuidOff, "ID", "IntProperty", 4500);
    const tagOff = nearestAfter(buf, baseGuidOff, "Tag", "NameProperty", 4600);
    const sourceOff = nearestAfter(buf, baseGuidOff, "Source", "StrProperty", 4700);
    const schemaOff = nearestAfter(buf, baseGuidOff, "SchemaPath", "StrProperty", 4900);
    const dnOff = nearestAfter(buf, baseGuidOff, "DisplayName", "TextProperty", 5200);
    const descOff = nearestAfter(buf, baseGuidOff, "Description", "TextProperty", 5600);

    const influence = readIntProp(buf, inflOff);
    const departures = depsOff >= 0 ? readIntProp(buf, depsOff) : null;
    const deaths = deathsOff >= 0 ? readIntProp(buf, deathsOff) : null;
    const restock = restockOff >= 0 ? readNameOrStrProp(buf, restockOff) : null;
    const displayOnMap = mapOff >= 0 ? readBoolProp(buf, mapOff) : null;
    const enclaveType = typeOff >= 0 ? readByteEnumProp(buf, typeOff) : null;
    const tradesPrestige = prestigeOff >= 0 ? readBoolProp(buf, prestigeOff) : null;
    const disbandsOnRecruit = disbandOff >= 0 ? readBoolProp(buf, disbandOff) : null;
    const hideRecruitability = hideOff >= 0 ? readBoolProp(buf, hideOff) : null;
    const id = idOff >= 0 ? readIntProp(buf, idOff) : null;
    const tag = tagOff >= 0 ? readNameOrStrProp(buf, tagOff) : null;
    const source = sourceOff >= 0 ? readNameOrStrProp(buf, sourceOff) : null;
    const schema = schemaOff >= 0 ? readNameOrStrProp(buf, schemaOff) : null;
    const displayName = dnOff >= 0 ? extractTextBits(buf, dnOff) : {};
    const description = descOff >= 0 ? extractTextBits(buf, descOff) : {};

    const isCommunity =
      !enclaveType ||
      (source && /CommunityEnclave/i.test(source.value)) ||
      (displayName.locKey && /PlayerCommunity/i.test(displayName.locKey));

    const label =
      displayName.display ||
      (tag && tag.value && tag.value !== "None" ? tag.value : null) ||
      (schema ? shortPath(schema.value) : null) ||
      (isCommunity ? "Your community" : "Enclave #" + (index + 1));

    const descText =
      description.display ||
      (description.strings || []).find((s) => s.length > 24 && /[a-zA-Z]/.test(s)) ||
      null;

    return {
      index,
      baseGuidOff,
      label,
      isCommunity,
      influence,
      departures,
      deaths,
      restock,
      displayOnMap,
      enclaveType,
      tradesPrestige,
      disbandsOnRecruit,
      hideRecruitability,
      id,
      tag,
      source,
      schema,
      displayName,
      description: descText,
      relationshipHint: relationshipHint(
        restock && restock.value,
        source && source.value,
        schema && schema.value
      ),
    };
  }

  function discoverEnclaves(save) {
    const buf = save.properties;
    const bases = findNamedProperties(buf, "BaseGuid", "StructProperty");
    const enclaves = [];
    for (let i = 0; i < bases.length; i++) {
      const e = parseEnclaveAt(buf, bases[i].nameOffset, enclaves.length);
      if (e) enclaves.push(e);
    }
    save.enclaves = enclaves;
    return enclaves;
  }

  function requireEnclave(save, index) {
    if (!save.enclaves) discoverEnclaves(save);
    const e = save.enclaves[index];
    if (!e) throw new Error("Invalid enclave index");
    return e;
  }

  function setEnclaveInt(save, index, field, value) {
    const e = requireEnclave(save, index);
    const prop = e[field];
    if (!prop || prop.valueOff == null) throw new Error("Field unavailable: " + field);
    const n = Math.max(0, Math.min(999999, Number(value) | 0));
    writeI32(save.properties, prop.valueOff, n);
    prop.value = n;
    save.dirty = true;
    // Keep community Influence field in sync when this is the community target
    if (field === "influence" && save.fields && save.fields.influence && save.fields.influence.hits) {
      for (const hit of save.fields.influence.hits) {
        if (hit.valueOffset === prop.valueOff) hit.value = n;
      }
      if (save.fields.influence.hit && save.fields.influence.hit.valueOffset === prop.valueOff) {
        save.fields.influence.value = n;
      }
    }
  }

  function setEnclaveBool(save, index, field, value) {
    const e = requireEnclave(save, index);
    const prop = e[field];
    if (!prop || prop.valueOff == null) throw new Error("Field unavailable: " + field);
    const bit = value ? 1 : 0;
    save.properties[prop.valueOff] = bit;
    prop.value = !!bit;
    save.dirty = true;
  }

  function setEnclaveType(save, index, enumValue) {
    enumValue = String(enumValue || "").trim();
    if (!/^EEnclaveType::[A-Za-z0-9_]+$/.test(enumValue)) {
      throw new Error("Type must look like EEnclaveType::Default");
    }
    const e = requireEnclave(save, index);
    const prop = e.enclaveType;
    if (!prop || prop.valueOff == null) throw new Error("EnclaveType unavailable");

    const newStr = encodeUeString(enumValue);
    const delta = newStr.length - prop.valueBytes;
    let buf = spliceBuf(save.properties, prop.valueOff, prop.valueBytes, newStr);
    // SoD2 named ByteProperty dataLen equals the enum value UE-string byte length.
    writeI64(buf, prop.dataLenOff, newStr.length);
    if (delta) buf = adjustAncestorSizes(buf, prop.valueOff, delta, [prop.dataLenOff]);

    save.properties = buf;
    save.dirty = true;
    discoverEnclaves(save);
  }

  function setEnclaveDisplayName(save, index, newName) {
    newName = String(newName || "").trim();
    if (!newName || newName.length > 80) throw new Error("Display name must be 1–80 characters");
    if (!/^[\x20-\x7E]+$/.test(newName)) throw new Error("Display name must be ASCII");

    const e = requireEnclave(save, index);
    const dn = e.displayName;
    if (!dn || dn.displayOff == null) throw new Error("No editable display string on this enclave");

    const newStr = encodeUeString(newName);
    const delta = newStr.length - dn.displayBytes;
    let buf = spliceBuf(save.properties, dn.displayOff, dn.displayBytes, newStr);
    writeI64(buf, dn.dataLenOff, dn.dataLen + delta);
    if (delta) buf = adjustAncestorSizes(buf, dn.displayOff, delta, [dn.dataLenOff]);

    save.properties = buf;
    save.dirty = true;
    discoverEnclaves(save);
  }

  function bulkSetEnclaveBools(save, fields) {
    discoverEnclaves(save);
    let n = 0;
    for (let i = 0; i < save.enclaves.length; i++) {
      const e = save.enclaves[i];
      if (e.isCommunity) continue;
      for (const [field, value] of Object.entries(fields)) {
        if (e[field] && e[field].valueOff != null) {
          setEnclaveBool(save, i, field, value);
          n++;
        }
      }
    }
    return n;
  }

  function bulkSetEnclaveInfluence(save, value, opts) {
    opts = opts || {};
    discoverEnclaves(save);
    let n = 0;
    for (let i = 0; i < save.enclaves.length; i++) {
      const e = save.enclaves[i];
      if (opts.skipCommunity && e.isCommunity) continue;
      if (!e.influence) continue;
      setEnclaveInt(save, i, "influence", value);
      n++;
    }
    return n;
  }

  S.ENCLAVE_TYPES = ENCLAVE_TYPES;
  S.discoverEnclaves = discoverEnclaves;
  S.setEnclaveInt = setEnclaveInt;
  S.setEnclaveBool = setEnclaveBool;
  S.setEnclaveType = setEnclaveType;
  S.setEnclaveDisplayName = setEnclaveDisplayName;
  S.bulkSetEnclaveBools = bulkSetEnclaveBools;
  S.bulkSetEnclaveInfluence = bulkSetEnclaveInfluence;
})();
