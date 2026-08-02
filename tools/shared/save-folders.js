(() => {
  "use strict";

  /**
   * Shared save-folder helpers for GGdropmans editors.
   *
   * Browsers cannot jump to AppData paths. Find Save therefore:
   *  1. Copies the real save path and shows paste instructions
   *  2. Opens a folder picker (user pastes path into the address bar)
   *  3. Scans that folder for matching saves and loads / lists them
   *  4. Remembers the granted folder (IndexedDB) so later picks start there
   */
  const GAMES = {
    ff7: {
      id: "ff7",
      name: "Final Fantasy VII (Steam)",
      pathTemplate: "%USERPROFILE%\\Documents\\Square Enix\\FINAL FANTASY VII Steam",
      pathHint: "Paste that path, then open a user_* folder if needed.",
      batName: "open-ff7-steam-saves.bat",
      fileLabel: "FF7 Steam save (.ff7)",
      matchFile: (name) => /^save\d{2}\.ff7$/i.test(name),
      maxDepth: 3,
    },
    tcg: {
      id: "tcg",
      name: "TCG Card Shop Simulator",
      pathTemplate: "%USERPROFILE%\\AppData\\LocalLow\\OPNeonGames\\Card Shop Simulator",
      pathHint: "Paste that path (LocalLow — not Documents).",
      batName: "open-tcg-saves.bat",
      fileLabel: "TCG save (.json)",
      matchFile: (name) => /savedGames_Release\d+\.json$/i.test(name),
      maxDepth: 2,
    },
    "last-epoch": {
      id: "last-epoch",
      name: "Last Epoch (Offline)",
      pathTemplate: "%USERPROFILE%\\AppData\\LocalLow\\Eleventh Hour Games\\Last Epoch\\Saves",
      pathHint: "Paste that path. Files are usually named CHARACTERSLOT_* with no extension.",
      batName: "open-last-epoch-saves.bat",
      fileLabel: "Last Epoch character save",
      matchFile: (name) => /CHARACTERSLOT_/i.test(name),
      maxDepth: 2,
    },
    schedule1: {
      id: "schedule1",
      name: "Schedule I",
      pathTemplate: "%USERPROFILE%\\AppData\\LocalLow\\TVGS\\Schedule I\\Saves",
      pathHint: "Paste that path, then pick a SaveGame_# folder (or its parent SteamID folder).",
      batName: "open-schedule1-saves.bat",
      directory: true,
      maxDepth: 4,
    },
    sod2: {
      id: "sod2",
      name: "State of Decay 2",
      pathTemplate: "%LOCALAPPDATA%\\StateOfDecay2\\Saved\\Steam",
      pathHint: "Paste that path (Steam). Epic: …\\Saved\\Epic",
      batName: "open-sod2-saves.bat",
      tryPaths: [
        "%LOCALAPPDATA%\\StateOfDecay2\\Saved\\Steam",
        "%LOCALAPPDATA%\\StateOfDecay2\\Saved\\Epic",
      ],
      fileLabel: "SoD2 save (.sav / .zip)",
      matchFile: (name) => /SaveGame_.*\.sav$/i.test(name) || /^SaveGame_.*\.zip$/i.test(name),
      maxDepth: 2,
    },
    subnautica: {
      id: "subnautica",
      name: "Subnautica / Below Zero",
      pathTemplate: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Subnautica\\SNAppData\\SavedGames",
      pathHint: "Steam SN path is on the clipboard. Below Zero: …\\SubnauticaZero\\SNAppData\\SavedGames. Epic: LocalLow\\Unknown Worlds\\….",
      batName: "open-subnautica-saves.bat",
      tryPaths: [
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Subnautica\\SNAppData\\SavedGames",
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\SubnauticaZero\\SNAppData\\SavedGames",
        "%USERPROFILE%\\AppData\\LocalLow\\Unknown Worlds\\Subnautica\\Subnautica\\SavedGames",
        "%USERPROFILE%\\AppData\\LocalLow\\Unknown Worlds\\SubnauticaZero\\SubnauticaZero\\SavedGames",
      ],
      directory: true,
      maxDepth: 6,
      // Chrome/Edge refuse webkitdirectory + showDirectoryPicker under Program Files.
      programFilesBlocked: true,
      guideExtra: `
        <div class="gg-sf-warn">
          <strong>Chrome “system files” block:</strong> Steam keeps Subnautica under Program Files, so <em>folder</em> pickers often fail.
          Workarounds that work:
          <ol>
            <li>Click <strong>Open in Explorer</strong>, copy your <code>slot00xx</code> folder to Desktop, then Choose folder on that Desktop copy.</li>
            <li>Or zip the slot in Explorer and use <strong>Load ZIP</strong> in the editor.</li>
            <li>Or use <strong>Load Files</strong> and multi-select <code>gameinfo.json</code>, <code>*.bin</code>, and <code>screenshot.jpg</code> inside the slot (file pick usually works).</li>
          </ol>
        </div>
      `,
    },
    subnautica2: {
      id: "subnautica2",
      name: "Subnautica 2",
      pathTemplate: "%LOCALAPPDATA%\\Subnautica2\\Saved\\SaveGames",
      pathHint: "UE5 saves: %LOCALAPPDATA%\\Subnautica2\\Saved\\SaveGames (savegame_N.sav).",
      batName: "open-subnautica2-saves.bat",
      tryPaths: [
        "%LOCALAPPDATA%\\Subnautica2\\Saved\\SaveGames",
      ],
      directory: true,
      maxDepth: 2,
      fileLabel: "SN2 save (.sav / .bak / .zip)",
      matchFile: (name) => /^savegame_\d+(\.sav|_\d+\.bak|\.bak)$/i.test(name) || /\.zip$/i.test(name),
      guideExtra: `
        <div class="gg-sf-warn">
          Close Subnautica 2 before overwriting. Live file is <code>savegame_N.sav</code>; the game also keeps <code>.bak</code> rollbacks next to it.
        </div>
      `,
    },
    grounded: {
      id: "grounded",
      name: "Grounded",
      pathTemplate: "%USERPROFILE%\\Saved Games\\Grounded",
      pathHint: "Steam slots are folders like (ID-…)(LOGOUT-SAVE). Pick the Grounded folder or one slot folder.",
      batName: "open-grounded-saves.bat",
      tryPaths: [
        "%USERPROFILE%\\Saved Games\\Grounded",
      ],
      directory: true,
      maxDepth: 3,
      fileLabel: "Grounded slot (.csav / .savheader)",
      matchFile: (name) =>
        /^SaveGameHeaderData\.savheader$/i.test(name) ||
        /\.csav$/i.test(name) ||
        /^SaveGameScreenshot\.(jpg|jpeg|png)$/i.test(name) ||
        /\.zip$/i.test(name),
      guideExtra: `
        <div class="gg-sf-warn">
          Close Grounded before overwriting. Prefer a <code>LOGOUT-SAVE</code> or latest <code>GameTime</code> folder.
          Game Pass players must export to Steam format first.
        </div>
      `,
    },
  };

  const IDB_NAME = "ggdropman-save-folders";
  const IDB_STORE = "dir-handles";

  function batContents(game) {
    const paths = game.tryPaths && game.tryPaths.length
      ? game.tryPaths
      : [game.pathTemplate];
    const lines = [
      "@echo off",
      "setlocal EnableExtensions",
      "echo Looking for " + (game.name || "save") + " folder...",
      "",
    ];
    for (const p of paths) {
      lines.push(`set "CAND=${p}"`);
      lines.push('call set "CAND=%CAND%"');
      lines.push('if exist "%CAND%\\" (');
      lines.push('  echo Opening:');
      lines.push('  echo   %CAND%');
      lines.push('  explorer "%CAND%"');
      lines.push("  exit /b 0");
      lines.push(")");
      lines.push("");
    }
    lines.push("echo None of these folders exist yet:");
    for (const p of paths) {
      lines.push(`echo   ${p}`);
    }
    lines.push("echo.");
    lines.push("echo Launch the game once to create them, then run this again.");
    lines.push("pause");
    lines.push("exit /b 1");
    return lines.join("\r\n");
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/x-bat" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyPath(pathTemplate) {
    try {
      await navigator.clipboard.writeText(pathTemplate);
      return true;
    } catch {
      prompt("Copy this path into the folder dialog address bar:", pathTemplate);
      return false;
    }
  }

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveDirHandle(gameId, handle) {
    try {
      const db = await idbOpen();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(handle, gameId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      /* permission / IDB unavailable */
    }
  }

  async function loadDirHandle(gameId) {
    try {
      const db = await idbOpen();
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(gameId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (!handle) return null;
      const perm = await handle.queryPermission({ mode: "read" });
      if (perm === "granted") return handle;
      const next = await handle.requestPermission({ mode: "read" });
      return next === "granted" ? handle : null;
    } catch {
      return null;
    }
  }

  async function openSaveFolder(gameId) {
    const game = GAMES[gameId];
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    await copyPath(game.pathTemplate);
    downloadText(game.batName, batContents(game));
    return `Path copied. Downloaded ${game.batName} — double-click it to open Explorer. ${game.pathHint}`;
  }

  async function collectFilesFromDirectory(dirHandle, filter, prefix = "", depth = 0, maxDepth = 4) {
    const out = [];
    for await (const [name, child] of dirHandle.entries()) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (child.kind === "directory") {
        if (depth < maxDepth) {
          const nested = await collectFilesFromDirectory(child, filter, relativePath, depth + 1, maxDepth);
          out.push(...nested);
        }
      } else if (!filter || filter(name, relativePath)) {
        const file = await child.getFile();
        out.push({ name, relativePath, file, handle: child });
      }
    }
    return out;
  }

  function ensureStyles() {
    if (document.getElementById("gg-save-folder-styles")) return;
    const style = document.createElement("style");
    style.id = "gg-save-folder-styles";
    style.textContent = `
      .gg-sf-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.55);padding:1rem}
      .gg-sf-modal[hidden]{display:none!important}
      .gg-sf-card{width:min(520px,100%);background:#16181d;color:#f2f2f2;border:1px solid #3a3f4a;border-radius:12px;padding:1.15rem 1.25rem;box-shadow:0 18px 50px rgba(0,0,0,.45);font:500 14px/1.45 system-ui,sans-serif}
      .gg-sf-card h2{margin:0 0 .5rem;font-size:1.15rem}
      .gg-sf-card p{margin:.4rem 0;opacity:.92}
      .gg-sf-card ol{margin:.5rem 0 .75rem;padding-left:1.2rem}
      .gg-sf-card li{margin:.25rem 0}
      .gg-sf-path{display:block;margin:.55rem 0;padding:.55rem .65rem;background:#0d0f13;border:1px solid #2c313a;border-radius:8px;font:500 12px/1.35 ui-monospace,Consolas,monospace;word-break:break-all;user-select:all}
      .gg-sf-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.85rem}
      .gg-sf-actions button{cursor:pointer;border:1px solid #4a5160;background:#232833;color:#fff;border-radius:8px;padding:.45rem .75rem;font:600 13px/1.2 system-ui,sans-serif}
      .gg-sf-actions button.primary{background:#3d7eff;border-color:#3d7eff}
      .gg-sf-actions button:hover{filter:brightness(1.08)}
      .gg-sf-list{max-height:240px;overflow:auto;margin:.6rem 0 0;border:1px solid #2c313a;border-radius:8px}
      .gg-sf-list button{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid #2c313a;color:#f2f2f2;padding:.55rem .7rem;cursor:pointer;font:500 13px/1.3 ui-monospace,Consolas,monospace}
      .gg-sf-list button:last-child{border-bottom:0}
      .gg-sf-list button:hover{background:#232833}
      .gg-sf-note{font-size:12px;opacity:.75;margin-top:.35rem}
      .gg-sf-alts{margin:.35rem 0 .6rem;padding-left:1.1rem;font-size:12px;opacity:.85}
      .gg-sf-alts li{margin:.2rem 0}
      .gg-sf-alts code{font:500 11px/1.35 ui-monospace,Consolas,monospace;word-break:break-all}
      .gg-sf-warn{margin:.65rem 0;padding:.65rem .75rem;border:1px solid #8a6a2a;border-radius:8px;background:rgba(240,180,41,.1);font-size:12.5px;line-height:1.45}
      .gg-sf-warn ol{margin:.4rem 0 0;padding-left:1.15rem}
      .gg-sf-warn li{margin:.25rem 0}
    `;
    document.head.appendChild(style);
  }

  function getModal() {
    ensureStyles();
    let el = document.getElementById("gg-save-folder-modal");
    if (el) return el;
    el = document.createElement("div");
    el.id = "gg-save-folder-modal";
    el.className = "gg-sf-modal";
    el.hidden = true;
    el.innerHTML = `<div class="gg-sf-card" role="dialog" aria-modal="true" aria-labelledby="gg-sf-title"></div>`;
    el.addEventListener("click", (e) => {
      if (e.target === el) closeModal();
    });
    document.body.appendChild(el);
    return el;
  }

  function closeModal() {
    const el = document.getElementById("gg-save-folder-modal");
    if (el) el.hidden = true;
  }

  function showGuide(game) {
    return new Promise(async (resolve) => {
      const modal = getModal();
      const card = modal.querySelector(".gg-sf-card");
      await copyPath(game.pathTemplate);
      const altPaths = (game.tryPaths || []).filter((p) => p !== game.pathTemplate);
      const altHtml = altPaths.length
        ? `<p class="gg-sf-note">Also try:</p><ul class="gg-sf-alts">${altPaths
            .map((p) => `<li><code>${p.replace(/</g, "&lt;")}</code></li>`)
            .join("")}</ul>`
        : "";
      const extra = game.guideExtra || "";
      const steps = game.programFilesBlocked
        ? `
        <ol>
          <li>Click <strong>Open in Explorer</strong> first (recommended).</li>
          <li>Copy your <code>slot00xx</code> folder to Desktop (or Documents).</li>
          <li>Click <strong>Choose folder</strong> and select that Desktop copy — not the Program Files path.</li>
        </ol>`
        : `
        <ol>
          <li>Click <strong>Choose folder</strong> below (path is already on your clipboard).</li>
          <li>In the dialog: click the address bar (or press <kbd>Ctrl</kbd>+<kbd>L</kbd>).</li>
          <li>Paste (<kbd>Ctrl</kbd>+<kbd>V</kbd>) and press <kbd>Enter</kbd>.</li>
          <li>Click <strong>Select Folder</strong> — we’ll scan for saves.</li>
        </ol>`;
      card.innerHTML = `
        <h2 id="gg-sf-title">Find ${game.name} saves</h2>
        <p>Browsers can’t open protected paths by themselves. Real save location:</p>
        <code class="gg-sf-path">${game.pathTemplate}</code>
        ${altHtml}
        ${extra}
        ${steps}
        <p class="gg-sf-note">${game.pathHint || ""} Next time we try to reopen the same granted folder automatically.</p>
        <div class="gg-sf-actions">
          <button type="button" class="primary" data-act="choose">Choose folder</button>
          <button type="button" data-act="explorer">Open in Explorer (.bat)</button>
          <button type="button" data-act="cancel">Cancel</button>
        </div>
      `;
      modal.hidden = false;
      card.onclick = (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const act = btn.getAttribute("data-act");
        if (act === "cancel") {
          closeModal();
          resolve(null);
        } else if (act === "explorer") {
          downloadText(game.batName, batContents(game));
        } else if (act === "choose") {
          closeModal();
          resolve("pick");
        }
      };
    });
  }

  function showFilePicker(game, matches) {
    return new Promise((resolve) => {
      const modal = getModal();
      const card = modal.querySelector(".gg-sf-card");
      const rows = matches
        .map(
          (m, i) =>
            `<button type="button" data-i="${i}">${m.relativePath.replace(/</g, "&lt;")}</button>`
        )
        .join("");
      card.innerHTML = `
        <h2 id="gg-sf-title">Found ${matches.length} save(s)</h2>
        <p>Pick one to load into the editor:</p>
        <div class="gg-sf-list">${rows}</div>
        <div class="gg-sf-actions">
          <button type="button" data-act="cancel">Cancel</button>
        </div>
      `;
      modal.hidden = false;
      card.onclick = (e) => {
        const cancel = e.target.closest("button[data-act='cancel']");
        if (cancel) {
          closeModal();
          resolve(null);
          return;
        }
        const row = e.target.closest("button[data-i]");
        if (!row) return;
        closeModal();
        resolve(matches[Number(row.getAttribute("data-i"))]);
      };
    });
  }

  async function clearDirHandle(gameId) {
    try {
      const db = await idbOpen();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(gameId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      /* ignore */
    }
  }

  async function pickDirectoryForGame(game, { useRemembered = true } = {}) {
    if (!window.showDirectoryPicker) {
      throw new Error("Find Save needs Chrome or Edge. Use Load Save, or Open Folder for Explorer.");
    }
    const opts = {
      id: `ggdropman-${game.id}-dir`,
      mode: "read",
    };
    if (useRemembered) {
      const remembered = await loadDirHandle(game.id);
      if (remembered) opts.startIn = remembered;
    }
    const handle = await window.showDirectoryPicker(opts);
    await saveDirHandle(game.id, handle);
    return handle;
  }

  async function guidedPick(game, { clearMemory = false } = {}) {
    const action = await showGuide(game);
    if (action !== "pick") return null;
    if (clearMemory) await clearDirHandle(game.id);
    try {
      return await pickDirectoryForGame(game, { useRemembered: !clearMemory });
    } catch (err) {
      if (err && err.name === "AbortError") return null;
      throw err;
    }
  }

  async function findAndLoad(gameId, hooks) {
    const game = GAMES[gameId];
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    const status = hooks.setStatus || (() => {});

    let dirHandle = await loadDirHandle(game.id);
    if (!dirHandle) {
      dirHandle = await guidedPick(game);
      if (!dirHandle) return;
    }

    if (game.directory) {
      if (hooks.onDirectory) await hooks.onDirectory(dirHandle);
      else status(`Opened folder “${dirHandle.name}”.`);
      return;
    }

    status(`Scanning “${dirHandle.name}” for saves…`);
    let matches = await collectFilesFromDirectory(
      dirHandle,
      game.matchFile,
      "",
      0,
      game.maxDepth ?? 3
    );

    if (!matches.length) {
      dirHandle = await guidedPick(game, { clearMemory: true });
      if (!dirHandle) return;
      if (game.directory) {
        if (hooks.onDirectory) await hooks.onDirectory(dirHandle);
        return;
      }
      status(`Scanning “${dirHandle.name}” for saves…`);
      matches = await collectFilesFromDirectory(
        dirHandle,
        game.matchFile,
        "",
        0,
        game.maxDepth ?? 3
      );
    }

    if (!matches.length) {
      alert(
        `No matching saves found in “${dirHandle.name}”.\n\nExpected path:\n${game.pathTemplate}\n\n${game.pathHint || ""}`
      );
      status("No saves found in that folder.");
      return;
    }

    let chosen = matches[0];
    if (matches.length > 1) {
      chosen = await showFilePicker(game, matches);
      if (!chosen) return;
    }

    if (hooks.onFile) await hooks.onFile(chosen.file, chosen.handle);
    else status(`Picked ${chosen.relativePath}`);
  }

  function wireEditor(gameId, hooks = {}) {
    const openBtns = [
      document.getElementById("btn-open-save-folder"),
      document.getElementById("btn-open-save-folder-modal"),
    ].filter(Boolean);
    const findBtn = document.getElementById("btn-find-save");
    const status =
      typeof hooks.setStatus === "function"
        ? hooks.setStatus
        : (msg) => {
            const el = document.getElementById("status");
            if (el) el.textContent = msg;
          };
    const boundHooks = { ...hooks, setStatus: status };

    const onOpenFolder = async () => {
      try {
        status(await openSaveFolder(gameId));
      } catch (err) {
        alert(err.message || String(err));
      }
    };
    for (const btn of openBtns) {
      btn.addEventListener("click", onOpenFolder);
    }

    if (findBtn) {
      findBtn.addEventListener("click", async (e) => {
        try {
          if (e.shiftKey) await clearDirHandle(gameId);
          await findAndLoad(gameId, boundHooks);
        } catch (err) {
          if (err && err.name === "AbortError") return;
          alert(err.message || String(err));
        }
      });
      findBtn.title =
        "Paste the real save path into the folder dialog (Ctrl+L, Ctrl+V, Enter), then we scan. Shift+click to forget the last folder.";
    }
  }

  window.GGSaveFolders = {
    GAMES,
    openSaveFolder,
    pickSaveDirectory: pickDirectoryForGame,
    collectFilesFromDirectory,
    findAndLoad,
    wireEditor,
    copyPath,
    batContents,
  };
})();
