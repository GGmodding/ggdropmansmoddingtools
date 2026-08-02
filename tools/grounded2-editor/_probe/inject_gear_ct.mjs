/**
 * Inject one-shot weapon + god armor scripts into Grounded 1 & 2 CTs.
 */
import fs from "fs";

const GEAR_GROUP = `
        <CheatEntry>
          <ID>300</ID>
          <Description>"Gear — one-shot / god armor"</Description>
          <Options moHideChildren="1" moManualExpandCollapse="1"/>
          <Color>00FF6040</Color>
          <GroupHeader>1</GroupHeader>
          <CheatEntries>
            <CheatEntry>
              <ID>301</ID>
              <Description>"[Script] One-shot weapons (held + damage x100)"</Description>
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
              return readQword(p + 0x16E8)
            end

            -- Item instance slots under Equipment (right hand is commonly +0x200).
            local SLOT_OFFS = {0x200, 0x1F8, 0x208, 0x1F0, 0x210, 0x1E8, 0x218, 0x1E0, 0x220, 0x1D8, 0x228, 0x1D0}

            local function buffItem(item)
              if not item or item == 0 or item &lt; 0x10000 then return false end
              -- Durability float (held-gear chain field +0x228)
              local dur = readFloat(item + 0x228)
              if dur and dur &gt;= 0 and dur &lt; 1e8 then
                writeFloat(item + 0x228, 99999)
              end
              -- Base / bonus enhancement ints
              local be = readInteger(item + 0x250)
              local bo = readInteger(item + 0x254)
              if be and be &gt;= 0 and be &lt; 64 then writeInteger(item + 0x250, 15) end
              if bo and bo &gt;= 0 and bo &lt; 64 then writeInteger(item + 0x254, 15) end
              -- Attack-ish floats near enhancement (best-effort)
              for _, foff in ipairs({0x240, 0x244, 0x248, 0x24C, 0x258, 0x25C, 0x260, 0x264}) do
                local v = readFloat(item + foff)
                if v and v &gt; 0.5 and v &lt; 500 then
                  writeFloat(item + foff, 100)
                end
              end
              return true
            end

            gg_gear_oneshot = gg_gear_oneshot or {}
            local st = gg_gear_oneshot
            st.dmgAddr = resolve("GameState", {0x50, 0x138, 0x388, 0x170})
            if st.dmgAddr then
              st.dmgPrev = readFloat(st.dmgAddr)
              writeFloat(st.dmgAddr, 100)
              print(string.format("PlayerDamage scale -&gt; 100 (was %.2f)", st.dmgPrev or -1))
            else
              print("GameState damage scale miss — still buffing held item stats")
            end

            st.timer = createTimer(nil, false)
            st.timer.Interval = 100
            st.timer.OnTimer = function()
              if st.dmgAddr then writeFloat(st.dmgAddr, 100) end
              local root = equipRoot()
              if not root then return end
              for _, soff in ipairs(SLOT_OFFS) do
                buffItem(readQword(root + soff))
              end
              -- Also refresh classic held-gear pointer chain
              local durA = resolve("Player", {0x228, 0x200, 0x16E8})
              if durA then writeFloat(durA, 99999) end
              local beA = resolve("Player", {0x250, 0x200, 0x16E8})
              if beA then writeInteger(beA, 15) end
              local boA = resolve("Player", {0x254, 0x200, 0x16E8})
              if boA then writeInteger(boA, 15) end
            end
            st.timer.Enabled = true
            print("One-shot weapons: damage x100 + held durability/enhancement freeze")

            [DISABLE]
            {$lua}
            if syntaxcheck then return end
            local st = gg_gear_oneshot
            if st and st.timer then
              st.timer.Enabled = false
              st.timer.destroy()
              st.timer = nil
            end
            if st and st.dmgAddr and st.dmgPrev then
              writeFloat(st.dmgAddr, st.dmgPrev)
            end
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>302</ID>
              <Description>"[Script] God mode armor (equip durability freeze)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
            {$lua}
            if syntaxcheck then return end
            if getAddressSafe("Player") == nil then
              showMessage("Enable [ACTIVATE] first")
              error("no Player")
            end

            local function equipRoot()
              local p = readQword(getAddress("Player"))
              if not p or p == 0 then return nil end
              -- Try a few EquipmentComponent-ish offsets on the pawn
              for _, eoff in ipairs({0x16E8, 0x16F0, 0x1700, 0x16E0, 0x1600, 0x1580}) do
                local r = readQword(p + eoff)
                if r and r &gt; 0x10000 then
                  local probe = readQword(r + 0x200)
                  if probe and probe &gt; 0x10000 then return r end
                end
              end
              return readQword(p + 0x16E8)
            end

            local SLOT_OFFS = {
              0x1C0, 0x1C8, 0x1D0, 0x1D8, 0x1E0, 0x1E8, 0x1F0, 0x1F8,
              0x200, 0x208, 0x210, 0x218, 0x220, 0x228, 0x230, 0x238,
              0x240, 0x248, 0x250, 0x258, 0x260, 0x268, 0x270, 0x278
            }

            local function godItem(item)
              if not item or item == 0 or item &lt; 0x10000 then return false end
              local dur = readFloat(item + 0x228)
              if not dur or dur &lt; 0 or dur &gt; 1e8 then
                -- Try alternate durability offsets seen on some Maine builds
                for _, alt in ipairs({0x220, 0x224, 0x22C, 0x230, 0x218}) do
                  local d = readFloat(item + alt)
                  if d and d &gt; 0 and d &lt; 1e7 then
                    writeFloat(item + alt, 99999)
                    return true
                  end
                end
                return false
              end
              writeFloat(item + 0x228, 99999)
              local be = readInteger(item + 0x250)
              local bo = readInteger(item + 0x254)
              if be and be &gt;= 0 and be &lt; 64 then writeInteger(item + 0x250, 15) end
              if bo and bo &gt;= 0 and bo &lt; 64 then writeInteger(item + 0x254, 15) end
              return true
            end

            gg_gear_godarmor = gg_gear_godarmor or {}
            local st = gg_gear_godarmor
            -- Also drop enemy damage scale if GameState resolves (safer armor feel)
            local function resolve(baseSym, offsets)
              local a = getAddress(baseSym)
              if not a then return nil end
              for i = #offsets, 2, -1 do
                a = readQword(a + offsets[i])
                if a == nil or a == 0 then return nil end
              end
              return a + offsets[1]
            end
            if getAddressSafe("GameState") then
              st.enemyDmg = resolve("GameState", {0x54, 0x138, 0x388, 0x170})
              if st.enemyDmg then
                st.enemyPrev = readFloat(st.enemyDmg)
                writeFloat(st.enemyDmg, 0.05)
                print(string.format("EnemyDamage scale -&gt; 0.05 (was %.2f)", st.enemyPrev or -1))
              end
            end

            st.timer = createTimer(nil, false)
            st.timer.Interval = 100
            st.timer.OnTimer = function()
              if st.enemyDmg then writeFloat(st.enemyDmg, 0.05) end
              local root = equipRoot()
              if not root then return end
              for _, soff in ipairs(SLOT_OFFS) do
                godItem(readQword(root + soff))
              end
            end
            st.timer.Enabled = true
            print("God armor: equipped durability/enhancement freeze (+ low enemy damage if available)")

            [DISABLE]
            {$lua}
            if syntaxcheck then return end
            local st = gg_gear_godarmor
            if st and st.timer then
              st.timer.Enabled = false
              st.timer.destroy()
              st.timer = nil
            end
            if st and st.enemyDmg and st.enemyPrev then
              writeFloat(st.enemyDmg, st.enemyPrev)
            end
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>303</ID>
              <Description>"[Script] One-shot + god armor (combo)"</Description>
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
                if r and r &gt; 0x10000 then
                  local probe = readQword(r + 0x200)
                  if probe and probe &gt; 0x10000 then return r end
                end
              end
              return readQword(p + 0x16E8)
            end

            local SLOT_OFFS = {
              0x1C0, 0x1C8, 0x1D0, 0x1D8, 0x1E0, 0x1E8, 0x1F0, 0x1F8,
              0x200, 0x208, 0x210, 0x218, 0x220, 0x228, 0x230, 0x238,
              0x240, 0x248, 0x250, 0x258, 0x260, 0x268
            }

            local function buffItem(item, attackToo)
              if not item or item == 0 or item &lt; 0x10000 then return end
              local dur = readFloat(item + 0x228)
              if dur and dur &gt;= 0 and dur &lt; 1e8 then
                writeFloat(item + 0x228, 99999)
              else
                for _, alt in ipairs({0x220, 0x224, 0x22C, 0x230}) do
                  local d = readFloat(item + alt)
                  if d and d &gt; 0 and d &lt; 1e7 then writeFloat(item + alt, 99999) end
                end
              end
              local be = readInteger(item + 0x250)
              local bo = readInteger(item + 0x254)
              if be and be &gt;= 0 and be &lt; 64 then writeInteger(item + 0x250, 15) end
              if bo and bo &gt;= 0 and bo &lt; 64 then writeInteger(item + 0x254, 15) end
              if attackToo then
                for _, foff in ipairs({0x240, 0x244, 0x248, 0x24C, 0x258, 0x25C}) do
                  local v = readFloat(item + foff)
                  if v and v &gt; 0.5 and v &lt; 500 then writeFloat(item + foff, 100) end
                end
              end
            end

            gg_gear_combo = gg_gear_combo or {}
            local st = gg_gear_combo
            st.dmgAddr = resolve("GameState", {0x50, 0x138, 0x388, 0x170})
            st.enemyDmg = resolve("GameState", {0x54, 0x138, 0x388, 0x170})
            if st.dmgAddr then
              st.dmgPrev = readFloat(st.dmgAddr)
              writeFloat(st.dmgAddr, 100)
            end
            if st.enemyDmg then
              st.enemyPrev = readFloat(st.enemyDmg)
              writeFloat(st.enemyDmg, 0.05)
            end

            st.timer = createTimer(nil, false)
            st.timer.Interval = 100
            st.timer.OnTimer = function()
              if st.dmgAddr then writeFloat(st.dmgAddr, 100) end
              if st.enemyDmg then writeFloat(st.enemyDmg, 0.05) end
              local root = equipRoot()
              if not root then return end
              for _, soff in ipairs(SLOT_OFFS) do
                buffItem(readQword(root + soff), true)
              end
            end
            st.timer.Enabled = true
            print("Combo: one-shot damage x100 + god armor durability freeze")

            [DISABLE]
            {$lua}
            if syntaxcheck then return end
            local st = gg_gear_combo
            if st and st.timer then
              st.timer.Enabled = false
              st.timer.destroy()
              st.timer = nil
            end
            if st and st.dmgAddr and st.dmgPrev then writeFloat(st.dmgAddr, st.dmgPrev) end
            if st and st.enemyDmg and st.enemyPrev then writeFloat(st.enemyDmg, st.enemyPrev) end
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>304</ID>
              <Description>"Held Durability (manual)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>Float</VariableType>
              <Address>Player</Address>
              <Offsets>
                <Offset>228</Offset>
                <Offset>200</Offset>
                <Offset>16E8</Offset>
              </Offsets>
            </CheatEntry>
            <CheatEntry>
              <ID>305</ID>
              <Description>"Held Base Enhancement (manual)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>4 Bytes</VariableType>
              <Address>Player</Address>
              <Offsets>
                <Offset>250</Offset>
                <Offset>200</Offset>
                <Offset>16E8</Offset>
              </Offsets>
            </CheatEntry>
            <CheatEntry>
              <ID>306</ID>
              <Description>"Held Bonus Enhancement (manual)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>4 Bytes</VariableType>
              <Address>Player</Address>
              <Offsets>
                <Offset>254</Offset>
                <Offset>200</Offset>
                <Offset>16E8</Offset>
              </Offsets>
            </CheatEntry>
            <CheatEntry>
              <ID>307</ID>
              <Description>"Player Damage scale (manual)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>Float</VariableType>
              <Address>GameState</Address>
              <Offsets>
                <Offset>50</Offset>
                <Offset>138</Offset>
                <Offset>388</Offset>
                <Offset>170</Offset>
              </Offsets>
            </CheatEntry>
            <CheatEntry>
              <ID>308</ID>
              <Description>"Enemy Damage scale (manual)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>Float</VariableType>
              <Address>GameState</Address>
              <Offsets>
                <Offset>54</Offset>
                <Offset>138</Offset>
                <Offset>388</Offset>
                <Offset>170</Offset>
              </Offsets>
            </CheatEntry>
          </CheatEntries>
        </CheatEntry>
`;

function inject(ctPath, label) {
  let xml = fs.readFileSync(ctPath, "utf8");
  if (xml.includes('Description>"Gear — one-shot / god armor"')) {
    console.log(label + ": already has gear group, skipping inject");
    return;
  }
  // Insert before World settings group
  const markers = [
    /(<CheatEntry>\s*<ID>72<\/ID>\s*<Description>"World settings \(GameState\)"<\/Description>)/,
    /(<CheatEntry>\s*<ID>76<\/ID>\s*<Description>"DEBUG"<\/Description>)/,
    /(<CheatEntry>\s*<ID>200<\/ID>\s*<Description>"G2 adaptive \(scan helpers\)"<\/Description>)/,
  ];
  let done = false;
  for (const re of markers) {
    if (re.test(xml)) {
      xml = xml.replace(re, GEAR_GROUP + "\n        $1");
      done = true;
      break;
    }
  }
  if (!done) throw new Error("No insert marker in " + ctPath);
  fs.writeFileSync(ctPath, xml);
  console.log(label + ": injected gear scripts, bytes", xml.length);
}

inject(
  "C:/Users/Owner/Downloads/ggdropmansmoddingtools/tools/grounded-editor/GGdropmanGroundedV1.0.CT",
  "G1"
);
inject(
  "C:/Users/Owner/Downloads/ggdropmansmoddingtools/tools/grounded2-editor/GGdropmanGrounded2V1.0.CT",
  "G2"
);
