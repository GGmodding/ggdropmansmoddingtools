(() => {
  "use strict";

  /**
   * Xbox Game Pass / WGS helpers.
   * Parses container.* metadata and detects GVAS blobs among GUID-named files.
   */

  const S = window.Sod2Save;
  if (!S) throw new Error("Sod2Save must load before wgs.js");

  function u32(buf, o) {
    return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  }

  function readUtf16Fixed(buf, o, maxChars) {
    let s = "";
    for (let i = 0; i < maxChars; i++) {
      const c = buf[o + i * 2] | (buf[o + i * 2 + 1] << 8);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  function guidBytesToFileHex(buf, o) {
    const b = buf.subarray(o, o + 16);
    const h = (i) => b[i].toString(16).padStart(2, "0");
    // UUID string hex from little-endian GUID bytes (matches WGS on-disk names).
    return (
      h(3) + h(2) + h(1) + h(0) +
      h(5) + h(4) +
      h(7) + h(6) +
      h(8) + h(9) + h(10) + h(11) + h(12) + h(13) + h(14) + h(15)
    ).toUpperCase();
  }

  function isGvas(buf) {
    return buf && buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x56 && buf[2] === 0x41 && buf[3] === 0x53;
  }

  function parseContainerMeta(buf) {
    if (!buf || buf.length < 8) return [];
    const count = u32(buf, 4);
    const entries = [];
    let o = 8;
    for (let i = 0; i < count; i++) {
      if (o + 128 + 32 > buf.length) break;
      const name = readUtf16Fixed(buf, o, 64);
      o += 128;
      const guidA = guidBytesToFileHex(buf, o);
      o += 16;
      const guidB = guidBytesToFileHex(buf, o);
      o += 16;
      entries.push({
        name,
        shortName: name.split("/").pop() || name,
        guidA,
        guidB,
        guids: guidA === guidB ? [guidA] : [guidA, guidB],
      });
    }
    return entries;
  }

  function basename(path) {
    const parts = String(path || "").replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || path;
  }

  function friendlySavName(entryName, fallback) {
    const short = (entryName || "").split("/").pop() || fallback || "SaveGame.sav";
    return /\.sav$/i.test(short) ? short : short + ".sav";
  }

  /**
   * @param {{ name: string, bytes: Uint8Array }[]} files
   * @returns {{ candidates: { fileName: string, bytes: Uint8Array, sourceName: string, wgsName?: string }[], meta: object }}
   */
  function resolveWgsFiles(files) {
    const list = (files || []).map((f) => ({
      name: f.name,
      base: basename(f.name),
      bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes),
    }));

    const containers = list.filter((f) => /^container\.\d+$/i.test(f.base));
    const mappings = [];
    for (const c of containers) {
      for (const e of parseContainerMeta(c.bytes)) mappings.push(e);
    }

    const byGuid = new Map();
    for (const f of list) {
      const key = f.base.replace(/-/g, "").toUpperCase();
      if (/^[0-9A-F]{32}$/.test(key)) byGuid.set(key, f);
    }

    const candidates = [];
    const used = new Set();

    for (const m of mappings) {
      let file = null;
      for (const g of m.guids) {
        if (byGuid.has(g)) {
          file = byGuid.get(g);
          break;
        }
      }
      if (!file || !isGvas(file.bytes)) continue;
      const short = m.shortName || "";
      if (/SaveGameUser|SaveUser/i.test(short) || /SaveGameUser/i.test(m.name || "")) continue;
      if (file.bytes.length < 4096) continue;
      const fileName = friendlySavName(m.name, file.base);
      candidates.push({
        fileName,
        bytes: file.bytes,
        sourceName: file.name,
        wgsName: m.name,
      });
      used.add(file.base.toUpperCase());
    }

    // Also accept loose GVAS / .sav not covered by container map
    for (const f of list) {
      if (used.has(f.base.toUpperCase())) continue;
      if (!isGvas(f.bytes)) continue;
      if (f.bytes.length < 4096) continue;
      // Skip obvious user-profile blobs when we already have mapped community saves
      if (candidates.length && /^[0-9A-F]{32}$/i.test(f.base.replace(/-/g, ""))) continue;
      candidates.push({
        fileName: /\.sav$/i.test(f.base) ? f.base : friendlySavName(f.base, f.base),
        bytes: f.bytes,
        sourceName: f.name,
      });
    }

    return {
      candidates,
      meta: {
        containerEntries: mappings.length,
        containersFound: containers.length,
        gvasFiles: list.filter((f) => isGvas(f.bytes)).length,
      },
    };
  }

  /** Minimal ZIP reader (stored + deflate) for dropping a WGS folder zip. */
  async function readZipEntries(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const entries = [];

    // Find EOCD
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("Not a ZIP archive");
    const count = view.getUint16(eocd + 10, true);
    let cdOff = view.getUint32(eocd + 16, true);

    for (let n = 0; n < count; n++) {
      if (view.getUint32(cdOff, true) !== 0x02014b50) break;
      const method = view.getUint16(cdOff + 10, true);
      const compSize = view.getUint32(cdOff + 20, true);
      const nameLen = view.getUint16(cdOff + 28, true);
      const extraLen = view.getUint16(cdOff + 30, true);
      const commentLen = view.getUint16(cdOff + 32, true);
      const localOff = view.getUint32(cdOff + 42, true);
      let name = "";
      for (let i = 0; i < nameLen; i++) name += String.fromCharCode(buf[cdOff + 46 + i]);
      cdOff += 46 + nameLen + extraLen + commentLen;

      if (name.endsWith("/")) continue;
      if (view.getUint32(localOff, true) !== 0x04034b50) continue;
      const localNameLen = view.getUint16(localOff + 26, true);
      const localExtra = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + localNameLen + localExtra;
      const compressed = buf.subarray(dataStart, dataStart + compSize);
      let bytes;
      if (method === 0) {
        bytes = compressed.slice();
      } else if (method === 8) {
        if (typeof DecompressionStream === "undefined") {
          throw new Error("Browser cannot inflate ZIP entries (no DecompressionStream)");
        }
        const ds = new DecompressionStream("deflate-raw");
        const stream = new Blob([compressed]).stream().pipeThrough(ds);
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        continue;
      }
      entries.push({ name, bytes });
    }
    return entries;
  }

  async function filesFromUserList(fileList) {
    const out = [];
    for (const file of [...fileList].filter(Boolean)) {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (/\.zip$/i.test(file.name) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
        try {
          const zipped = await readZipEntries(buf.buffer);
          for (const z of zipped) out.push({ name: z.name, bytes: z.bytes });
        } catch (err) {
          console.warn("ZIP parse failed", err);
          out.push({ name: file.name, bytes: buf });
        }
      } else {
        out.push({ name: file.name, bytes: buf });
      }
    }
    return out;
  }

  S.isGvasBuffer = isGvas;
  S.parseWgsContainer = parseContainerMeta;
  S.resolveWgsFiles = resolveWgsFiles;
  S.readZipEntries = readZipEntries;
  S.filesFromUserList = filesFromUserList;
})();
