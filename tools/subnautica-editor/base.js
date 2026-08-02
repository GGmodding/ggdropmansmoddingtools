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

  function writeFloatLE(buf, i, value) {
    new DataView(buf.buffer, buf.byteOffset + i, 4).setFloat32(0, value, true);
  }

  function readFloatLE(buf, i) {
    return new DataView(buf.buffer, buf.byteOffset + i, 4).getFloat32(0, true);
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
      if (payloadEnd > bytes.length || len < 1 || len > 500000) continue;
      hits.push({ at: i, payloadStart, payloadEnd, len });
    }
    return hits;
  }

  function parseFloodSim(bytes, hit) {
    const payload = bytes.subarray(hit.payloadStart, hit.payloadEnd);
    const cells = [];
    let i = 0;
    while (i < payload.length) {
      if (payload[i] !== 0x0d) break; // field 1 float
      const valueAt = hit.payloadStart + i + 1;
      const value = readFloatLE(bytes, valueAt);
      cells.push({ valueAt, value });
      i += 5;
    }
    return cells;
  }

  function status(globalBytes) {
    const bytes = toBytes(globalBytes);
    const sims = findAllComponents(bytes, "BaseFloodSim");
    let cells = 0;
    let wet = 0;
    for (const hit of sims) {
      const list = parseFloodSim(bytes, hit);
      cells += list.length;
      wet += list.filter((c) => c.value > 0.001).length;
    }
    return { sims: sims.length, cells, wet };
  }

  function unfloodBases(globalBytes) {
    const bytes = toBytes(globalBytes);
    const sims = findAllComponents(bytes, "BaseFloodSim");
    if (!sims.length) {
      throw new Error(
        "No BaseFloodSim in global-objects.bin — this slot may have no habitat base."
      );
    }
    const out = new Uint8Array(bytes);
    let cleared = 0;
    let total = 0;
    for (const hit of sims) {
      const cells = parseFloodSim(out, hit);
      total += cells.length;
      for (const c of cells) {
        if (c.value > 0.001) cleared++;
        writeFloatLE(out, c.valueAt, 0);
      }
    }
    return { bytes: out, sims: sims.length, cells: total, cleared };
  }

  window.SubnauticaBase = {
    status,
    unfloodBases,
  };
})();
