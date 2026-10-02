param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $KatLangArgs
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$Assets = Join-Path $Root 'assets/cli'

# Machine architecture, not process architecture: an emulated x64/x86 PowerShell
# on Windows on ARM must still select the native win-arm64 runtime.
$Arm64 = ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') -or ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64')
if (-not $Arm64) {
    try {
        $Arm64 = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() -eq 'Arm64'
    } catch { }
}
$Rid = if ($Arm64) { 'win-arm64' } else { 'win-x64' }

$Archives = @(Get-ChildItem -LiteralPath $Assets -Filter "katlang-cli-*-$Rid.zip" -File)

if ($Archives.Count -ne 1) {
    throw "Expected exactly one KatLang $Rid release archive in $Assets."
}

$Archive = $Archives[0]
$Match = [regex]::Match($Archive.Name, "^katlang-cli-(.+)-$Rid\.zip$")
if (-not $Match.Success -or [string]::IsNullOrWhiteSpace($Match.Groups[1].Value)) {
    throw "Invalid KatLang $Rid release archive name: $($Archive.Name)"
}

$Version = $Match.Groups[1].Value
$Cache = Join-Path ([System.IO.Path]::GetTempPath()) "katlang-$Version-$Rid"
$Bin = Join-Path $Cache 'katlang.exe'

if (-not (Test-Path -LiteralPath $Bin -PathType Leaf)) {
    New-Item -ItemType Directory -Force -Path $Cache | Out-Null
    Expand-Archive -LiteralPath $Archive.FullName -DestinationPath $Cache -Force
}

& $Bin @KatLangArgs
exit $LASTEXITCODE
