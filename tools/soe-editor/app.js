(() => {
  "use strict";

  const Save = window.SoESave;
  const Skills = window.SoESkills;
  const Items = window.SoEItems;
  const Vault = window.SoEVault;
  const SAVE_DIR = "%USERPROFILE%\\Documents\\Diablo II\\Saves";
  const SAVE_TABS = { character: 1, stats: 1, skills: 1, quests: 1, items: 1 };

  const state = {
    parsed: null,
    fileName: "",
    backup: null,
    dirty: false,
    fileHandle: null,
    loadedLastModified: 0,
    stash: null,
    stashName: "pd2_shared.stash",
    stashBackup: null,
    stashHandle: null,
    stashLastModified: 0,
    stashDirty: false,
    itemView: "inv",
    weaponSet: 1,
    itemSearch: "",
    searchHits: [],
    sel: null,
    spawnKind: "all",
    spawnQuery: "",
    vaultItems: [],
    vaultSel: null,
    vaultQuery: "",
    colQuery: "",
    colFilter: "all",
    craftSel: null,
  };

  const $ = (id) => document.getElementById(id);

  function setStatus(msg) {
    $("status").textContent = msg || "";
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    $("dirty-pill").hidden = !state.dirty && !state.stashDirty;
    $("btn-save").disabled = !state.parsed;
    $("btn-backup").disabled = !state.parsed;
    $("btn-save-inplace").disabled = !state.parsed || !state.fileHandle;
    $("btn-save-stash").disabled = !state.stash;
    $("btn-save-stash-inplace").disabled = !state.stash || !state.stashHandle;
  }

  function setStashDirty(dirty) {
    state.stashDirty = dirty;
    setDirty(state.dirty);
  }

  function showLoaded() {
    const tab = currentPanel();
    applyTabVisibility(tab);
  }

  function currentPanel() {
    return document.querySelector("#tabs .tab.is-active")?.dataset.tab || "character";
  }

  function canShowPanel(tab) {
    if (!SAVE_TABS[tab]) return true;
    if (tab === "items") return !!(state.parsed || state.stash);
    return !!state.parsed;
  }

  function applyTabVisibility(tab) {
    const ok = canShowPanel(tab);
    $("empty-state").hidden = ok;
    document.querySelectorAll("main > .panel").forEach((el) => {
      el.hidden = el.id !== "panel-" + tab || !ok;
    });
  }

  function switchTab(tab) {
    document.querySelectorAll("#tabs .tab").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.tab === tab);
    });
    applyTabVisibility(tab);
    if (tab === "vault") renderVault();
    if (tab === "collection") renderCollection();
    if (tab === "craft") renderCraft();
  }

  function num(id) {
    return Number($(id).value || 0);
  }

  function flush() {
    const p = state.parsed;
    if (!p) return;
    p.name = $("f-name").value.trim();
    p.hardcore = $("f-hardcore").checked;
    const s = p.stats;
    s.level = num("f-level");
    s.experience = num("f-experience");
    s.gold = num("f-gold");
    s.goldbank = num("f-goldbank");
    s.strength = num("f-strength");
    s.dexterity = num("f-dexterity");
    s.vitality = num("f-vitality");
    s.energy = num("f-energy");
    s.statpts = num("f-statpts");
    s.newskills = num("f-newskills");
    s.maxhp = num("f-maxhp");
    s.hp = s.maxhp;
    s.maxmana = num("f-maxmana");
    s.mana = s.maxmana;
    s.maxstamina = num("f-maxstamina");
    s.stamina = s.maxstamina;
    document.querySelectorAll("input[data-skill]").forEach((el) => {
      p.skills[Number(el.dataset.skill)] = Number(el.value || 0);
    });
  }

  function renderSkills() {
    const p = state.parsed;
    const box = $("skill-trees");
    const list = Skills.forClass(p.className);
    const trees = Skills.TREES[p.className] || ["Tree 1", "Tree 2", "Tree 3"];
    box.innerHTML = trees
      .map((title, treeIdx) => {
        const rows = list
          .map((sk, i) => ({ ...sk, i }))
          .filter((sk) => sk.tree === treeIdx)
          .map(
            (sk) => `<label class="skill-row"><span>${sk.name}</span>
              <input type="number" min="0" max="60" data-skill="${sk.i}" value="${p.skills[sk.i] || 0}" /></label>`
          )
          .join("");
        return `<div class="skill-tree"><h3>${title}</h3>${rows}</div>`;
      })
      .join("");
    box.querySelectorAll("input").forEach((el) => {
      el.addEventListener("input", () => setDirty(true));
    });
  }

  function itemBag(where) {
    if (where === "stash") return state.stash ? state.stash.items : [];
    return state.parsed && state.parsed.items ? state.parsed.items.player : [];
  }

  function currentGrid() {
    const grids = Items.grids();
    let grid;
    if (state.itemView === "shared") grid = grids.shared;
    else if (state.itemView === "cube") grid = grids.cube;
    else if (state.itemView === "stash") grid = grids.stash;
    else if (state.itemView === "belt") grid = grids.belt;
    else grid = grids.inv;
    const where = state.itemView === "shared" ? "stash" : "player";
    return Items.fitGrid(itemBag(where), grid);
  }

  function setItemView(view) {
    state.itemView = view;
    document.querySelectorAll("#item-views .tab").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.view === view);
    });
  }

  function allSearchable() {
    const rows = [];
    if (state.parsed && state.parsed.items) {
      state.parsed.items.player.forEach((it, index) => rows.push({ where: "player", index, it }));
      (state.parsed.items.merc || []).forEach((it, index) => rows.push({ where: "merc", index, it }));
      (state.parsed.items.corpse || []).forEach((it, index) => rows.push({ where: "corpse", index, it }));
    }
    if (state.stash) {
      state.stash.items.forEach((it, index) => rows.push({ where: "stash", index, it }));
    }
    return rows;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderSearchHits() {
    const box = $("item-search-hits");
    if (!box) return;
    const q = (state.itemSearch || "").trim();
    if (!q) {
      box.hidden = true;
      box.innerHTML = "";
      state.searchHits = [];
      return;
    }
    const hits = allSearchable().filter((row) => Items.itemMatches(row.it, q, row.where));
    state.searchHits = hits;
    box.hidden = false;
    if (!hits.length) {
      box.innerHTML = `<p class="hint">No items match “${escHtml(q)}”</p>`;
      return;
    }
    box.innerHTML = hits
      .map((row, i) => {
        const loc = Items.locationLabel(row.it, row.where);
        const jump = row.where === "player" || row.where === "stash";
        return `<button type="button" data-hit="${i}" ${jump ? "" : "disabled"}>${escHtml(Items.displayName(row.it))} · ${escHtml(loc)}${jump ? "" : " (no grid yet)"}</button>`;
      })
      .join("");
    box.querySelectorAll("[data-hit]").forEach((el) => {
      el.addEventListener("click", () => jumpToHit(Number(el.dataset.hit)));
    });
  }

  function jumpToHit(i) {
    const row = state.searchHits[i];
    if (!row || (row.where !== "player" && row.where !== "stash")) return;
    setItemView(Items.viewForItem(row.it, row.where));
    if (row.where === "player") revealEquipped(row.it);
    state.sel = { where: row.where, index: row.index };
    renderItems();
    setStatus("Selected " + Items.displayName(row.it) + " in " + Items.locationLabel(row.it, row.where));
  }

  function selectedItem() {
    if (!state.sel) return null;
    const bag = itemBag(state.sel.where);
    return bag[state.sel.index] || null;
  }

  function renderInspect() {
    const item = selectedItem();
    $("item-inspect-empty").hidden = !!item;
    $("item-inspect-body").hidden = !item;
    if (!item) return;
    const nameEl = $("item-inspect-name");
    nameEl.textContent = Items.displayName(item);
    nameEl.className = "item-inspect-name " + Items.qualityClass(item);
    $("item-inspect-meta").textContent = Items.inspectMeta(item, state.sel.where);
    const mods = Items.formatMods(item);
    const modsEl = $("item-inspect-mods");
    modsEl.innerHTML = mods.map((line) => `<li>${escHtml(line)}</li>`).join("");
    modsEl.hidden = !mods.length;
    const gems = (item.socketedItems || []).map((g) => Items.displayName(g));
    const gemsEl = $("item-inspect-gems");
    gemsEl.hidden = !gems.length;
    gemsEl.textContent = gems.length ? "Socketed: " + gems.join(", ") : "";
    const qtyWrap = $("item-qty-wrap");
    const qty = $("f-item-qty");
    qtyWrap.hidden = item.quantity == null;
    qty.disabled = item.quantity == null;
    qty.value = item.quantity != null ? item.quantity : "";
    $("f-item-id").checked = !!item.identified;
    const simple = !!(item.simple || item.ear);
    const eth = $("f-item-eth");
    eth.disabled = simple;
    eth.checked = !!item.ethereal;
    const socks = $("f-item-socks");
    const canSock = !simple && item.socketsBit != null && !item.runeword;
    $("item-socks-wrap").hidden = simple;
    socks.disabled = !canSock;
    socks.value = item.socketed ? item.sockets || 0 : 0;
    const hint = $("item-inspect-socks");
    if (simple) hint.textContent = "Simple items cannot be ethereal or socketed.";
    else if (item.runeword) hint.textContent = "Runeword sockets are locked.";
    else if (!canSock) hint.textContent = "Socket field not found on this item.";
    else {
      const filled = Items.filledSockets(item);
      hint.textContent =
        (item.socketed ? filled + " filled / " + (item.sockets || 0) + " total. " : "No sockets yet. ") +
        "0–6 sockets. Cannot go below gems already in the item. Ethereal does not restat defense or damage.";
    }
    const unequip = $("btn-unequip-item");
    if (unequip) unequip.hidden = item.location !== 1;
  }

  function spawnLabel(code) {
    const n = (Items.itemInfo(code).n || code).replace(/ Rune$/, "");
    return n.replace(/^Craft Ingredient /, "").replace(/^Orb of /, "").replace(/ Orb$/, "");
  }

  function fillSpawnGroups(box, groups, destFn) {
    if (!box) return;
    box.innerHTML = groups
      .map((g) => {
        const btns = g.codes
          .filter((c) => Items.itemInfo(c).n)
          .map((c) => `<button type="button" class="btn" data-spawn="${c}">${spawnLabel(c)}</button>`)
          .join("");
        return `<div class="spawn-group"><h4>${g.group}</h4>${btns}</div>`;
      })
      .join("");
    box.querySelectorAll("[data-spawn]").forEach((btn) => {
      btn.addEventListener("click", () => spawnCode(btn.dataset.spawn, destFn && destFn()));
    });
  }

  function currentSpawnDest() {
    if (state.itemView === "shared") return "shared";
    if (state.itemView === "stash") return "stash";
    if (state.itemView === "cube") return "cube";
    return "inv";
  }

  function renderSpawn() {
    const quick = Items.SPAWN.filter((g) => g.group === "Runes" || g.group === "Currency" || g.group === "Infusions");
    fillSpawnGroups($("item-spawn-groups"), quick, currentSpawnDest);
    fillSpawnGroups($("spawn-groups"), Items.SPAWN, null);
    $("spawn-kinds").querySelectorAll("[data-spawn-kind]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.spawnKind === state.spawnKind);
    });
    renderSpawnResults();
  }

  function renderSpawnResults() {
    const box = $("spawn-results");
    if (!box) return;
    const q = state.spawnQuery.trim();
    if (q.length < 2) {
      box.innerHTML = `<p class="hint">Type at least 2 letters. Click a result to preview, then Send.</p>`;
      return;
    }
    const hits = Items.spawnCatalog(q, state.spawnKind === "all" ? "" : state.spawnKind).slice(0, 64);
    if (!hits.length) {
      box.innerHTML = `<p class="hint">No ${state.spawnKind === "all" ? "bases or uniques" : state.spawnKind + "s"} matching “${q}”.</p>`;
      return;
    }
    box.innerHTML = hits
      .map((h) => {
        const extra = h.kind === "unique" && h.base ? ` <span class="muted">(${h.base})</span>` : "";
        const sel =
          state.craftSel &&
          ((h.kind === "unique" && state.craftSel.kind === "unique" && state.craftSel.id === h.id) ||
            (h.kind === "base" && state.craftSel.kind === "base" && state.craftSel.code === h.code));
        if (h.kind === "unique") {
          return `<button type="button" class="btn is-unique${sel ? " is-selected" : ""}" data-spawn-unique="${h.id}">${h.name}${extra}</button>`;
        }
        return `<button type="button" class="btn${sel ? " is-selected" : ""}" data-spawn-base="${h.code}">${h.name}</button>`;
      })
      .join("");
    box.querySelectorAll("[data-spawn-base]").forEach((btn) => {
      btn.addEventListener("click", () => selectCraft({ kind: "base", code: btn.dataset.spawnBase }));
    });
    box.querySelectorAll("[data-spawn-unique]").forEach((btn) => {
      btn.addEventListener("click", () => selectCraft({ kind: "unique", id: Number(btn.dataset.spawnUnique) }));
    });
  }

  function selectCraft(sel) {
    state.craftSel = sel;
    renderCraft();
  }

  function renderCraft() {
    renderSpawn();
    renderCraftPreview();
  }

  function renderCraftPreview() {
    const empty = $("craft-inspect-empty");
    const body = $("craft-inspect-body");
    if (!empty || !body) return;
    const sel = state.craftSel;
    if (!sel) {
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    empty.hidden = true;
    body.hidden = false;
    if (sel.kind === "unique") {
      const u = Items.uniqueById(sel.id);
      if (!u) {
        empty.hidden = false;
        body.hidden = true;
        return;
      }
      const info = Items.itemInfo(u.c);
      $("craft-inspect-name").textContent = u.n;
      $("craft-inspect-name").className = "item-inspect-name unique";
      $("craft-inspect-meta").textContent = (info.n || u.c) + " · " + u.c + (u.s ? " · " + u.s + "os" : "") + (u.e ? " · Eth" : "");
      const mods = Items.formatUniqueMods(u);
      $("craft-inspect-mods").innerHTML = mods.map((line) => `<li>${escHtml(line)}</li>`).join("");
      $("craft-inspect-mods").hidden = !mods.length;
    } else {
      const info = Items.itemInfo(sel.code);
      $("craft-inspect-name").textContent = info.n || sel.code;
      $("craft-inspect-name").className = "item-inspect-name";
      $("craft-inspect-meta").textContent = sel.code + " · " + (info.w || 1) + "×" + (info.h || 1);
      $("craft-inspect-mods").innerHTML = "";
      $("craft-inspect-mods").hidden = true;
    }
  }

  function sendCraft() {
    const sel = state.craftSel;
    if (!sel) {
      setStatus("Select a base or unique first");
      return;
    }
    if (sel.kind === "unique") spawnUnique(sel.id);
    else spawnCode(sel.code);
  }

  function itemCellHtml(hit, where, attrs, emptyLabel) {
    const sel = hit && state.sel && state.sel.where === where && state.sel.index === hit.index;
    const match = hit && state.itemSearch && Items.itemMatches(hit.it, state.itemSearch, where);
    const q = hit ? Items.qualityClass(hit.it) : "";
    const qty = hit && hit.it.quantity > 1 ? `<span class="d2-qty">${hit.it.quantity}</span>` : "";
    const name = hit ? escHtml(Items.gridLabel(hit.it)) : "";
    const title = hit ? escHtml(Items.displayName(hit.it)) : escHtml(emptyLabel || "");
    const cls = `item-cell${hit ? " is-origin " + q : ""}${sel ? " is-selected" : ""}${match ? " is-hit" : ""}`;
    return `<button type="button" class="${cls}" title="${title}" ${attrs}>${name}${qty}</button>`;
  }

  function weaponSlotIds() {
    return state.weaponSet === 2 ? { wpn: 11, shd: 12 } : { wpn: 4, shd: 5 };
  }

  function revealEquipped(item) {
    if (!item || item.location !== 1) return;
    if (item.equipped === 11 || item.equipped === 12) state.weaponSet = 2;
    else if (item.equipped === 4 || item.equipped === 5) state.weaponSet = 1;
  }

  function selectPlayerItem(index) {
    const bag = itemBag("player");
    const item = bag[index];
    if (item && item.location === 1) revealEquipped(item);
    if (state.sel && state.sel.where === "player" && state.sel.index === index) state.sel = null;
    else state.sel = { where: "player", index };
    renderItems();
  }

  function renderDoll() {
    const doll = $("d2-doll");
    if (!doll) return;
    const show = !!state.parsed;
    doll.hidden = !show;
    if (!show) return;
    const where = "player";
    const bag = itemBag(where);
    const byEq = new Map();
    bag.forEach((it, index) => {
      if (it.location === 1) byEq.set(it.equipped, { it, index });
    });
    const { wpn, shd } = weaponSlotIds();
    const slots = [
      [1, "helm", "Helm"],
      [2, "amu", "Amulet"],
      [3, "armor", "Armor"],
      [wpn, "wpn", "Weapon"],
      [shd, "shd", "Shield"],
      [6, "rring", "Right ring"],
      [7, "lring", "Left ring"],
      [8, "belt", "Belt"],
      [9, "boot", "Boots"],
      [10, "glv", "Gloves"],
    ];
    const set1 = state.weaponSet !== 2;
    doll.innerHTML =
      `<div class="d2-wswap" style="grid-column:1/3;grid-row:1">
        <button type="button" data-wset="1" class="${set1 ? "is-active" : ""}">I</button>
        <button type="button" data-wset="2" class="${set1 ? "" : "is-active"}">II</button>
      </div>
      <div class="d2-wswap" style="grid-column:9/11;grid-row:1">
        <button type="button" data-wset="1" class="${set1 ? "is-active" : ""}">I</button>
        <button type="button" data-wset="2" class="${set1 ? "" : "is-active"}">II</button>
      </div>` +
      slots
        .map(([id, slot, label]) => {
          const hit = byEq.get(id);
          return itemCellHtml(hit, where, `data-slot="${slot}" data-eq="${id}"${hit ? ` data-where="${where}" data-index="${hit.index}"` : ""}`, label);
        })
        .join("");
    doll.querySelectorAll("[data-wset]").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        state.weaponSet = Number(el.dataset.wset) === 2 ? 2 : 1;
        renderItems();
      });
    });
  }

  function renderEquippedList() {
    const box = $("item-eq-list");
    if (!box) return;
    const bag = itemBag("player");
    const rows = bag
      .map((it, index) => ({ it, index }))
      .filter(({ it }) => it.location === 1);
    box.hidden = !state.parsed || !rows.length;
    if (box.hidden) return;
    box.innerHTML = rows
      .map(({ it, index }) => {
        const sel = state.sel && state.sel.where === "player" && state.sel.index === index;
        return `<button type="button" class="${Items.qualityClass(it)}${sel ? " is-selected" : ""}" data-eq-index="${index}">${escHtml(Items.displayName(it))} · ${escHtml(Items.locationLabel(it, "player"))}</button>`;
      })
      .join("");
    box.querySelectorAll("[data-eq-index]").forEach((el) => {
      el.addEventListener("click", () => selectPlayerItem(Number(el.dataset.eqIndex)));
    });
  }

  function renderItems() {
    const gridEl = $("item-grid");
    const listEl = $("item-list");
    const grid = currentGrid();
    const where = state.itemView === "shared" ? "stash" : "player";
    const bag = itemBag(where);
    const occupied = new Map();
    bag.forEach((it, index) => {
      if (!Items.itemInGrid(it, grid)) return;
      occupied.set(it.x + "," + it.y, { it, index });
      for (const c of Items.cellsUsed(it)) {
        if (c.x === it.x && c.y === it.y) continue;
        occupied.set(c.x + "," + c.y, { it, index, fill: true });
      }
    });

    const hint = $("item-board-hint");
    if (hint) {
      hint.textContent = selectedItem()
        ? "Click an empty cell or gear slot to move " + Items.displayName(selectedItem()) + "."
        : "Click an item to inspect it. Click an empty cell to move the selected item.";
    }

    renderDoll();
    renderEquippedList();

    const footer = $("d2-footer");
    if (footer) {
      footer.hidden = !state.parsed;
      if (!footer.hidden) $("d2-gold").textContent = String(state.parsed.stats.gold || 0);
    }

    gridEl.className = "item-grid d2-bag";
    gridEl.style.gridTemplateColumns = `repeat(${grid.w}, var(--d2-cell))`;
    gridEl.style.gridTemplateRows = `repeat(${grid.h}, var(--d2-cell))`;
    let html = "";
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const hit = occupied.get(x + "," + y);
        if (hit && hit.fill) continue;
        const style = `grid-column:${x + 1}/span ${hit ? hit.it.info.w || 1 : 1};grid-row:${y + 1}/span ${hit ? hit.it.info.h || 1 : 1}`;
        html += itemCellHtml(
          hit,
          where,
          hit
            ? `data-where="${where}" data-index="${hit.index}" style="${style}"`
            : `data-x="${x}" data-y="${y}" style="${style}"`
        );
      }
    }
    gridEl.innerHTML = html;

    const extras = bag
      .map((it, index) => ({ it, index }))
      .filter(({ it, index }) => {
        if (it.location === 1) return false;
        if (Items.itemInGrid(it, grid)) {
          const origin = occupied.get(it.x + "," + it.y);
          return origin && origin.index !== index;
        }
        return false;
      });
    listEl.innerHTML = extras
      .map(({ it, index }) => `<button type="button" data-where="${where}" data-index="${index}">${escHtml(Items.displayName(it))} @ ${it.x},${it.y}</button>`)
      .join("");

    const nPlayer = state.parsed && state.parsed.items ? state.parsed.items.player.length : 0;
    const nStash = state.stash ? state.stash.items.length : 0;
    $("items-summary").textContent =
      (state.parsed ? nPlayer + " on " + state.parsed.name : "No character") +
      " · " +
      (state.stash ? nStash + " in shared stash" : "shared stash not loaded") +
      (state.parsed && state.parsed.itemsError ? " · item parse warning: " + state.parsed.itemsError : "");

    const counts = { inv: 0, cube: 0, stash: 0, shared: nStash, belt: 0 };
    if (state.parsed && state.parsed.items) {
      for (const it of state.parsed.items.player) {
        if (it.location === 1) continue;
        else if (it.location === 2) counts.belt++;
        else if (it.panel === 4) counts.cube++;
        else if (it.panel === 5) counts.stash++;
        else counts.inv++;
      }
    }
    document.querySelectorAll("#item-views [data-count]").forEach((el) => {
      const n = counts[el.dataset.count] || 0;
      el.textContent = n ? n : "";
    });

    function bindClicks(root) {
      if (!root) return;
      root.querySelectorAll("[data-index]").forEach((el) => {
        el.addEventListener("click", () => {
          const index = Number(el.dataset.index);
          const whereClick = el.dataset.where;
          if (whereClick === "player") {
            selectPlayerItem(index);
            return;
          }
          if (state.sel && state.sel.where === whereClick && state.sel.index === index) state.sel = null;
          else state.sel = { where: whereClick, index };
          renderItems();
        });
      });
      root.querySelectorAll("[data-x]").forEach((el) => {
        el.addEventListener("click", () => moveSelectedTo(Number(el.dataset.x), Number(el.dataset.y)));
      });
      root.querySelectorAll("[data-eq]").forEach((el) => {
        el.addEventListener("click", () => {
          if (el.dataset.index) return;
          const item = selectedItem();
          if (!item) return;
          const destWhere = "player";
          if (state.sel.where !== destWhere) {
            const src = itemBag(state.sel.where);
            const [moved] = src.splice(state.sel.index, 1);
            itemBag(destWhere).push(moved);
            state.sel = { where: destWhere, index: itemBag(destWhere).length - 1 };
            setStashDirty(true);
            setDirty(true);
          }
          Items.applyPlacement(selectedItem(), { location: 1, equipped: Number(el.dataset.eq), x: 0, y: 0, panel: 0 });
          setDirty(true);
          renderItems();
        });
      });
    }
    bindClicks(gridEl);
    bindClicks($("d2-doll"));
    listEl.querySelectorAll("[data-index]").forEach((el) => {
      el.addEventListener("click", () => {
        state.sel = { where: el.dataset.where, index: Number(el.dataset.index) };
        renderItems();
      });
    });
    renderInspect();
    renderSearchHits();
  }

  function moveSelectedTo(x, y) {
    const item = selectedItem();
    if (!item) return;
    const grid = currentGrid();
    if (grid.equipped) return;
    const destWhere = state.itemView === "shared" ? "stash" : "player";
    if (state.sel.where !== destWhere) {
      const src = itemBag(state.sel.where);
      const [moved] = src.splice(state.sel.index, 1);
      itemBag(destWhere).push(moved);
      state.sel = { where: destWhere, index: itemBag(destWhere).length - 1 };
      if (state.sel.where === "stash" || destWhere === "stash") setStashDirty(true);
      else setDirty(true);
    }
    const cur = selectedItem();
    Items.applyPlacement(cur, { x, y, location: grid.location, panel: grid.panel, equipped: 0 });
    if (destWhere === "stash") setStashDirty(true);
    else setDirty(true);
    renderItems();
  }

  function unequipSelected() {
    const item = selectedItem();
    if (!item || item.location !== 1) {
      setStatus("Select an equipped item first");
      return;
    }
    const dest = spawnDestination(item.info.w, item.info.h, "inv");
    if (!dest || dest.destWhere === "vault") {
      setStatus("No inventory space to unequip — send it to Vault instead");
      return;
    }
    Items.applyPlacement(item, dest.place);
    setDirty(true);
    setItemView("inv");
    renderItems();
    setStatus("Unequipped " + Items.displayName(item) + " into Inventory");
  }

  function duplicateSelected() {
    const item = selectedItem();
    if (!item) {
      setStatus("Select an item first");
      return;
    }
    let destView = state.itemView;
    let destWhere = destView === "shared" ? "stash" : "player";
    let grid = currentGrid();
    if (grid.equipped || destView === "belt") {
      destView = "inv";
      destWhere = "player";
      grid = Items.grids().inv;
    }
    if (destWhere === "player" && (!state.parsed || !state.parsed.items)) {
      setStatus("Load a character first");
      return;
    }
    if (destWhere === "stash" && !state.stash) {
      setStatus("Load shared stash first");
      return;
    }
    try {
      const clone = Items.cloneItem(item);
      const place = Items.firstFit(itemBag(destWhere), grid, clone.info.w || 1, clone.info.h || 1);
      if (!place) {
        setStatus("No free space in " + grid.label);
        return;
      }
      Items.applyPlacement(clone, place);
      const bag = itemBag(destWhere);
      bag.push(clone);
      setItemView(destView);
      state.sel = { where: destWhere, index: bag.length - 1 };
      if (destWhere === "stash") setStashDirty(true);
      else setDirty(true);
      renderItems();
      setStatus("Duplicated " + Items.displayName(clone) + " into " + grid.label);
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  function deleteSelected() {
    if (!state.sel) {
      setStatus("Select an item first");
      return;
    }
    const bag = itemBag(state.sel.where);
    const gone = bag.splice(state.sel.index, 1)[0];
    if (state.sel.where === "stash") setStashDirty(true);
    else setDirty(true);
    state.sel = null;
    renderItems();
    setStatus("Deleted " + (gone ? Items.displayName(gone) : "item"));
  }

  function spawnDestination(w, h, destKey) {
    destKey = destKey || ($("f-craft-dest") && $("f-craft-dest").value) || state.itemView;
    if (destKey === "vault") {
      return { destView: "vault", destWhere: "vault", grid: { label: "Vault" }, bag: null, place: { x: 0, y: 0, location: 0, panel: 1, equipped: 0 } };
    }
    let destView = destKey;
    if (destView === "inventory") destView = "inv";
    if (destView !== "inv" && destView !== "cube" && destView !== "stash" && destView !== "shared") {
      destView = state.itemView;
    }
    let destWhere = destView === "shared" ? "stash" : "player";
    let grid;
    const grids = Items.grids();
    if (destView === "shared") grid = grids.shared;
    else if (destView === "cube") grid = grids.cube;
    else if (destView === "stash") grid = grids.stash;
    else grid = grids.inv;
    if (grid.equipped || destView === "belt") {
      destView = "inv";
      destWhere = "player";
      grid = grids.inv;
    }
    if (destWhere === "player" && (!state.parsed || !state.parsed.items)) {
      setStatus("Load a character first, or send to Vault");
      return null;
    }
    if (destWhere === "stash" && !state.stash) {
      state.stash = Items.emptyStash();
      state.stashName = "pd2_shared.stash";
    }
    const bag = itemBag(destWhere);
    const place = Items.firstFit(bag, grid, w || 1, h || 1);
    if (!place) {
      setStatus("No free space in " + grid.label + " — send to Vault instead");
      return null;
    }
    return { destView, destWhere, grid, bag, place };
  }

  function spawnOpts() {
    const socks = $("f-spawn-socks").value;
    return {
      ethereal: $("f-spawn-eth").checked,
      sockets: socks === "" ? undefined : Number(socks),
    };
  }

  async function finishSpawn(item, dest) {
    if (dest.destWhere === "vault") {
      try {
        await Vault.addItem(item);
        await refreshVault();
        setStatus("Stored " + Items.displayName(item) + " in Vault");
        renderCraft();
        renderCollection();
      } catch (err) {
        setStatus(err.message || String(err));
      }
      return;
    }
    dest.bag.push(item);
    setItemView(dest.destView);
    state.sel = { where: dest.destWhere, index: dest.bag.length - 1 };
    if (dest.destWhere === "stash") setStashDirty(true);
    else setDirty(true);
    renderItems();
    setStatus("Spawned " + Items.displayName(item) + " into " + dest.grid.label);
  }

  function spawnCode(code, destKey) {
    const info = Items.itemInfo(code);
    const dest = spawnDestination(info.w, info.h, destKey);
    if (!dest) return;
    try {
      const extra = spawnOpts();
      const qty = code === "key" || code === "tbk" || code === "ibk" ? 20 : 1;
      const item = Items.spawnItem(code, { ...dest.place, quantity: qty }, extra);
      finishSpawn(item, dest);
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  function spawnUnique(id) {
    const u = Items.uniqueById(id);
    if (!u) {
      setStatus("Unknown unique");
      return;
    }
    const info = Items.itemInfo(u.c);
    const dest = spawnDestination(info.w, info.h);
    if (!dest) return;
    try {
      const item = Items.spawnUnique(id, dest.place, spawnOpts());
      finishSpawn(item, dest);
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  async function refreshVault() {
    try {
      state.vaultItems = await Vault.list();
    } catch (err) {
      state.vaultItems = [];
      setStatus(err.message || String(err));
    }
    if (state.vaultSel != null && !state.vaultItems.some((r) => r.id === state.vaultSel)) state.vaultSel = null;
    renderVault();
  }

  function vaultRecordClass(rec) {
    const fake = { quality: rec.quality, ethereal: rec.ethereal };
    return Items.qualityClass(fake);
  }

  function renderVault() {
    const box = $("vault-list");
    const summary = $("vault-summary");
    if (!box) return;
    const q = (state.vaultQuery || "").trim().toLowerCase();
    const rows = state.vaultItems.filter((r) => {
      if (!q) return true;
      return [r.name, r.code, String(r.uniqueId || "")].join(" ").toLowerCase().includes(q);
    });
    if (summary) {
      summary.textContent =
        state.vaultItems.length +
        " item" +
        (state.vaultItems.length === 1 ? "" : "s") +
        " in the browser vault" +
        (q ? " · showing " + rows.length : "") +
        ". Copy from character/stash, or export a JSON backup.";
    }
    box.innerHTML = rows
      .map((r) => {
        const sel = state.vaultSel === r.id ? " is-selected" : "";
        return `<button type="button" class="vault-row ${vaultRecordClass(r)}${sel}" data-vault-id="${r.id}">${escHtml(r.name || r.code)}</button>`;
      })
      .join("");
    box.querySelectorAll("[data-vault-id]").forEach((el) => {
      el.addEventListener("click", () => {
        state.vaultSel = Number(el.dataset.vaultId);
        renderVault();
      });
    });
    renderVaultInspect();
  }

  function selectedVaultRecord() {
    return state.vaultItems.find((r) => r.id === state.vaultSel) || null;
  }

  function renderVaultInspect() {
    const rec = selectedVaultRecord();
    const empty = $("vault-inspect-empty");
    const body = $("vault-inspect-body");
    if (!empty || !body) return;
    empty.hidden = !!rec;
    body.hidden = !rec;
    if (!rec) return;
    let item = null;
    try {
      item = Vault.recordToItem(rec);
    } catch (_) {}
    $("vault-inspect-name").textContent = rec.name || (item && Items.displayName(item)) || rec.code;
    $("vault-inspect-name").className = "item-inspect-name " + vaultRecordClass(rec);
    $("vault-inspect-meta").textContent = item ? Items.inspectMeta(item, "vault") : rec.code;
    const mods = item ? Items.formatMods(item) : [];
    $("vault-inspect-mods").innerHTML = mods.map((line) => `<li>${escHtml(line)}</li>`).join("");
    $("vault-inspect-mods").hidden = !mods.length;
  }

  async function depositSelected(move) {
    const item = selectedItem();
    if (!item) {
      setStatus("Select an item on the Items tab first");
      return;
    }
    try {
      const clone = Items.cloneItem(item);
      await Vault.addItem(clone);
      if (move) deleteSelected();
      await refreshVault();
      renderCollection();
      setStatus((move ? "Moved " : "Copied ") + Items.displayName(item) + " to Vault");
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  async function copyBagToVault(where) {
    const bag = where === "stash" ? (state.stash && state.stash.items) : state.parsed && state.parsed.items && state.parsed.items.player;
    if (!bag || !bag.length) {
      setStatus(where === "stash" ? "Load shared stash first" : "Load a character first");
      return;
    }
    try {
      const n = await Vault.addMany(bag.map((it) => Items.cloneItem(it)));
      await refreshVault();
      renderCollection();
      setStatus("Copied " + n + " items into Vault");
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  function withdrawDestKey() {
    if (state.itemView === "shared" && state.stash) return "shared";
    if (state.itemView === "stash" && state.parsed) return "stash";
    if (state.itemView === "cube" && state.parsed) return "cube";
    if (state.parsed) return "inv";
    if (state.stash) return "shared";
    return "inv";
  }

  async function withdrawVault(removeAfter) {
    const rec = selectedVaultRecord();
    if (!rec) {
      setStatus("Select a vault item first");
      return;
    }
    let item;
    try {
      item = Items.cloneItem(Vault.recordToItem(rec));
    } catch (err) {
      setStatus(err.message || String(err));
      return;
    }
    const dest = spawnDestination(item.info.w, item.info.h, withdrawDestKey());
    if (!dest || dest.destWhere === "vault") {
      setStatus("Load a character or shared stash to withdraw into");
      return;
    }
    Items.applyPlacement(item, dest.place);
    dest.bag.push(item);
    setItemView(dest.destView);
    state.sel = { where: dest.destWhere, index: dest.bag.length - 1 };
    if (dest.destWhere === "stash") setStashDirty(true);
    else setDirty(true);
    if (removeAfter) {
      await Vault.remove(rec.id);
      await refreshVault();
    }
    switchTab("items");
    renderItems();
    setStatus("Withdrew " + Items.displayName(item) + " into " + dest.grid.label);
  }

  async function deleteVaultSelected() {
    const rec = selectedVaultRecord();
    if (!rec) return;
    await Vault.remove(rec.id);
    await refreshVault();
    renderCollection();
    setStatus("Removed " + (rec.name || rec.code) + " from Vault");
  }

  async function exportVault() {
    try {
      const payload = await Vault.exportPayload();
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "soe-vault-" + backupStamp() + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      setStatus("Exported " + payload.items.length + " vault items");
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  async function importVaultFile(file) {
    try {
      const payload = JSON.parse(await file.text());
      const n = await Vault.importPayload(payload);
      await refreshVault();
      renderCollection();
      setStatus("Imported " + n + " items into Vault");
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  function ownedUniqueIds() {
    const ids = new Set();
    for (const row of allSearchable()) {
      if (row.it && row.it.quality === 7 && row.it.uniqueId != null) ids.add(row.it.uniqueId);
    }
    for (const rec of state.vaultItems) {
      if (rec.quality === 7 && rec.uniqueId != null) ids.add(rec.uniqueId);
    }
    return ids;
  }

  function renderCollection() {
    const box = $("col-groups");
    const summary = $("col-summary");
    const prog = $("col-progress");
    if (!box) return;
    const owned = ownedUniqueIds();
    const all = Items.allUniques();
    const have = all.filter((u) => owned.has(u.i)).length;
    const q = (state.colQuery || "").trim().toLowerCase();
    if (summary) {
      summary.textContent =
        have + " / " + all.length + " uniques owned (character + stash + vault). Click a missing unique to preview it on Craft.";
    }
    if (prog) {
      prog.hidden = false;
      const pct = all.length ? Math.round((have / all.length) * 100) : 0;
      prog.innerHTML = `<strong>${have} / ${all.length}</strong> unique collection · ${pct}%<div class="col-bar"><span style="width:${pct}%"></span></div>`;
    }
    $("col-filters").querySelectorAll("[data-col-filter]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.colFilter === state.colFilter);
    });
    const groups = {};
    for (const u of all) {
      const isOwned = owned.has(u.i);
      if (state.colFilter === "owned" && !isOwned) continue;
      if (state.colFilter === "missing" && isOwned) continue;
      const info = Items.itemInfo(u.c);
      const hay = (u.n + " " + u.c + " " + ((info && info.n) || "")).toLowerCase();
      if (q && !hay.includes(q)) continue;
      const kind = Items.uniqueKind(u);
      if (!groups[kind]) groups[kind] = [];
      groups[kind].push({ u, info, isOwned });
    }
    const order = ["Weapons", "Armor", "Jewelry", "Other"];
    box.innerHTML = order
      .filter((k) => groups[k] && groups[k].length)
      .map((k) => {
        const cards = groups[k]
          .map(({ u, info, isOwned }) => {
            return `<button type="button" class="col-item ${isOwned ? "owned" : "missing"}" data-unique="${u.i}">
              ${escHtml(u.n)}<span class="col-base">${escHtml((info && info.n) || u.c)}${isOwned ? " · owned" : ""}</span>
            </button>`;
          })
          .join("");
        return `<div class="col-group"><h3>${k} · ${groups[k].length}</h3><div class="col-grid">${cards}</div></div>`;
      })
      .join("");
    box.querySelectorAll("[data-unique]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = Number(el.dataset.unique);
        state.craftSel = { kind: "unique", id };
        const u = Items.uniqueById(id);
        if (u) {
          state.spawnQuery = u.n;
          state.spawnKind = "unique";
          const search = $("f-spawn-search");
          if (search) search.value = u.n;
        }
        switchTab("craft");
      });
    });
  }

  function renderQuests() {
    const p = state.parsed;
    const box = $("quest-summary");
    const progress = Save.summarizeProgress(p.bytes);
    p.progress = progress;
    box.innerHTML = progress.diffs
      .map((d) => {
        const acts = [1, 2, 3, 4, 5]
          .map((act) => {
            const qs = d.quests.filter((q) => q.act === act);
            const done = qs.filter((q) => q.done).length;
            const items = qs
              .map((q) => `<li class="${q.done ? "is-done" : ""}">${q.done ? "✓" : "○"} ${q.name}</li>`)
              .join("");
            return `<div class="quest-act"><h4>Act ${act} <span>${done}/${qs.length}</span></h4><ul>${items}</ul></div>`;
          })
          .join("");
        return `<article class="quest-diff">
          <h3>${d.name}${d.active ? " · active" : ""} <span>Act ${d.act + 1} · WP ${d.waypoints}/${d.waypointsTotal} · Quests ${d.questsDone}/${d.questsTotal}</span></h3>
          <div class="quest-acts">${acts}</div>
        </article>`;
      })
      .join("");
  }

  function render() {
    const p = state.parsed;
    if (p) {
      $("f-name").value = p.name;
      $("f-class").value = p.className;
      $("f-level").value = p.stats.level;
      $("f-experience").value = p.stats.experience;
      $("f-gold").value = p.stats.gold;
      $("f-goldbank").value = p.stats.goldbank;
      $("f-hardcore").checked = p.hardcore;
      $("f-strength").value = p.stats.strength;
      $("f-dexterity").value = p.stats.dexterity;
      $("f-vitality").value = p.stats.vitality;
      $("f-energy").value = p.stats.energy;
      $("f-statpts").value = p.stats.statpts;
      $("f-newskills").value = p.stats.newskills;
      $("f-maxhp").value = p.stats.maxhp;
      $("f-maxmana").value = p.stats.maxmana;
      $("f-maxstamina").value = p.stats.maxstamina;
      $("char-summary").textContent = `${p.name} · ${p.className} · level ${p.stats.level}${p.hardcore ? " · Hardcore" : ""}`;
      renderSkills();
      renderQuests();
    }
    renderItems();
    renderCollection();
  }

  function isStashBytes(bytes) {
    return bytes[0] === 0x55 && bytes[1] === 0xbb && bytes[2] === 0x55 && bytes[3] === 0xbb;
  }

  async function loadStashBytes(bytes, fileName, handle, lastModified) {
    const parsed = Items.parseStash(bytes);
    state.stash = parsed;
    state.stashName = fileName || "pd2_shared.stash";
    state.stashBackup = Uint8Array.from(bytes);
    state.stashHandle = handle || null;
    state.stashLastModified = lastModified || 0;
    showLoaded();
    if (!state.parsed) switchTab("items");
    else renderItems();
    setStashDirty(false);
    const warn = parsed.warnings && parsed.warnings.length;
    setStatus(
      "Loaded " +
        state.stashName +
        " · " +
        parsed.items.length +
        " items" +
        (warn ? " · " + warn + " parse warning(s): " + parsed.warnings[0] : "")
    );
  }

  async function loadBytes(bytes, fileName, handle, lastModified) {
    if (isStashBytes(bytes) || /\.stash$/i.test(fileName || "")) {
      await loadStashBytes(bytes, fileName, handle, lastModified);
      return;
    }
    const parsed = Save.parse(bytes);
    state.parsed = parsed;
    state.fileName = fileName || parsed.name + ".d2s";
    state.backup = Uint8Array.from(bytes);
    state.fileHandle = handle || null;
    state.loadedLastModified = lastModified || 0;
    showLoaded();
    switchTab("character");
    render();
    setDirty(false);
    setStatus(
      "Loaded " +
        state.fileName +
        (Save.verify(bytes) ? " · checksum ok" : " · checksum mismatch") +
        (parsed.items ? " · " + parsed.items.player.length + " items" : parsed.itemsError ? " · items unread: " + parsed.itemsError : "") +
        (parsed.items && parsed.items.warnings && parsed.items.warnings.length
          ? " · " + parsed.items.warnings.length + " parse warning(s): " + parsed.items.warnings[0]
          : "")
    );
  }

  async function loadFile(file, handle) {
    const buf = new Uint8Array(await file.arrayBuffer());
    await loadBytes(buf, file.name, handle, file.lastModified || 0);
  }

  function downloadBytes(bytes, name) {
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function backupStamp() {
    const d = new Date();
    return (
      d.getFullYear() +
      pad2(d.getMonth() + 1) +
      pad2(d.getDate()) +
      "-" +
      pad2(d.getHours()) +
      pad2(d.getMinutes()) +
      pad2(d.getSeconds())
    );
  }

  function bakName(fileName, fallback) {
    const stamp = backupStamp();
    const name = fileName || fallback || "save";
    if (/\.d2s$/i.test(name)) return name.replace(/\.d2s$/i, "." + stamp + ".d2s.bak");
    if (/\.stash$/i.test(name)) return name.replace(/\.stash$/i, "." + stamp + ".stash.bak");
    return name + "." + stamp + ".bak";
  }

  async function bytesFromHandle(handle, fallback) {
    if (handle) {
      try {
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch (_) {}
    }
    return fallback ? Uint8Array.from(fallback) : null;
  }

  async function diskInfo(handle, loadedLastModified) {
    if (!handle) return { changed: false, lastModified: 0 };
    const file = await handle.getFile();
    return {
      changed: loadedLastModified > 0 && file.lastModified > loadedLastModified + 750,
      lastModified: file.lastModified,
      file,
    };
  }

  function formatWhen(ms) {
    if (!ms) return "unknown time";
    return new Date(ms).toLocaleString();
  }

  let writeDecision = null;

  function confirmWrite(opts) {
    opts = opts || {};
    $("write-modal-title").textContent = opts.title || "Close Sanctuary of Exile first";
    $("write-modal-body").textContent =
      opts.body || "If SoE is running it will overwrite this file when you leave a game, and these edits will vanish.";
    const stale = $("write-modal-stale");
    if (opts.staleText) {
      stale.hidden = false;
      stale.textContent = opts.staleText;
    } else {
      stale.hidden = true;
      stale.textContent = "";
    }
    $("f-write-backup").checked = opts.backup !== false;
    $("write-modal").hidden = false;
    return new Promise((resolve) => {
      writeDecision = resolve;
    });
  }

  function finishWriteConfirm(ok) {
    $("write-modal").hidden = true;
    const backup = !!$("f-write-backup").checked;
    const resolve = writeDecision;
    writeDecision = null;
    if (resolve) resolve(ok ? { ok: true, backup } : { ok: false, backup: false });
  }

  async function guardInPlaceSave({ handle, loadedLastModified, fileName, fallbackBytes, kind }) {
    let stale = false;
    let diskTime = 0;
    try {
      const info = await diskInfo(handle, loadedLastModified);
      stale = info.changed;
      diskTime = info.lastModified;
    } catch (err) {
      setStatus(err.message || String(err));
    }
    const decision = await confirmWrite({
      title: "Close Sanctuary of Exile first",
      body:
        "About to overwrite " +
        (fileName || "this file") +
        " in the Saves folder. Quit SoE completely before you continue — the game writes the save again when you exit a game.",
      staleText: stale
        ? "This file changed on disk at " +
          formatWhen(diskTime) +
          " (after you loaded it here). SoE was probably still running. Saving now can fight the game’s copy."
        : "",
    });
    if (!decision.ok) return false;
    if (decision.backup) {
      const snap = await bytesFromHandle(handle, fallbackBytes);
      if (snap && snap.length) downloadBytes(snap, bakName(fileName, kind === "stash" ? "pd2_shared.stash" : "character.d2s"));
    }
    return true;
  }

  function buildSave() {
    flush();
    return Save.write(state.parsed);
  }

  function copySavePath() {
    const text = SAVE_DIR;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
    setStatus("Save folder: " + text);
  }

  $("file-input").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      await loadFile(file, null);
    } catch (err) {
      setStatus(err.message || String(err));
    }
    ev.target.value = "";
  });

  $("btn-find-save").addEventListener("click", async () => {
    if (!window.showOpenFilePicker) {
      $("file-input").click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        id: "soe-d2s",
        types: [
          { description: "Diablo II character", accept: { "application/octet-stream": [".d2s"] } },
          { description: "PD2 shared stash", accept: { "application/octet-stream": [".stash"] } },
        ],
      });
      const file = await handle.getFile();
      await loadFile(file, handle);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      setStatus(err.message || String(err));
    }
  });

  $("btn-open-save-folder").addEventListener("click", copySavePath);
  $("btn-open-save-folder-modal").addEventListener("click", copySavePath);
  $("btn-close-modal").addEventListener("click", () => {
    $("install-modal").hidden = true;
  });
  $("btn-write-cancel").addEventListener("click", () => finishWriteConfirm(false));
  $("btn-write-ok").addEventListener("click", () => finishWriteConfirm(true));

  $("btn-backup").addEventListener("click", () => {
    if (!state.backup) return;
    downloadBytes(state.backup, bakName(state.fileName, "character.d2s"));
    setStatus("Downloaded backup as .d2s.bak — keep it out of the Saves folder");
  });

  $("btn-save").addEventListener("click", () => {
    try {
      const out = buildSave();
      downloadBytes(out, state.fileName || "character.d2s");
      $("install-modal").hidden = false;
      setDirty(false);
      setStatus("Downloaded " + (state.fileName || "character.d2s") + " · checksum " + (Save.verify(out) ? "ok" : "failed"));
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-save-inplace").addEventListener("click", async () => {
    if (!state.fileHandle) return;
    try {
      const ok = await guardInPlaceSave({
        handle: state.fileHandle,
        loadedLastModified: state.loadedLastModified,
        fileName: state.fileName,
        fallbackBytes: state.backup,
        kind: "d2s",
      });
      if (!ok) {
        setStatus("Save cancelled");
        return;
      }
      const out = buildSave();
      const writable = await state.fileHandle.createWritable();
      await writable.write(out);
      await writable.close();
      try {
        const file = await state.fileHandle.getFile();
        state.loadedLastModified = file.lastModified;
      } catch (_) {}
      setDirty(false);
      setStatus("Wrote " + state.fileName + " in place · checksum " + (Save.verify(out) ? "ok" : "failed"));
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-apply-level").addEventListener("click", () => {
    if (!state.parsed) return;
    flush();
    const lv = Math.max(1, Math.min(99, state.parsed.stats.level || 1));
    state.parsed.stats.level = lv;
    state.parsed.stats.experience = Save.expForLevel(lv);
    render();
    setDirty(true);
  });

  $("btn-fill-points").addEventListener("click", () => {
    if (!state.parsed) return;
    flush();
    state.parsed.stats.statpts = 500;
    state.parsed.stats.newskills = 50;
    render();
    setDirty(true);
  });

  $("btn-all-skills").addEventListener("click", () => {
    if (!state.parsed) return;
    flush();
    const n = Math.max(0, Math.min(60, num("f-all-skills")));
    state.parsed.skills = state.parsed.skills.map(() => n);
    render();
    setDirty(true);
  });

  $("btn-clear-skills").addEventListener("click", () => {
    if (!state.parsed) return;
    flush();
    state.parsed.skills = state.parsed.skills.map(() => 0);
    render();
    setDirty(true);
  });

  $("btn-unlock-all").addEventListener("click", () => {
    if (!state.parsed) return;
    flush();
    const result = Save.unlockProgress(state.parsed, { rewards: $("f-quest-rewards").checked });
    render();
    setDirty(true);
    const extra = [];
    if (result.skillGain || result.statGain) extra.push(`+${result.skillGain} skill pts, +${result.statGain} stat pts`);
    if (result.malahGain) extra.push(`+${result.malahGain} all resist (Malah)`);
    if (result.cube && result.cube.added) extra.push("Horadric Cube → " + result.cube.label);
    else if (result.cube && result.cube.reason === "already") extra.push("cube already present");
    else if (result.cube && result.cube.reason === "no-space") extra.push("no space for cube — spawn it from Craft");
    setStatus("Unlocked all quests, waypoints, and difficulties" + (extra.length ? " · " + extra.join(" · ") : " · rewards were already collected"));
  });

  document.querySelectorAll("#tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.parsed) flush();
      switchTab(btn.dataset.tab);
    });
  });

  document.querySelectorAll("#item-views .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      setItemView(btn.dataset.view);
      renderItems();
    });
  });

  $("stash-input").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      await loadStashBytes(buf, file.name, null, file.lastModified || 0);
    } catch (err) {
      setStatus(err.message || String(err));
    }
    ev.target.value = "";
  });

  $("btn-save-stash").addEventListener("click", () => {
    if (!state.stash) return;
    try {
      const out = Items.writeStash(state.stash);
      downloadBytes(out, state.stashName || "pd2_shared.stash");
      setStashDirty(false);
      setStatus("Downloaded " + (state.stashName || "pd2_shared.stash"));
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-save-stash-inplace").addEventListener("click", async () => {
    if (!state.stashHandle || !state.stash) return;
    try {
      const ok = await guardInPlaceSave({
        handle: state.stashHandle,
        loadedLastModified: state.stashLastModified,
        fileName: state.stashName,
        fallbackBytes: state.stashBackup,
        kind: "stash",
      });
      if (!ok) {
        setStatus("Stash save cancelled");
        return;
      }
      const out = Items.writeStash(state.stash);
      const writable = await state.stashHandle.createWritable();
      await writable.write(out);
      await writable.close();
      try {
        const file = await state.stashHandle.getFile();
        state.stashLastModified = file.lastModified;
      } catch (_) {}
      setStashDirty(false);
      setStatus("Wrote " + state.stashName + " in place");
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-unequip-item").addEventListener("click", () => unequipSelected());
  $("btn-duplicate-item").addEventListener("click", () => duplicateSelected());
  $("btn-copy-vault").addEventListener("click", () => depositSelected(false));
  $("btn-move-vault").addEventListener("click", () => depositSelected(true));
  $("f-item-search").addEventListener("input", () => {
    state.itemSearch = $("f-item-search").value;
    renderItems();
  });

  $("btn-identify-all").addEventListener("click", () => {
    const bags = [];
    if (state.parsed && state.parsed.items) bags.push(["player", state.parsed.items.player]);
    if (state.stash) bags.push(["stash", state.stash.items]);
    let n = 0;
    for (const [where, bag] of bags) {
      for (const it of bag) {
        if (!it.identified) {
          Items.setIdentified(it, true);
          n++;
          if (where === "stash") setStashDirty(true);
          else setDirty(true);
        }
      }
    }
    renderItems();
    setStatus(n ? "Identified " + n + " items" : "Everything was already identified");
  });

  $("btn-delete-item").addEventListener("click", () => deleteSelected());

  document.addEventListener("keydown", (ev) => {
    if (!$("panel-items") || $("panel-items").hidden) return;
    if (ev.target && ev.target.closest && ev.target.closest("input, textarea")) return;
    if (ev.key === "Escape") {
      if (!state.sel) return;
      state.sel = null;
      renderItems();
    } else if (ev.key === "Delete") {
      if (state.sel) {
        ev.preventDefault();
        deleteSelected();
      }
    }
  });

  $("f-item-qty").addEventListener("change", () => {
    const item = selectedItem();
    if (!item || item.quantity == null) return;
    try {
      Items.setQuantity(item, num("f-item-qty"));
      if (state.sel.where === "stash") setStashDirty(true);
      else setDirty(true);
      renderItems();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("f-item-id").addEventListener("change", () => {
    const item = selectedItem();
    if (!item) return;
    Items.setIdentified(item, $("f-item-id").checked);
    if (state.sel.where === "stash") setStashDirty(true);
    else setDirty(true);
    renderItems();
  });

  $("f-item-eth").addEventListener("change", () => {
    const item = selectedItem();
    if (!item) return;
    try {
      Items.setEthereal(item, $("f-item-eth").checked);
      if (state.sel.where === "stash") setStashDirty(true);
      else setDirty(true);
      renderItems();
      setStatus((item.ethereal ? "Set ethereal on " : "Cleared ethereal on ") + Items.displayName(item));
    } catch (err) {
      $("f-item-eth").checked = !!item.ethereal;
      setStatus(err.message || String(err));
    }
  });

  $("f-item-socks").addEventListener("change", () => {
    const item = selectedItem();
    if (!item) return;
    try {
      Items.setSockets(item, num("f-item-socks"));
      if (state.sel.where === "stash") setStashDirty(true);
      else setDirty(true);
      renderItems();
      setStatus(
        item.socketed
          ? "Set " + item.sockets + " sockets on " + Items.displayName(item)
          : "Removed sockets from " + Items.displayName(item)
      );
    } catch (err) {
      $("f-item-socks").value = item.socketed ? item.sockets || 0 : 0;
      setStatus(err.message || String(err));
    }
  });

  renderSpawn();
  refreshVault().then(() => renderCollection());
  $("f-spawn-search").addEventListener("input", () => {
    state.spawnQuery = $("f-spawn-search").value;
    renderSpawnResults();
  });
  $("spawn-kinds").querySelectorAll("[data-spawn-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.spawnKind = btn.dataset.spawnKind;
      renderSpawn();
    });
  });
  $("btn-craft-send").addEventListener("click", () => sendCraft());

  $("f-vault-search").addEventListener("input", () => {
    state.vaultQuery = $("f-vault-search").value;
    renderVault();
  });
  $("btn-vault-from-char").addEventListener("click", () => copyBagToVault("player"));
  $("btn-vault-from-stash").addEventListener("click", () => copyBagToVault("stash"));
  $("btn-vault-export").addEventListener("click", () => exportVault());
  $("vault-import").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    await importVaultFile(file);
    ev.target.value = "";
  });
  $("btn-vault-withdraw").addEventListener("click", () => withdrawVault(false));
  $("btn-vault-withdraw-del").addEventListener("click", () => withdrawVault(true));
  $("btn-vault-delete").addEventListener("click", () => deleteVaultSelected());

  $("f-col-search").addEventListener("input", () => {
    state.colQuery = $("f-col-search").value;
    renderCollection();
  });
  $("col-filters").querySelectorAll("[data-col-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.colFilter = btn.dataset.colFilter;
      renderCollection();
    });
  });

  ["f-name", "f-level", "f-experience", "f-gold", "f-goldbank", "f-strength", "f-dexterity", "f-vitality", "f-energy", "f-statpts", "f-newskills", "f-maxhp", "f-maxmana", "f-maxstamina", "f-hardcore"].forEach((id) => {
    const el = $(id);
    el.addEventListener("input", () => setDirty(true));
    el.addEventListener("change", () => setDirty(true));
  });

  const overlay = $("drop-overlay");
  window.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    overlay.hidden = false;
  });
  window.addEventListener("dragleave", (ev) => {
    if (ev.target === document.documentElement) overlay.hidden = true;
  });
  window.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    overlay.hidden = true;
    const file = ev.dataTransfer?.files && ev.dataTransfer.files[0];
    if (!file) return;
    try {
      await loadFile(file, null);
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });
})();
