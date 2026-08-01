(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    data: null,
    fileName: "CHARACTERSLOT",
    originalText: "",
    dirty: false,
    selectedItemIndex: null,
    editAffixes: [],
    addAffixes: [],
    stashIndex: null,
    stashIndexName: "",
    stashTabs: {},
    stashActiveKey: null,
    stashSelectedIndex: null,
    stashDirty: false,
  };

  const EQUIP_SLOTS = [
    { id: 2, label: "Helmet", area: "helm", glyph: "Helm" },
    { id: 9, label: "Amulet", area: "amu", glyph: "Amu" },
    { id: 3, label: "Body Armor", area: "body", glyph: "Body" },
    { id: 12, label: "Relic", area: "relic", glyph: "Relic" },
    { id: 10, label: "Ring 1", area: "r1", glyph: "Ring" },
    { id: 11, label: "Ring 2", area: "r2", glyph: "Ring" },
    { id: 4, label: "Weapon", area: "wep", glyph: "Wep" },
    { id: 7, label: "Belt", area: "belt", glyph: "Belt" },
    { id: 5, label: "Off-hand", area: "off", glyph: "Off" },
    { id: 6, label: "Gloves", area: "glove", glyph: "Glove" },
    { id: 8, label: "Boots", area: "boot", glyph: "Boot" },
  ];
  const EQUIP_CONTAINER_IDS = new Set(EQUIP_SLOTS.map((s) => s.id));

  const els = {
    fileInput: $("file-input"),
    dropOverlay: $("drop-overlay"),
    btnBackup: $("btn-backup"),
    btnSave: $("btn-save"),
    dirtyPill: $("dirty-pill"),
    tabs: $("tabs"),
    empty: $("empty-state"),
    status: $("status"),
    installModal: $("install-modal"),
    charMeta: $("char-meta"),
    treesRoot: $("trees-root"),
    currencyBody: $("currency-body"),
    currencyNote: $("currency-note"),
    itemsBody: $("items-body"),
    equipBoard: $("equip-board"),
    equipGrid: $("equip-grid"),
    invGrid: $("inv-grid"),
    itemContainerFilter: $("item-container-filter"),
    itemSearch: $("item-search"),
    progressMeta: $("progress-meta"),
    waypointsBody: $("waypoints-body"),
    questsBody: $("quests-body"),
    waypointSearch: $("waypoint-search"),
    questSearch: $("quest-search"),
    waypointCount: $("waypoint-count"),
    questCount: $("quest-count"),
    fPortal: $("f-portal"),
    fReachedTown: $("f-reached-town"),
    stashMeta: $("stash-meta"),
    stashScreen: $("stash-screen"),
    stashTabs: $("stash-tabs"),
    stashGrid: $("stash-grid"),
    stashTabLabel: $("stash-tab-label"),
    stashFileInput: $("stash-file-input"),
    stashDetailEmpty: $("stash-detail-empty"),
    stashDetailForm: $("stash-detail-form"),
    stashDecodeNote: $("stash-decode-note"),
    fStashGold: $("f-stash-gold"),
    fStashQty: $("f-stash-qty"),
    fStashX: $("f-stash-x"),
    fStashY: $("f-stash-y"),
    fStashData: $("f-stash-data"),
    itemDetailEmpty: $("item-detail-empty"),
    itemDetailForm: $("item-detail-form"),
    itemDecodeNote: $("item-decode-note"),
    fItemQty: $("f-item-qty"),
    fItemContainer: $("f-item-container"),
    fItemX: $("f-item-x"),
    fItemY: $("f-item-y"),
    fItemFmt: $("f-item-fmt"),
    fItemData: $("f-item-data"),
    fName: $("f-name"),
    fClass: $("f-class"),
    fMastery: $("f-mastery"),
    fLevel: $("f-level"),
    fExp: $("f-exp"),
    fGold: $("f-gold"),
    fGoldCurrency: $("f-gold-currency"),
    fRespecs: $("f-respecs"),
    fDeaths: $("f-deaths"),
    fHardcore: $("f-hardcore"),
    fMasochist: $("f-masochist"),
    fDied: $("f-died"),
  };

  function setStatus(msg, kind) {
    els.status.textContent = msg;
    els.status.classList.remove("is-ok", "is-err");
    if (kind) els.status.classList.add(kind);
  }

  function setDirty(v) {
    state.dirty = !!v;
    els.dirtyPill.hidden = !state.dirty;
  }

  const EDITOR_PANELS = [
    "panel-character",
    "panel-trees",
    "panel-items",
    "panel-stash",
    "panel-progress",
    "panel-monolith",
    "panel-endgame",
    "panel-currency",
    "panel-raw",
  ];

  function showEditor(show) {
    els.empty.hidden = show;
    els.tabs.hidden = !show;
    for (const id of EDITOR_PANELS) {
      const el = $(id);
      if (el) el.hidden = !show;
    }
    els.btnBackup.disabled = !show;
    els.btnSave.disabled = !show;
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach((p) => {
      p.classList.toggle("is-active", p.id === "panel-" + name);
    });
    if (name === "raw" && window.LEExtra && typeof LEExtra.renderRaw === "function") {
      LEExtra.renderRaw();
    }
  }

  function fillClassSelect() {
    els.fClass.innerHTML = "";
    for (const cls of LEData.CLASSES) {
      const opt = document.createElement("option");
      opt.value = String(cls.id);
      opt.textContent = cls.name;
      els.fClass.appendChild(opt);
    }
  }

  function fillMasterySelect(classId, selected) {
    const cls = LEData.classById(classId);
    els.fMastery.innerHTML = "";
    const none = document.createElement("option");
    none.value = "-1";
    none.textContent = "(none / unset)";
    els.fMastery.appendChild(none);
    if (cls) {
      cls.masteries.forEach((name, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = name;
        els.fMastery.appendChild(opt);
      });
    }
    const sel = selected === undefined || selected === null ? -1 : Number(selected);
    els.fMastery.value = String(Number.isFinite(sel) ? sel : -1);
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadFromText(text, fileName) {
    const data = LESave.parseSaveText(text);
    state.data = data;
    state.originalText = text;
    state.fileName = fileName || "CHARACTERSLOT";
    state.selectedItemIndex = null;
    LESave.ensureGold(data);
    LESave.ensurePassiveTree(data);
    LESave.ensureSkillTrees(data);
    LESave.ensureSavedItems(data);
    showEditor(true);
    switchTab("character");
    renderAll();
    setDirty(false);
    setStatus(`Loaded ${state.fileName} — ${data.characterName}`, "is-ok");
  }

  async function loadFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const probe = LESave.parseEpochPayload(text);
      const kind = LESave.detectSaveKind(probe);
      if (kind === "stash-index" || kind === "stash-tab") {
        await loadStashFiles([file]);
        return;
      }
      loadFromText(text, file.name || "CHARACTERSLOT");
    } catch (err) {
      setStatus(err.message || String(err), "is-err");
    }
  }

  function renderCharacter() {
    const d = state.data;
    if (!d) return;
    els.fName.value = d.characterName || "";
    const classId = Number(d.characterClass);
    if (!LEData.classById(classId) && Number.isFinite(classId)) {
      // Unknown class id — still show it
      let found = false;
      for (const opt of els.fClass.options) {
        if (opt.value === String(classId)) found = true;
      }
      if (!found) {
        const opt = document.createElement("option");
        opt.value = String(classId);
        opt.textContent = `Class ${classId}`;
        els.fClass.appendChild(opt);
      }
    }
    els.fClass.value = String(Number.isFinite(classId) ? classId : 0);
    fillMasterySelect(Number(els.fClass.value), d.chosenMastery);
    els.fLevel.value = Number(d.level) || 1;
    els.fExp.value = Number(d.currentExp) || 0;
    els.fGold.value = Number(d.gold) || 0;
    els.fRespecs.value = Number(d.respecs) || 0;
    els.fDeaths.value = Number(d.deaths) || 0;
    els.fHardcore.checked = !!d.hardcore;
    els.fMasochist.checked = !!d.masochist;
    els.fDied.checked = !!d.died;
    const masteryLabel = LEData.masteryName(d.characterClass, d.chosenMastery);
    els.charMeta.textContent = `${d.characterName} · ${LEData.classById(d.characterClass)?.name || "Class " + d.characterClass} · ${masteryLabel} · Lv ${d.level}`;
  }

  function syncGoldInputs(from) {
    const v = Number(from.value) || 0;
    state.data.gold = v;
    if (from !== els.fGold) els.fGold.value = String(v);
    if (from !== els.fGoldCurrency) els.fGoldCurrency.value = String(v);
  }

  function makeIconEl(iconClass, sizeClass) {
    if (!iconClass) return null;
    const span = document.createElement("span");
    span.className = iconClass + (sizeClass ? " " + sizeClass : "");
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  function fillSkillSelect() {
    const sel = $("f-add-skill");
    if (!sel || !window.LESkills) return;
    const current = sel.value;
    sel.innerHTML = "";
    for (const opt of LESkills.allSkillOptions()) {
      if (LESkills.isPassiveTreeId(opt.id)) continue;
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = `${opt.name} (${opt.id})`;
      sel.appendChild(o);
    }
    if (current) sel.value = current;
  }

  function fillKnownNodesToMax(tree, treeId) {
    const skill = LESkills.getSkill(treeId);
    if (!skill || !skill.nodes) return 0;
    LESave.syncTreeArrays(tree);
    const owned = new Map();
    tree.nodeIDs.forEach((id, i) => owned.set(Number(id), i));
    let touched = 0;
    for (const [nid, meta] of Object.entries(skill.nodes)) {
      const id = Number(nid);
      const max = meta.m;
      if (max == null || max <= 0) continue; // root / non-point nodes
      if (owned.has(id)) {
        const idx = owned.get(id);
        if ((Number(tree.nodePoints[idx]) || 0) !== max) {
          tree.nodePoints[idx] = max;
          touched += 1;
        }
      } else {
        tree.nodeIDs.push(id);
        tree.nodePoints.push(max);
        owned.set(id, tree.nodeIDs.length - 1);
        touched += 1;
      }
    }
    return touched;
  }

  function addSkillTree(treeId) {
    const d = state.data;
    if (!d || !treeId) return;
    const skills = LESave.ensureSkillTrees(d);
    if (skills.some((t) => t.treeID === treeId)) {
      setStatus(`${LESkills.skillName(treeId)} is already on this character.`, "is-err");
      return;
    }
    const slot = skills.length;
    skills.push({
      abilityXP: 0,
      nodeIDs: [0],
      nodePoints: [0],
      nodesTaken: null,
      slotNumber: slot,
      treeID: treeId,
      unspentPoints: 20,
      version: 3,
      xp: 0,
    });
    if (!Array.isArray(d.abilityBar)) d.abilityBar = [];
    if (!d.abilityBar.includes(treeId) && d.abilityBar.length < 5) {
      d.abilityBar.push(treeId);
    }
    setDirty(true);
    renderTrees();
    setStatus(`Added ${LESkills.skillName(treeId)}.`, "is-ok");
  }

  function renderTrees() {
    const d = state.data;
    els.treesRoot.innerHTML = "";
    if (!d) return;
    fillSkillSelect();

    const passiveId = LESkills.passiveTreeIdForClass(d.characterClass);
    const passive = LESave.ensurePassiveTree(d);
    LESave.syncTreeArrays(passive);
    const passiveName = passiveId
      ? (LEData.classById(d.characterClass)?.name || LESkills.skillName(passiveId)) + " Passives"
      : "Passive Tree";
    els.treesRoot.appendChild(
      buildTreeCard({
        title: passiveName,
        treeId: passiveId,
        meta: passiveId
          ? `savedCharacterTree · ${passiveId} · base + 3 masteries`
          : "savedCharacterTree",
        tree: passive,
        removable: false,
        onChange: () => setDirty(true),
      })
    );

    const skills = LESave.ensureSkillTrees(d);
    skills.forEach((tree, i) => {
      LESave.syncTreeArrays(tree);
      const tid = tree.treeID || "";
      els.treesRoot.appendChild(
        buildTreeCard({
          title: LESkills.skillName(tid) || `Skill Tree ${i + 1}`,
          treeId: tid,
          meta: tid ? `${tid} · slot ${tree.slotNumber ?? i}` : `(slot ${tree.slotNumber ?? i})`,
          tree,
          removable: true,
          skillIndex: i,
          onChange: () => setDirty(true),
          onRemove: () => {
            skills.splice(i, 1);
            setDirty(true);
            renderTrees();
          },
        })
      );
    });

    if (!skills.length) {
      const note = document.createElement("p");
      note.className = "panel-note";
      note.textContent =
        "No specialized skills yet — add one from the dropdown above, or unlock skills in-game and reload.";
      els.treesRoot.appendChild(note);
    }
  }

  function pointsOnNode(tree, nodeId) {
    LESave.syncTreeArrays(tree);
    const idx = tree.nodeIDs.findIndex((id) => Number(id) === Number(nodeId));
    if (idx < 0) return 0;
    return Number(tree.nodePoints[idx]) || 0;
  }

  function setPointsOnNode(tree, nodeId, points) {
    LESave.syncTreeArrays(tree);
    const id = Number(nodeId);
    let idx = tree.nodeIDs.findIndex((n) => Number(n) === id);
    const v = Math.max(0, Number(points) || 0);
    if (v <= 0) {
      if (idx >= 0) {
        tree.nodeIDs.splice(idx, 1);
        tree.nodePoints.splice(idx, 1);
      }
      return;
    }
    if (idx < 0) {
      tree.nodeIDs.push(id);
      tree.nodePoints.push(v);
    } else {
      tree.nodePoints[idx] = v;
    }
  }

  function reqsMet(treeId, tree, nodeId) {
    const reqs = LESkills.nodeRequirements(treeId, nodeId);
    if (!reqs.length) return true;
    return reqs.every((req) => pointsOnNode(tree, req.n) >= (Number(req.r) || 0));
  }

  function buildVisualTree(treeId, tree, { onChange, refresh, onlyNodeIds }) {
    const wrap = document.createElement("div");
    wrap.className = "skill-tree-view";
    const hint = document.createElement("div");
    hint.className = "skill-tree-view__hint";
    hint.textContent = "Left-click: add point · Right-click: remove point · Scroll to pan";
    wrap.appendChild(hint);

    const viewport = document.createElement("div");
    viewport.className = "skill-tree-view__viewport";
    const stage = document.createElement("div");
    stage.className = "skill-tree-view__stage";
    viewport.appendChild(stage);
    wrap.appendChild(viewport);

    const skill = LESkills.getSkill(treeId);
    if (!skill || !skill.nodes) {
      const empty = document.createElement("p");
      empty.className = "panel-note";
      empty.textContent = "No layout data for this tree.";
      wrap.appendChild(empty);
      return wrap;
    }

    const allow = onlyNodeIds
      ? new Set([...onlyNodeIds].map((n) => Number(n)))
      : null;

    const entries = Object.keys(skill.nodes)
      .map((nid) => {
        const meta = skill.nodes[nid];
        return {
          id: Number(nid),
          meta,
          x: meta.x != null ? Number(meta.x) : null,
          y: meta.y != null ? Number(meta.y) : null,
        };
      })
      .filter((e) => !allow || allow.has(e.id));
    const positioned = entries.filter((e) => e.x != null && e.y != null);
    const useLayout = positioned.length >= Math.max(3, entries.length * 0.5);

    const SCALE = 0.92;
    const NODE = 70;
    const PAD = 88;
    const MIN_CENTER = 78;
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    if (useLayout) {
      minX = Math.min(...positioned.map((e) => e.x));
      maxX = Math.max(...positioned.map((e) => e.x));
      minY = Math.min(...positioned.map((e) => e.y));
      maxY = Math.max(...positioned.map((e) => e.y));
    }

    function toPx(e, i) {
      if (useLayout && e.x != null) {
        return {
          left: (e.x - minX) * SCALE + PAD,
          top: (maxY - e.y) * SCALE + PAD,
        };
      }
      // fallback ring layout
      const n = entries.length || 1;
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const rad = 55 + Math.floor(i / 8) * 78;
      return {
        left: 300 + Math.cos(ang) * rad,
        top: 240 + Math.sin(ang) * rad,
      };
    }

    const posMap = new Map();
    entries.forEach((e, i) => {
      const p = toPx(e, i);
      posMap.set(e.id, { ...p, cx: p.left + NODE / 2, cy: p.top + NODE / 2 });
    });

    // Light overlap fix only — preserve datamined spacing
    const ids = [...posMap.keys()];
    for (let iter = 0; iter < 12; iter++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = posMap.get(ids[i]);
          const b = posMap.get(ids[j]);
          let dx = b.cx - a.cx;
          let dy = b.cy - a.cy;
          let dist = Math.hypot(dx, dy);
          if (dist < 0.01) {
            dx = 1;
            dy = 0;
            dist = 0.01;
          }
          if (dist >= MIN_CENTER) continue;
          const push = (MIN_CENTER - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.cx -= nx * push;
          a.cy -= ny * push;
          b.cx += nx * push;
          b.cy += ny * push;
          a.left = a.cx - NODE / 2;
          a.top = a.cy - NODE / 2;
          b.left = b.cx - NODE / 2;
          b.top = b.cy - NODE / 2;
          moved = true;
        }
      }
      if (!moved) break;
    }

    let stageW = 480;
    let stageH = 360;
    posMap.forEach((p) => {
      stageW = Math.max(stageW, p.left + NODE + PAD);
      stageH = Math.max(stageH, p.top + NODE + PAD);
    });
    // Normalize so nothing sits clipped past the origin
    let shiftX = 0;
    let shiftY = 0;
    posMap.forEach((p) => {
      if (p.left < PAD / 2) shiftX = Math.max(shiftX, PAD / 2 - p.left);
      if (p.top < PAD / 2) shiftY = Math.max(shiftY, PAD / 2 - p.top);
    });
    if (shiftX || shiftY) {
      posMap.forEach((p) => {
        p.left += shiftX;
        p.top += shiftY;
        p.cx += shiftX;
        p.cy += shiftY;
      });
      stageW += shiftX;
      stageH += shiftY;
    }

    stage.style.width = Math.ceil(stageW) + "px";
    stage.style.height = Math.ceil(stageH + 22) + "px";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "skill-tree-view__edges");
    svg.setAttribute("width", String(Math.ceil(stageW)));
    svg.setAttribute("height", String(Math.ceil(stageH + 22)));
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML =
      '<filter id="skill-edge-glow" x="-40%" y="-40%" width="180%" height="180%">' +
      '<feGaussianBlur stdDeviation="1.6" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      "</filter>";
    svg.appendChild(defs);
    stage.appendChild(svg);

    // edges (only within this section/view)
    entries.forEach((e) => {
      const reqs = Array.isArray(e.meta.r) ? e.meta.r : [];
      reqs.forEach((req) => {
        const parentId = Number(req.n);
        if (allow && !allow.has(parentId)) return;
        const from = posMap.get(parentId);
        const to = posMap.get(e.id);
        if (!from || !to) return;
        const pts = pointsOnNode(tree, e.id);
        const parentPts = pointsOnNode(tree, req.n);
        const linked = parentPts >= (Number(req.r) || 0) && pts > 0;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "skill-edge-group" + (linked ? " is-active" : ""));
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(from.cx));
        line.setAttribute("y1", String(from.cy));
        line.setAttribute("x2", String(to.cx));
        line.setAttribute("y2", String(to.cy));
        line.setAttribute("class", "skill-edge" + (linked ? " is-active" : ""));
        if (linked) line.setAttribute("filter", "url(#skill-edge-glow)");
        g.appendChild(line);
        const mx = (from.cx + to.cx) / 2;
        const my = (from.cy + to.cy) / 2;
        const joint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        joint.setAttribute("cx", String(mx));
        joint.setAttribute("cy", String(my));
        joint.setAttribute("r", linked ? "3.2" : "2.4");
        joint.setAttribute("class", "skill-edge__joint" + (linked ? " is-active" : ""));
        g.appendChild(joint);
        svg.appendChild(g);
      });
    });

    entries.forEach((e) => {
      const p = posMap.get(e.id);
      const pts = pointsOnNode(tree, e.id);
      const max = e.meta.m != null ? Number(e.meta.m) : 0;
      const unlocked = reqsMet(treeId, tree, e.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "skill-node" +
        (pts > 0 ? " is-allocated" : "") +
        (pts > 0 && max > 0 && pts >= max ? " is-maxed" : "") +
        (!unlocked && pts <= 0 ? " is-locked" : "");
      btn.style.left = p.left + "px";
      btn.style.top = p.top + "px";
      btn.title =
        (e.meta.n || "Node " + e.id) +
        (max > 0 ? ` (${pts}/${max})` : pts ? ` (${pts})` : "") +
        (e.meta.d ? "\n" + e.meta.d : "");

      const hex = document.createElement("span");
      hex.className = "skill-node__hex";
      const hexInner = document.createElement("span");
      hexInner.className = "skill-node__hex-inner";
      const ic = makeIconEl(LESkills.nodeIconClass(treeId, e.id), "skill-icon--tree");
      if (ic) hexInner.appendChild(ic);
      else {
        const fallback = document.createElement("span");
        fallback.className = "skill-node__fallback";
        fallback.textContent = "◆";
        hexInner.appendChild(fallback);
      }
      hex.appendChild(hexInner);
      btn.appendChild(hex);

      const badge = document.createElement("span");
      badge.className = "skill-node__pts";
      badge.textContent = max > 0 ? `${pts}/${max}` : pts > 0 ? String(pts) : "0";
      btn.appendChild(badge);

      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (!unlocked && pts <= 0) {
          setStatus("Requirements not met for " + (e.meta.n || e.id), "is-err");
          return;
        }
        const cap = max > 0 ? max : 20;
        if (pts >= cap) return;
        setPointsOnNode(tree, e.id, pts + 1);
        onChange();
        refresh();
      });
      btn.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        if (pts <= 0) return;
        setPointsOnNode(tree, e.id, pts - 1);
        onChange();
        refresh();
      });
      stage.appendChild(btn);
    });

    // Center viewport on root / middle after layout
    requestAnimationFrame(() => {
      const root = posMap.get(0);
      if (root) {
        viewport.scrollLeft = Math.max(0, root.cx - viewport.clientWidth / 2);
        viewport.scrollTop = Math.max(0, root.cy - viewport.clientHeight / 2);
      }
    });

    return wrap;
  }

  function buildTreeCard({ title, treeId, meta, tree, onChange, removable, onRemove }) {
    const card = document.createElement("div");
    card.className = "tree-card";
    const dbSkill = treeId ? LESkills.getSkill(treeId) : null;

    const head = document.createElement("div");
    head.className = "tree-card__head";

    const left = document.createElement("div");
    const titleRow = document.createElement("div");
    titleRow.className = "tree-card__title-row";
    const icon = makeIconEl(LESkills.skillIconClass(treeId), "skill-icon--lg");
    if (icon) titleRow.appendChild(icon);
    const h = document.createElement("h3");
    h.className = "tree-card__title";
    h.textContent = title;
    titleRow.appendChild(h);
    left.appendChild(titleRow);
    const m = document.createElement("div");
    m.className = "tree-card__meta";
    m.textContent = meta;
    left.appendChild(m);

    const controls = document.createElement("div");
    controls.className = "tree-card__controls";

    const unspentLabel = document.createElement("label");
    unspentLabel.textContent = "Unspent points";
    const unspentInput = document.createElement("input");
    unspentInput.type = "number";
    unspentInput.min = "0";
    unspentInput.step = "1";
    unspentInput.value = String(Number(tree.unspentPoints) || 0);
    unspentInput.addEventListener("change", () => {
      tree.unspentPoints = Math.max(0, Number(unspentInput.value) || 0);
      onChange();
    });
    unspentLabel.appendChild(unspentInput);

    const addPtsBtn = document.createElement("button");
    addPtsBtn.type = "button";
    addPtsBtn.className = "btn";
    addPtsBtn.textContent = "+50 unspent";
    addPtsBtn.addEventListener("click", () => {
      tree.unspentPoints = (Number(tree.unspentPoints) || 0) + 50;
      unspentInput.value = String(tree.unspentPoints);
      onChange();
    });

    const fillMaxBtn = document.createElement("button");
    fillMaxBtn.type = "button";
    fillMaxBtn.className = "btn btn--accent";
    fillMaxBtn.textContent = "Fill known to max";
    fillMaxBtn.disabled = !dbSkill;
    fillMaxBtn.title = dbSkill
      ? "Allocate every known node to its max points"
      : "No skill database entry for this tree";
    fillMaxBtn.addEventListener("click", () => {
      const n = fillKnownNodesToMax(tree, treeId);
      refreshVisual();
      rebuildNodeTable();
      onChange();
      setStatus(`Updated ${n} node(s) on ${title}.`, "is-ok");
    });

    const dumpBtn = document.createElement("button");
    dumpBtn.type = "button";
    dumpBtn.className = "btn btn--danger";
    dumpBtn.textContent = "Dump → unspent";
    dumpBtn.addEventListener("click", () => {
      LESave.dumpTreePointsToUnspent(tree);
      unspentInput.value = String(tree.unspentPoints);
      refreshVisual();
      rebuildNodeTable();
      onChange();
    });

    controls.appendChild(unspentLabel);
    controls.appendChild(addPtsBtn);
    controls.appendChild(fillMaxBtn);
    controls.appendChild(dumpBtn);
    if (removable && onRemove) {
      const rmTree = document.createElement("button");
      rmTree.type = "button";
      rmTree.className = "btn btn--danger";
      rmTree.textContent = "Remove skill";
      rmTree.addEventListener("click", onRemove);
      controls.appendChild(rmTree);
    }

    head.appendChild(left);
    head.appendChild(controls);
    card.appendChild(head);

    let visualHost = null;
    function sectionSpent(nodeIds) {
      let spent = 0;
      let cap = 0;
      nodeIds.forEach((nid) => {
        const pts = pointsOnNode(tree, nid);
        spent += pts;
        const max = LESkills.nodeMaxPoints(treeId, nid);
        if (max != null && max > 0) cap += max;
      });
      return { spent, cap };
    }

    function refreshVisual() {
      const next = document.createElement("div");
      next.className = "tree-visual-host";
      const classId = state.data ? state.data.characterClass : null;
      const sections =
        treeId &&
        LESkills.isPassiveTreeId(treeId) &&
        window.LEPassiveSections
          ? LEPassiveSections.namedSections(treeId, classId)
          : null;

      if (treeId && dbSkill && LESkills.treeHasLayout(treeId) && sections && sections.length) {
        const tabs = document.createElement("div");
        tabs.className = "skill-mastery-tabs";
        const panelsHost = document.createElement("div");
        panelsHost.className = "skill-mastery-panels";

        let activeIdx = Number(card.dataset.activeMastery || 0);
        if (activeIdx < 0 || activeIdx >= sections.length) activeIdx = 0;

        function showSection(idx) {
          activeIdx = idx;
          card.dataset.activeMastery = String(idx);
          tabs.querySelectorAll(".skill-mastery-tab").forEach((b, i) => {
            b.classList.toggle("is-active", i === idx);
          });
          panelsHost.innerHTML = "";
          const sec = sections[idx];
          const { spent, cap } = sectionSpent(sec.nodeIds);
          const head = document.createElement("div");
          head.className = "skill-mastery-panel__head";
          head.innerHTML =
            `<h4 class="skill-mastery-panel__title">${sec.name}</h4>` +
            `<span class="skill-mastery-panel__pts">${spent}${cap ? " / " + cap : ""} pts</span>`;
          panelsHost.appendChild(head);
          panelsHost.appendChild(
            buildVisualTree(treeId, tree, {
              onlyNodeIds: sec.nodeIds,
              onChange,
              refresh: () => {
                refreshVisual();
                rebuildNodeTable();
              },
            })
          );
        }

        sections.forEach((sec, idx) => {
          const { spent } = sectionSpent(sec.nodeIds);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className =
            "skill-mastery-tab" +
            (idx === activeIdx ? " is-active" : "") +
            (sec.kind === "base" ? " is-base" : "");
          btn.innerHTML =
            `<span class="skill-mastery-tab__name">${sec.name}</span>` +
            `<span class="skill-mastery-tab__pts">${spent}</span>`;
          btn.addEventListener("click", () => showSection(idx));
          tabs.appendChild(btn);
        });

        next.appendChild(tabs);
        next.appendChild(panelsHost);
        // defer show until host attached? can call immediately
        // but tabs need to exist first — showSection uses tabs query
        if (visualHost) card.replaceChild(next, visualHost);
        else card.appendChild(next);
        visualHost = next;
        showSection(activeIdx);
        return;
      }

      if (treeId && dbSkill && LESkills.treeHasLayout(treeId)) {
        next.appendChild(
          buildVisualTree(treeId, tree, {
            onChange,
            refresh: () => {
              refreshVisual();
              rebuildNodeTable();
            },
          })
        );
      } else if (treeId && dbSkill) {
        // catalog fallback when no coordinates
        const catalog = document.createElement("div");
        catalog.className = "tree-catalog";
        const label = document.createElement("div");
        label.className = "panel-note";
        label.textContent = "Click a node to allocate (no layout coords for this tree):";
        catalog.appendChild(label);
        const grid = document.createElement("div");
        grid.className = "tree-catalog__grid";
        Object.entries(dbSkill.nodes)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .forEach(([nid, meta]) => {
            const id = Number(nid);
            const pts = pointsOnNode(tree, id);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tree-catalog__item" + (pts > 0 ? " is-owned" : "");
            const ic = makeIconEl(LESkills.nodeIconClass(treeId, id), "skill-icon--sm");
            if (ic) btn.appendChild(ic);
            const text = document.createElement("span");
            const maxLabel = meta.m != null && meta.m > 0 ? ` · ${pts}/${meta.m}` : "";
            text.textContent = `${meta.n}${maxLabel}`;
            btn.appendChild(text);
            btn.title = meta.d || meta.n;
            btn.addEventListener("click", () => {
              const max = meta.m != null && meta.m > 0 ? meta.m : 20;
              if (pts >= max) return;
              setPointsOnNode(tree, id, pts + 1);
              onChange();
              refreshVisual();
              rebuildNodeTable();
            });
            btn.addEventListener("contextmenu", (ev) => {
              ev.preventDefault();
              if (pts <= 0) return;
              setPointsOnNode(tree, id, pts - 1);
              onChange();
              refreshVisual();
              rebuildNodeTable();
            });
            grid.appendChild(btn);
          });
        catalog.appendChild(grid);
        next.appendChild(catalog);
      } else {
        const note = document.createElement("p");
        note.className = "panel-note";
        note.textContent = "No skill database entry — edit node IDs in the list below.";
        next.appendChild(note);
      }
      if (visualHost) card.replaceChild(next, visualHost);
      else card.appendChild(next);
      visualHost = next;
    }

    refreshVisual();

    const details = document.createElement("details");
    details.className = "tree-list-details";
    const summary = document.createElement("summary");
    summary.textContent = "List / raw node editor";
    details.appendChild(summary);

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    table.className = "data-table";
    table.innerHTML =
      "<thead><tr><th></th><th>Node</th><th>ID</th><th>Points</th><th></th></tr></thead>";
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    wrap.appendChild(table);
    details.appendChild(wrap);
    card.appendChild(details);

    function rebuildNodeTable() {
      LESave.syncTreeArrays(tree);
      tbody.innerHTML = "";
      tree.nodeIDs.forEach((nid, i) => {
        const tr = document.createElement("tr");
        const metaN = treeId ? LESkills.nodeMeta(treeId, nid) : null;
        const maxPts = treeId ? LESkills.nodeMaxPoints(treeId, nid) : null;

        const tdIcon = document.createElement("td");
        const ic = makeIconEl(LESkills.nodeIconClass(treeId, nid), "skill-icon--sm");
        if (ic) tdIcon.appendChild(ic);

        const tdName = document.createElement("td");
        const nameWrap = document.createElement("div");
        nameWrap.className = "node-name-cell__text";
        const titleEl = document.createElement("div");
        titleEl.className = "node-name-cell__title";
        titleEl.textContent = metaN ? metaN.n : LESkills.nodeName(treeId, nid);
        nameWrap.appendChild(titleEl);
        if (metaN && metaN.d) {
          const desc = document.createElement("div");
          desc.className = "node-name-cell__desc";
          desc.textContent = metaN.d;
          nameWrap.appendChild(desc);
        }
        tdName.appendChild(nameWrap);

        const tdId = document.createElement("td");
        const idInput = document.createElement("input");
        idInput.type = "number";
        idInput.step = "1";
        idInput.value = String(nid);
        idInput.addEventListener("change", () => {
          tree.nodeIDs[i] = Number(idInput.value) || 0;
          rebuildNodeTable();
          refreshVisual();
          onChange();
        });
        tdId.appendChild(idInput);

        const tdPts = document.createElement("td");
        const ptsInput = document.createElement("input");
        ptsInput.type = "number";
        ptsInput.min = "0";
        ptsInput.step = "1";
        if (maxPts != null && maxPts > 0) ptsInput.max = String(maxPts);
        ptsInput.value = String(tree.nodePoints[i] ?? 0);
        ptsInput.addEventListener("change", () => {
          let v = Math.max(0, Number(ptsInput.value) || 0);
          if (maxPts != null && maxPts > 0) v = Math.min(v, maxPts);
          tree.nodePoints[i] = v;
          ptsInput.value = String(v);
          refreshVisual();
          onChange();
        });
        tdPts.appendChild(ptsInput);
        if (maxPts != null && maxPts > 0) {
          const hint = document.createElement("span");
          hint.className = "pts-max";
          hint.textContent = `/ ${maxPts}`;
          tdPts.appendChild(hint);
        }

        const tdAct = document.createElement("td");
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "btn btn--danger";
        rm.textContent = "Remove";
        rm.addEventListener("click", () => {
          tree.nodeIDs.splice(i, 1);
          tree.nodePoints.splice(i, 1);
          rebuildNodeTable();
          refreshVisual();
          onChange();
        });
        tdAct.appendChild(rm);

        tr.appendChild(tdIcon);
        tr.appendChild(tdName);
        tr.appendChild(tdId);
        tr.appendChild(tdPts);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });

      if (!tree.nodeIDs.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.style.color = "var(--muted)";
        td.textContent = "No nodes allocated — click nodes on the tree above.";
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }

    rebuildNodeTable();
    return card;
  }

  function containerLabel(id) {
    return window.LEItems ? LEItems.containerName(id) : "Container " + id;
  }

  function fillContainerSelect(selectEl, selected, includeAll) {
    if (!selectEl) return;
    const prev = selected != null ? String(selected) : selectEl.value;
    selectEl.innerHTML = "";
    if (includeAll) {
      [
        { value: "all", text: "All" },
        { value: "equipped", text: "Equipped gear" },
        { value: "1", text: "1 — Inventory" },
      ].forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.text;
        selectEl.appendChild(opt);
      });
    }
    const known = (window.LEItems && LEItems.DB && LEItems.DB.containers) || {};
    const ids = new Set(Object.keys(known).map(Number));
    if (state.data) {
      for (const item of LESave.ensureSavedItems(state.data)) {
        const cid = Number(item.containerID ?? item.containerId);
        if (Number.isFinite(cid)) ids.add(cid);
      }
    }
    [...ids]
      .filter((n) => Number.isFinite(n) && !(includeAll && n === 1))
      .sort((a, b) => a - b)
      .forEach((id) => {
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = `${id} — ${containerLabel(id)}`;
        selectEl.appendChild(opt);
      });
    if (prev && [...selectEl.options].some((o) => o.value === prev)) {
      selectEl.value = prev;
    } else if (includeAll) {
      selectEl.value = "all";
    }
  }

  function itemMatchesContainerFilter(cid, filterCont) {
    if (!filterCont || filterCont === "all") return true;
    if (filterCont === "equipped") return EQUIP_CONTAINER_IDS.has(Number(cid));
    return String(cid) === filterCont;
  }

  function decodeForUi(item) {
    if (!item) return { label: "Empty", rarity: null, sprite: null, baseType: null };
    if (window.LEItems) return LEItems.decodeItemData(item.data);
    return { label: "Item", rarity: null, sprite: null, baseType: null };
  }

  function rarityClass(rarity) {
    if (rarity == null || !Number.isFinite(Number(rarity))) return "";
    return " le-rarity-" + Number(rarity);
  }

  let itemTipEl = null;
  function ensureItemTip() {
    if (itemTipEl) return itemTipEl;
    itemTipEl = document.createElement("div");
    itemTipEl.className = "item-tip";
    itemTipEl.hidden = true;
    itemTipEl.setAttribute("role", "tooltip");
    document.body.appendChild(itemTipEl);
    return itemTipEl;
  }

  function hideItemTip() {
    const tip = ensureItemTip();
    tip.hidden = true;
    tip.innerHTML = "";
  }

  function positionItemTip(clientX, clientY) {
    const tip = ensureItemTip();
    if (tip.hidden) return;
    const pad = 14;
    const tw = tip.offsetWidth || 260;
    const th = tip.offsetHeight || 120;
    let left = clientX + pad;
    let top = clientY + pad;
    if (left + tw > window.innerWidth - 8) left = clientX - tw - pad;
    if (top + th > window.innerHeight - 8) top = clientY - th - pad;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }

  function buildItemTipHtml(item, decoded, heading) {
    const packed =
      (decoded && decoded.packed) ||
      (item && window.LEItemCodec ? LEItemCodec.unpackBestEffort(item.data) : null);
    const rarityName = window.LEItems ? LEItems.rarityName(decoded && decoded.rarity) : "—";
    const qty = item ? Number(item.quantity) || 0 : 0;
    const parts = [];
    if (heading) parts.push(`<div class="item-tip__slot">${escapeHtml(heading)}</div>`);
    parts.push(
      `<div class="item-tip__name">${escapeHtml((decoded && decoded.label) || "Item")}</div>`
    );
    parts.push(
      `<div class="item-tip__meta">${escapeHtml(rarityName)}` +
        (qty > 1 ? ` · qty ${qty}` : "") +
        `</div>`
    );
    if (packed) {
      const bits = [];
      if (packed.forgingPotential != null) bits.push(`FP ${packed.forgingPotential}`);
      if (packed.legendaryPotential != null && Number(packed.legendaryPotential) > 0) {
        bits.push(`LP ${packed.legendaryPotential}`);
      }
      if (packed.uniqueId != null) bits.push(`Unique #${packed.uniqueId}`);
      if (bits.length) {
        parts.push(`<div class="item-tip__meta">${escapeHtml(bits.join(" · "))}</div>`);
      }
      const affixes = Array.isArray(packed.affixes) ? packed.affixes : [];
      if (affixes.length) {
        parts.push('<ul class="item-tip__affixes">');
        affixes.forEach((a) => {
          const name = affixLabel(a.id);
          const tier = a.tier != null ? `T${Number(a.tier) + 1}` : "";
          const roll = a.roll != null ? `roll ${a.roll}` : "";
          const sealed = a.sealed ? " · sealed" : "";
          const trail = [tier, roll].filter(Boolean).join(" · ");
          parts.push(
            `<li><span class="item-tip__affix-name">${escapeHtml(name)}</span>` +
              (trail || sealed
                ? `<span class="item-tip__affix-meta">${escapeHtml(trail + sealed)}</span>`
                : "") +
              `</li>`
          );
        });
        parts.push("</ul>");
      } else if (packed.layout === "unknown" || !packed.layout) {
        parts.push('<div class="item-tip__note">Stats not fully decoded for this item layout.</div>');
      }
    } else if (item && Array.isArray(item.data) && item.data.length) {
      parts.push(
        `<div class="item-tip__note">Raw: ${escapeHtml(item.data.slice(0, 8).join(", "))}${
          item.data.length > 8 ? "…" : ""
        }</div>`
      );
    }
    return parts.join("");
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bindItemTooltip(el, item, decoded, heading) {
    if (!el || !item) return;
    el.removeAttribute("title");
    el.addEventListener("mouseenter", (ev) => {
      const tip = ensureItemTip();
      tip.innerHTML = buildItemTipHtml(item, decoded, heading);
      tip.hidden = false;
      tip.className = "item-tip" + rarityClass(decoded && decoded.rarity);
      positionItemTip(ev.clientX, ev.clientY);
    });
    el.addEventListener("mousemove", (ev) => positionItemTip(ev.clientX, ev.clientY));
    el.addEventListener("mouseleave", hideItemTip);
  }

  function appendItemIcon(parent, decoded) {
    const wrap = document.createElement("span");
    wrap.className = "le-slot__icon";
    const iconClass = window.LEItems ? LEItems.spriteToItemIconClass(decoded.sprite) : null;
    if (iconClass) {
      const icon = document.createElement("span");
      icon.className = iconClass;
      icon.setAttribute("aria-hidden", "true");
      wrap.appendChild(icon);
    } else if (decoded && decoded.label && decoded.label !== "Empty") {
      wrap.textContent = "◆";
    } else {
      wrap.textContent = "";
    }
    parent.appendChild(wrap);
    return wrap;
  }

  function renderBagGrid(gridEl, entries, opts) {
    if (!gridEl) return;
    const cols = opts.cols || LEData.INV_COLS;
    const rows = opts.rows || LEData.INV_ROWS;
    const selectedIndex = opts.selectedIndex;
    const onSelect = opts.onSelect;
    gridEl.style.setProperty("--cols", String(cols));
    gridEl.style.setProperty("--rows", String(rows));
    gridEl.innerHTML = "";

    for (let i = 0; i < cols * rows; i++) {
      const cell = document.createElement("div");
      cell.className = "le-bag__cell";
      gridEl.appendChild(cell);
    }

    entries.forEach(({ item, index }) => {
      const decoded = decodeForUi(item);
      const pos = item.inventoryPosition || {};
      const x = Math.max(0, Number(pos.x) || 0);
      const y = Math.max(0, Number(pos.y) || 0);
      let [w, h] = LEData.itemSizeForBase(decoded.baseType);
      if (x + w > cols) w = Math.max(1, cols - x);
      if (y + h > rows) h = Math.max(1, rows - y);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "le-bag__item" + rarityClass(decoded.rarity);
      if (selectedIndex === index) btn.classList.add("is-selected");
      btn.style.gridColumn = `${x + 1} / span ${w}`;
      btn.style.gridRow = `${y + 1} / span ${h}`;
      appendItemIcon(btn, decoded);
      const qty = Number(item.quantity) || 0;
      if (qty > 1) {
        const q = document.createElement("span");
        q.className = "le-bag__qty";
        q.textContent = String(qty);
        btn.appendChild(q);
      }
      bindItemTooltip(btn, item, decoded);
      btn.addEventListener("click", () => onSelect && onSelect(index));
      gridEl.appendChild(btn);
    });
  }

  function selectItemByIndex(index) {
    if (!state.data) return;
    const items = LESave.ensureSavedItems(state.data);
    if (index < 0 || index >= items.length) return;
    state.selectedItemIndex = index;
    showItemDetail(index);
    renderEquipment();
    els.itemsBody.querySelectorAll("tr.is-selected").forEach((r) => r.classList.remove("is-selected"));
    const row = els.itemsBody.querySelector(`tr[data-index="${index}"]`);
    if (row) {
      row.classList.add("is-selected");
      row.scrollIntoView({ block: "nearest" });
    }
  }

  function renderEquipment() {
    if (!els.equipBoard || !els.equipGrid) return;
    if (!state.data) {
      els.equipBoard.hidden = true;
      els.equipGrid.innerHTML = "";
      if (els.invGrid) els.invGrid.innerHTML = "";
      return;
    }
    const items = LESave.ensureSavedItems(state.data);
    const byContainer = new Map();
    const invEntries = [];
    items.forEach((item, index) => {
      const cid = Number(item.containerID ?? item.containerId);
      if (EQUIP_CONTAINER_IDS.has(cid) && !byContainer.has(cid)) {
        byContainer.set(cid, { item, index });
      }
      if (cid === 1) invEntries.push({ item, index });
    });

    els.equipBoard.hidden = false;
    els.equipGrid.innerHTML = "";
    EQUIP_SLOTS.forEach((slot) => {
      const found = byContainer.get(slot.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "le-slot le-slot--" + slot.area + (found ? "" : " is-empty");
      if (found && state.selectedItemIndex === found.index) btn.classList.add("is-selected");

      const glyph = document.createElement("span");
      glyph.className = "le-slot__glyph";
      glyph.textContent = slot.glyph;
      btn.appendChild(glyph);

      if (found) {
        const decoded = decodeForUi(found.item);
        btn.className += rarityClass(decoded.rarity);
        appendItemIcon(btn, decoded);
        bindItemTooltip(btn, found.item, decoded, slot.label);
        btn.addEventListener("click", () => {
          if (
            els.itemContainerFilter.value === "equipped" ||
            els.itemContainerFilter.value === "all" ||
            String(els.itemContainerFilter.value) === String(slot.id)
          ) {
            selectItemByIndex(found.index);
          } else {
            els.itemContainerFilter.value = "equipped";
            renderItems();
            selectItemByIndex(found.index);
          }
        });
      } else {
        btn.title = slot.label + " (empty)";
        btn.disabled = true;
      }
      els.equipGrid.appendChild(btn);
    });

    renderBagGrid(els.invGrid, invEntries, {
      cols: LEData.INV_COLS,
      rows: LEData.INV_ROWS,
      selectedIndex: state.selectedItemIndex,
      onSelect: selectItemByIndex,
    });
    if (window.LEExtra && typeof LEExtra.renderIdolsBlessings === "function") {
      LEExtra.renderIdolsBlessings();
    }
  }

  function getSelectedItemIndices() {
    return [...els.itemsBody.querySelectorAll('input.item-check:checked')].map((el) =>
      Number(el.dataset.index)
    );
  }

  function parseDataBytes(text) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    return raw.split(/[\s,]+/).filter(Boolean).map((p) => {
      const n = Number(p);
      if (!Number.isFinite(n) || n < 0 || n > 255) {
        throw new Error("Data bytes must be 0–255 numbers, comma-separated.");
      }
      return Math.floor(n);
    });
  }

  function affixLabel(id) {
    if (window.LEAffixes) {
      return LEAffixes.affixDetail ? LEAffixes.affixDetail(id) : LEAffixes.affixName(id);
    }
    return "Affix #" + id;
  }

  function fillBaseSelect(sel, selected) {
    if (!sel || !window.LEItems) return;
    const prev = selected != null ? String(selected) : sel.value;
    sel.innerHTML = "";
    Object.keys(LEItems.DB.bases)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((id) => {
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = `${id} — ${LEItems.baseName(id)}`;
        sel.appendChild(opt);
      });
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function fillSubSelect(sel, baseType, selected) {
    if (!sel || !window.LEItems) return;
    const prev = selected != null ? String(selected) : sel.value;
    sel.innerHTML = "";
    const base = LEItems.DB.bases[baseType];
    const subs = (base && base.subs) || {};
    Object.keys(subs)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((id) => {
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = `sub ${id}` + (subs[id].lvl ? ` (req ${subs[id].lvl})` : "");
        sel.appendChild(opt);
      });
    if (!sel.options.length) {
      const opt = document.createElement("option");
      opt.value = "0";
      opt.textContent = "0";
      sel.appendChild(opt);
    }
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function fillAffixPick(sel, searchEl, baseType) {
    if (!sel || !window.LEAffixes) return;
    const q = searchEl ? searchEl.value : "";
    const list = LEAffixes.listAffixes({ q, baseType: baseType != null && baseType !== "" ? Number(baseType) : null });
    const cur = sel.value;
    sel.innerHTML = "";
    list.slice(0, 400).forEach((a) => {
      const opt = document.createElement("option");
      opt.value = String(a.id);
      opt.textContent = a.detail || `${a.name} (id ${a.id})`;
      sel.appendChild(opt);
    });
    if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  }

  function renderAffixList(container, affixes, onChange) {
    if (!container) return;
    container.innerHTML = "";
    if (!affixes.length) {
      const empty = document.createElement("p");
      empty.className = "panel-note";
      empty.textContent = "No affixes yet.";
      container.appendChild(empty);
      return;
    }
    affixes.forEach((aff, i) => {
      const row = document.createElement("div");
      row.className = "affix-row";

      const name = document.createElement("span");
      name.textContent = affixLabel(aff.id);
      if (Number(aff.id) > 255) name.title = "ID > 255: classic pack stores low byte only";

      const tier = document.createElement("input");
      tier.type = "number";
      tier.min = "0";
      tier.max = "7";
      tier.value = String(aff.tier != null ? aff.tier : 6);
      tier.title = "Tier 0–7";
      tier.addEventListener("change", () => {
        aff.tier = Math.max(0, Math.min(7, Number(tier.value) || 0));
        onChange && onChange();
      });

      const roll = document.createElement("input");
      roll.type = "number";
      roll.min = "0";
      roll.max = "255";
      roll.value = String(aff.roll != null ? aff.roll : 255);
      roll.title = "Roll 0–255";
      roll.addEventListener("change", () => {
        aff.roll = Math.max(0, Math.min(255, Number(roll.value) || 0));
        onChange && onChange();
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn--danger";
      del.textContent = "Remove";
      del.addEventListener("click", () => {
        affixes.splice(i, 1);
        renderAffixList(container, affixes, onChange);
        onChange && onChange();
      });

      row.appendChild(name);
      row.appendChild(tier);
      row.appendChild(roll);
      row.appendChild(del);
      container.appendChild(row);
    });
  }

  function showItemDetail(index) {
    const items = state.data ? LESave.ensureSavedItems(state.data) : [];
    const item = items[index];
    state.selectedItemIndex = item ? index : null;
    if (!item) {
      els.itemDetailEmpty.hidden = false;
      els.itemDetailForm.hidden = true;
      els.itemDecodeNote.textContent = "";
      state.editAffixes = [];
      return;
    }
    els.itemDetailEmpty.hidden = true;
    els.itemDetailForm.hidden = false;
    fillContainerSelect(els.fItemContainer, item.containerID ?? item.containerId, false);
    els.fItemQty.value = String(Number(item.quantity) || 0);
    els.fItemContainer.value = String(item.containerID ?? item.containerId ?? 1);
    const pos = item.inventoryPosition || {};
    els.fItemX.value = String(pos.x ?? 0);
    els.fItemY.value = String(pos.y ?? 0);
    els.fItemFmt.value = String(item.formatVersion ?? 2);
    els.fItemData.value = Array.isArray(item.data) ? item.data.join(", ") : "";

    const decoded = window.LEItems ? LEItems.decodeItemData(item.data) : null;
    const packed = (decoded && decoded.packed) || (window.LEItemCodec ? LEItemCodec.unpackBestEffort(item.data) : null);

    fillBaseSelect($("f-item-base"), packed ? packed.baseType : decoded && decoded.baseType);
    fillSubSelect($("f-item-sub"), Number($("f-item-base").value), packed ? packed.subType : decoded && decoded.subType);
    if (packed) {
      $("f-item-quality").value = String(packed.quality != null ? packed.quality : 3);
      $("f-item-unique").value = packed.uniqueId != null ? String(packed.uniqueId) : "";
      $("f-item-fp").value = String(packed.forgingPotential != null ? packed.forgingPotential : 255);
      $("f-item-lp").value = String(packed.legendaryPotential != null ? packed.legendaryPotential : 0);
      state.editAffixes = (packed.affixes || []).map((a) => ({
        id: a.id,
        tier: a.tier,
        roll: a.roll,
        sealed: !!a.sealed,
      }));
    } else {
      state.editAffixes = [];
    }

    fillAffixPick($("f-item-affix-pick"), $("f-item-affix-search"), Number($("f-item-base").value));
    renderAffixList($("item-affix-list"), state.editAffixes);

    if (decoded) {
      const rarity = LEItems.rarityName(decoded.rarity);
      const layout = packed ? packed.layout : "?";
      const affN = state.editAffixes.length;
      els.itemDecodeNote.textContent = `${decoded.label} · ${rarity} · layout=${layout} · ${affN} affix(es)` +
        (layout !== "classic" ? " — Apply affixes rewrites to classic pack" : "");
    } else {
      els.itemDecodeNote.textContent = "";
    }
  }

  function applyItemDetailFromForm() {
    const idx = state.selectedItemIndex;
    if (idx == null || !state.data) return false;
    const item = LESave.ensureSavedItems(state.data)[idx];
    if (!item) return false;
    item.quantity = Math.max(0, Number(els.fItemQty.value) || 0);
    item.containerID = Number(els.fItemContainer.value);
    item.inventoryPosition = {
      x: Number(els.fItemX.value) || 0,
      y: Number(els.fItemY.value) || 0,
    };
    item.formatVersion = Math.max(0, Number(els.fItemFmt.value) || 0);
    item.data = parseDataBytes(els.fItemData.value);
    return true;
  }

  function applyAffixesRebuild() {
    const idx = state.selectedItemIndex;
    if (idx == null || !state.data || !window.LEItemCodec) return false;
    const item = LESave.ensureSavedItems(state.data)[idx];
    if (!item) return false;
    const quality = Number($("f-item-quality").value);
    const uniqueRaw = $("f-item-unique").value;
    const uniqueId = uniqueRaw === "" ? null : Number(uniqueRaw);
    const isUnique = uniqueId != null && Number.isFinite(uniqueId) && (quality >= 7 || quality === 4 || quality === 5 || quality === 6);
    const packed = LEItemCodec.packClassic({
      baseType: Number($("f-item-base").value) || 0,
      subType: Number($("f-item-sub").value) || 0,
      quality,
      forgingPotential: Number($("f-item-fp").value) || 0,
      legendaryPotential: Number($("f-item-lp").value) || 0,
      uniqueId: isUnique ? uniqueId : null,
      isSet: quality === 8 || quality === 5,
      affixes: isUnique ? [] : state.editAffixes,
      implicits: [255, 255, 255],
    });
    item.data = packed;
    item.quantity = Math.max(0, Number(els.fItemQty.value) || 0);
    item.containerID = Number(els.fItemContainer.value);
    item.inventoryPosition = {
      x: Number(els.fItemX.value) || 0,
      y: Number(els.fItemY.value) || 0,
    };
    item.formatVersion = 2;
    els.fItemData.value = packed.join(", ");
    return true;
  }

  function maxRollsForIndices(indices) {
    if (!window.LEItems) return 0;
    const items = LESave.ensureSavedItems(state.data);
    let total = 0;
    for (const idx of indices) {
      const item = items[idx];
      if (!item || !Array.isArray(item.data)) continue;
      total += LEItems.maxAffixRolls(item.data);
    }
    return total;
  }

  function initAddItemPanel() {
    fillBaseSelect($("f-add-base"), 0);
    fillSubSelect($("f-add-sub"), Number($("f-add-base").value), 0);
    fillAffixPick($("f-add-affix-pick"), $("f-add-affix-search"), Number($("f-add-base").value));
    renderAffixList($("add-affix-list"), state.addAffixes);
  }

  function buildItemFromAddForm() {
    if (!window.LEItemCodec) throw new Error("Item codec unavailable.");
    const kind = $("f-add-kind").value;
    const quality = Number($("f-add-quality").value);
    const uniqueId = kind === "unique" ? Number($("f-add-unique").value) : null;
    if (kind === "unique" && !Number.isFinite(uniqueId)) {
      throw new Error("Enter a Unique ID (see Last Epoch Tools DB).");
    }
    if (kind !== "unique" && state.addAffixes.some((a) => Number(a.id) > 255)) {
      setStatus("Warning: affix IDs > 255 only pack their low byte.", "is-err");
    }
    return LEItemCodec.createSavedItem({
      baseType: Number($("f-add-base").value) || 0,
      subType: Number($("f-add-sub").value) || 0,
      quality: kind === "unique" ? (quality >= 7 ? quality : 7) : quality,
      forgingPotential: Number($("f-add-fp").value) || 255,
      legendaryPotential: Number($("f-add-lp").value) || 0,
      uniqueId: kind === "unique" ? uniqueId : null,
      isSet: quality === 8,
      affixes: kind === "unique" ? [] : state.addAffixes.slice(0, 6),
      implicits: [255, 255, 255],
      containerID: 1,
      x: Number($("f-add-x").value) || 0,
      y: Number($("f-add-y").value) || 0,
      quantity: 1,
    });
  }

  function createItemInto(targetArray) {
    if (!Array.isArray(targetArray)) {
      throw new Error("Target item list missing.");
    }
    const item = buildItemFromAddForm();
    targetArray.push(item);
    const charItems = state.data ? LESave.ensureSavedItems(state.data) : null;
    if (charItems && targetArray === charItems) {
      state.selectedItemIndex = targetArray.length - 1;
      setDirty(true);
      renderItems();
      renderCurrency();
      setStatus(`Created item #${state.selectedItemIndex} in inventory.`, "is-ok");
    } else {
      setStashDirty(true);
      renderStash();
      setStatus(`Created item in stash (#${targetArray.length - 1}).`, "is-ok");
    }
    return item;
  }

  function createItemFromForm() {
    if (!state.data) return;
    createItemInto(LESave.ensureSavedItems(state.data));
  }

  function fillAddSubs() {
    fillSubSelect($("f-add-sub"), Number($("f-add-base").value));
  }

  function renderItems() {
    const d = state.data;
    if (!d || !els.itemsBody) return;
    const items = LESave.ensureSavedItems(d);
    fillContainerSelect(els.itemContainerFilter, els.itemContainerFilter.value || "all", true);
    fillContainerSelect(els.fItemContainer, els.fItemContainer.value, false);

    const filterCont = els.itemContainerFilter.value || "all";
    const q = (els.itemSearch.value || "").trim().toLowerCase();
    els.itemsBody.innerHTML = "";
    renderEquipment();

    let shown = 0;
    items.forEach((item, index) => {
      const cid = Number(item.containerID ?? item.containerId);
      if (!itemMatchesContainerFilter(cid, filterCont)) return;
      const decoded = window.LEItems
        ? LEItems.decodeItemData(item.data)
        : { label: "Item", rarity: null, sprite: null };
      const rarity = window.LEItems ? LEItems.rarityName(decoded.rarity) : "—";
      const hay = [
        decoded.label,
        rarity,
        containerLabel(cid),
        String(index),
        Array.isArray(item.data) ? item.data.join(",") : "",
      ]
        .join(" ")
        .toLowerCase();
      if (q && !hay.includes(q)) return;

      shown += 1;
      const tr = document.createElement("tr");
      tr.className = "items-row";
      if (state.selectedItemIndex === index) tr.classList.add("is-selected");
      tr.dataset.index = String(index);

      const tdCheck = document.createElement("td");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "item-check";
      check.dataset.index = String(index);
      check.addEventListener("click", (e) => e.stopPropagation());
      tdCheck.appendChild(check);

      const tdIdx = document.createElement("td");
      tdIdx.textContent = String(index);

      const tdIcon = document.createElement("td");
      tdIcon.className = "item-icon-cell";
      const iconClass = window.LEItems ? LEItems.spriteToItemIconClass(decoded.sprite) : null;
      if (iconClass) {
        const icon = document.createElement("span");
        icon.className = iconClass;
        icon.setAttribute("aria-hidden", "true");
        tdIcon.appendChild(icon);
      } else {
        tdIcon.textContent = "—";
      }

      const tdName = document.createElement("td");
      tdName.textContent = decoded.label;

      const tdRarity = document.createElement("td");
      tdRarity.textContent = rarity;

      const tdQty = document.createElement("td");
      tdQty.textContent = String(Number(item.quantity) || 0);

      const tdCont = document.createElement("td");
      tdCont.textContent = containerLabel(cid);

      const tdPos = document.createElement("td");
      const pos = item.inventoryPosition || {};
      tdPos.textContent = `${pos.x ?? "?"},${pos.y ?? "?"}`;

      tr.appendChild(tdCheck);
      tr.appendChild(tdIdx);
      tr.appendChild(tdIcon);
      tr.appendChild(tdName);
      tr.appendChild(tdRarity);
      tr.appendChild(tdQty);
      tr.appendChild(tdCont);
      tr.appendChild(tdPos);

      tr.addEventListener("click", () => selectItemByIndex(index));

      els.itemsBody.appendChild(tr);
    });

    if (!shown) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.style.color = "var(--muted)";
      td.textContent = items.length
        ? "No items match this filter."
        : "No savedItems on this character.";
      tr.appendChild(td);
      els.itemsBody.appendChild(tr);
    }

    if (state.selectedItemIndex != null && items[state.selectedItemIndex]) {
      showItemDetail(state.selectedItemIndex);
    } else {
      showItemDetail(-1);
    }
  }

  function renderProgress() {
    const d = state.data;
    if (!d) return;
    const unlocked = LESave.ensureWaypoints(d);
    const unlockedSet = new Set(unlocked);
    const quests = LESave.ensureQuests(d);
    const known = (window.LEProgress && LEProgress.WAYPOINTS) || [];
    const unlockedKnown = known.filter((id) => unlockedSet.has(id)).length;

    if (els.fPortal) els.fPortal.checked = !!d.portalUnlocked;
    if (els.fReachedTown) els.fReachedTown.checked = !!d.reachedTown;
    if (els.progressMeta) {
      els.progressMeta.textContent = `${unlocked.length} teleport(s) unlocked · ${quests.length} quest record(s) · ${unlockedKnown}/${known.length} known waypoints`;
    }
    if (els.waypointCount) {
      els.waypointCount.textContent = `(${unlockedKnown}/${known.length || unlocked.length})`;
    }
    if (els.questCount) {
      els.questCount.textContent = `(${quests.length})`;
    }

    const wq = (els.waypointSearch && els.waypointSearch.value) || "";
    const list = window.LEProgress
      ? LEProgress.listWaypoints({ q: wq, unlocked })
      : unlocked
          .filter((id) => !wq || String(id).toLowerCase().includes(wq.toLowerCase()))
          .map((id) => ({ id, name: id, unlocked: true, era: null, lvl: 0 }));

    if (els.waypointsBody) {
      els.waypointsBody.innerHTML = "";
      list.forEach((wp) => {
        const tr = document.createElement("tr");
        const tdCheck = document.createElement("td");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = !!wp.unlocked;
        check.addEventListener("change", () => {
          const cur = new Set(LESave.ensureWaypoints(state.data));
          if (check.checked) cur.add(wp.id);
          else cur.delete(wp.id);
          LESave.setWaypoints(state.data, [...cur]);
          setDirty(true);
          renderProgress();
        });
        tdCheck.appendChild(check);

        const tdName = document.createElement("td");
        tdName.textContent = wp.name || wp.id;
        const tdEra = document.createElement("td");
        tdEra.textContent =
          wp.era != null && window.LEProgress && LEProgress.ERA_NAMES[wp.era]
            ? LEProgress.ERA_NAMES[wp.era]
            : wp.era != null
              ? String(wp.era)
              : "—";
        const tdLvl = document.createElement("td");
        tdLvl.textContent = wp.lvl ? String(wp.lvl) : "—";

        tr.appendChild(tdCheck);
        tr.appendChild(tdName);
        tr.appendChild(tdEra);
        tr.appendChild(tdLvl);
        els.waypointsBody.appendChild(tr);
      });
      if (!list.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.style.color = "var(--muted)";
        td.textContent = "No waypoints match.";
        tr.appendChild(td);
        els.waypointsBody.appendChild(tr);
      }
    }

    const qq = ((els.questSearch && els.questSearch.value) || "").trim().toLowerCase();
    if (els.questsBody) {
      els.questsBody.innerHTML = "";
      const filtered = quests.filter((q) => {
        if (!qq) return true;
        return String(q.questID).includes(qq) || String(q.questStepID).includes(qq);
      });
      filtered.forEach((q) => {
        const tr = document.createElement("tr");
        const tdId = document.createElement("td");
        tdId.textContent = String(q.questID);
        const tdStep = document.createElement("td");
        tdStep.textContent = String(q.questStepID ?? "—");
        const tdObj = document.createElement("td");
        tdObj.textContent = String((q.completeObjectives || []).length);
        const tdState = document.createElement("td");
        tdState.textContent = String(q.state ?? 0);
        tr.appendChild(tdId);
        tr.appendChild(tdStep);
        tr.appendChild(tdObj);
        tr.appendChild(tdState);
        els.questsBody.appendChild(tr);
      });
      if (!filtered.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 4;
        td.style.color = "var(--muted)";
        td.textContent = quests.length ? "No quests match." : "No savedQuests yet — apply campaign quest progress.";
        tr.appendChild(td);
        els.questsBody.appendChild(tr);
      }
    }
  }

  function renderCurrency() {
    const d = state.data;
    if (!d) return;
    LESave.ensureGold(d);
    els.fGoldCurrency.value = String(Number(d.gold) || 0);
    const list = LESave.listCurrencyItems(d);
    els.currencyBody.innerHTML = "";

    if (!list.length) {
      els.currencyNote.textContent =
        "No currency-like stacks found in savedItems. Gold above still works. Pick up a rune/material stack in-game if you want quantity editing.";
    } else {
      els.currencyNote.textContent =
        `Showing ${list.length} stack(s) matched by fingerprint or short data + quantity heuristic.`;
    }

    for (const { index, item } of list) {
      const known = LEData.identifyCurrency(item);
      const tr = document.createElement("tr");

      const tdIdx = document.createElement("td");
      tdIdx.textContent = String(index);

      const tdName = document.createElement("td");
      tdName.textContent = known || "Unknown stack";

      const tdQty = document.createElement("td");
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "0";
      qtyInput.step = "1";
      qtyInput.value = String(Number(item.quantity) || 0);
      qtyInput.addEventListener("change", () => {
        item.quantity = Math.max(0, Number(qtyInput.value) || 0);
        setDirty(true);
      });
      tdQty.appendChild(qtyInput);

      const tdCont = document.createElement("td");
      tdCont.textContent = String(item.containerID ?? item.containerId ?? "—");

      const tdPos = document.createElement("td");
      const pos = item.inventoryPosition || {};
      tdPos.textContent = `${pos.x ?? "?"},${pos.y ?? "?"}`;

      const tdData = document.createElement("td");
      tdData.innerHTML = `<code>${LEData.formatDataPreview(item.data)}</code>`;

      tr.appendChild(tdIdx);
      tr.appendChild(tdName);
      tr.appendChild(tdQty);
      tr.appendChild(tdCont);
      tr.appendChild(tdPos);
      tr.appendChild(tdData);
      els.currencyBody.appendChild(tr);
    }
  }

  function renderAll() {
    renderCharacter();
    renderTrees();
    renderItems();
    renderProgress();
    renderCurrency();
    renderStash();
    if (window.LEExtra) LEExtra.renderAll();
  }

  function setStashDirty(v) {
    state.stashDirty = !!v;
    const saveBtn = $("btn-stash-save");
    const bakBtn = $("btn-stash-backup");
    const idxBtn = $("btn-stash-save-index");
    if (saveBtn) saveBtn.disabled = !state.stashActiveKey;
    if (bakBtn) bakBtn.disabled = !state.stashActiveKey;
    if (idxBtn) idxBtn.disabled = !state.stashIndex;
  }

  function activeStashTab() {
    if (!state.stashActiveKey) return null;
    return state.stashTabs[state.stashActiveKey] || null;
  }

  function selectStashItem(index) {
    const tab = activeStashTab();
    if (!tab || !Array.isArray(tab.savedItems)) return;
    if (index < 0 || index >= tab.savedItems.length) {
      state.stashSelectedIndex = null;
      if (els.stashDetailEmpty) els.stashDetailEmpty.hidden = false;
      if (els.stashDetailForm) els.stashDetailForm.hidden = true;
      renderStashGrid();
      return;
    }
    state.stashSelectedIndex = index;
    const item = tab.savedItems[index];
    const decoded = decodeForUi(item);
    if (els.stashDetailEmpty) els.stashDetailEmpty.hidden = true;
    if (els.stashDetailForm) els.stashDetailForm.hidden = false;
    if (els.stashDecodeNote) {
      els.stashDecodeNote.textContent =
        decoded.label +
        " · " +
        (window.LEItems ? LEItems.rarityName(decoded.rarity) : "") +
        " · #" +
        index;
    }
    if (els.fStashQty) els.fStashQty.value = String(Number(item.quantity) || 0);
    const pos = item.inventoryPosition || {};
    if (els.fStashX) els.fStashX.value = String(pos.x ?? 0);
    if (els.fStashY) els.fStashY.value = String(pos.y ?? 0);
    if (els.fStashData) {
      els.fStashData.value = Array.isArray(item.data) ? item.data.join(", ") : "";
    }
    renderStashGrid();
  }

  function renderStashTabs() {
    if (!els.stashTabs) return;
    els.stashTabs.innerHTML = "";
    const keys = Object.keys(state.stashTabs).sort((a, b) => {
      const ta = state.stashTabs[a];
      const tb = state.stashTabs[b];
      return (Number(ta.tabId) || 0) - (Number(tb.tabId) || 0) || a.localeCompare(b);
    });
    keys.forEach((key) => {
      const tab = state.stashTabs[key];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "le-stash-tab" + (key === state.stashActiveKey ? " is-active" : "");
      btn.textContent = tab.displayName || key;
      btn.title = key;
      btn.addEventListener("click", () => {
        state.stashActiveKey = key;
        state.stashSelectedIndex = null;
        renderStash();
      });
      els.stashTabs.appendChild(btn);
    });
  }

  function renderStashGrid() {
    const tab = activeStashTab();
    if (!els.stashGrid) return;
    if (!tab) {
      els.stashGrid.innerHTML = "";
      return;
    }
    const items = Array.isArray(tab.savedItems) ? tab.savedItems : [];
    const entries = items.map((item, index) => ({ item, index }));
    renderBagGrid(els.stashGrid, entries, {
      cols: LEData.STASH_COLS,
      rows: LEData.STASH_ROWS,
      selectedIndex: state.stashSelectedIndex,
      onSelect: selectStashItem,
    });
  }

  function renderStash() {
    const has =
      !!state.stashIndex || Object.keys(state.stashTabs).length > 0;
    if (els.stashScreen) els.stashScreen.hidden = !has;
    if (!has) {
      if (els.stashMeta) {
        els.stashMeta.textContent = "Load offline STASH_CYCLE_* index and tab files";
      }
      const setDisabled = (id, disabled) => {
        const el = $(id);
        if (el) el.disabled = !!disabled;
      };
      setDisabled("btn-stash-from-char", true);
      setDisabled("btn-stash-to-char", true);
      setDisabled("btn-stash-create", true);
      setDisabled("btn-gold-to-stash", true);
      setDisabled("btn-gold-to-char", true);
      setStashDirty(state.stashDirty);
      return;
    }

    if (els.fStashGold && state.stashIndex) {
      els.fStashGold.value = String(Number(state.stashIndex.gold) || 0);
      els.fStashGold.disabled = false;
    } else if (els.fStashGold) {
      els.fStashGold.value = "";
      els.fStashGold.disabled = true;
    }

    if (!state.stashActiveKey) {
      const keys = Object.keys(state.stashTabs);
      state.stashActiveKey = keys[0] || null;
    }

    renderStashTabs();
    const tab = activeStashTab();
    if (els.stashTabLabel) {
      els.stashTabLabel.textContent = tab
        ? tab.displayName || state.stashActiveKey
        : "Stash";
    }
    const tabCount = Object.keys(state.stashTabs).length;
    const itemCount = tab && Array.isArray(tab.savedItems) ? tab.savedItems.length : 0;
    if (els.stashMeta) {
      els.stashMeta.textContent = `${tabCount} tab(s) loaded · ${itemCount} item(s) on active tab` +
        (state.stashIndexName ? ` · index ${state.stashIndexName}` : "");
    }
    renderStashGrid();
    if (state.stashSelectedIndex == null) {
      if (els.stashDetailEmpty) els.stashDetailEmpty.hidden = false;
      if (els.stashDetailForm) els.stashDetailForm.hidden = true;
    } else if (tab && tab.savedItems && tab.savedItems[state.stashSelectedIndex]) {
      const item = tab.savedItems[state.stashSelectedIndex];
      const decoded = decodeForUi(item);
      if (els.stashDetailEmpty) els.stashDetailEmpty.hidden = true;
      if (els.stashDetailForm) els.stashDetailForm.hidden = false;
      if (els.stashDecodeNote) {
        els.stashDecodeNote.textContent =
          decoded.label +
          " · " +
          (window.LEItems ? LEItems.rarityName(decoded.rarity) : "") +
          " · #" +
          state.stashSelectedIndex;
      }
      if (els.fStashQty) els.fStashQty.value = String(Number(item.quantity) || 0);
      const pos = item.inventoryPosition || {};
      if (els.fStashX) els.fStashX.value = String(pos.x ?? 0);
      if (els.fStashY) els.fStashY.value = String(pos.y ?? 0);
      if (els.fStashData) {
        els.fStashData.value = Array.isArray(item.data) ? item.data.join(", ") : "";
      }
    }
    const hasTab = !!activeStashTab();
    const hasChar = !!state.data;
    const hasIndex = !!state.stashIndex;
    const setDisabled = (id, disabled) => {
      const el = $(id);
      if (el) el.disabled = !!disabled;
    };
    setDisabled("btn-stash-from-char", !hasTab || !hasChar);
    setDisabled("btn-stash-to-char", !hasTab || !hasChar);
    setDisabled("btn-stash-create", !hasTab);
    setDisabled("btn-gold-to-stash", !hasIndex || !hasChar);
    setDisabled("btn-gold-to-char", !hasIndex || !hasChar);
    setStashDirty(state.stashDirty);
  }

  async function loadStashFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    let loadedTabs = 0;
    let loadedIndex = false;
    for (const file of files) {
      const text = await file.text();
      const data = LESave.parseEpochPayload(text);
      const kind = LESave.detectSaveKind(data);
      const name = file.name || "STASH";
      if (kind === "stash-index") {
        state.stashIndex = data;
        state.stashIndexName = name;
        loadedIndex = true;
      } else if (kind === "stash-tab") {
        if (!Array.isArray(data.savedItems)) data.savedItems = [];
        state.stashTabs[name] = data;
        loadedTabs += 1;
        if (!state.stashActiveKey) state.stashActiveKey = name;
      } else if (kind === "character") {
        throw new Error("Character saves go in Load Save, not Load stash files.");
      } else {
        throw new Error("Unrecognized stash file: " + name);
      }
    }
    if (state.stashIndex && Array.isArray(state.stashIndex.tabsv2)) {
      // Prefer activating first listed tab if we have it loaded
      for (const ref of state.stashIndex.tabsv2) {
        if (state.stashTabs[ref]) {
          state.stashActiveKey = ref;
          break;
        }
      }
    }
    state.stashSelectedIndex = null;
    state.stashDirty = false;
    showEditor(true);
    if (!state.data) {
      // stash-only session: still show tabs UI
      els.empty.hidden = true;
      els.tabs.hidden = false;
      for (const id of EDITOR_PANELS) {
        const el = $(id);
        if (el) el.hidden = false;
      }
      els.btnBackup.disabled = true;
      els.btnSave.disabled = true;
    }
    switchTab("stash");
    renderStash();
    setStatus(
      `Loaded stash` +
        (loadedIndex ? " index" : "") +
        (loadedTabs ? ` + ${loadedTabs} tab(s)` : "") +
        ".",
      "is-ok"
    );
  }

  function applyStashItemFromForm() {
    const tab = activeStashTab();
    if (!tab || state.stashSelectedIndex == null) return false;
    const item = tab.savedItems[state.stashSelectedIndex];
    if (!item) return false;
    item.quantity = Math.max(0, Number(els.fStashQty.value) || 0);
    item.inventoryPosition = {
      x: Number(els.fStashX.value) || 0,
      y: Number(els.fStashY.value) || 0,
    };
    item.data = parseDataBytes(els.fStashData.value);
    state.stashDirty = true;
    return true;
  }

  function applyCharacterFromForm() {
    const d = state.data;
    if (!d) return;
    d.characterName = els.fName.value || d.characterName;
    d.characterClass = Number(els.fClass.value);
    const mastery = Number(els.fMastery.value);
    d.chosenMastery = mastery;
    if (mastery >= 0) d.clickedUnlockMasteriesButton = true;
    d.level = Math.min(LEData.LEVEL_CAP, Math.max(1, Number(els.fLevel.value) || 1));
    d.currentExp = Math.max(0, Number(els.fExp.value) || 0);
    d.gold = Math.max(0, Number(els.fGold.value) || 0);
    d.respecs = Math.max(0, Number(els.fRespecs.value) || 0);
    d.deaths = Math.max(0, Number(els.fDeaths.value) || 0);
    d.hardcore = !!els.fHardcore.checked;
    d.masochist = !!els.fMasochist.checked;
    d.died = !!els.fDied.checked;
    els.fGoldCurrency.value = String(d.gold);
  }

  function bindCharacterInputs() {
    const mark = () => {
      applyCharacterFromForm();
      setDirty(true);
      const d = state.data;
      els.charMeta.textContent = `${d.characterName} · ${LEData.classById(d.characterClass)?.name || "Class " + d.characterClass} · ${LEData.masteryName(d.characterClass, d.chosenMastery)} · Lv ${d.level}`;
    };

    [els.fName, els.fLevel, els.fExp, els.fRespecs, els.fDeaths].forEach((el) => {
      el.addEventListener("change", mark);
      el.addEventListener("input", () => setDirty(true));
    });

    els.fGold.addEventListener("change", () => {
      syncGoldInputs(els.fGold);
      setDirty(true);
    });
    els.fGold.addEventListener("input", () => setDirty(true));

    els.fGoldCurrency.addEventListener("change", () => {
      syncGoldInputs(els.fGoldCurrency);
      setDirty(true);
    });
    els.fGoldCurrency.addEventListener("input", () => setDirty(true));

    els.fClass.addEventListener("change", () => {
      fillMasterySelect(Number(els.fClass.value), Number(els.fMastery.value));
      mark();
    });
    els.fMastery.addEventListener("change", mark);
    [els.fHardcore, els.fMasochist, els.fDied].forEach((el) => {
      el.addEventListener("change", mark);
    });
  }

  function setAllListedQuantities(qty) {
    const list = LESave.listCurrencyItems(state.data);
    for (const { item } of list) item.quantity = qty;
    renderCurrency();
    setDirty(true);
  }

  // --- Events ---
  fillClassSelect();
  bindCharacterInputs();

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    loadFile(file);
    els.fileInput.value = "";
  });

  if (window.GGSaveFolders) {
    GGSaveFolders.wireEditor("last-epoch", {
      setStatus: (msg) => setStatus(msg, "is-ok"),
      async onFile(file) {
        await loadFile(file);
      },
    });
  }

  els.btnBackup.addEventListener("click", () => {
    if (!state.originalText) return;
    downloadText(state.fileName + ".bak", state.originalText);
    setStatus("Backup downloaded.", "is-ok");
  });

  els.btnSave.addEventListener("click", () => {
    if (!state.data) return;
    applyCharacterFromForm();
    const out = LESave.serializeSave(state.data);
    downloadText(state.fileName, out);
    setDirty(false);
    setStatus(`Saved ${state.fileName} — replace the file in your Saves folder.`, "is-ok");
    els.installModal.hidden = false;
  });

  $("btn-close-modal").addEventListener("click", () => {
    els.installModal.hidden = true;
  });
  els.installModal.addEventListener("click", (e) => {
    if (e.target === els.installModal) els.installModal.hidden = true;
  });

  $("btn-max-level").addEventListener("click", () => {
    els.fLevel.value = String(LEData.LEVEL_CAP);
    els.fExp.value = "0";
    applyCharacterFromForm();
    setDirty(true);
    setStatus("Level set to 100.", "is-ok");
  });

  $("btn-unlock-masteries").addEventListener("click", () => {
    if (!state.data) return;
    LESave.unlockMasteries(state.data);
    setDirty(true);
    renderCharacter();
    if (typeof renderProgress === "function") {
      try {
        renderProgress();
      } catch (_) {
        /* ignore if progress UI not ready */
      }
    }
    setStatus(
      "Masteries unlocked (Epoch quest + Mastery hub). Spend points in all three trees; pick a mastery above for skills/identity.",
      "is-ok"
    );
  });

  $("btn-add-respecs").addEventListener("click", () => {
    els.fRespecs.value = String((Number(els.fRespecs.value) || 0) + 50);
    applyCharacterFromForm();
    setDirty(true);
  });

  $("btn-clear-died").addEventListener("click", () => {
    els.fDied.checked = false;
    applyCharacterFromForm();
    setDirty(true);
  });

  $("btn-max-gold-char").addEventListener("click", () => {
    els.fGold.value = "99999999";
    syncGoldInputs(els.fGold);
    setDirty(true);
  });

  $("btn-unlock-all-waypoints").addEventListener("click", () => {
    if (!state.data) return;
    const added = LESave.unlockAllKnownWaypoints(state.data);
    setDirty(true);
    renderProgress();
    setStatus(`Unlocked teleports (+${added} new). Total ${LESave.ensureWaypoints(state.data).length}.`, "is-ok");
  });

  $("btn-unlock-hubs").addEventListener("click", () => {
    if (!state.data) return;
    const hubs = (window.LEProgress && LEProgress.HUBS) || ["EoT", "MonolithHub", "WeaversHub", "Bazaar"];
    const added = LESave.unlockWaypoints(state.data, hubs);
    setDirty(true);
    renderProgress();
    setStatus(`Unlocked hubs (+${added} new).`, "is-ok");
  });

  $("btn-apply-campaign-quests").addEventListener("click", () => {
    if (!state.data) return;
    if (!window.LEProgress || !LEProgress.CAMPAIGN_QUESTS.length) {
      setStatus("No campaign quest template loaded.", "is-err");
      return;
    }
    const n = LESave.applyCampaignQuests(state.data);
    LESave.mergeCampaignFlags(state.data);
    setDirty(true);
    renderProgress();
    setStatus(`Applied ${n} campaign quest record(s) + flags.`, "is-ok");
  });

  $("btn-apply-campaign-pack").addEventListener("click", () => {
    if (!state.data) return;
    if (!window.LEProgress) {
      setStatus("Progress database not loaded.", "is-err");
      return;
    }
    const qn = LESave.applyCampaignQuests(state.data);
    const wn = LESave.unlockAllKnownWaypoints(state.data);
    LESave.mergeCampaignFlags(state.data);
    setDirty(true);
    renderProgress();
    setStatus(`Campaign pack applied: ${qn} quests, +${wn} teleports, flags set.`, "is-ok");
  });

  if (els.fPortal) {
    els.fPortal.addEventListener("change", () => {
      if (!state.data) return;
      state.data.portalUnlocked = !!els.fPortal.checked;
      setDirty(true);
    });
  }
  if (els.fReachedTown) {
    els.fReachedTown.addEventListener("change", () => {
      if (!state.data) return;
      state.data.reachedTown = !!els.fReachedTown.checked;
      setDirty(true);
    });
  }
  if (els.waypointSearch) {
    els.waypointSearch.addEventListener("input", () => renderProgress());
  }
  if (els.questSearch) {
    els.questSearch.addEventListener("input", () => renderProgress());
  }

  if (els.stashFileInput) {
    els.stashFileInput.addEventListener("change", async () => {
      try {
        await loadStashFiles(els.stashFileInput.files);
      } catch (err) {
        setStatus(err.message || String(err), "is-err");
      }
      els.stashFileInput.value = "";
    });
  }

  if (els.fStashGold) {
    els.fStashGold.addEventListener("change", () => {
      if (!state.stashIndex) return;
      state.stashIndex.gold = Math.max(0, Number(els.fStashGold.value) || 0);
      state.stashDirty = true;
      setStashDirty(true);
    });
  }

  const btnGoldToStash = $("btn-gold-to-stash");
  if (btnGoldToStash) {
    btnGoldToStash.addEventListener("click", () => {
      if (!state.data || !state.stashIndex) {
        setStatus("Need character + stash index loaded.", "is-err");
        return;
      }
      state.stashIndex.gold = Math.max(0, Number(state.data.gold) || 0);
      if (els.fStashGold) els.fStashGold.value = String(state.stashIndex.gold);
      state.stashDirty = true;
      setStashDirty(true);
      setStatus("Copied character gold into stash index.", "is-ok");
    });
  }
  const btnGoldToChar = $("btn-gold-to-char");
  if (btnGoldToChar) {
    btnGoldToChar.addEventListener("click", () => {
      if (!state.data || !state.stashIndex) {
        setStatus("Need character + stash index loaded.", "is-err");
        return;
      }
      state.data.gold = Math.max(0, Number(state.stashIndex.gold) || 0);
      els.fGold.value = String(state.data.gold);
      if (els.fGoldCurrency) els.fGoldCurrency.value = String(state.data.gold);
      setDirty(true);
      setStatus("Copied stash gold onto character.", "is-ok");
    });
  }

  const btnStashApply = $("btn-stash-apply");
  if (btnStashApply) {
    btnStashApply.addEventListener("click", () => {
      try {
        if (!applyStashItemFromForm()) {
          setStatus("Select a stash item first.", "is-err");
          return;
        }
        renderStash();
        setStatus("Stash item updated.", "is-ok");
      } catch (err) {
        setStatus(err.message || String(err), "is-err");
      }
    });
  }

  const btnStashDel = $("btn-stash-del");
  if (btnStashDel) {
    btnStashDel.addEventListener("click", () => {
      const tab = activeStashTab();
      if (!tab || state.stashSelectedIndex == null) return;
      tab.savedItems.splice(state.stashSelectedIndex, 1);
      state.stashSelectedIndex = null;
      state.stashDirty = true;
      renderStash();
      setStatus("Deleted stash item.", "is-ok");
    });
  }

  const btnStashMax = $("btn-stash-max-rolls");
  if (btnStashMax) {
    btnStashMax.addEventListener("click", () => {
      const tab = activeStashTab();
      if (!tab || state.stashSelectedIndex == null) return;
      const item = tab.savedItems[state.stashSelectedIndex];
      if (!item || !Array.isArray(item.data)) return;
      const n = window.LEItems ? LEItems.maxAffixRolls(item.data) : 0;
      state.stashDirty = true;
      selectStashItem(state.stashSelectedIndex);
      setStatus(`Maxed ${n} roll byte(s).`, "is-ok");
    });
  }

  const btnStashSave = $("btn-stash-save");
  if (btnStashSave) {
    btnStashSave.addEventListener("click", () => {
      const tab = activeStashTab();
      if (!tab || !state.stashActiveKey) return;
      downloadText(state.stashActiveKey, LESave.serializeSave(tab));
      state.stashDirty = false;
      setStashDirty(false);
      setStatus("Downloaded active stash tab. Overwrite the matching file in Saves.", "is-ok");
      if (els.installModal) els.installModal.hidden = false;
    });
  }

  const btnStashBak = $("btn-stash-backup");
  if (btnStashBak) {
    btnStashBak.addEventListener("click", () => {
      const tab = activeStashTab();
      if (!tab || !state.stashActiveKey) return;
      downloadText(state.stashActiveKey + ".bak", LESave.serializeSave(tab));
      setStatus("Downloaded stash tab backup.", "is-ok");
    });
  }

  const btnStashIdx = $("btn-stash-save-index");
  if (btnStashIdx) {
    btnStashIdx.addEventListener("click", () => {
      if (!state.stashIndex) return;
      const name = state.stashIndexName || "STASH_CYCLE";
      downloadText(name, LESave.serializeSave(state.stashIndex));
      setStatus("Downloaded stash index (gold/shards/meta).", "is-ok");
    });
  }

  $("btn-max-gold").addEventListener("click", () => {
    els.fGoldCurrency.value = "99999999";
    syncGoldInputs(els.fGoldCurrency);
    setDirty(true);
  });

  $("btn-set-qty-999").addEventListener("click", () => setAllListedQuantities(999));
  $("btn-set-qty-9999").addEventListener("click", () => setAllListedQuantities(9999));

  $("btn-item-refresh").addEventListener("click", () => renderItems());
  els.itemContainerFilter.addEventListener("change", () => renderItems());
  els.itemSearch.addEventListener("input", () => renderItems());
  const btnFilterEquipped = $("btn-filter-equipped");
  if (btnFilterEquipped) {
    btnFilterEquipped.addEventListener("click", () => {
      els.itemContainerFilter.value = "equipped";
      renderItems();
    });
  }

  $("btn-item-add-toggle").addEventListener("click", () => {
    const panel = $("add-item-panel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      initAddItemPanel();
      if (window.LEExtra) LEExtra.fillUniquePicker();
    }
  });

  $("f-add-base").addEventListener("change", () => {
    fillSubSelect($("f-add-sub"), Number($("f-add-base").value));
    fillAffixPick($("f-add-affix-pick"), $("f-add-affix-search"), Number($("f-add-base").value));
  });
  $("f-add-affix-search").addEventListener("input", () => {
    fillAffixPick($("f-add-affix-pick"), $("f-add-affix-search"), Number($("f-add-base").value));
  });
  $("btn-add-affix-row").addEventListener("click", () => {
    const id = Number($("f-add-affix-pick").value);
    if (!Number.isFinite(id)) return;
    if (state.addAffixes.length >= 6) {
      setStatus("Max 6 affixes in classic pack.", "is-err");
      return;
    }
    state.addAffixes.push({ id, tier: 6, roll: 255 });
    renderAffixList($("add-affix-list"), state.addAffixes);
  });
  $("btn-item-create").addEventListener("click", () => {
    try {
      createItemFromForm();
    } catch (err) {
      setStatus(err.message || String(err), "is-err");
    }
  });

  $("f-item-base").addEventListener("change", () => {
    fillSubSelect($("f-item-sub"), Number($("f-item-base").value));
    fillAffixPick($("f-item-affix-pick"), $("f-item-affix-search"), Number($("f-item-base").value));
  });
  $("f-item-affix-search").addEventListener("input", () => {
    fillAffixPick($("f-item-affix-pick"), $("f-item-affix-search"), Number($("f-item-base").value));
  });
  $("btn-item-affix-add").addEventListener("click", () => {
    const id = Number($("f-item-affix-pick").value);
    if (!Number.isFinite(id)) return;
    if (state.editAffixes.length >= 6) {
      setStatus("Max 6 affixes.", "is-err");
      return;
    }
    state.editAffixes.push({ id, tier: 6, roll: 255 });
    renderAffixList($("item-affix-list"), state.editAffixes);
  });
  $("btn-item-affix-max").addEventListener("click", () => {
    for (const a of state.editAffixes) {
      a.tier = 7;
      a.roll = 255;
    }
    renderAffixList($("item-affix-list"), state.editAffixes);
  });
  $("btn-item-apply-affixes").addEventListener("click", () => {
    try {
      if (!applyAffixesRebuild()) {
        setStatus("Select an item first.", "is-err");
        return;
      }
      setDirty(true);
      renderItems();
      renderCurrency();
      setStatus("Rebuilt item data (classic pack).", "is-ok");
    } catch (err) {
      setStatus(err.message || String(err), "is-err");
    }
  });

  $("btn-item-apply").addEventListener("click", () => {
    try {
      if (!applyItemDetailFromForm()) {
        setStatus("Select an item first.", "is-err");
        return;
      }
      setDirty(true);
      renderItems();
      renderCurrency();
      setStatus("Item updated.", "is-ok");
    } catch (err) {
      setStatus(err.message || String(err), "is-err");
    }
  });

  $("btn-item-max-rolls-one").addEventListener("click", () => {
    if (state.selectedItemIndex == null) {
      setStatus("Select an item first.", "is-err");
      return;
    }
    const n = maxRollsForIndices([state.selectedItemIndex]);
    setDirty(true);
    showItemDetail(state.selectedItemIndex);
    renderItems();
    setStatus(n ? `Maxed ${n} roll byte(s).` : "No roll-like bytes found to max.", n ? "is-ok" : "is-err");
  });

  $("btn-item-max-rolls").addEventListener("click", () => {
    const indices = getSelectedItemIndices();
    if (!indices.length) {
      setStatus("Check one or more item rows first.", "is-err");
      return;
    }
    const n = maxRollsForIndices(indices);
    setDirty(true);
    renderItems();
    setStatus(n ? `Maxed ${n} roll byte(s) across ${indices.length} item(s).` : "No roll-like bytes found.", n ? "is-ok" : "is-err");
  });

  $("btn-item-dup").addEventListener("click", () => {
    const indices = getSelectedItemIndices();
    const src = indices.length ? indices[indices.length - 1] : state.selectedItemIndex;
    if (src == null) {
      setStatus("Select or check an item to duplicate.", "is-err");
      return;
    }
    const neu = LESave.duplicateSavedItem(state.data, src);
    if (neu < 0) return;
    state.selectedItemIndex = neu;
    setDirty(true);
    renderItems();
    renderCurrency();
    setStatus(`Duplicated item #${src} → #${neu}.`, "is-ok");
  });

  $("btn-item-del").addEventListener("click", () => {
    let indices = getSelectedItemIndices();
    if (!indices.length && state.selectedItemIndex != null) indices = [state.selectedItemIndex];
    if (!indices.length) {
      setStatus("Select or check items to delete.", "is-err");
      return;
    }
    if (!confirm(`Delete ${indices.length} item(s)?`)) return;
    const n = LESave.deleteSavedItems(state.data, indices);
    state.selectedItemIndex = null;
    setDirty(true);
    renderItems();
    renderCurrency();
    setStatus(`Deleted ${n} item(s).`, "is-ok");
  });

  $("btn-item-to-inv").addEventListener("click", () => {
    let indices = getSelectedItemIndices();
    if (!indices.length && state.selectedItemIndex != null) indices = [state.selectedItemIndex];
    if (!indices.length) {
      setStatus("Select or check items to move.", "is-err");
      return;
    }
    const n = LESave.moveSavedItemsToInventory(state.data, indices);
    setDirty(true);
    renderItems();
    setStatus(`Moved ${n} item(s) to Inventory (container 1).`, "is-ok");
  });

  $("btn-add-skill").addEventListener("click", () => {
    const id = $("f-add-skill").value;
    addSkillTree(id);
  });

  $("btn-fill-known-nodes").addEventListener("click", () => {
    if (!state.data) return;
    let total = 0;
    const passiveId = LESkills.passiveTreeIdForClass(state.data.characterClass);
    if (passiveId) {
      total += fillKnownNodesToMax(LESave.ensurePassiveTree(state.data), passiveId);
    }
    for (const tree of LESave.ensureSkillTrees(state.data)) {
      if (tree.treeID) total += fillKnownNodesToMax(tree, tree.treeID);
    }
    setDirty(true);
    renderTrees();
    setStatus(`Filled known nodes across trees (${total} updates).`, "is-ok");
  });

  fillSkillSelect();

  window.LEApp = {
    state,
    setDirty,
    setStatus,
    decodeForUi,
    rarityClass,
    bindItemTooltip,
    selectItemByIndex,
    renderAll,
    renderStash,
    activeStashTab,
    setStashDirty,
    getSelectedItemIndices,
    createItemInto,
    fillAddSubs,
  };

  // Drag & drop
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth += 1;
    els.dropOverlay.hidden = false;
  });
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) els.dropOverlay.hidden = true;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragDepth = 0;
    els.dropOverlay.hidden = true;
    const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
    if (!files.length) return;
    try {
      if (files.length > 1) {
        await loadStashFiles(files);
        return;
      }
      await loadFile(files[0]);
    } catch (err) {
      setStatus(err.message || String(err), "is-err");
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") els.installModal.hidden = true;
  });

  showEditor(false);
  setStatus("No save loaded.");
})();
