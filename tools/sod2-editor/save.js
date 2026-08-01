(() => {
  "use strict";

  /**
   * State of Decay 2 GVAS save codec.
   * Header / LZ4 block layout based on IncredulousMonk/sod2-tools (sod2gvas.md).
   */

  const SAVE_TYPE = "DaytonSaveGame";

  /** CommunityResources map keys (float amounts). */
  const RESOURCE_KEYS = {
    food: 0,
    meds: 1,
    ammo: 2,
    materials: 3,
    fuel: 4,
    parts: 5,
    prestige: 6,
  };

  const STOCKPILE_IDS = ["food", "meds", "ammo", "materials", "fuel", "parts"];

  const COMMUNITY_FIELDS = [
    { id: "influence", label: "Influence", kind: "influence", min: 0, max: 9999, group: "core" },
    { id: "daysSurvived", label: "Days survived", kind: "intName", names: ["DaysSurvived"], min: 0, max: 99999, group: "core" },
    { id: "timeOfDay", label: "Time of day", kind: "floatName", names: ["TimeOfDay"], min: 0, max: 100000, group: "core", hint: "Raw game units (often minutes-scale)" },
    { id: "prestige", label: "Prestige", kind: "resource", resourceKey: RESOURCE_KEYS.prestige, min: 0, max: 999999, group: "stockpile" },
    { id: "food", label: "Food", kind: "resource", resourceKey: RESOURCE_KEYS.food, min: 0, max: 9999, group: "stockpile" },
    { id: "meds", label: "Meds", kind: "resource", resourceKey: RESOURCE_KEYS.meds, min: 0, max: 9999, group: "stockpile" },
    { id: "ammo", label: "Ammo", kind: "resource", resourceKey: RESOURCE_KEYS.ammo, min: 0, max: 9999, group: "stockpile" },
    { id: "materials", label: "Materials", kind: "resource", resourceKey: RESOURCE_KEYS.materials, min: 0, max: 99999, group: "stockpile" },
    { id: "fuel", label: "Fuel", kind: "resource", resourceKey: RESOURCE_KEYS.fuel, min: 0, max: 9999, group: "stockpile" },
    { id: "parts", label: "Parts (key 5)", kind: "resource", resourceKey: RESOURCE_KEYS.parts, min: 0, max: 9999, group: "stockpile", hint: "CommunityResources index 5 — confirm in-game" },
    { id: "plagueHearts", label: "Max plague hearts", kind: "intName", names: ["MaxPlagueNodes"], min: 0, max: 99, group: "threats" },
    { id: "plagueWallSightings", label: "Plague wall sightings", kind: "intName", names: ["PlagueWallSightings"], min: 0, max: 999, group: "threats" },
    { id: "infestationsToday", label: "Infestations today", kind: "intName", names: ["InfestationSpreadCountToday"], min: 0, max: 99, group: "threats" },
    { id: "morale", label: "Morale (if present)", kind: "floatName", names: ["CurrentMorale", "CommunityMorale", "MoraleValue", "AverageMorale"], min: -100, max: 100, group: "morale" },
    { id: "moraleBeds", label: "Morale beds score", kind: "floatName", names: ["MoraleBeds", "BedsMorale"], min: -100, max: 100, group: "morale" },
  ];

  const INT_TYPES = ["IntProperty", "UInt32Property"];
  const FLOAT_TYPES = ["FloatProperty"];

  function u16(buf, o) {
    return buf[o] | (buf[o + 1] << 8);
  }

  function u32(buf, o) {
    return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  }

  function i32(buf, o) {
    return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) | 0;
  }

  function writeU32(buf, o, v) {
    v = v >>> 0;
    buf[o] = v & 0xff;
    buf[o + 1] = (v >>> 8) & 0xff;
    buf[o + 2] = (v >>> 16) & 0xff;
    buf[o + 3] = (v >>> 24) & 0xff;
  }

  function writeI32(buf, o, v) {
    writeU32(buf, o, v | 0);
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

  function readF32(buf, o) {
    return new DataView(buf.buffer, buf.byteOffset + o, 4).getFloat32(0, true);
  }

  function asciiAt(buf, o, len) {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(buf[o + i]);
    return s;
  }

  function readUeString(buf, o) {
    if (o + 4 > buf.length) throw new Error("Truncated UE string length");
    const len = u32(buf, o);
    if (len === 0) {
      if (o + 5 <= buf.length && buf[o + 4] === 0) {
        return { value: "", bytes: 5, next: o + 5 };
      }
      return { value: "", bytes: 4, next: o + 4 };
    }
    if (len > 0x100000 || o + 4 + len > buf.length) {
      throw new Error("Invalid UE string length " + len + " at 0x" + o.toString(16));
    }
    const value = asciiAt(buf, o + 4, len - 1);
    return { value, bytes: 4 + len, next: o + 4 + len };
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

  function parseHeader(buf) {
    if (buf.length < 32) throw new Error("File too small to be a GVAS save");
    if (asciiAt(buf, 0, 4) !== "GVAS") throw new Error("Not a GVAS file (missing GVAS signature)");

    let o = 22;
    const buildId = readUeString(buf, o);
    o = buildId.next;
    const customFormatVersion = u32(buf, o);
    o += 4;
    const customFormatCount = u32(buf, o);
    o += 4;
    o += customFormatCount * 20;
    const unknown1 = u32(buf, o);
    o += 4;
    const saveType = readUeString(buf, o);
    o = saveType.next;
    const unknown2 = u32(buf, o);
    o += 4;
    const compressedLenOffset = o;
    const compressedLen = u32(buf, o);
    o += 4;
    const decompressedLen = u32(buf, o);
    o += 4;
    const propertyBlockOffset = o;

    return {
      buildId: buildId.value,
      customFormatVersion,
      customFormatCount,
      unknown1,
      saveType: saveType.value,
      unknown2,
      compressedLenOffset,
      compressedLen,
      decompressedLen,
      propertyBlockOffset,
    };
  }

  function getMultibyteLength(input, offset) {
    let length = 0;
    while (true) {
      if (offset >= input.length) throw new Error("Truncated LZ4 length extension");
      const b = input[offset++];
      length += b;
      if (b !== 255) return { length, offset };
    }
  }

  function decompressLz4Block(input, expectedSize) {
    let capacity = expectedSize && expectedSize > 0 ? expectedSize : Math.max(input.length * 4, 65536);
    let output = new Uint8Array(capacity);
    let outLen = 0;

    function ensure(extra) {
      if (outLen + extra <= output.length) return;
      while (outLen + extra > capacity) capacity = Math.ceil(capacity * 1.5);
      const next = new Uint8Array(capacity);
      next.set(output.subarray(0, outLen), 0);
      output = next;
    }

    function appendBytes(src, start, len) {
      ensure(len);
      output.set(src.subarray(start, start + len), outLen);
      outLen += len;
    }

    function appendMatch(matchOffset, length) {
      ensure(length);
      const start = outLen - matchOffset;
      if (start < 0) throw new Error("Invalid LZ4 match offset " + matchOffset);
      if (matchOffset >= length) {
        output.set(output.subarray(start, start + length), outLen);
      } else {
        for (let i = 0; i < length; i++) {
          output[outLen + i] = output[start + (i % matchOffset)];
        }
      }
      outLen += length;
    }

    let offset = 0;
    while (offset < input.length) {
      const token = input[offset++];
      let literalLength = token >> 4;
      let matchLength = token & 0x0f;
      if (literalLength === 15) {
        const ext = getMultibyteLength(input, offset);
        literalLength += ext.length;
        offset = ext.offset;
      }
      if (offset + literalLength > input.length) throw new Error("Truncated LZ4 literals");
      appendBytes(input, offset, literalLength);
      offset += literalLength;

      if (offset >= input.length) break;

      if (offset + 2 > input.length) throw new Error("Truncated LZ4 match offset");
      const matchOffset = u16(input, offset);
      offset += 2;
      let fullMatchLength = matchLength + 4;
      if (matchLength === 15) {
        const ext = getMultibyteLength(input, offset);
        fullMatchLength = matchLength + 4 + ext.length;
        offset = ext.offset;
      }
      if (matchOffset === 0) throw new Error("Invalid LZ4 match offset 0");
      appendMatch(matchOffset, fullMatchLength);
    }

    return output.subarray(0, outLen);
  }

  /** Valid LZ4 block: entire payload as one literal sequence. */
  function compressLz4Block(data) {
    const litLen = data.length;
    const parts = [];
    if (litLen < 15) {
      parts.push((litLen << 4) | 0);
    } else {
      parts.push((15 << 4) | 0);
      let rem = litLen - 15;
      while (rem >= 255) {
        parts.push(255);
        rem -= 255;
      }
      parts.push(rem);
    }
    const header = new Uint8Array(parts);
    const out = new Uint8Array(header.length + data.length);
    out.set(header, 0);
    out.set(data, header.length);
    return out;
  }

  function openSave(arrayBuffer, fileName) {
    const original = new Uint8Array(arrayBuffer);
    const header = parseHeader(original);
    if (header.saveType !== SAVE_TYPE) {
      throw new Error(
        'Unexpected save type "' + header.saveType + '" (expected ' + SAVE_TYPE + "). Is this a SoD2 community save?"
      );
    }

    let properties;
    let footer;
    if (header.compressedLen === 0) {
      const end = header.propertyBlockOffset + header.decompressedLen;
      if (end > original.length) throw new Error("Decompressed length exceeds file size");
      properties = original.slice(header.propertyBlockOffset, end);
      footer = original.slice(end);
    } else {
      const end = header.propertyBlockOffset + header.compressedLen;
      if (end > original.length) throw new Error("Compressed length exceeds file size");
      const compressed = original.subarray(header.propertyBlockOffset, end);
      properties = decompressLz4Block(compressed, header.decompressedLen);
      if (properties.length !== header.decompressedLen) {
        throw new Error(
          "LZ4 size mismatch: expected " + header.decompressedLen + ", got " + properties.length
        );
      }
      footer = original.slice(end);
    }

    return {
      fileName: fileName || "SaveGame.sav",
      original,
      header,
      properties: new Uint8Array(properties),
      footer: new Uint8Array(footer),
      dirty: false,
      fields: {},
      communityResources: [],
    };
  }

  function findAllStringOffsets(buf, needle) {
    const encoded = encodeUeString(needle);
    const hits = [];
    outer: for (let i = 0; i <= buf.length - encoded.length; i++) {
      for (let j = 0; j < encoded.length; j++) {
        if (buf[i + j] !== encoded[j]) continue outer;
      }
      hits.push(i);
    }
    return hits;
  }

  function readNumericAfterType(buf, typeNext, typeName) {
    if (typeNext + 9 > buf.length) return null;
    const dataLenLo = u32(buf, typeNext);
    const dataLenHi = u32(buf, typeNext + 4);
    if (INT_TYPES.includes(typeName)) {
      if (dataLenLo !== 4 || dataLenHi !== 0) return null;
      if (buf[typeNext + 8] !== 0) return null;
      const valueOffset = typeNext + 9;
      if (valueOffset + 4 > buf.length) return null;
      return { kind: "int", value: i32(buf, valueOffset), valueOffset, size: 4 };
    }
    if (FLOAT_TYPES.includes(typeName)) {
      // Standard float OR SoD2 map entry: sizeLo=4, sizeHi=mapKey, pad, float
      if (dataLenLo !== 4) return null;
      if (buf[typeNext + 8] !== 0) return null;
      const valueOffset = typeNext + 9;
      if (valueOffset + 4 > buf.length) return null;
      return {
        kind: "float",
        value: readF32(buf, valueOffset),
        valueOffset,
        size: 4,
        mapKey: dataLenHi,
      };
    }
    return null;
  }

  function findNumericProperties(buf, names) {
    const results = [];
    const nameList = Array.isArray(names) ? names : [names];
    for (const name of nameList) {
      const offsets = findAllStringOffsets(buf, name);
      for (const nameOffset of offsets) {
        const nameStr = readUeString(buf, nameOffset);
        let type;
        try {
          type = readUeString(buf, nameStr.next);
        } catch (_) {
          continue;
        }
        if (![...INT_TYPES, ...FLOAT_TYPES].includes(type.value)) continue;
        const num = readNumericAfterType(buf, type.next, type.value);
        if (!num) continue;
        results.push({
          name,
          type: type.value,
          nameOffset,
          ...num,
        });
      }
    }
    return results;
  }

  function parseCommunityResources(buf) {
    const hits = findNumericProperties(buf, ["CommunityResources"]);
    return hits
      .filter((h) => h.kind === "float" && h.mapKey != null)
      .map((h) => ({
        key: h.mapKey,
        value: h.value,
        valueOffset: h.valueOffset,
        nameOffset: h.nameOffset,
      }))
      .sort((a, b) => a.key - b.key);
  }

  function pickCommunityInfluence(hits, communityResources) {
    if (!hits.length) return null;
    if (hits.length === 1) return hits[0];
    const crStart = communityResources.length
      ? Math.min(...communityResources.map((e) => e.nameOffset))
      : null;
    if (crStart != null) {
      const before = hits.filter((h) => h.nameOffset < crStart);
      if (before.length) return before[before.length - 1];
    }
    return hits.reduce((best, h) => (h.value > best.value ? h : best), hits[0]);
  }

  function i64(buf, o) {
    const lo = u32(buf, o);
    const hi = (buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24)) | 0;
    return lo + hi * 4294967296;
  }

  function writeI64(buf, o, v) {
    v = Math.max(0, Math.floor(Number(v)));
    writeU32(buf, o, v >>> 0);
    writeU32(buf, o + 4, Math.floor(v / 4294967296) >>> 0);
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
        const st = readUeString(buf, o);
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
        o = readUeString(buf, o).next + 1;
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

  function findCommunityDisplayName(buf) {
    const offsets = findAllStringOffsets(buf, "CommunityDisplayName");
    for (const nameOffset of offsets) {
      const nameStr = readUeString(buf, nameOffset);
      let type;
      try {
        type = readUeString(buf, nameStr.next);
      } catch (_) {
        continue;
      }
      if (type.value !== "TextProperty") continue;
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
      const loc = strs.find((x) => /Dayton\.|EnclaveName/i.test(x.s));
      const guid = strs.find((x) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(x.s));
      const plain =
        [...strs]
          .reverse()
          .find(
            (x) =>
              x.s.length >= 2 &&
              !/Dayton\.|EnclaveName|^[0-9a-f-]{36}$/i.test(x.s) &&
              !/^(None|Name|ru-RU)$/i.test(x.s)
          ) || null;
      if (!loc && !plain) continue;
      return {
        key: loc ? loc.s : null,
        nameOffset,
        dataLenOff,
        dataLen,
        display: plain ? plain.s : null,
        displayOff: plain ? plain.off : null,
        displayBytes: plain ? plain.bytes : null,
        guid: guid ? guid.s : null,
        stringOffset: loc ? loc.off : null,
        stringLen: loc ? loc.bytes : null,
      };
    }
    return null;
  }

  function setCommunityDisplayName(save, newName) {
    newName = String(newName || "").trim();
    if (!newName || newName.length > 80) throw new Error("Community name must be 1–80 characters");
    if (!/^[\x20-\x7E]+$/.test(newName)) throw new Error("Community name must be ASCII");
    if (!save.communityName) discoverCommunityFields(save);
    const cn = save.communityName;
    if (!cn || cn.displayOff == null) {
      throw new Error("No editable display string on CommunityDisplayName (loc key only)");
    }
    const newStr = encodeUeString(newName);
    const delta = newStr.length - cn.displayBytes;
    let buf = spliceBuf(save.properties, cn.displayOff, cn.displayBytes, newStr);
    writeI64(buf, cn.dataLenOff, cn.dataLen + delta);
    if (delta) buf = adjustAncestorSizes(buf, cn.displayOff, delta, [cn.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverCommunityFields(save);
    return save.communityName && save.communityName.display;
  }

  function discoverCommunityFields(save) {
    const cr = parseCommunityResources(save.properties);
    save.communityResources = cr;
    save.communityName = findCommunityDisplayName(save.properties);
    const influenceHits = findNumericProperties(save.properties, ["Influence"]).filter(
      (h) => h.kind === "int"
    );
    const fields = {};

    for (const def of COMMUNITY_FIELDS) {
      if (def.kind === "resource") {
        const entry = cr.find((e) => e.key === def.resourceKey);
        fields[def.id] = {
          def,
          available: !!entry,
          value: entry ? entry.value : null,
          hit: entry
            ? { kind: "float", valueOffset: entry.valueOffset, value: entry.value, size: 4 }
            : null,
          hits: entry ? [entry] : [],
        };
      } else if (def.kind === "influence") {
        const best = pickCommunityInfluence(influenceHits, cr);
        fields[def.id] = {
          def,
          available: !!best,
          value: best ? best.value : null,
          hit: best,
          hits: influenceHits,
        };
      } else if (def.kind === "intName") {
        const hits = findNumericProperties(save.properties, def.names).filter((h) => h.kind === "int");
        const best = hits[0] || null;
        fields[def.id] = {
          def,
          available: !!best,
          value: best ? best.value : null,
          hit: best,
          hits,
        };
      } else if (def.kind === "floatName") {
        const hits = findNumericProperties(save.properties, def.names).filter((h) => h.kind === "float");
        // Prefer a non-map / first float named TimeOfDay
        const best = hits.find((h) => h.mapKey === 0) || hits[0] || null;
        fields[def.id] = {
          def,
          available: !!best,
          value: best ? best.value : null,
          hit: best,
          hits,
        };
      }
    }

    save.fields = fields;
    if (!save.baseline) {
      save.baseline = snapshotValues(save);
    }
    return fields;
  }

  function snapshotValues(save) {
    const out = { communityName: save.communityName ? save.communityName.key : null, fields: {}, influenceHits: [] };
    for (const def of COMMUNITY_FIELDS) {
      const entry = save.fields[def.id];
      out.fields[def.id] = entry && entry.available ? entry.value : null;
    }
    const infl = save.fields.influence;
    if (infl && infl.hits) {
      out.influenceHits = infl.hits.map((h) => h.value);
    }
    return out;
  }

  function getDiff(save) {
    if (!save.baseline) return [];
    const rows = [];
    for (const def of COMMUNITY_FIELDS) {
      const entry = save.fields[def.id];
      const before = save.baseline.fields[def.id];
      const after = entry && entry.available ? entry.value : null;
      if (before == null && after == null) continue;
      if (before === after) continue;
      if (typeof before === "number" && typeof after === "number" && Math.abs(before - after) < 1e-6) continue;
      rows.push({ id: def.id, label: def.label, before, after });
    }
    const infl = save.fields.influence;
    if (infl && infl.hits && save.baseline.influenceHits) {
      infl.hits.forEach((h, i) => {
        const before = save.baseline.influenceHits[i];
        if (before !== h.value) {
          rows.push({
            id: "influence#" + i,
            label: "Influence #" + (i + 1),
            before,
            after: h.value,
          });
        }
      });
    }
    return rows;
  }

  function scanInterestingInts(save, limit) {
    const typeEnc = encodeUeString("IntProperty");
    const needles = /food|med|ammo|mat|fuel|infl|prest|plague|scrap|stand|resource|heart|node/i;
    const found = [];
    for (let i = 0; i <= save.properties.length - typeEnc.length; i++) {
      let ok = true;
      for (let j = 0; j < typeEnc.length; j++) {
        if (save.properties[i + j] !== typeEnc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let name = null;
      for (let nameLen = 2; nameLen < 80; nameLen++) {
        const lenFieldAt = i - 4 - nameLen;
        if (lenFieldAt < 0) break;
        if (u32(save.properties, lenFieldAt) === nameLen) {
          const candidate = asciiAt(save.properties, lenFieldAt + 4, nameLen - 1);
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate)) {
            name = candidate;
            break;
          }
        }
      }
      if (!name || !needles.test(name)) continue;
      const num = readNumericAfterType(save.properties, i + typeEnc.length, "IntProperty");
      if (!num) continue;
      found.push({ name, value: num.value, offset: num.valueOffset });
      if (limit && found.length >= limit) break;
    }
    return found;
  }

  function clampValue(def, value) {
    let v = Number(value);
    if (!Number.isFinite(v)) throw new Error("Invalid number for " + def.label);
    if (def.min != null) v = Math.max(def.min, v);
    if (def.max != null) v = Math.min(def.max, v);
    return v;
  }

  function setFieldValue(save, fieldId, value) {
    const entry = save.fields[fieldId];
    if (!entry || !entry.hit) throw new Error("Field not available: " + fieldId);
    const def = entry.def;
    let v = clampValue(def, value);

    if (entry.hit.kind === "int") {
      v = Math.trunc(v);
      writeI32(save.properties, entry.hit.valueOffset, v);
    } else {
      writeF32(save.properties, entry.hit.valueOffset, v);
    }
    entry.hit.value = v;
    entry.value = v;
    save.dirty = true;
  }

  /** Write the same influence value to every Influence IntProperty in the save. */
  function setAllInfluence(save, value) {
    const entry = save.fields.influence;
    if (!entry || !entry.hits.length) throw new Error("No Influence fields found");
    const v = Math.trunc(clampValue(entry.def, value));
    for (const hit of entry.hits) {
      writeI32(save.properties, hit.valueOffset, v);
      hit.value = v;
    }
    entry.value = v;
    if (entry.hit) entry.hit.value = v;
    save.dirty = true;
  }

  function setInfluenceAt(save, index, value) {
    const entry = save.fields.influence;
    if (!entry || !entry.hits[index]) throw new Error("Influence index out of range");
    const v = Math.trunc(clampValue(entry.def, value));
    const hit = entry.hits[index];
    writeI32(save.properties, hit.valueOffset, v);
    hit.value = v;
    if (entry.hit && entry.hit.valueOffset === hit.valueOffset) {
      entry.value = v;
      entry.hit.value = v;
    }
    save.dirty = true;
  }

  /** Copy mapped community field values from src onto dst (by field id). */
  function applyCommunityValues(src, dst) {
    for (const def of COMMUNITY_FIELDS) {
      const s = src.fields[def.id];
      const d = dst.fields[def.id];
      if (!s || !s.available || !d || !d.available) continue;
      setFieldValue(dst, def.id, s.value);
    }
  }

  function buildSave(save) {
    const headerBytes = save.original.slice(0, save.header.propertyBlockOffset);
    const compressed = compressLz4Block(save.properties);
    writeU32(headerBytes, save.header.compressedLenOffset, compressed.length);
    writeU32(headerBytes, save.header.compressedLenOffset + 4, save.properties.length);

    const out = new Uint8Array(headerBytes.length + compressed.length + save.footer.length);
    out.set(headerBytes, 0);
    out.set(compressed, headerBytes.length);
    out.set(save.footer, headerBytes.length + compressed.length);
    return out;
  }

  function downloadBytes(bytes, fileName) {
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "SaveGame.sav";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function roundTripOk(save) {
    const built = buildSave(save);
    const copy = built.buffer.slice(built.byteOffset, built.byteOffset + built.byteLength);
    const reopened = openSave(copy, save.fileName);
    if (reopened.properties.length !== save.properties.length) return false;
    for (let i = 0; i < save.properties.length; i++) {
      if (reopened.properties[i] !== save.properties[i]) return false;
    }
    return true;
  }

  window.Sod2Save = {
    COMMUNITY_FIELDS,
    STOCKPILE_IDS,
    RESOURCE_KEYS,
    SAVE_TYPE,
    openSave,
    discoverCommunityFields,
    scanInterestingInts,
    setFieldValue,
    setAllInfluence,
    setInfluenceAt,
    setCommunityDisplayName,
    applyCommunityValues,
    getDiff,
    snapshotValues,
    buildSave,
    downloadBytes,
    roundTripOk,
    findNumericProperties,
    parseCommunityResources,
    decompressLz4Block,
    compressLz4Block,
    parseHeader,
  };
})();
