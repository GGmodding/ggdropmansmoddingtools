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

  function readVarint(buf, i) {
    let x = 0;
    let s = 0;
    while (i < buf.length) {
      const b = buf[i++];
      x |= (b & 0x7f) << s;
      if (!(b & 0x80)) break;
      s += 7;
      if (s > 35) break;
    }
    return [x >>> 0, i];
  }

  function writeVarint(n) {
    const out = [];
    let x = n >>> 0;
    do {
      let b = x & 0x7f;
      x >>>= 7;
      if (x) b |= 0x80;
      out.push(b);
    } while (x);
    return out;
  }

  function findComponent(bytes, name) {
    const enc = new TextEncoder().encode(name);
    const hdr = new Uint8Array(2 + enc.length + 2);
    hdr[0] = 0x0a;
    hdr[1] = enc.length;
    hdr.set(enc, 2);
    hdr[2 + enc.length] = 0x10;
    hdr[3 + enc.length] = 0x01;
    for (let i = 0; i <= bytes.length - hdr.length - 1; i++) {
      let ok = true;
      for (let j = 0; j < hdr.length; j++) {
        if (bytes[i + j] !== hdr[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const [len, payloadStart] = readVarint(bytes, i + hdr.length);
      const payloadEnd = payloadStart + len;
      if (payloadEnd > bytes.length || len < 1 || len > 200000) continue;
      return {
        at: i,
        payloadStart,
        payloadEnd,
        len,
        payload: bytes.subarray(payloadStart, payloadEnd),
      };
    }
    return null;
  }

  function readFloatLE(buf, i) {
    return new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true);
  }

  function writeFloatLE(buf, i, value) {
    new DataView(buf.buffer, buf.byteOffset + i, 4).setFloat32(0, value, true);
  }

  function scanFields(payload) {
    const fields = {};
    let i = 0;
    while (i < payload.length) {
      const tag = payload[i];
      const field = tag >> 3;
      const wt = tag & 7;
      const tagAt = i;
      i += 1;
      if (wt === 0) {
        const valueAt = i;
        const [v, j] = readVarint(payload, i);
        fields[field] = { kind: "varint", value: v, tagAt, valueAt, end: j };
        i = j;
      } else if (wt === 5) {
        fields[field] = {
          kind: "float",
          value: readFloatLE(payload, i),
          tagAt,
          valueAt: i,
          end: i + 4,
        };
        i += 4;
      } else if (wt === 2) {
        const [len, j] = readVarint(payload, i);
        i = j + len;
      } else if (wt === 1) {
        i += 8;
      } else break;
    }
    return fields;
  }

  /**
   * LeakingRadiation: f1 version, f2 currentRadius (float), f3 radiationFixed (bool).
   */
  function parseRadiation(sceneBytes) {
    const bytes = toBytes(sceneBytes);
    const hit = findComponent(bytes, "LeakingRadiation");
    if (!hit) {
      return {
        ok: false,
        error: "LeakingRadiation component not found (Below Zero / incomplete slot?).",
      };
    }
    const fields = scanFields(hit.payload);
    if (!fields[2] || fields[2].kind !== "float") {
      return { ok: false, error: "LeakingRadiation.currentRadius missing." };
    }
    if (!fields[3] || fields[3].kind !== "varint") {
      return { ok: false, error: "LeakingRadiation.radiationFixed missing." };
    }
    return {
      ok: true,
      currentRadius: fields[2].value,
      radiationFixed: !!fields[3].value,
      _hit: hit,
      _fields: fields,
    };
  }

  function fixRadiation(sceneBytes) {
    const bytes = toBytes(sceneBytes);
    const parsed = parseRadiation(bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    const out = new Uint8Array(bytes);
    const radiusAbs = parsed._hit.payloadStart + parsed._fields[2].valueAt;
    const fixedAbs = parsed._hit.payloadStart + parsed._fields[3].valueAt;
    writeFloatLE(out, radiusAbs, 0);
    // bool as varint 0/1 — single byte when value is 0 or 1
    const oldEnd = parsed._fields[3].end;
    const oldStart = parsed._fields[3].valueAt;
    if (oldEnd - oldStart === 1) {
      out[fixedAbs] = 1;
    } else {
      // rare: rewrite varint width — keep single byte 1 by shrinking (not expected)
      out[fixedAbs] = 1;
    }
    return {
      bytes: out,
      before: {
        currentRadius: parsed.currentRadius,
        radiationFixed: parsed.radiationFixed,
      },
      after: { currentRadius: 0, radiationFixed: true },
    };
  }

  window.SubnauticaRadiation = {
    parseRadiation,
    fixRadiation,
  };
})();
