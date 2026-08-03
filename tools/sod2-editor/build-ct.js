#!/usr/bin/env node
"use strict";

/**
 * Builds GGdropmanSoD2_v1.0.CT from structured entries.
 * Run: node build-ct.js
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "GGdropmanSoD2_v1.0.CT");

let nextId = 1;
function nid() {
  return nextId++;
}

function xmlEsc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function xmlEscScript(s) {
  // AssemblerScript body must be valid XML text (CE unescapes entities on load).
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function aaScript(body) {
  return body;
}

/** Shared Lua helpers loaded by the setup entry (stored in GG_SOD2). */
const SETUP_LUA = `[ENABLE]
{$lua}
if syntaxcheck then return end

GG_SOD2 = GG_SOD2 or {}

local function fail(msg)
  showMessage('GGdropman SoD2: '..tostring(msg))
  error(msg, 0)
end

function GG_SOD2.tableDir()
  if GG_SOD2._dir and GG_SOD2._dir ~= '' then return GG_SOD2._dir end
  local tp = nil
  if type(getTableFilePath) == 'function' then
    local ok, r = pcall(getTableFilePath)
    if ok and r and r ~= '' then tp = r end
  end
  if (not tp or tp == '') and type(getTableFileName) == 'function' then
    local ok, r = pcall(getTableFileName)
    if ok and r and r ~= '' then tp = r end
  end
  if tp and tp ~= '' then
    GG_SOD2._dir = string.gsub(tp, '[^\\\\/]+$', '')
  else
    local r = inputQuery('SoD2 CT folder', 'Full path to the folder that contains GGdropmanSoD2_v1.0.CT and ct-cli.js', '')
    if not r or r == '' then fail('Need table folder path') end
    if string.sub(r, -1) ~= '\\\\' and string.sub(r, -1) ~= '/' then r = r .. '\\\\' end
    GG_SOD2._dir = r
  end
  return GG_SOD2._dir
end

function GG_SOD2.cliPath()
  return GG_SOD2.tableDir() .. 'ct-cli.js'
end

function GG_SOD2.statePathFile()
  return GG_SOD2.tableDir() .. 'gg_sod2_last_save.txt'
end

function GG_SOD2.loadSavePath()
  local f = io.open(GG_SOD2.statePathFile(), 'r')
  if not f then return nil end
  local p = f:read('*l')
  f:close()
  if p and p ~= '' then return p end
  return nil
end

function GG_SOD2.saveSavePath(p)
  local f = io.open(GG_SOD2.statePathFile(), 'w')
  if not f then fail('Cannot write '..GG_SOD2.statePathFile()) end
  f:write(p or '')
  f:close()
  GG_SOD2.savePath = p
end

function GG_SOD2.defaultSteamHint()
  local la = os.getenv('LOCALAPPDATA') or ''
  if la == '' then return '' end
  return la .. '\\\\StateOfDecay2\\\\Saved\\\\Steam\\\\'
end

function GG_SOD2.stripQuotes(r)
  r = string.gsub(r or '', '^%s+', '')
  r = string.gsub(r, '%s+$', '')
  r = string.gsub(r, '^"', '')
  r = string.gsub(r, '"$', '')
  r = string.gsub(r, "^'", '')
  r = string.gsub(r, "'$", '')
  return r
end

function GG_SOD2.ensureSavePath()
  local p = GG_SOD2.savePath or GG_SOD2.loadSavePath()
  local hint = GG_SOD2.defaultSteamHint()
  local def = p or hint
  local r = inputQuery('SoD2 SaveGame path', 'Full path to SaveGame_*.sav — close State of Decay 2 first.\\nSteam folder: '..hint, def or '')
  if not r or r == '' then fail('Cancelled') end
  r = GG_SOD2.stripQuotes(r)
  GG_SOD2.saveSavePath(r)
  return r
end

function GG_SOD2.gameRunning()
  local pn = ''
  if type(process) == 'string' then pn = process end
  pn = string.lower(pn or '')
  if string.find(pn, 'stateofdecay2', 1, true) then return true end
  return false
end

function GG_SOD2.q(s)
  return '"' .. string.gsub(tostring(s), '"', '\\\\"') .. '"'
end

function GG_SOD2.runCli(argList)
  if not GG_SOD2 or not GG_SOD2.runCli then end
  if GG_SOD2.gameRunning() then
    local cont = messageDialog('SoD2 looks attached in CE. Close the game before save edits. Continue anyway?', mtWarning, mbYes, mbNo)
    if cont ~= mrYes then fail('Aborted — close State of Decay 2 first') end
  end
  local cli = GG_SOD2.cliPath()
  local f = io.open(cli, 'r')
  if not f then fail('ct-cli.js not found next to the .CT:\\n'..cli..'\\nSave the table into tools/sod2-editor/') end
  f:close()
  local sav = GG_SOD2.ensureSavePath()
  -- CLI shape: node ct-cli.js <cmd> <sav> [args...]
  local cmd = 'node ' .. GG_SOD2.q(cli) .. ' ' .. tostring(argList[1]) .. ' ' .. GG_SOD2.q(sav)
  for i = 2, #argList do
    cmd = cmd .. ' ' .. GG_SOD2.q(argList[i])
  end
  local outf = GG_SOD2.tableDir() .. 'gg_sod2_cli_out.txt'
  local full = 'cmd /c ' .. cmd .. ' > ' .. GG_SOD2.q(outf) .. ' 2>&1'
  local code = os.execute(full)
  local of = io.open(outf, 'r')
  local body = ''
  if of then body = of:read('*a') or '' of:close() end
  local ok = (code == 0 or code == true)
  if not ok then
    showMessage('CLI failed (code '..tostring(code)..'):\\n'..body)
    error('cli failed', 0)
  end
  showMessage(body)
  return body
end

function GG_SOD2.oneShotUntick()
  createThread(function()
    sleep(200)
    if memrec then memrec.Active = false end
  end)
end

function GG_SOD2.requireHelpers()
  if type(GG_SOD2.runCli) ~= 'function' then
    fail('Tick ENABLE — Load save-bridge helpers first')
  end
end

-- Live address store
GG_SOD2.live = GG_SOD2.live or {}

function GG_SOD2.liveEnsureRecord(desc, addr, vt, freezeValue)
  local al = getAddressList()
  local existing = nil
  for i = 0, al.Count - 1 do
    local mr = al[i]
    if mr and mr.Description == desc then existing = mr break end
  end
  local mr = existing or al.createMemoryRecord()
  mr.Description = desc
  mr.Address = string.format('%X', addr)
  mr.Type = vt or vtSingle
  if freezeValue ~= nil then
    mr.Value = tostring(freezeValue)
  end
  mr.Active = true
  return mr
end

showMessage('GGdropman SoD2 save-bridge ready.\\nct-cli: '..GG_SOD2.cliPath()..'\\nNode.js must be on PATH.\\nNext: Set / remember save path, then use Presets or Actions.')
{$asm}
[DISABLE]
{$lua}
-- helpers remain in memory until CE closes
`;

function oneshotLua(callExpr) {
  return `[ENABLE]
{$lua}
if syntaxcheck then return end
if type(GG_SOD2) ~= 'table' or type(GG_SOD2.runCli) ~= 'function' then
  showMessage('Tick ENABLE — Load save-bridge helpers first')
  error('helpers', 0)
end
${callExpr}
GG_SOD2.oneShotUntick()
{$asm}
[DISABLE]
`;
}

function readmeAa(text) {
  return `{
${text}
}
[ENABLE]
[DISABLE]
`;
}

function renderEntry(e, indent) {
  const sp = "  ".repeat(indent);
  const lines = [];
  lines.push(sp + "<CheatEntry>");
  lines.push(sp + "  <ID>" + e.id + "</ID>");
  lines.push(sp + '  <Description>"' + xmlEsc(e.desc) + '"</Description>');
  if (e.options) lines.push(sp + "  <Options " + e.options + "/>");
  if (e.color) lines.push(sp + "  <Color>" + e.color + "</Color>");
  if (e.group) lines.push(sp + "  <GroupHeader>1</GroupHeader>");
  if (e.aa != null) {
    lines.push(sp + "  <VariableType>Auto Assembler Script</VariableType>");
    lines.push(sp + "  <AssemblerScript>" + xmlEscScript(e.aa) + "</AssemblerScript>");
  }
  if (e.children && e.children.length) {
    lines.push(sp + "  <CheatEntries>");
    for (const c of e.children) lines.push(renderEntry(c, indent + 2));
    lines.push(sp + "  </CheatEntries>");
  }
  lines.push(sp + "</CheatEntry>");
  return lines.join("\n");
}

const presets = [
  ["god-community", "God community"],
  ["heal-roster", "Heal all survivors"],
  ["hero-roster", "Promote all to Hero"],
  ["max-skills", "Max all skills"],
  ["garage-day", "Garage day (repair+reveal vehicles)"],
  ["open-map", "Open the map"],
  ["base-ready", "Base ready (repair facilities)"],
  ["locker-polish", "Polish lockers"],
  ["friendly-enclaves", "Friendly enclaves"],
  ["full-comfort", "Full comfort (kitchen sink)"],
];

const actions = [
  ["influence", "Influence 9999"],
  ["stockpile", "Stockpile 999"],
  ["fill-resources", "Fill resources 500"],
  ["zero-threats", "Zero plague / infestations"],
  ["midday", "Time → midday"],
  ["heal-all", "Heal all survivors"],
  ["clear-fatigue", "Clear all fatigue"],
  ["promote-heroes", "Promote all to Hero"],
  ["enclave-max-infl", "Enclaves influence 9999"],
  ["friendly-enclaves", "Friendly enclave flags"],
  ["max-stacks", "Max inventory stacks 999"],
  ["repair-weapons", "Repair weapons 9999"],
  ["reveal-map", "Reveal all map sites"],
  ["clear-infest", "Clear infested outposts"],
  ["survey-all", "Mark all surveyed"],
  ["radio-reset", "Reset radio cooldowns"],
  ["radio-charges", "Radio charges 99"],
  ["clear-missions", "Clear active missions"],
  ["clear-completed", "Clear completed mission log"],
  ["abandon-outposts", "Abandon all outposts"],
  ["repair-vehicles", "Repair + refuel all vehicles"],
  ["refuel-vehicles", "Refuel all vehicles"],
  ["reveal-vehicles", "Reveal all vehicles"],
  ["teleport-vehicles", "Teleport vehicles near base"],
  ["spawn-plane", "Spawn Plane near base"],
  ["convert-plane", "Convert last vehicle → Plane"],
  ["repair-facilities", "Repair all facilities"],
  ["complete-facilities", "Force facilities Completed"],
];

const rootChildren = [];

// Meta
rootChildren.push({
  id: nid(),
  desc: "Donate — paypal.me/kd19902",
  color: "00F0C14A",
  group: true,
});
rootChildren.push({
  id: nid(),
  desc: "Discord — discord.gg/PTwyDTFyR",
  color: "00F26558",
  group: true,
});
rootChildren.push({
  id: nid(),
  desc: "README — how to use",
  aa: readmeAa(`GGdropmans State of Decay 2 Hybrid Cheat Table v1.1
=====================================================
Process (live): StateOfDecay2-Win64-Shipping.exe
Save bridge: Node.js + ct-cli.js next to this .CT

Donate: https://paypal.me/kd19902
Discord: https://discord.gg/PTwyDTFyR

TWO LAYERS
1) SAVE BRIDGE (editor feature parity)
   - Close SoD2 completely.
   - Keep this .CT in tools/sod2-editor/ (same folder as ct-cli.js).
   - Install Node.js and ensure "node" is on PATH.
   - Tick ENABLE — Load save-bridge helpers
   - Tick Set / remember save path → pick SaveGame_*.sav
   - Tick any Preset, Action, or Spawn kit (auto-backs up to .bak)

   Steam: %LOCALAPPDATA%\\StateOfDecay2\\Saved\\Steam\\
   Epic:  %LOCALAPPDATA%\\StateOfDecay2\\Saved\\Epic\\

2) LIVE SESSION
   - Attach CE to StateOfDecay2-Win64-Shipping.exe in-game.
   - Find Influence / Resource / Health / Stamina
   - LIVE — Infinite ammo / Speed / Jump / Fly:
       Find Ammo → Infinite Ammo timer
       Find Speed → Super Speed
       Find Jump → Super Jump
       Find Gravity → Fly Gravity 0 (+ optional Z Velocity)

Deep trait/skill/outfit/item pickers stay in the browser editor:
  editor.html

Plane is a cut asset — drives on land, does not fly.
True collision noclip AOBs still deferred.`),
});

rootChildren.push({
  id: nid(),
  desc: "ENABLE — Load save-bridge helpers",
  color: "0000FF00",
  aa: SETUP_LUA,
});

rootChildren.push({
  id: nid(),
  desc: "Set / remember save path",
  aa: oneshotLua(`GG_SOD2.requireHelpers()
local p = GG_SOD2.ensureSavePath()
showMessage('Save path remembered:\\n'..p)`),
});

rootChildren.push({
  id: nid(),
  desc: "List save summary",
  aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'list'})`),
});

rootChildren.push({
  id: nid(),
  desc: "Validate save (round-trip)",
  aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'validate'})`),
});

// Presets group
rootChildren.push({
  id: nid(),
  desc: "=== SAVE — Presets ===",
  options: 'moHideChildren="1"',
  color: "00C08040",
  group: true,
  children: presets.map(([id, label]) => ({
    id: nid(),
    desc: label,
    aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'preset', '${id}'})`),
  })),
});

// Actions group
rootChildren.push({
  id: nid(),
  desc: "=== SAVE — Actions ===",
  options: 'moHideChildren="1"',
  color: "00C08040",
  group: true,
  children: actions.map(([id, label]) => ({
    id: nid(),
    desc: label,
    aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', '${id}'})`),
  })),
});

// Live group
const LIVE_FIND = (kind, prompt) => `[ENABLE]
{$lua}
if syntaxcheck then return end
GG_SOD2 = GG_SOD2 or {}
GG_SOD2.live = GG_SOD2.live or {}

local function fail(msg)
  showMessage('GGdropman SoD2 Live: '..tostring(msg))
  error(msg, 0)
end

if getOpenedProcessID() == 0 then
  fail('Attach to StateOfDecay2-Win64-Shipping.exe first')
end

local key = '${kind}'
local st = GG_SOD2.live[key] or { step = 0 }
GG_SOD2.live[key] = st

if st.step == 0 then
  local v = inputQuery('Find ${kind}', '${prompt}\\nEnter the CURRENT value, then OK.', '')
  if not v or v == '' then fail('Cancelled') end
  if st.ms then pcall(function() st.ms.destroy() end) end
  st.ms = createMemScan()
  st.ms.firstScan(soExactValue, vtSingle, rtRoundedDefault, v, '', '0', '7fffffffffffffff', '+W-C', fsmNotAligned, '1', false, false, false, false)
  st.ms.waitTillDone()
  local fl = createFoundList(st.ms)
  fl.initialize()
  local n = fl.Count
  fl.deinitialize()
  st.step = 1
  showMessage('First scan done ('..tostring(n)..' hits).\\nChange ${kind} in-game, then tick this entry AGAIN.')
elseif st.step == 1 then
  local v = inputQuery('Find ${kind} (next)', 'Enter the NEW value after changing it in-game.', '')
  if not v or v == '' then fail('Cancelled') end
  if not st.ms then fail('Restart Find (step 0 missing)') end
  st.ms.nextScan(soExactValue, rtRoundedDefault, v, '', false, false, false, false, false)
  st.ms.waitTillDone()
  local fl = createFoundList(st.ms)
  fl.initialize()
  local n = fl.Count
  if n == 0 then
    fl.deinitialize()
    st.step = 0
    fail('0 results — untick and restart Find ${kind}')
  end
  local addr = fl.Address[0]
  if n > 1 then
    showMessage(tostring(n)..' results left. Using first: '..addr..'\\nNarrow further with CE scan UI if needed.')
  end
  local num = tonumber(addr, 16) or getAddress(addr)
  st.addr = num
  st.addrStr = addr
  fl.deinitialize()
  st.step = 0
  showMessage('${kind} address: '..tostring(addr)..'\\nEnable a Freeze entry below.')
end

createThread(function()
  sleep(200)
  if memrec then memrec.Active = false end
end)
{$asm}
[DISABLE]
`;

const LIVE_FREEZE = (kind, value, desc, vtName) => `[ENABLE]
{$lua}
if syntaxcheck then return end
GG_SOD2 = GG_SOD2 or {}
GG_SOD2.live = GG_SOD2.live or {}
local st = GG_SOD2.live['${kind}']
if not st or not st.addr then
  showMessage('Run Find ${kind} first')
  error('no addr', 0)
end
local al = getAddressList()
local desc = '${desc}'
local mr = nil
for i = 0, al.Count - 1 do
  if al[i].Description == desc then mr = al[i] break end
end
if not mr then mr = al.createMemoryRecord() end
mr.Description = desc
mr.Address = string.format('%X', st.addr)
mr.Type = ${vtName || "vtSingle"}
mr.Value = '${value}'
mr.Active = true
showMessage('Freezing '..desc..' @ '..mr.Address..' = ${value}')
{$asm}
[DISABLE]
{$lua}
-- leave the dynamic memory record active; user can untick it in the address list
`;

const LIVE_TIMER = (kind, value, vtWrite, desc) => `[ENABLE]
{$lua}
if syntaxcheck then return end
GG_SOD2 = GG_SOD2 or {}
GG_SOD2.live = GG_SOD2.live or {}
local st = GG_SOD2.live['${kind}']
if not st or not st.addr then
  showMessage('Run Find ${kind} first')
  error('no addr', 0)
end
local key = 'timer_${kind}'
if GG_SOD2.live[key] then
  pcall(function() GG_SOD2.live[key].destroy() end)
  GG_SOD2.live[key] = nil
end
local t = createTimer(nil, false)
t.Interval = 50
t.OnTimer = function(timer)
  if not st.addr then return end
  ${
    vtWrite === "int"
      ? "writeInteger(st.addr, " + value + ")"
      : "writeFloat(st.addr, " + value + ")"
  }
end
t.Enabled = true
GG_SOD2.live[key] = t
showMessage('${desc} ON @ '..string.format('%X', st.addr)..' = ${value} (every 50ms)\\nUntick to stop.')
{$asm}
[DISABLE]
{$lua}
GG_SOD2 = GG_SOD2 or {}
GG_SOD2.live = GG_SOD2.live or {}
local key = 'timer_${kind}'
if GG_SOD2.live[key] then
  pcall(function() GG_SOD2.live[key].destroy() end)
  GG_SOD2.live[key] = nil
end
`;

const LIVE_FIND_INT = (kind, prompt) => `[ENABLE]
{$lua}
if syntaxcheck then return end
GG_SOD2 = GG_SOD2 or {}
GG_SOD2.live = GG_SOD2.live or {}

local function fail(msg)
  showMessage('GGdropman SoD2 Live: '..tostring(msg))
  error(msg, 0)
end

if getOpenedProcessID() == 0 then
  fail('Attach to StateOfDecay2-Win64-Shipping.exe first')
end

local key = '${kind}'
local st = GG_SOD2.live[key] or { step = 0 }
GG_SOD2.live[key] = st

if st.step == 0 then
  local v = inputQuery('Find ${kind}', '${prompt}\\nEnter the CURRENT integer value, then OK.', '')
  if not v or v == '' then fail('Cancelled') end
  if st.ms then pcall(function() st.ms.destroy() end) end
  st.ms = createMemScan()
  st.ms.firstScan(soExactValue, vtDword, rtRoundedDefault, v, '', '0', '7fffffffffffffff', '+W-C', fsmNotAligned, '1', false, false, false, false)
  st.ms.waitTillDone()
  local fl = createFoundList(st.ms)
  fl.initialize()
  local n = fl.Count
  fl.deinitialize()
  st.step = 1
  st.vt = 'int'
  showMessage('First scan done ('..tostring(n)..' hits).\\nChange ${kind} in-game, then tick this entry AGAIN.')
elseif st.step == 1 then
  local v = inputQuery('Find ${kind} (next)', 'Enter the NEW integer value after changing it in-game.', '')
  if not v or v == '' then fail('Cancelled') end
  if not st.ms then fail('Restart Find (step 0 missing)') end
  st.ms.nextScan(soExactValue, rtRoundedDefault, v, '', false, false, false, false, false)
  st.ms.waitTillDone()
  local fl = createFoundList(st.ms)
  fl.initialize()
  local n = fl.Count
  if n == 0 then
    fl.deinitialize()
    st.step = 0
    fail('0 results — untick and restart Find ${kind}')
  end
  local addr = fl.Address[0]
  if n > 1 then
    showMessage(tostring(n)..' results left. Using first: '..addr..'\\nNarrow further with CE scan UI if needed.')
  end
  local num = tonumber(addr, 16) or getAddress(addr)
  st.addr = num
  st.addrStr = addr
  fl.deinitialize()
  st.step = 0
  showMessage('${kind} address: '..tostring(addr)..'\\nEnable Infinite / Freeze below.')
end

createThread(function()
  sleep(200)
  if memrec then memrec.Active = false end
end)
{$asm}
[DISABLE]
`;

const SPAWN_CUSTOM_LUA = oneshotLua(`GG_SOD2.requireHelpers()
local cat = inputQuery('Category', 'ammo | consumable | ranged | melee | resource | misc | backpack | closeCombat | rangedMod | facilityMod', 'ammo')
if not cat or cat == '' then error('cancelled', 0) end
local path = inputQuery('Class path', 'Full /Game/Items/..._C path (see browser editor catalog)', '/Game/Items/Ammo/Ammo_9mm.Ammo_9mm_C')
if not path or path == '' then error('cancelled', 0) end
local stack = inputQuery('Stack / count', 'For weapons use 1', '99')
local locker = inputQuery('Locker index', '0 = primary supply locker', '0')
GG_SOD2.runCli({'action', 'spawn-item', cat, path, stack or '99', locker or '0'})
`);

rootChildren.push({
  id: nid(),
  desc: "=== SAVE — Spawn items ===",
  options: 'moHideChildren="1"',
  color: "0000A5FF",
  group: true,
  children: [
    {
      id: nid(),
      desc: "Notes — spawn into locker (game closed)",
      aa: readmeAa(`Close SoD2. Load save-bridge helpers + set save path.
Kits add items to locker #0 (primary).
Custom spawn asks for category + /Game/Items/... path.
Use the browser editor catalog for more paths.`),
    },
    {
      id: nid(),
      desc: "Kit: All common ammo ×999",
      aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', 'spawn-kit', 'ammo-all'})`),
    },
    {
      id: nid(),
      desc: "Kit: Meds / bandages / plague cure",
      aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', 'spawn-kit', 'meds'})`),
    },
    {
      id: nid(),
      desc: "Kit: Stimulants + espresso",
      aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', 'spawn-kit', 'stimulants'})`),
    },
    {
      id: nid(),
      desc: "Kit: Throwables (nades / molotov / pipe)",
      aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', 'spawn-kit', 'throwables'})`),
    },
    {
      id: nid(),
      desc: "Kit: Snacks",
      aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', 'spawn-kit', 'snacks'})`),
    },
    {
      id: nid(),
      desc: "Kit: Resource packs",
      aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', 'spawn-kit', 'resources'})`),
    },
    {
      id: nid(),
      desc: "Kit: Assault loadout (guns + ammo + meds)",
      aa: oneshotLua(`GG_SOD2.requireHelpers()
GG_SOD2.runCli({'action', 'spawn-kit', 'loadout-assault'})`),
    },
    {
      id: nid(),
      desc: "Custom spawn item (prompt)",
      aa: SPAWN_CUSTOM_LUA,
    },
  ],
});

rootChildren.push({
  id: nid(),
  desc: "=== LIVE — Scan / Freeze ===",
  options: 'moHideChildren="1"',
  color: "000080FF",
  group: true,
  children: [
    {
      id: nid(),
      desc: "Notes — live usage",
      aa: readmeAa(`Attach CE to StateOfDecay2-Win64-Shipping.exe while in-game.

Find wizards use exact scans:
1) Tick Find X, enter current value
2) Change the value in-game
3) Tick Find X again, enter the new value
4) Tick Freeze / Infinite / Super …

Ammo: try Find Ammo (int) first; if empty, try Find Ammo (float).
Speed/Jump/Fly: find while standing still then sprint / jump / note gravity.
Addresses move; re-find after relaunch.`),
    },
    {
      id: nid(),
      desc: "Find Influence",
      aa: LIVE_FIND("Influence", "Open Community — note Influence."),
    },
    {
      id: nid(),
      desc: "Freeze Influence 9999",
      aa: LIVE_FREEZE("Influence", "9999", "SoD2 Influence (freeze)"),
    },
    {
      id: nid(),
      desc: "Find Resource (food/meds/ammo/mat/fuel)",
      aa: LIVE_FIND("Resource", "Note one stockpile resource amount."),
    },
    {
      id: nid(),
      desc: "Freeze Resource 999",
      aa: LIVE_FREEZE("Resource", "999", "SoD2 Resource (freeze)"),
    },
    {
      id: nid(),
      desc: "Find Health",
      aa: LIVE_FIND("Health", "Note current health (may be 0-1 or 0-100)."),
    },
    {
      id: nid(),
      desc: "Freeze Health",
      aa: LIVE_FREEZE("Health", "1", "SoD2 Health (freeze)"),
    },
    {
      id: nid(),
      desc: "Find Stamina",
      aa: LIVE_FIND("Stamina", "Note current stamina, then sprint."),
    },
    {
      id: nid(),
      desc: "Freeze Stamina",
      aa: LIVE_FREEZE("Stamina", "1", "SoD2 Stamina (freeze)"),
    },
  ],
});

rootChildren.push({
  id: nid(),
  desc: "=== LIVE — Infinite ammo / Speed / Jump / Fly ===",
  options: 'moHideChildren="1"',
  color: "0000FF80",
  group: true,
  children: [
    {
      id: nid(),
      desc: "Notes — movement & ammo",
      aa: readmeAa(`INFINITE AMMO
1) Equip a gun, note magazine count
2) Find Ammo (int) — fire once — Find again
3) Tick Infinite Ammo (timer)
If int finds nothing, use Find Ammo (float) + Infinite Ammo float.

SUPER SPEED
1) Find Speed — enter current MaxWalkSpeed-like value (often 400-600)
2) Sprint or change movement to narrow, OR unknown initial scan via CE
3) Tick Super Speed (writes 2500)

Tip: unknown initial value — use CE first scan for Unknown, then Increased when you sprint, then Find Speed once you know the number.

SUPER JUMP
1) Find Jump — note JumpZVelocity-like float (often 400-700)
2) Jump to confirm / next-scan
3) Tick Super Jump (writes 2500)

FLY / NOCLIP (soft)
1) Find Gravity — note GravityScale (often 1.0)
2) Tick Fly: Gravity 0
3) Optional: Find Z Velocity and freeze while holding jump in-game
True collision noclip needs an AOB (still deferred).`),
    },
    {
      id: nid(),
      desc: "Find Ammo (int magazine)",
      aa: LIVE_FIND_INT("AmmoInt", "Note rounds in magazine, then fire."),
    },
    {
      id: nid(),
      desc: "Infinite Ammo (int timer)",
      color: "0000FF00",
      aa: LIVE_TIMER("AmmoInt", "999", "int", "Infinite Ammo (int)"),
    },
    {
      id: nid(),
      desc: "Find Ammo (float)",
      aa: LIVE_FIND("Ammo", "Note magazine as float if int scan fails."),
    },
    {
      id: nid(),
      desc: "Infinite Ammo (float timer)",
      color: "0000FF00",
      aa: LIVE_TIMER("Ammo", "999", "float", "Infinite Ammo (float)"),
    },
    {
      id: nid(),
      desc: "Find Speed (walk/sprint float)",
      aa: LIVE_FIND("Speed", "Note walk speed float if known, or use CE Unknown→Increased while sprinting then enter value here."),
    },
    {
      id: nid(),
      desc: "Super Speed (freeze 2500)",
      color: "0000FF00",
      aa: LIVE_FREEZE("Speed", "2500", "SoD2 Super Speed"),
    },
    {
      id: nid(),
      desc: "Super Speed (timer 2500)",
      color: "0000FF00",
      aa: LIVE_TIMER("Speed", "2500", "float", "Super Speed timer"),
    },
    {
      id: nid(),
      desc: "Find Jump (JumpZ float)",
      aa: LIVE_FIND("Jump", "Note jump strength float, then jump to change / confirm."),
    },
    {
      id: nid(),
      desc: "Super Jump (freeze 2500)",
      color: "0000FF00",
      aa: LIVE_FREEZE("Jump", "2500", "SoD2 Super Jump"),
    },
    {
      id: nid(),
      desc: "Find Gravity (GravityScale)",
      aa: LIVE_FIND("Gravity", "Usually 1.0 on the ground. Change by entering a vehicle / water if needed."),
    },
    {
      id: nid(),
      desc: "Fly — Gravity 0 (timer)",
      color: "0000FF00",
      aa: LIVE_TIMER("Gravity", "0", "float", "Fly GravityScale=0"),
    },
    {
      id: nid(),
      desc: "Find Z Velocity",
      aa: LIVE_FIND("ZVel", "Jump and note vertical velocity, or scan while falling."),
    },
    {
      id: nid(),
      desc: "Fly up — Z Velocity timer 800",
      color: "0000FF00",
      aa: LIVE_TIMER("ZVel", "800", "float", "Fly up ZVel"),
    },
  ],
});

rootChildren.push({
  id: nid(),
  desc: "=== LIVE — experimental AOBs (coming) ===",
  options: 'moHideChildren="1"',
  color: "00808080",
  group: true,
  children: [
    {
      id: nid(),
      desc: "Placeholder — true noclip / no reload AOB",
      aa: readmeAa(`Hard noclip and instruction-level infinite ammo need verified AOBs on a current build.
Use Infinite Ammo timers + Gravity 0 / ZVel for soft fly until then.`),
    },
  ],
});

rootChildren.push({
  id: nid(),
  desc: "Browser editor for deep edits",
  aa: readmeAa(`Open tools/sod2-editor/editor.html for:
- Per-survivor traits / skills / outfits / transfer
- Per-item locker editing / catalog browser
- WGS / Game Pass unpack
- Diff / field scan / multi-slot UI`),
});

const root = {
  id: nid(),
  desc: "=== GGdropmans State of Decay 2 v1.1 ===",
  options: 'moHideChildren="1"',
  color: "00C45A2A",
  group: true,
  children: rootChildren,
};

const xml = `<?xml version="1.0" encoding="utf-8"?>
<CheatTable CheatEngineTableVersion="46">
  <CheatEntries>
${renderEntry(root, 2)}
  </CheatEntries>
</CheatTable>
`;

fs.writeFileSync(OUT, xml, "utf8");
console.log("Wrote", OUT, "(" + xml.length + " bytes, ids up to " + (nextId - 1) + ")");
