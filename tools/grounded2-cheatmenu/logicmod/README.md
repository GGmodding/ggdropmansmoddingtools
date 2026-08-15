# Grounded 2 LogicMod (clickable cheat UI)

## Can we ship a `.pak` from this repo right now?

**No binary cook from Cursor alone.** A LogicMod needs:

1. **Unreal Editor** matching Grounded 2 (**UE 5.6**)
2. A small project that cooks `Content/Mods/GGDropmanCheatMenu/ModActor`
3. Package → rename chunk pak → drop in `LogicMods`

What this folder **does** provide: exact layout, ModActor design, cook/install steps, and how the existing UE4SS Lua mod talks to it.

Until a pak exists, use **hotkeys** in `../ue4ss-mod/GGDropmanCheatMenu/` (F3 speed, F4 noclip, etc.). Building UMG Buttons at runtime in Lua **crashes** G2 — that is why we need a cooked pak.

---

## Target install (end users)

```text
...\Steam\steamapps\common\Grounded2\Augusta\Content\Paks\LogicMods\
  GGDropmanCheatMenu.pak
  GGDropmanCheatMenu.ucas   (if IoStore cook produced them)
  GGDropmanCheatMenu.utoc
```

Also required:

```text
...\Augusta\Binaries\Win64\ue4ss\Mods\BPModLoaderMod\   (enabled)
...\Augusta\Binaries\Win64\ue4ss\Mods\GGDropmanCheatMenu\  (Lua helpers + hotkeys)
```

UE4SS `BPModLoaderMod` scans `Content/Paks/LogicMods`, loads `/Game/Mods/<PakName>/ModActor_C`, spawns it each map.

**Pak filename must match** the Content folder name: `GGDropmanCheatMenu.pak` ↔ `/Game/Mods/GGDropmanCheatMenu/`.

---

## Editor project layout (author)

In an Unreal **5.6** project (blank or G2-oriented kit if one appears):

```text
Content/
  Mods/
    GGDropmanCheatMenu/
      ModActor.uasset          ← Blueprint Actor, parent Actor
      WBP_GGDropmanCheatMenu   ← Widget Blueprint (the overlay)
      PAL_GGDropmanCheatMenu   ← Primary Asset Label
```

### Primary Asset Label

Create **Miscellaneous → Data Asset → PrimaryAssetLabel**:

| Setting | Value |
|---------|--------|
| Chunk ID | `420` (any nonzero unique id) |
| Cook Rule | **Always Cook** |
| Label Assets in My Directory | **checked** |

### ModActor (required entry point)

Blueprint class named exactly **`ModActor`**.

Suggested Event Graph:

1. **BeginPlay**
   - Optional: bind key (or wait for Lua / custom event)
2. **Custom Event `ToggleMenu`** (call from Lua later)
   - If widget invalid → `Create Widget` (`WBP_GGDropmanCheatMenu`) → `Add to Viewport` (ZOrder high)
   - Else → remove from parent / toggle visibility
   - `Set Show Mouse Cursor` on PlayerController
   - `Set Input Mode Game and UI` when open; `Game Only` when closed
3. **Custom Events** for each cheat (thin wrappers):
   - `Cheat_Speed`, `Cheat_Noclip`, `Cheat_God`, `Cheat_Vitals`, `Cheat_Dup`, `Cheat_Stacks`, `Cheat_Probe`
   - These can be empty in BP; Lua listens via hooks **or** you call into a Blueprint Function Library exposed to Lua
4. **`ModButtons`** (optional UE4SS GUI tab) — skip for players; use the WBP instead

### WBP_GGDropmanCheatMenu

Simple vertical list of buttons:

| Button | Calls |
|--------|--------|
| Speed | ModActor `Cheat_Speed` or Lua via `Print`/`ExecuteConsoleCommand` bridge |
| Noclip | … |
| God | … |
| Fill Vitals | … |
| Duplicate | … |
| Dup qty | … |
| Stacks 999 | … |
| Probe | … |
| Close | `ToggleMenu` |

**Important:** keep gameplay cheats in **Lua** (`cheats.lua`) — they already work. The LogicMod UI should **signal** the Lua mod (or duplicate the same UObject property writes in BP if you prefer all-in-BP).

Easiest bridge for G2:

- WBP button → ModActor custom event → `Print` a unique tag, **or**
- Set a known actor tag / variable Lua polls, **or**
- Call a no-op UFunction Lua has `RegisterHook` on

Recommended: Lua registers key F8 to find `ModActor_C` and call `ToggleMenu`; WBP buttons call Lua-exposed paths by setting `ModActor` bools that Lua’s tick reads (`bRequestSpeedToggle`, etc.).

---

## Cook / package steps

1. Install **Unreal Engine 5.6** (match G2; do not cook with 5.4 and hope).
2. Create Blank project (or kit).
3. Build the folder / assets above.
4. **Platforms → Windows → Package Project** (or Cook Content).
5. Find cooked chunk, e.g.:

   ```text
   …/Windows/…/Content/Paks/pakchunk420-Windows.pak
   ```

   (plus `.ucas` / `.utoc` if IoStore).

6. Rename to:

   ```text
   GGDropmanCheatMenu.pak
   GGDropmanCheatMenu.ucas
   GGDropmanCheatMenu.utoc
   ```

7. Copy into the game `LogicMods` folder (create it if missing).
8. Enable **BPModLoaderMod** in `ue4ss\Mods\mods.txt` or its `enabled.txt`.
9. Launch game → load a world → check `UE4SS.log` for BPModLoader loading `GGDropmanCheatMenu`.

---

## Lua side (already in repo)

Hotkeys live in `../ue4ss-mod/GGDropmanCheatMenu/Scripts/`.

After the pak ships, extend `main.lua` to:

```lua
-- Pseudocode
local actor = FindFirstOf("ModActor_C")  -- or full path class
if actor and actor:IsValid() then
  actor:ToggleMenu()
end
```

Do **not** `StaticConstructObject` UMG Buttons in Lua on G2.

---

## Why F8 widget construction failed

Runtime `StaticConstructObject(Button)` / VerticalBox overlays hard-crash Augusta. Cooked Widget Blueprints created in-editor and `CreateWidget` from ModActor are the supported path.

---

## Checklist for God (when UE 5.6 is installed)

- [ ] Install UE 5.6
- [ ] Blank project + `Content/Mods/GGDropmanCheatMenu/`
- [ ] `ModActor` + `WBP_GGDropmanCheatMenu` + PrimaryAssetLabel chunk ≠ 0
- [ ] Package Windows
- [ ] Rename chunk → `GGDropmanCheatMenu.pak` (+ ucas/utoc)
- [ ] Copy to `Augusta\Content\Paks\LogicMods\`
- [ ] BPModLoaderMod enabled
- [ ] In-world: log shows mod load; ToggleMenu opens UI
- [ ] Wire buttons → existing Lua cheats

Ping on Discord when UE 5.6 is ready and we can walk the BP graph live.

---

## Links

- UE4SS BP Modloader: https://docs.ue4ss.com/dev/feature-overview/blueprint-modloader.html
- Parent: [`../README.md`](../README.md)
- Discord: https://discord.gg/PTwyDTFyR
- GitHub: https://github.com/GGmodding/ggdropmansmoddingtools
