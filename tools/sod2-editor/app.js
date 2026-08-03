(() => {
  "use strict";

  const S = window.Sod2Save;
  const $ = (id) => document.getElementById(id);

  const state = {
    saves: [],
    active: 0,
    dirty: false,
    survivorIndex: 0,
    enclaveIndex: 0,
    lockerIndex: 0,
    invCategory: "ammo",
    vehicleIndex: 0,
    facilityIndex: 0,
    undoStack: [],
    filters: {
      survivors: "",
      enclaves: "",
      lockers: "",
      items: "",
      vehicles: "",
      facilities: "",
      catalog: "",
    },
  };

  function filterQuery(key) {
    return String(state.filters[key] || "")
      .trim()
      .toLowerCase();
  }

  function matchesFilter(q, ...parts) {
    if (!q) return true;
    return parts.some((p) => String(p == null ? "" : p).toLowerCase().includes(q));
  }

  function pickVisibleIndex(selected, visible) {
    if (!visible.length) return selected;
    if (visible.indexOf(selected) >= 0) return selected;
    return visible[0];
  }

  function current() {
    return state.saves[state.active] || null;
  }

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    if (current()) current().save.dirty = dirty;
    $("dirty-pill").hidden = !dirty;
    const has = state.saves.length > 0;
    $("btn-save").disabled = !has;
    $("btn-backup").disabled = !has;
    $("btn-save-all").disabled = state.saves.length < 2;
    if ($("btn-checkpoint")) $("btn-checkpoint").disabled = !has;
    if ($("btn-validate")) $("btn-validate").disabled = !has;
    if ($("btn-undo")) $("btn-undo").disabled = !has || !state.undoStack.length;
  }

  function pushCheckpoint(label) {
    const slot = current();
    if (!slot) return;
    state.undoStack.push({
      label: label || "checkpoint",
      active: state.active,
      properties: slot.save.properties.slice(),
      dirty: !!slot.save.dirty,
    });
    if (state.undoStack.length > 20) state.undoStack.shift();
    if ($("btn-undo")) $("btn-undo").disabled = false;
  }

  function applyUndo() {
    const snap = state.undoStack.pop();
    if (!snap) return;
    const slot = state.saves[snap.active];
    if (!slot) {
      setStatus("Undo target slot missing");
      return;
    }
    state.active = snap.active;
    slot.save.properties = snap.properties;
    slot.save.dirty = snap.dirty;
    // Force rediscovery
    delete slot.save.survivors;
    delete slot.save.enclaves;
    delete slot.save.inventories;
    delete slot.save.mapSites;
    delete slot.save.vehicles;
    delete slot.save.facilitySlots;
    delete slot.save.missions;
    delete slot.save.survivorBlocks;
    try {
      S.discoverCommunityFields(slot.save);
    } catch (_) {}
    refreshAll();
    setDirty(!!snap.dirty);
    setStatus("Undo: " + snap.label);
  }

  function showEditor(show) {
    $("empty-state").hidden = show;
    $("tabs").hidden = !show;
    $("slot-bar").hidden = !show || state.saves.length < 2;
    ["community", "survivors", "enclaves", "inventory", "map", "vehicles", "facilities", "presets", "diff", "scan"].forEach((id) => {
      $("panel-" + id).hidden = !show;
    });
  }

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === "panel-" + tab);
    });
    if (tab === "diff") renderDiff();
    if (tab === "enclaves") renderEnclaves();
    if (tab === "inventory") renderInventory();
    if (tab === "survivors") renderSurvivors();
    if (tab === "map") renderMapQuest();
    if (tab === "vehicles") renderVehicles();
    if (tab === "facilities") renderFacilities();
    if (tab === "presets") renderPresets();
  }

  function formatValue(v) {
    if (v == null || Number.isNaN(v)) return "";
    if (typeof v === "number" && !Number.isInteger(v)) {
      return String(Math.round(v * 1000) / 1000);
    }
    return String(v);
  }

  function renderSlots() {
    const bar = $("slot-bar");
    if (state.saves.length < 2) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    bar.hidden = false;
    bar.innerHTML = state.saves
      .map((slot, i) => {
        const active = i === state.active ? " is-active" : "";
        const dirty = slot.save.dirty ? " · edited" : "";
        return `<button type="button" class="slot-chip${active}" data-slot="${i}">${escapeHtml(
          slot.save.fileName
        )}${dirty}</button>`;
      })
      .join("");
    bar.querySelectorAll(".slot-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.active = Number(btn.dataset.slot);
        refreshAll();
        setDirty(!!current().save.dirty);
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderFieldGroup(groupId, groupName) {
    const box = $("fields-" + groupId);
    if (!box) return;
    box.innerHTML = "";
    const save = current().save;
    const defs = S.COMMUNITY_FIELDS.filter((d) => d.group === groupId);
    for (const def of defs) {
      const entry = save.fields[def.id];
      const label = document.createElement("label");
      if (!entry || !entry.available) label.classList.add("is-missing");
      const title = document.createElement("span");
      title.textContent = def.label + (entry && entry.available ? "" : " (n/a)");
      if (def.hint) title.title = def.hint;
      label.appendChild(title);
      const input = document.createElement("input");
      input.type = "number";
      input.id = "f-" + def.id;
      input.step = def.kind === "resource" || def.kind === "floatName" ? "0.1" : "1";
      if (def.min != null) input.min = String(def.min);
      if (def.max != null) input.max = String(def.max);
      input.disabled = !entry || !entry.available;
      input.value = entry && entry.available ? formatValue(entry.value) : "";
      input.addEventListener("change", () => {
        try {
          S.setFieldValue(save, def.id, input.value);
          input.value = formatValue(save.fields[def.id].value);
          setDirty(true);
          setStatus("Updated " + def.label);
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      label.appendChild(input);
      box.appendChild(label);
    }
  }

  function renderCommunityFields() {
    const save = current().save;
    renderFieldGroup("core");
    renderFieldGroup("stockpile");
    renderFieldGroup("threats");
    renderFieldGroup("morale");

    const nameEl = $("community-name");
    if (save.communityName && (save.communityName.display || save.communityName.key)) {
      nameEl.hidden = false;
      nameEl.innerHTML = "";
      const title = document.createElement("strong");
      title.textContent = "Community name";
      nameEl.appendChild(title);
      if (save.communityName.displayOff != null) {
        const input = document.createElement("input");
        input.type = "text";
        input.value = save.communityName.display || "";
        input.maxLength = 80;
        input.style.marginLeft = "0.65rem";
        input.addEventListener("change", () => {
          try {
            S.setCommunityDisplayName(save, input.value);
            setDirty(true);
            setStatus("Community name → " + (save.communityName.display || ""));
            renderCommunityFields();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        nameEl.appendChild(input);
      } else {
        const span = document.createElement("span");
        span.textContent = " (no freeform display fragment)";
        span.className = "muted";
        nameEl.appendChild(span);
      }
      if (save.communityName.key) {
        const key = document.createElement("div");
        key.className = "muted";
        key.style.marginTop = "0.35rem";
        key.innerHTML = "Loc key <code>" + escapeHtml(save.communityName.key) + "</code>";
        nameEl.appendChild(key);
      }
    } else {
      nameEl.hidden = true;
      nameEl.textContent = "";
    }

    const avail = S.COMMUNITY_FIELDS.filter((d) => save.fields[d.id] && save.fields[d.id].available).length;
    $("save-meta").textContent =
      save.fileName +
      " · " +
      save.properties.length.toLocaleString() +
      " property bytes · " +
      avail +
      "/" +
      S.COMMUNITY_FIELDS.length +
      " fields mapped" +
      (state.saves.length > 1 ? " · slot " + (state.active + 1) + "/" + state.saves.length : "");
  }

  function renderInfluenceTable() {
    const save = current().save;
    const tbody = $("influence-table").querySelector("tbody");
    tbody.innerHTML = "";
    const infl = save.fields.influence;
    if (!infl || !infl.hits.length) {
      tbody.innerHTML = '<tr><td colspan="4">No Influence fields found.</td></tr>';
      return;
    }
    infl.hits.forEach((hit, i) => {
      const tr = document.createElement("tr");
      const isCommunity = infl.hit && hit.valueOffset === infl.hit.valueOffset;
      tr.innerHTML = `<td>${i + 1}</td><td></td><td><code>0x${hit.valueOffset.toString(16)}</code></td><td>${
        isCommunity ? '<span class="tag">Community target</span>' : "Enclave / other"
      }</td>`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "9999";
      input.value = String(hit.value);
      input.addEventListener("change", () => {
        try {
          S.setInfluenceAt(save, i, input.value);
          input.value = String(save.fields.influence.hits[i].value);
          const communityInput = $("f-influence");
          if (communityInput && save.fields.influence.available) {
            communityInput.value = formatValue(save.fields.influence.value);
          }
          setDirty(true);
          setStatus("Updated Influence #" + (i + 1));
          renderDiff();
          if (save.enclaves) renderEnclaves();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      tr.children[1].appendChild(input);
      tbody.appendChild(tr);
    });
  }

  function enclaveTypeLabel(v) {
    if (!v) return "—";
    return String(v).replace(/^EEnclaveType::/, "");
  }

  function renderEnclaves() {
    const save = current().save;
    if (!save.enclaves) {
      try {
        S.discoverEnclaves(save);
      } catch (err) {
        console.warn(err);
        save.enclaves = [];
      }
    }
    renderInfluenceTable();

    const list = $("enclave-list");
    list.innerHTML = "";
    if (!save.enclaves.length) {
      list.innerHTML = '<p class="panel-note">No enclaves found (no BaseGuid + Influence pairs).</p>';
      $("enclave-title").textContent = "No enclaves";
      $("enclave-sub").textContent = "";
      $("enclave-form").hidden = true;
      return;
    }

    if (state.enclaveIndex >= save.enclaves.length) state.enclaveIndex = 0;

    const qEnc = filterQuery("enclaves");
    const visibleEnc = [];
    save.enclaves.forEach((e, i) => {
      const typeLbl = e.enclaveType ? enclaveTypeLabel(e.enclaveType.value) : "";
      if (
        !matchesFilter(
          qEnc,
          e.label,
          typeLbl,
          e.relationshipHint,
          e.isCommunity ? "community" : "",
          e.tag && e.tag.value,
          e.id && e.id.value
        )
      ) {
        return;
      }
      visibleEnc.push(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "survivor-chip" + (i === state.enclaveIndex ? " is-active" : "");
      const bits = [];
      if (e.isCommunity) bits.push("community");
      bits.push("infl " + (e.influence ? e.influence.value : "?"));
      if (e.enclaveType) bits.push(typeLbl);
      if (e.relationshipHint) bits.push(e.relationshipHint);
      btn.innerHTML = escapeHtml(e.label) + "<small>" + escapeHtml(bits.join(" · ")) + "</small>";
      btn.addEventListener("click", () => {
        state.enclaveIndex = i;
        renderEnclaves();
      });
      list.appendChild(btn);
    });
    if (!visibleEnc.length) {
      list.innerHTML = '<p class="panel-note">No enclaves match filter.</p>';
      $("enclave-form").hidden = true;
      return;
    }
    state.enclaveIndex = pickVisibleIndex(state.enclaveIndex, visibleEnc);
    list.querySelectorAll(".survivor-chip").forEach((btn, idx) => {
      btn.classList.toggle("is-active", visibleEnc[idx] === state.enclaveIndex);
    });

    const e = save.enclaves[state.enclaveIndex];
    $("enclave-title").textContent = e.label;
    $("enclave-sub").textContent =
      (e.isCommunity ? "Your community enclave · " : "") +
      (e.tag && e.tag.value && e.tag.value !== "None" ? "Tag " + e.tag.value + " · " : "") +
      (e.id ? "ID " + e.id.value : "");
    $("enclave-form").hidden = false;

    const fields = $("enclave-fields");
    fields.innerHTML = "";

    function addNumber(label, field, max) {
      if (!e[field]) return;
      const lab = document.createElement("label");
      lab.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = String(max || 9999);
      input.value = String(e[field].value);
      input.addEventListener("change", () => {
        try {
          S.setEnclaveInt(save, state.enclaveIndex, field, input.value);
          setDirty(true);
          setStatus("Updated " + label);
          renderCommunityFields();
          renderEnclaves();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      lab.appendChild(input);
      fields.appendChild(lab);
    }

    function addBool(label, field) {
      if (!e[field]) return;
      const lab = document.createElement("label");
      lab.className = "check-label";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!e[field].value;
      input.addEventListener("change", () => {
        try {
          S.setEnclaveBool(save, state.enclaveIndex, field, input.checked);
          setDirty(true);
          setStatus("Updated " + label);
          renderEnclaves();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      lab.appendChild(input);
      lab.appendChild(document.createTextNode(" " + label));
      fields.appendChild(lab);
    }

    addNumber("Influence", "influence", 9999);
    addNumber("Member departures", "departures", 9999);
    addNumber("Member deaths", "deaths", 9999);

    if (e.displayName && e.displayName.displayOff != null) {
      const lab = document.createElement("label");
      lab.textContent = "Display name";
      const input = document.createElement("input");
      input.type = "text";
      input.value = e.displayName.display || "";
      input.addEventListener("change", () => {
        try {
          S.setEnclaveDisplayName(save, state.enclaveIndex, input.value);
          setDirty(true);
          setStatus("Updated display name");
          renderEnclaves();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      lab.appendChild(input);
      fields.appendChild(lab);
    }

    if (e.enclaveType) {
      const lab = document.createElement("label");
      lab.textContent = "Enclave type";
      const sel = document.createElement("select");
      const cur = e.enclaveType.value || "";
      const opts = S.ENCLAVE_TYPES.slice();
      if (cur && !opts.includes(cur)) opts.unshift(cur);
      for (const t of opts) {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = enclaveTypeLabel(t);
        if (t === cur) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => {
        try {
          S.setEnclaveType(save, state.enclaveIndex, sel.value);
          setDirty(true);
          setStatus("Updated enclave type");
          renderEnclaves();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      lab.appendChild(sel);
      fields.appendChild(lab);
    }

    addBool("Show on map", "displayOnMap");
    addBool("Trade using prestige only", "tradesPrestige");
    addBool("Disband on any recruit", "disbandsOnRecruit");
    addBool("Hide recruitability", "hideRecruitability");

    const meta = [];
    if (e.relationshipHint) meta.push("Relationship hint: " + e.relationshipHint + " (from restock/schema path)");
    if (e.source) meta.push("Source: " + e.source.value);
    if (e.schema) meta.push("Schema: " + e.schema.value);
    if (e.restock && e.restock.value) meta.push("Restock: " + e.restock.value);
    if (e.displayName && e.displayName.locKey) meta.push("Loc key: " + e.displayName.locKey);
    if (e.description) meta.push("Description: " + e.description);
    $("enclave-meta").textContent = meta.join(" · ");
  }

  function renderItemCatalog(save, categoryId) {
    const list = $("item-catalog");
    list.innerHTML = "";
    const inv = save.inventories[state.lockerIndex];
    const seen = new Set();
    if (inv && inv.categories[categoryId]) {
      for (const c of inv.categories[categoryId].classes.items || []) {
        if (!c.path || seen.has(c.path)) continue;
        seen.add(c.path);
        const opt = document.createElement("option");
        opt.value = c.path;
        opt.label = c.shortName;
        list.appendChild(opt);
      }
    }
    for (const c of save.itemCatalog || []) {
      if (categoryId && c.categoryId !== categoryId) continue;
      if (seen.has(c.path)) continue;
      seen.add(c.path);
      const opt = document.createElement("option");
      opt.value = c.path;
      opt.label = c.shortName;
      list.appendChild(opt);
    }
  }

  function renderCatalogBrowser(save) {
    const tbody = $("item-catalog-table") && $("item-catalog-table").querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const q = filterQuery("catalog");
    const rows = (save.itemCatalog || []).filter((c) =>
      matchesFilter(q, c.shortName, c.path, c.categoryId)
    );
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="3">No catalog entries' + (q ? " match filter" : "") + ".</td></tr>";
      return;
    }
    const show = rows.slice(0, 80);
    show.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(c.shortName || "")}</td><td><code>${escapeHtml(
        c.path || ""
      )}</code></td><td class="row-actions"></td>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = "Use";
      btn.addEventListener("click", () => {
        const input = $("inv-new-class");
        if (input) {
          input.value = c.path || c.shortName || "";
          input.focus();
        }
        if (c.categoryId) {
          state.invCategory = c.categoryId;
          renderInventory();
        }
        setStatus("Filled add class: " + (c.shortName || c.path));
      });
      tr.querySelector(".row-actions").appendChild(btn);
      tbody.appendChild(tr);
    });
    if (rows.length > show.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="3">… and ' + (rows.length - show.length) + " more (refine filter)</td>";
      tbody.appendChild(tr);
    }
  }

  function renderInventory() {
    const save = current().save;
    renderCatalogBrowser(save);
    if (!save.inventories) {
      try {
        S.discoverInventories(save);
      } catch (err) {
        console.warn(err);
        save.inventories = [];
      }
    }

    const list = $("locker-list");
    list.innerHTML = "";
    if (!save.inventories.length) {
      list.innerHTML = '<p class="panel-note">No ItemLibrary lockers found.</p>';
      $("locker-title").textContent = "No lockers";
      $("locker-sub").textContent = "";
      $("inv-toolbar").hidden = true;
      $("inv-table").querySelector("tbody").innerHTML = "";
      return;
    }

    if (state.lockerIndex >= save.inventories.length) state.lockerIndex = 0;

    const qLock = filterQuery("lockers");
    const visibleLock = [];
    save.inventories.forEach((locker, i) => {
      if (!matchesFilter(qLock, locker.label, "Locker #" + (i + 1))) return;
      visibleLock.push(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "survivor-chip" + (i === state.lockerIndex ? " is-active" : "");
      btn.innerHTML =
        escapeHtml(locker.label || "Locker #" + (i + 1)) +
        "<small>" +
        locker.dataLen.toLocaleString() +
        " bytes</small>";
      btn.addEventListener("click", () => {
        state.lockerIndex = i;
        renderInventory();
      });
      list.appendChild(btn);
    });
    if (!visibleLock.length) {
      list.innerHTML = '<p class="panel-note">No lockers match filter.</p>';
      $("inv-toolbar").hidden = true;
      $("inv-table").querySelector("tbody").innerHTML = "";
      return;
    }
    state.lockerIndex = pickVisibleIndex(state.lockerIndex, visibleLock);
    list.querySelectorAll(".survivor-chip").forEach((btn, idx) => {
      btn.classList.toggle("is-active", visibleLock[idx] === state.lockerIndex);
    });

    const inv = save.inventories[state.lockerIndex];
    $("locker-title").textContent = inv.label || "Locker";
    $("locker-sub").textContent = inv.totalItems + " instances across categories";
    $("inv-toolbar").hidden = false;

    const catSelect = $("inv-category");
    const prevCat = state.invCategory;
    catSelect.innerHTML = "";
    const available = S.INVENTORY_CATEGORIES.filter((c) => inv.categories[c.id]);
    if (!available.some((c) => c.id === prevCat) && available[0]) state.invCategory = available[0].id;
    for (const c of available) {
      const opt = document.createElement("option");
      opt.value = c.id;
      const count = (inv.categories[c.id].instances && inv.categories[c.id].instances.count) || 0;
      opt.textContent = c.label + " (" + count + ")";
      if (c.id === state.invCategory) opt.selected = true;
      catSelect.appendChild(opt);
    }

    renderItemCatalog(save, state.invCategory);

    const cat = inv.categories[state.invCategory];
    const tbody = $("inv-table").querySelector("tbody");
    tbody.innerHTML = "";
    if (!cat || !cat.instances.items.length) {
      tbody.innerHTML = '<tr><td colspan="5">No items in this category.</td></tr>';
      return;
    }

    const qItems = filterQuery("items");
    let shownItems = 0;
    cat.instances.items.forEach((item, i) => {
      const cls = cat.classes.items[item.classIndex];
      const shortName = cls ? cls.shortName : "(class " + item.classIndex + ")";
      if (!matchesFilter(qItems, shortName, cls && cls.path, item.classIndex)) return;
      shownItems++;
      const tr = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.textContent = shortName;
      if (cls && cls.path) nameCell.title = cls.path;

      const qtyCell = document.createElement("td");
      if (item.stackCountOff != null) {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "999999";
        input.value = String(item.stackCount);
        input.addEventListener("change", () => {
          try {
            S.setInventoryStackCount(save, state.lockerIndex, state.invCategory, i, input.value);
            setDirty(true);
            setStatus("Updated stack");
            renderInventory();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        qtyCell.appendChild(input);
      } else if (item.durabilityOff != null) {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "999999";
        input.value = String(item.durability);
        input.title = "Durability" + (item.maxDurability != null ? " / max " + item.maxDurability : "");
        input.addEventListener("change", () => {
          try {
            S.setInventoryDurability(save, state.lockerIndex, state.invCategory, i, input.value);
            setDirty(true);
            setStatus("Updated durability");
            renderInventory();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        qtyCell.appendChild(input);
      } else {
        qtyCell.textContent = "—";
      }

      const classCell = document.createElement("td");
      const sel = document.createElement("select");
      cat.classes.items.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = String(c.index);
        opt.textContent = c.index + ": " + c.shortName;
        if (c.index === item.classIndex) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", () => {
        try {
          S.setInventoryClassIndex(save, state.lockerIndex, state.invCategory, i, sel.value);
          setDirty(true);
          setStatus("Changed item class");
          renderInventory();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      classCell.appendChild(sel);

      const act = document.createElement("td");
      act.className = "row-actions";
      const dup = document.createElement("button");
      dup.type = "button";
      dup.className = "btn";
      dup.textContent = "Dup";
      dup.addEventListener("click", () => {
        try {
          S.duplicateInventoryItem(save, state.lockerIndex, state.invCategory, i);
          setDirty(true);
          setStatus("Duplicated item");
          renderInventory();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => {
        try {
          S.removeInventoryItem(save, state.lockerIndex, state.invCategory, i);
          setDirty(true);
          setStatus("Removed item");
          renderInventory();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      act.appendChild(dup);
      act.appendChild(rm);

      tr.appendChild(document.createElement("td")).textContent = String(i + 1);
      tr.appendChild(nameCell);
      tr.appendChild(qtyCell);
      tr.appendChild(classCell);
      tr.appendChild(act);
      tbody.appendChild(tr);
    });
    if (!shownItems) {
      tbody.innerHTML = '<tr><td colspan="5">No items match filter.</td></tr>';
    }
  }

  function renderTraitCatalog() {
    const save = current().save;
    const list = $("trait-catalog");
    list.innerHTML = "";
    for (const id of save.traitCatalog || []) {
      const opt = document.createElement("option");
      opt.value = id;
      list.appendChild(opt);
    }
  }

  function renderSkillCatalog() {
    const save = current().save;
    const list = $("skill-catalog");
    if (!list) return;
    list.innerHTML = "";
    for (const id of save.skillCatalog || S.COMMON_SKILLS || []) {
      const opt = document.createElement("option");
      opt.value = id;
      list.appendChild(opt);
    }
  }

  function renderSurvivorIdentityVitals(save, survivor) {
    const idBox = $("surv-identity-fields");
    const vitBox = $("surv-vitals-fields");
    if (!idBox || !vitBox) return;
    idBox.innerHTML = "";
    vitBox.innerHTML = "";
    const id = survivor.identity || {};
    const vit = survivor.vitals || {};
    const cats = save.survivorCatalogs || {};

    function addText(box, label, value, disabled, onChange) {
      const wrap = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = label;
      wrap.appendChild(title);
      const input = document.createElement("input");
      input.type = "text";
      input.value = value == null ? "" : String(value);
      input.disabled = !!disabled;
      if (!disabled) {
        input.addEventListener("change", () => {
          try {
            onChange(input.value);
            setDirty(true);
            renderSurvivors();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
      }
      wrap.appendChild(input);
      box.appendChild(wrap);
    }

    function addNum(box, label, value, disabled, onChange, opts) {
      opts = opts || {};
      const wrap = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = label;
      wrap.appendChild(title);
      const input = document.createElement("input");
      input.type = "number";
      if (opts.min != null) input.min = String(opts.min);
      if (opts.max != null) input.max = String(opts.max);
      input.step = opts.step || "1";
      input.value = value == null ? "" : formatValue(value);
      input.disabled = !!disabled;
      if (!disabled) {
        input.addEventListener("change", () => {
          try {
            onChange(input.value);
            setDirty(true);
            setStatus(label + " updated");
            renderSurvivors();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
      }
      wrap.appendChild(input);
      box.appendChild(wrap);
    }

    function addSelect(box, label, value, options, disabled, onChange) {
      const wrap = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = label;
      wrap.appendChild(title);
      const sel = document.createElement("select");
      const opts = options && options.length ? options.slice() : value ? [value] : [];
      if (value && !opts.includes(value)) opts.unshift(value);
      for (const optVal of opts) {
        const opt = document.createElement("option");
        opt.value = optVal;
        opt.textContent = S.survivorEnumLabel ? S.survivorEnumLabel(optVal) : optVal;
        if (optVal === value) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.disabled = !!disabled || !opts.length;
      if (!disabled) {
        sel.addEventListener("change", () => {
          try {
            onChange(sel.value);
            setDirty(true);
            setStatus(label + " updated");
            renderSurvivors();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
      }
      wrap.appendChild(sel);
      box.appendChild(wrap);
    }

    function addCheck(box, label, value, disabled, onChange) {
      const wrap = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = label;
      wrap.appendChild(title);
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!value;
      input.disabled = !!disabled;
      if (!disabled) {
        input.addEventListener("change", () => {
          try {
            onChange(input.checked);
            setDirty(true);
            setStatus(label + " updated");
            renderSurvivors();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
      }
      wrap.appendChild(input);
      box.appendChild(wrap);
    }

    addText(idBox, "First name", survivor.firstName, !id.firstNameEditable, (v) => {
      S.setSurvivorDisplayName(save, state.survivorIndex, "first", v);
      setStatus("First name → " + v);
    });
    addText(idBox, "Last name", survivor.lastName, !id.lastNameEditable, (v) => {
      S.setSurvivorDisplayName(save, state.survivorIndex, "last", v);
      setStatus("Last name → " + v);
    });
    addText(idBox, "Nickname", survivor.nickName || "", !id.nickNameEditable, (v) => {
      S.setSurvivorDisplayName(save, state.survivorIndex, "nick", v);
      setStatus("Nickname → " + v);
    });

    addSelect(idBox, "Voice", id.voice && id.voice.value, cats.voices || [], !id.voice, (v) => {
      S.setSurvivorIdentityName(save, state.survivorIndex, "voice", v);
    });
    addSelect(idBox, "Culture", id.culture && id.culture.value, cats.cultures || [], !id.culture, (v) => {
      S.setSurvivorIdentityName(save, state.survivorIndex, "culture", v);
    });
    addSelect(
      idBox,
      "Body / outfit def",
      id.humanDefinition && id.humanDefinition.value,
      cats.humans || [],
      !id.humanDefinition,
      (v) => {
        S.setSurvivorIdentityName(save, state.survivorIndex, "humanDefinition", v);
      }
    );
    addSelect(idBox, "Hero bonus", id.heroBonus && id.heroBonus.value, cats.heroes || [], !id.heroBonus, (v) => {
      S.setSurvivorIdentityName(save, state.survivorIndex, "heroBonus", v);
    });
    addSelect(idBox, "Leader type", id.leaderType && id.leaderType.value, cats.leaders || S.LEADER_TYPES || [], !id.leaderType, (v) => {
      S.setSurvivorIdentityName(save, state.survivorIndex, "leaderType", v);
    });
    addSelect(idBox, "Hat outfit", id.hat && id.hat.value, cats.hats || [], !id.hat, (v) => {
      S.setSurvivorIdentityName(save, state.survivorIndex, "hat", v);
    });
    addSelect(idBox, "Body outfit", id.body && id.body.value, cats.bodies || [], !id.body, (v) => {
      S.setSurvivorIdentityName(save, state.survivorIndex, "body", v);
    });
    addSelect(idBox, "Archetype", id.archetype && id.archetype.value, cats.archetypes || [], !id.archetype, (v) => {
      S.setSurvivorIdentityName(save, state.survivorIndex, "archetype", v);
    });
    addSelect(idBox, "Age", id.ageRange && id.ageRange.value, cats.ages || S.AGE_LEVELS || [], !id.ageRange, (v) => {
      S.setSurvivorEnum(save, state.survivorIndex, "ageRange", v);
    });
    addSelect(idBox, "Pronoun", id.pronoun && id.pronoun.value, cats.pronouns || S.PRONOUNS || [], !id.pronoun, (v) => {
      S.setSurvivorEnum(save, state.survivorIndex, "pronoun", v);
    });
    addSelect(
      idBox,
      "Standing",
      id.standingLevel && id.standingLevel.value,
      cats.standings || S.STANDING_LEVELS || [],
      !id.standingLevel,
      (v) => {
        S.setSurvivorEnum(save, state.survivorIndex, "standingLevel", v);
      }
    );
    addCheck(idBox, "Male", id.isMale && id.isMale.value, !id.isMale, (v) => {
      S.setSurvivorBool(save, state.survivorIndex, "isMale", v);
    });
    addCheck(idBox, "Homosexual", id.isHomosexual && id.isHomosexual.value, !id.isHomosexual, (v) => {
      S.setSurvivorBool(save, state.survivorIndex, "isHomosexual", v);
    });
    addCheck(idBox, "Recruitable", id.isRecruitable && id.isRecruitable.value, !id.isRecruitable, (v) => {
      S.setSurvivorBool(save, state.survivorIndex, "isRecruitable", v);
    });

    addNum(vitBox, "Health", vit.health && vit.health.value, !vit.health, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "health", v);
    });
    addNum(vitBox, "Stamina", vit.stamina && vit.stamina.value, !vit.stamina, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "stamina", v);
    });
    addNum(vitBox, "Fatigue (rest / tiredness)", vit.fatigue && vit.fatigue.value, !vit.fatigue, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "fatigue", v);
    });
    addNum(vitBox, "Painkiller addiction", vit.painkillers && vit.painkillers.value, !vit.painkillers, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "painkillers", v);
    });
    addNum(vitBox, "Stimulant addiction", vit.stimulants && vit.stimulants.value, !vit.stimulants, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "stimulants", v);
    });
    addNum(vitBox, "Sickness", vit.sickness && vit.sickness.value, !vit.sickness, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "sickness", v);
    });
    addNum(vitBox, "Plague timer", vit.plagueTimer && vit.plagueTimer.value, !vit.plagueTimer, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "plagueTimer", v);
    });
    addNum(vitBox, "Plague rate", vit.plagueRate && vit.plagueRate.value, !vit.plagueRate, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "plagueRate", v);
    });
    addNum(vitBox, "Trauma", vit.trauma && vit.trauma.value, !vit.trauma, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "trauma", v);
    });
    addNum(vitBox, "Injury recovery", vit.injuryRecovery && vit.injuryRecovery.value, !vit.injuryRecovery, (v) => {
      S.setSurvivorVitalFloat(save, state.survivorIndex, "injuryRecovery", v);
    });
    addNum(
      vitBox,
      "Standing progress",
      vit.standingProgress && vit.standingProgress.value,
      !vit.standingProgress,
      (v) => {
        S.setSurvivorVitalFloat(save, state.survivorIndex, "standingProgress", v);
      },
      { min: 0, max: 1, step: "0.01" }
    );
    addNum(vitBox, "Zombies killed", vit.zombiesKilled && vit.zombiesKilled.value, !vit.zombiesKilled, (v) => {
      S.setSurvivorZombiesKilled(save, state.survivorIndex, v);
    });
    addCheck(vitBox, "Dead", vit.isDead && vit.isDead.value, !vit.isDead, (v) => {
      S.setSurvivorBool(save, state.survivorIndex, "isDead", v);
    });
    addCheck(vitBox, "Departed", vit.isDeparted && vit.isDeparted.value, !vit.isDeparted, (v) => {
      S.setSurvivorBool(save, state.survivorIndex, "isDeparted", v);
    });
  }

  function renderSurvivors() {
    const save = current().save;
    if (!save.survivors) S.discoverSurvivors(save);
    else if (S.attachSkillsToSurvivors && (!save.survivors[0] || !save.survivors[0].skills)) {
      S.attachSkillsToSurvivors(save);
    }
    if (!save.inventories && S.discoverInventories) {
      try {
        S.discoverInventories(save);
      } catch (err) {
        console.warn(err);
      }
    }
    if (S.attachSurvivorInventories && save.survivors[0] && !save.survivors[0].equipmentSlots) {
      try {
        S.attachSurvivorInventories(save);
      } catch (err) {
        console.warn(err);
      }
    }
    renderTraitCatalog();
    renderSkillCatalog();

    const list = $("survivor-list");
    list.innerHTML = "";
    if (!save.survivors.length) {
      list.innerHTML = "<p class=\"panel-note\">No survivors with Traits arrays found.</p>";
      $("survivor-title").textContent = "No survivors";
      $("survivor-sub").textContent = "";
      $("trait-table").querySelector("tbody").innerHTML = "";
      $("skill-table").querySelector("tbody").innerHTML = "";
      if ($("equip-table")) $("equip-table").querySelector("tbody").innerHTML = "";
      if ($("bag-table")) $("bag-table").querySelector("tbody").innerHTML = "";
      if ($("surv-identity-fields")) $("surv-identity-fields").innerHTML = "";
      if ($("surv-vitals-fields")) $("surv-vitals-fields").innerHTML = "";
      if ($("surv-detail-actions")) $("surv-detail-actions").hidden = true;
      $("btn-add-trait").disabled = true;
      $("btn-add-skill").disabled = true;
      $("btn-max-skills").disabled = true;
      return;
    }

    if (state.survivorIndex >= save.survivors.length) state.survivorIndex = 0;

    const qSurv = filterQuery("survivors");
    const visibleSurv = [];
    save.survivors.forEach((s, i) => {
      const skillCount = (s.skills && s.skills.length) || 0;
      const bagFilled = (s.bagSlots || []).filter((x) => x.itemIndex >= 0).length;
      const hp = s.vitals && s.vitals.health ? Math.round(s.vitals.health.value) : "—";
      const standing =
        s.identity && s.identity.standingLevel && s.identity.standingLevel.value
          ? s.identity.standingLevel.value
          : "";
      const hero =
        s.identity && s.identity.heroBonus && s.identity.heroBonus.value
          ? s.identity.heroBonus.value
          : "";
      const traitIds = (s.traits || []).map((t) => t.id || t.resourceId || "").join(" ");
      if (!matchesFilter(qSurv, s.displayName, standing, hero, traitIds, hp)) return;
      visibleSurv.push(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "survivor-chip" + (i === state.survivorIndex ? " is-active" : "");
      btn.innerHTML =
        escapeHtml(s.displayName) +
        "<small>HP " +
        hp +
        " · " +
        s.traits.length +
        " traits · " +
        skillCount +
        " skills · " +
        bagFilled +
        " bag</small>";
      btn.addEventListener("click", () => {
        state.survivorIndex = i;
        renderSurvivors();
      });
      list.appendChild(btn);
    });
    if (!visibleSurv.length) {
      list.innerHTML = '<p class="panel-note">No survivors match filter.</p>';
      $("btn-add-trait").disabled = true;
      $("btn-add-skill").disabled = true;
      $("btn-max-skills").disabled = true;
      if ($("surv-detail-actions")) $("surv-detail-actions").hidden = true;
      return;
    }
    state.survivorIndex = pickVisibleIndex(state.survivorIndex, visibleSurv);
    list.querySelectorAll(".survivor-chip").forEach((btn, idx) => {
      btn.classList.toggle("is-active", visibleSurv[idx] === state.survivorIndex);
    });

    const survivor = save.survivors[state.survivorIndex];
    if (S.attachVitalsToSurvivors && !survivor.vitals) {
      try {
        S.attachVitalsToSurvivors(save);
      } catch (err) {
        console.warn(err);
      }
    }
    const bagFilled = (survivor.bagSlots || []).filter((x) => x.itemIndex >= 0).length;
    $("survivor-title").textContent = survivor.displayName;
    $("survivor-sub").textContent =
      (survivor.nickName ? '"' + survivor.nickName + '" · ' : "") +
      survivor.traits.length +
      " traits · " +
      ((survivor.skills && survivor.skills.length) || 0) +
      " skills · " +
      bagFilled +
      "/" +
      ((survivor.bagSlots && survivor.bagSlots.length) || 0) +
      " bag slots" +
      (survivor.rosterArrayIndex >= 0 ? " · roster #" + (survivor.rosterArrayIndex + 1) : "");
    if ($("surv-detail-actions")) $("surv-detail-actions").hidden = false;
    const xfer = $("surv-transfer-target");
    if (xfer && S.listSurvivorRosterTargets) {
      try {
        if (!save.survivorBlocks && S.discoverSurvivorRoster) S.discoverSurvivorRoster(save);
      } catch (_) {}
      const targets = S.listSurvivorRosterTargets(save);
      xfer.innerHTML = "";
      targets.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = String(t.index);
        opt.textContent = t.label;
        if (t.index === survivor.rosterArrayIndex) opt.selected = true;
        xfer.appendChild(opt);
      });
      xfer.disabled = !targets.length || survivor.blockIndex < 0;
    }
    const canRoster = survivor.blockIndex >= 0;
    if ($("btn-surv-dup")) $("btn-surv-dup").disabled = !canRoster;
    if ($("btn-surv-del")) $("btn-surv-del").disabled = !canRoster;
    if ($("btn-surv-transfer")) $("btn-surv-transfer").disabled = !canRoster;
    $("btn-add-trait").disabled = false;
    $("btn-add-skill").disabled = !(survivor.skills && survivor.skillsOffset != null);
    $("btn-max-skills").disabled = !(survivor.skills && survivor.skills.length);

    renderSurvivorIdentityVitals(save, survivor);

    const tbody = $("trait-table").querySelector("tbody");
    tbody.innerHTML = "";
    survivor.traits.forEach((trait, ti) => {
      const tr = document.createElement("tr");
      const tdIdx = document.createElement("td");
      tdIdx.textContent = String(ti + 1);
      const tdId = document.createElement("td");
      const input = document.createElement("input");
      input.className = "trait-row-input";
      input.type = "text";
      input.setAttribute("list", "trait-catalog");
      input.value = trait.id;
      input.addEventListener("change", () => {
        try {
          S.setSurvivorTraitId(save, state.survivorIndex, ti, input.value);
          setDirty(true);
          setStatus("Updated trait on " + survivor.displayName);
          renderSurvivors();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
          input.value = trait.id;
        }
      });
      tdId.appendChild(input);
      const tdAct = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "trait-actions";
      const btnApply = document.createElement("button");
      btnApply.type = "button";
      btnApply.className = "btn";
      btnApply.textContent = "Set";
      btnApply.addEventListener("click", () => {
        input.dispatchEvent(new Event("change"));
      });
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn--danger";
      btnDel.textContent = "Remove";
      btnDel.addEventListener("click", () => {
        try {
          S.removeSurvivorTrait(save, state.survivorIndex, ti);
          setDirty(true);
          setStatus("Removed trait from " + survivor.displayName);
          renderSurvivors();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      actions.appendChild(btnApply);
      actions.appendChild(btnDel);
      tdAct.appendChild(actions);
      tr.appendChild(tdIdx);
      tr.appendChild(tdId);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });

    const skillBody = $("skill-table").querySelector("tbody");
    skillBody.innerHTML = "";
    const skills = survivor.skills || [];
    if (!skills.length) {
      skillBody.innerHTML = '<tr><td colspan="5">No Skills array found for this survivor.</td></tr>';
    }
    skills.forEach((skill, si) => {
      const tr = document.createElement("tr");

      const tdIdx = document.createElement("td");
      tdIdx.textContent = String(si + 1);

      const tdId = document.createElement("td");
      const idInput = document.createElement("input");
      idInput.className = "trait-row-input";
      idInput.type = "text";
      idInput.setAttribute("list", "skill-catalog");
      idInput.value = skill.id;
      idInput.addEventListener("change", () => {
        try {
          S.setSkillId(save, state.survivorIndex, si, idInput.value);
          setDirty(true);
          setStatus("Updated skill ID on " + survivor.displayName);
          renderSurvivors();
        } catch (err) {
          setStatus(err.message || String(err));
          idInput.value = skill.id;
        }
      });
      tdId.appendChild(idInput);

      const tdLvl = document.createElement("td");
      const lvlInput = document.createElement("input");
      lvlInput.className = "trait-row-input";
      lvlInput.type = "number";
      lvlInput.min = "0";
      lvlInput.max = "99";
      lvlInput.value = skill.level != null ? String(skill.level) : "";
      lvlInput.addEventListener("change", () => {
        try {
          S.setSkillLevel(save, state.survivorIndex, si, lvlInput.value);
          setDirty(true);
          setStatus("Updated " + skill.id + " level");
          renderSurvivors();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      tdLvl.appendChild(lvlInput);

      const tdXp = document.createElement("td");
      const xpInput = document.createElement("input");
      xpInput.className = "trait-row-input";
      xpInput.type = "number";
      xpInput.min = "0";
      xpInput.step = "0.1";
      xpInput.value = skill.xp != null ? formatValue(skill.xp) : "";
      xpInput.addEventListener("change", () => {
        try {
          S.setSkillXp(save, state.survivorIndex, si, xpInput.value);
          setDirty(true);
          setStatus("Updated " + skill.id + " XP");
          renderSurvivors();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      tdXp.appendChild(xpInput);

      const tdAct = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "trait-actions";
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn--danger";
      btnDel.textContent = "Remove";
      btnDel.addEventListener("click", () => {
        try {
          S.removeSkill(save, state.survivorIndex, si);
          setDirty(true);
          setStatus("Removed skill from " + survivor.displayName);
          renderSurvivors();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      actions.appendChild(btnDel);
      tdAct.appendChild(actions);

      tr.appendChild(tdIdx);
      tr.appendChild(tdId);
      tr.appendChild(tdLvl);
      tr.appendChild(tdXp);
      tr.appendChild(tdAct);
      skillBody.appendChild(tr);
    });

    renderSurvivorSlots(save, survivor);
  }

  function slotItemLabel(resolved) {
    if (!resolved || resolved.empty) return "(empty)";
    const bits = [resolved.name || "Item"];
    if (resolved.stackCount != null) bits.push("×" + resolved.stackCount);
    if (resolved.durability != null) bits.push("dur " + resolved.durability);
    return bits.join(" · ");
  }

  function renderSurvivorSlots(save, survivor) {
    const equipBody = $("equip-table") && $("equip-table").querySelector("tbody");
    const bagBody = $("bag-table") && $("bag-table").querySelector("tbody");
    if (!equipBody || !bagBody) return;
    equipBody.innerHTML = "";
    bagBody.innerHTML = "";

    if (!survivor.equipmentSlots && !survivor.bagSlots) {
      equipBody.innerHTML = '<tr><td colspan="4">No equipment data on this survivor.</td></tr>';
      bagBody.innerHTML = '<tr><td colspan="4">No bag inventory found.</td></tr>';
      return;
    }

    function bindIndexInput(input, target, previous) {
      input.addEventListener("change", () => {
        try {
          S.setSurvivorItemIndex(save, state.survivorIndex, target, input.value);
          setDirty(true);
          setStatus("Updated survivor slot");
          renderSurvivors();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
          input.value = String(previous);
        }
      });
    }

    (survivor.equipmentSlots || []).forEach((slot) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(slot.label)}</td><td></td><td></td><td class="row-actions"></td>`;
      tr.children[1].textContent = slotItemLabel(slot.resolved);
      if (slot.resolved && slot.resolved.path) tr.children[1].title = slot.resolved.path;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "-1";
      input.value = String(slot.itemIndex);
      input.disabled = slot.itemIndexOff == null;
      bindIndexInput(input, { kind: "equipment", id: slot.id }, slot.itemIndex);
      tr.children[2].appendChild(input);

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "btn";
      clear.textContent = "Clear";
      clear.disabled = slot.itemIndexOff == null || slot.itemIndex < 0;
      clear.addEventListener("click", () => {
        try {
          S.clearSurvivorSlot(save, state.survivorIndex, { kind: "equipment", id: slot.id });
          setDirty(true);
          setStatus("Cleared " + slot.label);
          renderSurvivors();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      tr.children[3].appendChild(clear);
      equipBody.appendChild(tr);
    });

    if (!(survivor.bagSlots && survivor.bagSlots.length)) {
      bagBody.innerHTML = '<tr><td colspan="4">No bag slots.</td></tr>';
      return;
    }

    survivor.bagSlots.forEach((slot) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${slot.index + 1}</td><td></td><td></td><td class="row-actions"></td>`;
      tr.children[1].textContent = slotItemLabel(slot.resolved);
      if (slot.resolved && slot.resolved.path) tr.children[1].title = slot.resolved.path;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "-1";
      input.value = String(slot.itemIndex);
      input.disabled = slot.itemIndexOff == null;
      bindIndexInput(input, { kind: "bag", index: slot.index }, slot.itemIndex);
      tr.children[2].appendChild(input);

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "btn";
      clear.textContent = "Clear";
      clear.disabled = slot.itemIndexOff == null || slot.itemIndex < 0;
      clear.addEventListener("click", () => {
        try {
          S.clearSurvivorSlot(save, state.survivorIndex, { kind: "bag", index: slot.index });
          setDirty(true);
          setStatus("Cleared bag slot");
          renderSurvivors();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      tr.children[3].appendChild(clear);
      bagBody.appendChild(tr);
    });
  }

  function renderMapQuest() {
    const save = current() && current().save;
    if (!save) return;
    if (!save.mapSites && S.discoverMapQuest) {
      try {
        S.discoverMapQuest(save);
      } catch (err) {
        console.warn(err);
        save.mapSites = [];
        save.radioCommands = [];
        save.missions = [];
      }
    }

    const stats = save.mapSiteStats || { total: 0, byLevel: {} };
    const levelBits = Object.keys(stats.byLevel || {})
      .map((k) => S.scoutedLevelLabel(k) + " " + stats.byLevel[k])
      .join(" · ");
    const summary = $("map-summary");
    if (summary) {
      summary.hidden = false;
      summary.innerHTML =
        "<strong>" +
        (stats.total || 0) +
        " map sites</strong> " +
        escapeHtml(levelBits || "none") +
        " · <strong>" +
        ((save.radioCommands && save.radioCommands.length) || 0) +
        " radio cmds</strong> · <strong>" +
        ((save.missions && save.missions.length) || 0) +
        " active</strong> / " +
        ((save.completedMissions && save.completedMissions.length) || 0) +
        " completed · claimed outposts: " +
        (stats.claimed || 0) +
        " · infested: " +
        (stats.infested || 0) +
        " · maps scouted flag: " +
        (save.areMapsScouted ? (save.areMapsScouted.value ? "true" : "false") : "n/a");
    }

    const siteBody = $("map-site-table").querySelector("tbody");
    siteBody.innerHTML = "";
    const sites = save.mapSites || [];
    if (!sites.length) {
      siteBody.innerHTML = '<tr><td colspan="5">No MapSiteSaves found.</td></tr>';
    } else {
      // Show a compact sample: first 40 + note
      const show = sites.slice(0, 40);
      show.forEach((site) => {
        const tr = document.createElement("tr");
        const sel = document.createElement("select");
        for (const lvl of S.SCOUTED_LEVELS) {
          const opt = document.createElement("option");
          opt.value = lvl;
          opt.textContent = S.scoutedLevelLabel(lvl);
          if (lvl === site.scoutedLevel) opt.selected = true;
          sel.appendChild(opt);
        }
        if (site.scoutedLevel && !S.SCOUTED_LEVELS.includes(site.scoutedLevel)) {
          const opt = document.createElement("option");
          opt.value = site.scoutedLevel;
          opt.textContent = S.scoutedLevelLabel(site.scoutedLevel);
          opt.selected = true;
          sel.appendChild(opt);
        }
        sel.disabled = !site.scouted;
        sel.addEventListener("change", () => {
          try {
            S.setSiteScoutedLevel(save, site.index, sel.value);
            setDirty(true);
            setStatus("Updated site #" + (site.index + 1));
            renderMapQuest();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });

        function boolCell(field, prop) {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = !!(prop && prop.value);
          input.disabled = !prop || prop.valueOff == null;
          input.addEventListener("change", () => {
            try {
              S.setSiteBool(save, site.index, field, input.checked);
              setDirty(true);
              setStatus("Updated site #" + (site.index + 1) + " " + field);
              renderMapQuest();
            } catch (err) {
              setStatus(err.message || String(err));
            }
          });
          return input;
        }

        tr.innerHTML = `<td>${site.index + 1}</td><td></td><td></td><td></td><td></td>`;
        tr.children[1].appendChild(sel);
        const outInput = document.createElement("input");
        outInput.type = "text";
        outInput.value = site.outpostId && site.outpostId !== "None" ? site.outpostId : "";
        outInput.placeholder = "None";
        outInput.disabled = !site.outpostIdProp;
        outInput.title = "OutpostId name (empty = abandon)";
        outInput.addEventListener("change", () => {
          try {
            S.setSiteOutpostId(save, site.index, outInput.value.trim() || "None");
            setDirty(true);
            setStatus("Outpost ID updated for site #" + (site.index + 1));
            renderMapQuest();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        tr.children[2].appendChild(outInput);
        tr.children[3].appendChild(boolCell("surveyingComplete", site.surveyingComplete));
        tr.children[4].appendChild(boolCell("infestedOutpost", site.infestedOutpost));
        siteBody.appendChild(tr);
      });
      if (sites.length > show.length) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td colspan="5">… and ' +
          (sites.length - show.length) +
          " more (use Reveal all / Clear infest to change every site)</td>";
        siteBody.appendChild(tr);
      }
    }

    const radioBody = $("radio-table").querySelector("tbody");
    radioBody.innerHTML = "";
    const radios = save.radioCommands || [];
    if (!radios.length) {
      radioBody.innerHTML = '<tr><td colspan="4">No radio Availability list found.</td></tr>';
    } else {
      const show = radios.slice(0, 50);
      show.forEach((cmd) => {
        const tr = document.createElement("tr");
        const charges = document.createElement("input");
        charges.type = "number";
        charges.min = "0";
        charges.max = "9999";
        charges.value = String(cmd.charges != null ? cmd.charges : 0);
        charges.disabled = cmd.chargesOff == null;
        charges.addEventListener("change", () => {
          try {
            writeRadioCharge(save, cmd, charges.value);
            setDirty(true);
            setStatus("Updated charges for " + cmd.id);
            renderMapQuest();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        const cd = document.createElement("input");
        cd.type = "number";
        cd.min = "0";
        cd.step = "0.1";
        cd.value = formatValue(cmd.cooldown != null ? cmd.cooldown : 0);
        cd.disabled = cmd.cooldownOff == null;
        cd.addEventListener("change", () => {
          try {
            writeRadioCooldown(save, cmd, cd.value);
            setDirty(true);
            setStatus("Updated cooldown for " + cmd.id);
            renderMapQuest();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        tr.innerHTML = `<td>${cmd.index + 1}</td><td><code>${escapeHtml(cmd.id || "")}</code></td><td></td><td></td>`;
        tr.children[2].appendChild(charges);
        tr.children[3].appendChild(cd);
        radioBody.appendChild(tr);
      });
      if (radios.length > show.length) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td colspan="4">… and ' +
          (radios.length - show.length) +
          " more (bulk buttons affect all)</td>";
        radioBody.appendChild(tr);
      }
    }

    const missionBody = $("mission-table").querySelector("tbody");
    missionBody.innerHTML = "";
    const missions = save.missions || [];
    if (!missions.length) {
      missionBody.innerHTML = '<tr><td colspan="4">No active loose missions.</td></tr>';
    } else {
      missions.forEach((m) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${m.index + 1}</td><td>${escapeHtml(m.label || "")}</td><td><code>${escapeHtml(
          m.assetName || ""
        )}</code></td><td class="row-actions"></td>`;
        const act = tr.querySelector(".row-actions");
        const btnDone = document.createElement("button");
        btnDone.type = "button";
        btnDone.className = "btn btn--accent";
        btnDone.textContent = "Complete";
        btnDone.addEventListener("click", () => {
          try {
            const r = S.completeLooseMission(save, m.index);
            setDirty(true);
            setStatus("Completed mission · " + r.remaining + " active · " + r.completed + " in log");
            renderMapQuest();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        const btnDrop = document.createElement("button");
        btnDrop.type = "button";
        btnDrop.className = "btn";
        btnDrop.textContent = "Dismiss";
        btnDrop.addEventListener("click", () => {
          try {
            S.removeLooseMission(save, m.index);
            setDirty(true);
            setStatus("Dismissed mission");
            renderMapQuest();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        act.appendChild(btnDone);
        act.appendChild(btnDrop);
        missionBody.appendChild(tr);
      });
    }

    const doneSummary = $("completed-mission-summary");
    const doneBody = $("completed-mission-table") && $("completed-mission-table").querySelector("tbody");
    const completed = save.completedMissions || [];
    if (doneSummary) {
      doneSummary.hidden = false;
      doneSummary.innerHTML = "<strong>" + completed.length + " completed</strong> mission IDs in save log";
    }
    if (doneBody) {
      doneBody.innerHTML = "";
      if (!completed.length) {
        doneBody.innerHTML = '<tr><td colspan="3">No CompletedMissions entries.</td></tr>';
      } else {
        const show = completed.slice(0, 40);
        show.forEach((m) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${m.index + 1}</td><td>${escapeHtml(m.label || "")}</td><td><code>${escapeHtml(
            m.assetName || ""
          )}</code></td>`;
          doneBody.appendChild(tr);
        });
        if (completed.length > show.length) {
          const tr = document.createElement("tr");
          tr.innerHTML =
            '<td colspan="3">… and ' + (completed.length - show.length) + " more</td>";
          doneBody.appendChild(tr);
        }
      }
    }
  }

  function pct(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return Math.round(v * 100) + "%";
  }

  function renderVehicles() {
    const save = current() && current().save;
    if (!save) return;
    if (!save.vehicles && S.discoverVehicles) {
      try {
        if (S.discoverInventories && !save.inventories) S.discoverInventories(save);
        S.discoverVehicles(save);
      } catch (err) {
        console.warn(err);
        save.vehicles = [];
        save.vehicleClasses = [];
      }
    }

    const vehicles = save.vehicles || [];
    const summary = $("veh-summary");
    if (summary) {
      summary.hidden = false;
      summary.innerHTML =
        "<strong>" +
        vehicles.length +
        " vehicles</strong> · " +
        ((save.vehicleClasses && save.vehicleClasses.length) || 0) +
        " class paths · trunk library: " +
        (save.vehicleTrunkLibraryIndex != null ? "#" + (save.vehicleTrunkLibraryIndex + 1) : "n/a");
    }

    const list = $("veh-list");
    list.innerHTML = "";
    if (!vehicles.length) {
      list.innerHTML = '<p class="panel-note">No VehicleSaves in this file.</p>';
      $("veh-title").textContent = "No vehicles";
      $("veh-sub").textContent = "";
      $("veh-fields").innerHTML = "";
      $("veh-trunk-table").querySelector("tbody").innerHTML = "";
      $("veh-detail-actions").hidden = true;
      if ($("veh-extra-toolbar")) $("veh-extra-toolbar").hidden = true;
      return;
    }

    if (state.vehicleIndex >= vehicles.length) state.vehicleIndex = 0;

    const qVeh = filterQuery("vehicles");
    const visibleVeh = [];
    vehicles.forEach((v, i) => {
      const scout = S.vehicleScoutedLevelLabel(v.scoutedLevel);
      if (!matchesFilter(qVeh, v.shortName, v.classPath, v.guidHex, scout, "Vehicle " + (i + 1))) return;
      visibleVeh.push(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "survivor-chip" + (i === state.vehicleIndex ? " is-active" : "");
      btn.innerHTML =
        "<strong>" +
        escapeHtml(v.shortName || "Vehicle " + (i + 1)) +
        "</strong><span>" +
        pct(v.fuel) +
        " fuel · " +
        pct(v.engine) +
        " eng · " +
        scout +
        "</span>";
      btn.addEventListener("click", () => {
        state.vehicleIndex = i;
        renderVehicles();
      });
      list.appendChild(btn);
    });
    if (!visibleVeh.length) {
      list.innerHTML = '<p class="panel-note">No vehicles match filter.</p>';
      $("veh-fields").innerHTML = "";
      $("veh-trunk-table").querySelector("tbody").innerHTML = "";
      $("veh-detail-actions").hidden = true;
      if ($("veh-extra-toolbar")) $("veh-extra-toolbar").hidden = true;
      return;
    }
    state.vehicleIndex = pickVisibleIndex(state.vehicleIndex, visibleVeh);
    list.querySelectorAll(".survivor-chip").forEach((btn, idx) => {
      btn.classList.toggle("is-active", visibleVeh[idx] === state.vehicleIndex);
    });

    const v = vehicles[state.vehicleIndex];
    $("veh-detail-actions").hidden = false;
    $("veh-title").textContent = v.shortName || "Vehicle #" + (v.index + 1);
    $("veh-sub").textContent =
      (v.classPath || "") +
      (v.guidHex ? " · " + v.guidHex.slice(0, 8) + "…" : "") +
      " · trunk " +
      v.filledSlots +
      "/" +
      ((v.trunk && v.trunk.slots && v.trunk.slots.length) || 0);

    const fields = $("veh-fields");
    fields.innerHTML = "";

    function addNum(label, value, onChange, step) {
      const wrap = document.createElement("label");
      wrap.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "1";
      input.step = step || "0.01";
      input.value = value == null ? "" : formatValue(value);
      input.addEventListener("change", () => {
        try {
          onChange(input.value);
          setDirty(true);
          renderVehicles();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      wrap.appendChild(input);
      fields.appendChild(wrap);
    }

    addNum("Fuel", v.fuel, (val) => {
      S.setVehicleFuel(save, state.vehicleIndex, val);
      setStatus("Fuel updated");
    });
    addNum("Engine", v.engine, (val) => {
      S.setVehicleEngine(save, state.vehicleIndex, val);
      setStatus("Engine updated");
    });
    addNum("Frame", v.frame, (val) => {
      S.setVehicleFrame(save, state.vehicleIndex, val);
      setStatus("Frame updated");
    });
    addNum("Gas tank", v.gasTank, (val) => {
      S.setVehicleGasTank(save, state.vehicleIndex, val);
      setStatus("Gas tank updated");
    });

    const classWrap = document.createElement("label");
    classWrap.textContent = "Class";
    const classSel = document.createElement("select");
    (save.vehicleClasses || []).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = String(c.index);
      opt.textContent = c.shortName + " [" + c.index + "]";
      if (c.index === v.classIndex) opt.selected = true;
      classSel.appendChild(opt);
    });
    classSel.addEventListener("change", () => {
      try {
        S.setVehicleClassIndex(save, state.vehicleIndex, classSel.value);
        setDirty(true);
        setStatus("Class → " + classSel.options[classSel.selectedIndex].textContent);
        renderVehicles();
        renderDiff();
      } catch (err) {
        setStatus(err.message || String(err));
      }
    });
    classWrap.appendChild(classSel);
    fields.appendChild(classWrap);

    const extraBar = $("veh-extra-toolbar");
    const extraSel = $("veh-extra-select");
    if (extraBar && extraSel) {
      extraBar.hidden = false;
      const prev = extraSel.value;
      extraSel.innerHTML = "";
      for (const ex of S.EXTRA_VEHICLES || []) {
        const opt = document.createElement("option");
        opt.value = ex.id;
        opt.textContent = ex.label;
        opt.title = ex.hint || ex.path;
        if (ex.id === prev || (!prev && ex.id === "plane")) opt.selected = true;
        extraSel.appendChild(opt);
      }
    }

    const scoutWrap = document.createElement("label");
    scoutWrap.textContent = "Map scout";
    const scoutSel = document.createElement("select");
    for (const lvl of S.VEHICLE_SCOUTED_LEVELS || S.SCOUTED_LEVELS || []) {
      const opt = document.createElement("option");
      opt.value = lvl;
      opt.textContent = S.vehicleScoutedLevelLabel(lvl);
      if (lvl === v.scoutedLevel) opt.selected = true;
      scoutSel.appendChild(opt);
    }
    scoutSel.disabled = !v.scouted;
    scoutSel.addEventListener("change", () => {
      try {
        S.setVehicleScoutedLevel(save, state.vehicleIndex, scoutSel.value);
        setDirty(true);
        setStatus("Scout level updated");
        renderVehicles();
        renderDiff();
      } catch (err) {
        setStatus(err.message || String(err));
      }
    });
    scoutWrap.appendChild(scoutSel);
    fields.appendChild(scoutWrap);

    const xyz = v.transform && v.transform.xyz;
    ["X", "Y", "Z"].forEach((axis, ai) => {
      const wrap = document.createElement("label");
      wrap.textContent = "Pos " + axis;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      const key = axis.toLowerCase();
      input.value = xyz ? formatValue(xyz[key]) : "";
      input.disabled = !xyz;
      input.addEventListener("change", () => {
        try {
          const nx = ai === 0 ? Number(input.value) : xyz.x;
          const ny = ai === 1 ? Number(input.value) : xyz.y;
          const nz = ai === 2 ? Number(input.value) : xyz.z;
          S.setVehicleTranslation(save, state.vehicleIndex, nx, ny, nz);
          setDirty(true);
          setStatus("Position updated");
          renderVehicles();
          renderDiff();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      wrap.appendChild(input);
      fields.appendChild(wrap);
    });

    const trunkBody = $("veh-trunk-table").querySelector("tbody");
    trunkBody.innerHTML = "";
    const slots = (v.trunk && v.trunk.slots) || [];
    if (!slots.length) {
      trunkBody.innerHTML = '<tr><td colspan="3">No trunk slots.</td></tr>';
    } else {
      slots.forEach((slot) => {
        const tr = document.createElement("tr");
        const label = S.resolveTrunkItemLabel(save, slot.itemIndex);
        const input = document.createElement("input");
        input.type = "number";
        input.min = "-1";
        input.value = String(slot.itemIndex != null ? slot.itemIndex : -1);
        input.disabled = slot.itemIndexOff == null;
        input.addEventListener("change", () => {
          try {
            S.setTrunkSlotIndex(save, state.vehicleIndex, slot.index, input.value);
            setDirty(true);
            setStatus("Trunk slot " + (slot.index + 1) + " → " + input.value);
            renderVehicles();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        tr.innerHTML = `<td>${slot.index + 1}</td><td>${escapeHtml(label)}</td><td></td>`;
        tr.children[2].appendChild(input);
        trunkBody.appendChild(tr);
      });
    }
  }

  function renderFacilities() {
    const save = current() && current().save;
    if (!save) return;
    if (!save.facilitySlots && S.discoverFacilities) {
      try {
        S.discoverFacilities(save);
      } catch (err) {
        console.warn(err);
        save.facilitySlots = [];
        save.homesiteSlots = [];
        save.facilityCatalog = [];
      }
    }

    const slots = save.facilitySlots || [];
    const stats = save.facilityStats || { current: 0, homesite: 0, outposts: 0, damaged: 0 };
    const summary = $("fac-summary");
    if (summary) {
      summary.hidden = false;
      summary.innerHTML =
        "<strong>" +
        (stats.current || 0) +
        " current slots</strong> · " +
        (stats.outposts || 0) +
        " outposts · " +
        (stats.damaged || 0) +
        " damaged · " +
        (stats.homesite || 0) +
        " homesite templates · catalog " +
        ((save.facilityCatalog && save.facilityCatalog.length) || 0);
    }

    const list = $("fac-list");
    list.innerHTML = "";
    if (!slots.length) {
      list.innerHTML = '<p class="panel-note">No FacilitySlotSaves found.</p>';
      $("fac-title").textContent = "No facilities";
      $("fac-sub").textContent = "";
      $("fac-fields").innerHTML = "";
      $("fac-detail-actions").hidden = true;
      $("homesite-table").querySelector("tbody").innerHTML =
        '<tr><td colspan="4">No HomesiteSlots.</td></tr>';
      return;
    }

    if (state.facilityIndex >= slots.length) state.facilityIndex = 0;

    const qFac = filterQuery("facilities");
    const visibleFac = [];
    slots.forEach((f, i) => {
      const stateLbl = S.facilityStateLabel(f.state);
      if (!matchesFilter(qFac, f.shortName, f.slotId, f.kind, stateLbl, f.path)) return;
      visibleFac.push(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "survivor-chip" + (i === state.facilityIndex ? " is-active" : "");
      btn.innerHTML =
        "<strong>" +
        escapeHtml(f.shortName || f.slotId || "Slot " + (i + 1)) +
        "</strong><span>" +
        escapeHtml(f.kind) +
        " · " +
        escapeHtml(stateLbl) +
        "</span>";
      btn.addEventListener("click", () => {
        state.facilityIndex = i;
        renderFacilities();
      });
      list.appendChild(btn);
    });
    if (!visibleFac.length) {
      list.innerHTML = '<p class="panel-note">No facilities match filter.</p>';
      $("fac-fields").innerHTML = "";
      $("fac-detail-actions").hidden = true;
      return;
    }
    state.facilityIndex = pickVisibleIndex(state.facilityIndex, visibleFac);
    list.querySelectorAll(".survivor-chip").forEach((btn, idx) => {
      btn.classList.toggle("is-active", visibleFac[idx] === state.facilityIndex);
    });

    const f = slots[state.facilityIndex];
    $("fac-detail-actions").hidden = false;
    $("fac-title").textContent = f.shortName || f.slotId || "Facility #" + (f.index + 1);
    $("fac-sub").textContent = (f.slotId || "") + (f.path ? " · " + f.path : "");

    const fields = $("fac-fields");
    fields.innerHTML = "";

    function addLabel(text, control) {
      const wrap = document.createElement("label");
      const title = document.createElement("span");
      title.textContent = text;
      wrap.appendChild(title);
      wrap.appendChild(control);
      fields.appendChild(wrap);
    }

    const idInput = document.createElement("input");
    idInput.type = "text";
    idInput.value = f.slotId || "";
    idInput.disabled = true;
    addLabel("Slot ID", idInput);

    const pathSel = document.createElement("select");
    const catalog = save.facilityCatalog || [];
    const paths = catalog.map((c) => c.path);
    if (f.path && !paths.includes(f.path)) {
      const opt = document.createElement("option");
      opt.value = f.path;
      opt.textContent = f.shortName + " (current)";
      opt.selected = true;
      pathSel.appendChild(opt);
    }
    catalog.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.path;
      opt.textContent = c.shortName;
      if (c.path === f.path) opt.selected = true;
      pathSel.appendChild(opt);
    });
    pathSel.disabled = !f.facility;
    pathSel.addEventListener("change", () => {
      try {
        S.setFacilityPath(save, state.facilityIndex, pathSel.value);
        setDirty(true);
        setStatus("Facility → " + S.shortFacilityName(pathSel.value));
        renderFacilities();
        renderDiff();
      } catch (err) {
        setStatus(err.message || String(err));
      }
    });
    addLabel("Facility type", pathSel);

    const stateSel = document.createElement("select");
    const states = save.facilityStates || S.FACILITY_STATES || [];
    states.forEach((st) => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = S.facilityStateLabel(st);
      if (st === f.state) opt.selected = true;
      stateSel.appendChild(opt);
    });
    if (f.state && !states.includes(f.state)) {
      const opt = document.createElement("option");
      opt.value = f.state;
      opt.textContent = S.facilityStateLabel(f.state);
      opt.selected = true;
      stateSel.appendChild(opt);
    }
    stateSel.disabled = !f.stateRef;
    stateSel.addEventListener("change", () => {
      try {
        S.setFacilityState(save, state.facilityIndex, stateSel.value);
        setDirty(true);
        setStatus("State → " + S.facilityStateLabel(stateSel.value));
        renderFacilities();
        renderDiff();
      } catch (err) {
        setStatus(err.message || String(err));
      }
    });
    addLabel("State", stateSel);

    const health = document.createElement("input");
    health.type = "number";
    health.step = "any";
    health.value = f.health == null ? "" : formatValue(f.health);
    health.disabled = f.healthOff == null;
    health.addEventListener("change", () => {
      try {
        S.setFacilityHealth(save, state.facilityIndex, health.value);
        setDirty(true);
        setStatus("Facility health updated");
        renderFacilities();
        renderDiff();
      } catch (err) {
        setStatus(err.message || String(err));
      }
    });
    addLabel("Health (raw float)", health);

    const flags = document.createElement("input");
    flags.type = "number";
    flags.value = f.flags == null ? "" : String(f.flags);
    flags.disabled = f.flagsOff == null;
    flags.addEventListener("change", () => {
      try {
        S.setFacilityFlags(save, state.facilityIndex, flags.value);
        setDirty(true);
        setStatus("Flags updated");
        renderFacilities();
        renderDiff();
      } catch (err) {
        setStatus(err.message || String(err));
      }
    });
    addLabel("Flags", flags);

    const homeBody = $("homesite-table").querySelector("tbody");
    homeBody.innerHTML = "";
    const homes = save.homesiteSlots || [];
    if (!homes.length) {
      homeBody.innerHTML = '<tr><td colspan="4">No HomesiteSlots.</td></tr>';
    } else {
      const show = homes.slice(0, 40);
      show.forEach((h) => {
        const tr = document.createElement("tr");
        const sel = document.createElement("select");
        catalog.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.path;
          opt.textContent = c.shortName;
          if (c.path === h.path) opt.selected = true;
          sel.appendChild(opt);
        });
        if (h.path && !paths.includes(h.path)) {
          const opt = document.createElement("option");
          opt.value = h.path;
          opt.textContent = h.shortName;
          opt.selected = true;
          sel.appendChild(opt);
        }
        sel.disabled = !h.facility;
        sel.addEventListener("change", () => {
          try {
            S.setHomesiteFacilityPath(save, h.index, sel.value);
            setDirty(true);
            setStatus("Homesite slot " + (h.index + 1) + " path updated");
            renderFacilities();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        const stSel = document.createElement("select");
        states.forEach((st) => {
          const opt = document.createElement("option");
          opt.value = st;
          opt.textContent = S.facilityStateLabel(st);
          if (st === h.state) opt.selected = true;
          stSel.appendChild(opt);
        });
        if (h.state && !states.includes(h.state)) {
          const opt = document.createElement("option");
          opt.value = h.state;
          opt.textContent = S.facilityStateLabel(h.state);
          opt.selected = true;
          stSel.appendChild(opt);
        }
        stSel.disabled = !h.stateRef;
        stSel.addEventListener("change", () => {
          try {
            S.setHomesiteFacilityState(save, h.index, stSel.value);
            setDirty(true);
            setStatus("Homesite slot " + (h.index + 1) + " state updated");
            renderFacilities();
            renderDiff();
          } catch (err) {
            setStatus(err.message || String(err));
          }
        });
        tr.innerHTML = `<td>${h.index + 1}</td><td><code>${escapeHtml(h.slotId || "")}</code></td><td></td><td></td>`;
        tr.children[2].appendChild(sel);
        tr.children[3].appendChild(stSel);
        homeBody.appendChild(tr);
      });
      if (homes.length > show.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="4">… and ' + (homes.length - show.length) + " more templates</td>";
        homeBody.appendChild(tr);
      }
    }
  }

  function writeRadioCharge(save, cmd, value) {
    if (cmd.chargesOff == null) throw new Error("No charges field");
    const n = Math.max(0, Math.min(9999, Number(value) | 0));
    const buf = save.properties;
    buf[cmd.chargesOff] = n & 0xff;
    buf[cmd.chargesOff + 1] = (n >>> 8) & 0xff;
    buf[cmd.chargesOff + 2] = (n >>> 16) & 0xff;
    buf[cmd.chargesOff + 3] = (n >>> 24) & 0xff;
    cmd.charges = n;
    save.dirty = true;
  }

  function writeRadioCooldown(save, cmd, value) {
    if (cmd.cooldownOff == null) throw new Error("No cooldown field");
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) throw new Error("Invalid cooldown");
    const tmp = new ArrayBuffer(4);
    new DataView(tmp).setFloat32(0, v, true);
    const b = new Uint8Array(tmp);
    save.properties[cmd.cooldownOff] = b[0];
    save.properties[cmd.cooldownOff + 1] = b[1];
    save.properties[cmd.cooldownOff + 2] = b[2];
    save.properties[cmd.cooldownOff + 3] = b[3];
    cmd.cooldown = v;
    save.dirty = true;
  }

  function renderDiff() {
    const save = current().save;
    const rows = S.getDiff(save);
    const tbody = $("diff-table").querySelector("tbody");
    const empty = $("diff-empty");
    tbody.innerHTML = "";
    if (!rows.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(row.label)}</td><td>${escapeHtml(
        formatValue(row.before)
      )}</td><td>${escapeHtml(formatValue(row.after))}</td>`;
      tbody.appendChild(tr);
    }
  }

  function renderScan() {
    const save = current().save;
    const lines = [];
    if (save.communityName) {
      lines.push("CommunityDisplayName: " + save.communityName.key);
      lines.push("");
    }
    const cr = save.communityResources || [];
    lines.push("CommunityResources map:");
    if (!cr.length) lines.push("  (none)");
    for (const e of cr) {
      lines.push("  key " + e.key + " = " + formatValue(e.value) + " @ 0x" + e.valueOffset.toString(16));
    }
    lines.push("");
    lines.push("Influence IntProperty hits:");
    const infl = save.fields.influence;
    if (!infl || !infl.hits.length) lines.push("  (none)");
    else {
      for (const h of infl.hits) {
        const mark = infl.hit && h.valueOffset === infl.hit.valueOffset ? " ← community target" : "";
        lines.push("  " + h.value + " @ 0x" + h.valueOffset.toString(16) + mark);
      }
    }
    lines.push("");
    lines.push("Interesting IntProperty scan:");
    const scan = S.scanInterestingInts(save, 60);
    if (!scan.length) lines.push("  (none)");
    for (const row of scan) {
      lines.push("  " + row.name + " = " + row.value);
    }
    $("scan-out").textContent = lines.join("\n");
  }

  function refreshAll() {
    renderSlots();
    renderCommunityFields();
    renderSurvivors();
    renderEnclaves();
    renderInventory();
    renderMapQuest();
    renderVehicles();
    renderFacilities();
    renderPresets();
    renderDiff();
    renderScan();
  }

  function renderPresets() {
    const grid = $("preset-grid");
    if (!grid) return;
    const presets = (S.EDITOR_PRESETS || []).slice();
    grid.innerHTML = "";
    if (!presets.length) {
      grid.innerHTML = '<p class="panel-note">No presets loaded (presets.js missing?).</p>';
      return;
    }
    presets.forEach((p) => {
      const card = document.createElement("article");
      card.className = "preset-card";
      card.innerHTML =
        "<h3>" +
        escapeHtml(p.title) +
        "</h3><p>" +
        escapeHtml(p.blurb || "") +
        '</p><button type="button" class="btn btn--accent" data-preset="' +
        escapeHtml(p.id) +
        '">Apply</button>';
      card.querySelector("button").addEventListener("click", () => {
        const slot = current();
        if (!slot) {
          setStatus("Load a save first");
          return;
        }
        try {
          pushCheckpoint("before " + (p.title || p.id));
          const result = S.applyEditorPreset(slot.save, p.id);
          setDirty(true);
          setStatus((result.title || p.title) + " — " + (result.summary || "done"));
          refreshAll();
        } catch (err) {
          setStatus(err.message || String(err));
        }
      });
      grid.appendChild(card);
    });
  }

  function loadBuffer(arrayBuffer, fileName) {
    const save = S.openSave(arrayBuffer, fileName);
    S.discoverCommunityFields(save);
    try {
      S.discoverSurvivors(save);
    } catch (err) {
      console.warn(err);
      save.survivors = [];
      save.traitCatalog = S.COMMON_TRAITS.slice();
    }
    try {
      S.discoverEnclaves(save);
    } catch (err) {
      console.warn(err);
      save.enclaves = [];
    }
    try {
      S.discoverInventories(save);
      S.attachSurvivorInventories(save);
    } catch (err) {
      console.warn(err);
      save.inventories = save.inventories || [];
      save.itemCatalog = save.itemCatalog || [];
    }
    try {
      S.discoverMapQuest(save);
    } catch (err) {
      console.warn(err);
      save.mapSites = [];
      save.radioCommands = [];
      save.missions = [];
    }
    try {
      S.discoverVehicles(save);
    } catch (err) {
      console.warn(err);
      save.vehicles = [];
      save.vehicleClasses = [];
    }
    try {
      S.discoverFacilities(save);
    } catch (err) {
      console.warn(err);
      save.facilitySlots = [];
      save.homesiteSlots = [];
      save.facilityCatalog = [];
    }
    return {
      save,
      backup: new Uint8Array(save.original),
    };
  }

  async function loadFiles(fileList) {
    const files = [...fileList].filter(Boolean);
    if (!files.length) return;
    try {
      let candidates;
      if (S.filesFromUserList && S.resolveWgsFiles) {
        const raw = await S.filesFromUserList(files);
        const resolved = S.resolveWgsFiles(raw);
        candidates = resolved.candidates;
        if (!candidates.length) {
          throw new Error(
            "No DaytonSaveGame GVAS found. Drop SaveGame_*.sav, a WGS folder’s GUID blobs + container.*, or a WGS zip."
          );
        }
      } else {
        candidates = [];
        for (const file of files) {
          const buf = new Uint8Array(await file.arrayBuffer());
          candidates.push({ fileName: file.name || "SaveGame.sav", bytes: buf });
        }
      }

      const loaded = [];
      const skipped = [];
      for (const c of candidates) {
        try {
          const ab = c.bytes.buffer.slice(
            c.bytes.byteOffset,
            c.bytes.byteOffset + c.bytes.byteLength
          );
          loaded.push(loadBuffer(ab, c.fileName || "SaveGame.sav"));
        } catch (err) {
          skipped.push((c.fileName || c.sourceName || "?") + ": " + (err.message || String(err)));
        }
      }
      if (!loaded.length) {
        throw new Error(skipped[0] || "No valid community saves in selection");
      }
      state.saves = loaded;
      state.active = 0;
      state.survivorIndex = 0;
      state.enclaveIndex = 0;
      state.lockerIndex = 0;
      state.vehicleIndex = 0;
      state.facilityIndex = 0;
      state.undoStack = [];
      showEditor(true);
      switchTab("community");
      refreshAll();
      setDirty(false);
      let msg =
        loaded.length === 1
          ? "Loaded " + loaded[0].save.fileName
          : "Loaded " + loaded.length + " saves — use slot chips to switch";
      if (skipped.length) msg += " · skipped " + skipped.length;
      setStatus(msg);
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err));
      showEditor(false);
      state.saves = [];
      setDirty(false);
    }
  }

  function flushCommunityInputs(save) {
    for (const def of S.COMMUNITY_FIELDS) {
      const input = $("f-" + def.id);
      if (!input || input.disabled) continue;
      S.setFieldValue(save, def.id, input.value);
    }
  }

  $("file-input").addEventListener("change", (e) => {
    loadFiles(e.target.files);
    e.target.value = "";
  });

  if (window.GGSaveFolders) {
    GGSaveFolders.wireEditor("sod2", {
      setStatus,
      async onFile(file) {
        await loadFiles([file]);
      },
    });
  }

  $("btn-backup").addEventListener("click", () => {
    const slot = current();
    if (!slot) return;
    const name = slot.save.fileName.replace(/\.sav$/i, "") + ".backup.sav";
    S.downloadBytes(slot.backup, name);
    setStatus("Backup downloaded");
  });

  $("btn-checkpoint").addEventListener("click", () => {
    pushCheckpoint("manual");
    setStatus("Checkpoint saved (" + state.undoStack.length + " on stack)");
  });

  $("btn-undo").addEventListener("click", () => {
    applyUndo();
  });

  $("btn-validate").addEventListener("click", () => {
    const slot = current();
    if (!slot) return;
    try {
      const ok = S.roundTripOk(slot.save);
      setStatus(ok ? "Validate OK — encode/decode round-trip matches" : "Validate FAILED — round-trip mismatch");
    } catch (err) {
      setStatus("Validate error: " + (err.message || String(err)));
    }
  });

  $("btn-save").addEventListener("click", () => {
    const slot = current();
    if (!slot) return;
    try {
      flushCommunityInputs(slot.save);
      const bytes = S.buildSave(slot.save);
      S.downloadBytes(bytes, slot.save.fileName);
      setDirty(false);
      $("install-modal").hidden = false;
      setStatus("Downloaded " + slot.save.fileName);
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-save-all").addEventListener("click", () => {
    const src = current();
    if (!src || state.saves.length < 2) return;
    try {
      flushCommunityInputs(src.save);
      let n = 0;
      state.saves.forEach((slot, i) => {
        if (i !== state.active) {
          S.applyCommunityValues(src.save, slot.save);
          slot.save.dirty = true;
        }
        const bytes = S.buildSave(slot.save);
        S.downloadBytes(bytes, slot.save.fileName);
        n++;
      });
      setDirty(false);
      $("install-modal").hidden = false;
      setStatus("Downloaded " + n + " saves (community values synced from active slot)");
      refreshAll();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-close-modal").addEventListener("click", () => {
    $("install-modal").hidden = true;
  });

  $("btn-max-influence").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save || !save.fields.influence.available) return;
    S.setFieldValue(save, "influence", 9999);
    $("f-influence").value = "9999";
    setDirty(true);
    setStatus("Influence set to 9999");
    renderDiff();
    renderInfluenceTable();
    if (save.enclaves) renderEnclaves();
  });

  $("btn-all-influence").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save || !save.fields.influence.available) return;
    const v = $("f-influence").value || "9999";
    S.setAllInfluence(save, v);
    $("f-influence").value = formatValue(save.fields.influence.value);
    setDirty(true);
    setStatus("Wrote Influence on " + save.fields.influence.hits.length + " fields");
    renderDiff();
    renderInfluenceTable();
    renderScan();
    if (save.enclaves) renderEnclaves();
  });

  function fillResources(amount, ids) {
    const save = current() && current().save;
    if (!save) return;
    let n = 0;
    for (const id of ids) {
      if (!save.fields[id] || !save.fields[id].available) continue;
      S.setFieldValue(save, id, amount);
      const input = $("f-" + id);
      if (input) input.value = formatValue(save.fields[id].value);
      n++;
    }
    setDirty(true);
    setStatus("Updated " + n + " resource fields");
    renderDiff();
  }

  $("btn-fill-resources").addEventListener("click", () => {
    fillResources(500, [...S.STOCKPILE_IDS, "prestige"]);
  });

  $("btn-fill-stockpile").addEventListener("click", () => {
    fillResources(999, S.STOCKPILE_IDS);
  });

  $("btn-zero-threats").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    let n = 0;
    for (const id of ["plagueHearts", "plagueWallSightings", "infestationsToday"]) {
      if (!save.fields[id] || !save.fields[id].available) continue;
      S.setFieldValue(save, id, 0);
      const input = $("f-" + id);
      if (input) input.value = "0";
      n++;
    }
    setDirty(true);
    setStatus("Zeroed " + n + " threat fields");
    renderDiff();
  });

  $("btn-noon").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save || !save.fields.timeOfDay || !save.fields.timeOfDay.available) return;
    // Midday-ish for minute-scale clocks (12 * 60 = 720)
    S.setFieldValue(save, "timeOfDay", 720);
    $("f-timeOfDay").value = formatValue(save.fields.timeOfDay.value);
    setDirty(true);
    setStatus("Time of day set to 720 (try in-game; units vary)");
    renderDiff();
  });

  $("btn-infl-table-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save || !save.fields.influence.hits.length) return;
    const first = save.fields.influence.hits[0].value;
    S.setAllInfluence(save, first);
    if ($("f-influence")) $("f-influence").value = formatValue(save.fields.influence.value);
    setDirty(true);
    setStatus("All Influence fields set to " + first);
    renderInfluenceTable();
    renderEnclaves();
    renderDiff();
  });

  function encBulk(fn, okMsg) {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = fn(save);
      setDirty(true);
      setStatus(okMsg(n));
      renderEnclaves();
      renderCommunityFields();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  }

  $("btn-enc-max-infl").addEventListener("click", () => {
    encBulk((save) => S.bulkSetEnclaveInfluence(save, 9999, { skipCommunity: false }), (n) => "Set influence on " + n + " enclaves");
  });
  $("btn-enc-show-map").addEventListener("click", () => {
    encBulk((save) => S.bulkSetEnclaveBools(save, { displayOnMap: true }), (n) => "Updated " + n + " map flags");
  });
  $("btn-enc-no-prestige").addEventListener("click", () => {
    encBulk((save) => S.bulkSetEnclaveBools(save, { tradesPrestige: false }), (n) => "Updated " + n + " prestige-trade flags");
  });
  $("btn-enc-keep-alive").addEventListener("click", () => {
    encBulk((save) => S.bulkSetEnclaveBools(save, { disbandsOnRecruit: false }), (n) => "Updated " + n + " disband flags");
  });
  $("btn-enc-show-recruit").addEventListener("click", () => {
    encBulk((save) => S.bulkSetEnclaveBools(save, { hideRecruitability: false }), (n) => "Updated " + n + " recruitability flags");
  });

  $("inv-category").addEventListener("change", () => {
    state.invCategory = $("inv-category").value;
    renderInventory();
  });

  $("btn-inv-add").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    const raw = ($("inv-new-class").value || "").trim();
    const stack = $("inv-new-stack").value;
    if (!raw) {
      setStatus("Enter a class path or pick from the catalog");
      return;
    }
    try {
      const inv = save.inventories[state.lockerIndex];
      const cat = inv && inv.categories[state.invCategory];
      let arg = raw;
      if (cat) {
        const byShort = cat.classes.items.find((c) => c.shortName === raw || c.path === raw);
        if (byShort) arg = byShort.index;
        else if (/^[0-9]+$/.test(raw)) arg = Number(raw);
        else {
          const fromCatalog = (save.itemCatalog || []).find(
            (c) => c.shortName === raw || c.path === raw || c.shortName.replace(/\s\/\s/g, ".") === raw
          );
          if (fromCatalog) arg = fromCatalog.path;
        }
      }
      S.addInventoryItem(save, state.lockerIndex, state.invCategory, arg, stack);
      setDirty(true);
      setStatus("Added item");
      $("inv-new-class").value = "";
      renderInventory();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-inv-max-stacks").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.maxAllInventoryStacks(save, state.lockerIndex, 999);
      setDirty(true);
      setStatus("Maxed " + n + " stacks");
      renderInventory();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-inv-repair").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.repairAllInventoryWeapons(save, state.lockerIndex, 9999);
      setDirty(true);
      setStatus("Repaired " + n + " weapons");
      renderInventory();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-map-reveal").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.revealAllMapSites(save, "EScoutedLevel::Advanced");
      setDirty(true);
      setStatus("Revealed " + n + " map sites (Advanced)");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-map-scouted").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.revealAllMapSites(save, "EScoutedLevel::Scouted");
      setDirty(true);
      setStatus("Set " + n + " sites to Scouted");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-radio-reset").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.resetRadioCooldowns(save);
      setDirty(true);
      setStatus("Reset cooldown on " + n + " radio commands");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-radio-charges").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.setAllRadioCharges(save, 99);
      setDirty(true);
      setStatus("Set charges=99 on " + n + " radio commands");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-missions-clear").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    if (!window.confirm("Dismiss all active loose missions?")) return;
    try {
      const n = S.clearLooseMissions(save);
      setDirty(true);
      setStatus("Cleared " + n + " active missions");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-map-clear-infest").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.clearAllInfestedOutposts(save);
      setDirty(true);
      setStatus("Cleared infestation on " + n + " sites");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-map-survey-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.setAllSitesSurveyed(save, true);
      setDirty(true);
      setStatus("Marked " + n + " sites surveyed");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-map-abandon-outposts").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    if (!window.confirm("Set every map site OutpostId to None (abandon all outposts)?")) return;
    try {
      const n = S.abandonAllOutposts(save);
      setDirty(true);
      setStatus("Abandoned " + n + " outposts");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-missions-clear-completed").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    if (!window.confirm("Clear the CompletedMissions log? This cannot be undone for this edit session.")) return;
    try {
      const n = S.clearCompletedMissions(save);
      setDirty(true);
      setStatus("Cleared " + n + " completed mission IDs");
      renderMapQuest();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-repair-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.repairAllVehicles(save);
      setDirty(true);
      setStatus("Repaired/refueled " + n + " vehicles");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-refuel-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.refuelAllVehicles(save, 1);
      setDirty(true);
      setStatus("Refueled " + n + " vehicles");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-reveal").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.revealAllVehicles(save, "EScoutedLevel::Advanced");
      setDirty(true);
      setStatus("Revealed " + n + " vehicles on map");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-teleport").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const r = S.teleportVehiclesNearBase(save);
      setDirty(true);
      setStatus("Teleported " + r.count + " vehicles near base cluster (" + r.anchor.clusterSize + ")");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-repair").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      S.repairVehicle(save, state.vehicleIndex);
      setDirty(true);
      setStatus("Repaired vehicle #" + (state.vehicleIndex + 1));
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-clear-trunk").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.clearTrunk(save, state.vehicleIndex);
      setDirty(true);
      setStatus("Cleared " + n + " trunk slots");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-to-plane").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      pushCheckpoint("before plane convert");
      const r = S.applyVehicleExtra(save, state.vehicleIndex, "plane");
      setDirty(true);
      setStatus("Vehicle → Plane (" + r.shortName + ", class #" + r.classIndex + ")");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-apply-extra").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    const id = $("veh-extra-select").value;
    try {
      pushCheckpoint("before vehicle extra " + id);
      const r = S.applyVehicleExtra(save, state.vehicleIndex, id);
      setDirty(true);
      setStatus("Vehicle → " + r.shortName + " (class #" + r.classIndex + ")");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-spawn-plane").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      pushCheckpoint("before spawn plane");
      const r = S.spawnVehicleExtraNearBase(save, "plane");
      state.vehicleIndex = r.index;
      setDirty(true);
      setStatus("Spawned Plane near base → #" + (r.index + 1));
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-dup").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const idx = S.duplicateVehicle(save, state.vehicleIndex);
      state.vehicleIndex = idx;
      setDirty(true);
      setStatus("Duplicated vehicle → #" + (idx + 1));
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-veh-del").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    if (!window.confirm("Delete this vehicle from the save?")) return;
    try {
      S.removeVehicle(save, state.vehicleIndex);
      if (state.vehicleIndex >= (save.vehicles || []).length) state.vehicleIndex = 0;
      setDirty(true);
      setStatus("Vehicle deleted");
      renderVehicles();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-surv-heal-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.healAllSurvivors(save);
      setDirty(true);
      setStatus("Healed " + n + " survivors");
      renderSurvivors();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-surv-rest-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.clearAllFatigue(save);
      setDirty(true);
      setStatus("Cleared fatigue on " + n + " survivors");
      renderSurvivors();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-surv-hero-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.promoteAllToHero(save);
      setDirty(true);
      setStatus("Promoted " + n + " survivors to Hero");
      renderSurvivors();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-surv-heal").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      S.healSurvivor(save, state.survivorIndex);
      setDirty(true);
      setStatus("Healed " + (save.survivors[state.survivorIndex] && save.survivors[state.survivorIndex].displayName));
      renderSurvivors();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-surv-dup").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const idx = S.duplicateSurvivor(save, state.survivorIndex);
      state.survivorIndex = idx;
      setDirty(true);
      setStatus("Duplicated survivor → #" + (idx + 1));
      renderSurvivors();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-surv-del").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    if (!window.confirm("Delete this survivor from their enclave roster?")) return;
    try {
      S.removeSurvivor(save, state.survivorIndex);
      if (state.survivorIndex >= save.survivors.length) state.survivorIndex = Math.max(0, save.survivors.length - 1);
      setDirty(true);
      setStatus("Survivor deleted");
      renderSurvivors();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-surv-transfer").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    const target = Number($("surv-transfer-target").value);
    try {
      const idx = S.transferSurvivor(save, state.survivorIndex, target);
      state.survivorIndex = Math.min(idx, save.survivors.length - 1);
      setDirty(true);
      setStatus("Transferred survivor to roster #" + (target + 1));
      renderSurvivors();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-fac-repair-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.repairAllFacilities(save);
      setDirty(true);
      setStatus("Repaired " + n + " facility slots");
      renderFacilities();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-fac-complete-all").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      const n = S.completeAllFacilities(save);
      setDirty(true);
      setStatus("Set Completed on " + n + " slots");
      renderFacilities();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-fac-repair").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      S.repairFacility(save, state.facilityIndex);
      setDirty(true);
      setStatus("Repaired facility #" + (state.facilityIndex + 1));
      renderFacilities();
      renderDiff();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-add-trait").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    const id = ($("new-trait-id").value || "Filler1").trim();
    try {
      S.addSurvivorTrait(save, state.survivorIndex, id);
      setDirty(true);
      setStatus("Added trait " + id);
      $("new-trait-id").value = "";
      renderSurvivors();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-add-skill").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    const id = ($("new-skill-id").value || "Cardio").trim();
    try {
      S.addSkill(save, state.survivorIndex, id);
      setDirty(true);
      setStatus("Added skill " + id);
      $("new-skill-id").value = "";
      renderSurvivors();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  $("btn-max-skills").addEventListener("click", () => {
    const save = current() && current().save;
    if (!save) return;
    try {
      S.maxAllSkills(save, state.survivorIndex);
      setDirty(true);
      setStatus("Maxed skills to level 7");
      renderSurvivors();
    } catch (err) {
      setStatus(err.message || String(err));
    }
  });

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  const overlay = $("drop-overlay");
  let dragDepth = 0;

  function hasFiles(e) {
    return e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  }

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.hidden = false;
  });

  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.hidden = true;
  });

  function bindListFilter(inputId, filterKey, rerender) {
    const el = $(inputId);
    if (!el) return;
    el.value = state.filters[filterKey] || "";
    el.addEventListener("input", () => {
      state.filters[filterKey] = el.value;
      rerender();
    });
  }

  bindListFilter("filter-survivors", "survivors", () => current() && renderSurvivors());
  bindListFilter("filter-enclaves", "enclaves", () => current() && renderEnclaves());
  bindListFilter("filter-lockers", "lockers", () => current() && renderInventory());
  bindListFilter("filter-items", "items", () => current() && renderInventory());
  bindListFilter("filter-catalog", "catalog", () => current() && renderInventory());
  bindListFilter("filter-vehicles", "vehicles", () => current() && renderVehicles());
  bindListFilter("filter-facilities", "facilities", () => current() && renderFacilities());

  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
  });

  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    loadFiles(e.dataTransfer.files);
  });
})();
