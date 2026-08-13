/**
 * Patch GGdropmanGrounded2V2.0.CT:
 * - Moldy milk molars (Party BuggyUpgradePoints @ +0x4EC)
 * - Custom inventory slots via DefaultMaxSize + milk-molar PlayerUpgrade tiers
 */
const fs = require("fs");
const path = require("path");

const ctPath = path.resolve(__dirname, "../GGdropmanGrounded2V2.0.CT");
let xml = fs.readFileSync(ctPath, "utf8");
const bak = ctPath + ".bak-before-moldy";
fs.copyFileSync(ctPath, bak);

function mustInclude(s, needle, label) {
  if (!xml.includes(needle) && !s) throw new Error("missing anchor: " + label);
}

// --- notes ---
xml = xml.replace(
  "8. Currency: Raw Science / Brainpower / Gold molars / Milk molars (Party)",
  "8. Currency: Raw Science / Brainpower / Gold molars / Milk molars / Moldy milk molars (Party)\n9c. Inventory slots: custom bag/mount size (DefaultMaxSize + milk-molar upgrade tiers)"
);

// --- DISABLE ALL globals ---
xml = xml.replace(
  "gg2_freeze_vitals, gg2_currency_freeze, gg2_stack_freeze, gg2_god,",
  "gg2_freeze_vitals, gg2_currency_freeze, gg2_stack_freeze, gg2_inv_freeze, gg2_god,"
);
if (!xml.includes("gg2_inv_freeze = nil")) {
  xml = xml.replace(
    "gg2_currency_freeze = nil",
    "gg2_currency_freeze = nil\ngg2_inv_freeze = nil"
  );
}

// --- ACTIVATE party symbols ---
xml = xml.replace(
  `    regAbs("GG2_MilkMolars", party + 0x4E8)      -- PersonalUpgradePoints
    print(string.format("Party=%X Science=%s Brain=%s GoldMolars=%s MilkMolars=%s",
      party,
      tostring(readInteger(party + 0x4D8)),
      tostring(readInteger(party + 0x4DC)),
      tostring(readInteger(party + 0x4E4)),
      tostring(readInteger(party + 0x4E8))))`,
  `    regAbs("GG2_MilkMolars", party + 0x4E8)      -- PersonalUpgradePoints
    regAbs("GG2_MoldyMolars", party + 0x4EC)     -- BuggyUpgradePoints (moldy milk molars)
    print(string.format("Party=%X Science=%s Brain=%s GoldMolars=%s MilkMolars=%s Moldy=%s",
      party,
      tostring(readInteger(party + 0x4D8)),
      tostring(readInteger(party + 0x4DC)),
      tostring(readInteger(party + 0x4E4)),
      tostring(readInteger(party + 0x4E8)),
      tostring(readInteger(party + 0x4EC))))`
);

xml = xml.replace(
  '"GG2_Party","GG2_RawScience","GG2_Brainpower","GG2_GoldMolars","GG2_MilkMolars",',
  '"GG2_Party","GG2_RawScience","GG2_Brainpower","GG2_GoldMolars","GG2_MilkMolars","GG2_MoldyMolars",\n  "GG2_InvComp","GG2_InvDefaultMaxSize","GG2_MountInvComp","GG2_MountInvDefaultMaxSize",\n  "GG2_PlayerUpgradeComp","GG2_BuggyUpgradeComp",'
);

// --- Fill currency script ---
xml = xml.replace(
  `registerSymbol("GG2_MilkMolars", party + 0x4E8, true)

local sci = inputQuery("Raw Science", "Set Raw Science (ScienceFound) to:", "99999")
local brain = inputQuery("Brainpower", "Set Brainpower (ResearchPoints) to:", "9999")
local gold = inputQuery("Gold molars", "Set party upgrade points (gold molars) to:", "99")
local milk = inputQuery("Milk molars", "Set personal milk molars to:", "99")
if sci == nil or brain == nil or gold == nil or milk == nil then error("cancelled") end`,
  `registerSymbol("GG2_MilkMolars", party + 0x4E8, true)
registerSymbol("GG2_MoldyMolars", party + 0x4EC, true)

local sci = inputQuery("Raw Science", "Set Raw Science (ScienceFound) to:", "99999")
local brain = inputQuery("Brainpower", "Set Brainpower (ResearchPoints) to:", "9999")
local gold = inputQuery("Gold molars", "Set party upgrade points (gold molars) to:", "99")
local milk = inputQuery("Milk molars", "Set personal milk molars to:", "99")
local moldy = inputQuery("Moldy milk molars", "Set buggy upgrade points (moldy milk molars) to:", "99")
if sci == nil or brain == nil or gold == nil or milk == nil or moldy == nil then error("cancelled") end`
);

xml = xml.replace(
  `setInt(party + 0x4E4, "Gold molars", gold)
setInt(party + 0x4E8, "Milk molars", milk)

showMessage(
  "Currency written on PartyComponent.\\n\\n"..
  "Open / close upgrade menus if HUD does not refresh.\\n"..
  "Values are live RAM — save the game to keep them.")`,
  `setInt(party + 0x4E4, "Gold molars", gold)
setInt(party + 0x4E8, "Milk molars", milk)
setInt(party + 0x4EC, "Moldy milk molars", moldy)

showMessage(
  "Currency written on PartyComponent.\\n\\n"..
  "Includes moldy milk molars (buggy upgrades).\\n"..
  "Open / close upgrade menus if HUD does not refresh.\\n"..
  "Values are live RAM - save the game to keep them.")`
);

// --- FREEZE currency ---
xml = xml.replace(
  `gg2_currency_freeze = {
  sci = readInteger(getAddressSafe("GG2_RawScience")),
  brain = readInteger(getAddressSafe("GG2_Brainpower")),
  gold = readInteger(getAddressSafe("GG2_GoldMolars")),
  milk = readInteger(getAddressSafe("GG2_MilkMolars")),
}
local st = gg2_currency_freeze
st.timer = createTimer(nil, false)
st.timer.Interval = 200
st.timer.OnTimer = function()
  local a
  a = getAddressSafe("GG2_RawScience"); if a and st.sci then writeInteger(a, st.sci) end
  a = getAddressSafe("GG2_Brainpower"); if a and st.brain then writeInteger(a, st.brain) end
  a = getAddressSafe("GG2_GoldMolars"); if a and st.gold then writeInteger(a, st.gold) end
  a = getAddressSafe("GG2_MilkMolars"); if a and st.milk then writeInteger(a, st.milk) end
end
st.timer.Enabled = true
print(string.format("Currency FREEZE ON sci=%s brain=%s gold=%s milk=%s",
  tostring(st.sci), tostring(st.brain), tostring(st.gold), tostring(st.milk)))
showMessage("Currency FREEZE ON — holds current Party values every 200ms.")`,
  `gg2_currency_freeze = {
  sci = readInteger(getAddressSafe("GG2_RawScience")),
  brain = readInteger(getAddressSafe("GG2_Brainpower")),
  gold = readInteger(getAddressSafe("GG2_GoldMolars")),
  milk = readInteger(getAddressSafe("GG2_MilkMolars")),
  moldy = readInteger(getAddressSafe("GG2_MoldyMolars")),
}
local st = gg2_currency_freeze
st.timer = createTimer(nil, false)
st.timer.Interval = 200
st.timer.OnTimer = function()
  local a
  a = getAddressSafe("GG2_RawScience"); if a and st.sci then writeInteger(a, st.sci) end
  a = getAddressSafe("GG2_Brainpower"); if a and st.brain then writeInteger(a, st.brain) end
  a = getAddressSafe("GG2_GoldMolars"); if a and st.gold then writeInteger(a, st.gold) end
  a = getAddressSafe("GG2_MilkMolars"); if a and st.milk then writeInteger(a, st.milk) end
  a = getAddressSafe("GG2_MoldyMolars"); if a and st.moldy then writeInteger(a, st.moldy) end
end
st.timer.Enabled = true
print(string.format("Currency FREEZE ON sci=%s brain=%s gold=%s milk=%s moldy=%s",
  tostring(st.sci), tostring(st.brain), tostring(st.gold), tostring(st.milk), tostring(st.moldy)))
showMessage("Currency FREEZE ON - holds current Party values every 200ms (incl. moldy).")`
);

// --- Add moldy pointer before Currency group close ---
const moldyPtr = `
            <CheatEntry>
              <ID>225</ID>
              <Description>"Moldy milk molars (buggy points)"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>4 Bytes</VariableType>
              <Address>GG2_MoldyMolars</Address>
            </CheatEntry>`;

if (!xml.includes("Moldy milk molars (buggy points)")) {
  xml = xml.replace(
    `              <Address>GG2_MilkMolars</Address>
            </CheatEntry>
          </CheatEntries>
        </CheatEntry>
        <CheatEntry>
          <ID>200</ID>
          <Description>"Stacks (999)"</Description>`,
    `              <Address>GG2_MilkMolars</Address>
            </CheatEntry>${moldyPtr}
          </CheatEntries>
        </CheatEntry>
        <CheatEntry>
          <ID>200</ID>
          <Description>"Stacks (999)"</Description>`
  );
}

// --- New Inventory slots group (insert before Stacks) ---
const invGroup = `
        <CheatEntry>
          <ID>226</ID>
          <Description>"Inventory slots (custom)"</Description>
          <Options moHideChildren="1" moManualExpandCollapse="1"/>
          <Color>0040A0C0</Color>
          <GroupHeader>1</GroupHeader>
          <CheatEntries>
            <CheatEntry>
              <ID>227</ID>
              <Description>"[Script] Set bag slots (DefaultMaxSize + max milk-molar upgrade tiers)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe("Player") == nil then
  showMessage("Enable [ACTIVATE] first")
  error("no Player")
end

local function isHeapPtr(ptr)
  if ptr == nil or ptr == 0 or ptr &lt; 0x100000000 then return false end
  if ptr &gt;= 0x7F0000000000 then return false end
  return true
end
local function looksUObj(ptr)
  if not isHeapPtr(ptr) then return false end
  local vf = readQword(ptr)
  return vf ~= nil and vf &gt; 0x10000
end

local slotsRaw = inputQuery("Bag slots", "Set inventory DefaultMaxSize (bag slots) to:", "80")
if slotsRaw == nil then error("cancelled") end
local slots = math.floor(tonumber(slotsRaw) or -1)
if slots &lt; 1 or slots &gt; 500 then
  showMessage("Use a slot count between 1 and 500")
  error("bad slots")
end

local pawn = getAddressSafe("Player")
local inv = readQword(pawn + 0x1438) -- InventoryComponent
if not looksUObj(inv) then
  showMessage("No InventoryComponent on Player.\\nOpen bag once / re-ACTIVATE in-world.")
  error("no inv")
end

local prev = readInteger(inv + 0x1E0) -- DefaultMaxSize
writeInteger(inv + 0x1E0, slots)
registerSymbol("GG2_InvComp", inv, true)
registerSymbol("GG2_InvDefaultMaxSize", inv + 0x1E0, true)
print(string.format("Bag DefaultMaxSize %s -&gt; %d (readback %s)", tostring(prev), slots, tostring(readInteger(inv + 0x1E0))))

-- Max milk-molar personal upgrade tiers on SurvivalPlayerState.PlayerUpgradeComponent
-- APawn.PlayerState @ +0x2D0; SurvivalPlayerState.PlayerUpgradeComponent @ +0x748
-- FPlayerUpgrade stride 0x20: Tier @ +0xC
local upgraded = 0
local ps = readQword(pawn + 0x2D0)
if looksUObj(ps) then
  local puc = readQword(ps + 0x748)
  if looksUObj(puc) then
    registerSymbol("GG2_PlayerUpgradeComp", puc, true)
    local data = readQword(puc + 0xE8)
    local num = readInteger(puc + 0xF0)
    if isHeapPtr(data) and num ~= nil and num &gt; 0 and num &lt; 64 then
      for i = 0, num - 1 do
        local tierAddr = data + i * 0x20 + 0xC
        local t = readInteger(tierAddr)
        if t ~= nil and t &gt;= 0 and t &lt; 50 then
          writeInteger(tierAddr, 20)
          upgraded = upgraded + 1
        end
      end
      print(string.format("Milk-molar PlayerUpgrade tiers maxed: %d entr(y/ies)", upgraded))
    else
      print(string.format("PlayerUpgrades empty/odd data=%s num=%s", tostring(data), tostring(num)))
    end
  else
    print("PlayerUpgradeComponent missing on PlayerState")
  end
else
  print("PlayerState missing on pawn")
end

showMessage(string.format(
  "Bag slots set to %d (InventoryComponent.DefaultMaxSize).\\n\\n"..
  "Also pushed %d milk-molar upgrade tier(s) toward max.\\n"..
  "Re-open the bag / radial if the UI does not refresh.\\n"..
  "Enable FREEZE bag slots if it snaps back.",
  slots, upgraded))
[DISABLE]
</AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>228</ID>
              <Description>"[Script] FREEZE bag slots (hold DefaultMaxSize)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe("Player") == nil then
  showMessage("Enable [ACTIVATE] first")
  error("no Player")
end
local pawn = getAddressSafe("Player")
local inv = readQword(pawn + 0x1438)
if inv == nil or inv == 0 then
  showMessage("No InventoryComponent")
  error("no inv")
end
local addr = getAddressSafe("GG2_InvDefaultMaxSize")
if addr == nil then
  registerSymbol("GG2_InvComp", inv, true)
  registerSymbol("GG2_InvDefaultMaxSize", inv + 0x1E0, true)
  addr = inv + 0x1E0
end
if gg2_inv_freeze ~= nil and gg2_inv_freeze.timer ~= nil then
  gg2_inv_freeze.timer.Enabled = false
  gg2_inv_freeze.timer.destroy()
end
gg2_inv_freeze = { qty = readInteger(addr) or 80 }
local st = gg2_inv_freeze
st.timer = createTimer(nil, false)
st.timer.Interval = 250
st.timer.OnTimer = function()
  local p = getAddressSafe("Player")
  if p == nil then return end
  local c = readQword(p + 0x1438)
  if c == nil or c == 0 then return end
  writeInteger(c + 0x1E0, st.qty)
end
st.timer.Enabled = true
print("FREEZE bag slots ON @ "..tostring(st.qty))
showMessage("FREEZE bag slots ON @ "..tostring(st.qty).."\\n\\nHolds DefaultMaxSize every 250ms.")
[DISABLE]
{$lua}
if syntaxcheck then return end
local st = gg2_inv_freeze
if st ~= nil and st.timer ~= nil then
  st.timer.Enabled = false
  st.timer.destroy()
  st.timer = nil
end
gg2_inv_freeze = nil
print("FREEZE bag slots OFF")
</AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>229</ID>
              <Description>"[Script] Set buggy/mount slots (moldy upgrade path)"</Description>
              <Color>0000FF00</Color>
              <VariableType>Auto Assembler Script</VariableType>
              <AssemblerScript>[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe("Player") == nil then
  showMessage("Enable [ACTIVATE] first")
  error("no Player")
end

local function isHeapPtr(ptr)
  if ptr == nil or ptr == 0 or ptr &lt; 0x100000000 then return false end
  if ptr &gt;= 0x7F0000000000 then return false end
  return true
end
local function looksUObj(ptr)
  if not isHeapPtr(ptr) then return false end
  local vf = readQword(ptr)
  return vf ~= nil and vf &gt; 0x10000
end

local slotsRaw = inputQuery("Buggy slots", "Set mount/buggy inventory DefaultMaxSize to:", "40")
if slotsRaw == nil then error("cancelled") end
local slots = math.floor(tonumber(slotsRaw) or -1)
if slots &lt; 1 or slots &gt; 500 then
  showMessage("Use a slot count between 1 and 500")
  error("bad slots")
end

local pawn = getAddressSafe("Player")
local minv = readQword(pawn + 0x1440) -- MountInventoryComponent
if not looksUObj(minv) then
  showMessage("No MountInventoryComponent.\\nMount a buggy / toe-biter first, then re-run.")
  error("no mount inv")
end

local prev = readInteger(minv + 0x1E0)
writeInteger(minv + 0x1E0, slots)
registerSymbol("GG2_MountInvComp", minv, true)
registerSymbol("GG2_MountInvDefaultMaxSize", minv + 0x1E0, true)
print(string.format("Mount DefaultMaxSize %s -&gt; %d", tostring(prev), slots))

-- Also top up moldy points + max buggy upgrade tiers
local party = getAddressSafe("GG2_Party")
if looksUObj(party) then
  writeInteger(party + 0x4EC, math.max(readInteger(party + 0x4EC) or 0, 99))
  registerSymbol("GG2_MoldyMolars", party + 0x4EC, true)
end

local upgraded = 0
local ps = readQword(pawn + 0x2D0)
if looksUObj(ps) then
  local buc = readQword(ps + 0x750) -- PlayerBuggyUpgradeComponent
  if looksUObj(buc) then
    registerSymbol("GG2_BuggyUpgradeComp", buc, true)
    local data = readQword(buc + 0xE8)
    local num = readInteger(buc + 0xF0)
    if isHeapPtr(data) and num ~= nil and num &gt; 0 and num &lt; 64 then
      for i = 0, num - 1 do
        local tierAddr = data + i * 0x20 + 0xC
        local t = readInteger(tierAddr)
        if t ~= nil and t &gt;= 0 and t &lt; 50 then
          writeInteger(tierAddr, 20)
          upgraded = upgraded + 1
        end
      end
    end
  end
end

showMessage(string.format(
  "Buggy/mount slots set to %d.\\n\\n"..
  "Moldy molar points topped if Party was known.\\n"..
  "Maxed %d buggy upgrade tier(s).\\n"..
  "Remount / reopen buggy inventory if UI is stale.",
  slots, upgraded))
[DISABLE]
</AssemblerScript>
            </CheatEntry>
            <CheatEntry>
              <ID>230</ID>
              <Description>"Bag DefaultMaxSize"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>4 Bytes</VariableType>
              <Address>GG2_InvDefaultMaxSize</Address>
            </CheatEntry>
            <CheatEntry>
              <ID>231</ID>
              <Description>"Mount DefaultMaxSize"</Description>
              <ShowAsSigned>0</ShowAsSigned>
              <VariableType>4 Bytes</VariableType>
              <Address>GG2_MountInvDefaultMaxSize</Address>
            </CheatEntry>
          </CheatEntries>
        </CheatEntry>
`;

if (!xml.includes("Inventory slots (custom)")) {
  xml = xml.replace(
    `        <CheatEntry>
          <ID>200</ID>
          <Description>"Stacks (999)"</Description>`,
    invGroup + `        <CheatEntry>
          <ID>200</ID>
          <Description>"Stacks (999)"</Description>`
  );
}

// Rename Fill script description for clarity
xml = xml.replace(
  '<Description>"[Script] Fill Raw Science / Molars / Brainpower"</Description>',
  '<Description>"[Script] Fill Raw Science / Molars / Moldy / Brainpower"</Description>'
);

fs.writeFileSync(ctPath, xml, "utf8");
console.log("Patched", ctPath);
console.log("Backup", bak);
console.log("has moldy ptr", xml.includes("Moldy milk molars (buggy points)"));
console.log("has inv group", xml.includes("Inventory slots (custom)"));
console.log("has GG2_MoldyMolars reg", xml.includes('regAbs("GG2_MoldyMolars"'));
