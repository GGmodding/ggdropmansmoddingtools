(() => {
  "use strict";

  /**
   * SoD2 survivor trait parsing / editing.
   * Traits live in ArrayProperty<SurvivorTraitSave> with TraitResourceID NameProperty.
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before traits.js");

  const COMMON_TRAITS = [
    "Filler1",
    "Filler2",
    "Filler_HeroBonus",
    "Descriptor_Age_Young",
    "Descriptor_Age_MiddleAge",
    "Descriptor_Age_Old",
    "Descriptor_Pronoun_He",
    "Descriptor_Pronoun_She",
    "Descriptor_Pronoun_They",
    "Descriptor_Philosophy_Prudent",
    "Descriptor_Philosophy_Pragmatic",
    "Descriptor_Philosophy_Compassionate",
    "Descriptor_Philosophy_Daring",
    "Sickness",
    "blood_plague",
    "Morale_Infestations_Med",
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
    if (len < 0 || o + 4 + len > buf.length) throw new Error("Bad UE string length " + len + " @ 0x" + o.toString(16));
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

  function skipProperty(buf, o) {
    const name = readStr(buf, o);
    o = name.next;
    if (name.s === "None") return { next: o, name: "None", type: "None" };
    const type = readStr(buf, o);
    o = type.next;

    if (type.s === "BoolProperty") {
      o += 8;
      o += 2;
      return { next: o, name: name.s, type: type.s };
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
      o += 4;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "Int64Property" || type.s === "DoubleProperty" || type.s === "UInt64Property") {
      o += 8;
      o += 1;
      o += 8;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "ByteProperty") {
      o += 8;
      const enumName = readStr(buf, o);
      o = enumName.next;
      if (enumName.s === "None") o += 1;
      else {
        const v = readStr(buf, o);
        o = v.next;
      }
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "EnumProperty") {
      o += 8;
      const enumType = readStr(buf, o);
      o = enumType.next;
      o += 1;
      const v = readStr(buf, o);
      o = v.next;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "StructProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      const st = readStr(buf, o);
      o = st.next;
      o += 17;
      o += dataLen;
      return { next: o, name: name.s, type: type.s, struct: st.s, dataLen };
    }
    if (type.s === "ArrayProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      const et = readStr(buf, o);
      o = et.next;
      o += 1;
      o += dataLen;
      return { next: o, name: name.s, type: type.s, dataLen };
    }
    if (type.s === "MapProperty" || type.s === "SetProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      o += 5;
      // SoD2 map/set: dataLen includes 4 of the null pad bytes
      const payload = Math.max(0, dataLen - 4);
      o += payload;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "TextProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      o += 1;
      o += dataLen;
      return { next: o, name: name.s, type: type.s };
    }
    throw new Error("Unsupported property " + type.s + " (" + name.s + ") @ 0x" + o.toString(16));
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

  function extractTextDisplayName(buf, textPropNameOffset) {
    const name = readStr(buf, textPropNameOffset);
    const type = readStr(buf, name.next);
    if (type.s !== "TextProperty") return null;
    const dataLen = i64(buf, type.next);
    const start = type.next + 9;
    const end = start + dataLen;
    let last = null;
    let o = start;
    while (o + 4 < end) {
      const len = u32(buf, o);
      if (len >= 2 && len < 80 && o + 4 + len <= end && buf[o + 4 + len - 1] === 0) {
        const s = asciiAt(buf, o + 4, len - 1);
        if (/^[A-Za-z][A-Za-z'\\-]*$/.test(s) && s !== "Name" && s !== "None") {
          last = s;
          o += 4 + len;
          continue;
        }
      }
      o++;
    }
    return last;
  }

  function parseTraitsArray(buf, start) {
    let o = start;
    const name = readStr(buf, o);
    if (name.s !== "Traits") throw new Error("Expected Traits array");
    o = name.next;
    const type = readStr(buf, o);
    if (type.s !== "ArrayProperty") throw new Error("Traits is not ArrayProperty");
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
    const traits = [];
    for (let i = 0; i < count; i++) {
      const traitStart = o;
      let id = null;
      let idProp = null;
      while (true) {
        const before = o;
        const p = skipProperty(buf, o);
        o = p.next;
        if (p.name === "None") break;
        if (p.name === "TraitResourceID") {
          id = p.value;
          idProp = { ...p, propStart: before };
        }
      }
      traits.push({
        index: i,
        start: traitStart,
        end: o,
        size: o - traitStart,
        id,
        idProp,
      });
    }
    const payloadEnd = payloadStart + dataLen;
    return {
      start,
      dataLenOff,
      dataLen,
      countOff,
      count,
      innerLenOff,
      innerLen,
      payloadStart,
      payloadEnd,
      traits,
      next: o,
    };
  }

  function findTraitsArrays(buf) {
    return findNamedProperties(buf, "Traits", "ArrayProperty").map((h) => h.nameOffset);
  }

  function spliceBuf(buf, offset, deleteCount, insert) {
    const insertBytes = insert || new Uint8Array(0);
    const next = new Uint8Array(buf.length - deleteCount + insertBytes.length);
    next.set(buf.subarray(0, offset), 0);
    if (insertBytes.length) next.set(insertBytes, offset);
    next.set(buf.subarray(offset + deleteCount), offset + insertBytes.length);
    return next;
  }

  /**
   * Grow/shrink every ArrayProperty / StructProperty payload size that contains `point`.
   * Skips the Traits array fields we already adjust explicitly (passed in skipOffs).
   */
  function adjustAncestorSizes(buf, point, delta, skipOffs) {
    if (!delta) return buf;
    const skip = new Set(skipOffs || []);
    const patches = [];

    // StructProperty: name, type, dataLen, structType, 17 pad, payload
    const structType = encodeUeString("StructProperty");
    outerStruct: for (let i = 0; i <= buf.length - structType.length; i++) {
      for (let j = 0; j < structType.length; j++) {
        if (buf[i + j] !== structType[j]) continue outerStruct;
      }
      try {
        // Walk back: type string starts at i; name is before it
        // dataLen is at i + structType.length
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

  function discoverSurvivors(save) {
    const buf = save.properties;
    const firstHits = findNamedProperties(buf, "FirstName", "TextProperty");
    const traitStarts = findTraitsArrays(buf);
    const survivors = [];
    const lastEnc = encodeUeString("LastName");

    for (let i = 0; i < firstHits.length; i++) {
      const firstOff = firstHits[i].nameOffset;
      const firstName = extractTextDisplayName(buf, firstOff) || "Survivor";

      let lastName = "";
      for (let o = firstOff; o < firstOff + 400 && o < buf.length - lastEnc.length; o++) {
        let ok = true;
        for (let j = 0; j < lastEnc.length; j++) {
          if (buf[o + j] !== lastEnc[j]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        try {
          const t = readStr(buf, o + lastEnc.length);
          if (t.s !== "TextProperty") continue;
          lastName = extractTextDisplayName(buf, o) || "";
          break;
        } catch (_) {}
      }

      const traitsOff = traitStarts.find((t) => t > firstOff && t < firstOff + 80000);
      if (traitsOff == null) continue;
      let traitsArr;
      try {
        traitsArr = parseTraitsArray(buf, traitsOff);
      } catch (err) {
        console.warn("Traits parse failed for", firstName, err);
        continue;
      }

      survivors.push({
        index: survivors.length,
        firstName,
        lastName,
        displayName: (firstName + " " + lastName).trim(),
        firstNameOffset: firstOff,
        traitsOffset: traitsOff,
        traits: traitsArr.traits.map((t) => ({
          index: t.index,
          id: t.id || "(unknown)",
          start: t.start,
          end: t.end,
          size: t.size,
        })),
      });
    }

    save.survivors = survivors;
    save.traitCatalog = buildTraitCatalog(survivors);
    return survivors;
  }

  function buildTraitCatalog(survivors) {
    const set = new Set(COMMON_TRAITS);
    for (const s of survivors) {
      for (const t of s.traits) {
        if (t.id && t.id !== "(unknown)") set.add(t.id);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function setSurvivorTraitId(save, survivorIndex, traitIndex, newId) {
    newId = String(newId || "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(newId)) throw new Error("Trait ID must be letters/numbers/underscore only");

    discoverSurvivors(save);
    const survivor = save.survivors[survivorIndex];
    if (!survivor) throw new Error("Invalid survivor");
    const arr = parseTraitsArray(save.properties, survivor.traitsOffset);
    const trait = arr.traits[traitIndex];
    if (!trait || !trait.idProp) throw new Error("Invalid trait slot");

    const oldBytes = trait.idProp.valueBytes;
    const newStr = encodeUeString(newId);
    const delta = newStr.length - oldBytes;
    const valueOff = trait.idProp.valueOff;

    // Replace NameProperty value string
    let buf = spliceBuf(save.properties, valueOff, oldBytes, newStr);
    // Update NameProperty dataLen
    // dataLenOff may shift? valueOff is after dataLen; dataLenOff is before value by 9 bytes (8+pad)
    // After splice only bytes after valueOff move; dataLenOff < valueOff so unchanged
    writeI64(buf, trait.idProp.dataLenOff, newStr.length);

    if (delta !== 0) {
      writeI64(buf, arr.dataLenOff, arr.dataLen + delta);
      writeI64(buf, arr.innerLenOff, arr.innerLen + delta);
      buf = adjustAncestorSizes(buf, arr.payloadStart, delta, [arr.dataLenOff, arr.innerLenOff]);
    }

    save.properties = buf;
    save.dirty = true;
    discoverSurvivors(save);
  }

  function removeSurvivorTrait(save, survivorIndex, traitIndex) {
    discoverSurvivors(save);
    const survivor = save.survivors[survivorIndex];
    if (!survivor) throw new Error("Invalid survivor");
    const arr = parseTraitsArray(save.properties, survivor.traitsOffset);
    if (arr.count <= 1) throw new Error("Refusing to remove the last trait on a survivor");
    const trait = arr.traits[traitIndex];
    if (!trait) throw new Error("Invalid trait slot");

    const size = trait.size;
    let buf = spliceBuf(save.properties, trait.start, size, null);
    writeU32(buf, arr.countOff, arr.count - 1);
    writeI64(buf, arr.dataLenOff, arr.dataLen - size);
    writeI64(buf, arr.innerLenOff, arr.innerLen - size);
    buf = adjustAncestorSizes(buf, arr.payloadStart, -size, [arr.dataLenOff, arr.innerLenOff]);

    save.properties = buf;
    save.dirty = true;
    discoverSurvivors(save);
  }

  function findCloneTemplate(arr) {
    // Prefer a small descriptor/filler trait over Default (huge buff blob)
    const preferred = arr.traits
      .filter((t) => t.id && t.id !== "Default")
      .sort((a, b) => a.size - b.size);
    return preferred[0] || arr.traits[0];
  }

  function addSurvivorTrait(save, survivorIndex, traitId) {
    traitId = String(traitId || "Filler1").trim();
    if (!/^[A-Za-z0-9_]+$/.test(traitId)) throw new Error("Trait ID must be letters/numbers/underscore only");

    discoverSurvivors(save);
    const survivor = save.survivors[survivorIndex];
    if (!survivor) throw new Error("Invalid survivor");
    const arr = parseTraitsArray(save.properties, survivor.traitsOffset);
    const template = findCloneTemplate(arr);
    if (!template) throw new Error("No trait template to clone");

    let clone = save.properties.slice(template.start, template.end);

    // Manually find TraitResourceID inside clone
    const needle = encodeUeString("TraitResourceID");
    let idValueRel = -1;
    let idDataLenRel = -1;
    let idOldBytes = 0;
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
        if (type.s !== "NameProperty") continue;
        idDataLenRel = type.next;
        const valueOff = type.next + 9;
        const val = readStr(clone, valueOff);
        idValueRel = valueOff;
        idOldBytes = val.bytes;
        break;
      } catch (_) {}
    }
    if (idValueRel < 0) throw new Error("Could not locate TraitResourceID in template");

    const newStr = encodeUeString(traitId);
    clone = spliceBuf(clone, idValueRel, idOldBytes, newStr);
    writeI64(clone, idDataLenRel, newStr.length);

    const insertAt = arr.traits[arr.traits.length - 1].end;
    const delta = clone.length;
    let buf = spliceBuf(save.properties, insertAt, 0, clone);
    writeU32(buf, arr.countOff, arr.count + 1);
    writeI64(buf, arr.dataLenOff, arr.dataLen + delta);
    writeI64(buf, arr.innerLenOff, arr.innerLen + delta);
    buf = adjustAncestorSizes(buf, arr.payloadStart, delta, [arr.dataLenOff, arr.innerLenOff]);

    save.properties = buf;
    save.dirty = true;
    discoverSurvivors(save);
  }

  S.COMMON_TRAITS = COMMON_TRAITS;
  S.discoverSurvivors = discoverSurvivors;
  S.setSurvivorTraitId = setSurvivorTraitId;
  S.removeSurvivorTrait = removeSurvivorTrait;
  S.addSurvivorTrait = addSurvivorTrait;
  S.parseTraitsArray = parseTraitsArray;
})();
