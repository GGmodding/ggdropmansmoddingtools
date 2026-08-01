(() => {
  "use strict";

  /**
   * SoD2 survivor skills — ArrayProperty<SurvivorSkillSave>
   * Fields: SkillResourceID (Name), CurrentLevel (Int), CurrentXP (Float), GrantingTraitID (Name)
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before skills.js");

  const COMMON_SKILLS = [
    "Cardio",
    "Wits",
    "Fighting",
    "Shooting",
    "Medicine",
    "Craftsmanship",
    "Mechanics",
    "Cooking",
    "Chemistry",
    "Gardening",
    "Utilities",
    "Cardio_Backpacking",
    "Cardio_Acrobatics",
    "Cardio_Powerhouse",
    "Cardio_Gymnastics",
    "Cardio_Training",
    "Wits_Resourcefulness",
    "Wits_Scouting",
    "Wits_Scavenging",
    "Wits_Stealth",
    "Fighting_CloseCombat",
    "Fighting_Swordplay",
    "Fighting_Endurance",
    "Fighting_Striking",
    "Shooting_Gunslinging",
    "Shooting_Sharpshooting",
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
    if (len < 0 || o + 4 + len > buf.length) throw new Error("Bad UE string @ 0x" + o.toString(16));
    const s = len <= 1 ? "" : asciiAt(buf, o + 4, len - 1);
    return { s, next: o + 4 + len, bytes: 4 + len };
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
      o += 10;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "NameProperty" || type.s === "StrProperty" || type.s === "AssetObjectProperty") {
      const dataLenOff = o;
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
        valueOff,
        valueBytes: v.bytes,
      };
    }
    if (type.s === "IntProperty" || type.s === "UInt32Property" || type.s === "FloatProperty") {
      const dataLenOff = o;
      o += 8;
      o += 1;
      const valueOff = o;
      const value = type.s === "FloatProperty" ? readF32(buf, o) : (u32(buf, o) | 0);
      o += 4;
      return {
        next: o,
        name: name.s,
        type: type.s,
        value,
        dataLenOff,
        valueOff,
      };
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
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "ArrayProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      const et = readStr(buf, o);
      o = et.next;
      o += 1;
      o += dataLen;
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "MapProperty" || type.s === "SetProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      o += 5;
      o += Math.max(0, dataLen - 4);
      return { next: o, name: name.s, type: type.s };
    }
    if (type.s === "TextProperty") {
      const dataLen = i64(buf, o);
      o += 8;
      o += 1;
      o += dataLen;
      return { next: o, name: name.s, type: type.s };
    }
    throw new Error("Unsupported " + type.s + " (" + name.s + ")");
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

  function findNamedArrayStarts(buf, propName) {
    const enc = encodeUeString(propName);
    const out = [];
    outer: for (let i = 0; i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      try {
        const type = readStr(buf, i + enc.length);
        if (type.s === "ArrayProperty") out.push(i);
      } catch (_) {}
    }
    return out;
  }

  function parseSkillsArray(buf, start) {
    let o = start;
    const name = readStr(buf, o);
    if (name.s !== "Skills") throw new Error("Expected Skills array");
    o = name.next;
    const type = readStr(buf, o);
    if (type.s !== "ArrayProperty") throw new Error("Skills is not ArrayProperty");
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
    let r = readStr(buf, o);
    o = r.next;
    r = readStr(buf, o);
    o = r.next;
    const innerLenOff = o;
    const innerLen = i64(buf, o);
    o += 8;
    r = readStr(buf, o);
    o = r.next;
    o += 17;

    const skills = [];
    for (let i = 0; i < count; i++) {
      const skillStart = o;
      const fields = {};
      while (true) {
        const p = skipProperty(buf, o);
        o = p.next;
        if (p.name === "None") break;
        fields[p.name] = p;
      }
      skills.push({
        index: i,
        start: skillStart,
        end: o,
        size: o - skillStart,
        id: (fields.SkillResourceID && fields.SkillResourceID.value) || "(unknown)",
        level: fields.CurrentLevel ? fields.CurrentLevel.value : null,
        xp: fields.CurrentXP ? fields.CurrentXP.value : null,
        grantingTraitId: fields.GrantingTraitID ? fields.GrantingTraitID.value : null,
        fields,
      });
    }

    return {
      start,
      dataLenOff,
      dataLen,
      countOff,
      count,
      innerLenOff,
      innerLen,
      payloadStart,
      skills,
    };
  }

  function attachSkillsToSurvivors(save) {
    if (!save.survivors || !save.survivors.length) {
      if (S.discoverSurvivors) S.discoverSurvivors(save);
    }
    const buf = save.properties;
    const skillStarts = findNamedArrayStarts(buf, "Skills");
    const catalog = new Set(COMMON_SKILLS);

    for (const survivor of save.survivors) {
      // Prefer Skills that sit between FirstName and Traits
      let chosen = null;
      if (survivor.traitsOffset != null) {
        chosen = skillStarts.find((t) => t > survivor.firstNameOffset && t < survivor.traitsOffset);
      }
      if (chosen == null) {
        chosen = skillStarts.find((t) => t > survivor.firstNameOffset && t < survivor.firstNameOffset + 80000);
      }
      if (chosen == null) {
        survivor.skills = [];
        survivor.skillsOffset = null;
        continue;
      }
      try {
        const arr = parseSkillsArray(buf, chosen);
        survivor.skillsOffset = chosen;
        survivor.skills = arr.skills.map((sk) => ({
          index: sk.index,
          id: sk.id,
          level: sk.level,
          xp: sk.xp,
          grantingTraitId: sk.grantingTraitId,
          start: sk.start,
          end: sk.end,
          size: sk.size,
        }));
        for (const sk of survivor.skills) {
          if (sk.id && sk.id !== "(unknown)") catalog.add(sk.id);
        }
      } catch (err) {
        console.warn("Skills parse failed for", survivor.displayName, err);
        survivor.skills = [];
        survivor.skillsOffset = null;
      }
    }

    save.skillCatalog = [...catalog].sort((a, b) => a.localeCompare(b));
    return save.survivors;
  }

  function refresh(save) {
    if (S.discoverSurvivors) S.discoverSurvivors(save);
    return attachSkillsToSurvivors(save);
  }

  function getSkillParsed(save, survivorIndex, skillIndex) {
    refresh(save);
    const survivor = save.survivors[survivorIndex];
    if (!survivor || survivor.skillsOffset == null) throw new Error("Survivor has no Skills array");
    const arr = parseSkillsArray(save.properties, survivor.skillsOffset);
    const skill = arr.skills[skillIndex];
    if (!skill) throw new Error("Invalid skill slot");
    return { survivor, arr, skill };
  }

  function setSkillLevel(save, survivorIndex, skillIndex, level) {
    let v = Math.trunc(Number(level));
    if (!Number.isFinite(v)) throw new Error("Invalid level");
    v = Math.max(0, Math.min(99, v));
    const { skill } = getSkillParsed(save, survivorIndex, skillIndex);
    if (!skill.fields.CurrentLevel) throw new Error("CurrentLevel missing");
    writeI32(save.properties, skill.fields.CurrentLevel.valueOff, v);
    save.dirty = true;
    refresh(save);
  }

  function setSkillXp(save, survivorIndex, skillIndex, xp) {
    let v = Number(xp);
    if (!Number.isFinite(v)) throw new Error("Invalid XP");
    v = Math.max(0, Math.min(1e9, v));
    const { skill } = getSkillParsed(save, survivorIndex, skillIndex);
    if (!skill.fields.CurrentXP) throw new Error("CurrentXP missing");
    writeF32(save.properties, skill.fields.CurrentXP.valueOff, v);
    save.dirty = true;
    refresh(save);
  }

  function setSkillId(save, survivorIndex, skillIndex, newId) {
    newId = String(newId || "").trim();
    if (!/^[A-Za-z0-9_]+$/.test(newId)) throw new Error("Skill ID must be letters/numbers/underscore");

    const { arr, skill } = getSkillParsed(save, survivorIndex, skillIndex);
    const idProp = skill.fields.SkillResourceID;
    if (!idProp) throw new Error("SkillResourceID missing");

    const oldBytes = idProp.valueBytes;
    const newStr = encodeUeString(newId);
    const delta = newStr.length - oldBytes;
    let buf = spliceBuf(save.properties, idProp.valueOff, oldBytes, newStr);
    writeI64(buf, idProp.dataLenOff, newStr.length);

    if (delta !== 0) {
      writeI64(buf, arr.dataLenOff, arr.dataLen + delta);
      writeI64(buf, arr.innerLenOff, arr.innerLen + delta);
      buf = adjustAncestorSizes(buf, arr.payloadStart, delta, [arr.dataLenOff, arr.innerLenOff]);
    }

    save.properties = buf;
    save.dirty = true;
    refresh(save);
  }

  function removeSkill(save, survivorIndex, skillIndex) {
    const { arr, skill } = getSkillParsed(save, survivorIndex, skillIndex);
    if (arr.count <= 1) throw new Error("Refusing to remove the last skill");

    const size = skill.size;
    let buf = spliceBuf(save.properties, skill.start, size, null);
    writeU32(buf, arr.countOff, arr.count - 1);
    writeI64(buf, arr.dataLenOff, arr.dataLen - size);
    writeI64(buf, arr.innerLenOff, arr.innerLen - size);
    buf = adjustAncestorSizes(buf, arr.payloadStart, -size, [arr.dataLenOff, arr.innerLenOff]);

    save.properties = buf;
    save.dirty = true;
    refresh(save);
  }

  function addSkill(save, survivorIndex, skillId) {
    skillId = String(skillId || "Cardio").trim();
    if (!/^[A-Za-z0-9_]+$/.test(skillId)) throw new Error("Skill ID must be letters/numbers/underscore");

    refresh(save);
    const survivor = save.survivors[survivorIndex];
    if (!survivor || survivor.skillsOffset == null) throw new Error("Survivor has no Skills array");
    const arr = parseSkillsArray(save.properties, survivor.skillsOffset);
    const template = arr.skills.slice().sort((a, b) => a.size - b.size)[0];
    if (!template) throw new Error("No skill template to clone");

    let clone = save.properties.slice(template.start, template.end);
    const needle = encodeUeString("SkillResourceID");
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
    if (idValueRel < 0) throw new Error("Could not locate SkillResourceID in template");

    const newStr = encodeUeString(skillId);
    clone = spliceBuf(clone, idValueRel, idOldBytes, newStr);
    writeI64(clone, idDataLenRel, newStr.length);

    // Max out cloned skill level for usefulness
    const levelNeedle = encodeUeString("CurrentLevel");
    for (let i = 0; i <= clone.length - levelNeedle.length; i++) {
      let ok = true;
      for (let j = 0; j < levelNeedle.length; j++) {
        if (clone[i + j] !== levelNeedle[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      try {
        const type = readStr(clone, i + levelNeedle.length);
        if (type.s !== "IntProperty") continue;
        const valueOff = type.next + 9;
        writeI32(clone, valueOff, 7);
        break;
      } catch (_) {}
    }

    const insertAt = arr.skills[arr.skills.length - 1].end;
    const delta = clone.length;
    let buf = spliceBuf(save.properties, insertAt, 0, clone);
    writeU32(buf, arr.countOff, arr.count + 1);
    writeI64(buf, arr.dataLenOff, arr.dataLen + delta);
    writeI64(buf, arr.innerLenOff, arr.innerLen + delta);
    buf = adjustAncestorSizes(buf, arr.payloadStart, delta, [arr.dataLenOff, arr.innerLenOff]);

    save.properties = buf;
    save.dirty = true;
    refresh(save);
  }

  function maxAllSkills(save, survivorIndex) {
    refresh(save);
    const survivor = save.survivors[survivorIndex];
    if (!survivor || !survivor.skills) throw new Error("No skills");
    for (let i = 0; i < survivor.skills.length; i++) {
      setSkillLevel(save, survivorIndex, i, 7);
      setSkillXp(save, survivorIndex, i, 0);
    }
  }

  // Hook: whenever survivors are discovered, attach skills
  const origDiscover = S.discoverSurvivors;
  if (origDiscover) {
    S.discoverSurvivors = function (save) {
      const result = origDiscover(save);
      attachSkillsToSurvivors(save);
      return result;
    };
  }

  S.COMMON_SKILLS = COMMON_SKILLS;
  S.attachSkillsToSurvivors = attachSkillsToSurvivors;
  S.parseSkillsArray = parseSkillsArray;
  S.setSkillLevel = setSkillLevel;
  S.setSkillXp = setSkillXp;
  S.setSkillId = setSkillId;
  S.addSkill = addSkill;
  S.removeSkill = removeSkill;
  S.maxAllSkills = maxAllSkills;
})();
