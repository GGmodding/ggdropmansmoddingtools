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
      ["weapon", "Weapon ID (rel.)", "number", 0, 255],
      ["armor", "Armor ID (rel.)", "number", 0, 255],
      ["accessory", "Accessory ID (255=none)", "number", 0, 255],
    ];

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
        .join("");

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
        const ch = slot.chars[state.charIndex];
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
      if (input.type === "number") ch[key] = Number(input.value) || 0;
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
    flushChocoForm();
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
    ["party", "chars", "items", "materia", "chocobos"].forEach((id) => {
      $(`panel-${id}`).hidden = !has;
    });
    renderSlotBar();
    if (!has) return;
    renderParty();
    renderCharForm();
    renderItems();
    renderMateria();
    renderChocobos();
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
      setDirty(false);
      renderAll();
      setStatus(`Loaded ${state.fileName} · ${usedSlots().length} slot(s) used · editing slot ${state.slotIndex + 1}`);
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
    await loadArrayBuffer(buf, file.name);
    e.target.value = "";
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
})();
