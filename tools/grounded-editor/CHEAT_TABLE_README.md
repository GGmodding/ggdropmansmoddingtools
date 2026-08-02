# GGdropmans Grounded Cheat Table

Companion Cheat Engine table for the browser save editor — live RAM cheats while Grounded is running, including **super speed** and **super jump** (not available in `.csav` files).

**File:** `GGdropmanGroundedV1.0.CT`

## Requirements

- [Cheat Engine](https://www.cheatengine.org/) 7.5+
- Grounded Steam (`Maine-Win64-Shipping.exe`) — bases baked for the install under  
  `Steam\steamapps\common\Grounded\Maine\Binaries\Win64\`
- Game Pass / GDK: attach to `Maine-WinGDK-Shipping.exe`, then run **DEBUG → Fetch Base Addresses**

## How to use

1. Start Grounded and load into a world (not the main menu)
2. Open `GGdropmanGroundedV1.0.CT` in Cheat Engine
3. Attach to **Maine-Win64-Shipping.exe**
4. Tick **[ACTIVATE]** once (registers Player / Statistics / Gear / Engine / GameState)
5. Expand groups, edit values, or tick `[Script]` rows

## What’s included

| Section | Features |
|--------|----------|
| Movement | Super speed, super jump, no-clip fly, soft fly, **teleport to aim (F6)**, movement mode, collision |
| Vitals | Health, stamina, hunger, thirst, oxygen (+ fill / freeze scripts) |
| Economy | Raw Science, milk molars, mega milk molars |
| Gear | Held item durability / stack / enhancement pointers |
| Mutations | Max / active mutation slot counts |
| Hauling | Haul capacity + current haul |
| World settings | Free build, recipes, bug AI, damage scales, time / hunger rates |
| Time | Day length / time multiplier pointers |
| DEBUG | AOB “Fetch Base Addresses” after a game update |

## Save editor vs this table

| Better in **save editor** | Better in **this .CT** |
|---------------------------|-------------------------|
| BURG.L purchases / buildings | Super speed / super jump / no-clip fly / teleport to aim |
| Achievements bulk unlock | Live health / stamina / oxygen freeze |
| Chest / inventory cloning | Free build & world toggles while playing |
| OP preset + Oodle rewrite | Raw Science / molars without saving |

Use both: edit the slot offline, then use the table in-session for movement cheats.

## If addresses are wrong

After a Grounded patch:

1. Attach CE to the game
2. Enable **DEBUG → Fetch Base Addresses (AOB)**
3. Copy the printed `exe+OFFSET` lines into **[ACTIVATE]** (or re-run Activate after updating defines)
4. Confirm **Health → Base Health** looks like a normal HP number (~100–200)

Pointer *chains* (offsets under Player/Statistics) usually survive longer than the static base addresses.

## Credits

Static AOB signatures and many Player/Statistics offset chains come from community Grounded CE research (Do0ks / G40sty lineage and Open Cheat Tables). Activation, speed/jump scripts, packaging, and pairing with the GGdropman save editor are original to this repo.
