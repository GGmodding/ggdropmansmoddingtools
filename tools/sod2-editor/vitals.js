(() => {
  "use strict";

  /**
   * SoD2 survivor vitals + identity (MapSurvivorSave fields near FirstName).
   *
   * Vitals: CurrentHealth/Stamina, FatigueCounter, addiction/sickness/plague/trauma counters,
   *         PlagueTimer/Rate, InjuryRecoveryCounter, ZombiesKilled, bIsDead/bIsDeparted
   * Identity: VoiceID, CulturalBackgroundName, HumanDefinition, IsMale/IsHomosexual,
   *           AgeRange/Pronoun/StandingLevel (Byte enums), HeroBonusID, LeaderTypeID,
   *           ProgressToNextStandingLevel, display fragments inside First/Last/Nick TextProperty
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before vitals.js");

  const AGE_LEVELS = ["ECharacterAge::Young", "ECharacterAge::MiddleAged", "ECharacterAge::Old"];
  const PRONOUNS = ["EPronoun::He", "EPronoun::She", "EPronoun::They"];
  const STANDING_LEVELS = [
    "ECharacterStanding::Stranger",
    "ECharacterStanding::Recruit",
    "ECharacterStanding::Citizen",
    "ECharacterStanding::Hero",
    "ECharacterStanding::Leader",
  ];
  const LEADER_TYPES = ["Trader", "Warlord", "Builder", "Sheriff"];

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
      return { next: v.next, name: name.s, type: type.s, value: v.s, valueOff: o, valueBytes: v.bytes, dataLenOff: o - 9 };
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
      const dataLenOff = o;
      const dataLen = i64(buf, o);
      o += 9;
      return {
        next: o + dataLen,
        name: name.s,
        type: type.s,
        dataLen,
        dataLenOff,
        payloadStart: o,
        payloadEnd: o + dataLen,
      };
    }
    throw new Error("Unsupported " + type.s);
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
        return i;
      } catch (_) {}
    }
    return -1;
  }

  function findDisplayFragment(buf, textProp) {
    if (!textProp || textProp.payloadStart == null) return null;
    const end = textProp.payloadEnd;
    let best = null;
    let o = textProp.payloadStart;
    while (o + 4 < end) {
      const len = u32(buf, o);
      if (len >= 2 && len < 80 && o + 4 + len <= end && buf[o + 4 + len - 1] === 0) {
        const s = asciiAt(buf, o + 4, len - 1);
        if (/^[A-Za-z][A-Za-z'\\-]*$/.test(s) && s !== "Name" && s !== "None" && !s.startsWith("DNL")) {
          best = { value: s, valueOff: o, valueBytes: 4 + len };
        }
        o += 4 + len;
        continue;
      }
      o++;
    }
    return best;
  }

  function parseNamedField(buf, from, to, propName, typeName) {
    const off = findNamedInRange(buf, from, to, propName, typeName);
    if (off < 0) return null;
    try {
      return { ...skipProperty(buf, off), nameOffset: off };
    } catch (_) {
      return null;
    }
  }

  function attachVitalsToSurvivors(save) {
    const buf = save.properties;
    if (!save.survivors || !save.survivors.length) return;

    const catalogs = {
      voices: new Set(),
      cultures: new Set(),
      humans: new Set(),
      heroes: new Set(),
      leaders: new Set(LEADER_TYPES),
      hats: new Set(),
      bodies: new Set(),
      archetypes: new Set(),
      ages: new Set(AGE_LEVELS),
      pronouns: new Set(PRONOUNS),
      standings: new Set(STANDING_LEVELS),
    };

    for (let i = 0; i < save.survivors.length; i++) {
      const survivor = save.survivors[i];
      const from = survivor.firstNameOffset;
      const to = save.survivors[i + 1]
        ? save.survivors[i + 1].firstNameOffset
        : Math.min(buf.length, from + 120000);

      const firstText = parseNamedField(buf, from, from + 200, "FirstName", "TextProperty");
      const lastText = parseNamedField(buf, from, from + 600, "LastName", "TextProperty");
      const nickText = parseNamedField(buf, from, from + 1200, "NickName", "TextProperty");

      const floatNames = [
        "CurrentHealth",
        "CurrentStamina",
        "FatigueCounter",
        "PainkillerAddictionCounter",
        "SicknessCounter",
        "PlagueTimer",
        "PlagueRate",
        "StimulantAddictionCounter",
        "TraumaCounter",
        "InjuryRecoveryCounter",
        "ProgressToNextStandingLevel",
      ];
      const floats = {};
      for (const n of floatNames) {
        const p = parseNamedField(buf, from, to, n, "FloatProperty");
        if (p) floats[n] = { value: p.value, valueOff: p.valueOff };
      }

      const ints = {};
      const zk = parseNamedField(buf, from, to, "ZombiesKilled", "IntProperty");
      if (zk) ints.ZombiesKilled = { value: zk.value, valueOff: zk.valueOff };

      const bools = {};
      for (const n of ["IsMale", "IsHomosexual", "HasBisexualVO", "bIsDead", "bIsDeparted", "bIsRecruitable"]) {
        const p = parseNamedField(buf, from, Math.min(to, from + 8000), n, "BoolProperty");
        if (p) bools[n] = { value: p.value, valueOff: p.valueOff };
      }

      const names = {};
      for (const n of ["VoiceID", "CulturalBackgroundName", "HumanDefinition", "HeroBonusID", "LeaderTypeID", "HatOutfitItemID", "BodyOutfitItemID", "ArchetypeID"]) {
        const p = parseNamedField(buf, from, to, n, "NameProperty");
        if (p) {
          names[n] = {
            value: p.value,
            valueOff: p.valueOff,
            valueBytes: p.valueBytes,
            dataLenOff: p.dataLenOff,
          };
        }
      }

      const enums = {};
      for (const n of ["AgeRange", "Pronoun", "StandingLevel"]) {
        const p = parseNamedField(buf, from, Math.min(to, from + 8000), n, "ByteProperty");
        if (p && p.enumType && p.enumType !== "None") {
          enums[n] = {
            value: p.value,
            valueOff: p.valueOff,
            valueBytes: p.valueBytes,
            dataLenOff: p.dataLenOff,
            enumType: p.enumType,
          };
        }
      }

      if (names.VoiceID) catalogs.voices.add(names.VoiceID.value);
      if (names.CulturalBackgroundName) catalogs.cultures.add(names.CulturalBackgroundName.value);
      if (names.HumanDefinition) catalogs.humans.add(names.HumanDefinition.value);
      if (names.HeroBonusID) catalogs.heroes.add(names.HeroBonusID.value);
      if (names.LeaderTypeID) catalogs.leaders.add(names.LeaderTypeID.value);
      if (enums.AgeRange) catalogs.ages.add(enums.AgeRange.value);
      if (enums.Pronoun) catalogs.pronouns.add(enums.Pronoun.value);
      if (names.HatOutfitItemID) catalogs.hats.add(names.HatOutfitItemID.value);
      if (names.BodyOutfitItemID) catalogs.bodies.add(names.BodyOutfitItemID.value);
      if (names.ArchetypeID) catalogs.archetypes.add(names.ArchetypeID.value);

      const firstFrag = findDisplayFragment(buf, firstText);
      const lastFrag = findDisplayFragment(buf, lastText);
      const nickFrag = findDisplayFragment(buf, nickText);

      survivor.vitals = {
        health: floats.CurrentHealth || null,
        stamina: floats.CurrentStamina || null,
        fatigue: floats.FatigueCounter || null,
        painkillers: floats.PainkillerAddictionCounter || null,
        sickness: floats.SicknessCounter || null,
        plagueTimer: floats.PlagueTimer || null,
        plagueRate: floats.PlagueRate || null,
        stimulants: floats.StimulantAddictionCounter || null,
        trauma: floats.TraumaCounter || null,
        injuryRecovery: floats.InjuryRecoveryCounter || null,
        standingProgress: floats.ProgressToNextStandingLevel || null,
        zombiesKilled: ints.ZombiesKilled || null,
        isDead: bools.bIsDead || null,
        isDeparted: bools.bIsDeparted || null,
      };

      survivor.identity = {
        firstNameFrag: firstFrag,
        lastNameFrag: lastFrag,
        nickNameFrag: nickFrag,
        firstNameEditable: !!firstFrag,
        lastNameEditable: !!lastFrag,
        nickNameEditable: !!nickFrag,
        voice: names.VoiceID || null,
        culture: names.CulturalBackgroundName || null,
        humanDefinition: names.HumanDefinition || null,
        heroBonus: names.HeroBonusID || null,
        leaderType: names.LeaderTypeID || null,
        hat: names.HatOutfitItemID || null,
        body: names.BodyOutfitItemID || null,
        archetype: names.ArchetypeID || null,
        isMale: bools.IsMale || null,
        isHomosexual: bools.IsHomosexual || null,
        hasBisexualVO: bools.HasBisexualVO || null,
        isRecruitable: bools.bIsRecruitable || null,
        ageRange: enums.AgeRange || null,
        pronoun: enums.Pronoun || null,
        standingLevel: enums.StandingLevel || null,
      };

      if (firstFrag) survivor.firstName = firstFrag.value;
      if (lastFrag) survivor.lastName = lastFrag.value;
      if (nickFrag) survivor.nickName = nickFrag.value;
      else survivor.nickName = survivor.nickName || "";
      survivor.displayName = (survivor.firstName + " " + survivor.lastName).trim();
    }

    save.survivorCatalogs = {
      voices: [...catalogs.voices].sort(),
      cultures: [...catalogs.cultures].sort(),
      humans: [...catalogs.humans].sort(),
      heroes: [...catalogs.heroes].sort(),
      leaders: [...catalogs.leaders].sort(),
      hats: [...catalogs.hats].sort(),
      bodies: [...catalogs.bodies].sort(),
      archetypes: [...catalogs.archetypes].sort(),
      ages: [...catalogs.ages].sort(),
      pronouns: [...catalogs.pronouns].sort(),
      standings: [...catalogs.standings].sort(),
    };
  }

  function refresh(save) {
    if (S.discoverSurvivors) S.discoverSurvivors(save);
    else attachVitalsToSurvivors(save);
  }

  function resolveSurvivor(save, index) {
    if (!save.survivors || !save.survivors[index] || !save.survivors[index].vitals) {
      refresh(save);
    }
    const s = save.survivors[index];
    if (!s) throw new Error("Invalid survivor");
    return s;
  }

  function setFloatRef(save, ref, value, min, max) {
    if (!ref || ref.valueOff == null) throw new Error("Field unavailable");
    let v = Number(value);
    if (!Number.isFinite(v)) throw new Error("Invalid number");
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    writeF32(save.properties, ref.valueOff, v);
    ref.value = v;
    save.dirty = true;
    return v;
  }

  function setIntRef(save, ref, value, min, max) {
    if (!ref || ref.valueOff == null) throw new Error("Field unavailable");
    let v = Number(value) | 0;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    writeI32(save.properties, ref.valueOff, v);
    ref.value = v;
    save.dirty = true;
    return v;
  }

  function setBoolRef(save, ref, value) {
    if (!ref || ref.valueOff == null) throw new Error("Field unavailable");
    const v = !!value;
    save.properties[ref.valueOff] = v ? 1 : 0;
    ref.value = v;
    save.dirty = true;
    return v;
  }

  function setNameRef(save, ref, newValue) {
    if (!ref || ref.valueOff == null) throw new Error("Field unavailable");
    newValue = String(newValue || "").trim();
    if (!newValue) throw new Error("Empty value");
    if (ref.value === newValue) return false;
    const newStr = encodeUeString(newValue);
    const delta = newStr.length - ref.valueBytes;
    let buf = spliceBuf(save.properties, ref.valueOff, ref.valueBytes, newStr);
    // NameProperty dataLen is 8 bytes before pad+value: valueOff is after 9 bytes from type.next
    // dataLenOff stored as valueOff - 9 in parse — verify: o += 9 then value at o, so dataLen is at o-9
    if (ref.dataLenOff != null) writeI64(buf, ref.dataLenOff, newStr.length);
    if (delta) buf = adjustAncestorSizes(buf, ref.valueOff, delta, ref.dataLenOff != null ? [ref.dataLenOff] : []);
    save.properties = buf;
    save.dirty = true;
    return true;
  }

  function setEnumRef(save, ref, enumValue) {
    if (!ref || ref.valueOff == null) throw new Error("Field unavailable");
    enumValue = String(enumValue || "").trim();
    if (!enumValue.includes("::")) throw new Error("Enum must look like Type::Value");
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

  function setDisplayFragment(save, frag, newValue, textDataLenOff) {
    if (!frag || frag.valueOff == null) throw new Error("Display name fragment not editable for this field");
    newValue = String(newValue || "").trim();
    if (!/^[A-Za-z][A-Za-z'\\-]{0,40}$/.test(newValue)) {
      throw new Error("Name must be letters / apostrophe / hyphen only");
    }
    if (frag.value === newValue) return false;
    const newStr = encodeUeString(newValue);
    const delta = newStr.length - frag.valueBytes;
    let buf = spliceBuf(save.properties, frag.valueOff, frag.valueBytes, newStr);
    if (textDataLenOff != null && delta) {
      writeI64(buf, textDataLenOff, i64(buf, textDataLenOff) + delta);
    }
    if (delta) {
      const skip = textDataLenOff != null ? [textDataLenOff] : [];
      buf = adjustAncestorSizes(buf, frag.valueOff, delta, skip);
    }
    save.properties = buf;
    save.dirty = true;
    return true;
  }

  function setSurvivorHealth(save, index, value) {
    const s = resolveSurvivor(save, index);
    setFloatRef(save, s.vitals.health, value, 0, 9999);
  }

  function setSurvivorStamina(save, index, value) {
    const s = resolveSurvivor(save, index);
    setFloatRef(save, s.vitals.stamina, value, 0, 9999);
  }

  function setSurvivorVitalFloat(save, index, key, value) {
    const s = resolveSurvivor(save, index);
    const map = {
      health: "health",
      stamina: "stamina",
      fatigue: "fatigue",
      painkillers: "painkillers",
      sickness: "sickness",
      plagueTimer: "plagueTimer",
      plagueRate: "plagueRate",
      stimulants: "stimulants",
      trauma: "trauma",
      injuryRecovery: "injuryRecovery",
      standingProgress: "standingProgress",
    };
    const refKey = map[key];
    if (!refKey) throw new Error("Unknown vital " + key);
    const max = key === "standingProgress" ? 1 : 9999;
    setFloatRef(save, s.vitals[refKey], value, 0, max);
  }

  function setSurvivorZombiesKilled(save, index, value) {
    const s = resolveSurvivor(save, index);
    setIntRef(save, s.vitals.zombiesKilled, value, 0, 999999);
  }

  function setSurvivorBool(save, index, key, value) {
    const s = resolveSurvivor(save, index);
    const id = s.identity || {};
    const vit = s.vitals || {};
    const refs = {
      isMale: id.isMale,
      isHomosexual: id.isHomosexual,
      hasBisexualVO: id.hasBisexualVO,
      isRecruitable: id.isRecruitable,
      isDead: vit.isDead,
      isDeparted: vit.isDeparted,
    };
    if (!refs[key]) throw new Error("Bool unavailable: " + key);
    setBoolRef(save, refs[key], value);
  }

  function setSurvivorIdentityName(save, index, key, value) {
    const s = resolveSurvivor(save, index);
    const id = s.identity;
    const refs = {
      voice: id.voice,
      culture: id.culture,
      humanDefinition: id.humanDefinition,
      heroBonus: id.heroBonus,
      leaderType: id.leaderType,
      hat: id.hat,
      body: id.body,
      archetype: id.archetype,
    };
    if (!refs[key]) throw new Error("Name field unavailable: " + key);
    const changed = setNameRef(save, refs[key], value);
    if (changed) refresh(save);
    return changed;
  }

  function setSurvivorEnum(save, index, key, value) {
    const s = resolveSurvivor(save, index);
    const refs = {
      ageRange: s.identity.ageRange,
      pronoun: s.identity.pronoun,
      standingLevel: s.identity.standingLevel,
    };
    if (!refs[key]) throw new Error("Enum unavailable: " + key);
    const changed = setEnumRef(save, refs[key], value);
    if (changed) refresh(save);
    return changed;
  }

  function setSurvivorDisplayName(save, index, part, value) {
    const s = resolveSurvivor(save, index);
    const buf = save.properties;
    const from = s.firstNameOffset;
    const to = Math.min(buf.length, from + 2000);
    let propName = "FirstName";
    let frag = s.identity.firstNameFrag;
    if (part === "last") {
      propName = "LastName";
      frag = s.identity.lastNameFrag;
    } else if (part === "nick") {
      propName = "NickName";
      frag = s.identity.nickNameFrag;
    } else if (part !== "first") {
      throw new Error("part must be first|last|nick");
    }
    const textOff = findNamedInRange(buf, from, to, propName, "TextProperty");
    if (textOff < 0 || !frag) throw new Error(propName + " has no editable display fragment in this save");
    const text = skipProperty(buf, textOff);
    const changed = setDisplayFragment(save, frag, value, text.dataLenOff);
    if (changed) refresh(save);
    return changed;
  }

  function healSurvivor(save, index) {
    const s = resolveSurvivor(save, index);
    if (s.vitals.health) setFloatRef(save, s.vitals.health, 200, 0, 9999);
    if (s.vitals.stamina) setFloatRef(save, s.vitals.stamina, 200, 0, 9999);
    for (const k of ["fatigue", "painkillers", "sickness", "plagueTimer", "stimulants", "trauma", "injuryRecovery"]) {
      if (s.vitals[k]) setFloatRef(save, s.vitals[k], 0, 0, 9999);
    }
    if (s.vitals.isDead) setBoolRef(save, s.vitals.isDead, false);
    if (s.vitals.isDeparted) setBoolRef(save, s.vitals.isDeparted, false);
  }

  function healAllSurvivors(save) {
    refresh(save);
    let n = 0;
    for (let i = 0; i < save.survivors.length; i++) {
      healSurvivor(save, i);
      n++;
    }
    return n;
  }

  function clearAllFatigue(save) {
    refresh(save);
    let n = 0;
    for (let i = 0; i < save.survivors.length; i++) {
      const s = save.survivors[i];
      if (s.vitals && s.vitals.fatigue) {
        setFloatRef(save, s.vitals.fatigue, 0, 0, 9999);
        n++;
      }
    }
    return n;
  }

  function promoteAllToHero(save) {
    refresh(save);
    let n = 0;
    // High → low so splices don't invalidate later survivors' absolute offsets.
    for (let i = save.survivors.length - 1; i >= 0; i--) {
      refresh(save);
      const s = save.survivors[i];
      if (s.identity && s.identity.standingLevel) {
        if (setEnumRef(save, s.identity.standingLevel, "ECharacterStanding::Hero")) n++;
      }
      refresh(save);
      const s2 = save.survivors[i];
      if (s2.vitals && s2.vitals.standingProgress) {
        setFloatRef(save, s2.vitals.standingProgress, 1, 0, 1);
      }
    }
    refresh(save);
    return n;
  }

  function enumLabel(v) {
    if (!v) return "—";
    return String(v).replace(/^E[A-Za-z]+::/, "");
  }

  const origDiscover = S.discoverSurvivors;
  if (origDiscover) {
    S.discoverSurvivors = function (save) {
      const result = origDiscover(save);
      attachVitalsToSurvivors(save);
      return result;
    };
  }

  S.AGE_LEVELS = AGE_LEVELS;
  S.PRONOUNS = PRONOUNS;
  S.STANDING_LEVELS = STANDING_LEVELS;
  S.LEADER_TYPES = LEADER_TYPES;
  S.attachVitalsToSurvivors = attachVitalsToSurvivors;
  S.setSurvivorHealth = setSurvivorHealth;
  S.setSurvivorStamina = setSurvivorStamina;
  S.setSurvivorVitalFloat = setSurvivorVitalFloat;
  S.setSurvivorZombiesKilled = setSurvivorZombiesKilled;
  S.setSurvivorBool = setSurvivorBool;
  S.setSurvivorIdentityName = setSurvivorIdentityName;
  S.setSurvivorEnum = setSurvivorEnum;
  S.setSurvivorDisplayName = setSurvivorDisplayName;
  S.healSurvivor = healSurvivor;
  S.healAllSurvivors = healAllSurvivors;
  S.clearAllFatigue = clearAllFatigue;
  S.promoteAllToHero = promoteAllToHero;
  S.survivorEnumLabel = enumLabel;
})();
