# Grounded 2 UE4SS Cheat Menu (Step 1)

In-game cheat hotkeys for **Grounded 2** via [UE4SS](https://github.com/UE4SS-RE/RE-UE4SS) Lua. Companion to the Cheat Engine table in `tools/grounded2-editor/`.

**Repo:** [GGmodding/ggdropmansmoddingtools](https://github.com/GGmodding/ggdropmansmoddingtools)  
**Discord:** [discord.gg/PTwyDTFyR](https://discord.gg/PTwyDTFyR)

> **Note:** UE4SS Lua has no ImGui. **F8** prints the key list to the UE4SS console / on-screen text only — constructing UMG Button overlays **hard-crashes Grounded 2**, so the clickable menu is disabled. Use hotkeys. A cooked LogicMods UMG pak is the path for a real GUI later (`logicmod/`).

## Features (v1)

| Key | Action |
|-----|--------|
| **F8** | Print help / status (console + on-screen text — **no widget construction**) |
| **F3** | Toggle Super Speed ×5 (`MaineCharMovementComponent` walk/sprint/fly speeds) |
| **F4** | Toggle Noclip fly (Flying + capsule collision off) |
| **F6** | Fill vitals (HP / stamina / food / water / breath) |
| **F7** | Toggle God Mode (keeps vitals topped while ON) |
| **F9** | Duplicate held item × current qty via `ItemContainerFunctionLibrary.CreateAndAddItem` |
| **Page Up** | Cycle dup qty: 1 → 5 → 10 → 25 |
| **F11** | Set bag `StackSize` to 999 on inventory items |
| **F12** | Probe pawn / inventory / library (status line) |

Hotkeys are the real menu. Status prints to the UE4SS console.

## Install

### 1. UE4SS next to the shipping exe

Typical Steam path:

```text
...\Steam\steamapps\common\Grounded2\Augusta\Binaries\Win64\
```

Place UE4SS so that Win64 looks like:

```text
Win64\
  Grounded2Steam-Win64-Shipping.exe
  dwmapi.dll                 ← proxy loader (REQUIRED)
  ue4ss\
    UE4SS.dll                ← core (REQUIRED)
    UE4SS-settings.ini
    UE4SS.log                ← appears after first launch
    UE4SS_Signatures\
      StaticConstructObject.lua   ← REQUIRED on G2 / UE 5.6 (PS scan)
    Mods\
      mods.txt
      GGDropmanCheatMenu\
        enabled.txt
        Scripts\...
```

Use a **UE4SS experimental / UE5** build ([experimental-latest](https://github.com/UE4SS-RE/RE-UE4SS/releases/tag/experimental-latest)). A `ue4ss\Mods` folder alone is **not** enough — without `dwmapi.dll` + `ue4ss\UE4SS.dll`, no Lua mod (including F8) will load.

**Grounded 2 (UE 5.6) note:** stock PatternSleuth often fails with `Failed to find StaticConstructObject_Internal` / `PS scan timed out`. Copy `ue4ss-mod/UE4SS_Signatures/StaticConstructObject.lua` into `ue4ss\UE4SS_Signatures\` (create the folder). Also set in `UE4SS-settings.ini`:

```ini
bUseUObjectArrayCache = false

[EngineVersionOverride]
MajorVersion = 5
MinorVersion = 6
```

### 2. Copy this mod

Copy the folder:

```text
tools/grounded2-cheatmenu/ue4ss-mod/GGDropmanCheatMenu/
```

to:

```text
...\Augusta\Binaries\Win64\ue4ss\Mods\GGDropmanCheatMenu\
```

Expected layout:

```text
ue4ss\Mods\GGDropmanCheatMenu\
  enabled.txt
  Scripts\
    main.lua
    cheats.lua
```

### 3. Enable the mod

You’re looking at the **inside** of `GGDropmanCheatMenu`. That folder only needs:

```text
GGDropmanCheatMenu\
  enabled.txt
  Scripts\
    main.lua
    cheats.lua
```

That matches how Nexus G2 mods (e.g. BackpackSlots) enable themselves. **`enabled.txt` is enough** — you do **not** need a `mods.txt` inside this folder.

`mods.txt` (if it exists at all) lives **one level up**:

```text
...\ue4ss\Mods\mods.txt
```

Many Grounded 2 UE4SS installs never ship `mods.txt`. If yours doesn’t have one, ignore it. Only create/edit it if your UE4SS package already uses that style; then add:

```text
GGDropmanCheatMenu : 1
```

Keep `UEHelpers` / shared mods enabled if your package includes them (`cheats.lua` falls back if `UEHelpers` is missing).

### 4. Launch and test

1. Start Grounded 2 and **load into a world** (not only the main menu).
2. Confirm `ue4ss\UE4SS.log` shows `[GGDropmanCheatMenu] ready`.
3. Press **F8** — a small help popup should appear on the HUD (and text in the UE4SS console). Auto-hides after ~12s; press F8 again to toggle.
4. Press **F6** — vitals should refill on HUD.
5. Hold an item, press **3** — bag/stack count should increase; status must show a positive delta (not “unchanged”).
6. Press **5** — stacks move toward 999.

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `PS scan timed out` / missing `StaticConstructObject` | Install `ue4ss/UE4SS_Signatures/StaticConstructObject.lua` (shipped under `ue4ss-mod/UE4SS_Signatures/`) |
| No `mods.txt` | Normal on many G2 installs — `enabled.txt` inside the mod folder is the enable switch |
| No log line / F8 dead | UE4SS **runtime** must sit beside the exe (`dwmapi.dll` + full `ue4ss\` package). A lone `ue4ss\Mods\` folder is not enough |
| No log line | Mod folder name / `enabled.txt` / UE4SS load |
| F8 crashes | Re-copy fixed `Scripts/main.lua` — clickable Button overlay is removed; F8 is console/text only |
| F8 does nothing visible | Open UE4SS console — help prints there; on-screen PrintString may also flash |
| “no local pawn” | Must be in-world |
| Dup “inventory unchanged” | Same class of issue as CE Server RPC no-ops — lib path preferred; try again after opening bag once |
| Crash on FText | Rare on some UE5.4+ builds; overlay falls back to plain string `SetText` |

Always attach `UE4SS.log` snippets when asking for help on Discord.

## Implementation notes

- Resolves local pawn via `UEHelpers` / `PlayerController` / `SurvivalPlayerCharacter` — not GObjects scans.
- Prefers **Blueprint library** `CreateAndAddItem(Container, FDataTableRowHandle, Count, bSpawnLeftovers)` over `ServerCreateAndAddItem`.
- Copies **DataTable + RowName** from `UItem.ItemDataRowHandle` (not the full NetCrc blob).
- After duplicate: re-reads inventory stack sum / slot count and reports delta in the status line.

## Step 2 — LogicMod pak (clickable UI)

Runtime UMG Button overlays **crash Grounded 2**. A real menu needs a **cooked LogicMod**.

See [`logicmod/README.md`](logicmod/README.md) for the full cook/install design (`ModActor` + `WBP_GGDropmanCheatMenu` → `LogicMods/GGDropmanCheatMenu.pak`).

**Blocked without:** Unreal Engine **5.6** on your machine to package the Blueprint/Widget. This repo cannot emit a valid `.pak` from Lua alone.

Until then: use **hotkeys** (F3/F4/F6/F7/…).

## Step 2 (legacy stub note)

Older docs called this “out of scope”; the cook guide now lives under `logicmod/`.

## Support

- Tip: [paypal.me/kd19902](https://paypal.me/kd19902)
- Discord: [discord.gg/PTwyDTFyR](https://discord.gg/PTwyDTFyR)
- GitHub: [GGmodding/ggdropmansmoddingtools](https://github.com/GGmodding/ggdropmansmoddingtools)
