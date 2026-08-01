(() => {
  "use strict";

  /**
   * SoD2 map sites + radio command unlock helpers.
   * MapSiteSave.ScoutedLevel (EScoutedLevel) + RadioSave.Availability cooldowns.
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before map.js");

  const SCOUTED_LEVELS = [
    "EScoutedLevel::Hidden",
    "EScoutedLevel::Revealed",
    "EScoutedLevel::Scouted",
    "EScoutedLevel::Advanced",
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
      return { next: v.next, name: name.s, type: type.s, value: v.s, valueOff: o, valueBytes: v.bytes, dataLenOff };
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
        return { next: o + 1, name: name.s, type: type.s, dataLenOff };
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
      o = readStr(buf, o).next + 17 + dataLen;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "ArrayProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      o = readStr(buf, o).next + 1 + dataLen;
      return { next: o, name: name.s, type: type.s };
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
    const payloadStart = o;
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
      payloadStart,
      structType: st.s,
      itemsStart: o,
    };
  }

  function discoverMapSites(save) {
    const buf = save.properties;
    const hits = findNamedProperties(buf, "MapSiteSaves", "ArrayProperty");
    if (!hits.length) {
      save.mapSites = [];
      save.mapSiteStats = { total: 0, byLevel: {} };
      return [];
    }

    const header = parseStructArrayHeader(buf, hits[0].nameOffset);
    let o = header.itemsStart;
    const sites = [];
    const byLevel = {};

    for (let i = 0; i < header.count; i++) {
      const siteStart = o;
      let scoutedLevel = null;
      let scouted = null;
      let surveyingComplete = null;
      let scoutingEnabled = null;
      let infestedOutpost = null;
      let outpostId = null;
      let outpostIdProp = null;

      while (true) {
        const before = o;
        const n = readStr(buf, o);
        if (n.s === "None") {
          o = n.next;
          break;
        }
        const p = skipProperty(buf, before);
        if (p.name === "ScoutedLevel") {
          scoutedLevel = p.value;
          scouted = {
            value: p.value,
            valueOff: p.valueOff,
            valueBytes: p.valueBytes,
            dataLenOff: p.dataLenOff,
          };
        }
        if (p.name === "bSurveyingComplete") surveyingComplete = p;
        if (p.name === "bScoutingEnabled") scoutingEnabled = p;
        if (p.name === "bInfestedOutpost") infestedOutpost = p;
        if (p.name === "OutpostId") {
          outpostId = p.value;
          outpostIdProp = {
            value: p.value,
            valueOff: p.valueOff,
            valueBytes: p.valueBytes,
            dataLenOff: p.dataLenOff,
          };
        }
        o = p.next;
      }

      byLevel[scoutedLevel || "(unknown)"] = (byLevel[scoutedLevel || "(unknown)"] || 0) + 1;
      sites.push({
        index: i,
        start: siteStart,
        end: o,
        scoutedLevel,
        scouted,
        surveyingComplete,
        scoutingEnabled,
        infestedOutpost,
        outpostId,
        outpostIdProp,
      });
    }

    save.mapSites = sites;
    save.mapSiteArray = header;
    const claimed = sites.filter((s) => s.outpostId && s.outpostId !== "None").length;
    const infested = sites.filter((s) => s.infestedOutpost && s.infestedOutpost.value).length;
    save.mapSiteStats = { total: sites.length, byLevel, claimed, infested };

    const mapsScouted = findNamedProperties(buf, "bAreMapsScouted", "BoolProperty");
    save.areMapsScouted = null;
    if (mapsScouted.length) {
      const name = readStr(buf, mapsScouted[0].nameOffset);
      const type = readStr(buf, name.next);
      const valueOff = type.next + 8;
      save.areMapsScouted = { valueOff, value: !!buf[valueOff] };
    }

    return sites;
  }

  function discoverRadioCommands(save) {
    const buf = save.properties;
    const hits = findNamedProperties(buf, "Availability", "ArrayProperty");
    let header = null;
    for (const h of hits) {
      try {
        const cand = parseStructArrayHeader(buf, h.nameOffset);
        if (cand.structType === "RadioCommandAvailabilitySave") {
          header = cand;
          break;
        }
      } catch (_) {}
    }
    if (!header) {
      // Fallback: locate by struct type string near Availability
      const needle = encodeUeString("RadioCommandAvailabilitySave");
      let found = -1;
      outer: for (let i = 0; i <= buf.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) {
          if (buf[i + j] !== needle[j]) continue outer;
        }
        found = i;
        break;
      }
      if (found < 0) {
        save.radioCommands = [];
        return [];
      }
      for (let i = found; i > Math.max(0, found - 300); i--) {
        try {
          const name = readStr(buf, i);
          if (name.s !== "Availability") continue;
          const type = readStr(buf, name.next);
          if (type.s !== "ArrayProperty") continue;
          header = parseStructArrayHeader(buf, i);
          break;
        } catch (_) {}
      }
    }
    if (!header) {
      save.radioCommands = [];
      return [];
    }

    let o = header.itemsStart;
    const cmds = [];
    for (let i = 0; i < header.count; i++) {
      let id = null;
      let charges = null;
      let chargesOff = null;
      let cooldown = null;
      let cooldownOff = null;
      while (true) {
        const before = o;
        const n = readStr(buf, o);
        if (n.s === "None") {
          o = n.next;
          break;
        }
        const p = skipProperty(buf, before);
        if (p.name === "CommandID") id = p.value;
        if (p.name === "ExpendableCharges") {
          charges = p.value;
          chargesOff = p.valueOff;
        }
        if (p.name === "CurrentCooldown") {
          cooldown = p.value;
          cooldownOff = p.valueOff;
        }
        o = p.next;
      }
      cmds.push({ index: i, id, charges, chargesOff, cooldown, cooldownOff });
    }

    save.radioCommands = cmds;
    save.radioArray = header;
    return cmds;
  }

  function discoverMissions(save) {
    const buf = save.properties;
    const missions = [];
    const hits = findNamedProperties(buf, "LooseMissionSaves", "ArrayProperty");
    save.missionArray = null;
    if (hits.length) {
      try {
        const header = parseStructArrayHeader(buf, hits[0].nameOffset);
        save.missionArray = header;
        let o = header.itemsStart;
        for (let i = 0; i < header.count; i++) {
          const start = o;
          const midBefore = o;
          const midName = readStr(buf, o);
          if (midName.s !== "MissionId") {
            // Unexpected layout — skip whole remaining item best-effort
            throw new Error("LooseMissionSave #" + i + " missing MissionId");
          }
          const midType = readStr(buf, midName.next);
          const dataLenOff = midType.next;
          const dataLen = i64(buf, dataLenOff);
          let po = midType.next + 8;
          const stName = readStr(buf, po);
          const idPayloadStart = stName.next + 17;
          const mid = skipProperty(buf, midBefore);
          const idPayloadEnd = mid.next;
          let assetName = null;
          let missionName = null;
          let q = idPayloadStart;
          while (q < idPayloadEnd) {
            const before = q;
            const n = readStr(buf, q);
            if (n.s === "None") {
              q = n.next;
              break;
            }
            const p = skipProperty(buf, before);
            if (p.name === "AssetName") assetName = p.value;
            if (p.name === "MissionName") missionName = p.value;
            q = p.next;
          }
          o = mid.next;
          const castBefore = o;
          const cast = skipProperty(buf, castBefore);
          o = cast.next;
          const term = readStr(buf, o);
          if (term.s !== "None") throw new Error("LooseMissionSave #" + i + " missing terminator");
          o = term.next;
          missions.push({
            index: i,
            kind: "loose",
            start,
            end: o,
            idPropStart: midBefore,
            idPropEnd: mid.next,
            idPayloadStart,
            idPayloadEnd: q,
            idDataLenOff: dataLenOff,
            idDataLen: dataLen,
            assetName,
            missionName,
            label: missionName || assetName || "Mission #" + (i + 1),
            castingBytes: cast.next - castBefore,
          });
        }
      } catch (err) {
        console.warn("LooseMissionSaves parse failed", err);
      }
    }
    save.missions = missions;

    // Completed mission IDs (MissionId struct array)
    save.completedMissions = [];
    save.completedMissionArray = null;
    const doneHits = findNamedProperties(buf, "CompletedMissions", "ArrayProperty");
    if (doneHits.length) {
      try {
        const header = parseStructArrayHeader(buf, doneHits[0].nameOffset);
        if (header.structType === "MissionId") {
          save.completedMissionArray = header;
          let o = header.itemsStart;
          for (let i = 0; i < header.count; i++) {
            const start = o;
            let assetName = null;
            let missionName = null;
            while (true) {
              const before = o;
              const n = readStr(buf, o);
              if (n.s === "None") {
                o = n.next;
                break;
              }
              const p = skipProperty(buf, before);
              if (p.name === "AssetName") assetName = p.value;
              if (p.name === "MissionName") missionName = p.value;
              o = p.next;
            }
            save.completedMissions.push({
              index: i,
              kind: "completed",
              start,
              end: o,
              assetName,
              missionName,
              label: missionName || assetName || "Completed #" + (i + 1),
            });
          }
        }
      } catch (err) {
        console.warn("CompletedMissions parse failed", err);
      }
    }

    return missions;
  }

  function requireLooseMission(save, index) {
    if (!save.missions) discoverMissions(save);
    const m = save.missions[index];
    if (!m) throw new Error("Invalid mission index");
    return m;
  }

  function removeLooseMission(save, index) {
    const m = requireLooseMission(save, index);
    const header = save.missionArray;
    if (!header) throw new Error("LooseMissionSaves header missing");
    const size = m.end - m.start;
    let buf = spliceBuf(save.properties, m.start, size, null);
    writeU32(buf, header.countOff, header.count - 1);
    writeI64(buf, header.dataLenOff, header.dataLen - size);
    writeI64(buf, header.innerLenOff, header.innerLen - size);
    buf = adjustAncestorSizes(buf, m.start, -size, [header.dataLenOff, header.innerLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverMissions(save);
    return save.missions.length;
  }

  function clearLooseMissions(save) {
    discoverMissions(save);
    let n = 0;
    for (let i = (save.missions || []).length - 1; i >= 0; i--) {
      removeLooseMission(save, i);
      n++;
    }
    return n;
  }

  function completeLooseMission(save, index) {
    const m = requireLooseMission(save, index);
    if (!save.completedMissionArray) discoverMissions(save);
    const doneHeader = save.completedMissionArray;
    if (!doneHeader) throw new Error("CompletedMissions array not found — dismiss instead");

    const idBody = save.properties.slice(m.idPayloadStart, m.idPayloadEnd);
    // Append MissionId body to CompletedMissions first (higher offset than LooseMissionSaves).
    let insertAt = doneHeader.itemsStart;
    if (save.completedMissions && save.completedMissions.length) {
      insertAt = save.completedMissions[save.completedMissions.length - 1].end;
    }
    const delta = idBody.length;
    let buf = spliceBuf(save.properties, insertAt, 0, idBody);
    writeU32(buf, doneHeader.countOff, doneHeader.count + 1);
    writeI64(buf, doneHeader.dataLenOff, doneHeader.dataLen + delta);
    writeI64(buf, doneHeader.innerLenOff, doneHeader.innerLen + delta);
    buf = adjustAncestorSizes(buf, insertAt, delta, [doneHeader.dataLenOff, doneHeader.innerLenOff]);
    save.properties = buf;
    save.dirty = true;

    // Re-find the same loose mission after the completed-array splice (offsets below insertAt unchanged).
    discoverMissions(save);
    const still = (save.missions || []).find((x) => x.start === m.start);
    if (!still) throw new Error("Mission completed in log but loose entry vanished unexpectedly");
    removeLooseMission(save, still.index);
    return { remaining: save.missions.length, completed: (save.completedMissions || []).length };
  }

  function clearCompletedMissions(save) {
    discoverMissions(save);
    const header = save.completedMissionArray;
    if (!header) return 0;
    const n = header.count;
    if (!n) return 0;
    const first = save.completedMissions[0];
    const last = save.completedMissions[save.completedMissions.length - 1];
    const size = last.end - first.start;
    let buf = spliceBuf(save.properties, first.start, size, null);
    writeU32(buf, header.countOff, 0);
    writeI64(buf, header.dataLenOff, header.dataLen - size);
    writeI64(buf, header.innerLenOff, header.innerLen - size);
    buf = adjustAncestorSizes(buf, first.start, -size, [header.dataLenOff, header.innerLenOff]);
    save.properties = buf;
    save.dirty = true;
    discoverMissions(save);
    return n;
  }

  function discoverMapQuest(save) {
    discoverMapSites(save);
    discoverRadioCommands(save);
    discoverMissions(save);
    return {
      sites: save.mapSites,
      radio: save.radioCommands,
      missions: save.missions,
      completedMissions: save.completedMissions,
    };
  }

  function setAreMapsScouted(save, value) {
    if (!save.areMapsScouted) discoverMapSites(save);
    if (!save.areMapsScouted) throw new Error("bAreMapsScouted not found");
    save.properties[save.areMapsScouted.valueOff] = value ? 1 : 0;
    save.areMapsScouted.value = !!value;
    save.dirty = true;
  }

  function setSiteScoutedLevelAt(save, site, enumValue, rediscover) {
    enumValue = String(enumValue || "").trim();
    if (!site || !site.scouted) throw new Error("Site ScoutedLevel unavailable");
    if (site.scoutedLevel === enumValue) return false;

    const newStr = encodeUeString(enumValue);
    const delta = newStr.length - site.scouted.valueBytes;
    let buf = spliceBuf(save.properties, site.scouted.valueOff, site.scouted.valueBytes, newStr);
    writeI64(buf, site.scouted.dataLenOff, newStr.length);
    if (delta) buf = adjustAncestorSizes(buf, site.scouted.valueOff, delta, [site.scouted.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    site.scoutedLevel = enumValue;
    site.scouted.value = enumValue;
    site.scouted.valueBytes = newStr.length;
    if (rediscover !== false) discoverMapSites(save);
    return true;
  }

  function setSiteScoutedLevel(save, siteIndex, enumValue) {
    enumValue = String(enumValue || "").trim();
    if (!/^EScoutedLevel::[A-Za-z]+$/.test(enumValue)) {
      throw new Error("Level must look like EScoutedLevel::Advanced");
    }
    if (!save.mapSites) discoverMapSites(save);
    const site = save.mapSites[siteIndex];
    if (!site) throw new Error("Invalid site index");
    return setSiteScoutedLevelAt(save, site, enumValue, true);
  }

  function revealAllMapSites(save, level) {
    level = level || "EScoutedLevel::Advanced";
    if (!/^EScoutedLevel::[A-Za-z]+$/.test(level)) {
      throw new Error("Level must look like EScoutedLevel::Advanced");
    }
    discoverMapSites(save);
    let n = 0;
    // High → low so earlier absolute offsets stay valid after splices.
    for (let i = save.mapSites.length - 1; i >= 0; i--) {
      const site = save.mapSites[i];
      if (!site.scouted || site.scoutedLevel === level) continue;
      if (setSiteScoutedLevelAt(save, site, level, false)) n++;
    }
    if (save.areMapsScouted) setAreMapsScouted(save, true);
    discoverMapSites(save);
    for (const site of save.mapSites) {
      if (site.surveyingComplete && site.surveyingComplete.valueOff != null) {
        save.properties[site.surveyingComplete.valueOff] = 1;
        site.surveyingComplete.value = true;
      }
    }
    save.dirty = true;
    return n;
  }

  function hideUnscoutedMapSites(save) {
    return revealAllMapSites(save, "EScoutedLevel::Hidden");
  }

  function resetRadioCooldowns(save) {
    discoverRadioCommands(save);
    let n = 0;
    for (const cmd of save.radioCommands) {
      if (cmd.cooldownOff == null) continue;
      writeF32(save.properties, cmd.cooldownOff, 0);
      cmd.cooldown = 0;
      n++;
    }
    save.dirty = true;
    return n;
  }

  function setAllRadioCharges(save, amount) {
    amount = amount == null ? 99 : Math.max(0, Math.min(9999, Number(amount) | 0));
    discoverRadioCommands(save);
    let n = 0;
    for (const cmd of save.radioCommands) {
      if (cmd.chargesOff == null) continue;
      writeI32(save.properties, cmd.chargesOff, amount);
      cmd.charges = amount;
      n++;
    }
    save.dirty = true;
    return n;
  }

  function setSiteOutpostIdAt(save, site, newId, rediscover) {
    newId = String(newId == null ? "None" : newId).trim() || "None";
    if (!site || !site.outpostIdProp || site.outpostIdProp.valueOff == null) {
      throw new Error("Site OutpostId unavailable");
    }
    if (site.outpostId === newId) return false;
    const prop = site.outpostIdProp;
    const newStr = encodeUeString(newId);
    const delta = newStr.length - prop.valueBytes;
    let buf = spliceBuf(save.properties, prop.valueOff, prop.valueBytes, newStr);
    writeI64(buf, prop.dataLenOff, newStr.length);
    if (delta) buf = adjustAncestorSizes(buf, prop.valueOff, delta, [prop.dataLenOff]);
    save.properties = buf;
    save.dirty = true;
    site.outpostId = newId;
    prop.value = newId;
    prop.valueBytes = newStr.length;
    if (rediscover !== false) discoverMapSites(save);
    return true;
  }

  function setSiteOutpostId(save, siteIndex, newId) {
    if (!save.mapSites) discoverMapSites(save);
    const site = save.mapSites[siteIndex];
    if (!site) throw new Error("Invalid site index");
    return setSiteOutpostIdAt(save, site, newId, true);
  }

  function abandonAllOutposts(save) {
    discoverMapSites(save);
    let n = 0;
    for (let i = save.mapSites.length - 1; i >= 0; i--) {
      const site = save.mapSites[i];
      if (!site.outpostId || site.outpostId === "None") continue;
      if (setSiteOutpostIdAt(save, site, "None", false)) n++;
    }
    discoverMapSites(save);
    return n;
  }

  function setSiteBool(save, siteIndex, field, value) {
    if (!save.mapSites) discoverMapSites(save);
    const site = save.mapSites[siteIndex];
    if (!site) throw new Error("Invalid site index");
    const prop = site[field];
    if (!prop || prop.valueOff == null) throw new Error("Site field unavailable: " + field);
    save.properties[prop.valueOff] = value ? 1 : 0;
    prop.value = !!value;
    save.dirty = true;
    return true;
  }

  function clearAllInfestedOutposts(save) {
    discoverMapSites(save);
    let n = 0;
    for (const site of save.mapSites) {
      if (!site.infestedOutpost || site.infestedOutpost.valueOff == null) continue;
      if (!site.infestedOutpost.value) continue;
      save.properties[site.infestedOutpost.valueOff] = 0;
      site.infestedOutpost.value = false;
      n++;
    }
    save.dirty = true;
    return n;
  }

  function setAllSitesSurveyed(save, value) {
    discoverMapSites(save);
    let n = 0;
    for (const site of save.mapSites) {
      if (!site.surveyingComplete || site.surveyingComplete.valueOff == null) continue;
      save.properties[site.surveyingComplete.valueOff] = value ? 1 : 0;
      site.surveyingComplete.value = !!value;
      n++;
    }
    save.dirty = true;
    return n;
  }

  function scoutedLevelLabel(v) {
    if (!v) return "—";
    return String(v).replace(/^EScoutedLevel::/, "");
  }

  S.SCOUTED_LEVELS = SCOUTED_LEVELS;
  S.discoverMapQuest = discoverMapQuest;
  S.discoverMapSites = discoverMapSites;
  S.discoverRadioCommands = discoverRadioCommands;
  S.discoverMissions = discoverMissions;
  S.revealAllMapSites = revealAllMapSites;
  S.hideUnscoutedMapSites = hideUnscoutedMapSites;
  S.setSiteScoutedLevel = setSiteScoutedLevel;
  S.setAreMapsScouted = setAreMapsScouted;
  S.resetRadioCooldowns = resetRadioCooldowns;
  S.setAllRadioCharges = setAllRadioCharges;
  S.scoutedLevelLabel = scoutedLevelLabel;
  S.removeLooseMission = removeLooseMission;
  S.clearLooseMissions = clearLooseMissions;
  S.completeLooseMission = completeLooseMission;
  S.clearCompletedMissions = clearCompletedMissions;
  S.setSiteBool = setSiteBool;
  S.clearAllInfestedOutposts = clearAllInfestedOutposts;
  S.setAllSitesSurveyed = setAllSitesSurveyed;
  S.setSiteOutpostId = setSiteOutpostId;
  S.abandonAllOutposts = abandonAllOutposts;
})();
