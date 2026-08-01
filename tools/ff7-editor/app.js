(() => {
  "use strict";

  const { ITEM_OPTIONS, MATERIA_OPTIONS, itemName, itemCategory } = window.FF7Data;
  const Save = window.FF7Save;

  const state = {
    save: null,
    fileName: "",
    backup: null,
    dirty: false,
    slotIndex: 0,
    charIndex: 0,
    chocoIndex: 0,
    undoStack: [],
    redoStack: [],
    fileHandle: null,
    diffSave: null,
    diffSlotIndex: 0,
  };

  const LIMIT_BITS = [
    { bit: 0x0001, label: "Level 1-1" },
    { bit: 0x0002, label: "Level 1-2" },
    { bit: 0x0008, label: "Level 2-1" },
    { bit: 0x0010, label: "Level 2-2" },
    { bit: 0x0040, label: "Level 3-1" },
    { bit: 0x0080, label: "Level 3-2" },
    { bit: 0x0200, label: "Level 4" },
  ];

  function unlockAllLimits(ch) {
    ch.limitsLearned = Save.ALL_LIMITS_MASK;
    ch.limitLevel = 4;
    ch.limitBar = 255;
    ch.kills = Math.max(ch.kills || 0, 65535);
    ch.limit1Used = Math.max(ch.limit1Used || 0, 255);
    ch.limit2Used = Math.max(ch.limit2Used || 0, 255);
    ch.limit3Used = Math.max(ch.limit3Used || 0, 255);
  }

  function currentChar() {
    const slot = currentSlot();
    if (!slot || slot.empty) return null;
    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    return slot.chars[tab.record];
  }

  function renderLimits(ch) {
    const mask = ch.limitsLearned || 0;
    const box = $("limit-checks");
    box.innerHTML = LIMIT_BITS.map(
      (l) =>
        `<label class="check"><input type="checkbox" data-limit-bit="${l.bit}" ${
          mask & l.bit ? "checked" : ""
        } /> ${l.label}</label>`
    ).join("");
    box.querySelectorAll("input").forEach((el) => {
      el.addEventListener("change", () => {
        flushLimits();
        setDirty(true);
      });
    });
    $("f-limit-level").value = ch.limitLevel ?? 1;
    $("f-limit-bar").value = ch.limitBar ?? 0;
    $("f-kills").value = ch.kills ?? 0;
    $("f-limit1-used").value = ch.limit1Used ?? 0;
    $("f-limit2-used").value = ch.limit2Used ?? 0;
    $("f-limit3-used").value = ch.limit3Used ?? 0;
  }

  function flushLimits() {
    const ch = currentChar();
    if (!ch) return;
    let mask = 0;
    $("limit-checks").querySelectorAll("input[data-limit-bit]").forEach((el) => {
      if (el.checked) mask |= Number(el.dataset.limitBit);
    });
    ch.limitsLearned = mask;
    ch.limitLevel = Number($("f-limit-level").value) || 1;
    ch.limitBar = Number($("f-limit-bar").value) || 0;
    ch.kills = Number($("f-kills").value) || 0;
    ch.limit1Used = Number($("f-limit1-used").value) || 0;
    ch.limit2Used = Number($("f-limit2-used").value) || 0;
    ch.limit3Used = Number($("f-limit3-used").value) || 0;
  }
  const CHOCO_TYPES = ["Yellow", "Green", "Blue", "Black", "Gold"];
  const EMPTY_CHOCO = () => ({
    sprint: 0,
    maxSprint: 0,
    speed: 0,
    maxSpeed: 0,
    acceleration: 0,
    cooperation: 0,
    intelligence: 0,
    personality: 0,
    pcount: 0,
    racesWon: 0,
    sex: 0,
    type: 0,
    name: "",
    stamina: 0,
  });

  const CHAR_PORTRAITS = [
    "portraits/cloud.jpg",
    "portraits/barret.jpg",
    "portraits/tifa.jpg",
    "portraits/aerith.jpg",
    "portraits/red.jpg",
    "portraits/yuffie.jpg",
    "portraits/cait.jpg",
    "portraits/vincent.jpg",
    "portraits/cid.jpg",
  ];

  // UI tabs: Sephiroth shares Vincent's save record (index 7).
  const CHAR_TABS = [
    { name: "Cloud", record: 0, id: 0, portrait: CHAR_PORTRAITS[0] },
    { name: "Barret", record: 1, id: 1, portrait: CHAR_PORTRAITS[1] },
    { name: "Tifa", record: 2, id: 2, portrait: CHAR_PORTRAITS[2] },
    { name: "Aeris", record: 3, id: 3, portrait: CHAR_PORTRAITS[3] },
    { name: "Red XIII", record: 4, id: 4, portrait: CHAR_PORTRAITS[4] },
    { name: "Yuffie", record: 5, id: 5, portrait: CHAR_PORTRAITS[5] },
    { name: "Cait Sith", record: 6, id: 6, portrait: CHAR_PORTRAITS[6] },
    { name: "Young Cloud", record: 6, id: 0x09, portrait: CHAR_PORTRAITS[0] },
    { name: "Vincent", record: 7, id: 7, portrait: CHAR_PORTRAITS[7] },
    { name: "Sephiroth", record: 7, id: 0x0a, portrait: "portraits/sephiroth.jpg" },
    { name: "Cid", record: 8, id: 8, portrait: CHAR_PORTRAITS[8] },
  ];

  const PARTY_OPTIONS = [
    { id: 0, name: "Cloud" },
    { id: 1, name: "Barret" },
    { id: 2, name: "Tifa" },
    { id: 3, name: "Aeris" },
    { id: 4, name: "Red XIII" },
    { id: 5, name: "Yuffie" },
    { id: 6, name: "Cait Sith" },
    { id: 7, name: "Vincent" },
    { id: 8, name: "Cid" },
    { id: 9, name: "Young Cloud" },
    { id: 10, name: "Sephiroth" },
  ];

  const $ = (id) => document.getElementById(id);

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("dirty-pill").hidden = !dirty;
    $("btn-save").disabled = !state.save;
    $("btn-backup").disabled = !state.save;
    const inplace = $("btn-save-inplace");
    if (inplace) inplace.disabled = !state.save || !state.fileHandle;
    updateUndoRedoButtons();
  }

  function snapshotSlot() {
    const slot = currentSlot();
    if (!slot || slot.empty) return null;
    return JSON.stringify({
      gil: slot.gil,
      playTime: slot.playTime,
      gp: slot.gp,
      battlePoints: slot.battlePoints,
      mapId: slot.mapId,
      locationId: slot.locationId,
      worldX: slot.worldX,
      worldY: slot.worldY,
      worldZ: slot.worldZ,
      disc: slot.disc,
      vehicles: slot.vehicles,
      party: slot.party,
      chars: slot.chars,
      items: slot.items,
      materia: slot.materia,
      stolenMateria: slot.stolenMateria,
      love: slot.love,
      keyItems: Array.from(slot.keyItems || []),
      turtleFlyers: slot.turtleFlyers,
      phsAllowed: slot.phsAllowed,
      phsVisible: slot.phsVisible,
      stablesOwned: slot.stablesOwned,
      stablesOccupied: slot.stablesOccupied,
      stablesMask: slot.stablesMask,
      cantMateMask: slot.cantMateMask,
      chocobos: slot.chocobos,
    });
  }

  function restoreSnapshot(json) {
    const slot = currentSlot();
    if (!slot || !json) return;
    const data = JSON.parse(json);
    Object.assign(slot, data);
    slot.keyItems = new Uint8Array(data.keyItems || []);
  }

  function pushUndo() {
    const snap = snapshotSlot();
    if (!snap) return;
    state.undoStack.push(snap);
    if (state.undoStack.length > 40) state.undoStack.shift();
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  function undoEdit() {
    if (!state.undoStack.length) return;
    const current = snapshotSlot();
    const prev = state.undoStack.pop();
    if (current) state.redoStack.push(current);
    restoreSnapshot(prev);
    setDirty(true);
    renderAll();
    setStatus("Undo.");
  }

  function redoEdit() {
    if (!state.redoStack.length) return;
    const current = snapshotSlot();
    const next = state.redoStack.pop();
    if (current) state.undoStack.push(current);
    restoreSnapshot(next);
    setDirty(true);
    renderAll();
    setStatus("Redo.");
  }

  function updateUndoRedoButtons() {
    const u = $("btn-undo");
    const r = $("btn-redo");
    if (u) u.disabled = !state.undoStack.length;
    if (r) r.disabled = !state.redoStack.length;
  }

  function currentSlot() {
    if (!state.save) return null;
    return state.save.slots[state.slotIndex];
  }

  function usedSlots() {
    return state.save ? state.save.slots.map((s, i) => (!s.empty ? i : -1)).filter((i) => i >= 0) : [];
  }

  function partyOptionsHtml(selected) {
    let html = `<option value="255">(Empty)</option>`;
    for (const p of PARTY_OPTIONS) {
      html += `<option value="${p.id}" ${selected === p.id ? "selected" : ""}>${p.name}</option>`;
    }
    return html;
  }

  function enableSephiroth(slot) {
    const ch = slot.chars[7];
    ch.id = 0x0a;
    if (!ch.name || ch.name === "Vincent" || ch.name === "") ch.name = "Sephiroth";
    // PHS bit 7 = Vincent slot (shared with Sephiroth)
    slot.phsAllowed |= 1 << 7;
    slot.phsVisible |= 1 << 7;
    // Put in party if not already present
    if (!slot.party.includes(0x0a) && !slot.party.includes(7)) {
      const empty = slot.party.findIndex((p) => p === 0xff || p === 255 || p == null);
      if (empty >= 0) slot.party[empty] = 0x0a;
      else slot.party[2] = 0x0a;
    } else {
      // Swap Vincent party ID to Sephiroth if present
      for (let i = 0; i < 3; i++) {
        if (slot.party[i] === 7) slot.party[i] = 0x0a;
      }
    }
  }

  function materiaSelectHtml(selected) {
    let html = `<option value="255">(Empty)</option>`;
    for (const m of MATERIA_OPTIONS) {
      html += `<option value="${m.id}" ${selected === m.id ? "selected" : ""}>${m.name}</option>`;
    }
    return html;
  }

  function itemSelectHtml(selected, categoryFilter) {
    let html = `<option value="511">(Empty)</option>`;
    for (const it of ITEM_OPTIONS) {
      if (categoryFilter && categoryFilter !== "all" && categoryFilter !== "owned" && it.category !== categoryFilter) {
        continue;
      }
      html += `<option value="${it.id}" ${selected === it.id ? "selected" : ""}>${it.name}</option>`;
    }
    return html;
  }

  function renderSlotBar() {
    const bar = $("slot-bar");
    bar.hidden = !state.save;
    if (!state.save) return;
    bar.innerHTML = "";
    state.save.slots.forEach((slot, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot-btn";
      if (!slot.empty) btn.classList.add("has-save");
      if (i === state.slotIndex) btn.classList.add("is-active");
      btn.disabled = !!slot.empty;
      btn.textContent = slot.empty ? `${i + 1}` : `${i + 1}`;
      btn.title = slot.empty
        ? `Slot ${i + 1} empty`
        : `Slot ${i + 1}: ${slot.previewName || "Save"} — ${slot.previewLocation || ""}`;
      btn.addEventListener("click", () => {
        if (slot.empty) return;
        flushForms();
        state.slotIndex = i;
        state.charIndex = 0;
        state.chocoIndex = 0;
        renderAll();
      });
      bar.appendChild(btn);
    });
  }

  function renderParty() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    $("slot-meta").textContent = `${slot.previewName || "Save"} · Lv ${slot.previewLevel} · ${slot.previewLocation || "—"}`;
    $("f-gil").value = slot.gil;
    $("f-time").value = slot.playTime;
    for (let i = 0; i < 3; i++) {
      const el = $(`f-party${i}`);
      el.innerHTML = partyOptionsHtml(slot.party[i]);
      el.value = String(slot.party[i] ?? 255);
    }
    renderPhs(slot);
    renderLove(slot);
  }

  function ensureLove(slot) {
    if (!slot.love) {
      slot.love = {
        aeris: 0, tifa: 0, yuffie: 0, barret: 0,
        battleAeris: 0, battleTifa: 0, battleYuffie: 0, battleBarret: 0,
      };
    }
    return slot.love;
  }

  function renderLove(slot) {
    const love = ensureLove(slot);
    const map = [
      ["f-love-aeris", "aeris"],
      ["f-love-tifa", "tifa"],
      ["f-love-yuffie", "yuffie"],
      ["f-love-barret", "barret"],
      ["f-love-battle-aeris", "battleAeris"],
      ["f-love-battle-tifa", "battleTifa"],
      ["f-love-battle-yuffie", "battleYuffie"],
      ["f-love-battle-barret", "battleBarret"],
    ];
    for (const [id, key] of map) {
      const el = $(id);
      if (el) el.value = love[key] ?? 0;
    }
    renderDatePredictor(slot);
  }

  function flushLove() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    const love = ensureLove(slot);
    love.aeris = Number($("f-love-aeris").value) || 0;
    love.tifa = Number($("f-love-tifa").value) || 0;
    love.yuffie = Number($("f-love-yuffie").value) || 0;
    love.barret = Number($("f-love-barret").value) || 0;
    love.battleAeris = Number($("f-love-battle-aeris").value) || 0;
    love.battleTifa = Number($("f-love-battle-tifa").value) || 0;
    love.battleYuffie = Number($("f-love-battle-yuffie").value) || 0;
    love.battleBarret = Number($("f-love-battle-barret").value) || 0;
    renderDatePredictor(slot);
  }

  function renderDatePredictor(slot) {
    const result = $("date-predictor-result");
    const scoresEl = $("date-predictor-scores");
    if (!result || !scoresEl) return;
    const love = ensureLove(slot || currentSlot() || {});
    const rows = [
      { id: "aeris", name: "Aeris", field: love.aeris || 0, battle: love.battleAeris || 0 },
      { id: "tifa", name: "Tifa", field: love.tifa || 0, battle: love.battleTifa || 0 },
      { id: "yuffie", name: "Yuffie", field: love.yuffie || 0, battle: love.battleYuffie || 0 },
      { id: "barret", name: "Barret", field: love.barret || 0, battle: love.battleBarret || 0 },
    ].map((r) => ({ ...r, total: r.field + r.battle }));

    // Tie-break order matches common FF7 date logic: Aeris → Tifa → Yuffie → Barret.
    let winner = rows[0];
    for (const r of rows) {
      if (r.total > winner.total) winner = r;
    }

    const aerisGone = slot && slot.chars && slot.chars[3] && (slot.chars[3].curHp === 0 && (slot.phsVisible & (1 << 3)) === 0);
    const note =
      winner.id === "aeris"
        ? "Predicted date: Aeris. (If she’s already gone from the party story-wise, the next-highest wins instead.)"
        : `Predicted date: ${winner.name}.`;

    result.textContent = note;
    scoresEl.innerHTML = rows
      .map(
        (r) =>
          `<li class="${r.id === winner.id ? "is-winner" : ""}"><span>${r.name}</span><span>${r.field} + ${r.battle} = <strong>${r.total}</strong></span></li>`
      )
      .join("");
    void aerisGone;
  }

  const PHS_CHARS = [
    { bit: 0, name: "Cloud" },
    { bit: 1, name: "Barret" },
    { bit: 2, name: "Tifa" },
    { bit: 3, name: "Aeris" },
    { bit: 4, name: "Red XIII" },
    { bit: 5, name: "Yuffie" },
    { bit: 6, name: "Cait Sith" },
    { bit: 7, name: "Vincent / Sephiroth" },
    { bit: 8, name: "Cid" },
  ];

  function renderPhs(slot) {
    const body = $("phs-body");
    if (!body) return;
    body.innerHTML = "";
    const allowed = slot.phsAllowed ?? 0;
    const visible = slot.phsVisible ?? 0;
    for (const c of PHS_CHARS) {
      const tr = document.createElement("tr");
      const aOn = (allowed & (1 << c.bit)) !== 0;
      const vOn = (visible & (1 << c.bit)) !== 0;
      tr.innerHTML = `
        <td>${c.name}</td>
        <td><label class="check"><input type="checkbox" data-phs="allowed" data-bit="${c.bit}" ${aOn ? "checked" : ""} /></label></td>
        <td><label class="check"><input type="checkbox" data-phs="visible" data-bit="${c.bit}" ${vOn ? "checked" : ""} /></label></td>
      `;
      body.appendChild(tr);
    }
    body.querySelectorAll("input[type=checkbox]").forEach((el) => {
      el.addEventListener("change", () => {
        flushPhs();
        setDirty(true);
      });
    });
  }

  function flushPhs() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    const body = $("phs-body");
    if (!body) return;
    let allowed = 0;
    let visible = 0;
    body.querySelectorAll("input[data-phs=allowed]").forEach((el) => {
      if (el.checked) allowed |= 1 << Number(el.dataset.bit);
    });
    body.querySelectorAll("input[data-phs=visible]").forEach((el) => {
      if (el.checked) visible |= 1 << Number(el.dataset.bit);
    });
    slot.phsAllowed = allowed;
    slot.phsVisible = visible;
  }

  function renderCharForm() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    const tabs = $("char-tabs");
    tabs.innerHTML = "";
    CHAR_TABS.forEach((tab, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-tab" + (i === state.charIndex ? " is-active" : "");
      btn.innerHTML = `<img class="char-tab__img" src="${tab.portrait}" alt="" width="28" height="28" /><span>${tab.name}</span>`;
      btn.addEventListener("click", () => {
        flushCharForm();
        state.charIndex = i;
        // Switching Vincent ↔ Sephiroth flips the shared record identity.
        slot.chars[tab.record].id = tab.id;
        renderCharForm();
        setDirty(true);
      });
      tabs.appendChild(btn);
    });

    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    const ch = slot.chars[tab.record];
    ch.id = tab.id;
    const fields = [
      ["name", "Name", "text"],
      ["level", "Level", "number", 1, 99],
      ["exp", "EXP", "number", 0, 99999999],
      ["expToNext", "EXP to next", "number", 0, 99999999],
      ["curHp", "Current HP", "number", 0, 9999],
      ["maxHp", "Max HP", "number", 0, 9999],
      ["baseHp", "Base HP", "number", 0, 9999],
      ["curMp", "Current MP", "number", 0, 9999],
      ["maxMp", "Max MP", "number", 0, 9999],
      ["baseMp", "Base MP", "number", 0, 9999],
      ["strength", "Strength", "number", 0, 255],
      ["vitality", "Vitality", "number", 0, 255],
      ["magic", "Magic", "number", 0, 255],
      ["spirit", "Spirit", "number", 0, 255],
      ["dexterity", "Dexterity", "number", 0, 255],
      ["luck", "Luck", "number", 0, 255],
      ["strengthBonus", "STR bonus (sources)", "number", 0, 255],
      ["vitalityBonus", "VIT bonus", "number", 0, 255],
      ["magicBonus", "MAG bonus", "number", 0, 255],
      ["spiritBonus", "SPI bonus", "number", 0, 255],
      ["dexterityBonus", "DEX bonus", "number", 0, 255],
      ["luckBonus", "LCK bonus", "number", 0, 255],
    ];

    const weaponOpts = FF7Data.equipmentSelectHtml(FF7Data.weaponsForChar(ch.id), ch.weapon);
    const armorOpts = FF7Data.equipmentSelectHtml(FF7Data.armorsList(), ch.armor);
    const accessoryOpts = FF7Data.equipmentSelectHtml(FF7Data.accessoriesList(), ch.accessory);

    const note =
      tab.id === 0x0a
        ? `<p class="panel-note">Sephiroth uses Vincent’s save slot. Enabling him replaces Vincent until you switch back.</p>`
        : tab.id === 7
          ? `<p class="panel-note">Vincent shares this slot with Sephiroth. Use the Sephiroth tab to swap identity.</p>`
          : "";

    const form = $("char-form");
    form.innerHTML =
      note +
      fields
        .map(([key, label, type, min, max]) => {
          const extra =
            type === "number"
              ? `type="number" min="${min}" max="${max}" step="1" data-key="${key}"`
              : `type="text" maxlength="9" data-key="${key}"`;
          return `<label>${label}<input class="char-field" ${extra} value="${escapeAttr(ch[key])}" /></label>`;
        })
        .join("") +
      `<label>Weapon<select class="char-field" data-key="weapon">${weaponOpts}</select></label>` +
      `<label>Armor<select class="char-field" data-key="armor">${armorOpts}</select></label>` +
      `<label>Accessory<select class="char-field" data-key="accessory">${accessoryOpts}</select></label>` +
      `<label>Row<select class="char-field" data-key="row">
        <option value="255"${ch.row !== 0xfe && ch.row !== 254 ? " selected" : ""}>Front</option>
        <option value="254"${ch.row === 0xfe || ch.row === 254 ? " selected" : ""}>Back</option>
      </select></label>`;

    form.querySelectorAll(".char-field").forEach((input) => {
      input.addEventListener("change", () => {
        flushCharForm();
        setDirty(true);
      });
    });

    renderLimits(ch);
    renderCharMateria(ch);
  }

  function renderCharMateria(ch) {
    const wBody = $("char-wmat");
    const aBody = $("char-amat");
    wBody.innerHTML = "";
    aBody.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      wBody.appendChild(materiaRow(ch.weaponMateria[i], i, "weapon"));
      aBody.appendChild(materiaRow(ch.armorMateria[i], i, "armor"));
    }
  }

  function materiaRow(mat, index, kind) {
    const tr = document.createElement("tr");
    const m = mat || { id: 0xff, ap: 0xffffff };
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><select data-kind="${kind}" data-index="${index}" data-field="id">${materiaSelectHtml(m.id)}</select></td>
      <td><input type="number" min="0" max="16777215" data-kind="${kind}" data-index="${index}" data-field="ap" value="${m.id === 0xff ? 0 : m.ap}" /></td>
    `;
    tr.querySelectorAll("select, input").forEach((el) => {
      el.addEventListener("change", () => {
        const slot = currentSlot();
        const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
        const ch = slot.chars[tab.record];
        const list = kind === "weapon" ? ch.weaponMateria : ch.armorMateria;
        const idEl = tr.querySelector('[data-field="id"]');
        const apEl = tr.querySelector('[data-field="ap"]');
        const id = Number(idEl.value);
        list[index] = {
          id,
          ap: id === 0xff ? 0xffffff : Number(apEl.value) || 0,
        };
        setDirty(true);
      });
    });
    return tr;
  }

  function flushCharForm() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    const ch = slot.chars[tab.record];
    ch.id = tab.id;
    $("char-form").querySelectorAll(".char-field").forEach((input) => {
      const key = input.dataset.key;
      if (input.tagName === "SELECT" || input.type === "number") ch[key] = Number(input.value) || 0;
      else ch[key] = input.value;
    });
    flushLimits();
  }

  function flushPartyForm() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    slot.gil = Number($("f-gil").value) || 0;
    slot.playTime = Number($("f-time").value) || 0;
    slot.party = [
      Number($("f-party0").value),
      Number($("f-party1").value),
      Number($("f-party2").value),
    ];
    flushPhs();
    flushLove();
    // Keep Vincent/Sephiroth identity in sync with party picks.
    if (slot.party.includes(0x0a)) {
      slot.chars[7].id = 0x0a;
      slot.phsAllowed |= 1 << 7;
      slot.phsVisible |= 1 << 7;
    } else if (slot.party.includes(7)) {
      slot.chars[7].id = 7;
    }
    if (slot.party.includes(0x09)) {
      slot.chars[6].id = 0x09;
      slot.phsAllowed |= 1 << 6;
      slot.phsVisible |= 1 << 6;
    }
  }

  function flushForms() {
    flushPartyForm();
    flushCharForm();
    flushProgress();
    flushChocoForm();
  }

  function renderProgress() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    if ($("f-gp")) {
      $("f-gp").value = slot.gp ?? 0;
      $("f-bp").value = slot.battlePoints ?? 0;
      $("f-disc").value = slot.disc ?? 1;
      $("f-map-id").value = slot.mapId ?? 0;
      $("f-loc-id").value = slot.locationId ?? 0;
      $("f-world-x").value = slot.worldX ?? 0;
      $("f-world-y").value = slot.worldY ?? 0;
      $("f-world-z").value = slot.worldZ ?? 0;
    }
    const vBox = $("vehicle-checks");
    if (vBox) {
      const vehicles = slot.vehicles ?? 0;
      vBox.innerHTML = window.FF7Data.VEHICLE_BITS.map(
        (v) =>
          `<label class="check"><input type="checkbox" data-vehicle="${v.bit}" ${(vehicles & v.bit) ? "checked" : ""} /> ${v.name}</label>`
      ).join("");
      vBox.querySelectorAll("input").forEach((el) => {
        el.addEventListener("change", () => {
          flushProgress();
          setDirty(true);
        });
      });
    }
    renderStolen(slot);
    updateSoftlockWarn(slot);
  }

  function updateSoftlockWarn(slot) {
    const el = $("softlock-warn");
    if (!el || !slot) return;
    const mapId = Number(slot.mapId) || 0;
    const locId = Number(slot.locationId) || 0;
    const disc = Number(slot.disc) || 1;
    const risky = disc < 1 || disc > 3 || mapId > 800 || locId > 800;
    el.hidden = !risky;
  }

  const SAFE_LOCS = {
    // Conservative “don’t brick the save” presets — keep original map if possible isn’t needed.
    kalm: { disc: 1, mapId: 74, locationId: 0, note: "Kalm-ish field IDs (verify in-game)" },
    world: { disc: 1, mapId: 0, locationId: 0, worldX: 0, worldY: 0, worldZ: 0, note: "Clears to world defaults — re-enter from menu carefully" },
  };

  function flushProgress() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    if ($("f-gp")) {
      slot.gp = Number($("f-gp").value) || 0;
      slot.battlePoints = Number($("f-bp").value) || 0;
      slot.disc = Number($("f-disc").value) || 1;
      slot.mapId = Number($("f-map-id").value) || 0;
      slot.locationId = Number($("f-loc-id").value) || 0;
      slot.worldX = Number($("f-world-x").value) || 0;
      slot.worldY = Number($("f-world-y").value) || 0;
      slot.worldZ = Number($("f-world-z").value) || 0;
    }
    const vBox = $("vehicle-checks");
    if (vBox) {
      let mask = 0;
      vBox.querySelectorAll("input[data-vehicle]").forEach((el) => {
        if (el.checked) mask |= Number(el.dataset.vehicle);
      });
      slot.vehicles = mask;
    }
    updateSoftlockWarn(slot);
  }

  function renderStolen(slot) {
    const body = $("stolen-body");
    if (!body) return;
    if (!slot.stolenMateria) {
      slot.stolenMateria = Array.from({ length: Save.STOLEN_MATERIA_SLOTS }, () => ({ id: 0xff, ap: 0xffffff }));
    }
    body.innerHTML = "";
    slot.stolenMateria.forEach((m, i) => {
      if (!m || m.id === 0xff) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i + 1}</td><td>${window.FF7Data.materiaName(m.id)}</td><td>${m.ap}</td>`;
      body.appendChild(tr);
    });
    if (!body.children.length) {
      body.innerHTML = `<tr><td colspan="3">(Empty — nothing stolen)</td></tr>`;
    }
  }

  function renderTools() {
    if (!state.save) return;
    const src = $("f-slot-src");
    const dst = $("f-slot-dst");
    if (!src || !dst) return;
    const opts = state.save.slots
      .map((s, i) => `<option value="${i}">Slot ${i + 1}${s.empty ? " (empty)" : ""}</option>`)
      .join("");
    src.innerHTML = opts;
    dst.innerHTML = opts;
    src.value = String(state.slotIndex);
    dst.value = String(Math.min(state.slotIndex + 1, Save.SLOT_COUNT - 1));
    renderPresetButtons();
  }

  function presetHelpers() {
    return {
      stockItems(slot, ids, qty) {
        for (const id of ids) {
          const existing = slot.items.findIndex((it) => it.id === id && it.qty > 0);
          if (existing >= 0) slot.items[existing].qty = qty;
          else {
            const empty = slot.items.findIndex((it) => it.id === 0x1ff || !it.qty);
            if (empty >= 0) slot.items[empty] = { id, qty };
          }
        }
      },
      ensureMateria(slot, ids, master) {
        for (const id of ids) {
          const have = slot.materia.some((m) => m && m.id === id);
          if (have) {
            slot.materia.forEach((m) => {
              if (m && m.id === id && master) m.ap = 0xffffff;
            });
            continue;
          }
          const empty = slot.materia.findIndex((m) => !m || m.id === 0xff);
          if (empty >= 0) slot.materia[empty] = { id, ap: master ? 0xffffff : 0 };
        }
      },
      maxChars(slot) {
        for (const ch of slot.chars) {
          unlockAllLimits(ch);
          ["strength", "vitality", "magic", "spirit", "dexterity", "luck"].forEach((k) => {
            ch[k] = 255;
          });
          ch.curHp = ch.maxHp;
          ch.curMp = ch.maxMp;
        }
      },
      allMateriaMastered(slot) {
        const { MATERIA_OPTIONS } = window.FF7Data;
        for (let i = 0; i < Save.MATERIA_SLOTS; i++) {
          if (i < MATERIA_OPTIONS.length) slot.materia[i] = { id: MATERIA_OPTIONS[i].id, ap: 0xffffff };
          else slot.materia[i] = { id: 0xff, ap: 0xffffff };
        }
      },
    };
  }

  function getCustomPresets() {
    try {
      return JSON.parse(localStorage.getItem("ff7_custom_presets") || "[]");
    } catch {
      return [];
    }
  }

  function renderPresetButtons() {
    const box = $("preset-buttons");
    if (!box) return;
    const builtins = window.FF7Data.LOADOUT_PRESETS || [];
    const custom = getCustomPresets();
    box.innerHTML = "";
    for (const p of builtins) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--accent";
      btn.title = p.desc || "";
      btn.textContent = p.name;
      btn.addEventListener("click", () => applyNamedPreset(p));
      box.appendChild(btn);
    }
    for (const p of custom) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = `Custom: ${p.name}`;
      btn.addEventListener("click", () => applyCustomPreset(p));
      box.appendChild(btn);
    }
  }

  function applyNamedPreset(preset) {
    const slot = currentSlot();
    if (!slot) return;
    if (!confirm(`Apply preset “${preset.name}” to this slot?`)) return;
    pushUndo();
    preset.apply(slot, presetHelpers());
    setDirty(true);
    renderAll();
    setStatus(`Applied preset: ${preset.name}`);
  }

  function applyCustomPreset(preset) {
    const slot = currentSlot();
    if (!slot || !preset.data) return;
    if (!confirm(`Apply custom preset “${preset.name}”?`)) return;
    pushUndo();
    const data = preset.data;
    if (data.gil != null) slot.gil = data.gil;
    if (data.gp != null) slot.gp = data.gp;
    if (data.love) slot.love = { ...slot.love, ...data.love };
    if (data.items) slot.items = data.items.map((x) => ({ ...x }));
    if (data.materia) slot.materia = data.materia.map((x) => ({ ...x }));
    setDirty(true);
    renderAll();
    setStatus(`Applied custom preset: ${preset.name}`);
  }

  function enableYoungCloud(slot) {
    const ch = slot.chars[6];
    ch.id = 0x09;
    if (!ch.name || ch.name === "CaitSith" || ch.name === "Cait Sith" || ch.name === "") ch.name = "Cloud";
    slot.phsAllowed |= 1 << 6;
    slot.phsVisible |= 1 << 6;
    if (!slot.party.includes(0x09) && !slot.party.includes(6)) {
      const empty = slot.party.findIndex((p) => p === 0xff || p === 255 || p == null);
      if (empty >= 0) slot.party[empty] = 0x09;
      else slot.party[2] = 0x09;
    } else {
      for (let i = 0; i < 3; i++) {
        if (slot.party[i] === 6) slot.party[i] = 0x09;
      }
    }
  }

  function maxEverything(slot) {
    slot.gil = 99999999;
    slot.gp = 10000;
    slot.battlePoints = 65535;
    slot.phsAllowed = 0x1ff;
    slot.phsVisible = 0x1ff;
    slot.vehicles = 0x01 | 0x04 | 0x10;
    for (const ch of slot.chars) {
      unlockAllLimits(ch);
      ["strength", "vitality", "magic", "spirit", "dexterity", "luck"].forEach((k) => {
        ch[k] = 255;
      });
      ch.curHp = ch.maxHp;
      ch.curMp = ch.maxMp;
    }
    const { KEY_ITEMS, setKeyItemOwned, ITEM_OPTIONS, MATERIA_OPTIONS } = window.FF7Data;
    if (!slot.keyItems) slot.keyItems = new Uint8Array(8);
    for (let i = 0; i < KEY_ITEMS.length; i++) setKeyItemOwned(slot.keyItems, i, true);
    for (let i = 0; i < Save.ITEM_SLOTS; i++) {
      if (i < ITEM_OPTIONS.length) slot.items[i] = { id: ITEM_OPTIONS[i].id, qty: 99 };
      else slot.items[i] = { id: 0x1ff, qty: 0 };
    }
    for (let i = 0; i < Save.MATERIA_SLOTS; i++) {
      if (i < MATERIA_OPTIONS.length) slot.materia[i] = { id: MATERIA_OPTIONS[i].id, ap: 0xffffff };
      else slot.materia[i] = { id: 0xff, ap: 0xffffff };
    }
  }

  function flushChocoForm() {
    const slot = currentSlot();
    if (!slot || slot.empty || !slot.chocobos) return;
    if ($("f-stables-owned")) {
      slot.stablesOwned = Number($("f-stables-owned").value) || 0;
      slot.stablesOccupied = Number($("f-stables-occupied").value) || 0;
    }
    const choco = slot.chocobos[state.chocoIndex];
    if (!choco || !$("choco-form")) return;
    $("choco-form").querySelectorAll(".choco-field").forEach((input) => {
      const key = input.dataset.key;
      if (input.tagName === "SELECT" || input.type === "number") choco[key] = Number(input.value) || 0;
      else choco[key] = input.value;
    });
    const occupied = $("f-choco-occupied");
    const cantMate = $("f-choco-cant-mate");
    if (occupied) {
      if (occupied.checked) slot.stablesMask |= 1 << state.chocoIndex;
      else slot.stablesMask &= ~(1 << state.chocoIndex);
    }
    if (cantMate) {
      if (cantMate.checked) slot.cantMateMask |= 1 << state.chocoIndex;
      else slot.cantMateMask &= ~(1 << state.chocoIndex);
    }
  }

  function syncStableCounts(slot) {
    let occupied = 0;
    for (let i = 0; i < 6; i++) {
      if (slot.stablesMask & (1 << i)) occupied++;
    }
    slot.stablesOccupied = occupied;
    if (slot.stablesOwned < occupied) slot.stablesOwned = occupied;
    if ($("f-stables-owned")) {
      $("f-stables-owned").value = slot.stablesOwned;
      $("f-stables-occupied").value = slot.stablesOccupied;
    }
  }

  function renderChocobos() {
    const slot = currentSlot();
    if (!slot || slot.empty || !slot.chocobos) return;
    $("f-stables-owned").value = slot.stablesOwned ?? 0;
    $("f-stables-occupied").value = slot.stablesOccupied ?? 0;

    const tabs = $("choco-tabs");
    tabs.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const c = slot.chocobos[i];
      const occupied = !!(slot.stablesMask & (1 << i));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-tab" + (i === state.chocoIndex ? " is-active" : "");
      const label = c.name || `Stable ${i + 1}`;
      const type = occupied ? CHOCO_TYPES[c.type] || "?" : "Empty";
      btn.textContent = `${i + 1}. ${label} (${type})`;
      btn.addEventListener("click", () => {
        flushChocoForm();
        state.chocoIndex = i;
        renderChocobos();
      });
      tabs.appendChild(btn);
    }

    const choco = slot.chocobos[state.chocoIndex];
    const form = $("choco-form");
    const typeOpts = CHOCO_TYPES.map(
      (t, i) => `<option value="${i}" ${choco.type === i ? "selected" : ""}>${t}</option>`
    ).join("");
    form.innerHTML = `
      <label>Name<input class="choco-field" type="text" maxlength="5" data-key="name" value="${escapeAttr(choco.name)}" /></label>
      <label>Type<select class="choco-field" data-key="type">${typeOpts}</select></label>
      <label>Sex<select class="choco-field" data-key="sex">
        <option value="0" ${choco.sex === 0 ? "selected" : ""}>Male</option>
        <option value="1" ${choco.sex === 1 ? "selected" : ""}>Female</option>
      </select></label>
      <label>Sprint<input class="choco-field" type="number" min="0" max="9999" data-key="sprint" value="${choco.sprint}" /></label>
      <label>Max sprint<input class="choco-field" type="number" min="0" max="9999" data-key="maxSprint" value="${choco.maxSprint}" /></label>
      <label>Speed<input class="choco-field" type="number" min="0" max="9999" data-key="speed" value="${choco.speed}" /></label>
      <label>Max speed<input class="choco-field" type="number" min="0" max="9999" data-key="maxSpeed" value="${choco.maxSpeed}" /></label>
      <label>Acceleration<input class="choco-field" type="number" min="0" max="255" data-key="acceleration" value="${choco.acceleration}" /></label>
      <label>Cooperation<input class="choco-field" type="number" min="0" max="255" data-key="cooperation" value="${choco.cooperation}" /></label>
      <label>Intelligence<input class="choco-field" type="number" min="0" max="255" data-key="intelligence" value="${choco.intelligence}" /></label>
      <label>Personality<input class="choco-field" type="number" min="0" max="255" data-key="personality" value="${choco.personality}" /></label>
      <label>Races won<input class="choco-field" type="number" min="0" max="255" data-key="racesWon" value="${choco.racesWon}" /></label>
      <label>Stamina<input class="choco-field" type="number" min="0" max="9999" data-key="stamina" value="${choco.stamina}" /></label>
      <label>P-count<input class="choco-field" type="number" min="0" max="255" data-key="pcount" value="${choco.pcount}" /></label>
    `;
    form.querySelectorAll(".choco-field").forEach((el) => {
      el.addEventListener("change", () => {
        flushChocoForm();
        setDirty(true);
      });
    });

    const flags = $("choco-flags");
    const occupied = !!(slot.stablesMask & (1 << state.chocoIndex));
    const cantMate = !!(slot.cantMateMask & (1 << state.chocoIndex));
    flags.innerHTML = `
      <label class="check"><input id="f-choco-occupied" type="checkbox" ${occupied ? "checked" : ""} /> Stable occupied</label>
      <label class="check"><input id="f-choco-cant-mate" type="checkbox" ${cantMate ? "checked" : ""} /> Can't mate (recently born/mated)</label>
    `;
    flags.querySelectorAll("input").forEach((el) => {
      el.addEventListener("change", () => {
        flushChocoForm();
        syncStableCounts(slot);
        setDirty(true);
        renderChocobos();
      });
    });
  }

  function renderItems() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    const filter = $("item-filter").value;
    const search = ($("item-search").value || "").trim().toLowerCase();
    const body = $("items-body");
    body.innerHTML = "";

    slot.items.forEach((it, index) => {
      const empty = it.id === 0x1ff || !it.qty;
      const cat = empty ? "" : itemCategory(it.id);
      const name = empty ? "" : itemName(it.id).toLowerCase();
      if (filter === "owned" && empty) return;
      if (filter !== "all" && filter !== "owned" && cat !== filter) return;
      if (search && !name.includes(search) && !empty) return;
      if (search && empty) return;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${empty ? "—" : `<span class="cat-pill">${cat}</span>`}</td>
        <td><select data-slot="${index}">${itemSelectHtml(empty ? 0x1ff : it.id, "all")}</select></td>
        <td><input type="number" min="0" max="127" value="${empty ? 0 : it.qty}" data-slot="${index}" /></td>
        <td><button type="button" class="btn btn--danger" data-clear="${index}">Clear</button></td>
      `;
      const sel = tr.querySelector("select");
      const qty = tr.querySelector('input[type="number"]');
      const sync = () => {
        const id = Number(sel.value);
        const q = Number(qty.value) || 0;
        if (id === 0x1ff || q <= 0) slot.items[index] = { id: 0x1ff, qty: 0 };
        else slot.items[index] = { id, qty: Math.min(127, q) };
        setDirty(true);
      };
      sel.addEventListener("change", sync);
      qty.addEventListener("change", sync);
      tr.querySelector("[data-clear]").addEventListener("click", () => {
        slot.items[index] = { id: 0x1ff, qty: 0 };
        setDirty(true);
        renderItems();
      });
      body.appendChild(tr);
    });
  }

  function renderMateria() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    const filter = $("mat-filter").value;
    const body = $("materia-body");
    body.innerHTML = "";

    slot.materia.forEach((m, index) => {
      const empty = m.id === 0xff;
      if (filter === "owned" && empty) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><select data-slot="${index}">${materiaSelectHtml(m.id)}</select></td>
        <td><input type="number" min="0" max="16777215" value="${empty ? 0 : m.ap}" data-slot="${index}" /></td>
        <td><button type="button" class="btn btn--danger" data-clear="${index}">Clear</button></td>
      `;
      const sel = tr.querySelector("select");
      const ap = tr.querySelector('input[type="number"]');
      const sync = () => {
        const id = Number(sel.value);
        if (id === 0xff) slot.materia[index] = { id: 0xff, ap: 0xffffff };
        else slot.materia[index] = { id, ap: Number(ap.value) || 0 };
        setDirty(true);
      };
      sel.addEventListener("change", sync);
      ap.addEventListener("change", sync);
      tr.querySelector("[data-clear]").addEventListener("click", () => {
        slot.materia[index] = { id: 0xff, ap: 0xffffff };
        setDirty(true);
        renderMateria();
      });
      body.appendChild(tr);
    });
  }

  function renderAll() {
    const has = !!(state.save && currentSlot() && !currentSlot().empty);
    $("empty-state").hidden = has;
    $("tabs").hidden = !has;
    ["party", "chars", "items", "keyitems", "missables", "materia", "progress", "tools", "diff", "chocobos"].forEach((id) => {
      $(`panel-${id}`).hidden = !has;
    });
    renderSlotBar();
    if (!has) return;
    renderParty();
    renderCharForm();
    renderItems();
    renderKeyItems();
    renderMissables();
    renderMateria();
    renderEnemySkills();
    renderProgress();
    renderTools();
    renderChocobos();
  }

  function collectEnemySkillMateria(slot) {
    const id = window.FF7Data.ENEMY_SKILL_MATERIA_ID;
    const list = [];
    for (const m of slot.materia || []) {
      if (m && m.id === id) list.push(m);
    }
    for (const ch of slot.chars || []) {
      for (const m of ch.weaponMateria || []) if (m && m.id === id) list.push(m);
      for (const m of ch.armorMateria || []) if (m && m.id === id) list.push(m);
    }
    return list;
  }

  function renderEnemySkills() {
    const slot = currentSlot();
    const box = $("eskill-checks");
    if (!slot || slot.empty || !box) return;
    const { ENEMY_SKILLS, enemySkillMask, setEnemySkillBit } = window.FF7Data;
    const mats = collectEnemySkillMateria(slot);
    const mask = mats.length ? enemySkillMask(mats[0].ap) : 0;
    box.innerHTML = ENEMY_SKILLS.map((skill, bit) => {
      const name = typeof skill === "string" ? skill : skill.name;
      const enemy = typeof skill === "string" ? "" : skill.enemy;
      const on = (mask & (1 << bit)) !== 0;
      return `<label class="check check--eskill"><input type="checkbox" data-eskill="${bit}" ${on ? "checked" : ""} /><span><strong>${name}</strong>${enemy ? `<small>${enemy}</small>` : ""}</span></label>`;
    }).join("");
    if (!mats.length) {
      box.insertAdjacentHTML(
        "afterbegin",
        `<p class="panel-note">No Enemy Skill materia found — add one in the list above, then re-open this section.</p>`
      );
    }
    box.querySelectorAll("input[data-eskill]").forEach((el) => {
      el.addEventListener("change", () => {
        const bit = Number(el.dataset.eskill);
        let found = collectEnemySkillMateria(slot);
        if (!found.length) {
          const empty = slot.materia.findIndex((m) => !m || m.id === 0xff);
          if (empty >= 0) {
            slot.materia[empty] = { id: window.FF7Data.ENEMY_SKILL_MATERIA_ID, ap: 0 };
            found = collectEnemySkillMateria(slot);
          }
        }
        for (const m of found) {
          m.ap = setEnemySkillBit(m.ap, bit, el.checked);
        }
        setDirty(true);
        renderMateria();
      });
    });
  }

  function applyEnemySkillMask(slot, mask) {
    let found = collectEnemySkillMateria(slot);
    if (!found.length) {
      const empty = slot.materia.findIndex((m) => !m || m.id === 0xff);
      if (empty >= 0) {
        slot.materia[empty] = { id: window.FF7Data.ENEMY_SKILL_MATERIA_ID, ap: mask };
        return;
      }
    }
    for (const m of found) m.ap = mask & 0xffffff;
  }

  function renderKeyItems() {
    const slot = currentSlot();
    const box = $("keyitems-checks");
    if (!slot || slot.empty || !box) return;
    if (!slot.keyItems || slot.keyItems.length < 8) slot.keyItems = new Uint8Array(8);
    const { KEY_ITEMS, keyItemOwned, setKeyItemOwned } = window.FF7Data;
    box.innerHTML = KEY_ITEMS.map((name, index) => {
      const on = keyItemOwned(slot.keyItems, index);
      return `<label class="check"><input type="checkbox" data-keyitem="${index}" ${on ? "checked" : ""} /> ${name}</label>`;
    }).join("");
    box.querySelectorAll("input[data-keyitem]").forEach((el) => {
      el.addEventListener("change", () => {
        setKeyItemOwned(slot.keyItems, Number(el.dataset.keyitem), el.checked);
        setDirty(true);
        renderMissables();
      });
    });
  }

  function renderMissables() {
    const slot = currentSlot();
    if (!slot || slot.empty) return;
    const { TURTLE_FLYERS, KEY_ITEMS, KEY_ITEM_TIPS, keyItemOwned, setKeyItemOwned } = window.FF7Data;
    const flyers = slot.turtleFlyers ?? 0;
    const flyerBox = $("flyer-checks");
    const summary = $("flyer-summary");
    if (flyerBox) {
      flyerBox.innerHTML = TURTLE_FLYERS.map((f) => {
        const on = (flyers & f.bit) !== 0;
        return `<label class="check"><input type="checkbox" data-flyer="${f.bit}" ${on ? "checked" : ""} /> <span><strong>${f.name}</strong> — ${f.where}</span></label>`;
      }).join("");
      flyerBox.querySelectorAll("input[data-flyer]").forEach((el) => {
        el.addEventListener("change", () => {
          let mask = 0;
          flyerBox.querySelectorAll("input[data-flyer]").forEach((c) => {
            if (c.checked) mask |= Number(c.dataset.flyer);
          });
          slot.turtleFlyers = mask;
          setDirty(true);
          renderMissables();
        });
      });
    }
    if (summary) {
      const seen = TURTLE_FLYERS.filter((f) => f.bit !== 0x80 && (flyers & f.bit)).length;
      const rewarded = (flyers & 0x80) !== 0;
      summary.textContent = `${seen}/7 flyers marked${rewarded ? " · reward claimed" : " · reward not claimed yet"}.`;
    }

    const tipBox = $("missable-keyitems");
    if (tipBox) {
      if (!slot.keyItems) slot.keyItems = new Uint8Array(8);
      tipBox.innerHTML = KEY_ITEMS.map((name, index) => {
        const tip = KEY_ITEM_TIPS[name];
        if (!tip) return "";
        const on = keyItemOwned(slot.keyItems, index);
        return `<label class="missable-row"><input type="checkbox" data-mkey="${index}" ${on ? "checked" : ""} /><span class="missable-row__text"><strong>${name}</strong><small>${tip}</small></span></label>`;
      }).join("");
      tipBox.querySelectorAll("input[data-mkey]").forEach((el) => {
        el.addEventListener("change", () => {
          setKeyItemOwned(slot.keyItems, Number(el.dataset.mkey), el.checked);
          setDirty(true);
          renderKeyItems();
        });
      });
    }
  }

  function escapeAttr(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function downloadBytes(filename, bytes) {
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadArrayBuffer(buf, name) {
    try {
      const parsed = Save.parseFile(buf);
      const first = parsed.slots.findIndex((s) => !s.empty);
      if (first < 0) throw new Error("No used save slots found in this file.");
      state.save = parsed;
      state.backup = new Uint8Array(buf);
      state.fileName = name || "save00.ff7";
      state.slotIndex = first;
      state.charIndex = 0;
      state.chocoIndex = 0;
      state.undoStack = [];
      state.redoStack = [];
      state.fileHandle = null;
      setDirty(false);
      renderAll();
      setStatus(`Loaded ${state.fileName} · ${usedSlots().length} slot(s) used · editing slot ${state.slotIndex + 1}`);
      if (window.__ff7PendingBuild) {
        const build = window.__ff7PendingBuild;
        if (confirm(`Apply shared build “${build.tab || build.name}” to the matching character?`)) {
          pushUndo();
          const record =
            build.id === 0x0a ? 7 : build.id === 0x09 ? 6 : Math.max(0, Math.min(8, build.id | 0));
          const ch = state.save.slots[state.slotIndex].chars[record];
          Object.assign(ch, {
            name: build.name ?? ch.name,
            level: build.level ?? ch.level,
            weapon: build.weapon ?? ch.weapon,
            armor: build.armor ?? ch.armor,
            accessory: build.accessory ?? ch.accessory,
            ...(build.stats || {}),
          });
          if (build.weaponMateria) ch.weaponMateria = build.weaponMateria;
          if (build.armorMateria) ch.armorMateria = build.armorMateria;
          window.__ff7PendingBuild = null;
          setDirty(true);
          renderAll();
          setStatus("Shared build applied.");
        }
      }
    } catch (err) {
      setStatus(err.message || String(err));
      alert(err.message || String(err));
    }
  }

  function saveChanges() {
    if (!state.save) return;
    flushForms();
    const bytes = Save.buildFile(state.save);
    downloadBytes(state.fileName || "save00.ff7", bytes);
    setDirty(false);
    $("install-modal").hidden = false;
    setStatus(`Downloaded ${state.fileName}. Overwrite the Steam save file with this download.`);
  }

  // Tabs
  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    $("tabs").querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
    btn.classList.add("is-active");
    const id = btn.dataset.tab;
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
    $(`panel-${id}`).classList.add("is-active");
  });

  // Party fields
  ["f-gil", "f-time", "f-party0", "f-party1", "f-party2"].forEach((id) => {
    $(id).addEventListener("change", () => {
      flushPartyForm();
      setDirty(true);
    });
  });

  [
    "f-love-aeris", "f-love-tifa", "f-love-yuffie", "f-love-barret",
    "f-love-battle-aeris", "f-love-battle-tifa", "f-love-battle-yuffie", "f-love-battle-barret",
  ].forEach((id) => {
    $(id).addEventListener("change", () => {
      flushLove();
      setDirty(true);
    });
  });

  function forceDate(who) {
    const slot = currentSlot();
    if (!slot) return;
    const love = ensureLove(slot);
    love.aeris = who === "aeris" ? 255 : 0;
    love.tifa = who === "tifa" ? 255 : 0;
    love.yuffie = who === "yuffie" ? 255 : 0;
    love.barret = who === "barret" ? 255 : 0;
    love.battleAeris = who === "aeris" ? 255 : 0;
    love.battleTifa = who === "tifa" ? 255 : 0;
    love.battleYuffie = who === "yuffie" ? 255 : 0;
    love.battleBarret = who === "barret" ? 255 : 0;
    renderLove(slot);
    setDirty(true);
    setStatus(`Love points set for ${who} date.`);
  }

  $("btn-love-aeris").addEventListener("click", () => forceDate("aeris"));
  $("btn-love-tifa").addEventListener("click", () => forceDate("tifa"));
  $("btn-love-yuffie").addEventListener("click", () => forceDate("yuffie"));
  $("btn-love-barret").addEventListener("click", () => forceDate("barret"));

  $("btn-max-gil").addEventListener("click", () => {
    $("f-gil").value = 99999999;
    flushPartyForm();
    setDirty(true);
  });

  $("btn-enable-sephiroth").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    enableSephiroth(slot);
    // Jump character tab to Sephiroth
    state.charIndex = CHAR_TABS.findIndex((t) => t.id === 0x0a);
    setDirty(true);
    renderParty();
    renderCharForm();
    setStatus("Sephiroth enabled — shared with Vincent’s slot, added to party / PHS.");
  });

  $("btn-enable-young-cloud").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    enableYoungCloud(slot);
    state.charIndex = CHAR_TABS.findIndex((t) => t.id === 0x09);
    if (state.charIndex < 0) state.charIndex = 0;
    setDirty(true);
    renderParty();
    renderCharForm();
    setStatus("Young Cloud enabled — shares Cait Sith’s slot.");
  });

  $("btn-max-everything").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    if (!confirm("Max gil, GP, BP, PHS, vehicles, stats, limits, items, materia, and key items?")) return;
    pushUndo();
    maxEverything(slot);
    setDirty(true);
    renderAll();
    setStatus("Maxed common progression fields.");
  });

  $("btn-phs-unlock-all").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.phsAllowed = 0x1ff;
    slot.phsVisible |= 0x1ff;
    setDirty(true);
    renderPhs(slot);
    setStatus("All characters unlocked in PHS.");
  });

  $("btn-phs-show-all").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.phsVisible = 0x1ff;
    setDirty(true);
    renderPhs(slot);
    setStatus("All characters visible in PHS.");
  });

  $("btn-max-stats").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    const ch = slot.chars[tab.record];
    ["strength", "vitality", "magic", "spirit", "dexterity", "luck"].forEach((k) => {
      ch[k] = 255;
    });
    setDirty(true);
    renderCharForm();
  });

  $("btn-fill-hpmp").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    const ch = slot.chars[tab.record];
    ch.curHp = ch.maxHp;
    ch.curMp = ch.maxMp;
    setDirty(true);
    renderCharForm();
  });

  $("btn-apply-level-exp").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    flushCharForm();
    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    const ch = slot.chars[tab.record];
    const level = Math.max(1, Math.min(99, ch.level | 0));
    ch.level = level;
    ch.exp = window.FF7Data.expForLevel(level, ch.id);
    ch.expToNext = window.FF7Data.expToNextForLevel(level, ch.id);
    ch.curHp = ch.maxHp;
    ch.curMp = ch.maxMp;
    setDirty(true);
    renderCharForm();
    setStatus(`Set EXP for level ${level} (Cloud curve) and filled HP/MP.`);
  });

  $("btn-unlock-limits-current").addEventListener("click", () => {
    const ch = currentChar();
    if (!ch) return;
    unlockAllLimits(ch);
    setDirty(true);
    renderCharForm();
    setStatus("Unlocked all limit breaks for the current character.");
  });

  $("btn-unlock-limits-all").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.chars.forEach((ch) => unlockAllLimits(ch));
    setDirty(true);
    renderCharForm();
    setStatus("Unlocked all limit breaks for every character.");
  });

  $("btn-fill-limit-bar").addEventListener("click", () => {
    const ch = currentChar();
    if (!ch) return;
    ch.limitBar = 255;
    setDirty(true);
    renderCharForm();
  });

  ["f-limit-level", "f-limit-bar", "f-kills", "f-limit1-used", "f-limit2-used", "f-limit3-used"].forEach((id) => {
    $(id).addEventListener("change", () => {
      flushLimits();
      setDirty(true);
    });
  });

  $("item-filter").addEventListener("change", renderItems);
  $("item-search").addEventListener("input", renderItems);
  $("mat-filter").addEventListener("change", renderMateria);

  $("btn-add-item").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    const idStr = prompt("Item ID (0–319). Examples: 0 Potion, 7 Phoenix Down, 128 Buster Sword, 306 Ribbon", "0");
    if (idStr == null) return;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id < 0 || id > 319) {
      alert("Invalid item ID");
      return;
    }
    const qty = Math.min(99, Math.max(1, Number(prompt("Quantity (1–99)", "99")) || 99));
    const empty = slot.items.findIndex((it) => it.id === 0x1ff || !it.qty);
    if (empty < 0) {
      alert("No empty item slots");
      return;
    }
    slot.items[empty] = { id, qty };
    setDirty(true);
    $("item-filter").value = "owned";
    renderItems();
  });

  $("btn-max-common").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    const commons = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 70]; // potions…tent
    for (const id of commons) {
      const existing = slot.items.findIndex((it) => it.id === id && it.qty > 0);
      if (existing >= 0) {
        slot.items[existing].qty = 99;
      } else {
        const empty = slot.items.findIndex((it) => it.id === 0x1ff || !it.qty);
        if (empty >= 0) slot.items[empty] = { id, qty: 99 };
      }
    }
    setDirty(true);
    $("item-filter").value = "owned";
    renderItems();
  });

  $("btn-add-all-items").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    if (!confirm(`Replace item stock with all ${ITEM_OPTIONS.length} items at ×99?`)) return;
    for (let i = 0; i < Save.ITEM_SLOTS; i++) {
      if (i < ITEM_OPTIONS.length) slot.items[i] = { id: ITEM_OPTIONS[i].id, qty: 99 };
      else slot.items[i] = { id: 0x1ff, qty: 0 };
    }
    setDirty(true);
    $("item-filter").value = "owned";
    renderItems();
    setStatus(`Added all ${ITEM_OPTIONS.length} items ×99.`);
  });

  $("btn-keyitems-all").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    if (!slot.keyItems) slot.keyItems = new Uint8Array(8);
    const { KEY_ITEMS, setKeyItemOwned } = window.FF7Data;
    for (let i = 0; i < KEY_ITEMS.length; i++) setKeyItemOwned(slot.keyItems, i, true);
    setDirty(true);
    renderKeyItems();
    renderMissables();
    setStatus("All key items granted.");
  });

  $("btn-keyitems-clear").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.keyItems = new Uint8Array(8);
    setDirty(true);
    renderKeyItems();
    renderMissables();
    setStatus("Key items cleared.");
  });

  $("btn-flyers-all").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.turtleFlyers = 0x7f; // all flyers, not auto-claim reward
    setDirty(true);
    renderMissables();
    setStatus("All Turtle Paradise flyers marked seen.");
  });

  $("btn-flyers-clear").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.turtleFlyers = 0;
    setDirty(true);
    renderMissables();
  });

  $("btn-add-materia").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    const names = MATERIA_OPTIONS.map((m) => `${m.id}=${m.name}`).join(", ");
    const idStr = prompt(`Materia ID. Common: 49 Master Magic, 90 Master Summon, 89 Knights of Round.\n(${names.slice(0, 200)}…)`, "89");
    if (idStr == null) return;
    const id = Number(idStr);
    if (!Number.isFinite(id) || id < 0 || id > 0x5a) {
      alert("Invalid materia ID");
      return;
    }
    const empty = slot.materia.findIndex((m) => m.id === 0xff);
    if (empty < 0) {
      alert("No empty materia slots");
      return;
    }
    slot.materia[empty] = { id, ap: 0xffffff };
    setDirty(true);
    $("mat-filter").value = "owned";
    renderMateria();
  });

  $("btn-add-all-materia").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    if (!confirm(`Replace materia stock with all ${MATERIA_OPTIONS.length} materia (mastered)?`)) return;
    for (let i = 0; i < Save.MATERIA_SLOTS; i++) {
      if (i < MATERIA_OPTIONS.length) {
        slot.materia[i] = { id: MATERIA_OPTIONS[i].id, ap: 0xffffff };
      } else {
        slot.materia[i] = { id: 0xff, ap: 0xffffff };
      }
    }
    setDirty(true);
    $("mat-filter").value = "owned";
    renderMateria();
    setStatus(`Added all ${MATERIA_OPTIONS.length} materia (mastered).`);
  });

  $("btn-master-all").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.materia.forEach((m) => {
      if (m.id !== 0xff) m.ap = 0xffffff;
    });
    setDirty(true);
    renderMateria();
    renderEnemySkills();
  });

  $("btn-eskill-all").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    applyEnemySkillMask(slot, 0xffffff);
    setDirty(true);
    renderMateria();
    renderEnemySkills();
    setStatus("All Enemy Skills learned on E.Skill materia.");
  });

  $("btn-eskill-clear").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    applyEnemySkillMask(slot, 0);
    setDirty(true);
    renderMateria();
    renderEnemySkills();
    setStatus("Enemy Skills cleared.");
  });

  ["f-stables-owned", "f-stables-occupied"].forEach((id) => {
    $(id).addEventListener("change", () => {
      flushChocoForm();
      setDirty(true);
    });
  });

  $("btn-fill-gold-chocobos").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    const names = ["Gold1", "Gold2", "Gold3", "Gold4", "Gold5", "Gold6"];
    for (let i = 0; i < 6; i++) {
      Object.assign(slot.chocobos[i], {
        index: i,
        name: names[i],
        type: 4,
        sex: i % 2,
        sprint: 255,
        maxSprint: 255,
        speed: 255,
        maxSpeed: 255,
        acceleration: 100,
        cooperation: 100,
        intelligence: 100,
        personality: 0,
        pcount: 0,
        racesWon: 0,
        stamina: 9999,
      });
    }
    slot.stablesOwned = 6;
    slot.stablesOccupied = 6;
    slot.stablesMask = 0x3f;
    slot.cantMateMask = 0;
    setDirty(true);
    renderChocobos();
    setStatus("Filled all 6 stables with max gold chocobos.");
  });

  $("btn-max-choco-stats").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    flushChocoForm();
    const c = slot.chocobos[state.chocoIndex];
    c.sprint = 255;
    c.maxSprint = 255;
    c.speed = 255;
    c.maxSpeed = 255;
    c.acceleration = 100;
    c.cooperation = 100;
    c.intelligence = 100;
    c.stamina = 9999;
    slot.stablesMask |= 1 << state.chocoIndex;
    syncStableCounts(slot);
    setDirty(true);
    renderChocobos();
  });

  $("btn-clear-choco").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    Object.assign(slot.chocobos[state.chocoIndex], EMPTY_CHOCO(), { index: state.chocoIndex });
    slot.stablesMask &= ~(1 << state.chocoIndex);
    slot.cantMateMask &= ~(1 << state.chocoIndex);
    syncStableCounts(slot);
    setDirty(true);
    renderChocobos();
  });

  $("file-input").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    state.fileHandle = null;
    await loadArrayBuffer(buf, file.name);
    e.target.value = "";
  });

  if (window.GGSaveFolders) {
    GGSaveFolders.wireEditor("ff7", {
      setStatus,
      async onFile(file, handle) {
        const buf = await file.arrayBuffer();
        await loadArrayBuffer(buf, file.name);
        state.fileHandle = handle;
        setStatus(`Loaded via Find Save: ${file.name}. You can Save in place.`);
        setDirty(false);
      },
    });
  }

  $("btn-save-inplace").addEventListener("click", async () => {
    if (!state.save || !state.fileHandle) {
      alert("Open a save with “Find Save” first (Chrome/Edge).");
      return;
    }
    try {
      flushForms();
      const bytes = Save.buildFile(state.save);
      const writable = await state.fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      setDirty(false);
      setStatus(`Saved in place to ${state.fileName}.`);
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  $("btn-backup").addEventListener("click", () => {
    if (!state.backup) return;
    const base = (state.fileName || "save00.ff7").replace(/\.ff7$/i, "");
    downloadBytes(`${base}.backup.ff7`, state.backup);
  });

  $("btn-save").addEventListener("click", saveChanges);
  $("btn-close-modal").addEventListener("click", () => {
    $("install-modal").hidden = true;
  });
  $("install-modal").addEventListener("click", (e) => {
    if (e.target === $("install-modal")) $("install-modal").hidden = true;
  });

  ["f-gp", "f-bp", "f-disc", "f-map-id", "f-loc-id", "f-world-x", "f-world-y", "f-world-z"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", () => {
      flushProgress();
      setDirty(true);
    });
  });

  $("btn-max-gp").addEventListener("click", () => {
    $("f-gp").value = 10000;
    flushProgress();
    setDirty(true);
  });
  $("btn-max-bp").addEventListener("click", () => {
    $("f-bp").value = 65535;
    flushProgress();
    setDirty(true);
  });

  function applySafeLocation(key) {
    const slot = currentSlot();
    const preset = SAFE_LOCS[key];
    if (!slot || !preset) return;
    if (!confirm(`Apply softlock-safe preset “${key}”? ${preset.note}`)) return;
    pushUndo();
    slot.disc = preset.disc;
    slot.mapId = preset.mapId;
    slot.locationId = preset.locationId;
    if (preset.worldX != null) {
      slot.worldX = preset.worldX;
      slot.worldY = preset.worldY;
      slot.worldZ = preset.worldZ;
    }
    setDirty(true);
    renderProgress();
    setStatus(`Applied safe location preset: ${key}`);
  }

  $("btn-safe-kalm").addEventListener("click", () => applySafeLocation("kalm"));
  $("btn-safe-world").addEventListener("click", () => applySafeLocation("world"));

  $("btn-return-stolen").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot || !slot.stolenMateria) return;
    let moved = 0;
    for (let i = 0; i < slot.stolenMateria.length; i++) {
      const m = slot.stolenMateria[i];
      if (!m || m.id === 0xff) continue;
      const empty = slot.materia.findIndex((x) => !x || x.id === 0xff);
      if (empty < 0) break;
      slot.materia[empty] = { id: m.id, ap: m.ap };
      slot.stolenMateria[i] = { id: 0xff, ap: 0xffffff };
      moved++;
    }
    setDirty(true);
    renderStolen(slot);
    renderMateria();
    setStatus(`Returned ${moved} stolen materia to inventory.`);
  });

  $("btn-clear-stolen").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    slot.stolenMateria = Array.from({ length: Save.STOLEN_MATERIA_SLOTS }, () => ({ id: 0xff, ap: 0xffffff }));
    setDirty(true);
    renderStolen(slot);
    setStatus("Cleared Yuffie stolen materia stash.");
  });

  $("btn-slot-copy").addEventListener("click", () => {
    if (!state.save) return;
    const src = Number($("f-slot-src").value);
    const dst = Number($("f-slot-dst").value);
    if (src === dst) {
      alert("Source and destination must differ.");
      return;
    }
    const srcSlot = state.save.slots[src];
    if (!srcSlot || srcSlot.empty) {
      alert("Source slot is empty.");
      return;
    }
    flushForms();
    const copyBytes = new Uint8Array(srcSlot._bytes);
    // Deep-ish clone via JSON for structured fields + raw slot bytes.
    const clone = JSON.parse(
      JSON.stringify({
        ...srcSlot,
        keyItems: Array.from(srcSlot.keyItems || []),
        _bytes: undefined,
      })
    );
    clone.keyItems = new Uint8Array(clone.keyItems || []);
    clone._bytes = copyBytes;
    clone.empty = false;
    state.save.slots[dst] = clone;
    setDirty(true);
    state.slotIndex = dst;
    renderAll();
    setStatus(`Copied slot ${src + 1} → ${dst + 1}.`);
  });

  $("btn-slot-clear").addEventListener("click", () => {
    if (!state.save) return;
    const dst = Number($("f-slot-dst").value);
    if (!confirm(`Clear slot ${dst + 1}?`)) return;
    const bytes = new Uint8Array(0x10f4);
    bytes.fill(0xff);
    // Minimal empty marker used by isSlotEmpty checks — leave mostly blank
    state.save.slots[dst] = { empty: true, _bytes: bytes };
    if (state.slotIndex === dst) {
      const first = state.save.slots.findIndex((s) => !s.empty);
      state.slotIndex = first >= 0 ? first : 0;
    }
    setDirty(true);
    renderAll();
    setStatus(`Cleared slot ${dst + 1}.`);
  });

  $("btn-export-char").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    flushCharForm();
    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    const ch = slot.chars[tab.record];
    const blob = new Blob([JSON.stringify({ tab: tab.name, character: ch }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ff7-${tab.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("btn-export-slot").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    flushForms();
    const exportable = {
      ...slot,
      keyItems: Array.from(slot.keyItems || []),
      _bytes: undefined,
    };
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ff7-slot-${state.slotIndex + 1}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("btn-party-card").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    flushForms();
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    const grd = ctx.createLinearGradient(0, 0, 900, 420);
    grd.addColorStop(0, "#0e1412");
    grd.addColorStop(1, "#1c2b26");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 900, 420);
    ctx.fillStyle = "#3ecf8e";
    ctx.font = "bold 28px Segoe UI";
    ctx.fillText("GGdropmans FF7 Party Card", 36, 48);
    ctx.fillStyle = "#e6f2ec";
    ctx.font = "18px Segoe UI";
    ctx.fillText(`${slot.previewName || "Save"} · Lv ${slot.previewLevel} · ${slot.previewLocation || ""}`, 36, 84);
    ctx.fillText(`Gil ${slot.gil.toLocaleString()} · GP ${slot.gp ?? 0} · Disc ${slot.disc ?? "?"}`, 36, 114);
    const names = ["Cloud", "Barret", "Tifa", "Aeris", "Red XIII", "Yuffie", "Cait Sith", "Vincent", "Cid"];
    slot.party.forEach((pid, i) => {
      const label = pid === 0xff || pid == null ? "(Empty)" : names[pid] || `#${pid}`;
      const ch = pid >= 0 && pid < 9 ? slot.chars[pid] : pid === 0x0a ? slot.chars[7] : pid === 0x09 ? slot.chars[6] : null;
      ctx.fillStyle = "#8eaea0";
      ctx.fillText(`Party ${i + 1}`, 36, 170 + i * 70);
      ctx.fillStyle = "#e6f2ec";
      ctx.font = "bold 22px Segoe UI";
      ctx.fillText(label, 36, 198 + i * 70);
      ctx.font = "16px Segoe UI";
      if (ch) ctx.fillText(`Lv ${ch.level} · HP ${ch.curHp}/${ch.maxHp} · MP ${ch.curMp}/${ch.maxMp}`, 220, 198 + i * 70);
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ff7-party-card.png";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Party card PNG downloaded.");
    });
  });

  $("btn-share-build").addEventListener("click", async () => {
    const slot = currentSlot();
    if (!slot) return;
    flushCharForm();
    const tab = CHAR_TABS[state.charIndex] || CHAR_TABS[0];
    const ch = slot.chars[tab.record];
    const payload = {
      v: 1,
      tab: tab.name,
      id: ch.id,
      name: ch.name,
      level: ch.level,
      weapon: ch.weapon,
      armor: ch.armor,
      accessory: ch.accessory,
      stats: {
        strength: ch.strength,
        vitality: ch.vitality,
        magic: ch.magic,
        spirit: ch.spirit,
        dexterity: ch.dexterity,
        luck: ch.luck,
      },
      weaponMateria: ch.weaponMateria,
      armorMateria: ch.armorMateria,
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${location.href.split("#")[0]}#build=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Shareable build link copied to clipboard.");
    } catch {
      prompt("Copy this build link:", url);
    }
  });

  $("btn-ct-offsets").addEventListener("click", async () => {
    const text = [
      "GGdropmans FF7 CT companion offsets (Steam classic ff7_en.exe)",
      "Savemap base = GilAddress - 0xB7C",
      "Default: ff7_en.exe+9BFD38",
      "Gil = base+0xB7C (ff7_en.exe+9C08B4)",
      "Party = base+0x4F8",
      "Items = base+0x4FC",
      "Materia = base+0x77C",
      "Key items = base+0xBE4",
      "Love Aeris/Tifa/Yuffie/Barret = base+0xBA7..BAA",
      "GP = base+0xCEE",
      "Vehicles = base+0xEFD",
      "PHS allowed/visible = base+0x10A4 / +0x10A6",
      "Chars start = base+0x54 (132 bytes each)",
      "Download table: GGdropmanFF7V1.0.CT",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("CT companion offsets copied.");
    } catch {
      prompt("Copy offsets:", text);
    }
  });

  function tryImportBuildFromHash() {
    const hash = location.hash || "";
    const m = hash.match(/#build=([^&]+)/);
    if (!m) return;
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      window.__ff7PendingBuild = payload;
      setStatus("Build link detected — load a save, then apply from Tools if prompted.");
    } catch {
      /* ignore bad hash */
    }
  }

  $("btn-undo").addEventListener("click", undoEdit);
  $("btn-redo").addEventListener("click", redoEdit);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undoEdit();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      redoEdit();
    }
  });

  $("btn-save-custom-preset").addEventListener("click", () => {
    const slot = currentSlot();
    if (!slot) return;
    const name = prompt("Name this custom preset:");
    if (!name) return;
    const list = getCustomPresets();
    list.push({
      name,
      data: {
        gil: slot.gil,
        gp: slot.gp,
        love: slot.love,
        items: slot.items,
        materia: slot.materia,
      },
    });
    localStorage.setItem("ff7_custom_presets", JSON.stringify(list));
    renderPresetButtons();
    setStatus(`Saved custom preset “${name}”.`);
  });

  $("btn-clear-custom-presets").addEventListener("click", () => {
    localStorage.removeItem("ff7_custom_presets");
    renderPresetButtons();
    setStatus("Custom presets cleared.");
  });

  $("diff-file-input").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      state.diffSave = Save.parseFile(buf);
      state.diffSlotIndex = state.diffSave.slots.findIndex((s) => !s.empty);
      $("diff-meta").textContent = `Comparing against ${file.name} · slot ${state.diffSlotIndex + 1}`;
      renderDiff();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  $("btn-diff-run").addEventListener("click", renderDiff);

  function renderDiff() {
    const body = $("diff-body");
    if (!body) return;
    const a = currentSlot();
    const b = state.diffSave && state.diffSave.slots[state.diffSlotIndex];
    if (!a || a.empty || !b || b.empty) {
      body.innerHTML = `<tr><td colspan="3">Load a main save and a comparison save first.</td></tr>`;
      return;
    }
    const rows = [
      ["Gil", a.gil, b.gil],
      ["Play time (s)", a.playTime, b.playTime],
      ["GP", a.gp, b.gp],
      ["Battle Points", a.battlePoints, b.battlePoints],
      ["Disc", a.disc, b.disc],
      ["Map ID", a.mapId, b.mapId],
      ["Location ID", a.locationId, b.locationId],
      ["Party", a.party.join(","), b.party.join(",")],
      ["PHS allowed", a.phsAllowed, b.phsAllowed],
      ["PHS visible", a.phsVisible, b.phsVisible],
      ["Vehicles", a.vehicles, b.vehicles],
      ["Turtle flyers", a.turtleFlyers, b.turtleFlyers],
      ["Cloud level", a.chars[0].level, b.chars[0].level],
      ["Cloud EXP", a.chars[0].exp, b.chars[0].exp],
      ["Love Aeris", (a.love && a.love.aeris) || 0, (b.love && b.love.aeris) || 0],
      ["Love Tifa", (a.love && a.love.tifa) || 0, (b.love && b.love.tifa) || 0],
    ];
    const diffs = rows.filter(([, x, y]) => String(x) !== String(y));
    body.innerHTML = diffs.length
      ? diffs.map(([k, x, y]) => `<tr><td>${k}</td><td>${x}</td><td>${y}</td></tr>`).join("")
      : `<tr><td colspan="3">No differences in compared fields.</td></tr>`;
  }

  // Drag & drop
  const overlay = $("drop-overlay");
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    overlay.hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.hidden = true;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await loadArrayBuffer(buf, file.name);
  });

  setStatus("No save loaded.");
  tryImportBuildFromHash();
})();
