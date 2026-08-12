(() => {
  "use strict";

  function toBytes(input) {
    if (!input) return new Uint8Array(0);
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return new Uint8Array(input);
  }

  function readU32(buf, o) {
    if (o + 4 > buf.length) return null;
    return (
      (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0
    );
  }

  function readI32(buf, o) {
    const u = readU32(buf, o);
    return u == null ? null : u | 0;
  }

  function readFString(buf, o) {
    const rawLen = readI32(buf, o);
    if (rawLen == null) return [null, o];
    let off = o + 4;
    if (rawLen === 0) return ["", off];
    if (rawLen < 0) {
      const chars = -rawLen;
      const bytes = chars * 2;
      if (off + bytes > buf.length) return [null, off];
      const units = [];
      for (let i = 0; i < chars; i++) {
        units.push(buf[off + i * 2] | (buf[off + i * 2 + 1] << 8));
      }
      off += bytes;
      let s = String.fromCharCode.apply(null, units);
      if (s.endsWith("\0")) s = s.slice(0, -1);
      return [s, off];
    }
    if (off + rawLen > buf.length) return [null, off];
    let raw = buf.subarray(off, off + rawLen);
    off += rawLen;
    if (raw.length && raw[raw.length - 1] === 0) {
      raw = raw.subarray(0, raw.length - 1);
    }
    return [new TextDecoder().decode(raw), off];
  }

  function writeI32(buf, o, value) {
    const v = value | 0;
    buf[o] = v & 0xff;
    buf[o + 1] = (v >>> 8) & 0xff;
    buf[o + 2] = (v >>> 16) & 0xff;
    buf[o + 3] = (v >>> 24) & 0xff;
  }

  function writeF64(buf, o, value) {
    new DataView(buf.buffer, buf.byteOffset + o, 8).setFloat64(0, value, true);
  }

  /** UE property value payload starts after type name + index(4)+size(4)+tag(1). */
  const VALUE_OFF = 9;
  const BOOL_OFF = 8;

  function findNamedProperties(buf, propName) {
    const enc = new TextEncoder().encode(propName + "\0");
    const hits = [];
    for (let i = 4; i < buf.length - enc.length - 24; i++) {
      let ok = true;
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (readU32(buf, i - 4) !== enc.length) continue;
      const [type, afterType] = readFString(buf, i + enc.length);
      if (!type) continue;
      hits.push({ nameAt: i, type, afterType, valueAt: afterType + VALUE_OFF });
    }
    return hits;
  }

  function findNamedProperty(buf, propName, typeName) {
    return findNamedProperties(buf, propName).find((h) => !typeName || h.type === typeName) || null;
  }

  function readIntProperty(buf, propName) {
    const h = findNamedProperty(buf, propName, "IntProperty");
    if (!h) return null;
    const value = readI32(buf, h.valueAt);
    return { value, hit: h, valueAt: h.valueAt };
  }

  function writeIntProperty(buf, propName, value) {
    const found = readIntProperty(buf, propName);
    if (!found) throw new Error(propName + " IntProperty not found.");
    const out = new Uint8Array(buf);
    writeI32(out, found.valueAt, value);
    return { bytes: out, value: value | 0 };
  }

  function readDoubleProperty(buf, propName) {
    const h = findNamedProperty(buf, propName, "DoubleProperty");
    if (!h) return null;
    const value = new DataView(buf.buffer, buf.byteOffset + h.valueAt, 8).getFloat64(0, true);
    return { value, hit: h, valueAt: h.valueAt };
  }

  function writeDoubleProperty(buf, propName, value) {
    const found = readDoubleProperty(buf, propName);
    if (!found) throw new Error(propName + " DoubleProperty not found.");
    const out = new Uint8Array(buf);
    writeF64(out, found.valueAt, Number(value));
    return { bytes: out, value: Number(value) };
  }

  function readNameProperty(buf, propName) {
    const h = findNamedProperty(buf, propName, "NameProperty");
    if (!h) return null;
    const [value, end] = readFString(buf, h.valueAt);
    if (value == null) return null;
    return { value, hit: h, stringAt: h.valueAt, end };
  }

  function readBoolProperty(buf, propName) {
    const h = findNamedProperty(buf, propName, "BoolProperty");
    if (!h) return null;
    const valueAt = h.afterType + BOOL_OFF;
    if (valueAt >= buf.length) return null;
    return { value: buf[valueAt] !== 0, hit: h, valueAt };
  }

  function writeBoolProperty(buf, propName, value) {
    const found = readBoolProperty(buf, propName);
    if (!found) throw new Error(propName + " BoolProperty not found.");
    const out = new Uint8Array(buf);
    out[found.valueAt] = value ? 1 : 0;
    return { bytes: out, value: !!value };
  }

  const CHAR_NAME = "CharacterHardcodedName_36_FB9BA9294D02CFB5AD3668B0C4FD85A5";
  const CHAR_LEVEL = "CurrentLevel_49_97AB711D48E18088A93C8DADFD96F854";
  const CHAR_XP = "CurrentExperience_9_F9C772C9454408DBD6E1269409F37747";
  const CHAR_AP = "AvailableActionPoints_103_25B963504066FA8FD1210890DD45C001";
  const CHAR_LUMINA = "LuminaFromConsumables_210_7CAC193144F82258C6A89BB09BB1D226";
  const CHAR_EXCLUDED = "IsExcluded_206_5D433A504D71F6A2FC9057945C23DDFB";

  function parseInventory(buf) {
    const inv = findNamedProperty(buf, "InventoryItems", "MapProperty");
    const goldProp = findNamedProperty(buf, "Gold", "IntProperty");
    if (!inv) return { items: [], regionEnd: null };

    // Entries start after key/value type headers. Scan FString + i32 pairs until Gold IntProperty.
    let o = inv.afterType;
    // Skip until we see a plausible first inventory key length near NameProperty/IntProperty headers.
    const limit = goldProp ? goldProp.nameAt - 4 : Math.min(buf.length, inv.afterType + 200000);
    // Jump to first entry: search for HealingTint / first Name after IntProperty type string.
    const marker = new TextEncoder().encode("IntProperty\0");
    let start = -1;
    for (let i = inv.afterType; i < inv.afterType + 80; i++) {
      let ok = true;
      for (let j = 0; j < marker.length; j++) {
        if (buf[i + j] !== marker[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // After IntProperty\0 there are a few header bytes then count then first key.
      let p = i + marker.length;
      // Tolerate small header (zeros / N / count)
      for (let skip = 0; skip < 24; skip++) {
        const [k, end] = readFString(buf, p + skip);
        if (k && /^[A-Za-z][A-Za-z0-9_+]{2,60}$/.test(k)) {
          start = p + skip;
          break;
        }
      }
      if (start >= 0) break;
    }
    if (start < 0) return { items: [], regionEnd: null, regionStart: null };

    const items = [];
    let oCur = start;
    while (oCur + 8 < limit) {
      const [k, end] = readFString(buf, oCur);
      if (!k || !/^[A-Za-z0-9_+]+$/.test(k) || k.length > 80) break;
      if (k === "Gold" && goldProp && oCur === goldProp.nameAt - 4) break;
      const valAt = end;
      const value = readI32(buf, valAt);
      if (value == null) break;
      // Next field should look like another inventory key, not "IntProperty"
      const [peek] = readFString(buf, valAt + 4);
      items.push({ key: k, value, nameAt: oCur + 4, valAt });
      oCur = valAt + 4;
      if (peek === "IntProperty" || peek === "MapProperty" || peek === "ArrayProperty") {
        items.pop();
        break;
      }
      if (items.length > 5000) break;
    }
    return { items, regionStart: start, regionEnd: oCur };
  }

  function findInventoryItem(buf, key) {
    const inv = parseInventory(buf);
    return inv.items.find((it) => it.key === key) || null;
  }

  function writeInventoryItem(buf, key, value) {
    const item = findInventoryItem(buf, key);
    if (!item) {
      throw new Error(
        key +
          " is not in this save's inventory map. Use Insert on Resources, or pick it up in-game first."
      );
    }
    const out = new Uint8Array(buf);
    writeI32(out, item.valAt, value);
    return { bytes: out, value: value | 0, key };
  }

  /** Locate InventoryItems count + payload-size fields for splicing. */
  function locateInventoryMeta(buf) {
    const inv = findNamedProperty(buf, "InventoryItems", "MapProperty");
    const goldProp = findNamedProperty(buf, "Gold", "IntProperty");
    const parsed = parseInventory(buf);
    if (!inv || !parsed.regionStart || parsed.regionEnd == null) return null;
    // Count is always immediately before the first entry.
    const countAt = parsed.regionStart - 4;
    const count = readU32(buf, countAt);
    if (count !== parsed.items.length) return null;
    // Payload size sits 8 bytes before count: [size u32][zero u32][count u32][entries…]
    const sizeAt = countAt - 8;
    const size = readU32(buf, sizeAt);
    return {
      inv,
      goldProp,
      items: parsed.items,
      regionStart: parsed.regionStart,
      regionEnd: parsed.regionEnd,
      countAt,
      sizeAt,
      count,
      size,
    };
  }

  function encodeInventoryEntry(key, value) {
    const enc = new TextEncoder().encode(key);
    const out = new Uint8Array(4 + enc.length + 1 + 4);
    writeI32(out, 0, enc.length + 1);
    out.set(enc, 4);
    out[4 + enc.length] = 0;
    writeI32(out, 4 + enc.length + 1, value | 0);
    return out;
  }

  function spliceBytes(buf, at, insert) {
    const out = new Uint8Array(buf.length + insert.length);
    out.set(buf.subarray(0, at), 0);
    out.set(insert, at);
    out.set(buf.subarray(at), at + insert.length);
    return out;
  }

  function insertInventoryItem(buf, key, value) {
    if (!/^[A-Za-z][A-Za-z0-9_+]{1,80}$/.test(key)) {
      throw new Error("Invalid inventory key.");
    }
    const existing = findInventoryItem(buf, key);
    if (existing) return writeInventoryItem(buf, key, value);
    const meta = locateInventoryMeta(buf);
    if (!meta) throw new Error("Could not locate InventoryItems map for insert.");
    const entry = encodeInventoryEntry(key, value);
    const insertAt = meta.regionEnd;
    let out = spliceBytes(buf, insertAt, entry);
    writeI32(out, meta.countAt, (meta.count | 0) + 1);
    // Some UE builds store an extra length near count; bump it when it looks like a payload size.
    if (meta.size > 32 && meta.size < 5e6) {
      writeI32(out, meta.sizeAt, (meta.size | 0) + entry.length);
    }
    return { bytes: out, value: value | 0, key, inserted: true };
  }

  function ensureInventoryItem(buf, key, value) {
    if (findInventoryItem(buf, key)) return writeInventoryItem(buf, key, value);
    return insertInventoryItem(buf, key, value);
  }

  const WEAPON_DEF = "DefinitionID_3_60EB24664894755B19F4EBA18A21AF1A";
  const WEAPON_LEVEL = "CurrentLevel_6_227A00644D035BDD595B2D86C8455B71";
  const ATTR_MAP = "AssignedAttributePoints_190_4E4BA51441F1E8D8E07ECA95442E0B7E";
  const SKILL_UNLOCKED = "UnlockedSkills_197_FAA1BD934F68CFC542FB048E3C0F3592";
  const SKILL_EQUIPPED = "EquippedSkills_201_05B6B5E9490E2586B23751B11CDA521F";
  const PASSIVE_NAME = "PassiveEffectName_3_A92DB6CC4549450728A867A714ADF6C5";
  const PASSIVE_LEARNT = "IsLearnt_9_2561000E49D90653437DE9A45BE2A86D";
  const PASSIVE_STEPS = "LearntSteps_6_A14D681549E830249C77BD95F2B4CF3F";

  function parseWeapons(buf) {
    const defHits = findNamedProperties(buf, WEAPON_DEF).filter((h) => h.type === "NameProperty");
    const lvlHits = findNamedProperties(buf, WEAPON_LEVEL).filter((h) => h.type === "IntProperty");
    const weapons = [];
    for (const dh of defHits) {
      const [name] = readFString(buf, dh.valueAt);
      let level = null;
      let levelAt = null;
      let best = Infinity;
      for (const lh of lvlHits) {
        const d = lh.nameAt - dh.nameAt;
        if (d >= 0 && d < best && d < 300) {
          best = d;
          level = readI32(buf, lh.valueAt);
          levelAt = lh.valueAt;
        }
      }
      if (name) weapons.push({ name, level, levelAt });
    }
    return weapons;
  }

  function writeWeaponLevel(buf, levelAt, level) {
    if (levelAt == null) throw new Error("Weapon level offset missing.");
    const out = new Uint8Array(buf);
    writeI32(out, levelAt, Math.max(1, Math.min(33, level | 0)));
    return { bytes: out, value: Math.max(1, Math.min(33, level | 0)) };
  }

  function parseAttributes(buf) {
    const hits = [];
    const needle = new TextEncoder().encode("ECharacterAttribute::NewEnumerator");
    for (let i = 0; i < buf.length - needle.length - 8; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (buf[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const len = readU32(buf, i - 4);
      if (!len || len > 80 || i - 4 + 4 + len > buf.length) continue;
      const [full, end] = readFString(buf, i - 4);
      if (!full || full.indexOf("ECharacterAttribute::NewEnumerator") !== 0) continue;
      const value = readI32(buf, end);
      if (value == null) continue;
      const m = /NewEnumerator(\d+)/.exec(full);
      hits.push({
        id: full,
        index: m ? Number(m[1]) : -1,
        value,
        valAt: end,
      });
    }
    // Keep only attribute entries that sit inside an AssignedAttributePoints map.
    // There is one map per character — do not clip to the first map only.
    const apHits = findNamedProperties(buf, ATTR_MAP).filter((h) => h.type === "MapProperty");
    if (!apHits.length) return hits;
    return hits.filter((h) =>
      apHits.some((ap) => h.valAt > ap.nameAt && h.valAt < ap.nameAt + 4000)
    );
  }

  function writeAttribute(buf, valAt, value) {
    const out = new Uint8Array(buf);
    writeI32(out, valAt, Math.max(0, value | 0));
    return { bytes: out, value: Math.max(0, value | 0) };
  }

  function parseNameArrayAt(buf, h) {
    const marker = new TextEncoder().encode("NameProperty\0");
    for (let i = h.afterType; i < Math.min(buf.length, h.afterType + 60); i++) {
      let ok = true;
      for (let j = 0; j < marker.length; j++) {
        if (buf[i + j] !== marker[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let p = i + marker.length;
      for (let skip = 0; skip < 20; skip++) {
        const count = readU32(buf, p + skip);
        if (count == null || count <= 0 || count >= 200) continue;
        const out = [];
        let q = p + skip + 4;
        let good = true;
        for (let n = 0; n < count; n++) {
          if (q + 4 > buf.length) {
            good = false;
            break;
          }
          const [nm, nend] = readFString(buf, q);
          if (!nm || nend <= q) {
            good = false;
            break;
          }
          out.push({ name: nm, at: q, propAt: h.nameAt });
          q = nend;
        }
        if (good && out.length === count) return out;
      }
    }
    return [];
  }

  function parseAllNameArrays(buf, propName) {
    const hits = findNamedProperties(buf, propName).filter((h) => h.type === "ArrayProperty");
    const out = [];
    for (const h of hits) {
      out.push(...parseNameArrayAt(buf, h));
    }
    return out;
  }

  function parseSkills(buf) {
    return {
      unlocked: parseAllNameArrays(buf, SKILL_UNLOCKED),
      equipped: parseAllNameArrays(buf, SKILL_EQUIPPED),
    };
  }

  function parseExploration(buf) {
    const caps = [];
    const needle = new TextEncoder().encode("E_ExplorationCapacity::NewEnumerator");
    for (let i = 0; i < buf.length - needle.length; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (buf[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const [full] = readFString(buf, i - 4);
      if (full && full.indexOf("E_ExplorationCapacity::") === 0) {
        const m = /NewEnumerator(\d+)/.exec(full);
        caps.push({ id: full, index: m ? Number(m[1]) : -1, at: i - 4 });
      }
    }
    const world = [];
    const needle2 = new TextEncoder().encode("E_WorldMapExplorationCapacity::NewEnumerator");
    for (let i = 0; i < buf.length - needle2.length; i++) {
      let ok = true;
      for (let j = 0; j < needle2.length; j++) {
        if (buf[i + j] !== needle2[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const [full] = readFString(buf, i - 4);
      if (full && full.indexOf("E_WorldMapExplorationCapacity::") === 0) {
        const m = /NewEnumerator(\d+)/.exec(full);
        world.push({ id: full, index: m ? Number(m[1]) : -1, at: i - 4 });
      }
    }
    return { exploration: caps, worldMap: world };
  }

  function parseSpawn(buf) {
    const map = readNameProperty(buf, "MapToLoad");
    let spawnTag = null;
    let spawnAt = null;
    const sp = findNamedProperty(buf, "SpawnPointTagToLoadAt", "StructProperty");
    if (sp) {
      const tagHits = findNamedProperties(buf, "TagName").filter((h) => h.type === "NameProperty");
      for (const th of tagHits) {
        if (th.nameAt > sp.nameAt && th.nameAt < sp.nameAt + 250) {
          const [v] = readFString(buf, th.valueAt);
          spawnTag = v;
          spawnAt = th.valueAt;
          break;
        }
      }
    }
    return {
      mapToLoad: map ? map.value : null,
      mapAt: map ? map.stringAt : null,
      spawnTag,
      spawnAt,
    };
  }

  function rewriteFStringInPlace(buf, stringAt, newValue) {
    const oldLen = readI32(buf, stringAt);
    if (oldLen == null || oldLen <= 0) throw new Error("Unsupported string encoding.");
    const enc = new TextEncoder().encode(newValue);
    const capacity = oldLen - 1;
    if (enc.length > capacity) {
      throw new Error(
        "New value too long (max " + capacity + " chars for in-place edit). Keep similar length."
      );
    }
    const out = new Uint8Array(buf);
    const payload = new Uint8Array(oldLen);
    payload.set(enc, 0);
    for (let i = enc.length; i < capacity; i++) payload[i] = 0x20;
    payload[oldLen - 1] = 0;
    out.set(payload, stringAt + 4);
    return { bytes: out, value: newValue, padded: enc.length < capacity };
  }

  function writeMapToLoad(buf, newMap) {
    const map = readNameProperty(buf, "MapToLoad");
    if (!map) throw new Error("MapToLoad not found.");
    return rewriteFStringInPlace(buf, map.stringAt, newMap);
  }

  function writeSpawnTag(buf, newTag) {
    const sp = parseSpawn(buf);
    if (sp.spawnAt == null) throw new Error("Spawn TagName not found.");
    return rewriteFStringInPlace(buf, sp.spawnAt, newTag);
  }

  function parsePictos(buf) {
    const nameHits = findNamedProperties(buf, PASSIVE_NAME).filter(
      (h) => h.type === "NameProperty" || h.type === "StrProperty"
    );
    const learntHits = findNamedProperties(buf, PASSIVE_LEARNT).filter((h) => h.type === "BoolProperty");
    const stepHits = findNamedProperties(buf, PASSIVE_STEPS).filter((h) => h.type === "IntProperty");
    const pictos = [];
    for (const nh of nameHits) {
      const [name] = readFString(buf, nh.valueAt);
      if (!name) continue;
      let learnt = null;
      let learntAt = null;
      let steps = null;
      let stepsAt = null;
      for (const lh of learntHits) {
        const d = lh.nameAt - nh.nameAt;
        if (d >= 0 && d < 200) {
          learnt = buf[lh.afterType + BOOL_OFF] !== 0;
          learntAt = lh.afterType + BOOL_OFF;
          break;
        }
      }
      for (const sh of stepHits) {
        const d = sh.nameAt - nh.nameAt;
        if (d >= 0 && d < 250) {
          steps = readI32(buf, sh.valueAt);
          stepsAt = sh.valueAt;
          break;
        }
      }
      pictos.push({ name, learnt, learntAt, steps, stepsAt });
    }
    return pictos;
  }

  function writePictoFlags(buf, learntAt, stepsAt, learnt, steps) {
    const out = new Uint8Array(buf);
    if (learntAt != null) out[learntAt] = learnt ? 0x10 : 0;
    if (stepsAt != null) writeI32(out, stepsAt, Math.max(0, steps | 0));
    return { bytes: out };
  }

  function encodeFStringBytes(str) {
    const enc = new TextEncoder().encode(str);
    const out = new Uint8Array(4 + enc.length + 1);
    writeI32(out, 0, enc.length + 1);
    out.set(enc, 4);
    out[4 + enc.length] = 0;
    return out;
  }

  function encodeNamePropBytes(propName, value) {
    const name = encodeFStringBytes(propName);
    const type = encodeFStringBytes("NameProperty");
    const val = encodeFStringBytes(value);
    const hdr = new Uint8Array(9);
    writeI32(hdr, 0, 0);
    writeI32(hdr, 4, val.length);
    hdr[8] = 0;
    const out = new Uint8Array(name.length + type.length + hdr.length + val.length);
    let o = 0;
    out.set(name, o); o += name.length;
    out.set(type, o); o += type.length;
    out.set(hdr, o); o += hdr.length;
    out.set(val, o);
    return out;
  }

  function encodeIntPropBytes(propName, value) {
    const name = encodeFStringBytes(propName);
    const type = encodeFStringBytes("IntProperty");
    const hdr = new Uint8Array(9);
    writeI32(hdr, 0, 0);
    writeI32(hdr, 4, 4);
    hdr[8] = 0;
    const val = new Uint8Array(4);
    writeI32(val, 0, value | 0);
    const out = new Uint8Array(name.length + type.length + hdr.length + val.length);
    let o = 0;
    out.set(name, o); o += name.length;
    out.set(type, o); o += type.length;
    out.set(hdr, o); o += hdr.length;
    out.set(val, o);
    return out;
  }

  function encodeBoolPropBytes(propName, value) {
    const name = encodeFStringBytes(propName);
    const type = encodeFStringBytes("BoolProperty");
    const hdr = new Uint8Array(9);
    writeI32(hdr, 0, 0);
    writeI32(hdr, 4, 0);
    // Game stores true as 0x10 in the tag byte.
    hdr[8] = value ? 0x10 : 0;
    const out = new Uint8Array(name.length + type.length + hdr.length);
    let o = 0;
    out.set(name, o); o += name.length;
    out.set(type, o); o += type.length;
    out.set(hdr, o);
    return out;
  }

  function encodeWeaponProgressionEntry(id, level) {
    const a = encodeNamePropBytes(WEAPON_DEF, id);
    const b = encodeIntPropBytes(WEAPON_LEVEL, Math.max(1, Math.min(33, level | 0)));
    const none = encodeFStringBytes("None");
    const out = new Uint8Array(a.length + b.length + none.length);
    out.set(a, 0);
    out.set(b, a.length);
    out.set(none, a.length + b.length);
    return out;
  }

  function encodePassiveProgressionEntry(id, learnt, steps) {
    const a = encodeNamePropBytes(PASSIVE_NAME, id);
    const b = encodeBoolPropBytes(PASSIVE_LEARNT, !!learnt);
    const c = encodeIntPropBytes(PASSIVE_STEPS, Math.max(0, steps | 0));
    const none = encodeFStringBytes("None");
    const out = new Uint8Array(a.length + b.length + c.length + none.length);
    let o = 0;
    out.set(a, o); o += a.length;
    out.set(b, o); o += b.length;
    out.set(c, o); o += c.length;
    out.set(none, o);
    return out;
  }

  /** Locate ArrayProperty-of-struct meta: payload size + count just before first entry. */
  function locateStructArrayMeta(buf, arrayName, entryPropName) {
    const arr = findNamedProperty(buf, arrayName, "ArrayProperty");
    if (!arr) return null;
    const entryHits = findNamedProperties(buf, entryPropName).filter(
      (h) => h.nameAt > arr.nameAt
    );
    // Stop before the next root-ish property after this array when possible.
    const nextRoot = findNamedProperties(buf, "PassiveEffectsProgressions")
      .concat(findNamedProperties(buf, "InteractedDialogues"))
      .concat(findNamedProperties(buf, "GameDifficultyData"))
      .map((h) => h.nameAt)
      .filter((at) => at > arr.nameAt)
      .sort((a, b) => a - b)[0];
    const inArray = entryHits.filter((h) => nextRoot == null || h.nameAt < nextRoot);
    if (!inArray.length) {
      // Empty array: find size/count after GUID block by scanning for zeros+size+count pattern near end of header.
      return null;
    }
    const firstAt = inArray[0].nameAt - 4;
    const countAt = firstAt - 4;
    const sizeAt = firstAt - 8;
    const count = readU32(buf, countAt);
    const size = readU32(buf, sizeAt);
    // End of last entry: find its terminating None
    const lastHit = inArray[inArray.length - 1];
    const noneEnc = new TextEncoder().encode("None\0");
    let insertAt = null;
    const scanEnd = nextRoot != null ? nextRoot : Math.min(buf.length, lastHit.nameAt + 500);
    for (let i = lastHit.nameAt; i < scanEnd - noneEnc.length; i++) {
      let ok = true;
      for (let j = 0; j < noneEnc.length; j++) {
        if (buf[i + j] !== noneEnc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (readU32(buf, i - 4) !== noneEnc.length) continue;
      insertAt = i - 4 + 4 + noneEnc.length;
      break;
    }
    if (insertAt == null) return null;
    return {
      arr,
      firstAt,
      countAt,
      sizeAt,
      count,
      size,
      entryCount: inArray.length,
      insertAt,
      names: inArray.map((h) => {
        const [n] = readFString(buf, h.valueAt);
        return n;
      }),
    };
  }

  function insertStructArrayEntries(buf, arrayName, entryPropName, encodedEntries) {
    if (!encodedEntries.length) return { bytes: new Uint8Array(buf), inserted: 0 };
    const meta = locateStructArrayMeta(buf, arrayName, entryPropName);
    if (!meta) throw new Error("Could not locate " + arrayName + " array for insert.");
    let total = 0;
    for (const e of encodedEntries) total += e.length;
    const blob = new Uint8Array(total);
    let o = 0;
    for (const e of encodedEntries) {
      blob.set(e, o);
      o += e.length;
    }
    let out = spliceBytes(buf, meta.insertAt, blob);
    writeI32(out, meta.countAt, (meta.count | 0) + encodedEntries.length);
    writeI32(out, meta.sizeAt, (meta.size | 0) + blob.length);
    return { bytes: out, inserted: encodedEntries.length, bytesAdded: blob.length };
  }

  function insertInventoryItemsBatch(buf, pairs) {
    const missing = [];
    for (const [key, value] of pairs) {
      if (!/^[A-Za-z][A-Za-z0-9_+]{1,80}$/.test(key)) continue;
      if (!findInventoryItem(buf, key)) missing.push([key, value]);
    }
    if (!missing.length) return { bytes: new Uint8Array(buf), inserted: 0 };
    const meta = locateInventoryMeta(buf);
    if (!meta) throw new Error("Could not locate InventoryItems map for insert.");
    const parts = missing.map(([k, v]) => encodeInventoryEntry(k, v));
    let total = 0;
    for (const p of parts) total += p.length;
    const blob = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      blob.set(p, o);
      o += p.length;
    }
    let out = spliceBytes(buf, meta.regionEnd, blob);
    writeI32(out, meta.countAt, (meta.count | 0) + missing.length);
    if (meta.size > 32 && meta.size < 5e6) {
      writeI32(out, meta.sizeAt, (meta.size | 0) + blob.length);
    }
    return { bytes: out, inserted: missing.length };
  }

  /**
   * Unlock pictos: inventory + WeaponProgressions + PassiveEffectsProgressions (mastered).
   * ids: string[] of picto definition names.
   */
  function unlockAllPictos(buf, ids, opts) {
    const options = opts || {};
    const master = options.master !== false;
    const level = options.level != null ? options.level | 0 : 1;
    const steps = options.steps != null ? options.steps | 0 : 4;
    const list = (ids || []).filter((id) => typeof id === "string" && id.length > 0);
    if (!list.length) throw new Error("No picto ids provided.");

    const want = new Set(list);
    let bytes = new Uint8Array(buf);

    const existingPep = new Set(parsePictos(bytes).map((p) => p.name));
    const existingWp = new Set(parseWeapons(bytes).map((w) => w.name));
    const existingInv = new Set(parseInventory(bytes).items.map((i) => i.key));

    const missingPep = list.filter((id) => !existingPep.has(id));
    const missingWp = list.filter((id) => !existingWp.has(id));
    const missingInv = list.filter((id) => !existingInv.has(id));

    // Insert high-offset arrays first, then inventory (lower offset) so splices stay valid.
    if (missingPep.length) {
      const entries = missingPep.map((id) =>
        encodePassiveProgressionEntry(id, master, master ? steps : 0)
      );
      bytes = insertStructArrayEntries(
        bytes,
        "PassiveEffectsProgressions",
        PASSIVE_NAME,
        entries
      ).bytes;
    }
    if (missingWp.length) {
      const entries = missingWp.map((id) => encodeWeaponProgressionEntry(id, level));
      bytes = insertStructArrayEntries(bytes, "WeaponProgressions", WEAPON_DEF, entries).bytes;
    }
    if (missingInv.length) {
      bytes = insertInventoryItemsBatch(
        bytes,
        missingInv.map((id) => [id, 1])
      ).bytes;
    }

    // Update existing entries in place.
    for (const p of parsePictos(bytes)) {
      if (!want.has(p.name)) continue;
      if (master && p.learntAt != null) {
        bytes = writePictoFlags(bytes, p.learntAt, p.stepsAt, true, steps).bytes;
      }
    }
    for (const w of parseWeapons(bytes)) {
      if (!want.has(w.name) || w.levelAt == null) continue;
      const next = Math.max(level, w.level != null ? w.level : 1);
      bytes = writeWeaponLevel(bytes, w.levelAt, next).bytes;
    }
    for (const id of list) {
      const it = findInventoryItem(bytes, id);
      if (it && it.value < 1) {
        bytes = writeInventoryItem(bytes, id, 1).bytes;
      }
    }

    return {
      bytes,
      requested: list.length,
      insertedInventory: missingInv.length,
      insertedWeapons: missingWp.length,
      insertedPassives: missingPep.length,
    };
  }

  function parseTintLevels(buf) {
    const inv = parseInventory(buf);
    const levels = {};
    for (const it of inv.items) {
      const m = /^(Consumable_(?:Health|Energy|Revive)_Level)(\d)$/.exec(it.key);
      if (!m) continue;
      levels[m[1]] = {
        base: m[1],
        level: Number(m[2]),
        key: it.key,
        nameAt: it.nameAt,
      };
    }
    return levels;
  }

  function setTintLevel(buf, base, newLevel) {
    const n = Math.max(0, Math.min(2, newLevel | 0));
    const levels = parseTintLevels(buf);
    const cur = levels[base];
    if (!cur) throw new Error(base + " not found in inventory.");
    if (cur.level === n) return { bytes: new Uint8Array(buf), key: cur.key };
    // Same-length key: rewrite final digit in place
    const out = new Uint8Array(buf);
    const digitAt = cur.nameAt + base.length;
    out[digitAt] = 0x30 + n;
    return { bytes: out, key: base + String(n), level: n };
  }

  function parseCharacters(buf) {
    const nameHits = findNamedProperties(buf, CHAR_NAME).filter((h) => h.type === "NameProperty");
    const levelHits = findNamedProperties(buf, CHAR_LEVEL).filter((h) => h.type === "IntProperty");
    const xpHits = findNamedProperties(buf, CHAR_XP).filter((h) => h.type === "IntProperty");
    const apHits = findNamedProperties(buf, CHAR_AP).filter((h) => h.type === "IntProperty");
    const lumHits = findNamedProperties(buf, CHAR_LUMINA).filter((h) => h.type === "IntProperty");
    const exclHits = findNamedProperties(buf, CHAR_EXCLUDED).filter((h) => h.type === "BoolProperty");

    const chars = [];
    for (let i = 0; i < nameHits.length; i++) {
      const nh = nameHits[i];
      const rangeEnd = i + 1 < nameHits.length ? nameHits[i + 1].nameAt : buf.length;
      const [name] = readFString(buf, nh.valueAt);
      const pickInRange = (hits) => {
        let best = null;
        let bestDist = Infinity;
        for (const h of hits) {
          if (h.nameAt <= nh.nameAt || h.nameAt >= rangeEnd) continue;
          const d = h.nameAt - nh.nameAt;
          if (d < bestDist) {
            best = h;
            bestDist = d;
          }
        }
        return best;
      };
      const levelH = pickInRange(levelHits);
      const xpH = pickInRange(xpHits);
      const apH = pickInRange(apHits);
      const lumH = pickInRange(lumHits);
      const exclH = pickInRange(exclHits);
      chars.push({
        name: name || "?",
        nameAt: nh.nameAt,
        rangeEnd,
        level: levelH ? readI32(buf, levelH.valueAt) : null,
        levelAt: levelH ? levelH.valueAt : null,
        xp: xpH ? readI32(buf, xpH.valueAt) : null,
        xpAt: xpH ? xpH.valueAt : null,
        actionPoints: apH ? readI32(buf, apH.valueAt) : null,
        actionPointsAt: apH ? apH.valueAt : null,
        lumina: lumH ? readI32(buf, lumH.valueAt) : null,
        luminaAt: lumH ? lumH.valueAt : null,
        excluded: exclH ? buf[exclH.afterType + BOOL_OFF] !== 0 : null,
        excludedAt: exclH ? exclH.afterType + BOOL_OFF : null,
        attributes: [],
        skillsUnlocked: [],
        skillsEquipped: [],
      });
    }

    const attrs = parseAttributes(buf);
    const skills = parseSkills(buf);

    // Own each attr/skill by nearest preceding character name (handles maps that
    // sit between names, and trailing maps past the next name marker).
    function ownerFor(offset) {
      let owner = null;
      for (let i = 0; i < chars.length; i++) {
        if (chars[i].nameAt < offset) owner = chars[i];
        else break;
      }
      return owner;
    }
    for (const a of attrs) {
      const owner = ownerFor(a.valAt);
      if (owner) owner.attributes.push(a);
    }
    for (const s of skills.unlocked) {
      const owner = ownerFor(s.propAt != null ? s.propAt : s.at);
      if (owner) owner.skillsUnlocked.push(s);
    }
    for (const s of skills.equipped) {
      const owner = ownerFor(s.propAt != null ? s.propAt : s.at);
      if (owner) owner.skillsEquipped.push(s);
    }
    return chars;
  }

  function writeCharacterField(buf, valueAt, value) {
    if (valueAt == null) throw new Error("Character field offset missing.");
    const out = new Uint8Array(buf);
    writeI32(out, valueAt, value);
    return { bytes: out, value: value | 0 };
  }

  function writeCharacterExcluded(buf, valueAt, value) {
    if (valueAt == null) throw new Error("Excluded flag offset missing.");
    const out = new Uint8Array(buf);
    out[valueAt] = value ? 1 : 0;
    return { bytes: out, value: !!value };
  }

  function isExpeditionSave(buf) {
    const b = toBytes(buf);
    if (b.length < 20) return false;
    // GVAS magic
    if (!(b[0] === 0x47 && b[1] === 0x56 && b[2] === 0x41 && b[3] === 0x53)) return false;
    return !!(
      findNamedProperty(b, "InventoryItems", "MapProperty") ||
      findNamedProperty(b, "CharactersCollection", "MapProperty") ||
      findNamedProperty(b, "Gold", "IntProperty")
    );
  }

  function parseSave(bytes) {
    const buf = toBytes(bytes);
    const gold = readIntProperty(buf, "Gold");
    const time = readDoubleProperty(buf, "TimePlayed");
    const ng = readIntProperty(buf, "FinishedGameCount");
    const inventory = parseInventory(buf);
    const characters = parseCharacters(buf);
    const weapons = parseWeapons(buf);
    const pictos = parsePictos(buf);
    const exploration = parseExploration(buf);
    const spawn = parseSpawn(buf);
    const tintLevels = parseTintLevels(buf);
    const invGet = (key) => {
      const it = inventory.items.find((x) => x.key === key);
      return it ? it.value : null;
    };
    return {
      ok: isExpeditionSave(buf),
      size: buf.length,
      gold: gold ? gold.value : null,
      goldAt: gold ? gold.valueAt : null,
      timePlayed: time ? time.value : null,
      timePlayedAt: time ? time.valueAt : null,
      mapToLoad: spawn.mapToLoad,
      mapAt: spawn.mapAt,
      spawnTag: spawn.spawnTag,
      spawnAt: spawn.spawnAt,
      ngPlus: ng ? ng.value : null,
      ngPlusAt: ng ? ng.valueAt : null,
      inventory: inventory.items,
      characters,
      weapons,
      pictos,
      exploration,
      tintLevels,
      chroma: gold ? gold.value : null,
      recoat: invGet("Consumable_Respec"),
      luminaPoints: invGet("Consumable_LuminaPoint"),
      healingTint: invGet("HealingTint_Shard"),
      energyTint: invGet("EnergyTint_Shard"),
      reviveTint: invGet("ReviveTint_Shard"),
      partyHeal: invGet("PartyHealShard"),
      catalysts: {
        level1: invGet("UpgradeMaterial_Level1"),
        level2: invGet("UpgradeMaterial_Level2"),
        level3: invGet("UpgradeMaterial_Level3"),
        level4: invGet("UpgradeMaterial_Level4"),
        level5: invGet("UpgradeMaterial_Level5"),
      },
    };
  }

  window.E33Gvas = {
    toBytes,
    isExpeditionSave,
    parseSave,
    parseInventory,
    parseCharacters,
    parseWeapons,
    parseAttributes,
    parseSkills,
    parseExploration,
    parseSpawn,
    parsePictos,
    parseTintLevels,
    readIntProperty,
    writeIntProperty,
    readDoubleProperty,
    writeDoubleProperty,
    readNameProperty,
    readBoolProperty,
    writeBoolProperty,
    findInventoryItem,
    writeInventoryItem,
    insertInventoryItem,
    ensureInventoryItem,
    writeCharacterField,
    writeCharacterExcluded,
    writeWeaponLevel,
    writeAttribute,
    writeMapToLoad,
    writeSpawnTag,
    writePictoFlags,
    unlockAllPictos,
    setTintLevel,
    locateInventoryMeta,
    CHAR_LEVEL,
    CHAR_XP,
    CHAR_AP,
    CHAR_LUMINA,
  };
})();
