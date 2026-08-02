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

  function findPlayerTransform(bytes) {
    const playerSig = [0x0a, 0x06, 0x50, 0x6c, 0x61, 0x79, 0x65, 0x72, 0x10, 0x01];
    let playerAt = -1;
    outer: for (let i = 0; i <= bytes.length - playerSig.length; i++) {
      for (let j = 0; j < playerSig.length; j++) {
        if (bytes[i + j] !== playerSig[j]) continue outer;
      }
      playerAt = i;
      break;
    }
    if (playerAt < 0) return null;

    const trName = "UnityEngine.Transform";
    const enc = new TextEncoder().encode(trName);
    const from = Math.max(0, playerAt - 500);
    for (let i = from; i < playerAt; i++) {
      if (bytes[i] !== 0x0a || bytes[i + 1] !== enc.length) continue;
      let ok = true;
      for (let j = 0; j < enc.length; j++) {
        if (bytes[i + 2 + j] !== enc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (bytes[i + 2 + enc.length] !== 0x10 || bytes[i + 3 + enc.length] !== 0x01) continue;
      const hdrEnd = i + 2 + enc.length + 2;
      const [len, payloadStart] = readVarint(bytes, hdrEnd);
      const payloadEnd = payloadStart + len;
      if (payloadEnd > bytes.length || len < 20) continue;
      // Expect field1 length-delimited Vector3
      if (bytes[payloadStart] !== 0x0a) continue;
      const [vlen, vstart] = readVarint(bytes, payloadStart + 1);
      if (vlen < 15 || vstart + vlen > payloadEnd) continue;
      // Vector3: 0d x 15 y 1d z
      if (
        bytes[vstart] !== 0x0d ||
        bytes[vstart + 5] !== 0x15 ||
        bytes[vstart + 10] !== 0x1d
      ) {
        continue;
      }
      return {
        componentAt: i,
        payloadStart,
        pos: {
          xAt: vstart + 1,
          yAt: vstart + 6,
          zAt: vstart + 11,
          x: readFloatLE(bytes, vstart + 1),
          y: readFloatLE(bytes, vstart + 6),
          z: readFloatLE(bytes, vstart + 11),
        },
      };
    }
    return null;
  }

  function parsePosition(sceneBytes) {
    const bytes = toBytes(sceneBytes);
    const hit = findPlayerTransform(bytes);
    if (!hit) {
      return { ok: false, error: "Could not find player Transform in scene-objects.bin." };
    }
    return { ok: true, x: hit.pos.x, y: hit.pos.y, z: hit.pos.z, _hit: hit };
  }

  function writePosition(sceneBytes, { x, y, z }) {
    const bytes = toBytes(sceneBytes);
    const hit = findPlayerTransform(bytes);
    if (!hit) throw new Error("Could not find player Transform in scene-objects.bin.");
    const out = new Uint8Array(bytes);
    writeFloatLE(out, hit.pos.xAt, Number(x));
    writeFloatLE(out, hit.pos.yAt, Number(y));
    writeFloatLE(out, hit.pos.zAt, Number(z));
    return {
      bytes: out,
      values: { x: Number(x), y: Number(y), z: Number(z) },
    };
  }

  /** Approximate public map coords for common warps. */
  const WARPS = [
    { id: "shallows", title: "Safe Shallows", x: -40, y: -14, z: -40 },
    { id: "lifepod17", title: "Lifepod 17 area", x: -460, y: -20, z: -20 },
    { id: "aurora", title: "Near Aurora", x: 1050, y: -20, z: -280 },
    { id: "jellyshroom", title: "Jellyshroom Cave", x: 80, y: -250, z: -300 },
    { id: "lostriver", title: "Lost River (junction)", x: -80, y: -620, z: 380 },
    { id: "ilz", title: "Inactive Lava Zone", x: -30, y: -1200, z: 80 },
    { id: "surface", title: "Surface above player Y=0", surface: true },
  ];

  window.SubnauticaPosition = {
    parsePosition,
    writePosition,
    WARPS,
  };
})();
