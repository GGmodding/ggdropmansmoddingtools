(() => {
  "use strict";

  const C = window.GroundedCsav;

  const PARTY_PATH = "/Script/Maine.PartyComponent";
  const FULL_TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
  const TECH_TABLE = "/Game/Blueprints/Items/Table_TechTrees.Table_TechTrees";

  /** Common analyzer unlocks that teach a lot of recipes (G2 / Augusta). */
  const ANALYZE_STARTER = [
    "FiberRaw",
    "FiberDry",
    "Sap",
    "Clay",
    "StoneShale",
    "Twig",
    "GrassPlank",
    "CloverTop",
    "ThistleNeedle",
    "AcornTop",
    "Mushroom",
    "AntPart",
    "AntHead",
    "GrubHide",
    "GrubGoop",
    "Web",
    "Nectar",
    "Honeydew",
    "WeevilMeat",
    "AphidMeat",
    "GnatMeat",
    "GrubMeat",
    "FuzzMite",
    "FuzzGnat",
    "BandageTier1",
    "SmoothieFiber",
    "GrassSeed",
  ];

  function readFString(buf, off) {
    if (off < 0 || off + 4 > buf.length) return null;
    const len = new DataView(buf.buffer, buf.byteOffset + off, 4).getInt32(0, true);
    if (len <= 1 || len > 120 || off + 4 + len > buf.length) return null;
    const raw = buf.subarray(off + 4, off + 4 + len - 1);
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== 0 && (c < 32 || c > 126)) return null;
    }
    let s = "";
    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
    if (!/^[A-Za-z][A-Za-z0-9_+.\-]*$/.test(s)) return null;
    return { s, next: off + 4 + len, len };
  }

  function encodeFString(str) {
    const s = String(str || "");
    const out = new Uint8Array(4 + s.length + 1);
    C.writeU32(out, 0, s.length + 1);
    for (let i = 0; i < s.length; i++) out[4 + i] = s.charCodeAt(i);
    out[4 + s.length] = 0;
    return out;
  }

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

  function encodeKnowledgeRecord(itemName) {
    const pathBytes = new TextEncoder().encode(FULL_TABLE + "\0");
    const nameBytes = encodeFString(itemName);
    const out = new Uint8Array(4 + pathBytes.length + nameBytes.length);
    C.writeU32(out, 0, pathBytes.length);
    out.set(pathBytes, 4);
    out.set(nameBytes, 4 + pathBytes.length);
    return out;
  }

  function encodeAnalyzedRecord(itemName) {
    // FString + u32 a + u32 b + u32 c  (defaults: 0,0,1)
    const nameBytes = encodeFString(itemName);
    const out = new Uint8Array(nameBytes.length + 12);
    out.set(nameBytes, 0);
    C.writeU32(out, nameBytes.length, 0);
    C.writeU32(out, nameBytes.length + 4, 0);
    C.writeU32(out, nameBytes.length + 8, 1);
    return out;
  }

  function payloadAfterScriptPath(buf, pathAt, pathStr) {
    let o = pathAt + pathStr.length + 1;
    const fs = readFString(buf, o);
    if (fs && fs.s.length >= 4 && fs.s.length < 64) return fs.next;
    return o;
  }

  function parsePartyTech(rawWorld) {
    const buf = C.toBytes(rawWorld);
    const partyAt = indexOfAscii(buf, PARTY_PATH, 0);
    if (partyAt < 0) return { ok: false };
    let off = payloadAfterScriptPath(buf, partyAt, PARTY_PATH);
    if (off + 4 > buf.length) return { ok: false };

    // G1 had a leading tag byte; G2 starts the knowledge count immediately.
    let tag = 0;
    let knowledgeCountOff = off;
    let knowledgeCount = C.readU32(buf, off);
    if (knowledgeCount > 5000 || knowledgeCount === 0) {
      tag = buf[off];
      knowledgeCountOff = off + 1;
      knowledgeCount = C.readU32(buf, knowledgeCountOff);
      off = knowledgeCountOff;
    }
    off = knowledgeCountOff + 4;
    if (knowledgeCount < 1 || knowledgeCount > 5000) {
      // Fall through — G2 may store a non-count u32 here; we walk FULL_TABLE records instead.
    }

    // G2 inserts a pad byte (0x00) before the first knowledge record.
    if (buf[off] === 0 && C.readU32(buf, off + 1) === FULL_TABLE.length + 1) {
      off += 1;
    }

    const knowledge = [];
    // Walk consecutive Table_AllItems knowledge records (G2 leading u32 is not always the count).
    const maxWalk = 5000;
    for (let i = 0; i < maxWalk; i++) {
      if (off + 8 > buf.length) break;
      const pathLen = C.readU32(buf, off);
      if (pathLen !== FULL_TABLE.length + 1) break;
      const tableAt = off + 4;
      if (indexOfAscii(buf, FULL_TABLE, tableAt) !== tableAt) break;
      const name = readFString(buf, tableAt + FULL_TABLE.length + 1);
      if (!name) break;
      knowledge.push({
        name: name.s,
        start: off,
        end: name.next,
        size: name.next - off,
      });
      off = name.next;
    }
    if (!knowledge.length) return { ok: false, error: "no knowledge records" };
    const storedKnowledgeCount = C.readU32(buf, knowledgeCountOff);
    const knowledgeCountMatches = storedKnowledgeCount === knowledge.length;

    const analyzedCountOff = off;
    const analyzedCount = C.readU32(buf, off);
    off += 4;
    const analyzedUnkOff = off;
    const analyzedUnk = C.readU32(buf, off);
    off += 4;
    if (analyzedCount < 0 || analyzedCount > 5000) {
      return { ok: false, error: "analyzed count" };
    }

    const analyzed = [];
    for (let i = 0; i < analyzedCount; i++) {
      const name = readFString(buf, off);
      if (!name || name.next + 12 > buf.length) {
        return { ok: false, error: "analyzed name @" + i };
      }
      const a = C.readU32(buf, name.next);
      const b = C.readU32(buf, name.next + 4);
      const c = C.readU32(buf, name.next + 8);
      analyzed.push({
        name: name.s,
        start: off,
        end: name.next + 12,
        size: name.next + 12 - off,
        a,
        b,
        c,
      });
      off = name.next + 12;
    }

    // Tech trees (optional scan ahead)
    const techAt = indexOfAscii(buf, TECH_TABLE, off);
    const techTrees = [];
    if (techAt >= 0) {
      let t = techAt;
      while (t < Math.min(buf.length, techAt + 20000)) {
        const hit = indexOfAscii(buf, TECH_TABLE, t);
        if (hit < 0 || hit > techAt + 20000) break;
        const name = readFString(buf, hit + TECH_TABLE.length + 1);
        if (!name) {
          t = hit + 1;
          continue;
        }
        techTrees.push({ name: name.s, at: hit });
        t = name.next;
      }
    }

    return {
      ok: true,
      partyAt,
      tag,
      knowledgeCountOff,
      knowledgeCountMatches,
      knowledge,
      analyzedCountOff,
      analyzedUnkOff,
      analyzedUnk,
      analyzed,
      techTrees,
      analyzedEnd: off,
      size: buf.length,
    };
  }

  function addKnowledgeItem(rawWorld, itemName) {
    const name = String(itemName || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_+.\-]{0,60}$/.test(name)) {
      throw new Error("Invalid knowledge id.");
    }
    const parsed = parsePartyTech(rawWorld);
    if (!parsed.ok) throw new Error("Could not parse PartyComponent knowledge.");
    if (parsed.knowledge.some((k) => k.name === name)) {
      return { bytes: C.toBytes(rawWorld), added: name, mode: "exists", list: "knowledge" };
    }
    const buf = C.toBytes(rawWorld);
    const rec = encodeKnowledgeRecord(name);
    const insertAt = parsed.knowledge[parsed.knowledge.length - 1].end;
    const out = new Uint8Array(buf.length + rec.length);
    out.set(buf.subarray(0, insertAt), 0);
    out.set(rec, insertAt);
    out.set(buf.subarray(insertAt), insertAt + rec.length);
    if (parsed.knowledgeCountMatches) {
      C.writeU32(out, parsed.knowledgeCountOff, parsed.knowledge.length + 1);
    }
    return {
      bytes: out,
      added: name,
      mode: "add",
      list: "knowledge",
      count: parsed.knowledge.length + 1,
      countUpdated: !!parsed.knowledgeCountMatches,
    };
  }

  function addAnalyzedItem(rawWorld, itemName) {
    const name = String(itemName || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_+.\-]{0,60}$/.test(name)) {
      throw new Error("Invalid analyzed item id.");
    }
    const parsed = parsePartyTech(rawWorld);
    if (!parsed.ok) throw new Error("Could not parse analyzed list.");
    if (parsed.analyzed.some((k) => k.name === name)) {
      return { bytes: C.toBytes(rawWorld), added: name, mode: "exists", list: "analyzed" };
    }
    const buf = C.toBytes(rawWorld);
    const rec = encodeAnalyzedRecord(name);
    const insertAt = parsed.analyzed[parsed.analyzed.length - 1].end;
    const out = new Uint8Array(buf.length + rec.length);
    out.set(buf.subarray(0, insertAt), 0);
    out.set(rec, insertAt);
    out.set(buf.subarray(insertAt), insertAt + rec.length);
    // analyzedCountOff shifts if we inserted before it? We insert AFTER last analyzed,
    // which is after count field — countOff unchanged.
    C.writeU32(out, parsed.analyzedCountOff, parsed.analyzed.length + 1);
    return {
      bytes: out,
      added: name,
      mode: "add",
      list: "analyzed",
      count: parsed.analyzed.length + 1,
    };
  }

  function unlockAnalyzeStarter(rawWorld) {
    let buf = new Uint8Array(C.toBytes(rawWorld));
    let added = 0;
    let skipped = 0;
    for (const name of ANALYZE_STARTER) {
      const r = addAnalyzedItem(buf, name);
      buf = new Uint8Array(r.bytes);
      if (r.mode === "add") added++;
      else skipped++;
    }
    return { bytes: buf, added, skipped, total: ANALYZE_STARTER.length };
  }

  function unlockTechChips(rawWorld) {
    // G2 Snackbar / Augusta chips — also accept any Recipe*/Tech* already referenced in World.
    const chips = [
      "TechChip_Snackbar",
      "TechChip_Initial",
      "TechTree_Snackbar",
      "TechTree_InitialData",
    ];
    const parsed0 = parsePartyTech(rawWorld);
    const fromSave = (parsed0.knowledge || [])
      .map((k) => k.name)
      .filter((n) => /^TechChip_|^Recipe|^TechTree_/i.test(n));
    const list = [...new Set([...chips, ...fromSave])];
    let buf = new Uint8Array(C.toBytes(rawWorld));
    let added = 0;
    let skipped = 0;
    for (const name of list) {
      const r = addKnowledgeItem(buf, name);
      buf = new Uint8Array(r.bytes);
      if (r.mode === "add") added++;
      else skipped++;
    }
    return { bytes: buf, added, skipped, total: list.length };
  }

  window.GroundedTech = {
    parsePartyTech,
    addKnowledgeItem,
    addAnalyzedItem,
    unlockAnalyzeStarter,
    unlockTechChips,
    ANALYZE_STARTER,
  };
})();
