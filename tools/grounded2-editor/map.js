(() => {
  "use strict";

  const C = window.GroundedCsav;

  const FOG_PATH = "/Script/Maine.FogOfWarComponent";
  const SURVEY_PATH = "/Script/Maine.ResourceSurveyComponent";
  const MAP_PATH = "/Script/Maine.MapComponent";

  function indexOfAscii(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from || 0); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function afterShortName(buf, pathAt, pathStr) {
    let o = pathAt + pathStr.length + 1;
    if (o + 4 > buf.length) return o;
    const len = new DataView(buf.buffer, buf.byteOffset + o, 4).getInt32(0, true);
    if (len > 0 && len < 80 && o + 4 + len <= buf.length) return o + 4 + len;
    return o;
  }

  /**
   * FogOfWar: pad byte + u32 byteCount + bit/byte blob (all 0 = fully fogged).
   */
  function parseFog(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const at = indexOfAscii(buf, FOG_PATH, 0);
    if (at < 0) return { ok: false };
    const payload = afterShortName(buf, at, FOG_PATH);
    if (payload + 5 > buf.length) return { ok: false };
    const count = new DataView(buf.buffer, buf.byteOffset + payload + 1, 4).getUint32(0, true);
    if (count < 64 || count > 2_000_000 || payload + 5 + count > buf.length) {
      return { ok: false, reason: "unexpected fog size " + count };
    }
    const blobAt = payload + 5;
    let revealed = 0;
    let fogged = 0;
    for (let i = 0; i < count; i++) {
      const b = buf[blobAt + i];
      if (b === 0xff) revealed++;
      else if (b === 0) fogged++;
    }
    return {
      ok: true,
      at,
      payload,
      blobAt,
      count,
      revealed,
      fogged,
      other: count - revealed - fogged,
      pct: Math.round((1000 * revealed) / count) / 10,
    };
  }

  function revealAllFog(rawWorld) {
    const fog = parseFog(rawWorld);
    if (!fog.ok) throw new Error(fog.reason || "FogOfWarComponent not found.");
    const buf = new Uint8Array(C.toBytes(rawWorld));
    buf.fill(0xff, fog.blobAt, fog.blobAt + fog.count);
    return { bytes: buf, count: fog.count, wasRevealed: fog.revealed };
  }

  function parseSurvey(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const at = indexOfAscii(buf, SURVEY_PATH, 0);
    if (at < 0) return { ok: false };
    const payload = afterShortName(buf, at, SURVEY_PATH);
    const fogAt = indexOfAscii(buf, FOG_PATH, payload);
    const size = fogAt > payload ? fogAt - payload : 0;
    const tag =
      payload + 4 <= buf.length
        ? new DataView(buf.buffer, buf.byteOffset + payload, 4).getUint32(0, true)
        : null;
    return { ok: true, at, payload, size, tag, note: "Compact header only on this save — no resource id list to unlock yet." };
  }

  function parseMap(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const at = indexOfAscii(buf, MAP_PATH, 0);
    if (at < 0) return { ok: false };
    const payload = afterShortName(buf, at, MAP_PATH);
    return { ok: true, at, payload };
  }

  window.GroundedMap = {
    parseFog,
    revealAllFog,
    parseSurvey,
    parseMap,
  };
})();
