import fs from "fs";
import path from "path";

const out = path.resolve("..", "GGdropmanGroundedV1.0.CT");
let id = 1;
const next = () => id++;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function indent(lines, n) {
  const pad = "  ".repeat(n);
  return lines.map((l) => (l ? pad + l : l));
}

function entry(opts, children) {
  const lines = ["<CheatEntry>"];
  lines.push(`  <ID>${opts.id}</ID>`);
  lines.push(`  <Description>"${esc(opts.desc)}"</Description>`);
  if (opts.hide) {
    lines.push(
      `  <Options moHideChildren="1"${
        opts.manual ? ' moManualExpandCollapse="1"' : ""
      }/>`
    );
  }
  if (opts.color) lines.push(`  <Color>${opts.color}</Color>`);
  if (opts.group) lines.push("  <GroupHeader>1</GroupHeader>");
  if (opts.hex) lines.push("  <ShowAsHex>1</ShowAsHex>");
  if (opts.signed != null)
    lines.push(`  <ShowAsSigned>${opts.signed}</ShowAsSigned>`);
  if (opts.type) lines.push(`  <VariableType>${opts.type}</VariableType>`);
  if (opts.addr) lines.push(`  <Address>${opts.addr}</Address>`);
  if (opts.offsets?.length) {
    lines.push("  <Offsets>");
    for (const o of opts.offsets) lines.push(`    <Offset>${o}</Offset>`);
    lines.push("  </Offsets>");
  }
  if (opts.script) {
    lines.push(`  <AssemblerScript>${opts.script}</AssemblerScript>`);
  }
  if (children?.length) {
    lines.push("  <CheatEntries>");
    for (const child of children) {
      lines.push(...indent(child.split("\n"), 2));
    }
    lines.push("  </CheatEntries>");
  }
  lines.push("</CheatEntry>");
  return lines.join("\n");
}

const ptr = (desc, type, addr, offsets, extra = {}) =>
  entry({ id: next(), desc, type, addr, offsets, signed: 0, ...extra });

const group = (desc, color, kids) =>
  entry(
    {
      id: next(),
      desc,
      hide: true,
      manual: true,
      color,
      group: true,
    },
    kids
  );

const script = (desc, body, color) =>
  entry({
    id: next(),
    desc,
    type: "Auto Assembler Script",
    color,
    script: body,
  });

const ACTIVATE = `[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe(process) == nil then
  showMessage("Attach to Maine-Win64-Shipping.exe first")
  error("no process")
end
-- Bases resolved from AOBs on the local Steam build (Maine-Win64-Shipping).
-- After a patch: run DEBUG → Fetch Base Addresses and update these defines.
autoAssemble([[
define(Player,Maine-Win64-Shipping.exe+61A3D20)
define(Statistics,Maine-Win64-Shipping.exe+619EB40)
define(GearData,Maine-Win64-Shipping.exe+6426A20)
define(EngineData,Maine-Win64-Shipping.exe+6427EE0)
define(GameState,Maine-Win64-Shipping.exe+642BE78)
registersymbol(Player)
registersymbol(Statistics)
registersymbol(GearData)
registersymbol(EngineData)
registersymbol(GameState)
]])
print("GGdropman Grounded V1.0 activated ("..tostring(process)..")")
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
`;

const README_SCRIPT = `{
GGdropmans Grounded Cheat Table V1.0
====================================
Process: Maine-Win64-Shipping.exe (Steam)
Companion to tools/grounded-editor (browser save editor).

1. Load into a world
2. Attach CE to Maine-Win64-Shipping.exe
3. Enable [ACTIVATE]
4. Use Movement scripts for super speed / super jump / no-clip fly
5. Use Vitals / Economy / Settings for live cheats

Offline unlocks (buildings, BURG.L purchases, achievements, OP preset)
stay in the browser save editor — they are not stable as one-click RAM patches.
}
[ENABLE]
[DISABLE]
`;

const FETCH_BASES = `{$lua}
if syntaxcheck then return end
[ENABLE]
print("Fetching Base Addresses...")
local aobList = {
"4C 8B 05 ?? ?? ?? ?? 4D 85 C0 0F 84 ?? ?? ?? ?? 49 8B 80 40 01 00 00 48 89 9C 24 A0 00 00 00 48 85 C0",
"4C 8B 35 ?? ?? ?? ?? 48 63 05 ?? ?? ?? ?? 4D 8D 24 C6 4D 3B F4",
"48 8B 05 ?? ?? ?? ?? 48 89 3C D8 48 8B 9C 24 C0 00 00 00 44 88 A7 C0",
"48 8B 05 ?? ?? ?? ?? 48 8B D1 48 8B 88 F8 0A 00 00 48 85 C9 74 07 48 8B",
"48 8B 05 ?? ?? ?? ?? 49 8B D3 45 33 C0 48 8B 0A 48 39 81 80 02 00 00 74 11"
}
local aobNames = {"Player","Statistics","GearData","EngineData","GameState"}
local xbase = getAddress(process)
print(string.format("Base: %X", xbase))
for i = 1, #aobList do
  local aob = AOBScan(aobList[i], "+X*C*W")
  if aob == nil or aob.Count == 0 then
    print(aobNames[i]..": MISS")
  else
    local instruct = getAddressSafe(aob[0])
    local distance = readInteger(instruct + 3)
    local instructSize = getInstructionSize(instruct)
    local address = (instruct + distance + instructSize) - xbase
    print(string.format("%s: %s+%X", aobNames[i], process, address))
  end
  if aob then aob.destroy() end
end
[DISABLE]
`;

const SUPER_SPEED = `[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe("Player") == nil then
  showMessage("Enable [ACTIVATE] first")
  error("no Player symbol")
end

gg_grounded_speed = gg_grounded_speed or {}
local st = gg_grounded_speed
st.mult = 5.0
st.baseWalk = nil
st.off = nil

local function cmc()
  local p = readQword(getAddress("Player"))
  if p == nil or p == 0 then return nil end
  return readQword(p + 0xDC8)
end

local function findWalk(c)
  -- Prefer floats that look like MaxWalkSpeed / MaxFlySpeed defaults.
  local targets = {600, 500, 450, 400, 350, 300}
  local bestOff, bestScore = nil, 999
  for off = 0x140, 0x360, 4 do
    local v = readFloat(c + off)
    if v and v > 80 and v < 2500 then
      for _, t in ipairs(targets) do
        local d = math.abs(v - t)
        if d < bestScore then
          bestScore = d
          bestOff = off
          st.baseWalk = t
        end
      end
    end
  end
  return bestOff
end

st.off = findWalk(cmc())
if not st.off then
  showMessage("Could not find MaxWalkSpeed near CharacterMovement. Try flying/moving first, then re-enable.")
  error("no walk float")
end
print(string.format("Super Speed: CMC+0x%X (base~%.0f) x%.1f", st.off, st.baseWalk or 600, st.mult))

st.timer = createTimer(nil, false)
st.timer.Interval = 50
st.timer.OnTimer = function()
  local c = cmc()
  if not c or not st.off then return end
  writeFloat(c + st.off, (st.baseWalk or 600) * st.mult)
  -- Also push nearby speed-like siblings (MaxWalkSpeedCrouched / MaxFlySpeed) if present.
  for _, d in ipairs({-8, -4, 4, 8, 12, 16}) do
    local v = readFloat(c + st.off + d)
    if v and v > 50 and v < 2500 then
      writeFloat(c + st.off + d, math.max(v, (st.baseWalk or 600) * st.mult * 0.6))
    end
  end
end
st.timer.Enabled = true

[DISABLE]
{$lua}
if syntaxcheck then return end
local st = gg_grounded_speed
if st and st.timer then
  st.timer.Enabled = false
  st.timer.destroy()
  st.timer = nil
end
if st and st.off then
  local p = readQword(getAddressSafe("Player") or 0)
  if p and p ~= 0 then
    local c = readQword(p + 0xDC8)
    if c and st.baseWalk then writeFloat(c + st.off, st.baseWalk) end
  end
end
`;

const SUPER_JUMP = `[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe("Player") == nil then
  showMessage("Enable [ACTIVATE] first")
  error("no Player symbol")
end

gg_grounded_jump = gg_grounded_jump or {}
local st = gg_grounded_jump
st.mult = 4.0
st.baseJump = nil
st.off = nil

local function cmc()
  local p = readQword(getAddress("Player"))
  if p == nil or p == 0 then return nil end
  return readQword(p + 0xDC8)
end

local function findJump(c)
  local targets = {420, 700, 800, 900, 1000, 350, 500}
  local bestOff, bestScore = nil, 80
  for off = 0x140, 0x380, 4 do
    local v = readFloat(c + off)
    if v and v > 200 and v < 3000 then
      for _, t in ipairs(targets) do
        local d = math.abs(v - t)
        if d < bestScore then
          bestScore = d
          bestOff = off
          st.baseJump = v
        end
      end
    end
  end
  return bestOff
end

st.off = findJump(cmc())
if not st.off then
  showMessage("Could not find JumpZVelocity. Jump once in-game, then re-enable.")
  error("no jump float")
end
print(string.format("Super Jump: CMC+0x%X (base~%.1f) x%.1f", st.off, st.baseJump or 420, st.mult))

st.timer = createTimer(nil, false)
st.timer.Interval = 50
st.timer.OnTimer = function()
  local c = cmc()
  if not c or not st.off then return end
  writeFloat(c + st.off, (st.baseJump or 420) * st.mult)
end
st.timer.Enabled = true

[DISABLE]
{$lua}
if syntaxcheck then return end
local st = gg_grounded_jump
if st and st.timer then
  st.timer.Enabled = false
  st.timer.destroy()
  st.timer = nil
end
if st and st.off and st.baseJump then
  local p = readQword(getAddressSafe("Player") or 0)
  if p and p ~= 0 then
    local c = readQword(p + 0xDC8)
    if c then writeFloat(c + st.off, st.baseJump) end
  end
end
`;

const FILL_VITALS = `[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe("Player") == nil then
  showMessage("Enable [ACTIVATE] first")
  error("no Player")
end
local function wchain(baseSym, offsets, isFloat, value)
  local a = getAddress(baseSym)
  for i = #offsets, 1, -1 do
    a = readQword(a + offsets[i])
    if a == nil or a == 0 then return false end
  end
  -- last offset is field
  -- rebuild: CE order is final field first
  return true
end

-- Helper: resolve CE-style offsets (list is top=final field ... bottom=first deref)
local function resolve(baseSym, offsets)
  local a = getAddress(baseSym)
  if not a then return nil end
  for i = #offsets, 2, -1 do
    a = readQword(a + offsets[i])
    if a == nil or a == 0 then return nil end
  end
  return a + offsets[1]
end

local writes = {
  {desc="health damaged", off={0x284,0x30,0x1B8}, v=0, float=true},
  {desc="base health", off={0x280,0x30,0x1B8}, v=200, float=true},
  {desc="stamina", off={0xD8,0x150,0x1B8}, v=200, float=true},
  {desc="hunger", off={0x278,0x130,0x1B8}, v=5, float=true},
  {desc="thirst", off={0x27C,0x130,0x1B8}, v=5, float=true},
  {desc="oxygen", off={0x280,0x130,0x1B8}, v=100, float=true},
}
for _, w in ipairs(writes) do
  local addr = resolve("Player", w.off)
  if addr then
    if w.float then writeFloat(addr, w.v) else writeInteger(addr, w.v) end
    print("set "..w.desc)
  else
    print("miss "..w.desc)
  end
end
[DISABLE]
`;

const GOD_MODE = `[ENABLE]
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
gg_grounded_god = gg_grounded_god or {}
local st = gg_grounded_god
st.timer = createTimer(nil, false)
st.timer.Interval = 100
st.timer.OnTimer = function()
  local dmg = resolve("Player", {0x284,0x30,0x1B8})
  local base = resolve("Player", {0x280,0x30,0x1B8})
  local stam = resolve("Player", {0xD8,0x150,0x1B8})
  if dmg then writeFloat(dmg, 0) end
  if base then writeFloat(base, 200) end
  if stam then writeFloat(stam, 200) end
end
st.timer.Enabled = true
[DISABLE]
{$lua}
if syntaxcheck then return end
local st = gg_grounded_god
if st and st.timer then
  st.timer.Enabled = false
  st.timer.destroy()
  st.timer = nil
end
`;

const INF_SURVIVAL = `[ENABLE]
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
gg_grounded_surv = gg_grounded_surv or {}
local st = gg_grounded_surv
st.timer = createTimer(nil, false)
st.timer.Interval = 250
st.timer.OnTimer = function()
  local hunger = resolve("Player", {0x278,0x130,0x1B8})
  local thirst = resolve("Player", {0x27C,0x130,0x1B8})
  local oxygen = resolve("Player", {0x280,0x130,0x1B8})
  if hunger then writeFloat(hunger, 5) end
  if thirst then writeFloat(thirst, 5) end
  if oxygen then writeFloat(oxygen, 100) end
end
st.timer.Enabled = true
[DISABLE]
{$lua}
if syntaxcheck then return end
local st = gg_grounded_surv
if st and st.timer then
  st.timer.Enabled = false
  st.timer.destroy()
  st.timer = nil
end
`;

const MAX_SCIENCE = `[ENABLE]
{$lua}
if syntaxcheck then return end
if getAddressSafe("Statistics") == nil then
  showMessage("Enable [ACTIVATE] first")
  error("no Statistics")
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
local science = resolve("Statistics", {0x470,0x2D0,0x170,0xB0,0x20})
local milk = resolve("Statistics", {0x480,0x2D0,0x170,0xB0,0x20})
local mega = resolve("Statistics", {0x47C,0x2D0,0x170,0xB0,0x20})
if science then writeInteger(science, 999999) end
if milk then writeInteger(milk, 999) end
if mega then writeInteger(mega, 999) end
print("Science/molars topped up")
[DISABLE]
`;

const FLY = `[ENABLE]
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
local fly = resolve("Player", {0x3A8,0xDC8})
local mode = resolve("Player", {0x178,0xDC8})
if fly then writeByte(fly, 1) end
if mode then writeByte(mode, 5) end -- MOVE_Flying
print("Fly mode on (MovementMode=5) — collision still on. Use No-clip fly to phase through geometry.")
[DISABLE]
{$lua}
if syntaxcheck then return end
local function resolve(baseSym, offsets)
  local a = getAddressSafe(baseSym)
  if not a then return nil end
  for i = #offsets, 2, -1 do
    a = readQword(a + offsets[i])
    if a == nil or a == 0 then return nil end
  end
  return a + offsets[1]
end
local fly = resolve("Player", {0x3A8,0xDC8})
local mode = resolve("Player", {0x178,0xDC8})
if fly then writeByte(fly, 0) end
if mode then writeByte(mode, 1) end -- MOVE_Walking
`;

const NOCLIP_FLY = `[ENABLE]
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

gg_grounded_noclip = gg_grounded_noclip or {}
local st = gg_grounded_noclip
st.prevCollision = nil

-- Snapshot collision so we can restore on disable
do
  local col = resolve("Player", {0x64})
  if col then st.prevCollision = readBytes(col, 1, true) end
end

local function apply()
  local fly = resolve("Player", {0x3A8,0xDC8})
  local mode = resolve("Player", {0x178,0xDC8})
  local col = resolve("Player", {0x64})
  if fly then writeByte(fly, 1) end
  if mode then writeByte(mode, 5) end -- MOVE_Flying
  if col then writeByte(col, 0) end   -- NoCollision
  -- CharacterMovement: clear grounded / force flying-friendly flags when present
  local p = readQword(getAddress("Player"))
  if p and p ~= 0 then
    local cmc = readQword(p + 0xDC8)
    if cmc and cmc ~= 0 then
      -- GravityScale-ish floats near movement: nudge toward 0 while noclip is on
      for _, off in ipairs({0x170, 0x174, 0x178, 0x17C, 0x180}) do
        local v = readFloat(cmc + off)
        if v and v > 0.2 and v < 5.0 then
          writeFloat(cmc + off, 0.0)
        end
      end
    end
  end
end

apply()
st.timer = createTimer(nil, false)
st.timer.Interval = 50
st.timer.OnTimer = function() apply() end
st.timer.Enabled = true
print("No-clip fly ON (fly + collision off). Disable this script to restore walking/collision.")

[DISABLE]
{$lua}
if syntaxcheck then return end
local function resolve(baseSym, offsets)
  local a = getAddressSafe(baseSym)
  if not a then return nil end
  for i = #offsets, 2, -1 do
    a = readQword(a + offsets[i])
    if a == nil or a == 0 then return nil end
  end
  return a + offsets[1]
end

local st = gg_grounded_noclip
if st and st.timer then
  st.timer.Enabled = false
  st.timer.destroy()
  st.timer = nil
end

local fly = resolve("Player", {0x3A8,0xDC8})
local mode = resolve("Player", {0x178,0xDC8})
local col = resolve("Player", {0x64})
if fly then writeByte(fly, 0) end
if mode then writeByte(mode, 1) end -- MOVE_Walking
if col then
  if st and st.prevCollision ~= nil then
    writeByte(col, st.prevCollision)
  else
    writeByte(col, 1) -- QueryAndPhysics-ish default
  end
end
-- Restore a normal gravity scale if we zeroed one
local p = readQword(getAddressSafe("Player") or 0)
if p and p ~= 0 then
  local cmc = readQword(p + 0xDC8)
  if cmc and cmc ~= 0 then
    for _, off in ipairs({0x170, 0x174, 0x178, 0x17C, 0x180}) do
      local v = readFloat(cmc + off)
      if v ~= nil and v == 0.0 then
        writeFloat(cmc + off, 1.0)
        break
      end
    end
  end
end
print("No-clip fly OFF")
`;

const rootKids = [];

rootKids.push(
  script("README — how to use", README_SCRIPT, "00808080")
);
rootKids.push(script("[ACTIVATE] register symbols", ACTIVATE, "0000FF00"));

rootKids.push(
  group("Movement (speed / jump / fly)", "0040C0FF", [
    script("[Script] Super Speed x5", SUPER_SPEED, "0000FF00"),
    script("[Script] Super Jump x4", SUPER_JUMP, "0000FF00"),
    script("[Script] No-clip fly", NOCLIP_FLY, "0000FF00"),
    script("[Script] Fly mode (collision on)", FLY, "0000FF00"),
    ptr("Movement Mode (1=walk 5=fly)", "Byte", "Player", ["178", "DC8"]),
    ptr("Flying Cheat flag", "Byte", "Player", ["3A8", "DC8"]),
    ptr("Collision byte (0=noclip)", "Byte", "Player", ["64"]),
  ])
);

rootKids.push(
  group("Vitals", "004080FF", [
    script("[Script] Fill vitals once", FILL_VITALS, "0000FF00"),
    script("[Script] God mode (freeze HP/stamina)", GOD_MODE, "0000FF00"),
    script("[Script] Infinite hunger/thirst/oxygen", INF_SURVIVAL, "0000FF00"),
    group("Health", "00FF8080", [
      ptr("Health Damaged (0=full)", "Float", "Player", ["284", "30", "1B8"]),
      ptr("Base Health", "Float", "Player", ["280", "30", "1B8"]),
    ]),
    group("Stamina", "00FF8080", [
      ptr("Current Stamina", "Float", "Player", ["D8", "150", "1B8"]),
      ptr("Base Stamina", "Float", "Player", ["DC", "150", "1B8"]),
      ptr("Regen Delay", "Float", "Player", ["E0", "150", "1B8"]),
      ptr("Regen Rate", "Float", "Player", ["E4", "150", "1B8"]),
    ]),
    group("Survival", "00FF8080", [
      ptr("Hunger", "Float", "Player", ["278", "130", "1B8"]),
      ptr("Thirst", "Float", "Player", ["27C", "130", "1B8"]),
      ptr("Oxygen", "Float", "Player", ["280", "130", "1B8"]),
      ptr("Max Hunger", "Float", "Player", ["138", "130", "1B8"]),
      ptr("Max Thirst", "Float", "Player", ["180", "130", "1B8"]),
      ptr("Max Oxygen", "Float", "Player", ["1C8", "130", "1B8"]),
      ptr("Oxygen Rate", "Float", "Player", ["1CC", "130", "1B8"]),
      ptr("Decay Rate", "Float", "Player", ["284", "130", "1B8"]),
    ]),
  ])
);

rootKids.push(
  group("Economy (science / molars)", "0040C080", [
    script("[Script] Max science + molars", MAX_SCIENCE, "0000FF00"),
    ptr("Raw Science", "4 Bytes", "Statistics", [
      "470",
      "2D0",
      "170",
      "B0",
      "20",
    ]),
    ptr("Milk Molars", "4 Bytes", "Statistics", [
      "480",
      "2D0",
      "170",
      "B0",
      "20",
    ]),
    ptr("Mega Milk Molars", "4 Bytes", "Statistics", [
      "47C",
      "2D0",
      "170",
      "B0",
      "20",
    ]),
    ptr("Brainpower", "4 Bytes", "Statistics", [
      "474",
      "2D0",
      "170",
      "B0",
      "20",
    ]),
    ptr("Level", "4 Bytes", "Statistics", ["478", "2D0", "170", "B0", "20"]),
  ])
);

rootKids.push(
  group("Mutations / hauling", "00C08040", [
    ptr("Max Mutations", "4 Bytes", "Player", ["100", "8", "1A8", "258"]),
    ptr("Active Mutations", "4 Bytes", "Player", ["104", "8", "1A8", "258"]),
    ptr("Haul Capacity", "4 Bytes", "Player", ["E0", "198", "18", "1A8"]),
    ptr("Haul", "4 Bytes", "Player", ["120", "198", "18", "1A8"]),
  ])
);

rootKids.push(
  group("Held gear (right hand)", "008080C0", [
    ptr("Stack", "4 Bytes", "Player", ["140", "200", "16E8"]),
    ptr("Durability", "Float", "Player", ["228", "200", "16E8"]),
    ptr("Base Enhancement", "4 Bytes", "Player", ["250", "200", "16E8"]),
    ptr("Bonus Enhancement", "4 Bytes", "Player", ["254", "200", "16E8"]),
    ptr("Spoil Time", "Float", "Player", ["158", "200", "16E8"]),
  ])
);

const gs = ["138", "388", "170"];
rootKids.push(
  group("World settings (GameState)", "00C04080", [
    ptr("All Recipes Unlocked", "Byte", "GameState", ["3A", ...gs]),
    ptr("Free Build", "Byte", "GameState", ["3B", ...gs]),
    ptr("Building Integrity", "Byte", "GameState", ["3C", ...gs]),
    ptr("All Recipes Free", "Byte", "GameState", ["3D", ...gs]),
    ptr("Bugs Spawn", "Byte", "GameState", ["3E", ...gs]),
    ptr("Bugs Ignore Player", "Byte", "GameState", ["3F", ...gs]),
    ptr("Stamina Drain", "Byte", "GameState", ["40", ...gs]),
    ptr("Food Spoiling", "Byte", "GameState", ["44", ...gs]),
    ptr("Pet Invincibility", "Byte", "GameState", ["47", ...gs]),
    ptr("All Mutations Unlocked", "Byte", "GameState", ["49", ...gs]),
    ptr("Fully Yoked", "Byte", "GameState", ["4A", ...gs]),
    ptr("Player Damage (byte toggle)", "Byte", "GameState", ["41", ...gs]),
    ptr("Friendly Fire", "Byte", "GameState", ["42", ...gs]),
    ptr("Player Damage scale", "Float", "GameState", ["50", ...gs]),
    ptr("Enemy Damage scale", "Float", "GameState", ["54", ...gs]),
    ptr("Time of Day Rate", "Float", "GameState", ["70", ...gs]),
    ptr("Hunger Burn Rate", "Float", "GameState", ["74", ...gs]),
    ptr("Thirst Burn Rate", "Float", "GameState", ["78", ...gs]),
    ptr("Creature Health Scaling", "Float", "GameState", ["80", ...gs]),
    ptr("Fall Damage Scaling", "Float", "GameState", ["84", ...gs]),
  ])
);

rootKids.push(
  group("DEBUG", "00808080", [
    script("Fetch Base Addresses (AOB)", FETCH_BASES),
    ptr("Player static (hex)", "8 Bytes", "Player", null, { hex: true }),
    ptr("Statistics static (hex)", "8 Bytes", "Statistics", null, {
      hex: true,
    }),
  ])
);

const banner = entry(
  {
    id: next(),
    desc: "=== GGdropmans Grounded V1.0 ===",
    hide: true,
    color: "0000C080",
    group: true,
  },
  rootKids
);

const xml = `<?xml version="1.0" encoding="utf-8"?>
<CheatTable CheatEngineTableVersion="45">
  <CheatEntries>
${indent(banner.split("\n"), 2).join("\n")}
  </CheatEntries>
</CheatTable>
`;

fs.writeFileSync(out, xml);
console.log("Wrote", out, "bytes", xml.length, "next id", id);
