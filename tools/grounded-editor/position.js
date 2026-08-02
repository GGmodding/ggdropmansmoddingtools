(() => {
  "use strict";

  const C = window.GroundedCsav;

  const SCALE = new Uint8Array([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f]);

  const PRESETS = [
    { id: "oak_hill", label: "Oak Hill (starter)", x: 33500, y: 3570, z: 50 },
    { id: "hedge", label: "Hedge ascent-ish", x: 5000, y: 32450, z: 4200 },
    { id: "pond", label: "Near pond lab-ish", x: 8800, y: 19840, z: 2400 },
    { id: "haze", label: "Upper yard / haze-ish", x: 4600, y: 32000, z: 3050 },
  ];

  function findPosition(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    // Prefer transform ending in scale (1,1,1)
    outer: for (let i = 12; i <= Math.min(buf.length, 4000) - SCALE.length; i++) {
      for (let j = 0; j < SCALE.length; j++) {
        if (buf[i + j] !== SCALE[j]) continue outer;
      }
      const x = new DataView(buf.buffer, buf.byteOffset + i - 12, 4).getFloat32(0, true);
      const y = new DataView(buf.buffer, buf.byteOffset + i - 8, 4).getFloat32(0, true);
      const z = new DataView(buf.buffer, buf.byteOffset + i - 4, 4).getFloat32(0, true);
      if (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(z) &&
        Math.abs(x) + Math.abs(y) > 100
      ) {
        return { ok: true, x, y, z, off: i - 12, scaleAt: i };
      }
    }
    // Fallback fixed offset observed on HostPlayer
    if (buf.length >= 180) {
      const x = new DataView(buf.buffer, buf.byteOffset + 168, 4).getFloat32(0, true);
      const y = new DataView(buf.buffer, buf.byteOffset + 172, 4).getFloat32(0, true);
      const z = new DataView(buf.buffer, buf.byteOffset + 176, 4).getFloat32(0, true);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return { ok: true, x, y, z, off: 168, scaleAt: -1 };
      }
    }
    return { ok: false };
  }

  function writePosition(rawPlayer, x, y, z) {
    const pos = findPosition(rawPlayer);
    if (!pos.ok) throw new Error("Could not locate player position.");
    const nx = Number(x);
    const ny = Number(y);
    const nz = Number(z);
    if (![nx, ny, nz].every((n) => Number.isFinite(n))) {
      throw new Error("Invalid coordinates.");
    }
    const buf = new Uint8Array(C.toBytes(rawPlayer));
    const dv = new DataView(buf.buffer, buf.byteOffset + pos.off, 12);
    dv.setFloat32(0, nx, true);
    dv.setFloat32(4, ny, true);
    dv.setFloat32(8, nz, true);
    return { bytes: buf, x: nx, y: ny, z: nz, off: pos.off };
  }

  window.GroundedPosition = {
    findPosition,
    writePosition,
    PRESETS,
  };
})();
