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
    const dataAt = at + CAL_PATH.length + 1;
    // Observed: 00 00, then 3 bytes, then float dayValue, then float 1.0
    // Day float sits at dataAt+5 (bytes … f3 55 13 41 …)
    if (dataAt + 13 > buf.length) return { ok: false };
    const dayOff = dataAt + 5;
    const day = new DataView(buf.buffer, buf.byteOffset + dayOff, 4).getFloat32(0, true);
    const scaleOff = dataAt + 9;
    const scale = new DataView(buf.buffer, buf.byteOffset + scaleOff, 4).getFloat32(0, true);
    if (!Number.isFinite(day) || day < 0 || day > 10000) return { ok: false };
    return {
      ok: true,
      day,
      dayOff,
      scale,
      scaleOff,
      dataAt,
      // Rough TOD guess from fractional part mapped to 24h (best-effort)
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
