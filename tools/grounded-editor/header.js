(() => {
  "use strict";

  const C = window.GroundedCsav;

  function readFString(buf, o) {
    if (o + 4 > buf.length) return null;
    const rawLen = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
    const len = rawLen | 0;
    let off = o + 4;
    if (len === 0) return { value: "", end: off, lenAt: o, capacity: 0 };
    if (len < 0) {
      const chars = -len;
      const bytes = chars * 2;
      if (off + bytes > buf.length) return null;
      const units = [];
      for (let i = 0; i < chars; i++) {
        units.push(buf[off + i * 2] | (buf[off + i * 2 + 1] << 8));
      }
      off += bytes;
      let s = String.fromCharCode.apply(null, units);
      if (s.endsWith("\0")) s = s.slice(0, -1);
      return { value: s, end: off, lenAt: o, capacity: chars - 1, wide: true };
    }
    if (off + len > buf.length) return null;
    let raw = buf.subarray(off, off + len);
    off += len;
    if (raw.length && raw[raw.length - 1] === 0) {
      raw = raw.subarray(0, raw.length - 1);
    }
    return {
      value: new TextDecoder().decode(raw),
      end: off,
      lenAt: o,
      capacity: len - 1,
      wide: false,
      stringAt: o + 4,
      byteLen: len,
    };
  }

  function guidToString(bytes) {
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return (
      hex.slice(0, 8) +
      "-" +
      hex.slice(8, 12) +
      "-" +
      hex.slice(12, 16) +
      "-" +
      hex.slice(16, 20) +
      "-" +
      hex.slice(20)
    ).toUpperCase();
  }

  function collectFStrings(buf) {
    const out = [];
    for (let i = 0; i < buf.length - 8; i++) {
      const len =
        (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) | 0;
      if (len < 2 || len > 200) continue;
      if (i + 4 + len > buf.length) continue;
      if (buf[i + 3] !== 0 || buf[i + 2] !== 0) continue;
      const payload = buf.subarray(i + 4, i + 4 + len);
      if (payload[len - 1] !== 0) continue;
      let ok = true;
      for (let j = 0; j < len - 1; j++) {
        const c = payload[j];
        if (c < 0x20 || c > 0x7e) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const value = new TextDecoder().decode(payload.subarray(0, len - 1));
      if (value.length < 1) continue;
      out.push({
        at: i,
        value,
        capacity: len - 1,
        stringAt: i + 4,
        byteLen: len,
        end: i + 4 + len,
      });
    }
    return out;
  }

  function parseHeader(bytes) {
    const buf = C.toBytes(bytes);
    let o = 0;
    const headerType = C.readU32(buf, o); o += 4;
    const headerVersion = C.readU32(buf, o); o += 4;
    const ver = readFString(buf, o);
    if (!ver) throw new Error("SaveGameHeaderData: missing game version string.");
    o = ver.end;
    if (o + 16 > buf.length) throw new Error("SaveGameHeaderData: truncated GUID.");
    const guidBytes = buf.subarray(o, o + 16);
    o += 16;

    const strings = collectFStrings(buf);
    const gameVersion = ver.value;
    let levelName = null;
    let zoneTable = null;
    let areaName = null;
    let worldName = null;
    let playerKey = null;
    let worldNameHit = null;

    for (const s of strings) {
      if (s.value.startsWith("AR_") && !levelName) levelName = s.value;
      else if (s.value.includes("Table_Zones") && !zoneTable) zoneTable = s.value;
      else if (
        !areaName &&
        /^[A-Za-z][A-Za-z0-9 _'-]{1,40}$/.test(s.value) &&
        !s.value.includes("/") &&
        !s.value.includes(".") &&
        s.value !== gameVersion &&
        s.value !== levelName
      ) {
        // Grasslands / Oak Hill / etc. usually precedes the short world name
        if (!worldName) areaName = s.value;
      }
    }

    // World display name: short FString after area, before long numeric player key
    for (let i = 0; i < strings.length; i++) {
      const s = strings[i];
      const next = strings[i + 1];
      if (
        s.value.length >= 1 &&
        s.value.length <= 32 &&
        !s.value.includes("/") &&
        !/^\d{10,}$/.test(s.value) &&
        s.value !== gameVersion &&
        s.value !== levelName &&
        s.value !== areaName &&
        next &&
        /^\d{10,}$/.test(next.value)
      ) {
        worldName = s.value;
        worldNameHit = s;
        playerKey = next.value;
        break;
      }
    }

    if (!worldName) {
      // fallback: shortest non-path string that isn't version/level/area
      const candidates = strings.filter(
        (s) =>
          s.value.length <= 24 &&
          !s.value.includes("/") &&
          !s.value.includes(".") &&
          s.value !== gameVersion &&
          s.value !== levelName &&
          s.value !== areaName &&
          !/^\d{10,}$/.test(s.value)
      );
      if (candidates.length) {
        worldNameHit = candidates[candidates.length - 1];
        worldName = worldNameHit.value;
      }
    }

    if (!playerKey) {
      const pk = strings.find((s) => /^\d{10,}$/.test(s.value));
      if (pk) playerKey = pk.value;
    }

    return {
      size: buf.length,
      headerType,
      headerVersion,
      gameVersion,
      saveId: guidToString(guidBytes),
      levelName,
      zoneTable,
      areaName,
      worldName,
      playerKey,
      strings,
      _worldNameHit: worldNameHit,
      _buf: buf,
    };
  }

  function rewriteWorldName(bytes, newName) {
    const parsed = parseHeader(bytes);
    const hit = parsed._worldNameHit;
    if (!hit) throw new Error("Could not locate world display name in header.");
    const name = String(newName || "").trim();
    if (!name) throw new Error("World name cannot be empty.");
    if (name.length > hit.capacity) {
      throw new Error(
        "World name too long for in-place edit (max " +
          hit.capacity +
          " chars in this save)."
      );
    }
    const out = new Uint8Array(parsed._buf);
    const enc = new TextEncoder().encode(name);
    const payload = new Uint8Array(hit.byteLen);
    payload.set(enc, 0);
    for (let i = enc.length; i < hit.capacity; i++) payload[i] = 0x20;
    payload[hit.byteLen - 1] = 0;
    out.set(payload, hit.stringAt);
    return { bytes: out, value: name, padded: enc.length < hit.capacity };
  }

  window.GroundedHeader = {
    parseHeader,
    rewriteWorldName,
    collectFStrings,
    readFString,
  };
})();
