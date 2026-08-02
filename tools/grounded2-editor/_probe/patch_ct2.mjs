import fs from "fs";
import path from "path";

const ctPath = path.resolve("../GGdropmanGrounded2V1.0.CT");
let xml = fs.readFileSync(ctPath, "utf8");

// Safer unregister on disable
xml = xml.replace(
  `autoAssemble([[
        unregistersymbol(Player)
        unregistersymbol(Statistics)
        unregistersymbol(GearData)
        unregistersymbol(EngineData)
        unregistersymbol(GameState)
        ]])
        gg2_cmc_off = nil`,
  `for _, n in ipairs({"Player","Statistics","GearData","EngineData","GameState"}) do
          if getAddressSafe(n) then
            pcall(function() autoAssemble("unregistersymbol("..n..")") end)
          end
        end
        gg2_cmc_off = nil`
);

const extraGroup = `
        <CheatEntry>
          <ID>200</ID>
          <Description>"G2 adaptive (scan helpers)"</Description>
          <Options moHideChildren="1" moManualExpandCollapse="1"/>
          <Color>00C08040</Color>
          <GroupHeader>1</GroupHeader>
          <CheatEntries>
            <CheatEntry>
              <ID>201</ID>
              <Description>"[Script] Probe vitals near Player"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
            {$lua}
            if syntaxcheck then return end
            if getAddressSafe("Player") == nil then
              showMessage("Enable [ACTIVATE] first")
              error("no Player")
            end
            local p = readQword(getAddress("Player"))
            if not p or p == 0 then error("null Player") end
            print(string.format("Player pawn %X — scanning component floats…", p))
            -- Walk likely UObject* slots on the pawn and print health/survival-ish floats.
            local hits = 0
            for off = 0x100, 0x1400, 8 do
              local c = readQword(p + off)
              if c and c &gt; 0x10000 and c &lt; 0x7FFFFFFFFFFF then
                for f = 0, 0x80, 4 do
                  local v = readFloat(c + f)
                  if v and v &gt; 40 and v &lt; 400 then
                    print(string.format("  pawn+0x%X -&gt; obj+0x%X = %.1f", off, f, v))
                    hits = hits + 1
                    if hits &gt; 40 then break end
                  end
                end
              end
              if hits &gt; 40 then break end
            end
            print("Probe done. Use printed addresses with CE 'Add address' if G1 pointer chains look wrong.")
            [DISABLE]
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>202</ID>
              <Description>"[Script] One-shot (PlayerDamage scale x50)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
            {$lua}
            if syntaxcheck then return end
            if getAddressSafe("GameState") == nil then
              showMessage("Enable [ACTIVATE] first (need GameState AOB)")
              error("no GameState")
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
            -- Same chain as World settings → Player Damage scale (G1 layout; may need retune on Augusta)
            local addr = resolve("GameState", {0x50, 0x138, 0x388, 0x170})
            if not addr then
              showMessage("Could not resolve Player Damage scale pointer")
              error("no dmg scale")
            end
            gg2_oneshot = gg2_oneshot or {}
            gg2_oneshot.addr = addr
            gg2_oneshot.prev = readFloat(addr)
            writeFloat(addr, 50)
            print(string.format("PlayerDamage scale %.2f -&gt; 50 @ %X", gg2_oneshot.prev or -1, addr))
            [DISABLE]
            {$lua}
            if syntaxcheck then return end
            if gg2_oneshot and gg2_oneshot.addr and gg2_oneshot.prev then
              writeFloat(gg2_oneshot.addr, gg2_oneshot.prev)
            end
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>203</ID>
              <Description>"[Script] Free build + recipes (GameState bytes)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
            {$lua}
            if syntaxcheck then return end
            if getAddressSafe("GameState") == nil then
              showMessage("Enable [ACTIVATE] first")
              error("no GameState")
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
            local toggles = {
              {n="All Recipes", off={0x3A,0x138,0x388,0x170}},
              {n="Free Build", off={0x3B,0x138,0x388,0x170}},
              {n="Recipes Free", off={0x3D,0x138,0x388,0x170}},
              {n="Perks Unlocked", off={0x49,0x138,0x388,0x170}},
            }
            for _, t in ipairs(toggles) do
              local a = resolve("GameState", t.off)
              if a then
                writeBytes(a, 1)
                print("set "..t.n)
              else
                print("miss "..t.n)
              end
            end
            [DISABLE]
            </AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>204</ID>
              <Description>"Editor ↔ CT feature map"</Description>
              <Color>00808080</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>{
        Save editor (tools/grounded2-editor) — offline .csav:
          header rename, vitals, molars/science, gear god/oneshot, mutations,
          quests, tech/analyze, buildings, achievements, calendar, fog,
          chests, omni tiers, buggy tier, hatchery finish, resource/egg presets,
          inventory, multiplayer mirror, OP preset.

        This .CT — live Maine-Win64-Shipping RAM:
          super speed / jump / fly / teleport-to-aim,
          fill/god vitals, hunger/thirst freeze,
          science/molars pointers, held gear, haul,
          GameState free-build / damage scales / time rates,
          adaptive probe + one-shot / free-build scripts.

        Prefer editor for bulk unlocks; prefer .CT for movement while playing.
        }
        [ENABLE]
        [DISABLE]
        </AssemblerScript>
            </CheatEntry>
          </CheatEntries>
        </CheatEntry>
`;

if (!xml.includes('Description>"G2 adaptive (scan helpers)"')) {
  xml = xml.replace(
    /(<CheatEntry>\s*<ID>76<\/ID>\s*<Description>"DEBUG"<\/Description>)/,
    extraGroup + "\n        $1"
  );
}

fs.writeFileSync(ctPath, xml);
console.log("Updated CT", xml.length);
