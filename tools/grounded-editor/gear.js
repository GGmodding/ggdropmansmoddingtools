(() => {
  "use strict";

  const C = window.GroundedCsav;

  const FULL_TABLE = "/Game/Blueprints/Items/Table_AllItems.Table_AllItems";
  const INV_PATH = "/Script/Maine.InventoryComponent";
  const EQ_PATH = "/Script/Maine.EquipmentComponent";
  const HAUL_PATH = "/Script/Maine.HaulingComponent";

  const FULL_DURABILITY_HEAD = new Uint8Array([0x99, 0x99, 0x99, 0x09, 0, 0, 0, 0]);
  const MAX_SMITH_LEVEL = 9;
  const ONE_SHOT_ATTACK_MULT = 100;
  const GOD_DURABILITY = 99999;

  const WEAPON_RE =
    /Axe|Sword|Bow|Club|Spear|Staff|Dagger|Blade|CrossBow|Trident|Scythe|Mace|Hammer|Fist|Prod|Shatter|Paddle|Bat|Mallet|Katana|Rapier|Halberd|Whacker|Smacker|Reaper|Shovel|Crow|AntClub|Bone|Quartzite|Tiger|Toenail|Widow|Larva|Tick|Koi|Mosquito|Stinger|Pebblet|Sprig|Broodmother|BlackOx|FireAnt|BlackAnt|RedAnt|Infected|Venom|Fang|Pinch/i;
  const ARMOR_RE =
    /^(Head|Chest|Legs)|Armor|Mask|Helmet|Pauldron|Greaves|Vambrace|Glider|BubbleHelmet|GasMask|Rebreather/i;
  const SHIELD_RE = /Shield/i;
  const SKIP_RE =
    /Smoothie|Arrow|Bomb|UpgradeWeapon|UpgradeArmor|BossKey|Part$|Paper$|Wing$|Slime|Mold|Torch|Wasp(?!)|Crafted$/i;
  // Trinkets are skipped from the smithing table but shown on the doll
  const TRINKET_RE = /Trinket|Accessory/i;

  const DOLL_SLOTS = [
    { id: "head", label: "Head" },
    { id: "chest", label: "Chest" },
    { id: "legs", label: "Legs" },
    { id: "mainhand", label: "Main hand" },
    { id: "offhand", label: "Off hand" },
    { id: "trinket", label: "Trinket" },
  ];

  function dollSlotFor(name, kind) {
    if (/^Head|Helmet|Mask|Rebreather|GasMask|BubbleHelmet|Face/i.test(name)) {
      return "head";
    }
    if (/^Chest|Pauldron|Vambrace/i.test(name)) return "chest";
    if (/^Legs|Greaves/i.test(name)) return "legs";
    if (kind === "shield" || /Shield/i.test(name)) return "offhand";
    if (TRINKET_RE.test(name)) return "trinket";
    if (kind === "weapon") return "mainhand";
    if (kind === "armor") {
      if (/Head/i.test(name)) return "head";
      if (/Chest/i.test(name)) return "chest";
      if (/Legs/i.test(name)) return "legs";
    }
    return null;
  }

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
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(s)) return null;
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

  function classifyName(name) {
    if (SHIELD_RE.test(name)) return "shield";
    if (ARMOR_RE.test(name)) return "armor";
    if (WEAPON_RE.test(name)) return "weapon";
    return "other";
  }

  function regionBounds(buf) {
    const invAt = indexOfAscii(buf, INV_PATH);
    const eqAt = indexOfAscii(buf, EQ_PATH);
    const haulAt = indexOfAscii(buf, HAUL_PATH);
    const end = buf.length;
    const regions = [];
    if (invAt >= 0) {
      regions.push({
        id: "inventory",
        from: invAt,
        to: eqAt > invAt ? eqAt : end,
      });
    }
    if (eqAt >= 0) {
      regions.push({
        id: "equipment",
        from: eqAt,
        to: haulAt > eqAt ? haulAt : Math.min(eqAt + 8000, end),
      });
    }
    return regions;
  }

  function indexOfAscii(buf, ascii) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = 0; i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function indexOfAsciiFrom(buf, ascii, from) {
    const enc = new TextEncoder().encode(ascii);
    outer: for (let i = Math.max(0, from); i <= buf.length - enc.length; i++) {
      for (let j = 0; j < enc.length; j++) {
        if (buf[i + j] !== enc[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function parseItemAt(buf, tableAt, region) {
    const name = readFString(buf, tableAt + FULL_TABLE.length + 1);
    if (!name) return null;
    let off = name.next;
    if (off + 8 > buf.length) return null;
    const headOff = off;
    off += 8;
    const enh = readFString(buf, off);
    if (!enh) return null;
    off = enh.next;
    if (off + 4 > buf.length) return null;
    const levelOff = off;
    const level = C.readU32(buf, off);
    off += 4;
    if (level > 20) return null;
    const mid = readFString(buf, off);
    if (!mid) return null;
    off = mid.next;
    const padOff = off;
    const nextTable = indexOfAsciiFrom(buf, FULL_TABLE, off);
    if (nextTable < 0) return null;
    const pathLenOff = nextTable - 4;
    if (pathLenOff <= padOff) return null;
    const pathLen = C.readU32(buf, pathLenOff);
    if (pathLen !== FULL_TABLE.length + 1) return null;
    const durOff = pathLenOff - 4;
    if (durOff < padOff) return null;
    const durability = new DataView(
      buf.buffer,
      buf.byteOffset + durOff,
      4
    ).getFloat32(0, true);
    if (!Number.isFinite(durability) || durability < 0 || durability > 1e7) {
      return null;
    }
    // Optional amp: first float in the zero pad after mid (often 0)
    let attackMult = 0;
    let attackMultOff = -1;
    if (padOff + 4 <= durOff) {
      attackMultOff = padOff;
      attackMult = new DataView(
        buf.buffer,
        buf.byteOffset + padOff,
        4
      ).getFloat32(0, true);
      if (!Number.isFinite(attackMult) || attackMult < 0 || attackMult > 1e7) {
        attackMult = 0;
        attackMultOff = -1;
      }
    }
    const kind = classifyName(name.s);
    return {
      region,
      kind,
      name: name.s,
      enhancement: enh.s,
      enhancementOff: enh.next - enh.len - 4,
      enhancementLen: enh.len,
      level,
      levelOff,
      mid: mid.s,
      midOff: mid.next - mid.len - 4,
      midLen: mid.len,
      headOff,
      durability,
      durabilityOff: durOff,
      attackMult,
      attackMultOff,
      padOff,
      pathLenOff,
      tableAt,
      nameOff: tableAt + FULL_TABLE.length + 1,
    };
  }

  function parseGear(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const items = [];
    for (const region of regionBounds(buf)) {
      let i = region.from;
      while (i < region.to) {
        const at = indexOfAsciiFrom(buf, FULL_TABLE, i);
        if (at < 0 || at >= region.to) break;
        const it = parseItemAt(buf, at, region.id);
        if (
          it &&
          it.kind !== "other" &&
          !SKIP_RE.test(it.name) &&
          !TRINKET_RE.test(it.name)
        ) {
          items.push(it);
        }
        i = at + 1;
      }
    }
    return { ok: items.length > 0, items, size: buf.length };
  }

  function parseEquipmentDoll(rawPlayer) {
    const buf = C.toBytes(rawPlayer);
    const eqRegion = regionBounds(buf).find((r) => r.id === "equipment");
    const slots = {};
    for (const s of DOLL_SLOTS) slots[s.id] = null;
    if (!eqRegion) {
      return { ok: false, slots, items: [], defs: DOLL_SLOTS };
    }
    const items = [];
    let i = eqRegion.from;
    while (i < eqRegion.to) {
      const at = indexOfAsciiFrom(buf, FULL_TABLE, i);
      if (at < 0 || at >= eqRegion.to) break;
      const it = parseItemAt(buf, at, "equipment");
      if (it) {
        const slot = dollSlotFor(it.name, it.kind);
        if (slot) {
          items.push({ ...it, slot });
          if (!slots[slot]) slots[slot] = { ...it, slot };
        }
      }
      i = at + 1;
    }
    return {
      ok: items.length > 0,
      slots,
      items,
      defs: DOLL_SLOTS,
      size: buf.length,
    };
  }

  /** Map doll slot item back to parseGear index for writeGearItem (trinkets excluded). */
  function gearIndexForDollItem(rawPlayer, dollItem) {
    if (!dollItem || TRINKET_RE.test(dollItem.name)) return -1;
    const gear = parseGear(rawPlayer);
    return gear.items.findIndex(
      (x) =>
        x.region === "equipment" &&
        x.name === dollItem.name &&
        x.tableAt === dollItem.tableAt
    );
  }

  function replaceFString(buf, stringOff, oldLen, newStr) {
    const encoded = encodeFString(newStr);
    const oldBytes = 4 + oldLen;
    const delta = encoded.length - oldBytes;
    if (delta === 0) {
      const out = new Uint8Array(buf);
      out.set(encoded, stringOff);
      return { bytes: out, delta: 0 };
    }
    const out = new Uint8Array(buf.length + delta);
    out.set(buf.subarray(0, stringOff), 0);
    out.set(encoded, stringOff);
    out.set(buf.subarray(stringOff + oldBytes), stringOff + encoded.length);
    return { bytes: out, delta };
  }

  function writeGearItem(rawPlayer, itemIndex, patch) {
    const parsed0 = parseGear(rawPlayer);
    if (!parsed0.ok || itemIndex < 0 || itemIndex >= parsed0.items.length) {
      throw new Error("Gear item not found.");
    }
    let buf = new Uint8Array(C.toBytes(rawPlayer));
    const applied = {
      name: parsed0.items[itemIndex].name,
      kind: parsed0.items[itemIndex].kind,
    };

    if (patch.enhancement != null && patch.enhancement !== "") {
      const item = parseGear(buf).items[itemIndex];
      const r = replaceFString(
        buf,
        item.enhancementOff,
        item.enhancementLen,
        String(patch.enhancement)
      );
      buf = r.bytes;
      applied.enhancement = String(patch.enhancement);
    }

    if (patch.mid != null && patch.mid !== "") {
      const item = parseGear(buf).items[itemIndex];
      const r = replaceFString(buf, item.midOff, item.midLen, String(patch.mid));
      buf = r.bytes;
      applied.mid = String(patch.mid);
    }

    const item = parseGear(buf).items[itemIndex];
    if (!item) throw new Error("Gear item missing after rewrite.");

    if (patch.level != null && patch.level !== "") {
      const n = Math.max(0, Math.min(20, Math.floor(Number(patch.level))));
      if (!Number.isFinite(n)) throw new Error("Invalid smithing level.");
      C.writeU32(buf, item.levelOff, n);
      applied.level = n;
    }

    if (patch.durability != null && patch.durability !== "") {
      const n = Math.max(0, Math.min(1e7, Number(patch.durability)));
      if (!Number.isFinite(n)) throw new Error("Invalid durability.");
      new DataView(buf.buffer, buf.byteOffset + item.durabilityOff, 4).setFloat32(
        0,
        n,
        true
      );
      applied.durability = n;
    }

    if (patch.fullDurabilityHead) {
      buf.set(FULL_DURABILITY_HEAD, item.headOff);
      applied.fullDurabilityHead = true;
    }

    if (
      patch.attackMult != null &&
      patch.attackMult !== "" &&
      item.attackMultOff >= 0
    ) {
      const n = Math.max(0, Math.min(1e6, Number(patch.attackMult)));
      if (!Number.isFinite(n)) throw new Error("Invalid attack multiplier.");
      new DataView(buf.buffer, buf.byteOffset + item.attackMultOff, 4).setFloat32(
        0,
        n,
        true
      );
      applied.attackMult = n;
    }

    return { bytes: buf, values: applied };
  }

  function applyOneShotWeapons(rawPlayer) {
    let buf = new Uint8Array(C.toBytes(rawPlayer));
    let changed = 0;
    for (;;) {
      const items = parseGear(buf).items;
      const next = items.findIndex(
        (it) =>
          (it.kind === "weapon" || it.kind === "shield") &&
          (it.level < MAX_SMITH_LEVEL ||
            it.enhancement === "None" ||
            it.attackMult < ONE_SHOT_ATTACK_MULT)
      );
      if (next < 0) break;
      const r = writeGearItem(buf, next, {
        level: MAX_SMITH_LEVEL,
        enhancement: "Mighty",
        attackMult: ONE_SHOT_ATTACK_MULT,
        durability: GOD_DURABILITY,
        fullDurabilityHead: true,
      });
      buf = r.bytes;
      changed++;
      if (changed > 40) break;
    }
    return { bytes: buf, changed };
  }

  function applyGodArmor(rawPlayer) {
    let buf = new Uint8Array(C.toBytes(rawPlayer));
    let changed = 0;
    for (;;) {
      const items = parseGear(buf).items;
      const next = items.findIndex(
        (it) =>
          it.kind === "armor" &&
          (it.level < MAX_SMITH_LEVEL ||
            it.mid === "None" ||
            it.durability < GOD_DURABILITY)
      );
      if (next < 0) break;
      const r = writeGearItem(buf, next, {
        level: MAX_SMITH_LEVEL,
        mid: "Bulky",
        durability: GOD_DURABILITY,
        fullDurabilityHead: true,
      });
      buf = r.bytes;
      changed++;
      if (changed > 40) break;
    }
    return { bytes: buf, changed };
  }

  window.GroundedGear = {
    parseGear,
    parseEquipmentDoll,
    gearIndexForDollItem,
    writeGearItem,
    applyOneShotWeapons,
    applyGodArmor,
    classifyName,
    dollSlotFor,
    DOLL_SLOTS,
    MAX_SMITH_LEVEL,
    ONE_SHOT_ATTACK_MULT,
    GOD_DURABILITY,
  };
})();
