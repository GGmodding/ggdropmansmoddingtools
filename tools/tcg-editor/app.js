(() => {
  "use strict";

  const EXPANSIONS = [
    { id: "base", label: "Base / Tetramon", collected: "m_CardCollectedList", isCollected: "m_IsCardCollectedList", price: "m_CardPriceSetList", market: "m_GenCardMarketPriceList" },
    { id: "destiny", label: "Destiny", collected: "m_CardCollectedListDestiny", isCollected: "m_IsCardCollectedListDestiny", price: "m_CardPriceSetListDestiny", market: "m_GenCardMarketPriceListDestiny" },
    { id: "ghost", label: "Ghost", collected: "m_CardCollectedListGhost", isCollected: "m_IsCardCollectedListGhost", price: "m_CardPriceSetListGhost", market: "m_GenCardMarketPriceListGhost" },
    { id: "ghostBlack", label: "Ghost Black", collected: "m_CardCollectedListGhostBlack", isCollected: "m_IsCardCollectedListGhostBlack", price: "m_CardPriceSetListGhostBlack", market: "m_GenCardMarketPriceListGhostBlack" },
    { id: "megabot", label: "Megabot", collected: "m_CardCollectedListMegabot", isCollected: "m_IsCardCollectedListMegabot", price: "m_CardPriceSetListMegabot", market: "m_GenCardMarketPriceListMegabot" },
    { id: "fantasy", label: "Fantasy RPG", collected: "m_CardCollectedListFantasyRPG", isCollected: "m_IsCardCollectedListFantasyRPG", price: "m_CardPriceSetListFantasyRPG", market: "m_GenCardMarketPriceListFantasyRPG" },
    { id: "catjob", label: "Cat Job", collected: "m_CardCollectedListCatJob", isCollected: "m_IsCardCollectedListCatJob", price: "m_CardPriceSetListCatJob", market: "m_GenCardMarketPriceListCatJob" },
  ];

  const state = {
    data: null,
    fileName: "",
    dirty: false,
    originalText: "",
  };

  const $ = (id) => document.getElementById(id);

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("dirty-pill").hidden = !dirty;
    $("btn-save").disabled = !state.data;
    $("btn-backup").disabled = !state.data;
  }

  function ensureArray(obj, key, fallbackLength = 0, fill = 0) {
    if (!Array.isArray(obj[key])) {
      obj[key] = Array.from({ length: fallbackLength }, () =>
        typeof fill === "function" ? fill() : fill
      );
    }
    return obj[key];
  }

  function fillBool(arr, value) {
    for (let i = 0; i < arr.length; i++) arr[i] = value;
  }

  function countTrue(arr) {
    return Array.isArray(arr) ? arr.filter(Boolean).length : 0;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function syncCoins(value) {
    const n = Number(value);
    // Keep both money fields identical — the game reads both.
    state.data.m_CoinAmount = n;
    state.data.m_CoinAmountDouble = n;
  }

  function readPlayerForm() {
    if (!state.data) return;
    state.data.m_PlayerName = $("f-playerName").value;
    syncCoins($("f-coins").value);
    state.data.m_ShopLevel = Number($("f-shopLevel").value) || 1;
    state.data.m_ShopExpPoint = Number($("f-shopExp").value) || 0;
    state.data.m_FamePoint = Number($("f-fame").value) || 0;
    state.data.m_TotalFameAdd = Number($("f-totalFame").value) || 0;
    state.data.m_CurrentDay = Number($("f-day").value) || 1;
    state.data.m_CustomerReviewScoreAverage = Number($("f-reviewAvg").value) || 0;
    state.data.m_CustomerReviewCount = Number($("f-reviewCount").value) || 0;
    state.data.m_UnlockRoomCount = Number($("f-unlockRooms").value) || 0;
    state.data.m_UnlockWarehouseRoomCount = Number($("f-unlockWarehouse").value) || 0;
    state.data.m_TutorialIndex = Number($("f-tutorialIndex").value) || 0;
    state.data.m_IsShopOpen = $("f-shopOpen").checked;
    state.data.m_HasFinishedTutorial = $("f-tutorialDone").checked;
    state.data.m_IsWarehouseRoomUnlocked = $("f-warehouse").checked;
    state.data.m_IsScannerRestockUnlocked = $("f-scanner").checked;
  }

  function writePlayerForm() {
    const d = state.data;
    $("f-playerName").value = d.m_PlayerName ?? "";
    $("f-coins").value = d.m_CoinAmountDouble ?? d.m_CoinAmount ?? 0;
    $("f-shopLevel").value = d.m_ShopLevel ?? 1;
    $("f-shopExp").value = d.m_ShopExpPoint ?? 0;
    $("f-fame").value = d.m_FamePoint ?? 0;
    $("f-totalFame").value = d.m_TotalFameAdd ?? 0;
    $("f-day").value = d.m_CurrentDay ?? 1;
    $("f-reviewAvg").value = d.m_CustomerReviewScoreAverage ?? 0;
    $("f-reviewCount").value = d.m_CustomerReviewCount ?? 0;
    $("f-unlockRooms").value = d.m_UnlockRoomCount ?? 0;
    $("f-unlockWarehouse").value = d.m_UnlockWarehouseRoomCount ?? 0;
    $("f-tutorialIndex").value = d.m_TutorialIndex ?? 0;
    $("f-shopOpen").checked = !!d.m_IsShopOpen;
    $("f-tutorialDone").checked = !!d.m_HasFinishedTutorial;
    $("f-warehouse").checked = !!d.m_IsWarehouseRoomUnlocked;
    $("f-scanner").checked = !!d.m_IsScannerRestockUnlocked;
  }

  function slotBaseName(fileName) {
    const base = (fileName || "savedGames_Release0.json").replace(/_edited\.json$/i, ".json");
    const m = base.match(/^(savedGames_Release\d+)/i);
    if (m) return m[1];
    return base.replace(/\.json$/i, "");
  }

  function showInstallModal(jsonName, gdName) {
    const steps = [
      `Close TCG Card Shop Simulator completely.`,
      `Copy the downloaded <code>${jsonName}</code> into:<br><code>%USERPROFILE%\\AppData\\LocalLow\\OPNeonGames\\Card Shop Simulator\\</code>`,
      `Overwrite the existing <code>${jsonName}</code> (same exact name — not <code>*_edited.json</code>).`,
      `Launch the game and load that slot.`,
    ];
    $("install-steps").innerHTML = steps.map((s) => `<li>${s}</li>`).join("");
    $("install-modal").hidden = false;
  }

  const NAMES = window.TCG_NAMES || { borders: ["Base","First Edition","Silver","Gold","EX","Full Art"], items: [], monsters: {} };

  function cardMeta(index, expansionId) {
    const monsterIdx = Math.floor(index / 12);
    const variant = index % 12;
    const borderIdx = variant % 6;
    const foil = variant >= 6;
    const list = (NAMES.monsters && NAMES.monsters[expansionId]) || [];
    const rawName = list[monsterIdx];
    const monster = (rawName && String(rawName).trim())
      ? String(rawName).trim()
      : (list.length ? `Unknown #${monsterIdx}` : `Monster ${monsterIdx}`);
    const border = (NAMES.borders && NAMES.borders[borderIdx]) || `Border ${borderIdx}`;
    return { monsterIdx, variant, borderIdx, foil, monster, border };
  }

  function itemName(index) {
    const n = NAMES.items && NAMES.items[index];
    return n || `Item ${index}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function currentExpansion() {
    return EXPANSIONS.find((e) => e.id === $("card-expansion").value) || EXPANSIONS[0];
  }

  function renderCards() {
    const exp = currentExpansion();
    const collected = ensureArray(state.data, exp.collected);
    const isCollected = ensureArray(state.data, exp.isCollected, collected.length, false);
    const price = ensureArray(state.data, exp.price, collected.length, 0);
    const market = ensureArray(state.data, exp.market, collected.length, 0);
    const ownedOnly = $("card-owned-only").checked;
    const q = ($("card-search").value || "").trim().toLowerCase();
    const tbody = $("card-table").querySelector("tbody");
    tbody.innerHTML = "";

    const frag = document.createDocumentFragment();
    const max = Math.max(collected.length, isCollected.length, price.length, market.length);
    for (let i = 0; i < max; i++) {
      const copies = collected[i] ?? 0;
      if (ownedOnly && !(copies > 0 || isCollected[i])) continue;
      const meta = cardMeta(i, exp.id);
      const label = `${meta.monster} · ${meta.border}${meta.foil ? " · Foil" : ""}`;
      if (q) {
        const hay = `${i} ${meta.monster} ${meta.border} ${meta.foil ? "foil" : ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i}</td>
        <td class="name-cell" title="${escapeHtml(label)}">${escapeHtml(meta.monster)}</td>
        <td>${escapeHtml(meta.border)}</td>
        <td>${meta.foil ? "Yes" : ""}</td>
        <td><input type="number" min="0" step="1" data-card-field="copies" data-i="${i}" value="${copies}" /></td>
        <td><input type="checkbox" data-card-field="collected" data-i="${i}" ${isCollected[i] ? "checked" : ""} /></td>
        <td><input type="number" step="0.01" data-card-field="price" data-i="${i}" value="${price[i] ?? 0}" /></td>
        <td>${Number(market[i] ?? 0).toFixed(2)}</td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  function renderItems() {
    const stock = ensureArray(state.data, "m_CurrentTotalItemCountList");
    const sell = ensureArray(state.data, "m_SetItemPriceList", stock.length, 0);
    const market = ensureArray(state.data, "m_GeneratedMarketPriceList", stock.length, 0);
    const cost = ensureArray(state.data, "m_GeneratedCostPriceList", stock.length, 0);
    const license = ensureArray(state.data, "m_IsItemLicenseUnlocked", Math.max(stock.length, 501), false);
    const licensedOnly = $("item-licensed-only").checked;
    const q = ($("item-search").value || "").trim().toLowerCase();
    const tbody = $("item-table").querySelector("tbody");
    tbody.innerHTML = "";
    const frag = document.createDocumentFragment();
    const max = Math.max(stock.length, sell.length, license.length);
    for (let i = 0; i < max; i++) {
      if (licensedOnly && !license[i]) continue;
      const name = itemName(i);
      if (q) {
        const hay = `${i} ${name}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i}</td>
        <td class="name-cell" title="${escapeHtml(name)}">${escapeHtml(name)}</td>
        <td><input type="number" min="0" step="1" data-item-field="stock" data-i="${i}" value="${stock[i] ?? 0}" /></td>
        <td><input type="number" step="0.01" data-item-field="sell" data-i="${i}" value="${sell[i] ?? 0}" /></td>
        <td>${Number(market[i] ?? 0).toFixed(2)}</td>
        <td>${Number(cost[i] ?? 0).toFixed(2)}</td>
        <td><input type="checkbox" data-item-field="license" data-i="${i}" ${license[i] ? "checked" : ""} /></td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  const WORKER_TASKS = [
    { id: 0, label: "Rest" },
    { id: 1, label: "Man Counter" },
    { id: 2, label: "Restock Shelf" },
    { id: 3, label: "Set Price" },
    { id: 4, label: "Refill Cleanser" },
    { id: 5, label: "Refill Pack Opener" },
    { id: 6, label: "Restock Card Display" },
  ];

  const WORKER_XP_TASKS = WORKER_TASKS.filter((t) => t.id >= 1 && t.id <= 6);

  function taskOptions(selected) {
    return WORKER_TASKS.map(
      (t) => `<option value="${t.id}" ${Number(selected) === t.id ? "selected" : ""}>${t.label}</option>`
    ).join("");
  }

  function ensureWorkerExp(worker) {
    if (!Array.isArray(worker.expList)) worker.expList = Array.from({ length: 100 }, () => 0);
    while (worker.expList.length < 100) worker.expList.push(0);
    return worker.expList;
  }

  function renderWorkers() {
    const hired = ensureArray(state.data, "m_IsWorkerHired", 100, false);
    const workers = ensureArray(state.data, "m_WorkerSaveDataList", 0, null);

    const hireBody = $("worker-hire-table").querySelector("tbody");
    hireBody.innerHTML = "";
    const hireFrag = document.createDocumentFragment();
    // Show first 20 hire flags (enough for common unlocks) + any already true beyond that
    const hireMax = Math.max(20, ...hired.map((v, i) => (v ? i + 1 : 0)));
    for (let i = 0; i < Math.min(hired.length, hireMax); i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i}</td>
        <td><input type="checkbox" data-worker-field="hired" data-i="${i}" ${hired[i] ? "checked" : ""} /></td>
      `;
      hireFrag.appendChild(tr);
    }
    hireBody.appendChild(hireFrag);

    const cards = $("worker-cards");
    cards.innerHTML = "";
    const slotCount = Math.max(workers.length, 9);
    for (let i = 0; i < slotCount; i++) {
      const w = workers[i];
      const card = document.createElement("article");
      card.className = "worker-card";
      if (!w) {
        card.innerHTML = `<h4>Slot ${i}</h4><p class="hint">No worker data in this slot.</p>`;
        cards.appendChild(card);
        continue;
      }
      ensureWorkerExp(w);
      const xpFields = WORKER_XP_TASKS.map((t) => `
        <label>${escapeHtml(t.label)} XP
          <input type="number" min="0" step="1" data-worker-field="exp" data-i="${i}" data-task="${t.id}" value="${w.expList[t.id] ?? 0}" />
        </label>
      `).join("");
      card.innerHTML = `
        <h4>Worker Slot ${i}</h4>
        <div class="form-grid">
          <label>Primary Task
            <select data-worker-field="primary" data-i="${i}">${taskOptions(w.primaryTask)}</select>
          </label>
          <label>Secondary Task
            <select data-worker-field="secondary" data-i="${i}">${taskOptions(w.secondaryTask)}</select>
          </label>
          <label>Item Price Mult
            <input type="number" step="0.01" min="0" data-worker-field="itemMult" data-i="${i}" value="${w.setPriceMultiplier ?? 1}" />
          </label>
          <label>Card Price Mult
            <input type="number" step="0.01" min="0" data-worker-field="cardMult" data-i="${i}" value="${w.setCardPriceMultiplier ?? 1}" />
          </label>
          <label>Bonus Boost Count
            <input type="number" step="1" min="0" data-worker-field="bonusCount" data-i="${i}" value="${w.bonusBoostedCount ?? 0}" />
          </label>
          ${xpFields}
        </div>
        <div class="checks">
          <label class="check"><input type="checkbox" data-worker-field="roundItem" data-i="${i}" ${w.isRoundUpPrice ? "checked" : ""} /> Round up item prices</label>
          <label class="check"><input type="checkbox" data-worker-field="roundCard" data-i="${i}" ${w.isRoundUpCardPrice ? "checked" : ""} /> Round up card prices</label>
          <label class="check"><input type="checkbox" data-worker-field="avoidCard" data-i="${i}" ${w.isAvoidSetCardPrice ? "checked" : ""} /> Avoid setting card prices</label>
          <label class="check"><input type="checkbox" data-worker-field="bonus" data-i="${i}" ${w.isBonusBoosted ? "checked" : ""} /> Bonus boosted</label>
        </div>
      `;
      cards.appendChild(card);
    }
  }

  function getCustomers() {
    return ensureArray(state.data, "m_CustomerSaveDataList");
  }

  function selectedCustomerIndex() {
    return Number($("customer-select").value) || 0;
  }

  function selectedCustomer() {
    const list = getCustomers();
    return list[selectedCustomerIndex()] || null;
  }

  function ensureCustomerBag(c) {
    if (!Array.isArray(c.itemInBagList)) c.itemInBagList = [];
    if (!Array.isArray(c.itemInBagPriceList)) c.itemInBagPriceList = [];
    if (!Array.isArray(c.cardInBagList)) c.cardInBagList = [];
    if (!Array.isArray(c.cardInBagPriceList)) c.cardInBagPriceList = [];
    while (c.itemInBagPriceList.length < c.itemInBagList.length) c.itemInBagPriceList.push(0);
    while (c.cardInBagPriceList.length < c.cardInBagList.length) c.cardInBagPriceList.push(0);
  }

  function expansionTypeId(expKey) {
    return ({
      base: 0,
      destiny: 1,
      ghost: 2,
      ghostBlack: 2,
      megabot: 3,
      fantasy: 4,
      catjob: 5,
    })[expKey] ?? 0;
  }

  function monsterTypeForSlot(expKey, slot) {
    const s = Number(slot) || 0;
    if (expKey === "megabot") return 1000 + s;
    if (expKey === "fantasy") return 2000 + s;
    if (expKey === "catjob") return 3000 + s;
    return s + 1;
  }

  function expKeyFromCard(card) {
    const t = Number(card.expansionType) || 0;
    if (t === 1 || card.isDestiny) return "destiny";
    if (t === 2) return "ghost";
    if (t === 3) return "megabot";
    if (t === 4) return "fantasy";
    if (t === 5) return "catjob";
    return "base";
  }

  function monsterNameFromType(expKey, monsterType) {
    const list = (NAMES.monsters && NAMES.monsters[expKey]) || [];
    let slot = Number(monsterType) || 0;
    if (expKey === "megabot") slot -= 1000;
    else if (expKey === "fantasy") slot -= 2000;
    else if (expKey === "catjob") slot -= 3000;
    else slot -= 1;
    if (slot < 0) slot = 0;
    return list[slot] || `Monster ${monsterType}`;
  }

  function describeCard(card) {
    const expKey = expKeyFromCard(card);
    const name = monsterNameFromType(expKey, card.monsterType);
    const border = (NAMES.borders && NAMES.borders[card.borderType]) || `Border ${card.borderType}`;
    return { name, border, foil: !!card.isFoil, expKey };
  }

  function populateCustomerAddDropdowns() {
    const itemSel = $("cust-add-item");
    if (itemSel && !itemSel.dataset.ready) {
      const items = NAMES.items || [];
      itemSel.innerHTML = items
        .map((n, i) => (n ? `<option value="${i}">${i}: ${escapeHtml(n)}</option>` : ""))
        .join("");
      itemSel.dataset.ready = "1";
    }

    const expSel = $("cust-add-card-exp");
    if (expSel && !expSel.dataset.ready) {
      expSel.innerHTML = EXPANSIONS.map((e) => `<option value="${e.id}">${escapeHtml(e.label)}</option>`).join("");
      expSel.dataset.ready = "1";
    }

    const borderSel = $("cust-add-card-border");
    if (borderSel && !borderSel.dataset.ready) {
      borderSel.innerHTML = (NAMES.borders || [])
        .map((b, i) => `<option value="${i}">${escapeHtml(b)}</option>`)
        .join("");
      borderSel.dataset.ready = "1";
    }

    fillCustomerMonsterSelect();
  }

  function fillCustomerMonsterSelect() {
    const expKey = $("cust-add-card-exp").value || "base";
    const list = (NAMES.monsters && NAMES.monsters[expKey]) || [];
    $("cust-add-card-monster").innerHTML = list
      .map((n, i) => (n ? `<option value="${i}">${escapeHtml(n)}</option>` : ""))
      .join("");
  }

  function renderCustomers() {
    populateCustomerAddDropdowns();
    const list = getCustomers();
    const sel = $("customer-select");
    const prev = sel.value;
    sel.innerHTML = list
      .map((c, i) => {
        ensureCustomerBag(c);
        const items = c.itemInBagList.length;
        const cards = c.cardInBagList.length;
        const money = Number(c.maxMoney || 0).toFixed(0);
        return `<option value="${i}">#${i} · $${money} · ${items} items · ${cards} cards${c.isSmelly ? " · smelly" : ""}</option>`;
      })
      .join("");

    if (!list.length) {
      $("customer-empty").hidden = false;
      $("customer-empty").textContent = "No customers in this save right now.";
      $("customer-editor").hidden = true;
      return;
    }

    $("customer-empty").hidden = true;
    $("customer-editor").hidden = false;
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
    else sel.value = "0";
    renderSelectedCustomer();
  }

  function renderSelectedCustomer() {
    const c = selectedCustomer();
    if (!c) return;
    ensureCustomerBag(c);
    $("cust-max-money").value = c.maxMoney ?? 0;
    $("cust-cost-total").value = c.currentCostTotal ?? 0;
    $("cust-smelly").checked = !!c.isSmelly;
    $("cust-smelly-meter").value = c.smellyMeter ?? 0;

    const itemBody = $("cust-item-table").querySelector("tbody");
    itemBody.innerHTML = "";
    c.itemInBagList.forEach((itemType, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i}</td>
        <td class="name-cell">${escapeHtml(itemName(itemType))}</td>
        <td><input type="number" min="0" step="0.01" data-cust-item-price="${i}" value="${c.itemInBagPriceList[i] ?? 0}" /></td>
        <td><button type="button" class="btn" data-cust-remove-item="${i}">Remove</button></td>
      `;
      itemBody.appendChild(tr);
    });

    const cardBody = $("cust-card-table").querySelector("tbody");
    cardBody.innerHTML = "";
    c.cardInBagList.forEach((card, i) => {
      const meta = describeCard(card || {});
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i}</td>
        <td class="name-cell">${escapeHtml(meta.name)}</td>
        <td>${escapeHtml(meta.border)}</td>
        <td>${meta.foil ? "Yes" : ""}</td>
        <td><input type="number" min="0" step="0.01" data-cust-card-price="${i}" value="${c.cardInBagPriceList[i] ?? 0}" /></td>
        <td><button type="button" class="btn" data-cust-remove-card="${i}">Remove</button></td>
      `;
      cardBody.appendChild(tr);
    });
  }

  function recalcCustomerCost(c) {
    ensureCustomerBag(c);
    const itemSum = c.itemInBagPriceList.reduce((a, b) => a + (Number(b) || 0), 0);
    const cardSum = c.cardInBagPriceList.reduce((a, b) => a + (Number(b) || 0), 0);
    c.currentCostTotal = Math.round((itemSum + cardSum) * 100) / 100;
    $("cust-cost-total").value = c.currentCostTotal;
  }

  function renderGrading() {
    const inProgress = ensureArray(state.data, "m_GradeCardInProgressList");
    const inventory = ensureArray(state.data, "m_GradedCardInventoryList");
    $("grade-in-progress").textContent = String(inProgress.length);
    $("grade-inventory").textContent = String(inventory.length);
    $("grading-hint").textContent = inProgress.length
      ? "Completing moves in-progress entries into graded inventory."
      : "No cards currently in grading.";
    $("grading-preview").textContent = JSON.stringify(
      { inProgress: inProgress.slice(0, 20), inventorySample: inventory.slice(0, 20) },
      null,
      2
    );
  }

  function renderUnlockStats() {
    const ach = ensureArray(state.data, "m_IsAchievementUnlocked", 100, false);
    const walls = ensureArray(state.data, "m_UnlockedDecoWallList", 1001, false);
    const floors = ensureArray(state.data, "m_UnlockedDecoFloorList", 1001, false);
    const ceilings = ensureArray(state.data, "m_UnlockedDecoCeilingList", 1001, false);
    const decor = ensureArray(state.data, "m_DecorationInventoryList", 1000, 0);
    $("stat-achievements").textContent = `${countTrue(ach)}/${ach.length}`;
    $("stat-walls").textContent = `${countTrue(walls)}/${walls.length}`;
    $("stat-floors").textContent = `${countTrue(floors)}/${floors.length}`;
    $("stat-ceilings").textContent = `${countTrue(ceilings)}/${ceilings.length}`;
    $("stat-decor-inv").textContent = String(decor.reduce((a, b) => a + (Number(b) || 0), 0));
  }

  function renderRaw(pretty = false) {
    if (!state.data) {
      $("raw-json").value = "";
      return;
    }
    // Pretty-printing multi‑MB saves can freeze the tab; default to compact.
    $("raw-json").value = pretty
      ? JSON.stringify(state.data, null, 2)
      : JSON.stringify(state.data);
  }

  function refreshAllViews() {
    writePlayerForm();
    renderCards();
    renderItems();
    renderWorkers();
    renderCustomers();
    renderGrading();
    renderUnlockStats();
    // Raw JSON is filled only when that tab is opened.
  }

  function showEditor(show) {
    $("empty-state").hidden = show;
    document.querySelectorAll(".panel").forEach((p) => {
      if (show) {
        p.hidden = false;
      } else {
        p.hidden = true;
      }
    });
    if (show) {
      const active = document.querySelector(".tab.is-active")?.dataset.tab || "player";
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      $(`panel-${active}`).classList.add("is-active");
    }
  }

  async function loadFile(file) {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      setStatus(`Failed to parse JSON: ${err.message}`);
      alert("That file is not valid JSON.");
      return;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      alert("Save root must be a JSON object.");
      return;
    }
    if (typeof data.m_PlayerName === "undefined" && typeof data.m_CoinAmount === "undefined") {
      const ok = confirm("This doesn't look like a Card Shop Simulator save. Load anyway?");
      if (!ok) return;
    }

    state.data = data;
    state.fileName = file.name || "savedGames_Release0.json";
    state.originalText = text;
    showEditor(true);
    refreshAllViews();
    setDirty(false);
    $("file-meta").textContent = `${state.fileName} · ${(text.length / 1024 / 1024).toFixed(2)} MB`;
    setStatus(`Loaded ${state.fileName}`);
  }

  function collectFormsIntoData() {
    readPlayerForm();
  }

  function saveChanges() {
    if (!state.data) return;
    collectFormsIntoData();
    const out = JSON.stringify(state.data);
    const slot = slotBaseName(state.fileName);
    const jsonName = `${slot}.json`;
    downloadText(jsonName, out);
    setDirty(false);
    setStatus(`Downloaded ${jsonName} — overwrite the original with this exact name.`);
    showInstallModal(jsonName);
  }

  function downloadBackup() {
    if (!state.originalText) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slot = slotBaseName(state.fileName);
    const name = `${slot}_backup_${stamp}.json`;
    downloadText(name, state.originalText);
    setStatus(`Backup downloaded: ${name}`);
  }

  function initExpansionSelect() {
    const sel = $("card-expansion");
    sel.innerHTML = EXPANSIONS.map((e) => `<option value="${e.id}">${e.label}</option>`).join("");
  }

  function markDirty() {
    if (state.data) setDirty(true);
  }

  // Tabs
  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("is-active"));
    btn.classList.add("is-active");
    if (!state.data) return;
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
    $(`panel-${btn.dataset.tab}`).classList.add("is-active");
    if (btn.dataset.tab === "raw") {
      setStatus("Building raw JSON view…");
      requestAnimationFrame(() => {
        renderRaw(false);
        setStatus("Raw JSON ready (compact). Use Reload for a refresh.");
      });
    }
  });

  // File load
  $("file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = "";
  });

  $("btn-backup").addEventListener("click", downloadBackup);
  $("btn-save").addEventListener("click", saveChanges);
  $("btn-close-modal").addEventListener("click", () => {
    $("install-modal").hidden = true;
  });
  if (window.GGSaveFolders) {
    GGSaveFolders.wireEditor("tcg", {
      setStatus,
      async onFile(file) {
        await loadFile(file);
      },
    });
  }

  // Player quick actions + dirty tracking
  ["f-playerName","f-coins","f-shopLevel","f-shopExp","f-fame","f-totalFame","f-day","f-reviewAvg","f-reviewCount","f-unlockRooms","f-unlockWarehouse","f-tutorialIndex","f-shopOpen","f-tutorialDone","f-warehouse","f-scanner"]
    .forEach((id) => {
      $(id).addEventListener("input", markDirty);
      $(id).addEventListener("change", markDirty);
    });

  $("btn-max-money").addEventListener("click", () => {
    $("f-coins").value = 999999999;
    markDirty();
  });

  $("btn-finish-tutorial").addEventListener("click", () => {
    $("f-tutorialDone").checked = true;
    $("f-tutorialIndex").value = 99;
    markDirty();
  });

  // Cards
  $("card-expansion").addEventListener("change", () => {
    if (state.data) renderCards();
  });
  $("card-owned-only").addEventListener("change", () => {
    if (state.data) renderCards();
  });
  $("card-search").addEventListener("input", () => {
    if (state.data) renderCards();
  });

  $("card-table").addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset.cardField) return;
    const exp = currentExpansion();
    const i = Number(t.dataset.i);
    const collected = ensureArray(state.data, exp.collected);
    const isCollected = ensureArray(state.data, exp.isCollected, collected.length, false);
    const price = ensureArray(state.data, exp.price, collected.length, 0);
    if (t.dataset.cardField === "copies") {
      collected[i] = Number(t.value) || 0;
      if (collected[i] > 0) isCollected[i] = true;
    } else if (t.dataset.cardField === "collected") {
      isCollected[i] = t.checked;
    } else if (t.dataset.cardField === "price") {
      price[i] = Number(t.value) || 0;
    }
    markDirty();
  });

  $("btn-card-apply-copies").addEventListener("click", () => {
    const exp = currentExpansion();
    const collected = ensureArray(state.data, exp.collected);
    const isCollected = ensureArray(state.data, exp.isCollected, collected.length, false);
    const n = Number($("card-set-copies").value) || 0;
    for (let i = 0; i < collected.length; i++) {
      collected[i] = n;
      isCollected[i] = n > 0;
    }
    renderCards();
    markDirty();
  });

  $("btn-card-clear").addEventListener("click", () => {
    const exp = currentExpansion();
    const collected = ensureArray(state.data, exp.collected);
    const isCollected = ensureArray(state.data, exp.isCollected, collected.length, false);
    const price = ensureArray(state.data, exp.price, collected.length, 0);
    for (let i = 0; i < collected.length; i++) {
      collected[i] = 0;
      isCollected[i] = false;
      price[i] = 0;
    }
    renderCards();
    markDirty();
  });

  $("btn-card-unlock-all").addEventListener("click", () => {
    const exp = currentExpansion();
    const collected = ensureArray(state.data, exp.collected);
    const isCollected = ensureArray(state.data, exp.isCollected, collected.length, false);
    for (let i = 0; i < collected.length; i++) {
      if ((collected[i] ?? 0) < 1) collected[i] = 1;
      isCollected[i] = true;
    }
    renderCards();
    markDirty();
  });

  // Items
  $("item-licensed-only").addEventListener("change", () => {
    if (state.data) renderItems();
  });
  $("item-search").addEventListener("input", () => {
    if (state.data) renderItems();
  });

  $("item-table").addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset.itemField) return;
    const i = Number(t.dataset.i);
    const stock = ensureArray(state.data, "m_CurrentTotalItemCountList");
    const sell = ensureArray(state.data, "m_SetItemPriceList", stock.length, 0);
    const license = ensureArray(state.data, "m_IsItemLicenseUnlocked", Math.max(stock.length, 501), false);
    if (t.dataset.itemField === "stock") stock[i] = Number(t.value) || 0;
    if (t.dataset.itemField === "sell") sell[i] = Number(t.value) || 0;
    if (t.dataset.itemField === "license") license[i] = t.checked;
    markDirty();
  });

  $("btn-item-stock").addEventListener("click", () => {
    const stock = ensureArray(state.data, "m_CurrentTotalItemCountList");
    const n = Number($("item-stock-all").value) || 0;
    for (let i = 0; i < stock.length; i++) stock[i] = n;
    renderItems();
    markDirty();
  });

  $("btn-item-clear-prices").addEventListener("click", () => {
    const sell = ensureArray(state.data, "m_SetItemPriceList");
    for (let i = 0; i < sell.length; i++) sell[i] = 0;
    renderItems();
    markDirty();
  });

  $("btn-item-licenses").addEventListener("click", () => {
    const license = ensureArray(state.data, "m_IsItemLicenseUnlocked", 501, false);
    fillBool(license, true);
    renderItems();
    markDirty();
  });

  // Workers
  function onWorkerFieldChange(e) {
    const t = e.target;
    if (!t.dataset.workerField) return;
    const i = Number(t.dataset.i);
    const hired = ensureArray(state.data, "m_IsWorkerHired", 100, false);
    const workers = ensureArray(state.data, "m_WorkerSaveDataList");
    if (t.dataset.workerField === "hired") {
      hired[i] = t.checked;
      markDirty();
      return;
    }
    if (!workers[i]) return;
    const w = workers[i];
    ensureWorkerExp(w);
    switch (t.dataset.workerField) {
      case "itemMult":
        w.setPriceMultiplier = Number(t.value) || 1;
        break;
      case "cardMult":
        w.setCardPriceMultiplier = Number(t.value) || 1;
        break;
      case "primary":
        w.primaryTask = Number(t.value) || 0;
        w.workerTask = w.primaryTask;
        break;
      case "secondary":
        w.secondaryTask = Number(t.value) || 0;
        break;
      case "bonusCount":
        w.bonusBoostedCount = Number(t.value) || 0;
        break;
      case "exp": {
        const task = Number(t.dataset.task);
        w.expList[task] = Number(t.value) || 0;
        break;
      }
      case "roundItem":
        w.isRoundUpPrice = t.checked;
        break;
      case "roundCard":
        w.isRoundUpCardPrice = t.checked;
        break;
      case "avoidCard":
        w.isAvoidSetCardPrice = t.checked;
        break;
      case "bonus":
        w.isBonusBoosted = t.checked;
        break;
      default:
        break;
    }
    markDirty();
  }

  $("worker-hire-table").addEventListener("change", onWorkerFieldChange);
  $("worker-cards").addEventListener("change", onWorkerFieldChange);
  $("worker-cards").addEventListener("input", (e) => {
    if (e.target.dataset.workerField) onWorkerFieldChange(e);
  });

  $("btn-hire-all").addEventListener("click", () => {
    fillBool(ensureArray(state.data, "m_IsWorkerHired", 100, false), true);
    renderWorkers();
    markDirty();
  });

  $("btn-fire-all").addEventListener("click", () => {
    fillBool(ensureArray(state.data, "m_IsWorkerHired", 100, false), false);
    renderWorkers();
    markDirty();
  });

  $("btn-worker-max-xp").addEventListener("click", () => {
    const workers = ensureArray(state.data, "m_WorkerSaveDataList");
    for (const w of workers) {
      if (!w) continue;
      const exp = ensureWorkerExp(w);
      for (const t of WORKER_XP_TASKS) exp[t.id] = 999999;
    }
    renderWorkers();
    markDirty();
  });

  $("btn-worker-max-mult").addEventListener("click", () => {
    const workers = ensureArray(state.data, "m_WorkerSaveDataList");
    for (const w of workers) {
      if (!w) continue;
      w.setPriceMultiplier = 2;
      w.setCardPriceMultiplier = 2;
    }
    renderWorkers();
    markDirty();
  });

  $("btn-worker-boost").addEventListener("click", () => {
    const workers = ensureArray(state.data, "m_WorkerSaveDataList");
    for (const w of workers) {
      if (!w) continue;
      w.isBonusBoosted = true;
      w.bonusBoostedCount = Math.max(Number(w.bonusBoostedCount) || 0, 10);
    }
    renderWorkers();
    markDirty();
  });

  // Customers
  $("customer-select").addEventListener("change", () => {
    if (state.data) renderSelectedCustomer();
  });
  $("btn-customer-refresh").addEventListener("click", () => {
    if (state.data) renderCustomers();
  });
  $("btn-customer-max-money-all").addEventListener("click", () => {
    const amount = Number($("customer-max-money-all-val").value) || 0;
    for (const c of getCustomers()) c.maxMoney = amount;
    renderCustomers();
    markDirty();
  });
  ["cust-max-money", "cust-cost-total", "cust-smelly-meter"].forEach((id) => {
    $(id).addEventListener("change", () => {
      const c = selectedCustomer();
      if (!c) return;
      if (id === "cust-max-money") c.maxMoney = Number($("cust-max-money").value) || 0;
      if (id === "cust-cost-total") c.currentCostTotal = Number($("cust-cost-total").value) || 0;
      if (id === "cust-smelly-meter") c.smellyMeter = Number($("cust-smelly-meter").value) || 0;
      markDirty();
      renderCustomers();
    });
  });
  $("cust-smelly").addEventListener("change", () => {
    const c = selectedCustomer();
    if (!c) return;
    c.isSmelly = $("cust-smelly").checked;
    markDirty();
    renderCustomers();
  });

  $("cust-add-card-exp").addEventListener("change", fillCustomerMonsterSelect);

  $("btn-cust-add-item").addEventListener("click", () => {
    const c = selectedCustomer();
    if (!c) return;
    ensureCustomerBag(c);
    const itemType = Number($("cust-add-item").value) || 0;
    const price = Number($("cust-add-item-price").value) || 0;
    c.itemInBagList.push(itemType);
    c.itemInBagPriceList.push(price);
    recalcCustomerCost(c);
    markDirty();
    renderCustomers();
  });

  $("btn-cust-clear-items").addEventListener("click", () => {
    const c = selectedCustomer();
    if (!c) return;
    c.itemInBagList = [];
    c.itemInBagPriceList = [];
    recalcCustomerCost(c);
    markDirty();
    renderCustomers();
  });

  $("btn-cust-add-card").addEventListener("click", () => {
    const c = selectedCustomer();
    if (!c) return;
    ensureCustomerBag(c);
    const expKey = $("cust-add-card-exp").value || "base";
    const slot = Number($("cust-add-card-monster").value) || 0;
    const borderType = Number($("cust-add-card-border").value) || 0;
    const isFoil = $("cust-add-card-foil").checked;
    const price = Number($("cust-add-card-price").value) || 0;
    const expansionType = expansionTypeId(expKey);
    c.cardInBagList.push({
      expansionType,
      monsterType: monsterTypeForSlot(expKey, slot),
      borderType,
      isFoil,
      isDestiny: expKey === "destiny" || expansionType === 1,
      isChampionCard: false,
      isNew: true,
      cardGrade: 0,
      gradedCardIndex: 0,
    });
    c.cardInBagPriceList.push(price);
    recalcCustomerCost(c);
    markDirty();
    renderCustomers();
  });

  $("btn-cust-clear-cards").addEventListener("click", () => {
    const c = selectedCustomer();
    if (!c) return;
    c.cardInBagList = [];
    c.cardInBagPriceList = [];
    recalcCustomerCost(c);
    markDirty();
    renderCustomers();
  });

  $("btn-cust-recalc-cost").addEventListener("click", () => {
    const c = selectedCustomer();
    if (!c) return;
    recalcCustomerCost(c);
    markDirty();
  });

  $("cust-item-table").addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.custItemPrice == null) return;
    const c = selectedCustomer();
    if (!c) return;
    ensureCustomerBag(c);
    const i = Number(t.dataset.custItemPrice);
    c.itemInBagPriceList[i] = Number(t.value) || 0;
    markDirty();
  });

  $("cust-card-table").addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.custCardPrice == null) return;
    const c = selectedCustomer();
    if (!c) return;
    ensureCustomerBag(c);
    const i = Number(t.dataset.custCardPrice);
    c.cardInBagPriceList[i] = Number(t.value) || 0;
    markDirty();
  });

  $("cust-item-table").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cust-remove-item]");
    if (!btn) return;
    const c = selectedCustomer();
    if (!c) return;
    ensureCustomerBag(c);
    const i = Number(btn.dataset.custRemoveItem);
    c.itemInBagList.splice(i, 1);
    c.itemInBagPriceList.splice(i, 1);
    recalcCustomerCost(c);
    markDirty();
    renderCustomers();
  });

  $("cust-card-table").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cust-remove-card]");
    if (!btn) return;
    const c = selectedCustomer();
    if (!c) return;
    ensureCustomerBag(c);
    const i = Number(btn.dataset.custRemoveCard);
    c.cardInBagList.splice(i, 1);
    c.cardInBagPriceList.splice(i, 1);
    recalcCustomerCost(c);
    markDirty();
    renderCustomers();
  });

  // Grading
  $("btn-complete-grading").addEventListener("click", () => {
    const inProgress = ensureArray(state.data, "m_GradeCardInProgressList");
    const inventory = ensureArray(state.data, "m_GradedCardInventoryList");
    if (!inProgress.length) {
      alert("No in-progress graded cards.");
      return;
    }
    while (inProgress.length) inventory.push(inProgress.pop());
    renderGrading();
    markDirty();
  });

  // Unlocks
  $("btn-unlock-achievements").addEventListener("click", () => {
    fillBool(ensureArray(state.data, "m_IsAchievementUnlocked", 100, false), true);
    renderUnlockStats();
    markDirty();
  });
  $("btn-lock-achievements").addEventListener("click", () => {
    fillBool(ensureArray(state.data, "m_IsAchievementUnlocked", 100, false), false);
    renderUnlockStats();
    markDirty();
  });
  $("btn-unlock-walls").addEventListener("click", () => {
    fillBool(ensureArray(state.data, "m_UnlockedDecoWallList", 1001, false), true);
    renderUnlockStats();
    markDirty();
  });
  $("btn-unlock-floors").addEventListener("click", () => {
    fillBool(ensureArray(state.data, "m_UnlockedDecoFloorList", 1001, false), true);
    renderUnlockStats();
    markDirty();
  });
  $("btn-unlock-ceilings").addEventListener("click", () => {
    fillBool(ensureArray(state.data, "m_UnlockedDecoCeilingList", 1001, false), true);
    renderUnlockStats();
    markDirty();
  });
  $("btn-decor-fill").addEventListener("click", () => {
    const decor = ensureArray(state.data, "m_DecorationInventoryList", 1000, 0);
    for (let i = 0; i < decor.length; i++) decor[i] = 1;
    renderUnlockStats();
    markDirty();
  });
  $("btn-decor-clear").addEventListener("click", () => {
    const decor = ensureArray(state.data, "m_DecorationInventoryList", 1000, 0);
    for (let i = 0; i < decor.length; i++) decor[i] = 0;
    renderUnlockStats();
    markDirty();
  });

  // Raw JSON
  $("btn-raw-refresh").addEventListener("click", () => {
    if (!state.data) return;
    collectFormsIntoData();
    const pretty = confirm("Pretty-print JSON? (slower on large saves)\n\nOK = pretty, Cancel = compact");
    renderRaw(pretty);
  });

  $("btn-raw-apply").addEventListener("click", () => {
    try {
      const parsed = JSON.parse($("raw-json").value);
      state.data = parsed;
      refreshAllViews();
      markDirty();
      setStatus("Applied raw JSON changes");
    } catch (err) {
      alert(`Invalid JSON: ${err.message}`);
    }
  });

  // Drag and drop
  const overlay = $("drop-overlay");
  function hideDropOverlay() {
    overlay.hidden = true;
  }
  function showDropOverlay() {
    overlay.hidden = false;
  }
  hideDropOverlay();

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
      showDropOverlay();
    }
  });
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (e) => {
    // Only hide when leaving the window (relatedTarget null / outside document)
    if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
      hideDropOverlay();
    }
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    hideDropOverlay();
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideDropOverlay();
  });

  initExpansionSelect();
  showEditor(false);
  setDirty(false);
  setStatus("Ready — load a save file");
})();
