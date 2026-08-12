$ErrorActionPreference = 'Stop'
$ct = 'C:\Users\Owner\Downloads\ggdropmansmoddingtools\tools\grounded2-editor\GGdropmanGrounded2V1.0.CT'
try {
  [xml]$null = Get-Content -Raw -LiteralPath $ct
  Write-Output 'xml ok'
} catch {
  Write-Output ("xml FAIL: " + $_.Exception.Message)
}
$t = Get-Content -Raw -LiteralPath $ct
Write-Output ("sdk=" + ($t -match 'resolveSdkChain'))
Write-Output ("bind=" + ($t -match 'bind SDK vitals'))
Write-Output ("absP=" + ($t -match 'registerSymbol\("Player", pawn, true\)'))
Write-Output ("GObj=" + ($t -match 'GObjects = 0xAC580A8'))
Write-Output ("GNames=" + ($t -match 'GNames = 0xAB3B8F8'))
Write-Output ("cmc1400=" + ($t -match '0x1400'))
Write-Output ("old1B8=" + ([regex]::Matches($t, 'gg2_vital_outer or 0x1B8')).Count)
Write-Output ("oldDC8def=" + ([regex]::Matches($t, 'gg2_cmc_off or 0xDC8')).Count)
Write-Output ((Get-Item -LiteralPath $ct).LastWriteTime.ToString())
