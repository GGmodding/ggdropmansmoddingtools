/**
 * Patch copied G1 CT into Grounded 2 companion table.
 * - Auto-AOB [ACTIVATE] (no baked Augusta module offsets)
 * - Adaptive CMC offset probe for movement scripts
 * - G2 branding + editor feature map in README entry
 */
import fs from "fs";
import path from "path";

const ctPath = path.resolve("../GGdropmanGrounded2V1.0.CT");
let xml = fs.readFileSync(ctPath, "utf8");

xml = xml.replace(/GGdropmans Grounded V1\.0/g, "GGdropmans Grounded 2 V1.0");
xml = xml.replace(/GGdropman Grounded V1\.0/g, "GGdropman Grounded 2 V1.0");
xml = xml.replace(/Grounded Cheat Table V1\.0/g, "Grounded 2 Cheat Table V1.0");
xml = xml.replace(
  /Companion to tools\/grounded-editor \(browser save editor\)\./g,
  "Companion to tools/grounded2-editor (Augusta / Grounded 2 save editor)."
);
xml = xml.replace(
  /Offline unlocks \(buildings, BURG\.L purchases, achievements, OP preset\)\s+stay in the browser save editor — they are not stable as one-click RAM patches\./g,
  `Offline unlocks (buildings, quests, analyze, fog, hatchery, buggy tier, OP preset, inventory dumps)
                stay in the browser save editor — use this .CT for live movement / vitals / world toggles.`
);

const newActivate = `<AssemblerScript>[ENABLE]
        {$lua}
        if syntaxcheck then return end
        if getAddressSafe(process) == nil then
          showMessage("Attach to Maine-Win64-Shipping.exe (Grounded 2 / Augusta) first")
          error("no process")
        end

        -- Resolve GNames/UObject statics via AOB (same Maine UE signatures as G1 lineage).
        -- After a major Augusta patch, re-enable [ACTIVATE] or run DEBUG → Fetch Base Addresses.
        local aobList = {
          "4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 40 01 00 00 48 89 9C 24 A0 00 00 00 48 85 C0",
          "4C 8B 35 ?? ?? ?? ?? 48 63 05 ?? ?? ?? ?? 4D 8D 24 C6 4D 3B F4",
          "48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B 9C 24 C0 00 00 00 44 88 A7 C0",
          "48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 F8 0A 00 00 48 85 C9 74 07 48 8B",
          "48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 80 02 00 00 74 11"
        }
        local aobNames = {"Player","Statistics","GearData","EngineData","GameState"}
        local xbase = getAddress(process)
        local defs = {}
        local miss = {}
        print("GGdropman Grounded 2: scanning AOBs on "..tostring(process).."…")
        for i = 1, #aobList do
          local aob = AOBScan(aobList[i], "+X*C*W")
          if aob == nil or aob.Count == 0 then
            miss[#miss+1] = aobNames[i]
            print(aobNames[i]..": MISS")
          else
            local instruct = getAddressSafe(aob[0])
            local distance = readInteger(instruct + 3)
            local instructSize = getInstructionSize(instruct)
            local address = (instruct + distance + instructSize) - xbase
            defs[aobNames[i]] = string.format("%s+%X", process, address)
            print(string.format("%s: %s", aobNames[i], defs[aobNames[i]]))
          end
          if aob then aob.destroy() end
        end
        if #miss &gt; 0 then
          showMessage("AOB miss: "..table.concat(miss, ", ").."\\nPointer groups for those symbols will be empty until the signature is updated.")
        end
        if not defs.Player then
          showMessage("Player AOB failed — cannot activate. Game must be in-world (not main menu).")
          error("no Player AOB")
        end

        local aa = ""
        for _, n in ipairs(aobNames) do
          if defs[n] then
            aa = aa.."define("..n..","..defs[n]..")\\n"
            aa = aa.."registersymbol("..n..")\\n"
          end
        end
        autoAssemble(aa)

        -- Probe CharacterMovementComponent pointer on the player pawn (UE offset drifts on Augusta).
        gg2_cmc_off = nil
        local pawns = {0xDC8, 0xE00, 0xE08, 0xD80, 0xD00, 0xC80, 0xF00, 0x1080, 0x1100}
        local pRoot = readQword(getAddress("Player"))
        if pRoot and pRoot ~= 0 then
          for _, off in ipairs(pawns) do
            local c = readQword(pRoot + off)
            if c and c &gt; 0x10000 then
              -- Heuristic: CMC has MaxWalkSpeed-like floats in 0x140..0x360
              for foff = 0x140, 0x360, 4 do
                local v = readFloat(c + foff)
                if v and v &gt; 200 and v &lt; 1200 then
                  gg2_cmc_off = off
                  print(string.format("CMC candidate Player+0x%X (walk~%.0f @ +0x%X)", off, v, foff))
                  break
                end
              end
            end
            if gg2_cmc_off then break end
          end
        end
        if not gg2_cmc_off then
          gg2_cmc_off = 0xDC8
          print("CMC offset fallback Player+0xDC8 (move around and re-ACTIVATE if speed scripts fail)")
        end

        print("GGdropman Grounded 2 V1.0 activated")
        [DISABLE]
        {$lua}
        if syntaxcheck then return end
        autoAssemble([[
        unregistersymbol(Player)
        unregistersymbol(Statistics)
        unregistersymbol(GearData)
        unregistersymbol(EngineData)
        unregistersymbol(GameState)
        ]])
        gg2_cmc_off = nil
        </AssemblerScript>`;

// Replace the [ACTIVATE] assembler block (first big script after README)
xml = xml.replace(
  /(<Description>"\[ACTIVATE\] register symbols"<\/Description>[\s\S]*?<VariableType>Auto Assembler Script<\/VariableType>\s*)<AssemblerScript>[\s\S]*?<\/AssemblerScript>/,
  `$1${newActivate}`
);

// Patch CMC helper in movement scripts to use gg2_cmc_off
xml = xml.replace(
  /return readQword\(p \+ 0xDC8\)/g,
  "return readQword(p + (gg2_cmc_off or 0xDC8))"
);
xml = xml.replace(
  /local c = readQword\(p \+ 0xDC8\)/g,
  "local c = readQword(p + (gg2_cmc_off or 0xDC8))"
);

// Soften process name in attach hints already covered; update Fetch AOB print
xml = xml.replace(
  /print\("Fetching Base Addresses\.\.\."\)/,
  'print("Fetching Grounded 2 Base Addresses…")'
);

fs.writeFileSync(ctPath, xml);
console.log("Patched", ctPath, "bytes", xml.length);
