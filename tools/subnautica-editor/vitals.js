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

  function encodeName(name) {
    const enc = new TextEncoder().encode(name);
    const out = new Uint8Array(2 + enc.length + 2);
    out[0] = 0x0a;
    out[1] = enc.length;
    out.set(enc, 2);
    out[2 + enc.length] = 0x10;
    out[3 + enc.length] = 0x01;
    return out;
  }

  function findComponent(bytes, name) {
    const hdr = encodeName(name);
    const hits = [];
    outer: for (let i = 0; i <= bytes.length - hdr.length - 1; i++) {
      for (let j = 0; j < hdr.length; j++) {
        if (bytes[i + j] !== hdr[j]) continue outer;
      }
      const [len, payloadStart] = readVarint(bytes, i + hdr.length);
      const payloadEnd = payloadStart + len;
      if (payloadEnd > bytes.length || len < 1 || len > 200000) continue;
      hits.push({
        at: i,
        headerEnd: i + hdr.length,
        payloadStart,
        payloadEnd,
        len,
        payload: bytes.subarray(payloadStart, payloadEnd),
      });
    }
    return hits;
  }

  function readFloatLE(buf, i) {
    return new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true);
  }

  function writeFloatLE(buf, i, value) {
    new DataView(buf.buffer, buf.byteOffset + i, 4).setFloat32(0, value, true);
  }

  /** Parse protobuf fields; return map of field → { kind, value, valueAt } for scalar floats/varints. */
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
        const [v, j] = readVarint(payload, i);
        fields[field] = { kind: "varint", value: v, tagAt, valueAt: i, end: j };
        i = j;
      } else if (wt === 5) {
        if (i + 4 > payload.length) break;
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
      } else {
        break;
      }
    }
    return fields;
  }

  function findSurvival(bytes) {
    const hits = findComponent(bytes, "Survival");
    if (hits.length !== 1) return null;
    return hits[0];
  }

  function findPlayerLiveMixin(bytes) {
    const surv = findSurvival(bytes);
    if (!surv) return null;
    const hits = findComponent(bytes, "LiveMixin").filter(
      (h) => h.at < surv.at && surv.at - h.payloadEnd < 40
    );
    if (!hits.length) return null;
    return hits[hits.length - 1];
  }

  function findPlayerOxygen(bytes) {
    const players = findComponent(bytes, "Player").filter((h) => {
      // Component name length byte is 6 for exact "Player"
      return bytes[h.at + 1] === 6;
    });
    if (!players.length) return null;
    const player = players[0];
    const hits = findComponent(bytes, "Oxygen").filter(
      (h) => h.at < player.at && player.at - h.payloadEnd < 40
    );
    if (!hits.length) return null;
    return hits[hits.length - 1];
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function parseVitals(sceneBytes) {
    const bytes = toBytes(sceneBytes);
    const surv = findSurvival(bytes);
    const live = findPlayerLiveMixin(bytes);
    const oxy = findPlayerOxygen(bytes);
    if (!surv || !live || !oxy) {
      return {
        ok: false,
        error: "Could not find player Survival / LiveMixin / Oxygen in scene-objects.bin.",
      };
    }
    const sFields = scanFields(surv.payload);
    const lFields = scanFields(live.payload);
    const oFields = scanFields(oxy.payload);
    if (!sFields[2] || sFields[2].kind !== "float") {
      return { ok: false, error: "Survival food float missing." };
    }
    if (!sFields[3] || sFields[3].kind !== "float") {
      return { ok: false, error: "Survival water float missing." };
    }
    if (!sFields[4] || sFields[4].kind !== "float") {
      return { ok: false, error: "Survival infection float missing." };
    }
    if (!lFields[1] || lFields[1].kind !== "float") {
      return { ok: false, error: "LiveMixin health float missing." };
    }
    if (!oFields[1] || oFields[1].kind !== "float") {
      return { ok: false, error: "Oxygen float missing." };
    }
    return {
      ok: true,
      health: lFields[1].value,
      food: sFields[2].value,
      water: sFields[3].value,
      infection: sFields[4].value,
      oxygen: oFields[1].value,
      _locs: {
        health: { abs: live.payloadStart + lFields[1].valueAt },
        food: { abs: surv.payloadStart + sFields[2].valueAt },
        water: { abs: surv.payloadStart + sFields[3].valueAt },
        infection: { abs: surv.payloadStart + sFields[4].valueAt },
        oxygen: { abs: oxy.payloadStart + oFields[1].valueAt },
      },
    };
  }

  function clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function writeVitals(sceneBytes, values) {
    const bytes = toBytes(sceneBytes);
    const parsed = parseVitals(bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    const out = new Uint8Array(bytes);
    const next = {
      health: clamp(Number(values.health), 0, 100),
      food: clamp(Number(values.food), 0, 200),
      water: clamp(Number(values.water), 0, 200),
      infection: clamp(Number(values.infection), 0, 100),
      oxygen: clamp(Number(values.oxygen), 0, 200),
    };
    writeFloatLE(out, parsed._locs.health.abs, next.health);
    writeFloatLE(out, parsed._locs.food.abs, next.food);
    writeFloatLE(out, parsed._locs.water.abs, next.water);
    writeFloatLE(out, parsed._locs.infection.abs, next.infection);
    writeFloatLE(out, parsed._locs.oxygen.abs, next.oxygen);
    return { bytes: out, values: next };
  }

  function fillVitals(sceneBytes) {
    return writeVitals(sceneBytes, {
      health: 100,
      food: 100,
      water: 100,
      infection: 0,
      oxygen: 45,
    });
  }

  window.SubnauticaVitals = {
    parseVitals,
    writeVitals,
    fillVitals,
    round1,
  };
})();
