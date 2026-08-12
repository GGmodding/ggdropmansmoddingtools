
        if syntaxcheck then return end

        local function fail(msg)
          print("ACTIVATE FAIL: "..tostring(msg))
          showMessage("ACTIVATE failed:\n"..tostring(msg))
          error(msg, 0)
        end

        local ok, err = pcall(function()
          if getAddressSafe(process) == nil then
            fail("No process attached.\nAttach to Grounded2Steam-Win64-Shipping.exe\n(or Grounded2-WinGDK-Shipping.exe), load into a WORLD, then try again.")
          end

          local pname = tostring(process)
          print("GGdropman G2 V1.1 ACTIVATE on "..pname)

          -- cleanup prior partial activate
          if gg2_player_watch and gg2_player_watch.timer then
            pcall(function()
              gg2_player_watch.timer.Enabled = false
              gg2_player_watch.timer.destroy()
            end)
            gg2_player_watch.timer = nil
          end
          for _, n in ipairs({"Player","Statistics","GearData","EngineData","GameState","GWorld","GNames","GObjects","GG2_PlayerHolder","GG2_GameStateHolder","GG2_WorldHolder"}) do
            pcall(function() autoAssemble("unregistersymbol("..n..")") end)
          end
          pcall(function() autoAssemble("dealloc(GG2_PlayerHolder)") end)
          pcall(function() autoAssemble("dealloc(GG2_GameStateHolder)") end)
          pcall(function() autoAssemble("dealloc(GG2_WorldHolder)") end)

          local function aobRip(pattern, label)
            local aob = AOBScan(pattern, "+X*C*W")
            if aob == nil or aob.Count == 0 then
              print((label or "?")..": MISS")
              return nil
            end
            local instruct = getAddressSafe(aob[0])
            aob.destroy()
            if instruct == nil then
              print((label or "?")..": hit but bad address")
              return nil
            end
            local rel = readInteger(instruct + 3)
            -- rip-relative lea/mov is 7 bytes (do not rely on getInstructionSize)
            local abs = instruct + 7 + rel
            local xbase = getAddress(process)
            local def = string.format("%s+%X", process, abs - xbase)
            print((label or "?")..": "..def)
            return def
          end

          local defs = {}
          defs.Statistics = aobRip("4C 8B 35 ?? ?? ?? ?? 48 63 05 ?? ?? ?? ?? 4D 8D 24 C6 4D 3B F4", "Statistics")
          defs.GNames     = aobRip("48 8D 0D ?? ?? ?? ?? E8 ?? ?? FE FF 4C 8B C0 C6 05 ?? ?? ?? ?? 01", "GNames")
          defs.GObjects   = aobRip("4C 8B 0D ?? ?? ?? ?? 41 3B C0 7D 17", "GObjects")
          defs.Player     = aobRip("4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 40 01 00 00 48 89 9C 24 A0 00 00 00 48 85 C0", "Player(legacy)")
          defs.GearData   = aobRip("48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B 9C 24 C0 00 00 00 44 88 A7 C0", "GearData(legacy)")
          defs.EngineData = aobRip("48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 F8 0A 00 00 48 85 C9 74 07 48 8B", "EngineData(legacy)")
          defs.GameState  = aobRip("48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 80 02 00 00 74 11", "GameState(legacy)")

          local gwList = {
            "48 8B 1D ?? ?? ?? ?? 48 85 DB 74 11 48 8B 1B",
            "48 8B 1D ?? ?? ?? ?? 48 85 DB 74 ?? 48 8B",
            "48 8B 05 ?? ?? ?? ?? 48 85 C0 74 ?? 4C 8B",
            "48 8B 05 ?? ?? ?? ?? 48 85 C0 75 ?? 48 8B",
          }
          for i, pat in ipairs(gwList) do
            local d = aobRip(pat, "GWorld#"..i)
            if d then defs.GWorld = d; break end
          end

          local function aa(s)
            local ok2, e2 = autoAssemble(s)
            if ok2 == false then error("autoAssemble failed: "..tostring(s).." / "..tostring(e2)) end
          end

          aa([[
alloc(GG2_PlayerHolder, 8)
alloc(GG2_GameStateHolder, 8)
alloc(GG2_WorldHolder, 8)
registersymbol(GG2_PlayerHolder)
registersymbol(GG2_GameStateHolder)
registersymbol(GG2_WorldHolder)
]])

          for _, n in ipairs({"Statistics","GNames","GObjects","GearData","EngineData","GWorld"}) do
            if defs[n] then aa("define("..n..","..defs[n]..")\nregistersymbol("..n..")") end
          end

          gg2_cmc_off = nil
          local function looksPawn(pawn)
            if pawn == nil or pawn == 0 or pawn < 0x10000 then return false end
            for _, cmcOff in ipairs({0xDC8,0xE00,0xE08,0xD80,0xD00,0xC80,0xF00,0x1080,0x1100,0xB80,0xC00,0x1180}) do
              local c = readQword(pawn + cmcOff)
              if c ~= nil and c > 0x10000 then
                for f = 0x140, 0x400, 4 do
                  local v = readFloat(c + f)
                  if v ~= nil and v > 80 and v < 4000 then
                    gg2_cmc_off = cmcOff
                    return true
                  end
                end
              end
            end
            return false
          end

          local function resolveFromWorld(world)
            if world == nil or world == 0 then return nil, nil end
            local pawn, gs = nil, nil
            for _, gsoff in ipairs({0x120,0x140,0x158,0x160,0x1A0,0x1B0,0x1C0,0x1D0,0x1D8,0x1E0,0x1F0,0x200,0x220,0x240,0x280,0x2A0,0x2C0,0x300}) do
              local cand = readQword(world + gsoff)
              if cand ~= nil and cand > 0x10000 then
                local vf = readQword(cand)
                if vf ~= nil and vf > 0x10000 then
                  gs = cand
                  gg2_gs_off = gsoff
                  break
                end
              end
            end
            for _, gioff in ipairs({0x160,0x180,0x1A0,0x1A8,0x1B0,0x1B8,0x1C0,0x1C8,0x1D0,0x1E0,0x1F0,0x200,0x210,0x220,0x240}) do
              local gi = readQword(world + gioff)
              if gi ~= nil and gi > 0x10000 then
                for _, lpoff in ipairs({0x38,0x40,0x48,0x50}) do
                  local data = readQword(gi + lpoff)
                  local num = readInteger(gi + lpoff + 8)
                  if data ~= nil and num ~= nil and num >= 1 and num <= 8 then
                    local lp = readQword(data)
                    if lp ~= nil and lp > 0x10000 then
                      for _, pcoff in ipairs({0x30,0x28,0x38,0x40,0x48}) do
                        local pc = readQword(lp + pcoff)
                        if pc ~= nil and pc > 0x10000 then
                          for _, poff in ipairs({0x250,0x2A0,0x2C0,0x2E0,0x2F0,0x300,0x320,0x330,0x338,0x340,0x348,0x350,0x358,0x360,0x368,0x370,0x380,0x390,0x3A0,0x3B0,0x3C0}) do
                            local p = readQword(pc + poff)
                            if looksPawn(p) then
                              print(string.format("Pawn via World GI+0x%X LP+0x%X PC+0x%X Pawn+0x%X CMC+0x%X", gioff, lpoff, pcoff, poff, gg2_cmc_off or 0))
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

          local pawn, gs = nil, nil
          local playerMode = "none"

          if defs.Player then
            aa("define(Player,"..defs.Player..")\nregistersymbol(Player)")
            pawn = readQword(getAddress("Player"))
            if looksPawn(pawn) then
              playerMode = "legacy-aob"
            else
              pawn = nil
              pcall(function() autoAssemble("unregistersymbol(Player)") end)
            end
          end

          if pawn == nil and defs.GWorld then
            local world = readQword(getAddress("GWorld"))
            writeQword(getAddress("GG2_WorldHolder"), world or 0)
            pawn, gs = resolveFromWorld(world)
            if pawn ~= nil then playerMode = "gworld" end
          end

          -- brute more GWorld AOBs if still no pawn
          if pawn == nil then
            for i, pat in ipairs(gwList) do
              local d = aobRip(pat, "GWorld-retry#"..i)
              if d then
                pcall(function() autoAssemble("unregistersymbol(GWorld)") end)
                aa("define(GWorld,"..d..")\nregistersymbol(GWorld)")
                local world = readQword(getAddress("GWorld"))
                writeQword(getAddress("GG2_WorldHolder"), world or 0)
                pawn, gs = resolveFromWorld(world)
                if pawn ~= nil then playerMode = "gworld-retry"; break end
              end
            end
          end

          if defs.GameState then
            aa("define(GameState,"..defs.GameState..")\nregistersymbol(GameState)")
          elseif gs ~= nil then
            aa("define(GameState,GG2_GameStateHolder)\nregistersymbol(GameState)")
            writeQword(getAddress("GG2_GameStateHolder"), gs)
          end

          if playerMode == "legacy-aob" then
            -- already registered
          elseif pawn ~= nil then
            aa("define(Player,GG2_PlayerHolder)\nregistersymbol(Player)")
            writeQword(getAddress("GG2_PlayerHolder"), pawn)
            gg2_player_watch = gg2_player_watch or {}
            gg2_player_watch.timer = createTimer(nil, false)
            gg2_player_watch.timer.Interval = 700
            gg2_player_watch.timer.OnTimer = function()
              if getAddressSafe("GWorld") == nil then return end
              local world = readQword(getAddress("GWorld"))
              local p2 = resolveFromWorld(world)
              if p2 ~= nil then writeQword(getAddress("GG2_PlayerHolder"), p2) end
            end
            gg2_player_watch.timer.Enabled = true
          else
            -- still register a holder so table opens; warn hard
            aa("define(Player,GG2_PlayerHolder)\nregistersymbol(Player)")
            writeQword(getAddress("GG2_PlayerHolder"), 0)
            showMessage("ACTIVATE partial: Player pawn not found yet.\n\nYou MUST be in-world (not main menu).\nStatistics may still work.\n\nWalk around, then disable+enable [ACTIVATE] again.\n\nProcess: "..pname.."\nCheck CE Lua Engine console for MISS lines.")
            print("ACTIVATE partial - no pawn")
            return
          end

          if gg2_cmc_off == nil then
            looksPawn(readQword(getAddress("Player")))
          end
          if gg2_cmc_off == nil then gg2_cmc_off = 0xDC8 end

          local msg = string.format("Grounded 2 V1.1 ACTIVATE OK\nProcess: %s\nPlayer: %s\nCMC: +0x%X\nStatistics: %s\nGWorld: %s",
            pname, playerMode, gg2_cmc_off,
            defs.Statistics and "yes" or "no",
            defs.GWorld and "yes" or "no")
          print(msg:gsub("\n", " | "))
          showMessage(msg)
        end)

        if not ok then
          fail(err)
        end

        
