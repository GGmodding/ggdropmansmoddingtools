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

  function readFloatLE(buf, i) {
    return new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true);
  }

  function writeFloatLE(buf, i, value) {
    new DataView(buf.buffer, buf.byteOffset + i, 4).setFloat32(0, value, true);
  }

  function findAllComponents(bytes, name) {
    const enc = new TextEncoder().encode(name);
    const hdrLen = 2 + enc.length + 2;
    const hits = [];
    for (let i = 0; i <= bytes.length - hdrLen - 1; i++) {
      if (bytes[i] !== 0x0a || bytes[i + 1] !== enc.length) continue;
      let ok = true;
      for (let j = 0; j < enc.length; j++) {
        if (bytes[i + 2 + j] !== enc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (bytes[i + 2 + enc.length] !== 0x10 || bytes[i + 3 + enc.length] !== 0x01) {
        continue;
      }
      const [len, payloadStart] = readVarint(bytes, i + hdrLen);
      const payloadEnd = payloadStart + len;
      if (payloadEnd > bytes.length || len < 1 || len > 200000) continue;
      hits.push({ at: i, payloadStart, payloadEnd, len });
    }
    return hits;
  }

  function countComponent(bytes, name) {
    return findAllComponents(bytes, name).length;
  }

  function parseEnergyMixin(bytes, hit) {
    const payload = bytes.subarray(hit.payloadStart, hit.payloadEnd);
    let energy = null;
    let maxEnergy = null;
    let energyAt = -1;
    let maxAt = -1;
    let i = 0;
    while (i < payload.length) {
      const t = payload[i++];
      const field = t >> 3;
      const wt = t & 7;
      if (wt === 5) {
        const abs = hit.payloadStart + i;
        const v = readFloatLE(bytes, abs);
        if (field === 1) {
          energy = v;
          energyAt = abs;
        }
        if (field === 2) {
          maxEnergy = v;
          maxAt = abs;
        }
        i += 4;
      } else if (wt === 0) {
        const [, j] = readVarint(payload, i);
        i = j;
      } else if (wt === 2) {
        const [l, j] = readVarint(payload, i);
        i = j + l;
      } else break;
    }
    return { energy, maxEnergy, energyAt, maxAt };
  }

  function status(globalBytes) {
    const bytes = toBytes(globalBytes);
    const energyHits = findAllComponents(bytes, "EnergyMixin");
    const energies = energyHits.map((h) => parseEnergyMixin(bytes, h));
    return {
      seamoth: countComponent(bytes, "SeaMoth"),
      exosuit: countComponent(bytes, "Exosuit"),
      cyclops: countComponent(bytes, "SubControl"),
      energyMixins: energies.length,
      energies,
    };
  }

  function refillEnergy(globalBytes) {
    const bytes = toBytes(globalBytes);
    const hits = findAllComponents(bytes, "EnergyMixin");
    if (!hits.length) {
      throw new Error("No EnergyMixin components found in global-objects.bin.");
    }
    const out = new Uint8Array(bytes);
    let refilled = 0;
    for (const hit of hits) {
      const e = parseEnergyMixin(out, hit);
      if (e.energyAt < 0 || e.maxAt < 0) continue;
      const max = e.maxEnergy > 0 ? e.maxEnergy : 100;
      // -1 means “default/full” in some saves; still write explicit max
      writeFloatLE(out, e.energyAt, max);
      refilled++;
    }
    return { bytes: out, refilled, total: hits.length };
  }

  window.SubnauticaVehicles = {
    status,
    refillEnergy,
  };
})();
