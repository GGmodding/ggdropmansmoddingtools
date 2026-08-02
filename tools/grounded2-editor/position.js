(() => {
  "use strict";

  const C = window.GroundedCsav;

  const SCALE = new Uint8Array([0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x80, 0x3f]);

  const PRESETS = [
    { id: "snackbar", label: "Snackbar outpost-ish", x: 0, y: 0, z: 0 },
    { id: "origin", label: "World origin", x: 0, y: 0, z: 100 },
  ];

  function findPosition(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    // Prefer transform ending in scale (1,1,1) — search full HostPlayer (G2 may sit later)
    outer: for (let i = 12; i <= buf.length - SCALE.length; i++) {
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
        Math.abs(x) + Math.abs(y) + Math.abs(z) > 100 &&
        Math.abs(x) < 1e7 &&
        Math.abs(y) < 1e7 &&
        Math.abs(z) < 1e7
      ) {
        return { ok: true, x, y, z, off: i - 12, scaleAt: i };
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
