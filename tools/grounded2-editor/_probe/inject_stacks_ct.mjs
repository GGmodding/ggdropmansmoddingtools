/**
 * Inject giant stack size cheats into Grounded 1 & 2 CTs.
 */
import fs from "fs";

const STACK_GROUP = `
        <CheatEntry>
          <ID>320</ID>
          <Description>"Stacks — giant stack size"</Description>
          <Options moHideChildren="1" moManualExpandCollapse="1"/>
          <Color>0040C0A0</Color>
          <GroupHeader>1</GroupHeader>
          <CheatEntries>
            <CheatEntry>
              <ID>321</ID>
              <Description>"[Script] Giant held stack (freeze 9999)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
            {$lua}
            if syntaxcheck then return end
            if getAddressSafe("Player") == nil then
              showMessage("Enable [ACTIVATE] first")
              error("no Player")
            end

            local function resolve(baseSym, offsets)
              local a = getAddress(baseSym)
              if not a then return nil end
              for i = #offsets, 2, -1 do
                a = readQword(a + offsets[i])
                if a == nil or a == 0 then return nil end
              end
              return a + offsets[1]
            end

            local function equipRoot()
              local p = readQword(getAddress("Player"))
              if not p or p == 0 then return nil end
              for _, eoff in ipairs({0x16E8, 0x16F0, 0x1700, 0x16E0, 0x1600}) do
                local r = readQword(p + eoff)
                if r and r &gt; 0x10000 then return r end
              end
              return nil
            end

            -- Stack field on held item is commonly +0x140 (same as CT held Stack pointer).
            local STACK_OFFS = {0x140, 0x138, 0x148, 0x130, 0x150, 0x13C, 0x144}

            gg_giant_held = gg_giant_held or {}
            local st = gg_giant_held
            st.qty = 9999
            st.timer = createTimer(nil, false)
            st.timer.Interval = 150
            st.timer.OnTimer = function()
              local addr = resolve("Player", {0x140, 0x200, 0x16E8})
              if addr then
                local cur = readInteger(addr)
                if cur and cur &gt;= 0 and cur &lt; 100000 then
                  writeInteger(addr, st.qty)
                end
              end
              local root = equipRoot()
              if not root then return end
              for _, soff in ipairs({0x200, 0x1F8, 0x208, 0x1F0, 0x210}) do
                local item = readQword(root + soff)
                if item and item &gt; 0x10000 then
                  for _, foff in ipairs(STACK_OFFS) do
                    local v = readInteger(item + foff)
                    if v and v &gt;= 1 and v &lt; 50000 then
                      writeInteger(item + foff, st.qty)
                    end
                  end
                end
              end
            end
            st.timer.Enabled = true
            print("Giant held stack: freezing quantity at "..tostring(st.qty))

            [DISABLE]
            {$lua}
            if syntaxcheck then return end
            local st = gg_giant_held
            if st and st.timer then
              st.timer.Enabled = false
              st.timer.destroy()
              st.timer = nil
            end
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>322</ID>
              <Description>"[Script] Giant StackSize upgrades (tier 20)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
            {$lua}
            if syntaxcheck then return end
            if getAddressSafe(process) == nil then
              showMessage("Attach to the game first")
              error("no process")
            end

            -- Mirror save-editor giant stacks: push StackSize.* upgrade levels to 20.
            -- Scan writable memory for ASCII names, then write nearby i32 levels.
            local needles = {
              {hex="53 74 61 63 6B 53 69 7A 65 2E 46 6F 6F 64", name="StackSize.Food", len=14},
              {hex="53 74 61 63 6B 53 69 7A 65 2E 52 65 73 6F 75 72 63 65", name="StackSize.Resource", len=18},
              {hex="53 74 61 63 6B 53 69 7A 65 2E 41 6D 6D 6F", name="StackSize.Ammo", len=14},
            }
            local TIER = 20
            local wrote = 0

            local function tryWriteLevels(base, nameLen)
              -- Save layout: FString then i32 level, i32 unk. Live may vary — probe a few spots.
              local candidates = {
                base + nameLen + 1,
                base + nameLen,
                base + nameLen + 4,
                base - 4,
                base + nameLen + 8,
              }
              for _, addr in ipairs(candidates) do
                local v = readInteger(addr)
                if v and v &gt;= 0 and v &lt;= 99 then
                  writeInteger(addr, TIER)
                  wrote = wrote + 1
                  print(string.format("  level @ %X  %d -&gt; %d", addr, v, TIER))
                  return true
                end
              end
              return false
            end

            for _, n in ipairs(needles) do
              local aob = AOBScan(n.hex, "+W*X*C")
              if aob and aob.Count &gt; 0 then
                print(n.name..": "..tostring(aob.Count).." hit(s)")
                local limit = math.min(aob.Count - 1, 12)
                for i = 0, limit do
                  local at = getAddressSafe(aob[i])
                  if at then tryWriteLevels(at, n.len) end
                end
              else
                print(n.name..": MISS (upgrade may use FName only — use held-stack script / save editor)")
              end
              if aob then aob.destroy() end
            end

            -- Also bump haul capacity if the known pointer resolves
            if getAddressSafe("Player") then
              local function resolve(baseSym, offsets)
                local a = getAddress(baseSym)
                if not a then return nil end
                for i = #offsets, 2, -1 do
                  a = readQword(a + offsets[i])
                  if a == nil or a == 0 then return nil end
                end
                return a + offsets[1]
              end
              local haul = resolve("Player", {0xE0, 0x198, 0x18, 0x1A8})
              if haul then
                local prev = readInteger(haul)
                writeInteger(haul, 99)
                print(string.format("Haul capacity %s -&gt; 99", tostring(prev)))
                wrote = wrote + 1
              end
            end

            if wrote == 0 then
              showMessage("No StackSize upgrade levels found in RAM.\\nUse Giant held stack, or set stacks in the save editor.")
            else
              print("Giant StackSize: "..tostring(wrote).." write(s). Re-open bags / drop-pickup if UI is stale.")
            end
            [DISABLE]
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>323</ID>
              <Description>"[Script] Giant stacks combo (held freeze + upgrades)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
            {$lua}
            if syntaxcheck then return end
            if getAddressSafe("Player") == nil then
              showMessage("Enable [ACTIVATE] first")
              error("no Player")
            end

            local function resolve(baseSym, offsets)
              local a = getAddress(baseSym)
              if not a then return nil end
              for i = #offsets, 2, -1 do
                a = readQword(a + offsets[i])
                if a == nil or a == 0 then return nil end
              end
              return a + offsets[1]
            end

            -- One-shot upgrade write
            local needles = {
              {hex="53 74 61 63 6B 53 69 7A 65 2E 46 6F 6F 64", len=14},
              {hex="53 74 61 63 6B 53 69 7A 65 2E 52 65 73 6F 75 72 63 65", len=18},
              {hex="53 74 61 63 6B 53 69 7A 65 2E 41 6D 6D 6F", len=14},
            }
            for _, n in ipairs(needles) do
              local aob = AOBScan(n.hex, "+W*X*C")
              if aob and aob.Count &gt; 0 then
                local limit = math.min(aob.Count - 1, 8)
                for i = 0, limit do
                  local at = getAddressSafe(aob[i])
                  if at then
                    for _, rel in ipairs({n.len + 1, n.len, n.len + 4}) do
                      local v = readInteger(at + rel)
                      if v and v &gt;= 0 and v &lt;= 99 then writeInteger(at + rel, 20) end
                    end
                  end
                end
              end
              if aob then aob.destroy() end
            end

            local haul = resolve("Player", {0xE0, 0x198, 0x18, 0x1A8})
            if haul then writeInteger(haul, 99) end

            gg_giant_combo = gg_giant_combo or {}
            local st = gg_giant_combo
            st.timer = createTimer(nil, false)
            st.timer.Interval = 150
            st.timer.OnTimer = function()
              local addr = resolve("Player", {0x140, 0x200, 0x16E8})
              if addr then
                local cur = readInteger(addr)
                if cur and cur &gt;= 0 and cur &lt; 100000 then writeInteger(addr, 9999) end
              end
              if haul then writeInteger(haul, 99) end
            end
            st.timer.Enabled = true
            print("Giant stacks combo: upgrades→20, haul→99, held stack freeze 9999")

            [DISABLE]
            {$lua}
            if syntaxcheck then return end
            local st = gg_giant_combo
            if st and st.timer then
              st.timer.Enabled = false
              st.timer.destroy()
              st.timer = nil
            end
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>324</ID>
              <Description>"Held Stack (manual)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>4 Bytes</VariableType>
              <Address>Player</Address>
              <Offsets>
                <Offset>140</Offset>
                <Offset>200</Offset>
                <Offset>16E8</Offset>
              </Offsets>
            </CheatEntry>
            <CheatEntry>
              <ID>325</ID>
              <Description>"Haul Capacity (manual)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>4 Bytes</VariableType>
              <Address>Player</Address>
              <Offsets>
                <Offset>E0</Offset>
                <Offset>198</Offset>
                <Offset>18</Offset>
                <Offset>1A8</Offset>
              </Offsets>
            </CheatEntry>
          </CheatEntries>
        </CheatEntry>
`;

function inject(ctPath, label) {
  let xml = fs.readFileSync(ctPath, "utf8");
  if (xml.includes('Description>"Stacks — giant stack size"') || xml.includes('Description>"Stacks - giant stack size"')) {
    console.log(label + ": already has stacks group");
    return;
  }
  const markers = [
    /(<CheatEntry>\s*<ID>300<\/ID>\s*<Description>"Gear [—\-] one-shot \/ god armor"<\/Description>)/,
    /(<CheatEntry>\s*<ID>51<\/ID>\s*<Description>"Held gear \(right hand\)"<\/Description>)/,
    /(<CheatEntry>\s*<ID>72<\/ID>\s*<Description>"World settings \(GameState\)"<\/Description>)/,
  ];
  let done = false;
  for (const re of markers) {
    if (re.test(xml)) {
      xml = xml.replace(re, STACK_GROUP + "\n        $1");
      done = true;
      break;
    }
  }
  if (!done) throw new Error("No insert marker in " + ctPath);
  fs.writeFileSync(ctPath, xml);
  console.log(label + ": injected stacks group, bytes", xml.length);
}

inject(
  "C:/Users/Owner/Downloads/ggdropmansmoddingtools/tools/grounded-editor/GGdropmanGroundedV1.0.CT",
  "G1"
);
inject(
  "C:/Users/Owner/Downloads/ggdropmansmoddingtools/tools/grounded2-editor/GGdropmanGrounded2V1.0.CT",
  "G2"
);
