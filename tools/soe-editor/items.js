(() => {
  "use strict";

  const DB = typeof window !== "undefined" ? window.SoEItemsDB : require("./items-db.js");
  const MAG = DB.MAG;
  const ITEMS = DB.ITEMS;

  const QUALITY = { Low: 1, Normal: 2, Superior: 3, Magic: 4, Set: 5, Rare: 6, Unique: 7, Crafted: 8 };
  const STASH_HEADER = 302;
  const STASH_MAGIC = [0x55, 0xbb, 0x55, 0xbb];

  const SPAWN = [
    { group: "Runes", codes: ["r01","r02","r03","r04","r05","r06","r07","r08","r09","r10","r11","r12","r13","r14","r15","r16","r17","r18","r19","r20","r21","r22","r23","r24","r25","r26","r27","r28","r29","r30","r31","r32","r33"] },
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

    if (!simple) {
      try {
        item.uidBit = reader.bitOffset();
        readExtended(reader, item, info);
      } catch (err) {
        item.parseError = err.message || String(err);
      }
    }

    reader.align();
    const nextJm = findJM(bytes, start + 2);
    const end = nextJm < 0 ? bytes.length : nextJm;
    if (!simple && item.socketedCount) {
      item.socketedItems = [];
      let childOff = nextJm < 0 ? start + 14 : nextJm;
      for (let i = 0; i < item.socketedCount; i++) {
        const child = parseItem(bytes, childOff);
        item.socketedItems.push(child);
        childOff += child.raw.length;
      }
      item.raw = bytes.slice(start, childOff);
    } else {
      item.raw = bytes.slice(start, end);
    }
    return item;
  }

  function findJM(bytes, from) {
    for (let i = from; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x4a && bytes[i + 1] === 0x4d) return i;
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
    let off = start + 4;
    for (let i = 0; i < count; i++) {
      const item = parseItem(bytes, off);
      items.push(item);
      off += item.raw.length;
    }
    return { items, start, end: off, count };
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
    if (ascii(bytes, off, 2) !== "JM") throw new Error("Corpse JM not found at " + off);
    const corpseCount = u16(bytes, off + 2);
    off += 4;
    let corpseExtra = new Uint8Array(0);
    let corpse = { items: [], start: 0, end: 0, count: 0 };
    if (corpseCount) {
      corpseExtra = bytes.slice(off, off + 12);
      off += 12;
      corpse = parseItemList(bytes, off);
      off = corpse.end;
    }
    let merc = { items: [] };
    let hasMerc = false;
    if (ascii(bytes, off, 2) === "jf") {
      off += 2;
      if (ascii(bytes, off, 2) === "JM") {
        hasMerc = true;
        merc = parseItemList(bytes, off);
        off = merc.end;
      }
    }
    if (ascii(bytes, off, 2) !== "kf") throw new Error("Golem kf not found at " + off);
    off += 2;
    const hasGolem = bytes[off];
    off += 1;
    let golem = null;
    if (hasGolem) {
      golem = parseItem(bytes, off);
      off += golem.raw.length;
    }
    return {
      player: player.items,
      corpse: corpse.items,
      corpseCount,
      corpseExtra,
      merc: merc.items,
      hasMerc,
      golem,
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
    if (!ITEMS[code]) throw new Error("Unknown item code " + code);
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

  function grids() {
    return {
      inv: { w: 10, h: 8, panel: 1, location: 0, label: "Inventory" },
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
    if (item.location === 1) return "Equipped";
    if (item.location === 2) return "Belt";
    if (item.panel === 4) return "Cube";
    if (item.panel === 5) return "Personal stash";
    if (item.panel === 1 || item.location === 0) return "Inventory";
    return "Other";
  }

  function viewForItem(item, where) {
    if (where === "stash") return "shared";
    if (item.location === 1) return "equipped";
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
    const base = (uniq && uniq.n) || (item.info && item.info.n) || item.code || "?";
    const q = uniq ? "" : item.quality ? DB.QUALITY[item.quality] : item.simple ? "" : "";
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
    uniqueById,
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
