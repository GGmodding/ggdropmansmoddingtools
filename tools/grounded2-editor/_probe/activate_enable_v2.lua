
if syntaxcheck then return end

local function say(msg)
  print(tostring(msg))
  showMessage(tostring(msg))
end

if getAddressSafe(process) == nil then
  say("Attach to Grounded2Steam-Win64-Shipping.exe first.\nLoad into a world, then enable ACTIVATE.")
  error("no process", 0)
end

print("GGdropman G2 V1.1 ACTIVATE on "..tostring(process))

-- cleanup old symbols/allocs from a previous try
if gg2_player_watch ~= nil and gg2_player_watch.timer ~= nil then
  gg2_player_watch.timer.Enabled = false
  gg2_player_watch.timer.destroy()
  gg2_player_watch.timer = nil
end

local oldSyms = {"Player","Statistics","GearData","EngineData","GameState","GWorld","GNames","GObjects","GG2_PlayerHolder","GG2_GameStateHolder","GG2_WorldHolder"}
for i=1,#oldSyms do
  if getAddressSafe(oldSyms[i]) ~= nil then
    autoAssemble("unregistersymbol("..oldSyms[i]..")")
  end
end
autoAssemble("dealloc(GG2_PlayerHolder)")
autoAssemble("dealloc(GG2_GameStateHolder)")
autoAssemble("dealloc(GG2_WorldHolder)")

local function aobRip(pattern, label)
  local aob = AOBScan(pattern, "+X*C*W")
  if aob == nil or aob.Count == 0 then
    print(label..": MISS")
    return nil
  end
  local instruct = aob[0]
  aob.destroy()
  if instruct == nil then
    print(label..": bad hit")
    return nil
  end
  local rel = readInteger(instruct + 3)
  local abs = instruct + 7 + rel
  local def = string.format("%s+%X", process, abs - getAddress(process))
  print(label..": "..def)
  return def
end

local defs = {}
defs.Statistics = aobRip("4C 8B 35 ?? ?? ?? ?? 48 63 05 ?? ?? ?? ?? 4D 8D 24 C6 4D 3B F4", "Statistics")
defs.GNames = aobRip("48 8D 0D ?? ?? ?? ?? E8 ?? ?? FE FF 4C 8B C0 C6 05 ?? ?? ?? ?? 01", "GNames")
defs.GObjects = aobRip("4C 8B 0D ?? ?? ?? ?? 41 3B C0 7D 17", "GObjects")
defs.Player = aobRip("4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 40 01 00 00 48 89 9C 24 A0 00 00 00 48 85 C0", "Player")
defs.GearData = aobRip("48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B 9C 24 C0 00 00 00 44 88 A7 C0", "GearData")
defs.EngineData = aobRip("48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 F8 0A 00 00 48 85 C9 74 07 48 8B", "EngineData")
defs.GameState = aobRip("48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 80 02 00 00 74 11", "GameState")
defs.GWorld = aobRip("48 8B 1D ?? ?? ?? ?? 48 85 DB 74 11 48 8B 1B", "GWorld")
if defs.GWorld == nil then
  defs.GWorld = aobRip("48 8B 1D ?? ?? ?? ?? 48 85 DB 74 ?? 48 8B", "GWorld2")
end

autoAssemble("alloc(GG2_PlayerHolder, 8)\nregistersymbol(GG2_PlayerHolder)")
autoAssemble("alloc(GG2_GameStateHolder, 8)\nregistersymbol(GG2_GameStateHolder)")
autoAssemble("alloc(GG2_WorldHolder, 8)\nregistersymbol(GG2_WorldHolder)")

local names = {"Statistics","GNames","GObjects","GearData","EngineData","GWorld","GameState","Player"}
for i=1,#names do
  local n = names[i]
  if defs[n] ~= nil then
    autoAssemble("define("..n..","..defs[n]..")\nregistersymbol("..n..")")
  end
end

gg2_cmc_off = nil

local function looksPawn(pawn)
  if pawn == nil or pawn == 0 then return false end
  if pawn < 0x10000 then return false end
  local cmcOffs = {0xDC8,0xE00,0xE08,0xD80,0xD00,0xC80,0xF00,0x1080,0x1100,0xB80,0xC00}
  for i=1,#cmcOffs do
    local c = readQword(pawn + cmcOffs[i])
    if c ~= nil and c > 0x10000 then
      local f = 0x140
      while f <= 0x400 do
        local v = readFloat(c + f)
        if v ~= nil and v > 80 and v < 4000 then
          gg2_cmc_off = cmcOffs[i]
          return true
        end
        f = f + 4
      end
    end
  end
  return false
end

local function resolveFromWorld(world)
  if world == nil or world == 0 then return nil, nil end
  local gs = nil
  local gsoffs = {0x120,0x140,0x158,0x160,0x1A0,0x1B0,0x1C0,0x1D0,0x1D8,0x1E0,0x200,0x220,0x240,0x280,0x2A0}
  for i=1,#gsoffs do
    local cand = readQword(world + gsoffs[i])
    if cand ~= nil and cand > 0x10000 then
      local vf = readQword(cand)
      if vf ~= nil and vf > 0x10000 then
        gs = cand
        gg2_gs_off = gsoffs[i]
        break
      end
    end
  end

  local gioffs = {0x160,0x180,0x1A0,0x1A8,0x1B0,0x1B8,0x1C0,0x1C8,0x1D0,0x1E0,0x200,0x210,0x220}
  local lpoffs = {0x38,0x40,0x48}
  local pcoffs = {0x30,0x28,0x38,0x40}
  local poffs = {0x2A0,0x2F0,0x330,0x338,0x340,0x348,0x350,0x358,0x360,0x370,0x380,0x390,0x3A0}

  for a=1,#gioffs do
    local gi = readQword(world + gioffs[a])
    if gi ~= nil and gi > 0x10000 then
      for b=1,#lpoffs do
        local data = readQword(gi + lpoffs[b])
        local num = readInteger(gi + lpoffs[b] + 8)
        if data ~= nil and num ~= nil and num >= 1 and num <= 8 then
          local lp = readQword(data)
          if lp ~= nil and lp > 0x10000 then
            for c=1,#pcoffs do
              local pc = readQword(lp + pcoffs[c])
              if pc ~= nil and pc > 0x10000 then
                for d=1,#poffs do
                  local p = readQword(pc + poffs[d])
                  if looksPawn(p) then
                    print(string.format("Pawn GI+0x%X LP+0x%X PC+0x%X Pawn+0x%X CMC+0x%X", gioffs[a], lpoffs[b], pcoffs[c], poffs[d], gg2_cmc_off))
                    return p, gs
                  end
                end
              end
            end
          end
        end
      end
    end
  end
  return nil, gs
end

local pawn = nil
local gs = nil
local playerMode = "none"

if defs.Player ~= nil then
  pawn = readQword(getAddress("Player"))
  if looksPawn(pawn) then
    playerMode = "legacy-aob"
  else
    pawn = nil
  end
end

if pawn == nil and getAddressSafe("GWorld") ~= nil then
  local world = readQword(getAddress("GWorld"))
  writeQword(getAddress("GG2_WorldHolder"), world or 0)
  pawn, gs = resolveFromWorld(world)
  if pawn ~= nil then
    playerMode = "gworld"
  end
end

if defs.GameState == nil and gs ~= nil then
  autoAssemble("define(GameState,GG2_GameStateHolder)\nregistersymbol(GameState)")
  writeQword(getAddress("GG2_GameStateHolder"), gs)
end

if playerMode == "legacy-aob" then
  -- Player already defined from AOB
elseif pawn ~= nil then
  if getAddressSafe("Player") ~= nil then
    autoAssemble("unregistersymbol(Player)")
  end
  autoAssemble("define(Player,GG2_PlayerHolder)\nregistersymbol(Player)")
  writeQword(getAddress("GG2_PlayerHolder"), pawn)
else
  if getAddressSafe("Player") == nil then
    autoAssemble("define(Player,GG2_PlayerHolder)\nregistersymbol(Player)")
  end
  writeQword(getAddress("GG2_PlayerHolder"), 0)
  say("ACTIVATE partial - Player pawn not found.\n\nBe IN-WORLD (not main menu).\nAttach: Grounded2Steam-Win64-Shipping.exe\n\nStatistics scan: "..tostring(defs.Statistics ~= nil).."\nGWorld scan: "..tostring(defs.GWorld ~= nil).."\n\nOpen Memory Viewer - Tools - Lua Engine to see MISS lines.")
  error("no pawn", 0)
end

if gg2_cmc_off == nil then
  looksPawn(readQword(getAddress("Player")))
end
if gg2_cmc_off == nil then
  gg2_cmc_off = 0xDC8
end

say(string.format("Grounded 2 V1.1 ACTIVATE OK\nProcess: %s\nPlayer mode: %s\nCMC: +0x%X\nStatistics: %s\nGWorld: %s", tostring(process), playerMode, gg2_cmc_off, tostring(defs.Statistics ~= nil), tostring(defs.GWorld ~= nil)))


