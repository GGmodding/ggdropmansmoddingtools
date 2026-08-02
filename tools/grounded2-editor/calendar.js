(() => {
  "use strict";

  const C = window.GroundedCsav;
  const CAL_PATH = "/Script/Maine.CalendarComponent";

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

  function parseCalendar(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const at = indexOfAscii(buf, CAL_PATH, 0);
    if (at < 0) return { ok: false };
    let dataAt = at + CAL_PATH.length + 1;
    // G2 short-name FString
    const shortLen = new DataView(buf.buffer, buf.byteOffset + dataAt, 4).getInt32(0, true);
    if (shortLen > 1 && shortLen < 64 && dataAt + 4 + shortLen <= buf.length) {
      dataAt = dataAt + 4 + shortLen;
    }
    if (dataAt + 16 > buf.length) return { ok: false };
    // Prefer float immediately before scale 1.0 (00 00 80 3f)
    let dayOff = -1;
    let day = NaN;
    for (let off = 0; off <= 24; off++) {
      if (dataAt + off + 8 > buf.length) break;
      if (
        buf[dataAt + off + 4] === 0x00 &&
        buf[dataAt + off + 5] === 0x00 &&
        buf[dataAt + off + 6] === 0x80 &&
        buf[dataAt + off + 7] === 0x3f
      ) {
        dayOff = dataAt + off;
        day = new DataView(buf.buffer, buf.byteOffset + dayOff, 4).getFloat32(0, true);
        break;
      }
    }
    if (dayOff < 0) {
      dayOff = dataAt + 5;
      day = new DataView(buf.buffer, buf.byteOffset + dayOff, 4).getFloat32(0, true);
    }
    const scaleOff = dayOff + 4;
    const scale = new DataView(buf.buffer, buf.byteOffset + scaleOff, 4).getFloat32(0, true);
    if (!Number.isFinite(day) || day < 0 || day > 10000) return { ok: false };
    return {
      ok: true,
      day,
      dayOff,
      scale,
      scaleOff,
      dataAt,
      hourHint: (day % 1) * 24,
    };
  }

  function writeCalendarDay(rawWorld, dayValue) {
    const parsed = parseCalendar(rawWorld);
    if (!parsed.ok) throw new Error("Could not parse CalendarComponent.");
    const n = Number(dayValue);
    if (!Number.isFinite(n) || n < 0 || n > 10000) {
      throw new Error("Invalid day value.");
    }
    const buf = new Uint8Array(C.toBytes(rawWorld));
    new DataView(buf.buffer, buf.byteOffset + parsed.dayOff, 4).setFloat32(0, n, true);
    return { bytes: buf, day: n };
  }

  /** Set fractional part for a rough time-of-day while keeping whole days. */
  function writeTimeOfDay(rawWorld, hour0to24) {
    const parsed = parseCalendar(rawWorld);
    if (!parsed.ok) throw new Error("Could not parse CalendarComponent.");
    const h = Math.max(0, Math.min(23.99, Number(hour0to24)));
    if (!Number.isFinite(h)) throw new Error("Invalid hour.");
    const whole = Math.floor(parsed.day);
    const next = whole + h / 24;
    return writeCalendarDay(rawWorld, next);
  }

  window.GroundedCalendar = {
    parseCalendar,
    writeCalendarDay,
    writeTimeOfDay,
  };
})();
