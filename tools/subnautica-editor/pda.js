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

  function findPlayerTechPayload(bytes) {
    // Component: 0a 06 "Player" 10 01 d2 <len> <payload with field5 tech list>
    const sig = [0x0a, 0x06, 0x50, 0x6c, 0x61, 0x79, 0x65, 0x72, 0x10, 0x01, 0xd2];
    outer: for (let i = 0; i <= bytes.length - sig.length; i++) {
      for (let j = 0; j < sig.length; j++) {
        if (bytes[i + j] !== sig[j]) continue outer;
      }
      const tagAt = i + 10; // 0xd2
      const [len, payloadStart] = readVarint(bytes, tagAt + 1);
      const payloadEnd = payloadStart + len;
      if (payloadEnd > bytes.length || len < 8 || len > 200000) continue;
      // Validate payload has fields 1..4 then 5
      const payload = bytes.subarray(payloadStart, payloadEnd);
      if (payload[0] !== 0x08) continue;
      return { componentAt: i, tagAt, payloadStart, payloadEnd, len, payload };
    }
    return null;
  }

  function parseTechList(payload) {
    let i = 0;
    const prefix = [];
    const techs = [];
    while (i < payload.length) {
      const t = payload[i];
      const field = t >> 3;
      const wt = t & 7;
      if (field === 5) break;
      if (wt !== 0) throw new Error("Unexpected PDA payload layout.");
      const [v, j] = readVarint(payload, i + 1);
      prefix.push(Array.from(payload.subarray(i, j)));
      i = j;
      void v;
    }
    while (i < payload.length && payload[i] === 0x28) {
      const [v, j] = readVarint(payload, i + 1);
      techs.push(v);
      i = j;
    }
    return { prefix, techs, restAt: i };
  }

  function collectTechTypesFromClassIds() {
    const db = window.SubnauticaClassIds;
    const set = new Set();
    // Prefer curated spawnable/buildable-ish items: we still need numeric TechTypes.
    // Numbers come from the bundled tech id list when present.
    if (window.SubnauticaTechIds && Array.isArray(window.SubnauticaTechIds)) {
      for (const n of window.SubnauticaTechIds) {
        const v = Number(n);
        if (v > 0) set.add(v);
      }
    }
    return [...set].sort((a, b) => a - b);
  }

  function unlockAllPda(sceneBytes, techIds) {
    const bytes = toBytes(sceneBytes);
    const hit = findPlayerTechPayload(bytes);
    if (!hit) {
      throw new Error(
        "Could not find PDA / blueprint unlock data in scene-objects.bin. Is this a full Subnautica slot?"
      );
    }
    const parsed = parseTechList(hit.payload);
    const ids =
      techIds && techIds.length
        ? [...new Set(techIds.map(Number).filter((n) => n > 0))].sort((a, b) => a - b)
        : collectTechTypesFromClassIds();
    if (!ids.length) {
      throw new Error("No TechType ID list loaded.");
    }

    // Keep already-unlocked IDs too (union)
    const merged = [...new Set([...parsed.techs, ...ids])].sort((a, b) => a - b);

    const prefixBytes = [];
    for (const chunk of parsed.prefix) prefixBytes.push(...chunk);
    const field5 = [];
    for (const t of merged) {
      field5.push(0x28, ...writeVarint(t));
    }
    const newPayload = Uint8Array.from([...prefixBytes, ...field5]);
    const lenBytes = writeVarint(newPayload.length);

    const out = new Uint8Array(
      hit.tagAt + 1 + lenBytes.length + newPayload.length + (bytes.length - hit.payloadEnd)
    );
    out.set(bytes.subarray(0, hit.tagAt + 1), 0); // include 0xd2 tag
    out.set(lenBytes, hit.tagAt + 1);
    out.set(newPayload, hit.tagAt + 1 + lenBytes.length);
    out.set(bytes.subarray(hit.payloadEnd), hit.tagAt + 1 + lenBytes.length + newPayload.length);

    return {
      bytes: out,
      before: parsed.techs.length,
      after: merged.length,
      added: merged.length - parsed.techs.length,
    };
  }

  function countUnlocked(sceneBytes) {
    const hit = findPlayerTechPayload(toBytes(sceneBytes));
    if (!hit) return null;
    return parseTechList(hit.payload).techs.length;
  }

  window.SubnauticaPda = {
    unlockAllPda,
    countUnlocked,
    findPlayerTechPayload,
  };
})();
