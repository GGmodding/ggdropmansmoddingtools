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

  function findComponent(bytes, name) {
    const enc = new TextEncoder().encode(name);
    const hdrLen = 2 + enc.length + 2;
    for (let i = 0; i <= bytes.length - hdrLen - 1; i++) {
      if (bytes[i] !== 0x0a || bytes[i + 1] !== enc.length) continue;
      let ok = true;
      for (let j = 0; j < enc.length; j++) {
        if (bytes[i + 2 + j] !== enc[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (bytes[i + 2 + enc.length] !== 0x10 || bytes[i + 3 + enc.length] !== 0x01) {
        continue;
      }
      const lenPos = i + hdrLen;
      const [len, payloadStart] = readVarint(bytes, lenPos);
      const payloadEnd = payloadStart + len;
      if (payloadEnd > bytes.length || len < 1) continue;
      return {
        at: i,
        lenPos,
        lenBytes: payloadStart - lenPos,
        payloadStart,
        payloadEnd,
        len,
        payload: bytes.subarray(payloadStart, payloadEnd),
      };
    }
    return null;
  }

  function parseStoryGoals(sceneBytes) {
    const bytes = toBytes(sceneBytes);
    const hit = findComponent(bytes, "Story.StoryGoalManager");
    if (!hit) {
      return { ok: false, error: "Story.StoryGoalManager not found." };
    }
    const goals = [];
    let i = 0;
    const p = hit.payload;
    while (i < p.length) {
      const t = p[i++];
      const field = t >> 3;
      const wt = t & 7;
      if (wt === 0) {
        const [, j] = readVarint(p, i);
        i = j;
      } else if (wt === 2) {
        const [l, j] = readVarint(p, i);
        if (field === 2) {
          goals.push(new TextDecoder().decode(p.subarray(j, j + l)));
        }
        i = j + l;
      } else if (wt === 5) {
        i += 4;
      } else break;
    }
    return { ok: true, goals, _hit: hit };
  }

  function encodeGoal(key) {
    const keyBytes = new TextEncoder().encode(key);
    return [0x12, keyBytes.length, ...keyBytes];
  }

  function addStoryGoals(sceneBytes, keys) {
    const bytes = toBytes(sceneBytes);
    const parsed = parseStoryGoals(bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    const have = new Set(parsed.goals);
    const add = [...new Set(keys)].filter((k) => k && !have.has(k));
    if (!add.length) {
      return { bytes, before: parsed.goals.length, after: parsed.goals.length, added: 0 };
    }
    const extra = [];
    for (const k of add) extra.push(...encodeGoal(k));
    const extraBytes = Uint8Array.from(extra);
    // Insert new goals at end of payload (before payloadEnd)
    const hit = parsed._hit;
    const newPayloadLen = hit.len + extraBytes.length;
    const newLenBytes = writeVarint(newPayloadLen);
    const delta =
      newLenBytes.length - hit.lenBytes + extraBytes.length;

    const out = new Uint8Array(bytes.length + delta);
    out.set(bytes.subarray(0, hit.lenPos), 0);
    out.set(newLenBytes, hit.lenPos);
    const payloadWriteAt = hit.lenPos + newLenBytes.length;
    out.set(bytes.subarray(hit.payloadStart, hit.payloadEnd), payloadWriteAt);
    out.set(extraBytes, payloadWriteAt + hit.len);
    out.set(
      bytes.subarray(hit.payloadEnd),
      payloadWriteAt + hit.len + extraBytes.length
    );
    return {
      bytes: out,
      before: parsed.goals.length,
      after: parsed.goals.length + add.length,
      added: add.length,
      keys: add,
    };
  }

  function parsePrison(sceneBytes) {
    const bytes = toBytes(sceneBytes);
    const hit = findComponent(bytes, "PrisonManager");
    if (!hit) return { ok: false, error: "PrisonManager not found." };
    const p = hit.payload;
    let babies = null;
    let babiesAt = -1;
    let i = 0;
    while (i < p.length) {
      const tagAt = i;
      const t = p[i++];
      const field = t >> 3;
      const wt = t & 7;
      if (wt === 0) {
        const valueAt = hit.payloadStart + i;
        const [v, j] = readVarint(p, i);
        if (field === 4) {
          babies = !!v;
          babiesAt = valueAt;
        }
        i = j;
        void tagAt;
      } else if (wt === 5) {
        i += 4;
      } else if (wt === 2) {
        const [l, j] = readVarint(p, i);
        i = j + l;
      } else break;
    }
    return { ok: true, babiesHatched: babies, babiesAt, _hit: hit };
  }

  function setBabiesHatched(sceneBytes, value) {
    const bytes = toBytes(sceneBytes);
    const parsed = parsePrison(bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    if (parsed.babiesAt < 0) throw new Error("PrisonManager.babiesHatched field missing.");
    const out = new Uint8Array(bytes);
    out[parsed.babiesAt] = value ? 1 : 0;
    return { bytes: out, babiesHatched: !!value };
  }

  function parseRocket(globalBytes) {
    const bytes = toBytes(globalBytes);
    const hit = findComponent(bytes, "Rocket");
    if (!hit) return { ok: false, error: "Rocket not found in global-objects.bin." };
    const p = hit.payload;
    let stage = null;
    let stageAt = -1;
    let i = 0;
    while (i < p.length) {
      const t = p[i++];
      const field = t >> 3;
      const wt = t & 7;
      if (wt === 0) {
        const valueAt = hit.payloadStart + i;
        const [v, j] = readVarint(p, i);
        if (field === 1) {
          stage = v;
          stageAt = valueAt;
        }
        i = j;
      } else if (wt === 5) {
        i += 4;
      } else if (wt === 2) {
        const [l, j] = readVarint(p, i);
        i = j + l;
      } else break;
    }
    return { ok: true, stage, stageAt, _hit: hit };
  }

  function forceRocketReady(globalBytes) {
    const bytes = toBytes(globalBytes);
    const parsed = parseRocket(bytes);
    if (!parsed.ok) throw new Error(parsed.error);
    if (parsed.stageAt < 0) throw new Error("Rocket.currentRocketStage missing.");
    // Stage 5 = fully built / ready in SN
    const out = new Uint8Array(bytes);
    out[parsed.stageAt] = 5;
    return { bytes: out, stage: 5, before: parsed.stage };
  }

  const AURORA_GOALS = [
    "Goal_LocationAuroraEntry",
    "Goal_LocationAuroraDriveEntry",
    "Story_AuroraWarning4",
  ];

  window.SubnauticaStory = {
    parseStoryGoals,
    addStoryGoals,
    parsePrison,
    setBabiesHatched,
    parseRocket,
    forceRocketReady,
    AURORA_GOALS,
  };
})();
