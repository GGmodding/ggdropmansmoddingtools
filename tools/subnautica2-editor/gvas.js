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
      buf[o] |
      (buf[o + 1] << 8) |
      (buf[o + 2] << 16) |
      (buf[o + 3] << 24)
    ) >>> 0;
  }

  function readI32(buf, o) {
    const u = readU32(buf, o);
    return u == null ? null : u | 0;
  }

  function readFName(buf, o) {
    const len = readU32(buf, o);
    if (!len || o + 4 + len > buf.length) return [null, o];
    let end = o + 4 + len;
    let raw = buf.subarray(o + 4, end);
    if (raw.length && raw[raw.length - 1] === 0) {
      raw = raw.subarray(0, raw.length - 1);
    }
    return [new TextDecoder().decode(raw), end];
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

  function findNamedProperty(buf, propName, typeName) {
    const enc = new TextEncoder().encode(propName);
    const hits = [];
    outer: for (let i = 4; i < buf.length - enc.length - 20; i++) {
      let ok = true;
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok || buf[i + enc.length] !== 0) continue;
      if (readU32(buf, i - 4) !== enc.length + 1) continue;
      const [t, afterType] = readFName(buf, i + enc.length + 1);
      if (t !== typeName) continue;
      hits.push({
        nameAt: i,
        afterType,
        metaAt: afterType,
        valueAt: afterType + 9,
      });
      if (hits.length >= 8) break;
    }
    return hits;
  }

  function extractStrProperty(buf, propName) {
    const hits = findNamedProperty(buf, propName, "StrProperty");
    for (const h of hits) {
      const [v] = readFString(buf, h.valueAt);
      if (v != null && v.length && v.length < 200) {
        return { value: v, hit: h, stringAt: h.valueAt };
      }
    }
    return null;
  }

  function extractBoolProperty(buf, propName) {
    const hits = findNamedProperty(buf, propName, "BoolProperty");
    if (!hits.length) return null;
    const h = hits[0];
    if (h.valueAt >= buf.length) return null;
    return { value: buf[h.valueAt] !== 0, hit: h, valueAt: h.valueAt };
  }

  function extractIntProperty(buf, propName) {
    const hits = findNamedProperty(buf, propName, "IntProperty");
    if (!hits.length) return null;
    const h = hits[0];
    const v = readU32(buf, h.valueAt);
    if (v == null) return null;
    return { value: v, hit: h, valueAt: h.valueAt };
  }

  function scanDoubleNear(buf, markerAscii) {
    const enc = new TextEncoder().encode(markerAscii);
    for (let i = 0; i < buf.length - enc.length - 60; i++) {
      let ok = true;
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (let off = 8; off < 50; off++) {
        if (i + off + 8 > buf.length) break;
        const view = new DataView(buf.buffer, buf.byteOffset + i + off, 8);
        const val = view.getFloat64(0, true);
        if (val > 60 && val < 1e7) return val;
      }
    }
    return null;
  }

  /** Rewrite an FString in place only when the new UTF-8 payload fits the old length field. */
  function rewriteStrProperty(buf, propName, newValue) {
    const found = extractStrProperty(buf, propName);
    if (!found) throw new Error(propName + " StrProperty not found.");
    const out = new Uint8Array(buf);
    const lenAt = found.stringAt;
    const oldLen = readI32(out, lenAt);
    if (oldLen == null || oldLen <= 0) {
      throw new Error(propName + " uses unsupported string encoding.");
    }
    const enc = new TextEncoder().encode(newValue);
    // oldLen includes trailing null
    const capacity = oldLen - 1;
    if (enc.length > capacity) {
      throw new Error(
        propName +
          " is too long (max " +
          capacity +
          " chars for in-place edit). Shorten it or keep the same length as before."
      );
    }
    // Keep length field; pad with spaces then null so GVAS size stays identical
    const payload = new Uint8Array(oldLen);
    payload.set(enc, 0);
    for (let i = enc.length; i < capacity; i++) payload[i] = 0x20;
    payload[oldLen - 1] = 0;
    out.set(payload, lenAt + 4);
    return { bytes: out, value: newValue, padded: enc.length < capacity };
  }

  function rewriteBoolProperty(buf, propName, value) {
    const found = extractBoolProperty(buf, propName);
    if (!found) throw new Error(propName + " BoolProperty not found.");
    const out = new Uint8Array(buf);
    out[found.valueAt] = value ? 1 : 0;
    return { bytes: out, value: !!value };
  }

  /**
   * Best-effort vitals: SN2 nests attributes tightly.
   * Pattern: Attr\\0 … BaseValue\\0 … float32 in (1..200].
   * Picks the candidate closest to 100 when several match.
   */
  function findAttributeFloat(buf, attrName) {
    const nameEnc = new TextEncoder().encode(attrName + "\0");
    const baseEnc = new TextEncoder().encode("BaseValue\0");
    const candidates = [];
    for (let i = 0; i < buf.length - 40; i++) {
      let ok = true;
      for (let j = 0; j < nameEnc.length; j++) {
        if (buf[i + j] !== nameEnc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      let baseAt = -1;
      const limit = Math.min(buf.length - 16, i + 32);
      for (let k = i + nameEnc.length; k < limit; k++) {
        let bok = true;
        for (let j = 0; j < baseEnc.length; j++) {
          if (buf[k + j] !== baseEnc[j]) {
            bok = false;
            break;
          }
        }
        if (bok) {
          baseAt = k;
          break;
        }
      }
      if (baseAt < 0) continue;
      const searchFrom = baseAt + baseEnc.length;
      const searchTo = Math.min(buf.length - 4, searchFrom + 24);
      for (let valueAt = searchFrom; valueAt < searchTo; valueAt++) {
        const view = new DataView(buf.buffer, buf.byteOffset + valueAt, 4);
        const value = view.getFloat32(0, true);
        if (!Number.isFinite(value)) continue;
        if (value > 1 && value <= 200) {
          candidates.push({ valueAt, value, nameAt: i });
        }
      }
    }
    if (!candidates.length) return null;
    candidates.sort(
      (a, b) => Math.abs(a.value - 100) - Math.abs(b.value - 100)
    );
    return candidates[0];
  }

  function parseVitals(buf) {
    const health = findAttributeFloat(buf, "Health");
    const food = findAttributeFloat(buf, "Food");
    const oxygen = findAttributeFloat(buf, "Oxygen");
    const water = findAttributeFloat(buf, "Water");
    return {
      ok: !!(health || food || oxygen || water),
      health: health ? health.value : null,
      food: food ? food.value : null,
      oxygen: oxygen ? oxygen.value : null,
      water: water ? water.value : null,
      _locs: { health, food, oxygen, water },
    };
  }

  function writeVitals(buf, values) {
    const out = new Uint8Array(buf);
    const parsed = parseVitals(out);
    if (!parsed.ok) throw new Error("Could not locate player attribute floats in this .sav.");
    const view = new DataView(out.buffer);
    const applied = {};
    for (const key of ["health", "food", "oxygen", "water"]) {
      const loc = parsed._locs[key];
      if (!loc || values[key] == null || values[key] === "") continue;
      const n = Math.max(0, Math.min(200, Number(values[key])));
      if (!Number.isFinite(n)) continue;
      view.setFloat32(loc.valueAt, n, true);
      applied[key] = n;
    }
    return { bytes: out, values: applied };
  }

  function listSoftItems(buf) {
    // Collect SoftObjectPath-looking /Game/.../DA_Name patterns
    const text = new TextDecoder("latin1").decode(buf);
    const re = /\/Game\/[A-Za-z0-9_./]+\/DA_([A-Za-z0-9_]+)/g;
    const counts = new Map();
    let m;
    while ((m = re.exec(text))) {
      const id = m[1].replace(/_+$/g, "");
      if (id.length < 2) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .filter((x) => /^[A-Za-z][A-Za-z0-9]{1,40}$/.test(x.id))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  }

  function parseMetadata(bytes) {
    const buf = toBytes(bytes);
    const slot = extractStrProperty(buf, "SlotName");
    const display = extractStrProperty(buf, "DisplayName");
    const mode = extractStrProperty(buf, "GameMode");
    const level = extractStrProperty(buf, "LevelName");
    const branch = extractStrProperty(buf, "BuildBranch");
    const mp = extractBoolProperty(buf, "bIsMultiplayerSave");
    const wasMp = extractBoolProperty(buf, "bWasMultiplayerSave");
    const savesCount = extractIntProperty(buf, "SavesCount");
    const buildNumber = extractIntProperty(buf, "BuildNumber");
    const playtime = scanDoubleNear(buf, "Elapsed");
    return {
      slotName: slot ? slot.value : null,
      displayName: display ? display.value : null,
      gameMode: mode ? mode.value : null,
      levelName: level ? level.value : null,
      buildBranch: branch ? branch.value : null,
      isMultiplayer: mp ? mp.value : false,
      wasMultiplayer: wasMp ? wasMp.value : false,
      savesCount: savesCount ? savesCount.value : null,
      buildNumber: buildNumber ? buildNumber.value : null,
      playtimeSeconds: playtime,
      gvas: buf.length >= 20 && buf[16] === 0x47 && buf[17] === 0x56, // GVAS often after GSWU
      size: buf.length,
    };
  }

  const GAME_MODES = ["Survival", "Freedom", "Creative", "Hardcore"];

  const FEATURE_MATRIX = [
    { id: "meta", title: "Slot metadata", status: "live", note: "Display name, game mode (equal-length), multiplayer flags" },
    { id: "vitals", title: "Player vitals", status: "beta", note: "Best-effort Health/Food/Oxygen/Water BaseValue floats when present" },
    { id: "inventory", title: "Inventory list", status: "beta", note: "SoftObjectPath DA_* scan — add/remove not safe yet" },
    { id: "pda", title: "PDA / encyclopedia", status: "soon", note: "Nested in UWESaveBlob — different from SN1 TechTypes" },
    { id: "position", title: "Teleport", status: "soon", note: "Player transform lives in nested world blob" },
    { id: "vehicles", title: "Vehicles / energy", status: "soon", note: "Needs SN2 vehicle attribute mapping" },
    { id: "bases", title: "Base flood", status: "soon", note: "Habitat data is inside compressed save blobs" },
    { id: "story", title: "Story toggles", status: "soon", note: "Quest flags not yet mapped" },
    { id: "radiation", title: "Radiation", status: "n/a", note: "SN1 Aurora system — not in SN2 the same way" },
  ];

  window.Subnautica2Gvas = {
    parseMetadata,
    rewriteStrProperty,
    rewriteBoolProperty,
    parseVitals,
    writeVitals,
    listSoftItems,
    GAME_MODES,
    FEATURE_MATRIX,
    extractStrProperty,
    toBytes,
  };
})();
