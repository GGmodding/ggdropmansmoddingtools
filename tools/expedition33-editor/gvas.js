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
        if (k && /^[A-Za-z][A-Za-z0-9_]{2,60}$/.test(k)) {
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
      if (!k || !/^[A-Za-z0-9_]+$/.test(k) || k.length > 80) break;
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
          " is not in this save's inventory map. Pick the item up in-game once, then edit the count."
      );
    }
    const out = new Uint8Array(buf);
    writeI32(out, item.valAt, value);
    return { bytes: out, value: value | 0, key };
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
      const [name] = readFString(buf, nh.valueAt);
      const pickNear = (hits, fallbackIndex) => {
        if (!hits.length) return null;
        const after = nh.nameAt;
        let best = null;
        let bestDist = Infinity;
        for (const h of hits) {
          const d = h.nameAt - after;
          if (d >= 0 && d < bestDist && d < 8000) {
            best = h;
            bestDist = d;
          }
        }
        return best || hits[fallbackIndex] || hits[0];
      };
      const levelH = pickNear(levelHits, i);
      const xpH = pickNear(xpHits, i);
      const apH = pickNear(apHits, i);
      const lumH = pickNear(lumHits, i);
      const exclH = pickNear(exclHits, i);
      chars.push({
        name: name || "?",
        nameAt: nh.nameAt,
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
      });
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
    const map = readNameProperty(buf, "MapToLoad");
    const ng = readIntProperty(buf, "FinishedGameCount");
    const inventory = parseInventory(buf);
    const characters = parseCharacters(buf);
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
      mapToLoad: map ? map.value : null,
      ngPlus: ng ? ng.value : null,
      ngPlusAt: ng ? ng.valueAt : null,
      inventory: inventory.items,
      characters,
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
    readIntProperty,
    writeIntProperty,
    readDoubleProperty,
    writeDoubleProperty,
    readNameProperty,
    readBoolProperty,
    writeBoolProperty,
    findInventoryItem,
    writeInventoryItem,
    writeCharacterField,
    writeCharacterExcluded,
    CHAR_LEVEL,
    CHAR_XP,
    CHAR_AP,
    CHAR_LUMINA,
  };
})();
