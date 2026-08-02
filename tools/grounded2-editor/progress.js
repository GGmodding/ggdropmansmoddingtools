(() => {
  "use strict";

  const C = window.GroundedCsav;

  const QUEST_MGR = "/Script/Maine.QuestManagerComponent";
  const QUEST_TABLE = "/Game/Blueprints/Quests/Table_Quests_ALL.Table_Quests_ALL";

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 160 || off + 4 + len > buf.length) return null;
    const raw = buf.subarray(off + 4, off + 4 + len - 1);
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== 0 && (c < 32 || c > 126)) return null;
    }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) return null;
    return { s, next: off + 4 + len, len };
  }

  function indexOfAsciiFrom(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from || 0); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function displayQuestName(id) {
    return String(id || "")
      .replace(/^Augusta_/, "")
      .replace(/^MQ0*/, "MQ ")
      .replace(/_/g, " ");
  }

  function isStepComplete(a, b, c, d) {
    return b === 1 && c === 1 && d === 1;
  }

  function parseQuests(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const mgrAt = indexOfAsciiFrom(buf, QUEST_MGR, 0);
    const byName = new Map();
    let i = 0;
    while (true) {
      const at = indexOfAsciiFrom(buf, QUEST_TABLE, i);
      if (at < 0) break;
      const name = readFString(buf, at + QUEST_TABLE.length + 1);
      if (!name || name.next + 16 > buf.length) {
        i = at + 1;
        continue;
      }
      const flagsAt = name.next;
      const a = C.readU32(buf, flagsAt);
      const b = C.readU32(buf, flagsAt + 4);
      const c = C.readU32(buf, flagsAt + 8);
      const d = C.readU32(buf, flagsAt + 12);
      if (!byName.has(name.s)) byName.set(name.s, []);
      byName.get(name.s).push({
        tableAt: at,
        nameOff: at + QUEST_TABLE.length + 1,
        flagsAt,
        a,
        b,
        c,
        d,
        isHeader: d === 2,
      });
      i = at + 1;
    }

    const quests = [];
    for (const [id, recs] of byName.entries()) {
      const header = recs.find((r) => r.isHeader) || recs[0];
      const steps = recs.filter((r) => !r.isHeader);
      const doneSteps = steps.filter((r) => isStepComplete(r.a, r.b, r.c, r.d)).length;
      const complete =
        steps.length > 0
          ? doneSteps === steps.length && header && header.b === 1
          : !!(header && header.b === 1);
      quests.push({
        id,
        display: displayQuestName(id),
        header,
        steps,
        stepCount: steps.length,
        doneSteps,
        complete,
        active: !!(header && header.b === 1),
      });
    }
    quests.sort((a, b) => a.id.localeCompare(b.id));
    return {
      ok: quests.length > 0,
      quests,
      managerAt: mgrAt,
      size: buf.length,
    };
  }

  function completeQuest(rawWorld, questId) {
    const buf = new Uint8Array(C.toBytes(rawWorld));
    const parsed = parseQuests(buf);
    const q = parsed.quests.find((x) => x.id === questId);
    if (!q) throw new Error("Quest not found: " + questId);
    if (q.header) {
      C.writeU32(buf, q.header.flagsAt, 1);
      C.writeU32(buf, q.header.flagsAt + 4, 1);
      C.writeU32(buf, q.header.flagsAt + 8, Math.max(q.header.c, q.steps.length || 1));
      C.writeU32(buf, q.header.flagsAt + 12, 2);
    }
    q.steps.forEach((step, idx) => {
      const stepIndex = step.a <= 64 ? step.a : idx;
      C.writeU32(buf, step.flagsAt, stepIndex);
      C.writeU32(buf, step.flagsAt + 4, 1);
      C.writeU32(buf, step.flagsAt + 8, 1);
      C.writeU32(buf, step.flagsAt + 12, 1);
    });
    return { bytes: buf, id: questId, steps: q.steps.length };
  }

  function completeAllQuests(rawWorld) {
    let buf = new Uint8Array(C.toBytes(rawWorld));
    const parsed = parseQuests(buf);
    if (!parsed.ok) throw new Error("No quests found in World.csav.");
    let changed = 0;
    for (const q of parsed.quests) {
      if (q.complete) continue;
      const r = completeQuest(buf, q.id);
      buf = r.bytes;
      changed++;
    }
    return { bytes: buf, changed, total: parsed.quests.length };
  }

  window.GroundedProgress = {
    parseQuests,
    completeQuest,
    completeAllQuests,
    displayQuestName,
  };
})();
