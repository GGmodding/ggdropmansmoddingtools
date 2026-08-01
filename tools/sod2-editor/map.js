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
        if (p.name === "OutpostId") outpostId = p.value;
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
      });
    }

    save.mapSites = sites;
    save.mapSiteArray = header;
    save.mapSiteStats = { total: sites.length, byLevel };

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
    if (hits.length) {
      try {
        const header = parseStructArrayHeader(buf, hits[0].nameOffset);
        let o = header.itemsStart;
        for (let i = 0; i < header.count; i++) {
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
          missions.push({
            index: i,
            kind: "loose",
            assetName,
            missionName,
            label: missionName || assetName || "Mission #" + (i + 1),
          });
        }
      } catch (err) {
        console.warn("LooseMissionSaves parse failed", err);
      }
    }
    save.missions = missions;
    return missions;
  }

  function discoverMapQuest(save) {
    discoverMapSites(save);
    discoverRadioCommands(save);
    discoverMissions(save);
    return {
      sites: save.mapSites,
      radio: save.radioCommands,
      missions: save.missions,
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
})();
