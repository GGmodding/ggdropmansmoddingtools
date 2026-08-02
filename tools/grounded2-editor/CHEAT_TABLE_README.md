# GGdropmans Grounded 2 Cheat Table

Companion Cheat Engine table for the [Grounded 2 save editor](editor.html) — live RAM cheats while Augusta is running (speed / jump / fly are not available in `.csav` files).

**File:** `GGdropmanGrounded2V1.0.CT`

## Support

If this table helps, tip the creator: [paypal.me/kd19902](https://paypal.me/kd19902)

Join the Discord: [discord.gg/PTwyDTFyR](https://discord.gg/PTwyDTFyR)

## Requirements

- [Cheat Engine](https://www.cheatengine.org/) 7.5+
- Grounded 2 Steam (`Maine-Win64-Shipping.exe`) under the Augusta install
- Game Pass / GDK: attach to `Maine-WinGDK-Shipping.exe` if that is your binary, then enable **[ACTIVATE]** (AOB scan)

## How to use

1. Start Grounded 2 and load into a world (not the main menu)
2. Open `GGdropmanGrounded2V1.0.CT` in Cheat Engine
3. Attach to **Maine-Win64-Shipping.exe**
4. Tick **[ACTIVATE]** once — it AOB-scans Player / Statistics / Gear / Engine / GameState and probes the CharacterMovement offset
5. Expand groups, edit values, or tick `[Script]` rows

## What’s included

| Section | Features |
|--------|----------|
| Movement | Super speed, super jump, no-clip fly, soft fly, teleport to aim (F6), movement mode, collision |
| Vitals | Health / stamina / hunger / thirst / oxygen pointers + fill / god / infinite survival scripts |
| Economy | Raw Science, milk molars, mega milk molars |
| Gear | Held item durability / stack / enhancement pointers |
| Gear — one-shot / god armor | **One-shot weapons** (damage x100 + durability/enhancement freeze), **god armor** (equip durability freeze + low enemy damage), combo script |
| Stacks — giant stack size | **Held stack freeze 9999**, **StackSize.* upgrades → tier 20**, haul capacity 99, combo script |
| Mutations / haul | Mutation slot counts, haul capacity |
| World settings | Free build, recipes, bug AI, damage scales, time / hunger rates |
| G2 adaptive | Probe vitals near Player, one-shot damage scale, free-build byte pack, editor↔CT map |
| DEBUG | Manual AOB “Fetch Base Addresses” after a game update |

## Save editor vs this table

| Better in **save editor** | Better in **this .CT** |
|---------------------------|-------------------------|
| Buildings / quests / analyze / fog | Super speed / super jump / no-clip / teleport |
| Hatchery finish, buggy tier, eggs | Live health / stamina / hunger freeze |
| Inventory & resource dump presets | Free build & damage scales while playing |
| Achievements, OP preset, Oodle rewrite | Raw Science / molars without saving |

Use both: edit the slot offline, then use the table in-session for movement cheats.

## If addresses are wrong

Augusta patches move statics often:

1. Attach CE with the game **in-world**
2. Disable then re-enable **[ACTIVATE]** (re-runs AOB + CMC probe)
3. Or run **DEBUG → Fetch Base Addresses (AOB)** and check the CE console
4. If vitals pointers look empty, run **G2 adaptive → Probe vitals near Player** and add addresses manually
5. Confirm **Health → Base Health** looks like a normal HP number

Pointer *chains* under Player / GameState are from the Grounded (G1) Maine layout and may need retuning on newer Augusta builds; movement scripts adapt more aggressively via the CMC probe.

## Credits

AOB signatures and many Player / Statistics / GameState offset chains come from community Maine / Grounded CE research (Do0ks / G40sty lineage and Open Cheat Tables). Auto-AOB activate, CMC probing, G2 adaptive helpers, packaging, and pairing with the GGdropman Grounded 2 save editor are original to this repo.
