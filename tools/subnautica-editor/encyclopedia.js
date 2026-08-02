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

  function writeFloatLE(value) {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, value, true);
    return [...buf];
  }

  function findPlayerInner(bytes) {
    const sig = [0x0a, 0x06, 0x50, 0x6c, 0x61, 0x79, 0x65, 0x72, 0x10, 0x01, 0xd2];
    outer: for (let i = 0; i <= bytes.length - sig.length; i++) {
      for (let j = 0; j < sig.length; j++) {
        if (bytes[i + j] !== sig[j]) continue outer;
      }
      const tagAt = i + 10;
      const [declLen, innerStart] = readVarint(bytes, tagAt + 1);
      return { componentAt: i, tagAt, declLen, innerStart, lenBytesStart: tagAt + 1 };
    }
    return null;
  }

  function parseEncyKey(bytes, start, end) {
    if (end - start < 4 || bytes[start] !== 0x0a) return null;
    const keyLen = bytes[start + 1];
    if (start + 2 + keyLen > end) return null;
    return new TextDecoder().decode(bytes.subarray(start + 2, start + 2 + keyLen));
  }

  /**
   * Walk Player protobuf past the declared length to find encyclopedia (field 8) run.
   * Declared component length often only covers knownTech; journal/ency follow after.
   */
  function findEncyclopediaBlock(bytes) {
    const player = findPlayerInner(bytes);
    if (!player) return null;

    let i = player.innerStart;
    let encyStart = -1;
    let encyEnd = -1;
    const keys = [];
    let sawEncy = false;
    let fieldCount = 0;
    const maxFields = 500;

    while (i < bytes.length && fieldCount < maxFields) {
      const tagAt = i;
      const t = bytes[i];
      const field = t >> 3;
      const wt = t & 7;
      if (field < 1 || field > 20 || (wt !== 0 && wt !== 1 && wt !== 2 && wt !== 5)) {
        break;
      }
      // Stop if a new component header appears after we've seen real player fields
      if (
        sawEncy &&
        t === 0x0a &&
        i + 2 < bytes.length &&
        bytes[i + 1] >= 4 &&
        bytes[i + 1] <= 48
      ) {
        const nl = bytes[i + 1];
        if (i + 2 + nl + 2 <= bytes.length && bytes[i + 2 + nl] === 0x10 && bytes[i + 3 + nl] === 0x01) {
          const name = new TextDecoder().decode(bytes.subarray(i + 2, i + 2 + nl));
          if (/^[A-Z][A-Za-z0-9.]+$/.test(name)) break;
        }
      }

      i += 1;
      fieldCount += 1;

      if (wt === 0) {
        const [, j] = readVarint(bytes, i);
        i = j;
        if (sawEncy && field !== 8) break;
      } else if (wt === 5) {
        i += 4;
        if (sawEncy && field !== 8) break;
      } else if (wt === 1) {
        i += 8;
        if (sawEncy && field !== 8) break;
      } else if (wt === 2) {
        const [len, j] = readVarint(bytes, i);
        const start = j;
        const end = j + len;
        if (end > bytes.length) break;
        if (field === 8) {
          if (!sawEncy) {
            sawEncy = true;
            encyStart = tagAt;
          }
          const key = parseEncyKey(bytes, start, end);
          if (key) keys.push(key);
          encyEnd = end;
          i = end;
        } else if (sawEncy) {
          // Next non-ency length-delimited field (scanner = 9) ends the block
          i = tagAt;
          break;
        } else {
          i = end;
        }
      }
    }

    if (encyStart < 0 || encyEnd <= encyStart) return null;
    return { player, encyStart, encyEnd, keys };
  }

  function encodeEncyEntry(key, timestamp) {
    const keyBytes = new TextEncoder().encode(key);
    const value = [0x12, 0x05, 0x0d, ...writeFloatLE(timestamp)];
    const inner = [0x0a, keyBytes.length, ...keyBytes, ...value];
    const len = writeVarint(inner.length);
    return [0x42, ...len, ...inner];
  }

  function catalogKeys() {
    if (window.SubnauticaEncyKeys && Array.isArray(window.SubnauticaEncyKeys)) {
      return window.SubnauticaEncyKeys.map(String).filter(Boolean);
    }
    return [];
  }

  function countEncyclopedia(sceneBytes) {
    const hit = findEncyclopediaBlock(toBytes(sceneBytes));
    return hit ? hit.keys.length : null;
  }

  /**
   * Patch length-delimited varints whose range contains spliceAt and end >= oldEnd.
   * Only touches reasonable parent sizes to avoid false positives.
   */
  function patchParentLengths(bytes, spliceAt, delta, oldEnd) {
    if (!delta) return;
    // Walk known region before Player for length prefixes spanning the ency block
    const from = Math.max(0, spliceAt - 8000);
    for (let j = from; j < spliceAt; j++) {
      if ((bytes[j] & 7) !== 2) continue;
      const field = bytes[j] >> 3;
      if (field < 1 || field > 30) continue;
      const lenPos = j + 1;
      const [len, start] = readVarint(bytes, lenPos);
      const end = start + len;
      if (len < 200 || len > 200000) continue;
      if (start > spliceAt) continue;
      if (end < oldEnd) continue;
      // Must actually cover the encyclopedia splice
      if (end < spliceAt) continue;
      const newLen = len + delta;
      if (newLen < 0) continue;
      const oldLenBytes = writeVarint(len);
      const newLenBytes = writeVarint(newLen);
      // Only in-place replace when varint width unchanged (common for these sizes)
      if (oldLenBytes.length === newLenBytes.length) {
        for (let k = 0; k < newLenBytes.length; k++) bytes[lenPos + k] = newLenBytes[k];
      }
    }
  }

  function unlockAllEncyclopedia(sceneBytes, opts) {
    const bytes = toBytes(sceneBytes);
    const hit = findEncyclopediaBlock(bytes);
    if (!hit) {
      throw new Error(
        "Could not find PDA encyclopedia data in scene-objects.bin (Player field 8)."
      );
    }
    const catalog = (opts && opts.keys) || catalogKeys();
    if (!catalog.length) throw new Error("No encyclopedia key list loaded.");

    const timestamp =
      opts && Number.isFinite(Number(opts.timestamp))
        ? Number(opts.timestamp)
        : 480;

    const have = new Set(hit.keys);
    const merged = [...new Set([...hit.keys, ...catalog])].sort((a, b) =>
      a.localeCompare(b)
    );

    // Keep existing entry bytes for keys we already have (preserve timestamps)
    const existing = new Map();
    let p = hit.encyStart;
    while (p < hit.encyEnd) {
      if (bytes[p] !== 0x42) break;
      const [len, s] = readVarint(bytes, p + 1);
      const end = s + len;
      const key = parseEncyKey(bytes, s, end);
      if (key) existing.set(key, bytes.subarray(p, end));
      p = end;
    }

    const chunks = [];
    for (const key of merged) {
      if (existing.has(key)) chunks.push(...existing.get(key));
      else chunks.push(...encodeEncyEntry(key, timestamp));
    }
    const newBlock = Uint8Array.from(chunks);
    const oldLen = hit.encyEnd - hit.encyStart;
    const delta = newBlock.length - oldLen;

    const out = new Uint8Array(bytes.length + delta);
    out.set(bytes.subarray(0, hit.encyStart), 0);
    out.set(newBlock, hit.encyStart);
    out.set(bytes.subarray(hit.encyEnd), hit.encyStart + newBlock.length);

    patchParentLengths(out, hit.encyStart, delta, hit.encyEnd);

    return {
      bytes: out,
      before: hit.keys.length,
      after: merged.length,
      added: merged.length - hit.keys.length,
    };
  }

  window.SubnauticaEncyclopedia = {
    findEncyclopediaBlock,
    countEncyclopedia,
    unlockAllEncyclopedia,
    catalogKeys,
  };
})();
