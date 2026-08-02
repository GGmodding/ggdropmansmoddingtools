(() => {
  "use strict";

  const OODLE_COPY_CHUNK = 256 * 1024; // 0x40000 — required for large World.csav rewrite

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

  function writeU32(buf, o, value) {
    buf[o] = value & 0xff;
    buf[o + 1] = (value >>> 8) & 0xff;
    buf[o + 2] = (value >>> 16) & 0xff;
    buf[o + 3] = (value >>> 24) & 0xff;
  }

  /** Pack uncompressed payload as Oodle "copy" blocks the game accepts. */
  function packCopyBlocks(raw) {
    const data = toBytes(raw);
    if (!data.length) return new Uint8Array([0xcc, 0x06]);
    const chunks = Math.ceil(data.length / OODLE_COPY_CHUNK);
    const out = new Uint8Array(data.length + chunks * 2);
    let w = 0;
    for (let i = 0; i < data.length; i += OODLE_COPY_CHUNK) {
      const end = Math.min(data.length, i + OODLE_COPY_CHUNK);
      out[w++] = 0xcc;
      out[w++] = 0x06;
      out.set(data.subarray(i, end), w);
      w += end - i;
    }
    return out.subarray(0, w);
  }

  function wrapCsav(rawUncompressed) {
    const raw = toBytes(rawUncompressed);
    const payload = packCopyBlocks(raw);
    const out = new Uint8Array(8 + payload.length);
    writeU32(out, 0, raw.length);
    writeU32(out, 4, payload.length);
    out.set(payload, 8);
    return out;
  }

  function unwrapCsavHeader(bytes) {
    const buf = toBytes(bytes);
    if (buf.length < 8) throw new Error("CSav too small.");
    const uncompressedSize = readU32(buf, 0);
    const compressedSize = readU32(buf, 4);
    if (uncompressedSize == null || compressedSize == null) {
      throw new Error("CSav header truncated.");
    }
    if (8 + compressedSize > buf.length) {
      throw new Error(
        "CSav compressed size " +
          compressedSize +
          " exceeds file (" +
          buf.length +
          ")."
      );
    }
    return {
      uncompressedSize,
      compressedSize,
      payload: buf.subarray(8, 8 + compressedSize),
      fileSize: buf.length,
    };
  }

  async function decompressCsav(bytes, decompressFn) {
    if (typeof decompressFn !== "function") {
      throw new Error("Oodle/ooz decompress function not loaded.");
    }
    const hdr = unwrapCsavHeader(bytes);
    if (hdr.uncompressedSize === 0) return new Uint8Array(0);
    const raw = decompressFn(hdr.payload, hdr.uncompressedSize);
    return toBytes(raw).slice();
  }

  function compressCsav(rawUncompressed) {
    return wrapCsav(rawUncompressed);
  }

  function isCsavName(name) {
    return /\.csav$/i.test(name || "");
  }

  window.GroundedCsav = {
    OODLE_COPY_CHUNK,
    toBytes,
    readU32,
    writeU32,
    unwrapCsavHeader,
    decompressCsav,
    compressCsav,
    packCopyBlocks,
    isCsavName,
  };
})();
