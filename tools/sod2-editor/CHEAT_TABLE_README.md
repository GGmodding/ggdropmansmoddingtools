# GGdropmans State of Decay 2 Cheat Table

Hybrid Cheat Engine table for State of Decay 2 (Juggernaut).

**File:** [`GGdropmanSoD2_v1.0.CT`](GGdropmanSoD2_v1.0.CT) (table header: **v1.1**)

**Save bridge:** [`ct-cli.js`](ct-cli.js) (Node.js) — same GVAS codec as the browser editor.

Regenerate the `.CT` after editing scripts: `node build-ct.js`

## Support

Tip: [paypal.me/kd19902](https://paypal.me/kd19902)

Discord: [discord.gg/PTwyDTFyR](https://discord.gg/PTwyDTFyR)

## Requirements

- [Cheat Engine](https://www.cheatengine.org/) 7.5+
- [Node.js](https://nodejs.org/) on `PATH` (for save-bridge scripts)
- Keep the `.CT` in this folder next to `ct-cli.js` and the editor modules

## Save paths

Close State of Decay 2 fully before save edits.

- **Steam:** `%LOCALAPPDATA%\StateOfDecay2\Saved\Steam\`
- **Epic:** `%LOCALAPPDATA%\StateOfDecay2\Saved\Epic\`
- **Game Pass:** use the [browser editor](editor.html) WGS unpack, or point at extracted `DaytonSaveGame` blobs

Every mutating CLI command copies `SaveGame_*.sav` → `SaveGame_*.sav.bak` first.

## Layer 1 — Save bridge (editor parity)

1. File → Open `GGdropmanSoD2_v1.0.CT` (save the table so CE knows its folder).
2. Tick **ENABLE — Load save-bridge helpers**.
3. Tick **Set / remember save path** and pick your `SaveGame_*.sav`.
4. Tick a **Preset**, **Action**, or **Spawn** entry (one-shot; auto-unticks).

### Spawn items (locker #0)

| Kit | Contents |
| --- | --- |
| All common ammo | 9mm, .45, 5.56, 7.62, shells, .357, .44, .50, 40mm |
| Meds | Bandages, first aid, painkillers, plague cure |
| Stimulants | Mild/standard/potent stims + espresso |
| Throwables | M67, molotov, pipe bomb, flashbang, smoke, fuel bomb |
| Snacks | Snacks + nutritious snacks |
| Resource packs | Food/materials/meds/ammo packs |
| Assault loadout | AR15, AK, 1911, ammo, meds, axe |
| Custom spawn | Prompt for category + `/Game/Items/..._C` path |

```bat
node ct-cli.js action "C:\path\SaveGame_Slot0.sav" spawn-kit ammo-all
node ct-cli.js action "C:\path\SaveGame_Slot0.sav" spawn-item ammo "/Game/Items/Ammo/Ammo_9mm.Ammo_9mm_C" 999 0
```

Deep per-survivor traits/skills/outfits, item catalog pickers, WGS UI, and Diff stay in [`editor.html`](editor.html).

## Layer 2 — Live session

1. Launch SoD2 and load a community.
2. Attach CE to `StateOfDecay2-Win64-Shipping.exe` (Game Pass name may differ).
3. Use **Find** wizards, then enable the matching freeze/timer.

### Infinite ammo / speed / jump / fly

| Goal | Steps |
| --- | --- |
| Infinite ammo | Find Ammo (int) → fire → Find again → **Infinite Ammo (int timer)** |
| Super speed | Find Speed → **Super Speed** (2500) |
| Super jump | Find Jump → **Super Jump** (2500) |
| Soft fly | Find Gravity → **Fly Gravity 0**; optional **Z Velocity** timer to rise |

True collision noclip / instruction-level no-reload AOBs are still deferred.

Addresses move after relaunch — re-find as needed.

## Safety

- Always backup (CLI writes `.bak`; keep your own copies too).
- Do not run save-bridge scripts while the game has the save open.
- Plane is an unused cut vehicle class — it drives on land and does not fly.
