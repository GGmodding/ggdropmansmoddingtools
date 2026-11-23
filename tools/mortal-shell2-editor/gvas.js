(() => {
  "use strict";

  const TYPES = new Set([
    "IntProperty",
    "Int64Property",
    "UInt32Property",
    "UInt64Property",
    "FloatProperty",
    "DoubleProperty",
    "BoolProperty",
    "ByteProperty",
    "StrProperty",
    "NameProperty",
    "TextProperty",
    "EnumProperty",
    "ArrayProperty",
    "MapProperty",
    "SetProperty",
    "StructProperty",
    "ObjectProperty",
    "SoftObjectProperty",
    "SoftClassProperty",
  ]);
  const VALUE_OFF = 9;
  const BOOL_OFF = 8;

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
    return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  }

  function readI32(buf, o) {
    const u = readU32(buf, o);
    return u == null ? null : u | 0;
  }

  function writeI32(buf, o, value) {
    const v = value | 0;
    buf[o] = v & 0xff;
    buf[o + 1] = (v >>> 8) & 0xff;
    buf[o + 2] = (v >>> 16) & 0xff;
    buf[o + 3] = (v >>> 24) & 0xff;
  }

  function writeF32(buf, o, value) {
    new DataView(buf.buffer, buf.byteOffset + o, 4).setFloat32(0, Number(value), true);
  }

  function writeF64(buf, o, value) {
    new DataView(buf.buffer, buf.byteOffset + o, 8).setFloat64(0, Number(value), true);
  }

  function readFString(buf, o) {
    const rawLen = readI32(buf, o);
    if (rawLen == null) return [null, o];
    let off = o + 4;
    if (rawLen === 0) return ["", off];
    if (rawLen < 0) {
      const chars = -rawLen;
      const bytes = chars * 2;
      if (off + bytes > buf.length || chars > 4096) return [null, o];
      const units = [];
      for (let i = 0; i < chars; i++) {
        units.push(buf[off + i * 2] | (buf[off + i * 2 + 1] << 8));
      }
      off += bytes;
      let s = String.fromCharCode.apply(null, units);
      if (s.endsWith("\0")) s = s.slice(0, -1);
      return [s, off];
    }
    if (off + rawLen > buf.length || rawLen > 4096) return [null, o];
    let raw = buf.subarray(off, off + rawLen);
    off += rawLen;
    if (raw.length && raw[raw.length - 1] === 0) raw = raw.subarray(0, raw.length - 1);
    try {
      return [new TextDecoder().decode(raw), off];
    } catch {
      return [null, o];
    }
  }

  function parseHeader(buf) {
    buf = toBytes(buf);
    const magic = String.fromCharCode(buf[0] || 0, buf[1] || 0, buf[2] || 0, buf[3] || 0);
    let gvasAt = -1;
    for (let i = 0; i < Math.min(buf.length - 4, 64); i++) {
      if (buf[i] === 0x47 && buf[i + 1] === 0x56 && buf[i + 2] === 0x41 && buf[i + 3] === 0x53) {
        gvasAt = i;
        break;
      }
    }
    let saveClass = null;
    const limit = Math.min(buf.length, 8192);
    for (let i = 0; i < limit; i++) {
      const [s] = readFString(buf, i);
      if (s && /SaveGame/i.test(s) && s.length < 220) {
        saveClass = s;
        break;
      }
    }
    return {
      magic,
      gvasAt,
      saveClass,
      size: buf.length,
      looksGvas: gvasAt >= 0,
    };
  }

  function scanProperties(buf) {
    buf = toBytes(buf);
    const props = [];
    for (let i = 4; i < buf.length - 28; i++) {
      const [type, after] = readFString(buf, i);
      if (!type || !TYPES.has(type)) continue;
      let name = null;
      let nameAt = null;
      for (let back = 4; back < 240; back++) {
        const ns = i - back;
        if (ns < 4) break;
        if (readU32(buf, ns - 4) !== back) continue;
        const [nm, nend] = readFString(buf, ns - 4);
        if (!nm || nend !== i) continue;
        if (!/^[\x20-\x7e]{1,200}$/.test(nm)) continue;
        name = nm;
        nameAt = ns;
        break;
      }
      if (!name) continue;
      const valueAt = type === "BoolProperty" ? after + BOOL_OFF : after + VALUE_OFF;
      let value = null;
      let editable = false;
      if (type === "BoolProperty") {
        value = buf[valueAt] !== 0;
        editable = true;
      } else if (type === "IntProperty" || type === "UInt32Property") {
        value = readI32(buf, valueAt);
        editable = true;
      } else if (type === "Int64Property" && valueAt + 8 <= buf.length) {
        const view = new DataView(buf.buffer, buf.byteOffset + valueAt, 8);
        value = Number(view.getBigInt64(0, true));
        editable = Number.isSafeInteger(value);
      } else if (type === "FloatProperty" && valueAt + 4 <= buf.length) {
        value = new DataView(buf.buffer, buf.byteOffset + valueAt, 4).getFloat32(0, true);
        editable = true;
      } else if (type === "DoubleProperty" && valueAt + 8 <= buf.length) {
        value = new DataView(buf.buffer, buf.byteOffset + valueAt, 8).getFloat64(0, true);
        editable = true;
      } else if ((type === "StrProperty" || type === "NameProperty") && valueAt + 4 <= buf.length) {
        const [v] = readFString(buf, valueAt);
        value = v;
        editable = typeof v === "string";
      }
      props.push({
        name,
        type,
        nameAt,
        afterType: after,
        valueAt,
        value,
        editable,
      });
      i = after - 1;
    }
    return props;
  }

  function uniqueProps(props) {
    const seen = new Map();
    for (const p of props) {
      const k = p.name + "|" + p.type;
      if (!seen.has(k)) seen.set(k, { ...p, hits: 1 });
      else seen.get(k).hits += 1;
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  }

  function findProperty(buf, name, typeName) {
    const props = scanProperties(buf);
    return (
      props.find((p) => p.name === name && (!typeName || p.type === typeName)) || null
    );
  }

  function cloneBytes(buf) {
    return new Uint8Array(toBytes(buf));
  }

  function writeValue(buf, prop, value) {
    const out = cloneBytes(buf);
    const at = prop.valueAt != null ? prop.valueAt : prop.amountAt;
    if (at == null) throw new Error((prop.name || "property") + " has no value offset.");
    if (prop.type === "BoolProperty") {
      out[at] = value ? 1 : 0;
    } else if (prop.type === "IntProperty" || prop.type === "UInt32Property") {
      writeI32(out, at, Number(value) || 0);
    } else if (prop.type === "Int64Property") {
      const n = BigInt(Math.trunc(Number(value) || 0));
      new DataView(out.buffer, out.byteOffset + at, 8).setBigInt64(0, n, true);
    } else if (prop.type === "FloatProperty") {
      writeF32(out, at, value);
    } else if (prop.type === "DoubleProperty") {
      writeF64(out, at, value);
    } else if (prop.type === "StrProperty" || prop.type === "NameProperty") {
      const oldLen = readI32(out, at);
      if (oldLen == null || oldLen <= 0) throw new Error(prop.name + " uses unsupported string encoding.");
      const enc = new TextEncoder().encode(String(value));
      const capacity = oldLen - 1;
      if (enc.length > capacity) {
        throw new Error(prop.name + " is too long (max " + capacity + " chars for in-place edit).");
      }
      const payload = new Uint8Array(oldLen);
      payload.set(enc, 0);
      for (let i = enc.length; i < capacity; i++) payload[i] = 0x20;
      payload[oldLen - 1] = 0;
      out.set(payload, at + 4);
    } else {
      throw new Error(prop.type + " is not editable yet.");
    }
    return out;
  }

  function writeNamed(buf, name, value, typeName) {
    const prop = findProperty(buf, name, typeName);
    if (!prop) throw new Error(name + " not found in this save.");
    return writeValue(buf, prop, value);
  }

  function indexOfStr(buf, str, from) {
    const enc = new TextEncoder().encode(str);
    outer: for (let i = from || 0; i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function shortItemId(path) {
    const last = String(path || "").split("/").pop() || path;
    return last.replace(/\.[^.]+_C$/, "").replace(/_C$/, "");
  }

  /** ObjectProperty → IntProperty maps (DropItems wallet). */
  function parseObjectIntMap(buf, mapName) {
    buf = toBytes(buf);
    const nameEnc = mapName + "\0";
    const textAt = indexOfStr(buf, nameEnc, 0);
    if (textAt < 4) return [];
    if (readI32(buf, textAt - 4) !== nameEnc.length) return [];
    const [, afterName] = readFString(buf, textAt - 4);
    const [typ, afterType] = readFString(buf, afterName);
    if (typ !== "MapProperty") return [];
    const intAt = indexOfStr(buf, "IntProperty\0", afterType);
    if (intAt < 0 || intAt - afterType > 80) return [];
    const afterInt = intAt + "IntProperty\0".length;
    let start = -1;
    let count = 0;
    for (let skip = 0; skip < 28; skip++) {
      const c = readI32(buf, afterInt + skip);
      if (c == null || c < 1 || c > 256) continue;
      const [s] = readFString(buf, afterInt + skip + 4);
      if (s && (s.startsWith("/Game/") || /^ID_/.test(s))) {
        start = afterInt + skip + 4;
        count = c;
        break;
      }
    }
    if (start < 0) return [];
    const items = [];
    let p = start;
    for (let i = 0; i < count; i++) {
      const [s, n] = readFString(buf, p);
      if (!s) break;
      const amountAt = n;
      const amount = readI32(buf, amountAt);
      items.push({
        path: s,
        short: shortItemId(s),
        amount,
        amountAt,
        name: shortItemId(s),
        type: "IntProperty",
        valueAt: amountAt,
        amountAt,
        value: amount,
        editable: true,
      });
      p = amountAt + 4;
    }
    return items;
  }

  function parseDropItems(buf) {
    return parseObjectIntMap(buf, "DropItems");
  }

  function writeDropItem(buf, pathOrId, value) {
    const items = parseDropItems(buf);
    const needle = String(pathOrId);
    const item = items.find(
      (it) => it.path === needle || it.short === needle || it.path.indexOf(needle) >= 0
    );
    if (!item) throw new Error(needle + " is not in DropItems on this save (pick it up in-game first).");
    return writeValue(buf, item, value);
  }

  function matchCurated(buf, fields) {
    const props = uniqueProps(scanProperties(buf));
    const byName = new Map();
    for (const p of props) {
      if (!byName.has(p.name)) byName.set(p.name, []);
      byName.get(p.name).push(p);
    }
    const drops = parseDropItems(buf);
    return fields
      .map((field) => {
        let found = null;
        if (field.dropId) {
          const re = field.dropId instanceof RegExp ? field.dropId : new RegExp(field.dropId);
          const item = drops.find((d) => re.test(d.path) || re.test(d.short));
          if (item) found = item;
        }
        if (!found && field.keys) {
          for (const key of field.keys) {
            const hits = byName.get(key);
            if (!hits || !hits.length) continue;
            found =
              (field.types && hits.find((h) => field.types.includes(h.type))) ||
              hits.find((h) => h.editable) ||
              hits[0];
            if (found) break;
          }
        }
        return { field, prop: found };
      })
      .filter((row) => row.prop);
  }

  function listAssets(buf) {
    buf = toBytes(buf);
    const text = new TextDecoder("latin1").decode(buf);
    const re = /(?:\/Game\/[A-Za-z0-9_./]+|DA_[A-Za-z0-9_]+)/g;
    const counts = new Map();
    let m;
    while ((m = re.exec(text))) {
      const id = m[0].replace(/\/+$/, "");
      if (id.length < 4) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  }

  window.MortalShell2Gvas = {
    toBytes,
    parseHeader,
    scanProperties,
    uniqueProps,
    findProperty,
    writeValue,
    writeNamed,
    parseDropItems,
    writeDropItem,
    matchCurated,
    listAssets,
  };
})();
