(() => {
  "use strict";

  const Save = window.SoESave;
  const Skills = window.SoESkills;
  const Items = window.SoEItems;
  const SAVE_DIR = "%USERPROFILE%\\Documents\\Diablo II\\Saves";

  const state = {
    parsed: null,
    fileName: "",
    backup: null,
    dirty: false,
    fileHandle: null,
    stash: null,
    stashName: "pd2_shared.stash",
    stashBackup: null,
    stashHandle: null,
    stashDirty: false,
    itemView: "inv",
    sel: null,
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
    const has = !!(state.parsed || state.stash);
    $("empty-state").hidden = has;
    $("tabs").hidden = !has;
    if (!has) {
      ["character", "stats", "skills", "quests", "items"].forEach((id) => {
        $("panel-" + id).hidden = true;
      });
    }
  }

  function currentPanel() {
    return document.querySelector(".tab.is-active")?.dataset.tab || "character";
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.tab === tab);
    });
    document.querySelectorAll(".panel").forEach((el) => {
      el.hidden = el.id !== "panel-" + tab;
    });
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
    if (state.itemView === "equipped") return { w: 3, h: 5, panel: 0, location: 1, label: "Equipped", equipped: true };
    if (state.itemView === "shared") return grids.shared;
    if (state.itemView === "cube") return grids.cube;
    if (state.itemView === "stash") return grids.stash;
    if (state.itemView === "belt") return grids.belt;
    return grids.inv;
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
    $("item-inspect-name").textContent = Items.displayName(item) + "  [" + item.code + "]";
    const qty = $("f-item-qty");
    qty.disabled = item.quantity == null;
    qty.value = item.quantity != null ? item.quantity : "";
    $("f-item-id").checked = !!item.identified;
  }

  function renderSpawn() {
    const box = $("spawn-groups");
    box.innerHTML = Items.SPAWN.map((g) => {
      const btns = g.codes
        .filter((c) => Items.itemInfo(c).n)
        .map((c) => `<button type="button" class="btn" data-spawn="${c}">${Items.itemInfo(c).n.replace(/ Rune$/, "")}</button>`)
        .join("");
      return `<div class="spawn-group"><h4>${g.group}</h4>${btns}</div>`;
    }).join("");
    box.querySelectorAll("[data-spawn]").forEach((btn) => {
      btn.addEventListener("click", () => spawnCode(btn.dataset.spawn));
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
      if (grid.equipped) {
        if (it.location === 1) occupied.set("eq-" + it.equipped, { it, index });
        return;
      }
      if (!Items.itemInGrid(it, grid)) return;
      occupied.set(it.x + "," + it.y, { it, index });
      for (const c of Items.cellsUsed(it)) {
        if (c.x === it.x && c.y === it.y) continue;
        occupied.set(c.x + "," + c.y, { it, index, fill: true });
      }
    });

    if (grid.equipped) {
      const slots = [
        [0, 1, "Helm"],
        [2, 2, "Amulet"],
        [3, 3, "Armor"],
        [4, 4, "Weapon"],
        [5, 5, "Shield"],
        [6, 6, "R Ring"],
        [7, 7, "L Ring"],
        [8, 8, "Belt"],
        [9, 9, "Boots"],
        [10, 10, "Gloves"],
        [11, 11, "Alt Wpn"],
        [12, 12, "Alt Shd"],
      ];
      gridEl.className = "item-grid equipped-wrap";
      gridEl.style.gridTemplateColumns = "";
      gridEl.innerHTML = slots
        .map(([id, , label]) => {
          const hit = occupied.get("eq-" + id);
          const sel = hit && state.sel && state.sel.where === where && state.sel.index === hit.index;
          if (!hit) return `<button type="button" class="item-cell is-body" data-eq="${id}">${label}</button>`;
          return `<button type="button" class="item-cell is-body is-origin ${Items.qualityClass(hit.it)}${sel ? " is-selected" : ""}" data-where="${where}" data-index="${hit.index}">${Items.displayName(hit.it)}</button>`;
        })
        .join("");
    } else {
      gridEl.className = "item-grid";
      gridEl.style.gridTemplateColumns = `repeat(${grid.w}, 36px)`;
      let html = "";
      for (let y = 0; y < grid.h; y++) {
        for (let x = 0; x < grid.w; x++) {
          const hit = occupied.get(x + "," + y);
          const sel = hit && state.sel && state.sel.where === where && state.sel.index === hit.index;
          if (!hit) html += `<button type="button" class="item-cell" data-x="${x}" data-y="${y}"></button>`;
          else if (hit.fill) html += `<button type="button" class="item-cell is-fill" data-where="${where}" data-index="${hit.index}"></button>`;
          else html += `<button type="button" class="item-cell is-origin ${Items.qualityClass(hit.it)}${sel ? " is-selected" : ""}" data-where="${where}" data-index="${hit.index}">${Items.displayName(hit.it)}</button>`;
        }
      }
      gridEl.innerHTML = html;
    }

    const extras = bag
      .map((it, index) => ({ it, index }))
      .filter(({ it, index }) => {
        if (grid.equipped) return it.location === 1 && !occupied.has("eq-" + it.equipped);
        if (Items.itemInGrid(it, grid)) {
          const origin = occupied.get(it.x + "," + it.y);
          return origin && origin.index !== index;
        }
        return false;
      });
    listEl.innerHTML = extras
      .map(({ it, index }) => `<button type="button" data-where="${where}" data-index="${index}">${Items.displayName(it)} @ ${it.x},${it.y}</button>`)
      .join("");

    const nPlayer = state.parsed && state.parsed.items ? state.parsed.items.player.length : 0;
    const nStash = state.stash ? state.stash.items.length : 0;
    $("items-summary").textContent =
      (state.parsed ? nPlayer + " on " + state.parsed.name : "No character") +
      " · " +
      (state.stash ? nStash + " in shared stash" : "shared stash not loaded") +
      (state.parsed && state.parsed.itemsError ? " · item parse warning: " + state.parsed.itemsError : "");

    gridEl.querySelectorAll("[data-index]").forEach((el) => {
      el.addEventListener("click", () => {
        state.sel = { where: el.dataset.where, index: Number(el.dataset.index) };
        renderItems();
      });
    });
    gridEl.querySelectorAll("[data-x]").forEach((el) => {
      el.addEventListener("click", () => moveSelectedTo(Number(el.dataset.x), Number(el.dataset.y)));
    });
    listEl.querySelectorAll("[data-index]").forEach((el) => {
      el.addEventListener("click", () => {
        state.sel = { where: el.dataset.where, index: Number(el.dataset.index) };
        renderItems();
      });
    });
    gridEl.querySelectorAll("[data-eq]").forEach((el) => {
      el.addEventListener("click", () => {
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
    renderInspect();
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

  function spawnCode(code) {
    const info = Items.itemInfo(code);
    const grid = currentGrid();
    const where = state.itemView === "shared" ? "stash" : "player";
    if (where === "player" && (!state.parsed || !state.parsed.items)) {
      setStatus("Load a character first");
      return;
    }
    if (where === "stash" && !state.stash) {
      state.stash = Items.emptyStash();
      state.stashName = "pd2_shared.stash";
    }
    const bag = itemBag(where);
    const place = grid.equipped ? null : Items.firstFit(bag, grid, info.w || 1, info.h || 1);
    if (!place) {
      setStatus("No free space in " + grid.label);
      return;
    }
    try {
      const item = Items.spawnSimple(code, { ...place, quantity: code === "key" || code === "tbk" || code === "ibk" ? 20 : 1 });
      bag.push(item);
      state.sel = { where, index: bag.length - 1 };
      if (where === "stash") setStashDirty(true);
      else setDirty(true);
      renderItems();
      setStatus("Spawned " + Items.displayName(item));
    } catch (err) {
      setStatus(err.message || String(err));
    }
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
  }

  function isStashBytes(bytes) {
    return bytes[0] === 0x55 && bytes[1] === 0xbb && bytes[2] === 0x55 && bytes[3] === 0xbb;
  }

  async function loadStashBytes(bytes, fileName, handle) {
    const parsed = Items.parseStash(bytes);
    state.stash = parsed;
    state.stashName = fileName || "pd2_shared.stash";
    state.stashBackup = Uint8Array.from(bytes);
    state.stashHandle = handle || null;
    showLoaded();
    if (!state.parsed) switchTab("items");
    else renderItems();
    setStashDirty(false);
    setStatus("Loaded " + state.stashName + " · " + parsed.items.length + " items");
  }

  async function loadBytes(bytes, fileName, handle) {
    if (isStashBytes(bytes) || /\.stash$/i.test(fileName || "")) {
      await loadStashBytes(bytes, fileName, handle);
      return;
    }
    const parsed = Save.parse(bytes);
    state.parsed = parsed;
    state.fileName = fileName || parsed.name + ".d2s";
    state.backup = Uint8Array.from(bytes);
    state.fileHandle = handle || null;
    showLoaded();
    switchTab("character");
    render();
    setDirty(false);
    setStatus(
      "Loaded " +
        state.fileName +
        (Save.verify(bytes) ? " · checksum ok" : " · checksum mismatch") +
        (parsed.items ? " · " + parsed.items.player.length + " items" : parsed.itemsError ? " · items unread: " + parsed.itemsError : "")
    );
  }

  async function loadFile(file, handle) {
    const buf = new Uint8Array(await file.arrayBuffer());
    await loadBytes(buf, file.name, handle);
  }

  function downloadBytes(bytes, name) {
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
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

  $("btn-backup").addEventListener("click", () => {
    if (!state.backup) return;
    const base = (state.fileName || "character.d2s").replace(/\.d2s$/i, "");
    downloadBytes(state.backup, base + ".backup.d2s");
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
      const out = buildSave();
      const writable = await state.fileHandle.createWritable();
      await writable.write(out);
      await writable.close();
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
      state.itemView = btn.dataset.view;
      document.querySelectorAll("#item-views .tab").forEach((el) => el.classList.toggle("is-active", el === btn));
      renderItems();
    });
  });

  $("stash-input").addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      await loadStashBytes(buf, file.name, null);
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
      const out = Items.writeStash(state.stash);
      const writable = await state.stashHandle.createWritable();
      await writable.write(out);
      await writable.close();
      setStashDirty(false);
      setStatus("Wrote " + state.stashName + " in place");
    } catch (err) {
      setStatus(err.message || String(err));
    }
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

  $("btn-delete-item").addEventListener("click", () => {
    if (!state.sel) return;
    const bag = itemBag(state.sel.where);
    const gone = bag.splice(state.sel.index, 1)[0];
    if (state.sel.where === "stash") setStashDirty(true);
    else setDirty(true);
    state.sel = null;
    renderItems();
    setStatus("Deleted " + (gone ? Items.displayName(gone) : "item"));
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

  renderSpawn();

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
