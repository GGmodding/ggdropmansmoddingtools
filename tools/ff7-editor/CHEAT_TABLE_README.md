# GGdropmans FF7 Steam Cheat Table

Companion Cheat Engine table for the browser save editor.

**File:** `GGdropmans_FF7_Steam.CT`

## Requirements

- [Cheat Engine](https://www.cheatengine.org/) 7.x+
- Final Fantasy VII **Steam classic** (`ff7_en.exe`) — 2013 remaster
- Not for Remake / Rebirth
- 2026 “Steam Edition” only works if it still runs `ff7_en.exe`

## How to use

1. Start FF7 and load a save
2. Open `GGdropmans_FF7_Steam.CT` in Cheat Engine
3. Attach to **ff7_en.exe**
4. Expand groups and edit values, or tick the `[Script]` rows once

## What’s included

| Section | Features |
|--------|----------|
| Gil & Party | Gil, party slots, max gil, enable Sephiroth |
| Characters | Stats / HP / MP / EXP / limits for all 9 records |
| Items | Slot view + set owned to ×99 + fill all items |
| Materia | Master owned + add all materia mastered |
| Chocobos | Stable fields + fill 6 gold chocobos |
| Scripts | Max stats + unlock all limits for everyone |

## If addresses are wrong

After a game update:

1. Search your current **Gil** as Exact Value, **4 Bytes**
2. New savemap base = `GilAddress - 0xB7C`
3. Replace `ff7_en.exe+9BFD38` in the table (or ask CE to recalculate)

Default assumes Gil at `ff7_en.exe+9C08B4` (common Steam EN build).

## Tip

Always **save in-game** after edits so changes write into your `.ff7` file. For offline editing without the game running, use the browser editor instead.
