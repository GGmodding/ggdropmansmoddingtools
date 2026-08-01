(() => {
  "use strict";

  /**
   * Shared save-folder helpers for GGdropmans editors.
   * Browsers cannot navigate into AppData; we copy the path, offer a .bat that
   * opens Explorer, and optionally a remembered File System Access picker.
   */
  const GAMES = {
    ff7: {
      id: "ff7",
      name: "Final Fantasy VII (Steam)",
      pathTemplate: "%USERPROFILE%\\Documents\\Square Enix\\FINAL FANTASY VII Steam",
      pathHint: "Open the user_* folder inside, then pick save00.ff7–save09.ff7",
      batName: "open-ff7-steam-saves.bat",
      fileAccept: { "application/octet-stream": [".ff7"] },
      fileLabel: "FF7 Steam save (.ff7)",
      matchFile: (name) => /\.ff7$/i.test(name),
      startIn: "documents",
    },
    tcg: {
      id: "tcg",
      name: "TCG Card Shop Simulator",
      pathTemplate: "%USERPROFILE%\\AppData\\LocalLow\\OPNeonGames\\Card Shop Simulator",
      pathHint: "Look for savedGames_Release#.json",
      batName: "open-tcg-saves.bat",
      fileAccept: { "application/json": [".json"] },
      fileLabel: "TCG save (.json)",
      matchFile: (name) => /\.json$/i.test(name),
      startIn: "documents",
    },
    "last-epoch": {
      id: "last-epoch",
      name: "Last Epoch (Offline)",
      pathTemplate: "%USERPROFILE%\\AppData\\LocalLow\\Eleventh Hour Games\\Last Epoch\\Saves",
      pathHint: "CHARACTERSLOT_* files (often no extension)",
      batName: "open-last-epoch-saves.bat",
      // Extensionless files — leave types open
      fileAccept: null,
      fileLabel: "Last Epoch character save",
      matchFile: (name) => /CHARACTERSLOT_|STASH/i.test(name),
      startIn: "documents",
    },
    schedule1: {
      id: "schedule1",
      name: "Schedule I",
      pathTemplate: "%USERPROFILE%\\AppData\\LocalLow\\TVGS\\Schedule I\\Saves",
      pathHint: "Open a SteamID folder, then a SaveGame_# folder",
      batName: "open-schedule1-saves.bat",
      directory: true,
      startIn: "documents",
    },
    sod2: {
      id: "sod2",
      name: "State of Decay 2",
      pathTemplate: "%LOCALAPPDATA%\\StateOfDecay2\\Saved\\Steam",
      pathHint: "SaveGame_*.sav (Steam). Epic/Game Pass paths are tried by the .bat too.",
      batName: "open-sod2-saves.bat",
      tryPaths: [
        "%LOCALAPPDATA%\\StateOfDecay2\\Saved\\Steam",
        "%LOCALAPPDATA%\\StateOfDecay2\\Saved\\Epic",
      ],
      fileAccept: {
        "application/octet-stream": [".sav", ".zip"],
        "application/zip": [".zip"],
      },
      fileLabel: "SoD2 save (.sav / .zip)",
      matchFile: (name) => /\.sav$/i.test(name) || /\.zip$/i.test(name),
      startIn: "documents",
    },
  };

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
      prompt("Copy this path into Explorer’s address bar:", pathTemplate);
      return false;
    }
  }

  async function openSaveFolder(gameId) {
    const game = GAMES[gameId];
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    await copyPath(game.pathTemplate);
    downloadText(game.batName, batContents(game));
    return `Path copied. Downloaded ${game.batName} — double-click it to open Explorer. ${game.pathHint}`;
  }

  async function pickSaveFile(gameId) {
    const game = GAMES[gameId];
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    if (!window.showOpenFilePicker) {
      throw new Error("Find Save needs Chrome or Edge. Use Load Save, or Open Folder for the .bat.");
    }
    const opts = {
      id: `ggdropman-${game.id}-saves`,
      multiple: false,
      startIn: game.startIn || "documents",
    };
    if (game.fileAccept) {
      opts.types = [{ description: game.fileLabel || "Save file", accept: game.fileAccept }];
    }
    const [handle] = await window.showOpenFilePicker(opts);
    const file = await handle.getFile();
    return { file, handle };
  }

  async function pickSaveDirectory(gameId) {
    const game = GAMES[gameId];
    if (!game) throw new Error(`Unknown game: ${gameId}`);
    if (!window.showDirectoryPicker) {
      throw new Error("Find Folder needs Chrome or Edge. Use Load Folder, or Open Folder for the .bat.");
    }
    return window.showDirectoryPicker({
      id: `ggdropman-${game.id}-dir`,
      mode: "read",
      startIn: game.startIn || "documents",
    });
  }

  /**
   * Recursively collect files from a File System Access directory handle.
   * filter(name, relativePath) → boolean; default keeps everything.
   */
  async function collectFilesFromDirectory(dirHandle, filter, prefix = "") {
    const out = [];
    for await (const [name, child] of dirHandle.entries()) {
      const relativePath = prefix ? `${prefix}/${name}` : name;
      if (child.kind === "directory") {
        const nested = await collectFilesFromDirectory(child, filter, relativePath);
        out.push(...nested);
      } else if (!filter || filter(name, relativePath)) {
        const file = await child.getFile();
        out.push({ name, relativePath, file, handle: child });
      }
    }
    return out;
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
      findBtn.addEventListener("click", async () => {
        try {
          const game = GAMES[gameId];
          if (game.directory) {
            const handle = await pickSaveDirectory(gameId);
            if (hooks.onDirectory) {
              await hooks.onDirectory(handle);
            } else {
              status(`Opened folder “${handle.name}”.`);
            }
          } else {
            const { file, handle } = await pickSaveFile(gameId);
            if (hooks.onFile) {
              await hooks.onFile(file, handle);
            } else {
              status(`Picked ${file.name}`);
            }
          }
        } catch (err) {
          if (err && err.name === "AbortError") return;
          alert(err.message || String(err));
        }
      });
    }
  }

  window.GGSaveFolders = {
    GAMES,
    openSaveFolder,
    pickSaveFile,
    pickSaveDirectory,
    collectFilesFromDirectory,
    wireEditor,
    copyPath,
    batContents,
  };
})();
