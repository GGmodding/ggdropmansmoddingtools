$ErrorActionPreference = 'Stop'
$srcDir = 'c:\Dumper-7'
Get-ChildItem -LiteralPath $srcDir | Where-Object {
  $_.Name -like '*3054196*' -or $_.Name -like '*0.5.0.2*' -or $_.Name -like '*Augusta*'
} | Format-Table Name, Length, LastWriteTime -AutoSize

$zipCandidates = @(
  'c:\Dumper-7\5.6.1-3054196+++Augusta+release-0.5.0.2-Augusta.zip',
  'c:\Dumper-7\5.6.1-3054196+++Augusta+release-0.5.0.2-Augusta\CppSDK.zip'
)

$zip = $null
foreach ($c in $zipCandidates) {
  if (Test-Path -LiteralPath $c) { $zip = $c; break }
}

if (-not $zip) {
  Write-Output '--- all zips ---'
  Get-ChildItem -LiteralPath $srcDir -Recurse -Filter '*.zip' -ErrorAction SilentlyContinue |
    Select-Object -First 40 FullName, Length |
    Format-Table -AutoSize
  throw 'Could not find 0.5.0.2 zip'
}

Write-Output ("Using zip: " + $zip)
$dest = 'C:\Users\Owner\Downloads\ggdropmansmoddingtools\tools\grounded2-editor\_probe\CppSDK_0.5.0.2'
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
New-Item -ItemType Directory -Path $dest | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
Get-ChildItem -LiteralPath $dest | Select-Object Name
Get-ChildItem -LiteralPath $dest -Recurse -Filter 'Basic.hpp' | ForEach-Object { $_.FullName }
