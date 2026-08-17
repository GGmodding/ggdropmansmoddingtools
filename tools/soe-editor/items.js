(() => {
  "use strict";

  const DB = typeof window !== "undefined" ? window.SoEItemsDB : require("./items-db.js");
  const AFF = typeof window !== "undefined" ? window.SoEAffixes || {} : require("./affixes-db.js");
  const MAG = DB.MAG;
  const ITEMS = DB.ITEMS;

  const QUALITY = { Low: 1, Normal: 2, Superior: 3, Magic: 4, Set: 5, Rare: 6, Unique: 7, Crafted: 8 };
  const STASH_HEADER = 302;
  const STASH_MAGIC = [0x55, 0xbb, 0x55, 0xbb];

  const SPAWN = [
    { group: "Runes", codes: ["r01","r02","r03","r04","r05","r06","r07","r08","r09","r10","r11","r12","r13","r14","r15","r16","r17","r18","r19","r20","r21","r22","r23","r24","r25","r26","r27","r28","r29","r30","r31","r32","r33"] },
    { group: "Currency", codes: ["ooal","dvo","csor","mfo","exo","etor","llmr"] },
    { group: "Infusions", codes: ["crfb","crfc","crfs","crfh","crfv","crfu","crfp"] },
    { group: "Gems", codes: ["gpv","gpw","gpg","gpr","gpb","gpy","skz","gzv","glw","glg","glr","glb","gly","skl"] },
    { group: "Potions", codes: ["hp1","hp2","hp3","hp4","hp5","mp1","mp2","mp3","mp4","mp5","rvs","rvl"] },
    { group: "Scrolls", codes: ["tsc","isc"] },
    { group: "Misc", codes: ["box","key","tbk","ibk","jew","cm1","cm2","cm3"] },
  ];

  function bitReader(bytes, start) {
    let bit = 0;
    return {
      read(n) {
        let v = 0;
        for (let i = 0; i < n; i++) {
          const byte = bytes[start + (bit >> 3)];
          if (byte === undefined) throw new Error("Unexpected end of item data");
          v |= ((byte >> (bit & 7)) & 1) << i;
          bit++;
        }
        return v >>> 0;
      },
      align() {
        if (bit & 7) bit += 8 - (bit & 7);
      },
      bitOffset: () => bit,
      byteOffset: () => start + (bit >> 3),
      alignedByteOffset: () => start + Math.ceil(bit / 8),
      seek(n) {
        bit = Math.max(0, n);
      },
    };
  }

  function bitWriter() {
    const out = [];
    let cur = 0;
    let n = 0;
    return {
      write(value, bits) {
        let v = value >>> 0;
        for (let i = 0; i < bits; i++) {
          if (v & 1) cur |= 1 << n;
          v >>>= 1;
          n++;
          if (n === 8) {
            out.push(cur);
            cur = 0;
            n = 0;
          }
        }
      },
      writeStr(s) {
        for (let i = 0; i < s.length; i++) this.write(s.charCodeAt(i), 8);
      },
      align() {
        if (n) {
          out.push(cur);
          cur = 0;
          n = 0;
        }
      },
      finish() {
        this.align();
        return Uint8Array.from(out);
      },
    };
  }

  function setBits(bytes, bitOff, n, value) {
    for (let i = 0; i < n; i++) {
      const b = bitOff + i;
      const bi = b >> 3;
      const m = 1 << (b & 7);
      if ((value >>> i) & 1) bytes[bi] |= m;
      else bytes[bi] &= ~m;
    }
  }

  function ascii(bytes, off, n) {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[off + i]);
    return s;
  }

  function u16(bytes, off) {
    return bytes[off] | (bytes[off + 1] << 8);
  }
  function setU16(bytes, off, v) {
    bytes[off] = v & 0xff;
    bytes[off + 1] = (v >> 8) & 0xff;
  }
  function u32(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
  }
  function setU32(bytes, off, v) {
    bytes[off] = v & 0xff;
    bytes[off + 1] = (v >>> 8) & 0xff;
    bytes[off + 2] = (v >>> 16) & 0xff;
    bytes[off + 3] = (v >>> 24) & 0xff;
  }

  function itemInfo(code) {
    return ITEMS[code] || { n: code, k: "m", w: 1, h: 1 };
  }

  function readMagic(reader) {
    const list = [];
    for (;;) {
      const id = reader.read(9);
      if (id === 0x1ff) break;
      const first = MAG[id];
      if (!first || !first.sB) throw new Error("Unknown or unsavable item stat id " + id);
      const nprops = first.np || 1;
      const values = [];
      for (let i = 0; i < nprops; i++) {
        const prop = MAG[id + i];
        if (!prop) throw new Error("Missing follow-on stat " + (id + i) + " for " + id);
        if (prop.sP) {
          let param = reader.read(prop.sP);
          if (prop.dF === 14) {
            values.push(param & 7);
            param = (param >> 3) & 0x1fff;
          }
          if (prop.e === 2 || prop.e === 3) {
            values.push(param & 0x3f);
            param = (param >> 6) & 0x3ff;
          }
          values.push(param);
        }
        if (!prop.sB) throw new Error("Save Bits missing for stat " + (id + i));
        let v = reader.read(prop.sB);
        if (prop.sA) v -= prop.sA;
        if (prop.e === 3) {
          values.push(v & 0xff);
          values.push((v >> 8) & 0xff);
        } else values.push(v);
      }
      list.push({ id, name: first.s, values });
    }
    return list;
  }

  function writeMagic(w, list) {
    for (const mod of list || []) {
      let valueIdx = 0;
      w.write(mod.id, 9);
      const first = MAG[mod.id];
      if (!first || !first.sB) throw new Error("Cannot write unsavable stat id " + mod.id);
      const nprops = first.np || 1;
      const values = mod.values || mod.v || [];
      for (let i = 0; i < nprops; i++) {
        const prop = MAG[mod.id + i];
        if (!prop) throw new Error("Missing follow-on stat " + (mod.id + i) + " for " + mod.id);
        if (prop.sP) {
          let param = values[valueIdx++] || 0;
          if (prop.dF === 14) param |= ((values[valueIdx++] || 0) & 0x1fff) << 3;
          if (prop.e === 2 || prop.e === 3) param |= ((values[valueIdx++] || 0) & 0x3ff) << 6;
          w.write(param, prop.sP);
        }
        let v = values[valueIdx++] || 0;
        if (prop.sA) v += prop.sA;
        if (prop.e === 3) v |= ((values[valueIdx++] || 0) & 0xff) << 8;
        if (!prop.sB) throw new Error("Save Bits missing for stat " + (mod.id + i));
        w.write(v, prop.sB);
      }
    }
    w.write(0x1ff, 9);
  }

  function parseItem(bytes, start) {
    if (ascii(bytes, start, 2) !== "JM") throw new Error("Item header JM not found at " + start);
    const reader = bitReader(bytes, start);
    reader.read(16);
    const flagsLo = reader.read(4);
    const identified = reader.read(1);
    const flagsMid = reader.read(6);
    const socketed = reader.read(1);
    const flag12 = reader.read(1);
    const isNew = reader.read(1);
    const flags14 = reader.read(2);
    const ear = reader.read(1);
    const starter = reader.read(1);
    const flags18 = reader.read(3);
    const simple = reader.read(1);
    const ethereal = reader.read(1);
    const flag23 = reader.read(1);
    const personalized = reader.read(1);
    const flag25 = reader.read(1);
    const runeword = reader.read(1);
    const flags27 = reader.read(5);
    const version = reader.read(10);
    const location = reader.read(3);
    const equipped = reader.read(4);
    const x = reader.read(4);
    const y = reader.read(4);
    const panel = reader.read(3);

    const item = {
      identified,
      socketed,
      isNew,
      ear,
      starter,
      simple,
      ethereal,
      personalized,
      runeword,
      version,
      location,
      equipped,
      x,
      y,
      panel,
      flagsLo,
      flagsMid,
      flag12,
      flags14,
      flags18,
      flag23,
      flag25,
      flags27,
      mods: [],
    };

    if (ear) {
      item.earClass = reader.read(3);
      item.earLevel = reader.read(7);
      let name = "";
      for (let i = 0; i < 15; i++) {
        const c = reader.read(7);
        if (!c) break;
        name += String.fromCharCode(c);
      }
      item.code = "ear";
      item.earName = name;
      reader.align();
      item.raw = bytes.slice(start, reader.alignedByteOffset());
      item.info = { n: name + "'s Ear", k: "m", w: 1, h: 1 };
      return item;
    }

    let code = "";
    for (let i = 0; i < 4; i++) code += String.fromCharCode(reader.read(8));
    item.code = code.replace(/\0/g, "").trim();
    const info = itemInfo(item.code);
    item.info = info;
    const isQuest = !!info.q;
    let sockBits = simple ? 1 : 3;
    if (isQuest) {
      const q = MAG[356] || { sB: 2, sA: 0 };
      item.questDiff = reader.read(q.sB) - (q.sA || 0);
      sockBits = 1;
    }
    item.socketedCount = reader.read(sockBits);

    let parseFailed = false;
    if (!simple) {
      const extStart = reader.bitOffset();
      const kinds = ITEMS[item.code] ? [info.k] : ["a", "w", "m"];
      let lastErr = null;
      for (const k of kinds) {
        try {
          reader.seek(extStart);
          const tryInfo = ITEMS[item.code] ? info : { n: info.n, k, w: info.w || 1, h: info.h || 1 };
          item.info = tryInfo;
          item.uidBit = extStart;
          readExtended(reader, item, tryInfo);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) {
        item.parseError = lastErr.message || String(lastErr);
        parseFailed = true;
        reader.seek(extStart);
      }
    }

    reader.align();
    let end = reader.alignedByteOffset();
    const nextItem = findNextItem(bytes, parseFailed ? start + 14 : end);
    const atItem = end + 1 < bytes.length && looksLikeItem(bytes, end);
    if (!atItem) {
      if (nextItem > end) end = nextItem;
      else {
        const boundary = findSectionMarker(bytes, end);
        if (boundary > end) end = boundary;
        else if (parseFailed || end <= start) end = bytes.length;
      }
    }
    if (!simple && item.socketedCount && !parseFailed) {
      item.socketedItems = [];
      let childOff = end;
      for (let i = 0; i < item.socketedCount; i++) {
        if (childOff + 2 > bytes.length || ascii(bytes, childOff, 2) !== "JM") {
          item.parseError = (item.parseError ? item.parseError + "; " : "") + "missing socketed item " + (i + 1);
          break;
        }
        try {
          const child = parseItem(bytes, childOff);
          item.socketedItems.push(child);
          childOff += child.raw.length;
          if (!child.raw.length) break;
        } catch (err) {
          item.parseError = (item.parseError ? item.parseError + "; " : "") + "socket " + (i + 1) + ": " + (err.message || err);
          break;
        }
      }
      item.raw = bytes.slice(start, childOff);
    } else {
      item.raw = bytes.slice(start, end);
    }
    if (!item.raw.length) item.raw = bytes.slice(start, Math.min(bytes.length, start + 14));
    return item;
  }

  function findJM(bytes, from) {
    for (let i = from; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x4a && bytes[i + 1] === 0x4d) return i;
    }
    return -1;
  }

  function readBitsAt(bytes, bitOff, n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = bytes[(bitOff + i) >> 3];
      if (byte === undefined) return null;
      v |= ((byte >> ((bitOff + i) & 7)) & 1) << i;
    }
    return v >>> 0;
  }

  function looksLikeItem(bytes, start) {
    if (start < 0 || start + 14 > bytes.length) return false;
    if (bytes[start] !== 0x4a || bytes[start + 1] !== 0x4d) return false;
    const version = readBitsAt(bytes, start * 8 + 48, 10);
    if (version !== 101 && version !== 99 && version !== 100 && version !== 102 && version !== 103) return false;
    let code = "";
    for (let i = 0; i < 4; i++) {
      const c = readBitsAt(bytes, start * 8 + 76 + i * 8, 8);
      if (c == null) return false;
      code += String.fromCharCode(c);
    }
    code = code.replace(/\0/g, "").trim();
    if (code.length < 3 || code.length > 4) return false;
    return /^[A-Za-z0-9']+$/.test(code);
  }

  function findNextItem(bytes, from) {
    const start = Math.max(0, from);
    for (let i = start; i < bytes.length - 13; i++) {
      if (bytes[i] === 0x4a && bytes[i + 1] === 0x4d && looksLikeItem(bytes, i)) return i;
    }
    return -1;
  }

  function findSectionMarker(bytes, from) {
    for (let i = Math.max(0, from); i < bytes.length - 1; i++) {
      const a = bytes[i];
      const b = bytes[i + 1];
      if (a === 0x6a && b === 0x66) return i; // jf
      if (a === 0x6b && b === 0x66) return i; // kf
      if (a === 0x4a && b === 0x4d) {
        const count = u16(bytes, i + 2);
        const after = i + 4;
        if (count === 0 && after + 1 < bytes.length) {
          const n = ascii(bytes, after, 2);
          if (n === "jf" || n === "kf" || n === "JM") return i;
        }
        if (count > 0 && count < 2048 && looksLikeItem(bytes, after)) return i;
      }
    }
    return -1;
  }

  function readExtended(reader, item, info) {
    item.uid = reader.read(32);
    item.ilvl = reader.read(7);
    item.quality = reader.read(4);
    item.multiPic = reader.read(1);
    if (item.multiPic) item.pictureId = reader.read(3);
    item.classSpec = reader.read(1);
    if (item.classSpec) item.autoAffix = reader.read(11);
    switch (item.quality) {
      case QUALITY.Low:
        item.lowQuality = reader.read(3);
        break;
      case QUALITY.Superior:
        item.superior = reader.read(3);
        break;
      case QUALITY.Magic:
        item.prefix = reader.read(11);
        item.suffix = reader.read(11);
        break;
      case QUALITY.Set:
        item.setId = reader.read(12);
        break;
      case QUALITY.Unique:
        item.uniqueId = reader.read(12);
        break;
      case QUALITY.Rare:
      case QUALITY.Crafted:
        item.rareName1 = reader.read(8);
        item.rareName2 = reader.read(8);
        item.rareAffixes = [];
        for (let i = 0; i < 6; i++) {
          const has = reader.read(1);
          item.rareAffixes.push(has ? reader.read(11) : null);
        }
        break;
      default:
        break;
    }
    if (item.runeword) {
      item.runewordId = reader.read(12);
      reader.read(4);
    }
    if (item.personalized) {
      let pname = "";
      for (let i = 0; i < 16; i++) {
        const c = reader.read(7);
        if (!c) break;
        pname += String.fromCharCode(c);
      }
      item.personalizedName = pname;
    }
    if (item.code === "tbk" || item.code === "ibk") reader.read(5);
    item.timestamp = reader.read(1);
    if (info.k === "a") {
      const def = MAG[31] || { sB: 11, sA: 10 };
      item.defense = reader.read(def.sB) - (def.sA || 0);
    }
    if (info.k === "a" || info.k === "w") {
      const maxd = MAG[73] || { sB: 8, sA: 0 };
      const curd = MAG[72] || { sB: 9, sA: 0 };
      item.maxDur = reader.read(maxd.sB) - (maxd.sA || 0);
      if (item.maxDur > 0) item.dur = reader.read(curd.sB) - (curd.sA || 0);
    }
    if (info.s) {
      item.quantityBit = reader.bitOffset();
      item.quantity = reader.read(9);
    }
    item.socketsBit = reader.bitOffset();
    if (item.socketed) item.sockets = reader.read(4);
    let setFlags = 0;
    if (item.quality === QUALITY.Set) {
      setFlags = reader.read(5);
      item.setFlags = setFlags;
    }
    item.mods = readMagic(reader);
    while (setFlags) {
      if (setFlags & 1) item.mods = item.mods.concat(readMagic(reader));
      setFlags >>>= 1;
    }
    if (item.runeword) item.runewordMods = readMagic(reader);
  }

  function parseItemList(bytes, start) {
    if (ascii(bytes, start, 2) !== "JM") throw new Error("Item list JM not found at " + start);
    const count = u16(bytes, start + 2);
    const items = [];
    const warnings = [];
    let off = start + 4;
    for (let i = 0; i < count; i++) {
      if (off + 2 > bytes.length) {
        warnings.push("File ended after " + items.length + " of " + count + " items");
        break;
      }
      if (ascii(bytes, off, 2) !== "JM" || !looksLikeItem(bytes, off)) {
        const next = findNextItem(bytes, ascii(bytes, off, 2) === "JM" ? off + 2 : off);
        if (next < 0) {
          warnings.push("Item header JM not found at " + off + " (" + (count - items.length) + " unread)");
          break;
        }
        if (next !== off) warnings.push("Re-synced item list at " + next + " (skipped " + (next - off) + " bytes @ " + off + ")");
        off = next;
      }
      try {
        const item = parseItem(bytes, off);
        const size = item.raw && item.raw.length ? item.raw.length : 0;
        if (!size) {
          warnings.push("Zero-length item at " + off);
          const next = findNextItem(bytes, off + 2);
          if (next < 0) break;
          off = next;
          continue;
        }
        items.push(item);
        off += size;
      } catch (err) {
        warnings.push((err.message || String(err)) + " (item " + (i + 1) + "/" + count + ")");
        const next = findNextItem(bytes, off + 2);
        if (next < 0) break;
        off = next;
      }
    }
    return { items, start, end: off, count, warnings };
  }

  function writeItemList(items) {
    const chunks = [new Uint8Array([0x4a, 0x4d, items.length & 0xff, (items.length >> 8) & 0xff])];
    let total = 4;
    for (const item of items) {
      chunks.push(item.raw);
      total += item.raw.length;
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  function parseCharSection(bytes, jmOff) {
    const player = parseItemList(bytes, jmOff);
    let off = player.end;
    const warnings = player.warnings ? player.warnings.slice() : [];
    if (ascii(bytes, off, 2) !== "JM") {
      const next = findSectionMarker(bytes, off);
      if (next < 0 || ascii(bytes, next, 2) !== "JM") {
        warnings.push("Corpse JM not found at " + off);
        return {
          player: player.items,
          corpse: [],
          corpseCount: 0,
          corpseExtra: new Uint8Array(0),
          merc: [],
          hasMerc: false,
          golem: null,
          warnings,
          pd2Tail: bytes.slice(off),
        };
      }
      warnings.push("Re-synced corpse list at " + next + " (from " + off + ")");
      off = next;
    }
    const corpseCount = u16(bytes, off + 2);
    off += 4;
    let corpseExtra = new Uint8Array(0);
    let corpse = { items: [], start: 0, end: 0, count: 0 };
    if (corpseCount) {
      corpseExtra = bytes.slice(off, off + 12);
      off += 12;
      corpse = parseItemList(bytes, off);
      off = corpse.end;
      if (corpse.warnings && corpse.warnings.length) warnings.push.apply(warnings, corpse.warnings);
    }
    let merc = { items: [] };
    let hasMerc = false;
    if (ascii(bytes, off, 2) !== "jf") {
      for (let i = off; i < bytes.length - 1; i++) {
        if (bytes[i] === 0x6a && bytes[i + 1] === 0x66) {
          warnings.push("Re-synced merc marker at " + i + " (from " + off + ")");
          off = i;
          break;
        }
      }
    }
    if (ascii(bytes, off, 2) === "jf") {
      off += 2;
      if (ascii(bytes, off, 2) === "JM") {
        hasMerc = true;
        merc = parseItemList(bytes, off);
        off = merc.end;
        if (merc.warnings && merc.warnings.length) warnings.push.apply(warnings, merc.warnings);
      }
    }
    if (ascii(bytes, off, 2) !== "kf") {
      for (let i = off; i < bytes.length - 1; i++) {
        if (bytes[i] === 0x6b && bytes[i + 1] === 0x66) {
          warnings.push("Re-synced golem marker at " + i + " (from " + off + ")");
          off = i;
          break;
        }
      }
    }
    if (ascii(bytes, off, 2) !== "kf") {
      warnings.push("Golem kf not found at " + off);
      return {
        player: player.items,
        corpse: corpse.items,
        corpseCount,
        corpseExtra,
        merc: merc.items,
        hasMerc,
        golem: null,
        warnings,
        pd2Tail: bytes.slice(off),
      };
    }
    off += 2;
    const hasGolem = bytes[off];
    off += 1;
    let golem = null;
    if (hasGolem) {
      try {
        golem = parseItem(bytes, off);
        off += golem.raw.length;
      } catch (err) {
        warnings.push("Golem: " + (err.message || err));
      }
    }
    return {
      player: player.items,
      corpse: corpse.items,
      corpseCount,
      corpseExtra,
      merc: merc.items,
      hasMerc,
      golem,
      warnings,
      pd2Tail: bytes.slice(off),
    };
  }

  function writeCharSection(section) {
    const parts = [writeItemList(section.player || [])];
    const corpseCount = section.corpseCount || 0;
    const corpseHead = new Uint8Array(4);
    corpseHead[0] = 0x4a;
    corpseHead[1] = 0x4d;
    setU16(corpseHead, 2, corpseCount);
    parts.push(corpseHead);
    if (corpseCount) {
      parts.push(section.corpseExtra && section.corpseExtra.length ? section.corpseExtra : new Uint8Array(12));
      parts.push(writeItemList(section.corpse || []));
    }
    parts.push(new Uint8Array([0x6a, 0x66])); // jf
    if (section.hasMerc) parts.push(writeItemList(section.merc || []));
    parts.push(new Uint8Array([0x6b, 0x66, section.golem ? 1 : 0])); // kf + flag
    if (section.golem) parts.push(section.golem.raw);
    if (section.pd2Tail && section.pd2Tail.length) parts.push(section.pd2Tail);
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  function d2Checksum(bytes) {
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = i >= 12 && i < 16 ? 0 : bytes[i];
      sum = ((sum << 1) | (sum >>> 31)) + b;
      sum >>>= 0;
    }
    return sum;
  }

  function applyChecksum(bytes) {
    setU32(bytes, 8, bytes.length);
    bytes[12] = bytes[13] = bytes[14] = bytes[15] = 0;
    setU32(bytes, 12, d2Checksum(bytes));
    return bytes;
  }

  function parseStash(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < STASH_HEADER + 4) throw new Error("File is too small to be a PD2 shared stash");
    if (!(bytes[0] === 0x55 && bytes[1] === 0xbb && bytes[2] === 0x55 && bytes[3] === 0xbb)) {
      throw new Error("Not a PD2 shared stash (missing 55 BB 55 BB header)");
    }
    if (ascii(bytes, STASH_HEADER, 2) !== "JM") throw new Error("Shared stash item list not found at offset 302");
    const list = parseItemList(bytes, STASH_HEADER);
    return {
      bytes,
      header: bytes.slice(0, STASH_HEADER),
      items: list.items,
      goldHint: u32(bytes, 0x12),
      warnings: list.warnings || [],
    };
  }

  function writeStash(parsed) {
    const list = writeItemList(parsed.items || []);
    const out = new Uint8Array(STASH_HEADER + list.length);
    out.set(parsed.header, 0);
    out.set(list, STASH_HEADER);
    out[0] = STASH_MAGIC[0];
    out[1] = STASH_MAGIC[1];
    out[2] = STASH_MAGIC[2];
    out[3] = STASH_MAGIC[3];
    return applyChecksum(out);
  }

  function emptyStash() {
    const header = new Uint8Array(STASH_HEADER);
    header[0] = 0x55;
    header[1] = 0xbb;
    header[2] = 0x55;
    header[3] = 0xbb;
    header[4] = 2;
    header[16] = 0x73; // st
    header[17] = 0x74;
    header[80] = 0x63; // cu
    header[81] = 0x75;
    return { header, items: [] };
  }

  function applyPlacement(item, place) {
    const raw = Uint8Array.from(item.raw);
    if (place.location != null) {
      item.location = place.location;
      setBits(raw, 58, 3, place.location);
    }
    if (place.equipped != null) {
      item.equipped = place.equipped;
      setBits(raw, 61, 4, place.equipped);
    }
    if (place.x != null) {
      item.x = place.x;
      setBits(raw, 65, 4, place.x);
    }
    if (place.y != null) {
      item.y = place.y;
      setBits(raw, 69, 4, place.y);
    }
    if (place.panel != null) {
      item.panel = place.panel;
      setBits(raw, 73, 3, place.panel);
    }
    item.raw = raw;
    return item;
  }

  function insertBits(bytes, bitOff, nBits, value) {
    const reader = bitReader(bytes, 0);
    const writer = bitWriter();
    const total = bytes.length * 8;
    for (let i = 0; i < bitOff; i++) writer.write(reader.read(1), 1);
    writer.write(value >>> 0, nBits);
    for (let i = bitOff; i < total; i++) writer.write(reader.read(1), 1);
    return Uint8Array.from(writer.finish());
  }

  function deleteBits(bytes, bitOff, nBits) {
    const reader = bitReader(bytes, 0);
    const writer = bitWriter();
    const total = bytes.length * 8;
    for (let i = 0; i < bitOff; i++) writer.write(reader.read(1), 1);
    for (let i = 0; i < nBits; i++) reader.read(1);
    for (let i = bitOff + nBits; i < total; i++) writer.write(reader.read(1), 1);
    return Uint8Array.from(writer.finish());
  }

  const SOCKETED_BIT = 27;
  const ETHEREAL_BIT = 38;

  function parentPrefix(item) {
    const children = item.socketedItems || [];
    const childLen = children.reduce((n, c) => n + c.raw.length, 0);
    if (!childLen) return { prefix: Uint8Array.from(item.raw), children };
    return { prefix: Uint8Array.from(item.raw.subarray(0, item.raw.length - childLen)), children };
  }

  function joinRaw(prefix, children) {
    if (!children || !children.length) return prefix;
    const total = prefix.length + children.reduce((n, c) => n + c.raw.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    out.set(prefix, o);
    o += prefix.length;
    for (const child of children) {
      out.set(child.raw, o);
      o += child.raw.length;
    }
    return out;
  }

  function filledSockets(item) {
    if (item.socketedItems && item.socketedItems.length) return item.socketedItems.length;
    return item.socketedCount || 0;
  }

  function setEthereal(item, on) {
    if (item.simple || item.ear) throw new Error("Runes, gems, and other simple items cannot be ethereal");
    const raw = Uint8Array.from(item.raw);
    item.ethereal = on ? 1 : 0;
    setBits(raw, ETHEREAL_BIT, 1, item.ethereal);
    item.raw = raw;
    return item;
  }

  function setSockets(item, count) {
    if (item.simple || item.ear) throw new Error("Runes, gems, and other simple items cannot have sockets");
    if (item.socketsBit == null) throw new Error("Could not find the socket field on this item");
    if (item.runeword) throw new Error("Won't change sockets on a runeword");
    const n = Math.max(0, Math.min(6, Number(count)));
    if (!Number.isFinite(n)) throw new Error("Socket count must be 0–6");
    const filled = filledSockets(item);
    if (n < filled) throw new Error("This item already has " + filled + " gem" + (filled === 1 ? "" : "s") + " in it");
    const was = item.socketed ? item.sockets || 0 : 0;
    if (n === was) return item;
    const { prefix, children } = parentPrefix(item);
    let nextPrefix = prefix;
    if (!item.socketed && n > 0) {
      setBits(nextPrefix, SOCKETED_BIT, 1, 1);
      nextPrefix = insertBits(nextPrefix, item.socketsBit, 4, n);
      item.socketed = 1;
    } else if (item.socketed && n === 0) {
      nextPrefix = deleteBits(nextPrefix, item.socketsBit, 4);
      setBits(nextPrefix, SOCKETED_BIT, 1, 0);
      item.socketed = 0;
    } else {
      setBits(nextPrefix, item.socketsBit, 4, n);
    }
    if (n) item.sockets = n;
    else delete item.sockets;
    item.raw = joinRaw(nextPrefix, children);
    return item;
  }

  function setIdentified(item, on) {
    const raw = Uint8Array.from(item.raw);
    item.identified = on ? 1 : 0;
    setBits(raw, 20, 1, item.identified);
    item.raw = raw;
  }

  function setQuantity(item, qty) {
    if (item.quantityBit == null) throw new Error("This item has no quantity field");
    const raw = Uint8Array.from(item.raw);
    const n = Math.max(1, Math.min(511, Number(qty) || 1));
    item.quantity = n;
    setBits(raw, item.quantityBit, 9, n);
    item.raw = raw;
  }

  function writeItemHead(w, code, place, flags) {
    w.writeStr("JM");
    w.write(0, 4);
    w.write(1, 1); // identified
    w.write(0, 6);
    w.write(flags.socketed ? 1 : 0, 1);
    w.write(0, 1);
    w.write(0, 1); // new
    w.write(0, 2);
    w.write(0, 1); // ear
    w.write(0, 1); // starter
    w.write(0, 3);
    w.write(flags.simple ? 1 : 0, 1);
    w.write(flags.ethereal ? 1 : 0, 1);
    w.write(1, 1); // always 1
    w.write(0, 1);
    w.write(0, 1);
    w.write(0, 1);
    w.write(0, 5);
    w.write(101, 10); // version
    w.write(place.location || 0, 3);
    w.write(place.equipped || 0, 4);
    w.write(place.x || 0, 4);
    w.write(place.y || 0, 4);
    w.write(place.panel || 1, 3);
    const padded = (code + "    ").slice(0, 4);
    for (let i = 0; i < 4; i++) w.write(padded.charCodeAt(i), 8);
  }

  function spawnItem(code, place, opts) {
    opts = opts || {};
    place = place || {};
    if (!ITEMS[code]) {
      ITEMS[code] = { n: code, k: "a", w: 2, h: 2 };
    }
    const info = itemInfo(code);
    if (info.c) {
      const w = bitWriter();
      writeItemHead(w, code, place, { simple: 1, socketed: 0, ethereal: 0 });
      w.write(0, 1); // sockets filled
      return parseItem(w.finish(), 0);
    }
    const sockets = Math.max(0, Math.min(6, Number(opts.sockets) || 0));
    const ethereal = opts.ethereal ? 1 : 0;
    const quality = opts.quality || QUALITY.Normal;
    const ilvl = Math.max(1, Math.min(127, Number(opts.ilvl) || 99));
    const mods = opts.mods || [];
    const w = bitWriter();
    writeItemHead(w, code, place, { simple: 0, socketed: sockets > 0, ethereal });
    if (info.q) {
      const q = MAG[356] || { sB: 2, sA: 0 };
      w.write(q.sA || 0, q.sB);
      w.write(0, 1);
    } else {
      w.write(0, 3);
    }
    w.write((Math.random() * 0xffffffff) >>> 0, 32);
    w.write(ilvl, 7);
    w.write(quality, 4);
    w.write(0, 1); // multi
    w.write(0, 1); // class spec
    if (quality === QUALITY.Low) w.write(0, 3);
    else if (quality === QUALITY.Superior) w.write(0, 3);
    else if (quality === QUALITY.Magic) {
      w.write(0, 11);
      w.write(0, 11);
    } else if (quality === QUALITY.Set) w.write(opts.setId || 0, 12);
    else if (quality === QUALITY.Unique) w.write(opts.uniqueId || 0, 12);
    else if (quality === QUALITY.Rare || quality === QUALITY.Crafted) {
      w.write(0, 8);
      w.write(0, 8);
      for (let i = 0; i < 6; i++) w.write(0, 1);
    }
    if (code === "tbk" || code === "ibk") w.write(code === "ibk" ? 1 : 0, 5);
    w.write(0, 1); // timestamp
    if (info.k === "a") {
      const def = MAG[31] || { sB: 11, sA: 10 };
      let ac = Number(info.ac) || 10;
      if (ethereal) ac = Math.floor(ac * 1.5);
      w.write(ac + (def.sA || 0), def.sB);
    }
    if (info.k === "a" || info.k === "w") {
      const maxd = MAG[73] || { sB: 8, sA: 0 };
      const curd = MAG[72] || { sB: 9, sA: 0 };
      let maxDur = opts.indestruct || info.nd ? 0 : Number(info.dur) || 0;
      if (maxDur && ethereal) maxDur = maxDur - Math.ceil(maxDur / 2) + 1;
      w.write(maxDur + (maxd.sA || 0), maxd.sB);
      if (maxDur > 0) w.write(maxDur + (curd.sA || 0), curd.sB);
    }
    if (info.s) w.write(place.quantity || opts.quantity || 1, 9);
    if (sockets) w.write(sockets, 4);
    writeMagic(w, mods);
    const item = parseItem(w.finish(), 0);
    if (item.parseError) throw new Error("Spawned item failed to parse: " + item.parseError);
    return item;
  }

  function overwriteItem(dst, src) {
    for (const k of Object.keys(dst)) delete dst[k];
    Object.assign(dst, src);
    return dst;
  }

  function sanitizeParsedItem(item) {
    if (!item || !item.parseError) return item;
    item.version = 101;
    const info = item.info || itemInfo(item.code);
    const ac = Number(info.ac) || 0;
    const dur = Number(info.dur) || 0;
    if (info.k === "a" && item.quality !== QUALITY.Unique && item.quality !== QUALITY.Set) {
      let base = ac;
      if (item.ethereal) base = Math.floor(base * 1.5);
      if (item.defense == null || item.defense < 0 || (ac && item.defense > base + 80)) item.defense = base;
    }
    if ((info.k === "a" || info.k === "w") && dur && item.quality !== QUALITY.Unique && item.quality !== QUALITY.Set) {
      let maxD = dur;
      if (item.ethereal) maxD = maxD - Math.ceil(maxD / 2) + 1;
      if (item.maxDur == null || item.maxDur < 0 || item.maxDur > maxD + 40) {
        item.maxDur = maxD;
        item.dur = maxD;
      }
    }
    delete item.parseError;
    return item;
  }

  function serializeItem(item) {
    if (!item || item.simple || item.ear) throw new Error("This item cannot have affixes");
    sanitizeParsedItem(item);
    const info = item.info || itemInfo(item.code);
    const w = bitWriter();
    w.writeStr("JM");
    w.write(item.flagsLo || 0, 4);
    w.write(item.identified ? 1 : 0, 1);
    w.write(item.flagsMid || 0, 6);
    w.write(item.socketed ? 1 : 0, 1);
    w.write(item.flag12 || 0, 1);
    w.write(item.isNew ? 1 : 0, 1);
    w.write(item.flags14 || 0, 2);
    w.write(0, 1);
    w.write(item.starter ? 1 : 0, 1);
    w.write(item.flags18 || 0, 3);
    w.write(0, 1);
    w.write(item.ethereal ? 1 : 0, 1);
    w.write(item.flag23 != null ? item.flag23 : 1, 1);
    w.write(item.personalized ? 1 : 0, 1);
    w.write(item.flag25 || 0, 1);
    w.write(item.runeword ? 1 : 0, 1);
    w.write(item.flags27 || 0, 5);
    w.write(item.version || 101, 10);
    w.write(item.location || 0, 3);
    w.write(item.equipped || 0, 4);
    w.write(item.x || 0, 4);
    w.write(item.y || 0, 4);
    w.write(item.panel || 0, 3);
    const padded = ((item.code || "") + "    ").slice(0, 4);
    for (let i = 0; i < 4; i++) w.write(padded.charCodeAt(i), 8);
    const filled = filledSockets(item);
    if (info.q) {
      const q = MAG[356] || { sB: 2, sA: 0 };
      w.write((item.questDiff || 0) + (q.sA || 0), q.sB);
      w.write(filled ? 1 : 0, 1);
    } else {
      w.write(filled, 3);
    }
    w.write((item.uid || 0) >>> 0, 32);
    w.write(Math.max(1, Math.min(127, item.ilvl || 99)), 7);
    const quality = item.quality || QUALITY.Normal;
    w.write(quality, 4);
    w.write(item.multiPic ? 1 : 0, 1);
    if (item.multiPic) w.write(item.pictureId || 0, 3);
    w.write(item.classSpec ? 1 : 0, 1);
    if (item.classSpec) w.write(item.autoAffix || 0, 11);
    if (quality === QUALITY.Low) w.write(item.lowQuality || 0, 3);
    else if (quality === QUALITY.Superior) w.write(item.superior || 0, 3);
    else if (quality === QUALITY.Magic) {
      w.write(item.prefix || 0, 11);
      w.write(item.suffix || 0, 11);
    } else if (quality === QUALITY.Set) w.write(item.setId || 0, 12);
    else if (quality === QUALITY.Unique) w.write(item.uniqueId || 0, 12);
    else if (quality === QUALITY.Rare || quality === QUALITY.Crafted) {
      w.write(item.rareName1 || 1, 8);
      w.write(item.rareName2 || 1, 8);
      const aff = item.rareAffixes || [];
      for (let i = 0; i < 6; i++) {
        if (aff[i]) {
          w.write(1, 1);
          w.write(aff[i], 11);
        } else w.write(0, 1);
      }
    }
    if (item.runeword) {
      w.write(item.runewordId || 0, 12);
      w.write(0, 4);
    }
    if (item.personalized) {
      const name = String(item.personalizedName || "");
      for (let i = 0; i < 16; i++) {
        const c = i < name.length ? name.charCodeAt(i) & 127 : 0;
        w.write(c, 7);
        if (!c) break;
      }
    }
    if (item.code === "tbk" || item.code === "ibk") w.write(item.code === "ibk" ? 1 : 0, 5);
    w.write(item.timestamp ? 1 : 0, 1);
    if (info.k === "a") {
      const def = MAG[31] || { sB: 11, sA: 10 };
      w.write((item.defense != null ? item.defense : Number(info.ac) || 10) + (def.sA || 0), def.sB);
    }
    if (info.k === "a" || info.k === "w") {
      const maxd = MAG[73] || { sB: 8, sA: 0 };
      const curd = MAG[72] || { sB: 9, sA: 0 };
      const maxDur = item.maxDur != null ? item.maxDur : Number(info.dur) || 0;
      w.write(maxDur + (maxd.sA || 0), maxd.sB);
      if (maxDur > 0) w.write((item.dur != null ? item.dur : maxDur) + (curd.sA || 0), curd.sB);
    }
    if (info.s) w.write(item.quantity || 1, 9);
    if (item.socketed) w.write(item.sockets || 0, 4);
    if (quality === QUALITY.Set) w.write(0, 5);
    writeMagic(w, item.mods || []);
    if (item.runeword) writeMagic(w, item.runewordMods || []);
    const parent = w.finish();
    const next = parseItem(joinRaw(parent, item.socketedItems || []), 0);
    if (next.parseError) throw new Error("Rewritten item failed to parse: " + next.parseError);
    return next;
  }

  function rewriteItem(item) {
    return overwriteItem(item, serializeItem(item));
  }

  const typeAncCache = new Map();
  function typeAncestors(code) {
    if (typeAncCache.has(code)) return typeAncCache.get(code);
    const seen = new Set();
    function walk(c) {
      if (!c || seen.has(c)) return;
      seen.add(c);
      for (const p of (AFF.TYPES && AFF.TYPES[c]) || []) walk(p);
    }
    walk(code);
    typeAncCache.set(code, seen);
    return seen;
  }

  function itemTypeSet(item) {
    const have = new Set();
    for (const t of (AFF.ITEMT && item && AFF.ITEMT[item.code]) || []) {
      for (const a of typeAncestors(t)) have.add(a);
    }
    return have;
  }

  function affixFits(affix, item) {
    if (!affix || !item) return true;
    const have = itemTypeSet(item);
    if (!have.size) return true;
    if ((affix.e || []).some((t) => have.has(t))) return false;
    const itype = affix.t || [];
    if (!itype.length) return true;
    return itype.some((t) => have.has(t));
  }

  function affixList(kind) {
    return kind === "suffix" ? AFF.SUFFIX || [] : AFF.PREFIX || [];
  }

  function findAffix(kind, id) {
    const n = Number(id) || 0;
    if (!n) return null;
    return affixList(kind).find((a) => a.i === n) || null;
  }

  function affixName(kind, id) {
    const a = findAffix(kind, id);
    return a ? a.n : "";
  }

  function affixLabel(kind, id) {
    const a = findAffix(kind, id);
    if (!a) return "";
    return a.d || a.n;
  }

  function rareName(kind, id) {
    const list = kind === "suffix" ? AFF.RARE_S : AFF.RARE_P;
    return (list && list[id]) || "";
  }

  function mergeModLists(lists) {
    const byId = new Map();
    for (const list of lists) {
      for (const m of list || []) {
        const vals = (m.v || m.values || []).slice();
        const prev = byId.get(m.id);
        if (!prev) byId.set(m.id, { id: m.id, values: vals });
        else {
          for (let i = 0; i < vals.length; i++) prev.values[i] = (prev.values[i] || 0) + (vals[i] || 0);
        }
      }
    }
    return [...byId.values()];
  }

  function subtractMods(base, extra) {
    const byId = new Map((base || []).map((m) => [m.id, { id: m.id, values: (m.values || m.v || []).slice() }]));
    for (const m of extra || []) {
      const prev = byId.get(m.id);
      if (!prev) continue;
      const vals = m.v || m.values || [];
      for (let i = 0; i < vals.length; i++) prev.values[i] = (prev.values[i] || 0) - (vals[i] || 0);
      if (prev.values.every((v) => !v)) byId.delete(m.id);
    }
    return [...byId.values()];
  }

  function affixMods(kind, id) {
    const a = findAffix(kind, id);
    return a && a.m ? a.m.map((m) => ({ id: m.id, values: (m.v || []).slice() })) : [];
  }

  function padRare(arr) {
    const out = (arr || []).slice(0, 6);
    while (out.length < 6) out.push(null);
    return out;
  }

  function rareFromMagic(item) {
    const aff = [item.prefix || null, item.suffix || null, null, null, null, null];
    item.quality = QUALITY.Rare;
    item.rareName1 = item.rareName1 || 1;
    item.rareName2 = item.rareName2 || 1;
    item.rareAffixes = aff;
    delete item.prefix;
    delete item.suffix;
    return aff;
  }

  function rebuildAffixMods(item) {
    if (item.quality === QUALITY.Magic) {
      item.mods = mergeModLists([affixMods("prefix", item.prefix), affixMods("suffix", item.suffix)]);
      return;
    }
    if (item.quality === QUALITY.Rare || item.quality === QUALITY.Crafted) {
      const aff = padRare(item.rareAffixes);
      const lists = [];
      for (let i = 0; i < 6; i++) {
        if (!aff[i]) continue;
        lists.push(affixMods(i % 2 === 0 ? "prefix" : "suffix", aff[i]));
      }
      item.mods = mergeModLists(lists);
    }
  }

  function itemAffixSlots(item) {
    const prefixes = [];
    const suffixes = [];
    if (!item || item.simple || item.ear) return { prefixes, suffixes, mode: "none" };
    if (item.quality === QUALITY.Magic) {
      if (item.prefix) prefixes.push({ id: item.prefix, name: affixLabel("prefix", item.prefix), kind: "prefix", slot: 0 });
      if (item.suffix) suffixes.push({ id: item.suffix, name: affixLabel("suffix", item.suffix), kind: "suffix", slot: 1 });
      return { prefixes, suffixes, mode: "magic" };
    }
    if (item.quality === QUALITY.Rare || item.quality === QUALITY.Crafted) {
      const aff = padRare(item.rareAffixes);
      for (let i = 0; i < 6; i++) {
        if (!aff[i]) continue;
        const kind = i % 2 === 0 ? "prefix" : "suffix";
        const rec = { id: aff[i], name: affixLabel(kind, aff[i]), kind, slot: i };
        if (kind === "prefix") prefixes.push(rec);
        else suffixes.push(rec);
      }
      return { prefixes, suffixes, mode: "rare" };
    }
    if (item.quality === QUALITY.Unique || item.quality === QUALITY.Set) {
      for (const e of item.extraAffixes || []) {
        const rec = { id: e.id, name: affixLabel(e.kind, e.id), kind: e.kind, slot: e.id };
        if (e.kind === "prefix") prefixes.push(rec);
        else suffixes.push(rec);
      }
      return { prefixes, suffixes, mode: "extra" };
    }
    return { prefixes, suffixes, mode: "magic" };
  }

  function canEditAffixes(item) {
    return !!(item && !item.simple && !item.ear);
  }

  function listAffixes(kind, item, opts) {
    const q = String((opts && opts.query) || "").trim().toLowerCase();
    const fitOnly = !opts || opts.fit !== false;
    const out = [];
    for (const a of affixList(kind)) {
      if (q && !(a.s || "").includes(q) && !(a.n || "").toLowerCase().includes(q)) continue;
      if (fitOnly && item && !affixFits(a, item)) continue;
      out.push(a);
    }
    out.sort((a, b) => (a.d || a.n).localeCompare(b.d || b.n) || a.n.localeCompare(b.n) || a.i - b.i);
    return out;
  }

  function searchAffixes(query, kind, item, opts) {
    return listAffixes(kind, item, { query, fit: !opts || opts.fit !== false }).slice(0, 40);
  }

  function affixSlotIds(item) {
    const prefixes = [0, 0, 0];
    const suffixes = [0, 0, 0];
    if (!item) return { prefixes, suffixes };
    if (item.quality === QUALITY.Magic) {
      prefixes[0] = item.prefix || 0;
      suffixes[0] = item.suffix || 0;
    } else if (item.quality === QUALITY.Rare || item.quality === QUALITY.Crafted) {
      const aff = padRare(item.rareAffixes);
      prefixes[0] = aff[0] || 0;
      suffixes[0] = aff[1] || 0;
      prefixes[1] = aff[2] || 0;
      suffixes[1] = aff[3] || 0;
      prefixes[2] = aff[4] || 0;
      suffixes[2] = aff[5] || 0;
    }
    return { prefixes, suffixes };
  }

  function setAffixSlot(item, kind, index, id) {
    if (!canEditAffixes(item)) throw new Error("Select a real item first");
    if (item.runeword) throw new Error("Won't change affixes on a runeword");
    if (item.quality === QUALITY.Unique || item.quality === QUALITY.Set) {
      throw new Error("Use the affix search to add extra mods to uniques");
    }
    index = Math.max(0, Math.min(2, Number(index) || 0));
    id = Number(id) || 0;
    if (id && !findAffix(kind, id)) throw new Error("Unknown affix");
    item.identified = 1;
    const stayMagic = index === 0 && item.quality !== QUALITY.Rare && item.quality !== QUALITY.Crafted;
    if (stayMagic) {
      if (item.quality !== QUALITY.Magic) {
        item.quality = QUALITY.Magic;
        item.prefix = 0;
        item.suffix = 0;
      }
      if (kind === "prefix") item.prefix = id;
      else item.suffix = id;
    } else {
      if (item.quality === QUALITY.Magic) rareFromMagic(item);
      else if (item.quality !== QUALITY.Rare && item.quality !== QUALITY.Crafted) {
        item.quality = QUALITY.Rare;
        item.rareName1 = item.rareName1 || 1;
        item.rareName2 = item.rareName2 || 1;
        item.rareAffixes = padRare([]);
      }
      const aff = padRare(item.rareAffixes);
      aff[kind === "prefix" ? index * 2 : index * 2 + 1] = id || null;
      item.rareAffixes = aff;
    }
    rebuildAffixMods(item);
    return rewriteItem(item);
  }

  function addAffix(item, kind, id) {
    if (!canEditAffixes(item)) throw new Error("Select a real item first");
    if (item.runeword) throw new Error("Won't change affixes on a runeword");
    const affix = findAffix(kind, id);
    if (!affix) throw new Error("Unknown affix");
    item.identified = 1;
    if (item.quality === QUALITY.Unique || item.quality === QUALITY.Set) {
      const extras = (item.extraAffixes || []).concat([{ kind, id: affix.i }]);
      item.mods = mergeModLists([item.mods, affixMods(kind, id)]);
      rewriteItem(item);
      item.extraAffixes = extras;
      return item;
    }
    if (item.quality !== QUALITY.Magic && item.quality !== QUALITY.Rare && item.quality !== QUALITY.Crafted) {
      item.quality = QUALITY.Magic;
      item.prefix = 0;
      item.suffix = 0;
    }
    if (item.quality === QUALITY.Magic) {
      if (kind === "prefix" && item.prefix) rareFromMagic(item);
      else if (kind === "suffix" && item.suffix) rareFromMagic(item);
    }
    if (item.quality === QUALITY.Magic) {
      if (kind === "prefix") item.prefix = affix.i;
      else item.suffix = affix.i;
    } else {
      const aff = padRare(item.rareAffixes);
      const start = kind === "prefix" ? 0 : 1;
      let slot = -1;
      for (let i = start; i < 6; i += 2) {
        if (!aff[i]) {
          slot = i;
          break;
        }
      }
      if (slot < 0) throw new Error("This item already has 3 " + (kind === "prefix" ? "prefixes" : "suffixes"));
      aff[slot] = affix.i;
      item.rareAffixes = aff;
    }
    rebuildAffixMods(item);
    return rewriteItem(item);
  }

  function removeAffix(item, kind, slot) {
    if (!canEditAffixes(item)) throw new Error("Select a real item first");
    if (item.runeword) throw new Error("Won't change affixes on a runeword");
    if (item.quality === QUALITY.Unique || item.quality === QUALITY.Set) {
      const extras = (item.extraAffixes || []).filter((e) => !(e.kind === kind && e.id === slot));
      item.mods = subtractMods(item.mods, affixMods(kind, slot));
      rewriteItem(item);
      item.extraAffixes = extras;
      return item;
    }
    if (item.quality === QUALITY.Magic) {
      if (kind === "prefix") item.prefix = 0;
      else item.suffix = 0;
    } else if (item.quality === QUALITY.Rare || item.quality === QUALITY.Crafted) {
      const aff = padRare(item.rareAffixes);
      aff[slot] = null;
      item.rareAffixes = aff;
    }
    rebuildAffixMods(item);
    return rewriteItem(item);
  }

  function spawnSimple(code, place) {
    return spawnItem(code, place, { quantity: place && place.quantity });
  }

  function uniqueById(id) {
    const list = DB.UNIQUES || [];
    return list.find((u) => u.i === id) || null;
  }

  function spawnUnique(id, place, opts) {
    const u = uniqueById(id);
    if (!u) throw new Error("Unknown unique id " + id);
    const extra = opts || {};
    const info = itemInfo(u.c);
    return spawnItem(u.c, place, {
      quality: QUALITY.Unique,
      uniqueId: u.i,
      mods: (u.m || []).map((m) => ({ id: m.id, values: m.v })),
      sockets: extra.sockets != null && extra.sockets !== "" ? extra.sockets : u.s || 0,
      ethereal: extra.ethereal || !!u.e,
      indestruct: !!u.d,
      ilvl: extra.ilvl || 99,
      quantity: (place && place.quantity) || (info.s ? 60 : undefined),
    });
  }

  const MISC_BASES = { rin: 1, amu: 1, jew: 1, cm1: 1, cm2: 1, cm3: 1, cm4: 1 };

  function isSpawnBase(code, info) {
    if (!info || info.c || info.q) return false;
    if (info.k === "a" || info.k === "w") return true;
    return !!MISC_BASES[code];
  }

  function spawnCatalog(query, kind) {
    const q = String(query || "").trim().toLowerCase();
    const out = [];
    if (kind !== "unique") {
      for (const code of Object.keys(ITEMS)) {
        const info = ITEMS[code];
        if (!isSpawnBase(code, info)) continue;
        if (q && !(info.n + " " + code).toLowerCase().includes(q)) continue;
        out.push({ kind: "base", code, name: info.n, w: info.w, h: info.h });
      }
    }
    if (kind !== "base") {
      for (const u of DB.UNIQUES || []) {
        const base = ITEMS[u.c];
        const hay = (u.n + " " + u.c + " " + ((base && base.n) || "")).toLowerCase();
        if (q && !hay.includes(q)) continue;
        out.push({
          kind: "unique",
          id: u.i,
          code: u.c,
          name: u.n,
          base: base && base.n,
          w: (base && base.w) || 1,
          h: (base && base.h) || 1,
        });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function allUniques() {
    return DB.UNIQUES || [];
  }

  function uniqueKind(u) {
    const c = u && u.c;
    if (c === "rin" || c === "amu" || c === "jew" || /^cm[1-4]$/.test(c || "")) return "Jewelry";
    const info = ITEMS[c] || {};
    if (info.k === "w") return "Weapons";
    if (info.k === "a") return "Armor";
    return "Other";
  }

  function formatModLine(id, vals) {
    const rec = MAG[id];
    const name = rec && rec.s ? rec.s.replace(/^item_/, "").replace(/_/g, " ") : "stat " + id;
    const v = (vals || []).join(", ");
    return v ? name + "  " + v : name;
  }

  function formatUniqueMods(u) {
    return (u && u.m ? u.m : []).map((m) => formatModLine(m.id, m.v));
  }

  function itemFromRaw(raw) {
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    return parseItem(bytes, 0);
  }

  function grids() {
    return {
      inv: { w: 10, h: 4, panel: 1, location: 0, label: "Inventory" },
      cube: { w: 3, h: 4, panel: 4, location: 0, label: "Cube" },
      stash: { w: 6, h: 8, panel: 5, location: 0, label: "Personal stash" },
      shared: { w: 10, h: 16, panel: 6, location: 0, label: "Shared stash" },
      belt: { w: 16, h: 1, panel: 0, location: 2, label: "Belt" },
    };
  }

  function fitGrid(items, grid) {
    if (!grid || grid.equipped) return grid;
    let w = grid.w;
    let h = grid.h;
    for (const it of items || []) {
      if (!itemInGrid(it, grid)) continue;
      w = Math.max(w, (it.x || 0) + (it.info.w || 1));
      h = Math.max(h, (it.y || 0) + (it.info.h || 1));
    }
    return { ...grid, w: Math.min(16, w), h: Math.min(16, h) };
  }

  function itemInGrid(item, grid) {
    if (grid.location === 2) return item.location === 2;
    if (grid.location === 1) return item.location === 1;
    return item.location === 0 && item.panel === grid.panel;
  }

  function cellsUsed(item) {
    const w = item.info.w || 1;
    const h = item.info.h || 1;
    const cells = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push({ x: item.x + dx, y: item.y + dy });
    return cells;
  }

  function firstFit(items, grid, w, h) {
    grid = fitGrid(items, grid);
    const taken = new Set();
    for (const it of items) {
      if (!itemInGrid(it, grid)) continue;
      for (const c of cellsUsed(it)) taken.add(c.x + "," + c.y);
    }
    for (let y = 0; y <= grid.h - h; y++) {
      for (let x = 0; x <= grid.w - w; x++) {
        let ok = true;
        for (let dy = 0; dy < h && ok; dy++) {
          for (let dx = 0; dx < w; dx++) {
            if (taken.has(x + dx + "," + (y + dy))) {
              ok = false;
              break;
            }
          }
        }
        if (ok) return { x, y, location: grid.location, panel: grid.panel, equipped: 0 };
      }
    }
    return null;
  }

  function isCube(item) {
    return item && item.code === "box";
  }

  function findCube(parsed, stash) {
    const bags = [];
    if (parsed && parsed.items) {
      bags.push(parsed.items.player, parsed.items.corpse, parsed.items.merc);
      if (parsed.items.golem) bags.push([parsed.items.golem]);
    }
    if (stash && stash.items) bags.push(stash.items);
    for (const bag of bags) {
      const hit = (bag || []).find(isCube);
      if (hit) return hit;
    }
    return null;
  }

  function giveCube(parsed) {
    if (!parsed || !parsed.items) return { added: false, reason: "no-items" };
    if (findCube(parsed)) return { added: false, reason: "already" };
    const info = itemInfo("box");
    const w = info.w || 2;
    const h = info.h || 2;
    const tries = [grids().inv, grids().stash];
    for (const grid of tries) {
      const place = firstFit(parsed.items.player, grid, w, h);
      if (!place) continue;
      parsed.items.player.push(spawnItem("box", place, {}));
      return { added: true, place, label: grid.label };
    }
    return { added: false, reason: "no-space" };
  }

  function cloneItem(item) {
    if (!item || !item.raw) throw new Error("Nothing to duplicate");
    return rebuildClone(parseItem(Uint8Array.from(item.raw), 0));
  }

  function rebuildClone(item) {
    const children = (item.socketedItems || []).map(rebuildClone);
    const oldChildLen = (item.socketedItems || []).reduce((n, c) => n + c.raw.length, 0);
    const prefixLen = item.socketedItems && item.socketedItems.length ? item.raw.length - oldChildLen : item.raw.length;
    const prefix = Uint8Array.from(item.raw.subarray(0, prefixLen));
    if (item.uidBit != null) {
      const uid = (Math.random() * 0xffffffff) >>> 0;
      setBits(prefix, item.uidBit, 32, uid);
      item.uid = uid;
    }
    if (children.length) {
      const total = prefix.length + children.reduce((n, c) => n + c.raw.length, 0);
      const out = new Uint8Array(total);
      let o = 0;
      out.set(prefix, o);
      o += prefix.length;
      for (const child of children) {
        out.set(child.raw, o);
        o += child.raw.length;
      }
      item.raw = out;
      item.socketedItems = children;
    } else {
      item.raw = prefix;
    }
    return item;
  }

  function locationLabel(item, where) {
    if (where === "stash") return "Shared stash";
    if (where === "merc") return "Mercenary";
    if (where === "corpse") return "Corpse";
    if (item.location === 1) {
      const body = (DB.BODY || [])[item.equipped];
      return body ? "Equipped · " + body : "Equipped";
    }
    if (item.location === 2) return "Belt";
    if (item.panel === 4) return "Cube";
    if (item.panel === 5) return "Personal stash";
    if (item.panel === 1 || item.location === 0) return "Inventory";
    return "Other";
  }

  function viewForItem(item, where) {
    if (where === "stash") return "shared";
    if (item.location === 1) return "inv";
    if (item.location === 2) return "belt";
    if (item.panel === 4) return "cube";
    if (item.panel === 5) return "stash";
    return "inv";
  }

  function itemMatches(item, query, where) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const hay = [displayName(item), item.code, locationLabel(item, where), item.info && item.info.n]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function displayName(item) {
    const uniq = item.quality === QUALITY.Unique ? uniqueById(item.uniqueId) : null;
    let base = (uniq && uniq.n) || (item.info && item.info.n) || item.code || "?";
    let q = uniq ? "" : item.quality ? DB.QUALITY[item.quality] : item.simple ? "" : "";
    if (item.quality === QUALITY.Magic) {
      const p = affixName("prefix", item.prefix);
      const s = affixName("suffix", item.suffix);
      base = [p, (item.info && item.info.n) || item.code, s].filter(Boolean).join(" ");
      q = "";
    } else if (item.quality === QUALITY.Rare || item.quality === QUALITY.Crafted) {
      const n1 = rareName("prefix", item.rareName1);
      const n2 = rareName("suffix", item.rareName2);
      if (n1 || n2) base = [n1, n2].filter(Boolean).join(" ");
      q = item.quality === QUALITY.Crafted ? "Crafted" : "";
    }
    const bits = [];
    if (item.ethereal) bits.push("Eth");
    if (item.socketed && item.sockets) bits.push(item.sockets + "os");
    if (item.quantity > 1) bits.push("x" + item.quantity);
    if (!item.identified && !item.simple) bits.push("Unid");
    return [q && q !== "Normal" ? q : "", base, bits.length ? "(" + bits.join(", ") + ")" : ""].filter(Boolean).join(" ");
  }

  function gridLabel(item) {
    const uniq = item.quality === QUALITY.Unique ? uniqueById(item.uniqueId) : null;
    let n = (uniq && uniq.n) || (item.info && item.info.n) || item.code || "?";
    n = n.replace(/ Rune$/, "");
    if (item.quantity > 1) n = item.quantity + "× " + n;
    return n;
  }

  function formatMods(item) {
    return (item.mods || []).map((m) => {
      const rec = MAG[m.id];
      const name = rec && rec.s ? rec.s.replace(/^item_/, "").replace(/_/g, " ") : "stat " + m.id;
      const vals = (m.values || []).join(", ");
      return vals ? name + "  " + vals : name;
    });
  }

  function inspectMeta(item, where) {
    const bits = [locationLabel(item, where), item.code];
    if (item.ilvl) bits.push("ilvl " + item.ilvl);
    if (item.defense != null) bits.push("Defense " + item.defense);
    if (item.maxDur != null) bits.push(item.maxDur ? "Dur " + (item.dur || 0) + "/" + item.maxDur : "Indestructible");
    if (item.runeword) bits.push("Runeword");
    if (item.parseError) bits.push("needs rebuild");
    return bits.filter(Boolean).join(" · ");
  }

  function qualityClass(item) {
    let cls = "normal";
    switch (item.quality) {
      case 4: cls = "magic"; break;
      case 5: cls = "set"; break;
      case 6: cls = "rare"; break;
      case 7: cls = "unique"; break;
      case 8: cls = "crafted"; break;
      case 3: cls = "superior"; break;
      default: cls = item.simple ? "simple" : "normal";
    }
    if (item.ethereal) cls += " eth";
    return cls;
  }

  const api = {
    SPAWN,
    QUALITY,
    STASH_HEADER,
    parseItem,
    parseItemList,
    writeItemList,
    parseCharSection,
    writeCharSection,
    parseStash,
    writeStash,
    emptyStash,
    applyPlacement,
    setIdentified,
    setQuantity,
    setEthereal,
    setSockets,
    filledSockets,
    spawnSimple,
    spawnItem,
    spawnUnique,
    spawnCatalog,
    addAffix,
    removeAffix,
    setAffixSlot,
    searchAffixes,
    listAffixes,
    affixSlotIds,
    itemAffixSlots,
    canEditAffixes,
    affixName,
    affixLabel,
    findAffix,
    uniqueById,
    allUniques,
    uniqueKind,
    formatUniqueMods,
    itemFromRaw,
    findCube,
    giveCube,
    grids,
    itemInGrid,
    cellsUsed,
    firstFit,
    displayName,
    gridLabel,
    formatMods,
    inspectMeta,
    qualityClass,
    cloneItem,
    locationLabel,
    viewForItem,
    itemMatches,
    itemInfo,
    isSpawnBase,
    fitGrid,
    d2Checksum,
    applyChecksum,
  };

  if (typeof window !== "undefined") window.SoEItems = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
