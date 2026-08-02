(() => {
  "use strict";

  const TRANSFORM = "UnityEngine.Transform";
  const PICKUPABLE = "Pickupable";
  const GOOD_PREFIX = [0x02, 0x08, 0x02, 0x19, 0x0a, 0x15];
  const ID_RE =
    /^([A-Za-z0-9_]+)2\$([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):\$([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:B\$([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?H$/i;

  function toBytes(input) {
    if (!input) return new Uint8Array(0);
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    return new Uint8Array(input);
  }

  function extractAscii(bytes) {
    const out = [];
    let cur = "";
    let start = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 32 && b <= 126) {
        if (!cur) start = i;
        cur += String.fromCharCode(b);
      } else {
        if (cur.length >= 4) out.push({ s: cur, at: start });
        cur = "";
      }
    }
    if (cur.length >= 4) out.push({ s: cur, at: start });
    return out;
  }

  function findBytes(hay, needle, from = 0, to = hay.length) {
    const n = typeof needle === "string" ? asciiBytes(needle) : needle;
    const end = Math.min(to, hay.length - n.length + 1);
    for (let i = from; i < end; i++) {
      let ok = true;
      for (let j = 0; j < n.length; j++) {
        if (hay[i + j] !== n[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  function asciiBytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // fallback
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function itemName(classId) {
    const db = window.SubnauticaClassIds;
    if (db && db.names && db.names[classId]) {
      return prettyName(db.names[classId]);
    }
    return "Unknown (" + classId.slice(0, 8) + "…)";
  }

  function prettyName(file) {
    return String(file)
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function parseInventory(bytes) {
    bytes = toBytes(bytes);
    const strings = extractAscii(bytes);
    const pickupNeedle = asciiBytes(PICKUPABLE);
    const transformNeedle = asciiBytes(TRANSFORM);
    const raw = [];

    for (const { s, at } of strings) {
      const m = ID_RE.exec(s);
      if (!m) continue;
      const pAt = findBytes(bytes, pickupNeedle, Math.max(0, at - 220), at);
      if (pAt < 0) continue;
      const tAt = findBytes(bytes, transformNeedle, Math.max(0, pAt - 320), pAt);
      if (tAt < 0) continue;

      let recordStart = tAt - 6;
      let safe = false;
      if (recordStart >= 0) {
        safe = GOOD_PREFIX.every((b, i) => bytes[recordStart + i] === b);
      }
      if (!safe) {
        // try other small prefixes; still track but mark unsafe for splice edits
        recordStart = tAt - 6;
      }

      raw.push({
        tag: m[1],
        id: m[2].toLowerCase(),
        classId: m[3].toLowerCase(),
        parent: (m[4] || "").toLowerCase(),
        identity: s,
        idAt: at,
        idEnd: at + s.length,
        tAt,
        pAt,
        recordStart,
        safe,
        name: itemName(m[3].toLowerCase()),
      });
    }

    raw.sort((a, b) => a.recordStart - b.recordStart);
    for (let i = 0; i < raw.length; i++) {
      const next = raw[i + 1];
      raw[i].recordEnd = next
        ? next.recordStart
        : Math.min(bytes.length, raw[i].idEnd + 3);
      if (raw[i].recordEnd <= raw[i].recordStart) {
        raw[i].recordEnd = raw[i].idEnd + 3;
        raw[i].safe = false;
      }
      raw[i].size = raw[i].recordEnd - raw[i].recordStart;
      // only treat as safely editable when prefix matches and size is a common simple size
      if (raw[i].safe) {
        const prefixOk = GOOD_PREFIX.every(
          (b, j) => bytes[raw[i].recordStart + j] === b
        );
        raw[i].safe = prefixOk && raw[i].size >= 200 && raw[i].size <= 400;
      }
    }

    const containers = {};
    for (const it of raw) {
      const key = it.parent || "(root)";
      if (!containers[key]) containers[key] = { id: key, count: 0, items: [] };
      containers[key].count += 1;
      containers[key].items.push(it);
    }

    const containerList = Object.values(containers).sort(
      (a, b) => b.count - a.count
    );

    return {
      items: raw,
      containers: containerList,
      primaryParent: containerList.length ? containerList[0].id : "",
    };
  }

  function replaceAscii(bytes, from, to) {
    if (from.length !== to.length) {
      throw new Error("ASCII replace requires equal length strings.");
    }
    const out = new Uint8Array(bytes);
    const fromB = asciiBytes(from);
    const toB = asciiBytes(to);
    outer: for (let i = 0; i <= out.length - fromB.length; i++) {
      for (let j = 0; j < fromB.length; j++) {
        if (out[i + j] !== fromB[j]) continue outer;
      }
      out.set(toB, i);
      return out;
    }
    throw new Error("Pattern not found for replace.");
  }

  function removeItems(bytes, itemIds) {
    bytes = toBytes(bytes);
    const parsed = parseInventory(bytes);
    const want = new Set(itemIds.map((x) => String(x).toLowerCase()));
    const targets = parsed.items
      .filter((it) => want.has(it.id) && it.safe)
      .sort((a, b) => b.recordStart - a.recordStart);
    if (!targets.length) {
      throw new Error("No safely removable items selected (complex items are skipped).");
    }
    let out = bytes;
    for (const it of targets) {
      const next = new Uint8Array(out.length - it.size);
      next.set(out.subarray(0, it.recordStart), 0);
      next.set(out.subarray(it.recordEnd), it.recordStart);
      out = next;
    }
    return { bytes: out, removed: targets.length };
  }

  function findTemplate(parsed, classId) {
    const want = String(classId).toLowerCase();
    return (
      parsed.items.find((it) => it.safe && it.classId === want) ||
      parsed.items.find((it) => it.safe && it.size === 259) ||
      parsed.items.find((it) => it.safe) ||
      null
    );
  }

  function cloneItemRecord(bytes, template, { classId, parentId }) {
    let record = bytes.slice(template.recordStart, template.recordEnd);
    const newId = uuid();
    // Replace unique instance id (always 36 chars)
    record = replaceAscii(record, template.id, newId);
    if (classId && classId.toLowerCase() !== template.classId) {
      record = replaceAscii(record, template.classId, classId.toLowerCase());
    }
    if (parentId && parentId.toLowerCase() !== template.parent && template.parent) {
      record = replaceAscii(record, template.parent, parentId.toLowerCase());
    }
    return { record, newId };
  }

  function addItems(bytes, { classId, parentId, count }) {
    bytes = toBytes(bytes);
    const n = Math.max(1, Math.min(48, Number(count) || 1));
    const parsed = parseInventory(bytes);
    const parent = parentId || parsed.primaryParent;
    if (!parent) throw new Error("No storage container found in this save.");

    const template = findTemplate(parsed, classId);
    if (!template) {
      throw new Error(
        "No cloneable item template in this save. Put at least one simple resource in a locker/inventory first."
      );
    }

    // Insert after the last item of this parent when possible
    const siblings = parsed.items.filter((it) => it.parent === parent && it.safe);
    const anchor = siblings.length
      ? siblings[siblings.length - 1]
      : template;

    const chunks = [];
    const created = [];
    for (let i = 0; i < n; i++) {
      const { record, newId } = cloneItemRecord(bytes, template, {
        classId,
        parentId: parent,
      });
      chunks.push(record);
      created.push(newId);
    }

    const insertAt = anchor.recordEnd;
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(bytes.length + total);
    out.set(bytes.subarray(0, insertAt), 0);
    let o = insertAt;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    out.set(bytes.subarray(insertAt), o);
    return { bytes: out, added: created.length, classId: (classId || template.classId).toLowerCase(), parent };
  }

  function clearContainer(bytes, parentId) {
    bytes = toBytes(bytes);
    const parsed = parseInventory(bytes);
    const parent = parentId || parsed.primaryParent;
    const ids = parsed.items
      .filter((it) => it.parent === parent && it.safe)
      .map((it) => it.id);
    if (!ids.length) return { bytes, removed: 0 };
    return removeItems(bytes, ids);
  }

  function clearAllContainers(bytes) {
    bytes = toBytes(bytes);
    const parsed = parseInventory(bytes);
    const ids = parsed.items.filter((it) => it.safe).map((it) => it.id);
    if (!ids.length) return { bytes, removed: 0 };
    return removeItems(bytes, ids);
  }

  const TOOL_CLASS_IDS = new Set(
    [
      "9de31592-85f0-4551-aea9-628ea063c7e2", // Knife
      "76a94e03-741a-4622-a049-4a06782dfe6a", // Scanner
      "12c95e66-fb54-47b3-87f1-8e318394b839", // Flashlight
      "7b019de0-db51-4017-8812-2531b808228d", // Beacon
      "c6f3c2fd-5b80-4aaf-81c3-f056651b868c", // Builder
      "9ef36033-b60c-4f8b-8c3a-b15035de3116", // Welder
      "422b14d3-69c6-43c9-8ceb-84d29f5c3a8b", // Seaglide
      "d4aa649b-7508-44e4-89fb-29334f12a64e", // LaserCutter
      "d51f9ea1-c51c-4140-ab19-1744e342a2fe", // PropulsionCannon
      "160e99a7-cb46-409d-98e2-360a76ff92da", // StasisRifle
      "be2baa90-52b3-46d6-992d-5a2614f36af5", // FireExtinguisher
      "dd0298c1-49c2-44a0-8b32-da98e12228fb", // Constructor
    ].map((s) => s.toLowerCase())
  );

  function stripTools(bytes, parentId) {
    bytes = toBytes(bytes);
    const parsed = parseInventory(bytes);
    const ids = parsed.items
      .filter((it) => {
        if (!it.safe) return false;
        if (parentId && it.parent !== parentId) return false;
        return TOOL_CLASS_IDS.has(it.classId);
      })
      .map((it) => it.id);
    if (!ids.length) return { bytes, removed: 0 };
    return removeItems(bytes, ids);
  }

  /** entries: [{ classId, count }, ...] — sequential addItems into one parent. */
  function addKit(bytes, { parentId, entries }) {
    let cur = toBytes(bytes);
    let added = 0;
    const details = [];
    const parent = parentId || parseInventory(cur).primaryParent;
    if (!parent) throw new Error("No storage container found in this save.");
    for (const entry of entries || []) {
      const classId = entry.classId || entry.id;
      const count = entry.count || 1;
      if (!classId) continue;
      const result = addItems(cur, { classId, parentId: parent, count });
      cur = result.bytes;
      added += result.added;
      details.push({ classId: result.classId, count: result.added });
    }
    return { bytes: cur, added, parent, details };
  }

  window.SubnauticaInventory = {
    parseInventory,
    removeItems,
    addItems,
    addKit,
    clearContainer,
    clearAllContainers,
    stripTools,
    itemName,
    uuid,
  };
})();
