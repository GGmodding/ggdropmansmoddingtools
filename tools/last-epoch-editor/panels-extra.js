(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function api() {
    return window.LEApp || null;
  }

  function ensureWeaver(data) {
    if (!data.savedWeaverTree || typeof data.savedWeaverTree !== "object") {
      data.savedWeaverTree = { version: 7, nodeIDs: [], nodePoints: [] };
    }
    const t = data.savedWeaverTree;
    if (!Array.isArray(t.nodeIDs)) t.nodeIDs = [];
    if (!Array.isArray(t.nodePoints)) t.nodePoints = [];
    while (t.nodePoints.length < t.nodeIDs.length) t.nodePoints.push(0);
    t.nodePoints.length = t.nodeIDs.length;
    return t;
  }

  function ensureAbilityBar(data, key) {
    if (!Array.isArray(data[key])) data[key] = [];
    return data[key];
  }

  function renderMonolith() {
    const A = api();
    if (!A || !A.state.data || !window.LEEndgame) return;
    const d = A.state.data;
    const meta = $("monolith-meta");
    if (meta) {
      meta.textContent = `Depth ${d.monolithDepth ?? 0} · Corruption ${d.maxCorruption ?? 0} · Echoes ${d.monolithEchoesConquered ?? 0}`;
    }
    const setNum = (id, val) => {
      const el = $(id);
      if (el) el.value = String(Number(val) || 0);
    };
    setNum("f-mono-depth", d.monolithDepth);
    setNum("f-mono-corruption", d.maxCorruption);
    setNum("f-mono-echoes", d.monolithEchoesConquered);
    setNum("f-mono-timelines", d.monolithTimelinesConquered);
    setNum("f-mono-run-timeline", d.currentMonolithRunTimelineID);
    setNum("f-mono-run-diff", d.currentMonolithRunDifficultyIndex);

    if (!Array.isArray(d.timelineDifficultyUnlocks)) d.timelineDifficultyUnlocks = [];
    if (!Array.isArray(d.timelineCompletion)) d.timelineCompletion = [];
    if (!Array.isArray(d.timelineDifficultyCompletion)) d.timelineDifficultyCompletion = [];

    const body = $("mono-timelines-body");
    if (!body) return;
    body.innerHTML = "";
    LEEndgame.TIMELINES.forEach((tl) => {
      const unlock = LEEndgame.ensureTimelineEntry(d.timelineDifficultyUnlocks, tl.id);
      const done = d.timelineCompletion.some((r) => Number(r.timelineID) === tl.id);
      const tr = document.createElement("tr");
      const tdCheck = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = Number(unlock.progress[0]) > 0;
      cb.addEventListener("change", () => {
        unlock.progress[0] = cb.checked ? 1 : 0;
        A.setDirty(true);
      });
      tdCheck.appendChild(cb);

      const tdId = document.createElement("td");
      tdId.textContent = String(tl.id);
      const tdName = document.createElement("td");
      tdName.textContent = tl.name;
      const tdLv = document.createElement("td");
      tdLv.textContent = String(tl.level);

      const tdProg = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.step = "1";
      inp.value = String(Number(unlock.progress[0]) || 0);
      inp.style.width = "5rem";
      inp.addEventListener("change", () => {
        unlock.progress[0] = Math.max(0, Number(inp.value) || 0);
        cb.checked = unlock.progress[0] > 0;
        A.setDirty(true);
      });
      tdProg.appendChild(inp);

      const tdDone = document.createElement("td");
      const cbDone = document.createElement("input");
      cbDone.type = "checkbox";
      cbDone.checked = done;
      cbDone.addEventListener("change", () => {
        d.timelineCompletion = d.timelineCompletion.filter((r) => Number(r.timelineID) !== tl.id);
        d.timelineDifficultyCompletion = (d.timelineDifficultyCompletion || []).filter(
          (r) => Number(r.timelineID) !== tl.id
        );
        if (cbDone.checked) {
          d.timelineCompletion.push({ timelineID: tl.id, progress: [1] });
          d.timelineDifficultyCompletion.push({ timelineID: tl.id, progress: [1] });
          unlock.progress[0] = Math.max(1, Number(unlock.progress[0]) || 0);
          inp.value = String(unlock.progress[0]);
          cb.checked = true;
        }
        A.setDirty(true);
      });
      tdDone.appendChild(cbDone);

      tr.appendChild(tdCheck);
      tr.appendChild(tdId);
      tr.appendChild(tdName);
      tr.appendChild(tdLv);
      tr.appendChild(tdProg);
      tr.appendChild(tdDone);
      body.appendChild(tr);
    });
  }

  function applyMonolithFields() {
    const A = api();
    if (!A || !A.state.data) return;
    const d = A.state.data;
    d.monolithDepth = Math.max(0, Number($("f-mono-depth").value) || 0);
    d.maxCorruption = Math.max(0, Number($("f-mono-corruption").value) || 0);
    d.monolithEchoesConquered = Math.max(0, Number($("f-mono-echoes").value) || 0);
    d.monolithTimelinesConquered = Math.max(0, Number($("f-mono-timelines").value) || 0);
    d.currentMonolithRunTimelineID = Math.max(0, Number($("f-mono-run-timeline").value) || 0);
    d.currentMonolithRunDifficultyIndex = Math.max(0, Number($("f-mono-run-diff").value) || 0);
  }

  function renderEndgame() {
    const A = api();
    if (!A || !A.state.data || !window.LEEndgame) return;
    const d = A.state.data;
    const soul = $("f-soul-embers");
    const lantern = $("f-lantern");
    if (soul) soul.value = String(Number(d.soulEmbers) || 0);
    if (lantern) lantern.value = String(Number(d.lanternLuminance) || 0);

    if (!Array.isArray(d.arenaTiersCompleted)) d.arenaTiersCompleted = [];
    const arenaHost = $("arena-tiers");
    if (arenaHost) {
      arenaHost.innerHTML = "";
      for (let i = 0; i < LEEndgame.ARENA_TIERS; i++) {
        const label = document.createElement("label");
        label.className = "chip-check";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = d.arenaTiersCompleted.includes(i) || d.arenaTiersCompleted.includes(String(i));
        cb.addEventListener("change", () => {
          d.arenaTiersCompleted = d.arenaTiersCompleted
            .map(Number)
            .filter((n) => Number.isFinite(n) && n !== i);
          if (cb.checked) d.arenaTiersCompleted.push(i);
          d.arenaTiersCompleted.sort((a, b) => a - b);
          A.setDirty(true);
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" T" + i));
        arenaHost.appendChild(label);
      }
    }

    if (!Array.isArray(d.dungeonCompletion)) d.dungeonCompletion = [];
    const dunHost = $("dungeon-list");
    if (dunHost) {
      dunHost.innerHTML = "";
      LEEndgame.DUNGEON_IDS.forEach((dun) => {
        const label = document.createElement("label");
        label.className = "chip-check";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        const hit = d.dungeonCompletion.find(
          (x) =>
            x === dun.id ||
            Number(x) === dun.id ||
            (x && (Number(x.dungeonID) === dun.id || Number(x.id) === dun.id))
        );
        cb.checked = !!hit && (hit === true || hit === dun.id || hit.completed !== false);
        cb.addEventListener("change", () => {
          d.dungeonCompletion = d.dungeonCompletion.filter((x) => {
            const id = x && typeof x === "object" ? Number(x.dungeonID ?? x.id) : Number(x);
            return id !== dun.id;
          });
          if (cb.checked) d.dungeonCompletion.push({ dungeonID: dun.id, completed: true });
          A.setDirty(true);
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(" " + dun.name));
        dunHost.appendChild(label);
      });
      if (d.dungeonCompletion.length) {
        const note = document.createElement("p");
        note.className = "panel-note";
        note.textContent = "Raw dungeonCompletion: " + JSON.stringify(d.dungeonCompletion).slice(0, 240);
        dunHost.appendChild(note);
      }
    }

    if (!d.factions || typeof d.factions !== "object") d.factions = {};
    const facBody = $("factions-body");
    const facAdd = $("f-faction-add");
    if (facAdd && !facAdd.options.length) {
      LEEndgame.FACTIONS.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = String(f.id);
        opt.textContent = f.name + " (" + f.id + ")";
        facAdd.appendChild(opt);
      });
    }
    if (facBody) {
      facBody.innerHTML = "";
      const keys = Object.keys(d.factions).sort((a, b) => Number(a) - Number(b));
      if (!keys.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.textContent = "No factions on this save yet.";
        tr.appendChild(td);
        facBody.appendChild(tr);
      }
      keys.forEach((key) => {
        const fac = d.factions[key] || LEEndgame.emptyFaction(key);
        d.factions[key] = fac;
        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.textContent = LEEndgame.factionName(key);
        const tdMem = document.createElement("td");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!fac.isMember;
        cb.addEventListener("change", () => {
          fac.isMember = cb.checked;
          fac.hasEverJoined = fac.hasEverJoined || cb.checked;
          A.setDirty(true);
        });
        tdMem.appendChild(cb);
        const mkNum = (field) => {
          const td = document.createElement("td");
          const inp = document.createElement("input");
          inp.type = "number";
          inp.min = "0";
          inp.step = "1";
          inp.value = String(Number(fac[field]) || 0);
          inp.style.width = "6rem";
          inp.addEventListener("change", () => {
            fac[field] = Math.max(0, Number(inp.value) || 0);
            A.setDirty(true);
          });
          td.appendChild(inp);
          return td;
        };
        tr.appendChild(tdName);
        tr.appendChild(tdMem);
        tr.appendChild(mkNum("rank"));
        tr.appendChild(mkNum("reputation"));
        tr.appendChild(mkNum("favor"));
        facBody.appendChild(tr);
      });
    }
  }

  function renderRaw() {
    const A = api();
    const ta = $("f-raw-json");
    if (!A || !A.state.data || !ta) return;
    try {
      ta.value = JSON.stringify(A.state.data, null, 2);
      const note = $("raw-note");
      if (note) note.textContent = "Loaded character JSON (" + ta.value.length + " chars).";
    } catch (err) {
      ta.value = "";
      A.setStatus(err.message || String(err), "is-err");
    }
  }

  function renderAbilityBars() {
    const A = api();
    const host = $("ability-bar-root");
    if (!host) return;
    host.innerHTML = "";
    if (!A || !A.state.data) return;
    const d = A.state.data;
    const bars = [
      { key: "abilityBar", label: "Main ability bar", minSlots: 5 },
      { key: "werebearAbilityBar", label: "Werebear form bar", minSlots: 0 },
      { key: "sprigganFormAbilityBar", label: "Spriggan form bar", minSlots: 0 },
      { key: "swarmbladeAbilityBar", label: "Swarmblade form bar", minSlots: 0 },
    ];
    const skillOpts = window.LESkills
      ? LESkills.allSkillOptions().filter((o) => !LESkills.isPassiveTreeId(o.id))
      : [];

    bars.forEach((bar) => {
      const list = ensureAbilityBar(d, bar.key);
      if (bar.minSlots > 0) {
        while (list.length < bar.minSlots) list.push("");
      }
      if (!list.length && bar.minSlots === 0) return;

      const wrap = document.createElement("div");
      wrap.className = "ability-bar-block";
      const title = document.createElement("div");
      title.className = "ability-bar-block__title";
      title.textContent = bar.label;
      wrap.appendChild(title);
      const row = document.createElement("div");
      row.className = "ability-bar-slots";

      const slotCount = Math.max(list.length, bar.minSlots || list.length);
      for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement("label");
        slot.className = "ability-bar-slot";
        slot.textContent = "Slot " + (i + 1);
        const sel = document.createElement("select");
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "(empty)";
        sel.appendChild(empty);
        skillOpts.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.id;
          o.textContent = opt.name + " (" + opt.id + ")";
          sel.appendChild(o);
        });
        const cur = list[i] || "";
        if (cur && ![...sel.options].some((o) => o.value === cur)) {
          const o = document.createElement("option");
          o.value = cur;
          o.textContent = cur + " (unknown)";
          sel.appendChild(o);
        }
        sel.value = cur;
        sel.addEventListener("change", () => {
          list[i] = sel.value;
          A.setDirty(true);
        });
        slot.appendChild(sel);
        row.appendChild(slot);
      }
      wrap.appendChild(row);
      host.appendChild(wrap);
    });
  }

  function renderWeaver() {
    const A = api();
    const host = $("weaver-root");
    if (!host) return;
    host.innerHTML = "";
    if (!A || !A.state.data) return;
    const tree = ensureWeaver(A.state.data);
    const card = document.createElement("div");
    card.className = "tree-card";
    const head = document.createElement("div");
    head.className = "tree-card__head";
    const title = document.createElement("h3");
    title.className = "tree-card__title";
    title.textContent = "Weaver";
    const meta = document.createElement("div");
    meta.className = "tree-card__meta";
    meta.textContent = "version " + (tree.version ?? "?") + " · " + tree.nodeIDs.length + " nodes";
    head.appendChild(title);
    head.appendChild(meta);
    card.appendChild(head);

    const controls = document.createElement("div");
    controls.className = "tree-card__controls";
    const addId = document.createElement("input");
    addId.type = "number";
    addId.placeholder = "Node ID";
    addId.min = "0";
    const addPts = document.createElement("input");
    addPts.type = "number";
    addPts.placeholder = "Points";
    addPts.min = "0";
    addPts.value = "1";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn--accent";
    addBtn.textContent = "Add / set node";
    addBtn.addEventListener("click", () => {
      const id = Number(addId.value);
      const pts = Math.max(0, Number(addPts.value) || 0);
      if (!Number.isFinite(id)) return;
      const idx = tree.nodeIDs.findIndex((n) => Number(n) === id);
      if (pts <= 0) {
        if (idx >= 0) {
          tree.nodeIDs.splice(idx, 1);
          tree.nodePoints.splice(idx, 1);
        }
      } else if (idx >= 0) tree.nodePoints[idx] = pts;
      else {
        tree.nodeIDs.push(id);
        tree.nodePoints.push(pts);
      }
      A.setDirty(true);
      renderWeaver();
    });
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn--danger";
    clearBtn.textContent = "Clear weaver";
    clearBtn.addEventListener("click", () => {
      tree.nodeIDs = [];
      tree.nodePoints = [];
      A.setDirty(true);
      renderWeaver();
    });
    controls.appendChild(addId);
    controls.appendChild(addPts);
    controls.appendChild(addBtn);
    controls.appendChild(clearBtn);
    card.appendChild(controls);

    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML = "<thead><tr><th>Node</th><th>Points</th><th></th></tr></thead>";
    const tbody = document.createElement("tbody");
    tree.nodeIDs.forEach((nid, i) => {
      const tr = document.createElement("tr");
      const tdN = document.createElement("td");
      tdN.textContent = String(nid);
      const tdP = document.createElement("td");
      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.value = String(Number(tree.nodePoints[i]) || 0);
      inp.addEventListener("change", () => {
        tree.nodePoints[i] = Math.max(0, Number(inp.value) || 0);
        A.setDirty(true);
      });
      tdP.appendChild(inp);
      const tdR = document.createElement("td");
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn btn--danger";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        tree.nodeIDs.splice(i, 1);
        tree.nodePoints.splice(i, 1);
        A.setDirty(true);
        renderWeaver();
      });
      tdR.appendChild(rm);
      tr.appendChild(tdN);
      tr.appendChild(tdP);
      tr.appendChild(tdR);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    host.appendChild(card);
  }

  function renderIdolsBlessings() {
    const A = api();
    const idolHost = $("idol-grid");
    const blessHost = $("bless-grid");
    if (!A || !A.state.data) {
      if (idolHost) idolHost.innerHTML = "";
      if (blessHost) blessHost.innerHTML = "";
      return;
    }
    const items = LESave.ensureSavedItems(A.state.data);
    if (idolHost) {
      idolHost.innerHTML = "";
      const idolIds = new Set(
        (LEEndgame.IDOL_CONTAINERS || [{ id: LEEndgame.IDOL_CONTAINER || 32 }]).map((c) => Number(c.id))
      );
      const idols = [];
      items.forEach((item, index) => {
        if (idolIds.has(Number(item.containerID ?? item.containerId))) {
          idols.push({ item, index });
        }
      });
      if (!idols.length) {
        idolHost.innerHTML = '<p class="panel-note">No idols in containers 29 / 32.</p>';
      } else {
        idols.forEach(({ item, index }) => {
          const decoded = A.decodeForUi(item);
          const cid = Number(item.containerID ?? item.containerId);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "le-idol-chip" + A.rarityClass(decoded.rarity);
          if (A.state.selectedItemIndex === index) btn.classList.add("is-selected");
          btn.textContent = (decoded.label || "Idol #" + index) + " · c" + cid;
          A.bindItemTooltip(btn, item, decoded, "Idol");
          btn.addEventListener("click", () => A.selectItemByIndex(index));
          idolHost.appendChild(btn);
        });
      }
    }
    if (blessHost) {
      blessHost.innerHTML = "";
      const slots = LEEndgame.BLESSING_CONTAINERS.concat(LEEndgame.BLESSING_EXTRA);
      slots.forEach((slot) => {
        const found = items
          .map((item, index) => ({ item, index }))
          .find((x) => Number(x.item.containerID ?? x.item.containerId) === slot.id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "le-bless-chip" + (found ? "" : " is-empty");
        if (found) {
          const decoded = A.decodeForUi(found.item);
          btn.className += A.rarityClass(decoded.rarity);
          if (A.state.selectedItemIndex === found.index) btn.classList.add("is-selected");
          btn.textContent = slot.label + ": " + (decoded.label || "#" + found.index);
          A.bindItemTooltip(btn, found.item, decoded, slot.label);
          btn.addEventListener("click", () => A.selectItemByIndex(found.index));
        } else {
          btn.textContent = slot.label + " (empty)";
          btn.disabled = true;
        }
        blessHost.appendChild(btn);
      });
    }
  }

  function fillUniquePicker() {
    const search = $("f-add-unique-search");
    const pick = $("f-add-unique-pick");
    const idInput = $("f-add-unique");
    if (!pick || !window.LEItems || !LEItems.listUniques) return;
    const q = search ? search.value : "";
    const list = LEItems.listUniques({ search: q, limit: 200 });
    const prev = pick.value;
    pick.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = list.length ? "Select unique…" : "No matches";
    pick.appendChild(none);
    list.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = String(u.id);
      opt.textContent = u.label;
      pick.appendChild(opt);
    });
    if (prev && [...pick.options].some((o) => o.value === prev)) pick.value = prev;
    pick.onchange = () => {
      if (!idInput || !pick.value) return;
      idInput.value = pick.value;
      const kind = $("f-add-kind");
      if (kind) kind.value = "unique";
      const quality = $("f-add-quality");
      if (quality) quality.value = "7";
      const u = LEItems.DB.uniques[pick.value];
      if (u && $("f-add-base")) {
        $("f-add-base").value = String(u.base);
        if (typeof window.LEApp.fillAddSubs === "function") window.LEApp.fillAddSubs();
      }
    };
  }

  function renderAll() {
    renderMonolith();
    renderEndgame();
    renderAbilityBars();
    renderWeaver();
    renderIdolsBlessings();
    fillUniquePicker();
  }

  function bind() {
    const A = api();
    if (!A) return;

    ["f-mono-depth", "f-mono-corruption", "f-mono-echoes", "f-mono-timelines", "f-mono-run-timeline", "f-mono-run-diff"].forEach(
      (id) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("change", () => {
          applyMonolithFields();
          A.setDirty(true);
          renderMonolith();
        });
      }
    );

    const btnUnlockTl = $("btn-mono-unlock-timelines");
    if (btnUnlockTl) {
      btnUnlockTl.addEventListener("click", () => {
        if (!A.state.data || !window.LEEndgame) return;
        const d = A.state.data;
        if (!Array.isArray(d.timelineDifficultyUnlocks)) d.timelineDifficultyUnlocks = [];
        LEEndgame.TIMELINES.forEach((tl) => {
          const row = LEEndgame.ensureTimelineEntry(d.timelineDifficultyUnlocks, tl.id);
          row.progress[0] = Math.max(1, Number(row.progress[0]) || 0);
        });
        d.monolithTimelinesConquered = Math.max(
          Number(d.monolithTimelinesConquered) || 0,
          LEEndgame.TIMELINES.length
        );
        A.setDirty(true);
        renderMonolith();
        A.setStatus("All monolith timelines unlocked.", "is-ok");
      });
    }

    const btnCompleteTl = $("btn-mono-complete-timelines");
    if (btnCompleteTl) {
      btnCompleteTl.addEventListener("click", () => {
        if (!A.state.data || !window.LEEndgame) return;
        const d = A.state.data;
        if (!Array.isArray(d.timelineDifficultyUnlocks)) d.timelineDifficultyUnlocks = [];
        d.timelineCompletion = [];
        d.timelineDifficultyCompletion = [];
        LEEndgame.TIMELINES.forEach((tl) => {
          const row = LEEndgame.ensureTimelineEntry(d.timelineDifficultyUnlocks, tl.id);
          row.progress[0] = Math.max(1, Number(row.progress[0]) || 0);
          d.timelineCompletion.push({ timelineID: tl.id, progress: [1] });
          d.timelineDifficultyCompletion.push({ timelineID: tl.id, progress: [1] });
        });
        d.monolithTimelinesConquered = LEEndgame.TIMELINES.length;
        A.setDirty(true);
        renderMonolith();
        A.setStatus("All timelines marked complete.", "is-ok");
      });
    }

    const btnCorr = $("btn-mono-max-corruption");
    if (btnCorr) {
      btnCorr.addEventListener("click", () => {
        if (!A.state.data) return;
        A.state.data.maxCorruption = 1000;
        A.setDirty(true);
        renderMonolith();
        A.setStatus("Max corruption set to 1000.", "is-ok");
      });
    }

    ["f-soul-embers", "f-lantern"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", () => {
        if (!A.state.data) return;
        A.state.data.soulEmbers = Math.max(0, Number($("f-soul-embers").value) || 0);
        A.state.data.lanternLuminance = Math.max(0, Number($("f-lantern").value) || 0);
        A.setDirty(true);
      });
    });

    const btnArena = $("btn-arena-complete-all");
    if (btnArena) {
      btnArena.addEventListener("click", () => {
        if (!A.state.data || !window.LEEndgame) return;
        A.state.data.arenaTiersCompleted = [];
        for (let i = 0; i < LEEndgame.ARENA_TIERS; i++) A.state.data.arenaTiersCompleted.push(i);
        A.setDirty(true);
        renderEndgame();
        A.setStatus("Arena tiers 0–19 marked complete.", "is-ok");
      });
    }

    const btnDun = $("btn-dungeon-complete-all");
    if (btnDun) {
      btnDun.addEventListener("click", () => {
        if (!A.state.data || !window.LEEndgame) return;
        A.state.data.dungeonCompletion = LEEndgame.DUNGEON_IDS.map((d) => ({
          dungeonID: d.id,
          completed: true,
        }));
        A.setDirty(true);
        renderEndgame();
        A.setStatus("Known dungeons marked complete.", "is-ok");
      });
    }

    const btnFac = $("btn-faction-add");
    if (btnFac) {
      btnFac.addEventListener("click", () => {
        if (!A.state.data || !window.LEEndgame) return;
        const id = Number($("f-faction-add").value);
        if (!A.state.data.factions) A.state.data.factions = {};
        A.state.data.factions[String(id)] = LEEndgame.emptyFaction(id);
        A.state.data.factions[String(id)].rank = 10;
        A.state.data.factions[String(id)].reputation = 999999;
        A.state.data.factions[String(id)].favor = 999999;
        A.setDirty(true);
        renderEndgame();
        A.setStatus(LEEndgame.factionName(id) + " added / reset to high rank.", "is-ok");
      });
    }

    const btnRawReload = $("btn-raw-reload");
    if (btnRawReload) btnRawReload.addEventListener("click", () => renderRaw());
    const btnRawFormat = $("btn-raw-format");
    if (btnRawFormat) {
      btnRawFormat.addEventListener("click", () => {
        const ta = $("f-raw-json");
        if (!ta) return;
        try {
          ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
        } catch (err) {
          A.setStatus(err.message || String(err), "is-err");
        }
      });
    }
    const btnRawApply = $("btn-raw-apply");
    if (btnRawApply) {
      btnRawApply.addEventListener("click", () => {
        const ta = $("f-raw-json");
        if (!ta || !A.state.data) return;
        try {
          const next = JSON.parse(ta.value);
          if (!next || typeof next !== "object" || Array.isArray(next)) {
            throw new Error("Root JSON must be an object.");
          }
          A.state.data = next;
          A.setDirty(true);
          A.renderAll();
          renderRaw();
          A.setStatus("Raw JSON applied to memory.", "is-ok");
        } catch (err) {
          A.setStatus(err.message || String(err), "is-err");
        }
      });
    }

    const uniqSearch = $("f-add-unique-search");
    if (uniqSearch) uniqSearch.addEventListener("input", () => fillUniquePicker());

    // Stash polish
    const btnFromChar = $("btn-stash-from-char");
    if (btnFromChar) {
      btnFromChar.addEventListener("click", () => {
        if (!A.state.data || !A.activeStashTab) return;
        const tab = A.activeStashTab();
        if (!tab) return;
        const indices = A.getSelectedItemIndices ? A.getSelectedItemIndices() : [];
        if (!indices.length && A.state.selectedItemIndex != null) indices.push(A.state.selectedItemIndex);
        if (!indices.length) {
          A.setStatus("Select character item(s) first.", "is-err");
          return;
        }
        const items = LESave.ensureSavedItems(A.state.data);
        if (!Array.isArray(tab.savedItems)) tab.savedItems = [];
        let n = 0;
        indices.forEach((idx) => {
          const item = items[idx];
          if (!item) return;
          const clone = LESave.cloneItem(item);
          clone.containerID = 1;
          tab.savedItems.push(clone);
          n += 1;
        });
        A.setStashDirty(true);
        A.renderStash();
        A.setStatus("Copied " + n + " item(s) into active stash tab.", "is-ok");
      });
    }

    const btnToChar = $("btn-stash-to-char");
    if (btnToChar) {
      btnToChar.addEventListener("click", () => {
        if (!A.state.data || A.state.stashSelectedIndex == null) {
          A.setStatus("Select a stash item first.", "is-err");
          return;
        }
        const tab = A.activeStashTab && A.activeStashTab();
        if (!tab || !Array.isArray(tab.savedItems)) return;
        const item = tab.savedItems[A.state.stashSelectedIndex];
        if (!item) return;
        const clone = LESave.cloneItem(item);
        clone.containerID = 1;
        if (!clone.inventoryPosition) clone.inventoryPosition = { x: 0, y: 0 };
        LESave.ensureSavedItems(A.state.data).push(clone);
        tab.savedItems.splice(A.state.stashSelectedIndex, 1);
        A.state.stashSelectedIndex = null;
        A.setDirty(true);
        A.setStashDirty(true);
        A.renderAll();
        A.setStatus("Moved stash item into character inventory.", "is-ok");
      });
    }

    const btnStashCreate = $("btn-stash-create");
    if (btnStashCreate) {
      btnStashCreate.addEventListener("click", () => {
        const tab = A.activeStashTab && A.activeStashTab();
        if (!tab) {
          A.setStatus("Load a stash tab first.", "is-err");
          return;
        }
        if (!Array.isArray(tab.savedItems)) tab.savedItems = [];
        try {
          if (typeof A.createItemInto === "function") {
            A.createItemInto(tab.savedItems);
          } else {
            A.setStatus("Item create helper unavailable.", "is-err");
          }
        } catch (err) {
          A.setStatus(err.message || String(err), "is-err");
        }
      });
    }
  }

  window.LEExtra = {
    bind,
    renderAll,
    renderMonolith,
    renderEndgame,
    renderRaw,
    renderAbilityBars,
    renderWeaver,
    renderIdolsBlessings,
    fillUniquePicker,
  };

  if (window.LEApp) bind();
})();
