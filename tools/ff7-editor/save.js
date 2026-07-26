(() => {
  "use strict";

  const PC_HEADER_SIZE = 0x09;
  const SLOT_SIZE = 0x10F4;
  const SLOT_COUNT = 15;
  const PC_FILE_SIZE = 0xfe55; // 9 + 15 * 4340
  const PC_MAGIC = [0x71, 0x73, 0x27, 0x06];

  const OFF = {
    checksum: 0x0000,
    previewLevel: 0x0004,
    previewPortraits: 0x0005,
    previewName: 0x0008,
    previewCurHp: 0x0018,
    previewMaxHp: 0x001a,
    previewCurMp: 0x001c,
    previewMaxMp: 0x001e,
    previewGil: 0x0020,
    previewTime: 0x0024,
    previewLocation: 0x0028,
    chars: 0x0054,
    party: 0x04f8,
    items: 0x04fc,
    materia: 0x077c,
    gil: 0x0b7c,
    playTime: 0x0b80,
    fieldParty: 0x0cad,
    stablesOwned: 0x0cfc,
    stablesOccupied: 0x0cfd,
    stablesMask: 0x0cff,
    cantMateMask: 0x0d00,
    chocoboNames: 0x0ec4,
    chocoboStamina: 0x0ee8,
    phsAllowed: 0x10a4,
    phsVisible: 0x10a6,
  };

  const CHOCO_RECORD_OFFS = [0x0dc4, 0x0dd4, 0x0de4, 0x0df4, 0x1084, 0x1094];
  const CHOCO_COUNT = 6;
  const CHOCO_NAME_LEN = 6;

  const CHAR_SIZE = 132;
  const CHAR_COUNT = 9;
  const ITEM_SLOTS = 320;
  const MATERIA_SLOTS = 200;

  const CHAR_OFF = {
    id: 0x00,
    level: 0x01,
    strength: 0x02,
    vitality: 0x03,
    magic: 0x04,
    spirit: 0x05,
    dexterity: 0x06,
    luck: 0x07,
    strengthBonus: 0x08,
    vitalityBonus: 0x09,
    magicBonus: 0x0a,
    spiritBonus: 0x0b,
    dexterityBonus: 0x0c,
    luckBonus: 0x0d,
    limitLevel: 0x0e,
    limitBar: 0x0f,
    name: 0x10,
    weapon: 0x1c,
    armor: 0x1d,
    accessory: 0x1e,
    flags: 0x1f,
    row: 0x20,
    limitsLearned: 0x22,
    kills: 0x24,
    limit1Used: 0x26,
    limit2Used: 0x28,
    limit3Used: 0x2a,
    curHp: 0x2c,
    baseHp: 0x2e,
    curMp: 0x30,
    baseMp: 0x32,
    maxHp: 0x38,
    maxMp: 0x3a,
    exp: 0x3c,
    weaponMateria: 0x40,
    armorMateria: 0x60,
    expToNext: 0x80,
  };

  function u16(view, offset) {
    return view.getUint16(offset, true);
  }
  function u32(view, offset) {
    return view.getUint32(offset, true);
  }
  function setU16(view, offset, value) {
    view.setUint16(offset, value >>> 0, true);
  }
  function setU32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  /** CRC-CCITT style checksum used by FF7 slots (from ff7tk / Black Chocobo). */
  function computeChecksum(slotBytes) {
    let r = 0xffff;
    const pbit = 0x8000;
    for (let i = 4; i < 4 + 0x10f0; i++) {
      r ^= slotBytes[i] << 8;
      for (let d = 0; d < 8; d++) {
        if (r & pbit) r = ((r << 1) ^ 0x1021) & 0xffff;
        else r = (r << 1) & 0xffff;
      }
    }
    return (r ^ 0xffff) & 0xffff;
  }

  function writeChecksum(slotBytes) {
    const sum = computeChecksum(slotBytes);
    slotBytes[0] = sum & 0xff;
    slotBytes[1] = (sum >> 8) & 0xff;
    slotBytes[2] = 0;
    slotBytes[3] = 0;
  }

  function isSlotEmpty(slotBytes) {
    for (let i = 0; i < slotBytes.length; i++) {
      if (slotBytes[i] !== 0xff) return false;
    }
    return true;
  }

  function decodeItem(raw) {
    return { id: raw & 0x1ff, qty: (raw >> 9) & 0x7f };
  }

  function encodeItem(id, qty) {
    if (id === 0x1ff || id < 0) return 0xffff;
    return ((qty & 0x7f) << 9) | (id & 0x1ff);
  }

  function decodeMateria(bytes, offset) {
    const id = bytes[offset];
    const ap = bytes[offset + 1] | (bytes[offset + 2] << 8) | (bytes[offset + 3] << 16);
    return { id, ap };
  }

  function encodeMateria(id, ap) {
    const out = new Uint8Array(4);
    if (id === 0xff) {
      out[0] = 0xff;
      out[1] = 0xff;
      out[2] = 0xff;
      out[3] = 0xff;
      return out;
    }
    const a = ap >>> 0;
    out[0] = id & 0xff;
    out[1] = a & 0xff;
    out[2] = (a >> 8) & 0xff;
    out[3] = (a >> 16) & 0xff;
    return out;
  }

  function readCharacter(slotView, charIndex) {
    const base = OFF.chars + charIndex * CHAR_SIZE;
    const nameBytes = new Uint8Array(12);
    for (let i = 0; i < 12; i++) nameBytes[i] = slotView.getUint8(base + CHAR_OFF.name + i);

    const weaponMat = [];
    const armorMat = [];
    for (let i = 0; i < 8; i++) {
      const wb = base + CHAR_OFF.weaponMateria + i * 4;
      const ab = base + CHAR_OFF.armorMateria + i * 4;
      weaponMat.push({
        id: slotView.getUint8(wb),
        ap: slotView.getUint8(wb + 1) | (slotView.getUint8(wb + 2) << 8) | (slotView.getUint8(wb + 3) << 16),
      });
      armorMat.push({
        id: slotView.getUint8(ab),
        ap: slotView.getUint8(ab + 1) | (slotView.getUint8(ab + 2) << 8) | (slotView.getUint8(ab + 3) << 16),
      });
    }

    return {
      index: charIndex,
      id: slotView.getUint8(base + CHAR_OFF.id),
      level: slotView.getUint8(base + CHAR_OFF.level),
      strength: slotView.getUint8(base + CHAR_OFF.strength),
      vitality: slotView.getUint8(base + CHAR_OFF.vitality),
      magic: slotView.getUint8(base + CHAR_OFF.magic),
      spirit: slotView.getUint8(base + CHAR_OFF.spirit),
      dexterity: slotView.getUint8(base + CHAR_OFF.dexterity),
      luck: slotView.getUint8(base + CHAR_OFF.luck),
      strengthBonus: slotView.getUint8(base + CHAR_OFF.strengthBonus),
      vitalityBonus: slotView.getUint8(base + CHAR_OFF.vitalityBonus),
      magicBonus: slotView.getUint8(base + CHAR_OFF.magicBonus),
      spiritBonus: slotView.getUint8(base + CHAR_OFF.spiritBonus),
      dexterityBonus: slotView.getUint8(base + CHAR_OFF.dexterityBonus),
      luckBonus: slotView.getUint8(base + CHAR_OFF.luckBonus),
      limitLevel: slotView.getUint8(base + CHAR_OFF.limitLevel),
      limitBar: slotView.getUint8(base + CHAR_OFF.limitBar),
      name: window.FF7Data.decodeFFText(nameBytes),
      weapon: slotView.getUint8(base + CHAR_OFF.weapon),
      armor: slotView.getUint8(base + CHAR_OFF.armor),
      accessory: slotView.getUint8(base + CHAR_OFF.accessory),
      flags: slotView.getUint8(base + CHAR_OFF.flags),
      row: slotView.getUint8(base + CHAR_OFF.row),
      limitsLearned: u16(slotView, base + CHAR_OFF.limitsLearned),
      kills: u16(slotView, base + CHAR_OFF.kills),
      limit1Used: u16(slotView, base + CHAR_OFF.limit1Used),
      limit2Used: u16(slotView, base + CHAR_OFF.limit2Used),
      limit3Used: u16(slotView, base + CHAR_OFF.limit3Used),
      curHp: u16(slotView, base + CHAR_OFF.curHp),
      baseHp: u16(slotView, base + CHAR_OFF.baseHp),
      curMp: u16(slotView, base + CHAR_OFF.curMp),
      baseMp: u16(slotView, base + CHAR_OFF.baseMp),
      maxHp: u16(slotView, base + CHAR_OFF.maxHp),
      maxMp: u16(slotView, base + CHAR_OFF.maxMp),
      exp: u32(slotView, base + CHAR_OFF.exp),
      expToNext: u32(slotView, base + CHAR_OFF.expToNext),
      weaponMateria: weaponMat,
      armorMateria: armorMat,
    };
  }

  function writeCharacter(slotView, char) {
    const base = OFF.chars + char.index * CHAR_SIZE;
    slotView.setUint8(base + CHAR_OFF.id, clamp(char.id, 0, 255));
    slotView.setUint8(base + CHAR_OFF.level, clamp(char.level, 1, 99));
    slotView.setUint8(base + CHAR_OFF.strength, clamp(char.strength, 0, 255));
    slotView.setUint8(base + CHAR_OFF.vitality, clamp(char.vitality, 0, 255));
    slotView.setUint8(base + CHAR_OFF.magic, clamp(char.magic, 0, 255));
    slotView.setUint8(base + CHAR_OFF.spirit, clamp(char.spirit, 0, 255));
    slotView.setUint8(base + CHAR_OFF.dexterity, clamp(char.dexterity, 0, 255));
    slotView.setUint8(base + CHAR_OFF.luck, clamp(char.luck, 0, 255));
    slotView.setUint8(base + CHAR_OFF.strengthBonus, clamp(char.strengthBonus, 0, 255));
    slotView.setUint8(base + CHAR_OFF.vitalityBonus, clamp(char.vitalityBonus, 0, 255));
    slotView.setUint8(base + CHAR_OFF.magicBonus, clamp(char.magicBonus, 0, 255));
    slotView.setUint8(base + CHAR_OFF.spiritBonus, clamp(char.spiritBonus, 0, 255));
    slotView.setUint8(base + CHAR_OFF.dexterityBonus, clamp(char.dexterityBonus, 0, 255));
    slotView.setUint8(base + CHAR_OFF.luckBonus, clamp(char.luckBonus, 0, 255));
    slotView.setUint8(base + CHAR_OFF.limitLevel, clamp(char.limitLevel, 1, 4));
    slotView.setUint8(base + CHAR_OFF.limitBar, clamp(char.limitBar, 0, 255));

    const nameBytes = window.FF7Data.encodeFFText(char.name || "", 12);
    for (let i = 0; i < 12; i++) slotView.setUint8(base + CHAR_OFF.name + i, nameBytes[i]);

    slotView.setUint8(base + CHAR_OFF.weapon, clamp(char.weapon, 0, 255));
    slotView.setUint8(base + CHAR_OFF.armor, clamp(char.armor, 0, 255));
    slotView.setUint8(base + CHAR_OFF.accessory, clamp(char.accessory, 0, 255));
    slotView.setUint8(base + CHAR_OFF.flags, char.flags & 0xff);
    slotView.setUint8(base + CHAR_OFF.row, char.row & 0xff);
    setU16(slotView, base + CHAR_OFF.limitsLearned, clamp(char.limitsLearned, 0, 0xffff));
    setU16(slotView, base + CHAR_OFF.kills, clamp(char.kills, 0, 65535));
    setU16(slotView, base + CHAR_OFF.limit1Used, clamp(char.limit1Used, 0, 65535));
    setU16(slotView, base + CHAR_OFF.limit2Used, clamp(char.limit2Used, 0, 65535));
    setU16(slotView, base + CHAR_OFF.limit3Used, clamp(char.limit3Used, 0, 65535));
    setU16(slotView, base + CHAR_OFF.curHp, clamp(char.curHp, 0, 9999));
    setU16(slotView, base + CHAR_OFF.baseHp, clamp(char.baseHp, 0, 9999));
    setU16(slotView, base + CHAR_OFF.curMp, clamp(char.curMp, 0, 9999));
    setU16(slotView, base + CHAR_OFF.baseMp, clamp(char.baseMp, 0, 9999));
    setU16(slotView, base + CHAR_OFF.maxHp, clamp(char.maxHp, 0, 9999));
    setU16(slotView, base + CHAR_OFF.maxMp, clamp(char.maxMp, 0, 9999));
    setU32(slotView, base + CHAR_OFF.exp, clamp(char.exp, 0, 0xffffffff));
    setU32(slotView, base + CHAR_OFF.expToNext, clamp(char.expToNext, 0, 0xffffffff));

    for (let i = 0; i < 8; i++) {
      const wm = char.weaponMateria[i] || { id: 0xff, ap: 0xffffff };
      const am = char.armorMateria[i] || { id: 0xff, ap: 0xffffff };
      const we = encodeMateria(wm.id, wm.ap);
      const ae = encodeMateria(am.id, am.ap);
      const wb = base + CHAR_OFF.weaponMateria + i * 4;
      const ab = base + CHAR_OFF.armorMateria + i * 4;
      for (let j = 0; j < 4; j++) {
        slotView.setUint8(wb + j, we[j]);
        slotView.setUint8(ab + j, ae[j]);
      }
    }
  }

  function clamp(n, min, max) {
    n = Number(n);
    if (!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  function readChocobo(view, index) {
    const base = CHOCO_RECORD_OFFS[index];
    const nameBytes = new Uint8Array(CHOCO_NAME_LEN);
    for (let i = 0; i < CHOCO_NAME_LEN; i++) {
      nameBytes[i] = view.getUint8(OFF.chocoboNames + index * CHOCO_NAME_LEN + i);
    }
    return {
      index,
      sprint: u16(view, base),
      maxSprint: u16(view, base + 2),
      speed: u16(view, base + 4),
      maxSpeed: u16(view, base + 6),
      acceleration: view.getUint8(base + 8),
      cooperation: view.getUint8(base + 9),
      intelligence: view.getUint8(base + 10),
      personality: view.getUint8(base + 11),
      pcount: view.getUint8(base + 12),
      racesWon: view.getUint8(base + 13),
      sex: view.getUint8(base + 14), // 0 male, 1 female
      type: view.getUint8(base + 15), // 0 yellow … 4 gold
      name: window.FF7Data.decodeFFText(nameBytes),
      stamina: u16(view, OFF.chocoboStamina + index * 2),
    };
  }

  function writeChocobo(view, choco) {
    const base = CHOCO_RECORD_OFFS[choco.index];
    setU16(view, base, clamp(choco.sprint, 0, 9999));
    setU16(view, base + 2, clamp(choco.maxSprint, 0, 9999));
    setU16(view, base + 4, clamp(choco.speed, 0, 9999));
    setU16(view, base + 6, clamp(choco.maxSpeed, 0, 9999));
    view.setUint8(base + 8, clamp(choco.acceleration, 0, 255));
    view.setUint8(base + 9, clamp(choco.cooperation, 0, 255));
    view.setUint8(base + 10, clamp(choco.intelligence, 0, 255));
    view.setUint8(base + 11, clamp(choco.personality, 0, 255));
    view.setUint8(base + 12, clamp(choco.pcount, 0, 255));
    view.setUint8(base + 13, clamp(choco.racesWon, 0, 255));
    view.setUint8(base + 14, clamp(choco.sex, 0, 1));
    view.setUint8(base + 15, clamp(choco.type, 0, 4));

    const nameBytes = window.FF7Data.encodeFFText(choco.name || "", CHOCO_NAME_LEN);
    for (let i = 0; i < CHOCO_NAME_LEN; i++) {
      view.setUint8(OFF.chocoboNames + choco.index * CHOCO_NAME_LEN + i, nameBytes[i]);
    }
    setU16(view, OFF.chocoboStamina + choco.index * 2, clamp(choco.stamina, 0, 9999));
  }

  function parseSlot(slotBytes) {
    if (isSlotEmpty(slotBytes)) return null;
    const view = new DataView(slotBytes.buffer, slotBytes.byteOffset, slotBytes.byteLength);
    const chars = [];
    for (let i = 0; i < CHAR_COUNT; i++) chars.push(readCharacter(view, i));

    const items = [];
    for (let i = 0; i < ITEM_SLOTS; i++) {
      items.push(decodeItem(u16(view, OFF.items + i * 2)));
    }

    const materia = [];
    for (let i = 0; i < MATERIA_SLOTS; i++) {
      materia.push(decodeMateria(slotBytes, OFF.materia + i * 4));
    }

    const chocobos = [];
    for (let i = 0; i < CHOCO_COUNT; i++) chocobos.push(readChocobo(view, i));

    const locBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) locBytes[i] = view.getUint8(OFF.previewLocation + i);

    return {
      empty: false,
      gil: u32(view, OFF.gil),
      playTime: u32(view, OFF.playTime),
      party: [
        view.getUint8(OFF.party),
        view.getUint8(OFF.party + 1),
        view.getUint8(OFF.party + 2),
      ],
      previewName: window.FF7Data.decodeFFText(
        Uint8Array.from({ length: 16 }, (_, i) => view.getUint8(OFF.previewName + i))
      ),
      previewLocation: window.FF7Data.decodeFFText(locBytes),
      previewLevel: view.getUint8(OFF.previewLevel),
      chars,
      items,
      materia,
      stablesOwned: view.getUint8(OFF.stablesOwned),
      stablesOccupied: view.getUint8(OFF.stablesOccupied),
      stablesMask: view.getUint8(OFF.stablesMask),
      cantMateMask: view.getUint8(OFF.cantMateMask),
      phsAllowed: u16(view, OFF.phsAllowed),
      phsVisible: u16(view, OFF.phsVisible),
      chocobos,
      _bytes: slotBytes,
    };
  }

  function applySlot(slot) {
    const bytes = slot._bytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    setU32(view, OFF.gil, clamp(slot.gil, 0, 0xffffffff));
    setU32(view, OFF.previewGil, clamp(slot.gil, 0, 0xffffffff));
    setU32(view, OFF.playTime, clamp(slot.playTime, 0, 0xffffffff));
    setU32(view, OFF.previewTime, clamp(slot.playTime, 0, 0xffffffff));

    for (let i = 0; i < 3; i++) {
      view.setUint8(OFF.party + i, slot.party[i] ?? 0xff);
      view.setUint8(OFF.fieldParty + i, slot.party[i] ?? 0xff);
    }

    for (const ch of slot.chars) writeCharacter(view, ch);

    // Sync save-menu preview from party (portraits + lead stats).
    for (let i = 0; i < 3; i++) {
      const pid = slot.party[i];
      view.setUint8(OFF.previewPortraits + i, pid >= 0 && pid <= 0x0b ? pid : 0xff);
    }
    const leadId = slot.party[0];
    const leadRecord =
      leadId === 0x0a ? 7 : // Sephiroth → Vincent slot
      leadId === 0x09 ? 6 : // Young Cloud → Cait Sith slot
      leadId >= 0 && leadId < CHAR_COUNT ? leadId : -1;
    if (leadRecord >= 0) {
      const lead = slot.chars[leadRecord];
      view.setUint8(OFF.previewLevel, clamp(lead.level, 1, 99));
      const nameBytes = window.FF7Data.encodeFFText(lead.name || "", 16);
      for (let i = 0; i < 16; i++) view.setUint8(OFF.previewName + i, nameBytes[i]);
      setU16(view, OFF.previewCurHp, clamp(lead.curHp, 0, 9999));
      setU16(view, OFF.previewMaxHp, clamp(lead.maxHp, 0, 9999));
      setU16(view, OFF.previewCurMp, clamp(lead.curMp, 0, 9999));
      setU16(view, OFF.previewMaxMp, clamp(lead.maxMp, 0, 9999));
    }

    for (let i = 0; i < ITEM_SLOTS; i++) {
      const it = slot.items[i] || { id: 0x1ff, qty: 0 };
      const raw = it.id === 0x1ff || !it.qty ? 0xffff : encodeItem(it.id, it.qty);
      setU16(view, OFF.items + i * 2, raw);
    }

    for (let i = 0; i < MATERIA_SLOTS; i++) {
      const m = slot.materia[i] || { id: 0xff, ap: 0xffffff };
      const enc = encodeMateria(m.id, m.ap);
      const base = OFF.materia + i * 4;
      bytes[base] = enc[0];
      bytes[base + 1] = enc[1];
      bytes[base + 2] = enc[2];
      bytes[base + 3] = enc[3];
    }

    view.setUint8(OFF.stablesOwned, clamp(slot.stablesOwned, 0, 6));
    view.setUint8(OFF.stablesOccupied, clamp(slot.stablesOccupied, 0, 6));
    view.setUint8(OFF.stablesMask, slot.stablesMask & 0x3f);
    view.setUint8(OFF.cantMateMask, slot.cantMateMask & 0x3f);
    setU16(view, OFF.phsAllowed, slot.phsAllowed & 0xffff);
    setU16(view, OFF.phsVisible, slot.phsVisible & 0xffff);
    for (const choco of slot.chocobos) writeChocobo(view, choco);

    writeChecksum(bytes);
  }

  function fixPcHeader(header, slots) {
    // Selected slot hint + occupancy bitmasks (ff7tk fix_pc_bytemask).
    let selected = 0;
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (slots[i] && !slots[i].empty) {
        selected = i;
        break;
      }
    }
    if (selected === 0) header[4] = 0x00;
    else if (selected === 1) header[4] = 0x01;
    else header[4] = 16 * (selected - 2) + 2;

    let maskLo = 0;
    let maskHi = 0;
    for (let i = 0; i < 8; i++) {
      if (slots[i] && !slots[i].empty) maskLo |= 1 << i;
    }
    for (let i = 8; i < 15; i++) {
      if (slots[i] && !slots[i].empty) maskHi |= 1 << (i - 8);
    }
    header[5] = maskLo;
    header[6] = maskHi;
  }

  function parseFile(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < PC_FILE_SIZE) {
      throw new Error(`File too small (${bytes.length} bytes). Expected ${PC_FILE_SIZE} for Steam/PC .ff7.`);
    }
    if (
      bytes[0] !== PC_MAGIC[0] ||
      bytes[1] !== PC_MAGIC[1] ||
      bytes[2] !== PC_MAGIC[2] ||
      bytes[3] !== PC_MAGIC[3]
    ) {
      throw new Error("Not a PC/Steam FF7 save (missing qs'\\x06 header).");
    }

    const header = bytes.slice(0, PC_HEADER_SIZE);
    const slots = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const start = PC_HEADER_SIZE + i * SLOT_SIZE;
      const slotBytes = bytes.slice(start, start + SLOT_SIZE);
      const parsed = parseSlot(slotBytes);
      if (!parsed) {
        slots.push({ empty: true, _bytes: slotBytes });
      } else {
        slots.push(parsed);
      }
    }
    return { header, slots, raw: bytes };
  }

  function buildFile(save) {
    const out = new Uint8Array(PC_FILE_SIZE);
    const header = new Uint8Array(save.header);
    header[0] = PC_MAGIC[0];
    header[1] = PC_MAGIC[1];
    header[2] = PC_MAGIC[2];
    header[3] = PC_MAGIC[3];

    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = save.slots[i];
      if (!slot.empty) applySlot(slot);
    }
    fixPcHeader(header, save.slots);
    out.set(header, 0);

    for (let i = 0; i < SLOT_COUNT; i++) {
      const start = PC_HEADER_SIZE + i * SLOT_SIZE;
      out.set(save.slots[i]._bytes, start);
    }
    return out;
  }

  window.FF7Save = {
    PC_FILE_SIZE,
    SLOT_COUNT,
    CHAR_COUNT,
    CHOCO_COUNT,
    ITEM_SLOTS,
    MATERIA_SLOTS,
    ALL_LIMITS_MASK: 0x02db, // 1-1,1-2,2-1,2-2,3-1,3-2,4
    parseFile,
    buildFile,
    encodeItem,
    decodeItem,
    encodeMateria,
    computeChecksum,
  };
})();
