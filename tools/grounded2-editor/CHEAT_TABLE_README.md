# GGdropmans Grounded 2 Cheat Table

Companion Cheat Engine table for the [Grounded 2 save editor](editor.html) â€” live RAM cheats while Augusta is running (speed / jump / fly are not available in `.csav` files).

**File:** `GGdropmanGrounded2V1.0.CT` (table version **V1.1 â€” Into the Abyss**)

## Support

If this table helps, tip the creator: [paypal.me/kd19902](https://paypal.me/kd19902)

Join the Discord: [discord.gg/PTwyDTFyR](https://discord.gg/PTwyDTFyR)

## Requirements

For Into the Abyss offset recovery, prefer a UE5 SDK dump (**Dumper-7** / [G2Dumper](https://github.com/x0reaxeax/G2Dumper)) over float heuristics, then bake Health/Survival/CMC offsets into ACTIVATE.


- [Cheat Engine](https://www.cheatengine.org/) 7.5+
- **Into the Abyss / current Steam:** attach to `Grounded2Steam-Win64-Shipping.exe`  
  (`Steam\steamapps\common\Grounded2\Augusta\Binaries\Win64\`)
- **Game Pass / GDK:** attach to `Grounded2-WinGDK-Shipping.exe` (or the WinGDK shipping binary under Augusta)
- Older pre-Abyss installs used `Maine-Win64-Shipping.exe` â€” V1.1 still tries legacy AOBs, but prefer the new exe name

## How to use

1. Start Grounded 2 and **load into a world** (not the main menu)
2. Open `GGdropmanGrounded2V1.0.CT` in Cheat Engine
3. Attach to **Grounded2Steam-Win64-Shipping.exe**
4. Tick **[ACTIVATE]** once â€” scans Statistics / GNames / GObjects, tries legacy Player AOBs, then falls back to **GWorld â†’ LocalPlayer â†’ Pawn** resolution and probes CMC
5. Expand groups, edit values, or tick `[Script]` rows

## Into the Abyss notes (V1.1)

- Steam renamed the shipping binary (`Maine` â†’ `Grounded2Steam-Win64`)
- Most old Player / GameState / Gear / Engine AOBs no longer match; Statistics still does
- ACTIVATE rebuilds Player/GameState via GWorld when needed (must be in-world)
- Pond / dive: use **Vitals â†’ Infinite hunger/thirst/oxygen** and movement scripts underwater; Toe-biter buggy uses the **Buggy (mount)** group (re-probe CMC while mounted)
- Pointer chains under GameState (free build, damage scales) may need a follow-up retune if toggles look dead after ACTIVATE

## Whatâ€™s included

| Section | Features |
|--------|----------|
| Movement | Super speed, super jump, no-clip fly, soft fly, teleport to aim (F6), **bookmarks A/B/C + last-pos**, movement mode, collision |
| Quick loadout | **GOD LOADOUT** â€” god vitals + speed Ã—5 + oneshot + free build + bugs ignore (one tick) |
| Buggy (mount) | Re-probe CMC while mounted, buggy super speed, infinite stamina, god HP + pet invuln, buggy noclip, combo |
| Time of day | Freeze rate=0, fast-forward rate=50, probe nearby day floats, snap dawn/noon/dusk |
| Game speed | Probe dilation floats, slow-mo Ã—0.25, turbo Ã—2 / Ã—3 (CustomTimeDilation-style) |
| Gather / combat helpers | One-hit harvest, pickup magnet, XP drip, instant craft, infinite held uses, kill aura (global scales), duplicate held stack, live unlock pack, soft freecam |
| Vitals | Health / stamina / hunger / thirst / oxygen pointers + fill / god / infinite survival scripts |
| Economy | Raw Science, milk molars, mega milk molars |
| Gear | Held item durability / stack / enhancement pointers |
| Gear â€” one-shot / god armor | **One-shot weapons**, **god armor**, combo script |
| Stacks â€” giant stack size | Held stack freeze 9999, StackSize upgrades, haul capacity, combo |
| Mutations / haul | Mutation slot counts, haul capacity |
| World settings | Free build, recipes, bug AI, damage scales, time / hunger rates |
| G2 adaptive | Probe vitals near Player, one-shot damage scale, free-build byte pack, editorâ†”CT map |
| DEBUG | Manual AOB â€œFetch Base Addressesâ€ after a game update |

## Save editor vs this table

| Better in **save editor** | Better in **this .CT** |
|---------------------------|-------------------------|
| Buildings / quests / analyze / fog | Super speed / super jump / no-clip / teleport |
| Hatchery finish, buggy tier, eggs | Live health / stamina / hunger / **oxygen** freeze + **buggy mount** |
| Inventory & resource dump presets | Free build & damage scales while playing |
| Achievements, OP preset, Oodle rewrite | Raw Science / molars without saving |

## If addresses are wrong

1. Confirm attach target is **Grounded2Steam-Win64-Shipping.exe** (not the old Maine name)
2. Be **in-world**, then disable/re-enable **[ACTIVATE]**
3. Run **DEBUG â†’ Fetch Base Addresses (AOB)** and check the CE Lua console
4. If vitals look empty: **G2 adaptive â†’ Probe vitals near Player**
5. On buggy / Toe-biter: **Buggy â†’ Re-probe CMC (mounted)** before speed scripts

## Credits

AOB signatures and many Player / Statistics / GameState offset chains come from community Maine / Grounded CE research (Do0ks / G40sty lineage and Open Cheat Tables). Auto-AOB activate, GWorld fallback for Into the Abyss, CMC probing, G2 adaptive helpers, packaging, and pairing with the GGdropman Grounded 2 save editor are original to this repo.

