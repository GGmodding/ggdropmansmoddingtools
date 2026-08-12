$ErrorActionPreference = 'Stop'
$ct = 'C:\Users\Owner\Downloads\ggdropmansmoddingtools\tools\grounded2-editor\GGdropmanGrounded2V1.0.CT'
$xml = Get-Content -Raw -LiteralPath $ct

function Esc-Lua([string]$s) {
  return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

Write-Output "resolveSdk(before)=$($xml -match 'resolveSdkChain')"

$start = $xml.IndexOf('step("probe vitals")')
$endMarker = 'Health rows use GG2_* symbols now.")'
$end = $xml.IndexOf($endMarker, $start)
if ($start -lt 0 -or $end -lt 0) { throw "markers start=$start end=$end" }
$end = $end + $endMarker.Length

$newVit = @'
step("bind SDK vitals")
gg2_cmc_off = 0x1400
gg2_vital_outer = 0x13A0
local pawnObj = getAddressSafe("Player")
if pawnObj ~= nil then
  local maybe = readQword(pawnObj)
  if isHeapPtr(maybe) and looksUObject(maybe) then
    local hcTest = readQword(maybe + 0x13A0)
    if looksUObject(hcTest) then pawnObj = maybe end
  end
end
local hc = pawnObj and readQword(pawnObj + 0x13A0) or nil
local sc = pawnObj and readQword(pawnObj + 0x13B8) or nil
local sv = pawnObj and readQword(pawnObj + 0x14C8) or nil
local mx, dmg, cst, mst, food, water, breath = nil,nil,nil,nil,nil,nil,nil
if looksUObject(hc) then
  mx = readFloat(hc + 0x318)
  dmg = readFloat(hc + 0x31C)
  regAbs("GG2_BaseHealth", hc + 0x318)
  regAbs("GG2_HealthDamaged", hc + 0x31C)
end
if looksUObject(sc) then
  cst = readFloat(sc + 0xF8)
  mst = readFloat(sc + 0xFC)
  regAbs("GG2_CurStamina", sc + 0xF8)
  regAbs("GG2_BaseStamina", sc + 0xFC)
end
if looksUObject(sv) then
  food = readFloat(sv + 0x288)
  water = readFloat(sv + 0x290)
  breath = readFloat(sv + 0x298)
  regAbs("GG2_Hunger", sv + 0x288)
  regAbs("GG2_Thirst", sv + 0x290)
  regAbs("GG2_Oxygen", sv + 0x298)
  regAbs("GG2_MaxHunger", sv + 0x148)
  regAbs("GG2_MaxThirst", sv + 0x190)
  regAbs("GG2_MaxOxygen", sv + 0x1D8)
  regAbs("GG2_OxygenRate", sv + 0x1DC)
end
print(string.format("SDK vitals HP max=%.1f dmg=%.1f stam=%.1f/%.1f food=%.1f water=%.1f breath=%.1f", mx or -1, dmg or -1, cst or -1, mst or -1, food or -1, water or -1, breath or -1))

step("done")
say(string.format("Grounded 2 V1.1 ACTIVATE OK (SDK)\nPlayer: %s\nCMC: +0x1400\nMaxHP: %s  Dmg: %s\nStamina: %s / %s\nFood/Water/Breath: %s / %s / %s",
  pawnObj and string.format("%X", pawnObj) or "nil",
  mx and string.format("%.1f", mx) or "?",
  dmg and string.format("%.1f", dmg) or "?",
  cst and string.format("%.1f", cst) or "?",
  mst and string.format("%.1f", mst) or "?",
  food and string.format("%.1f", food) or "?",
  water and string.format("%.1f", water) or "?",
  breath and string.format("%.1f", breath) or "?"))
'@

$xml = $xml.Substring(0, $start) + (Esc-Lua $newVit) + $xml.Substring($end)

if ($xml -notmatch 'resolveSdkChain') {
  $anchor = 'local function resolveFromWorld(world)'
  $idx = $xml.IndexOf($anchor)
  if ($idx -lt 0) { throw 'no resolveFromWorld' }
  $sdkFn = @'
local function resolveSdkChain(world)
  local gi = readQword(world + 0x230)
  if not looksUObj(gi) then
    print("SDK chain: no GI at World+0x230")
    return nil
  end
  local data = readQword(gi + 0x38)
  local num = readInteger(gi + 0x40)
  if not isHeapPtr(data) or num == nil or num < 1 then
    print("SDK chain: LocalPlayers invalid")
    return nil
  end
  local lp = readQword(data)
  if not looksUObj(lp) then return nil end
  local pc = readQword(lp + 0x30)
  if not looksUObj(pc) then
    print("SDK chain: no PC at LP+0x30")
    return nil
  end
  local pawn = readQword(pc + 0x370)
  if not looksUObj(pawn) then
    print("SDK chain: no AcknowledgedPawn at PC+0x370")
    return nil
  end
  local hc = readQword(pawn + 0x13A0)
  if looksUObj(hc) then
    local mx = readFloat(hc + 0x318)
    local dmg = readFloat(hc + 0x31C)
    print(string.format("SDK pawn=%X Health Max=%.1f Dmg=%.1f", pawn, mx or -1, dmg or -1))
  else
    print(string.format("SDK pawn=%X (no HealthComponent +0x13A0)", pawn))
  end
  looksPawn(pawn)
  gg2_cmc_off = 0x1400
  return pawn
end

'@
  $xml = $xml.Substring(0, $idx) + (Esc-Lua $sdkFn) + $xml.Substring($idx)

  $oldHead = "print(string.format(`"resolve: UWorld score=%d`", scoreWorld(world)))`r`n  local gs = nil"
  # Try both CRLF and LF variants
  $inserted = $false
  foreach ($nl in @("`r`n", "`n")) {
    $oh = "print(string.format(`"resolve: UWorld score=%d`", scoreWorld(world)))${nl}  local gs = nil"
    $nh = "print(string.format(`"resolve: UWorld score=%d`", scoreWorld(world)))${nl}  local gs = nil${nl}  local pSdk = resolveSdkChain(world)${nl}  if pSdk ~= nil then return pSdk, gs end"
    if ($xml.Contains($oh)) {
      $xml = $xml.Replace($oh, $nh)
      $inserted = $true
      break
    }
  }
  if (-not $inserted) { throw 'resolve head not found' }
  Write-Output 'sdk chain inserted'
}

# Player absolute register
$oldPlayerPatterns = @(
@(
@'
  pcall(function()
    if getAddressSafe("Player") ~= nil then
      autoAssemble("unregistersymbol(Player)")
    end
    autoAssemble("define(Player,GG2_PlayerHolder)\nregistersymbol(Player)")
    writeQword(getAddress("GG2_PlayerHolder"), pawn)
  end)
'@,
@'
  pcall(function()
    if getAddressSafe("Player") ~= nil then
      pcall(function() unregisterSymbol("Player") end)
      pcall(function() autoAssemble("unregistersymbol(Player)") end)
    end
    writeQword(getAddress("GG2_PlayerHolder"), pawn)
    registerSymbol("Player", pawn, true)
  end)
'@
)
)

$playerPatched = $false
foreach ($pair in $oldPlayerPatterns) {
  if ($xml.Contains($pair[0])) {
    $xml = $xml.Replace($pair[0], $pair[1])
    $playerPatched = $true
    Write-Output 'player register patched'
    break
  }
}
if (-not $playerPatched) {
  # Try reading actual block around player gworld holder
  $idx = $xml.IndexOf('step("player gworld holder")')
  if ($idx -ge 0) {
    $snip = $xml.Substring($idx, [Math]::Min(500, $xml.Length - $idx))
    Write-Output "PLAYER BLOCK SNIP:`n$snip"
  }
  Write-Output 'player register block not found as exact match'
}

$xml = $xml.Replace('GObjects = 0xAC580A0', 'GObjects = 0xAC580A8')
$xml = $xml.Replace('GNames = 0xABA0840', 'GNames = 0xAB3B8F8')
$xml = $xml.Replace('gg2_cmc_off or 0xDC8', 'gg2_cmc_off or 0x1400')
$xml = $xml.Replace('gg2_cmc_off = 0xDC8', 'gg2_cmc_off = 0x1400')

$sb = New-Object Text.StringBuilder ($xml.Length)
foreach ($ch in $xml.ToCharArray()) {
  $c = [int]$ch
  if ($c -eq 9 -or $c -eq 10 -or $c -eq 13 -or ($c -ge 32 -and $c -le 126)) { [void]$sb.Append($ch) } else { [void]$sb.Append('-') }
}
[IO.File]::WriteAllText($ct, $sb.ToString(), (New-Object Text.UTF8Encoding $false))
try { [xml]$null = Get-Content -Raw $ct; Write-Output 'xml ok' } catch { throw $_.Exception.Message }
$t = Get-Content -Raw $ct
Write-Output "sdk=$($t -match 'resolveSdkChain') bind=$($t -match 'bind SDK vitals') absP=$($t.Contains('registerSymbol(\"Player\", pawn, true)'))"
Write-Output "GObj=$($t -match 'GObjects = 0xAC580A8') GNames=$($t -match 'GNames = 0xAB3B8F8') cmc1400=$($t -match '0x1400')"
Write-Output (Get-Item $ct).LastWriteTime
