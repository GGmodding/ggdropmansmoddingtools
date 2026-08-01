(() => {
  "use strict";

  /**
   * SurvivorSave roster CRUD — duplicate / delete / transfer between enclaves.
   * SurvivorSaves arrays live inside EnclaveSaves; each SurvivorSave starts with ID (IntProperty).
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before survivors-roster.js");

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
    return u32(buf, o) + ((buf[o + 4] | (buf[o + 5] << 8) | (buf[o + 6] << 16) | (buf[o + 7] << 24)) | 0) * 4294967296;
  }
  function writeI64(buf, o, v) {
    v = Math.max(0, Math.floor(Number(v)));
    writeU32(buf, o, v >>> 0);
    writeU32(buf, o + 4, Math.floor(v / 4294967296) >>> 0);
  }
  function readStr(buf, o) {
    const len = (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) | 0;
    if (len <= 0 || o + 4 + len > buf.length) throw new Error("Bad string");
    let s = "";
    for (let i = 0; i < len - 1; i++) s += String.fromCharCode(buf[o + 4 + i]);
    return { s, next: o + 4 + len, bytes: 4 + len };
  }
  function encodeUeString(str) {
    const a = new Uint8Array(4 + str.length + 1);
    writeU32(a, 0, str.length + 1);
    for (let i = 0; i < str.length; i++) a[4 + i] = str.charCodeAt(i) & 0xff;
    return a;
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
        o = readStr(buf, o).next + 17;
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
        o = readStr(buf, o).next + 1;
        if (point >= o && point < o + dataLen) patches.push({ off: dataLenOff, next: dataLen + delta });
      } catch (_) {}
    }
    for (const p of patches) writeI64(buf, p.off, p.next);
    return buf;
  }

  function findNamed(buf, propName, typeName) {
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
      payloadBodyStart: countOff,
      payloadBodyEnd: countOff + dataLen,
    };
  }

  function findIdIntMarkers(buf, from, to) {
    const idEnc = encodeUeString("ID");
    const intEnc = encodeUeString("IntProperty");
    const out = [];
    outer: for (let i = from; i <= to - idEnc.length - intEnc.length; i++) {
      for (let j = 0; j < idEnc.length; j++) {
        if (buf[i + j] !== idEnc[j]) continue outer;
      }
      for (let j = 0; j < intEnc.length; j++) {
        if (buf[i + idEnc.length + j] !== intEnc[j]) continue outer;
      }
      // IntProperty: dataLen(8)+pad(1)+value(4) → value at type.next+9
      const valueOff = i + idEnc.length + intEnc.length + 9;
      if (valueOff + 4 > to) continue;
      out.push({ start: i, idValueOff: valueOff, idValue: u32(buf, valueOff) | 0 });
    }
    return out;
  }

  function discoverSurvivorRoster(save) {
    const buf = save.properties;
    const hits = findNamed(buf, "SurvivorSaves", "ArrayProperty");
    const arrays = [];
    const blocks = [];

    for (let ai = 0; ai < hits.length; ai++) {
      let header;
      try {
        header = parseStructArrayHeader(buf, hits[ai].nameOffset);
      } catch (_) {
        continue;
      }
      if (header.structType !== "SurvivorSave") continue;
      const markers = findIdIntMarkers(buf, header.itemsStart, header.payloadBodyEnd);
      if (markers.length !== header.count) {
        console.warn("SurvivorSaves marker mismatch", header.count, markers.length);
      }
      const items = [];
      for (let i = 0; i < markers.length; i++) {
        const start = markers[i].start;
        const end = i + 1 < markers.length ? markers[i + 1].start : header.payloadBodyEnd;
        // payloadBodyEnd includes trailing padding after last item? Usually items fill to end of dataLen from countOff.
        // Prefer: if last item, end = last marker + (items region length calc)
        items.push({
          index: blocks.length,
          arrayIndex: ai,
          itemIndex: i,
          start,
          end,
          size: end - start,
          idValue: markers[i].idValue,
          idValueOff: markers[i].idValueOff,
        });
      }
      // Fix last item end: use distance from itemsStart using data layout
      if (items.length) {
        const last = items[items.length - 1];
        // Array payload after count+headers: itemsStart..(countOff+dataLen)
        last.end = header.payloadBodyEnd;
        last.size = last.end - last.start;
      }
      arrays.push({ index: ai, header, items });
      for (const it of items) blocks.push({ ...it, arrayIndex: ai });
    }

    // Re-index blocks globally and fix ends for non-last items (already correct); for last in each array set end to next array's... already payloadBodyEnd.

    // Recompute global list with correct ends between markers
    const flat = [];
    for (const arr of arrays) {
      for (let i = 0; i < arr.items.length; i++) {
        const start = arr.items[i].start;
        const end = i + 1 < arr.items.length ? arr.items[i + 1].start : arr.header.payloadBodyEnd;
        flat.push({
          index: flat.length,
          arrayIndex: arr.index,
          itemIndex: i,
          start,
          end,
          size: end - start,
          idValue: arr.items[i].idValue,
          idValueOff: arr.items[i].idValueOff,
          arrayHeaderStart: arr.header.start,
        });
      }
    }

    save.survivorArrays = arrays.map((a) => ({
      index: a.index,
      header: a.header,
      count: a.items.length,
    }));
    save.survivorBlocks = flat;

    // Link to discoverSurvivors() rows by FirstName offset inside block range
    if (!save.survivors && S.discoverSurvivors) S.discoverSurvivors(save);
    if (save.survivors) {
      for (const s of save.survivors) {
        const block = flat.find((b) => s.firstNameOffset >= b.start && s.firstNameOffset < b.end);
        s.blockIndex = block ? block.index : -1;
        s.rosterArrayIndex = block ? block.arrayIndex : -1;
      }
    }
    return flat;
  }

  function nextSurvivorId(save) {
    let max = 0;
    for (const b of save.survivorBlocks || []) {
      if (b.idValue > max) max = b.idValue;
    }
    return (max + 1) | 0;
  }

  function requireBlock(save, survivorIndex) {
    if (!save.survivorBlocks) discoverSurvivorRoster(save);
    if (!save.survivors) S.discoverSurvivors(save);
    const s = save.survivors[survivorIndex];
    if (!s || s.blockIndex < 0) throw new Error("Survivor has no SurvivorSave block mapping");
    const block = save.survivorBlocks[s.blockIndex];
    if (!block) throw new Error("Invalid survivor block");
    return { survivor: s, block };
  }

  function refreshArrayHeader(save, arrayIndex) {
    const hits = findNamed(save.properties, "SurvivorSaves", "ArrayProperty");
    const header = parseStructArrayHeader(save.properties, hits[arrayIndex].nameOffset);
    save.survivorArrays[arrayIndex].header = header;
    return header;
  }

  function duplicateSurvivor(save, survivorIndex) {
    const { block } = requireBlock(save, survivorIndex);
    const hits = findNamed(save.properties, "SurvivorSaves", "ArrayProperty");
    const header = parseStructArrayHeader(save.properties, hits[block.arrayIndex].nameOffset);
    const clone = save.properties.slice(block.start, block.end);
    // Assign a fresh ID inside the clone
    const localIdOff = block.idValueOff - block.start;
    const newId = nextSurvivorId(save);
    writeU32(clone, localIdOff, newId);

    const insertAt = block.end;
    const delta = clone.length;
    let buf = spliceBuf(save.properties, insertAt, 0, clone);
    writeU32(buf, header.countOff, header.count + 1);
    writeI64(buf, header.dataLenOff, header.dataLen + delta);
    writeI64(buf, header.innerLenOff, header.innerLen + delta);
    buf = adjustAncestorSizes(buf, insertAt, delta, [header.dataLenOff, header.innerLenOff]);
    save.properties = buf;
    save.dirty = true;
    if (S.discoverSurvivors) S.discoverSurvivors(save);
    discoverSurvivorRoster(save);
    const newBlock = (save.survivorBlocks || []).find((b) => b.start === insertAt);
    if (!newBlock) return save.survivors.length - 1;
    const idx = save.survivors.findIndex((s) => s.blockIndex === newBlock.index);
    return idx >= 0 ? idx : save.survivors.length - 1;
  }

  function removeSurvivor(save, survivorIndex) {
    const { block } = requireBlock(save, survivorIndex);
    const hits = findNamed(save.properties, "SurvivorSaves", "ArrayProperty");
    const header = parseStructArrayHeader(save.properties, hits[block.arrayIndex].nameOffset);
    if (header.count <= 1) throw new Error("Keep at least one survivor in this enclave roster");
    const size = block.end - block.start;
    let buf = spliceBuf(save.properties, block.start, size, null);
    writeU32(buf, header.countOff, header.count - 1);
    writeI64(buf, header.dataLenOff, header.dataLen - size);
    writeI64(buf, header.innerLenOff, header.innerLen - size);
    buf = adjustAncestorSizes(buf, block.start, -size, [header.dataLenOff, header.innerLenOff]);
    save.properties = buf;
    save.dirty = true;
    if (S.discoverSurvivors) S.discoverSurvivors(save);
    discoverSurvivorRoster(save);
    return save.survivors.length;
  }

  function listSurvivorRosterTargets(save) {
    if (!save.survivorBlocks) discoverSurvivorRoster(save);
    return (save.survivorArrays || []).map((a, i) => ({
      index: i,
      count: a.count,
      label: "Enclave roster #" + (i + 1) + " (" + a.count + " survivors)",
    }));
  }

  function transferSurvivor(save, survivorIndex, targetArrayIndex) {
    const { block } = requireBlock(save, survivorIndex);
    targetArrayIndex = Number(targetArrayIndex) | 0;
    if (targetArrayIndex === block.arrayIndex) return survivorIndex;
    const hits = findNamed(save.properties, "SurvivorSaves", "ArrayProperty");
    if (!hits[targetArrayIndex]) throw new Error("Invalid target roster");

    const srcHeader = parseStructArrayHeader(save.properties, hits[block.arrayIndex].nameOffset);
    const dstHeader = parseStructArrayHeader(save.properties, hits[targetArrayIndex].nameOffset);
    if (srcHeader.count <= 1) throw new Error("Cannot empty the source enclave roster");

    const blob = save.properties.slice(block.start, block.end);
    const size = blob.length;

    // Remove from source first if source is after destination... order by offset.
    // Safer: if dst insert point is after src, remove first then insert; if before, insert first then remove.
    let buf = save.properties;
    if (dstHeader.payloadBodyEnd <= block.start) {
      // Destination is before source — insert first, then remove (offsets after insert shift)
      const insertAt = dstHeader.payloadBodyEnd;
      buf = spliceBuf(buf, insertAt, 0, blob);
      writeU32(buf, dstHeader.countOff, dstHeader.count + 1);
      writeI64(buf, dstHeader.dataLenOff, dstHeader.dataLen + size);
      writeI64(buf, dstHeader.innerLenOff, dstHeader.innerLen + size);
      buf = adjustAncestorSizes(buf, insertAt, size, [dstHeader.dataLenOff, dstHeader.innerLenOff]);
      // Re-find source block after insert
      save.properties = buf;
      if (S.discoverSurvivors) S.discoverSurvivors(save);
      discoverSurvivorRoster(save);
      const again = requireBlock(save, survivorIndex);
      const srcHits = findNamed(save.properties, "SurvivorSaves", "ArrayProperty");
      const srcH = parseStructArrayHeader(save.properties, srcHits[again.block.arrayIndex].nameOffset);
      const remSize = again.block.end - again.block.start;
      buf = spliceBuf(save.properties, again.block.start, remSize, null);
      writeU32(buf, srcH.countOff, srcH.count - 1);
      writeI64(buf, srcH.dataLenOff, srcH.dataLen - remSize);
      writeI64(buf, srcH.innerLenOff, srcH.innerLen - remSize);
      buf = adjustAncestorSizes(buf, again.block.start, -remSize, [srcH.dataLenOff, srcH.innerLenOff]);
    } else {
      // Remove source first, then append to destination
      buf = spliceBuf(buf, block.start, size, null);
      writeU32(buf, srcHeader.countOff, srcHeader.count - 1);
      writeI64(buf, srcHeader.dataLenOff, srcHeader.dataLen - size);
      writeI64(buf, srcHeader.innerLenOff, srcHeader.innerLen - size);
      buf = adjustAncestorSizes(buf, block.start, -size, [srcHeader.dataLenOff, srcHeader.innerLenOff]);
      save.properties = buf;
      const dstHits = findNamed(save.properties, "SurvivorSaves", "ArrayProperty");
      const dstH = parseStructArrayHeader(save.properties, dstHits[targetArrayIndex].nameOffset);
      const insertAt = dstH.payloadBodyEnd;
      buf = spliceBuf(save.properties, insertAt, 0, blob);
      writeU32(buf, dstH.countOff, dstH.count + 1);
      writeI64(buf, dstH.dataLenOff, dstH.dataLen + size);
      writeI64(buf, dstH.innerLenOff, dstH.innerLen + size);
      buf = adjustAncestorSizes(buf, insertAt, size, [dstH.dataLenOff, dstH.innerLenOff]);
    }

    save.properties = buf;
    save.dirty = true;
    if (S.discoverSurvivors) S.discoverSurvivors(save);
    discoverSurvivorRoster(save);
    return save.survivors.length - 1;
  }

  // Hook discovery
  const origDiscover = S.discoverSurvivors;
  if (origDiscover) {
    S.discoverSurvivors = function (save) {
      const r = origDiscover(save);
      try {
        discoverSurvivorRoster(save);
      } catch (err) {
        console.warn("Survivor roster discovery failed", err);
      }
      return r;
    };
  }

  S.discoverSurvivorRoster = discoverSurvivorRoster;
  S.duplicateSurvivor = duplicateSurvivor;
  S.removeSurvivor = removeSurvivor;
  S.transferSurvivor = transferSurvivor;
  S.listSurvivorRosterTargets = listSurvivorRosterTargets;
})();
