# Isolated M1.2 test session. Does not modify or launch the user's installed VS Code.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$HostDirectory,
    [string]$CodexVsix,
    [switch]$InstallCodexOnly
)
$ErrorActionPreference = 'Stop'
$hostRoot = (Resolve-Path -LiteralPath $HostDirectory).Path
$hostManifest = Get-Content -Raw -LiteralPath (Join-Path $hostRoot 'm12-host.json') | ConvertFrom-Json
if ($hostManifest.upstream -ne '8e35945bae3f2b0b3d0276963281180f1ce10cb0' -or
    $hostManifest.variant -notin @('baseline', 'h1') -or
    $hostManifest.executable -ne 'Code - OSS.exe') { throw 'Not an identified M1.2 Code OSS host.' }
if (Test-Path -LiteralPath (Join-Path $hostRoot 'data')) { throw 'Remove portable-mode data from this diagnostic host or use a fresh extraction; profiles must remain isolated.' }
$exe = Join-Path $hostRoot $hostManifest.executable
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hostManifest.executableSha256) {
    throw 'Host executable does not match its build manifest.'
}
$kit = $PSScriptRoot
$probeManifest = Get-Content -Raw -LiteralPath (Join-Path $kit 'probe-manifest.json') | ConvertFrom-Json
if ($probeManifest.diagnostic -ne 'M1.2' -or $probeManifest.commit -ne $hostManifest.probeCommit) {
    throw 'Host and probe kit must be produced from the same diagnostic commit.'
}
$state = Join-Path $kit ('.sessions/' + $hostManifest.variant)
$userData = Join-Path $state 'user-data'
$extensions = Join-Path $state 'extensions'
$scratch = Join-Path $state 'scratch'
foreach ($dir in @($userData, $extensions, $scratch, (Join-Path $userData 'User'))) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
$settingsPath = Join-Path $userData 'User/settings.json'
if (-not (Test-Path -LiteralPath $settingsPath)) {
    '{"telemetry.telemetryLevel":"off","extensions.autoUpdate":false,"extensions.autoCheckUpdates":false}' |
        Set-Content -LiteralPath $settingsPath -Encoding utf8
}
$saved = @{}
foreach ($key in @('UD_FOCUS_PROBE','CODEX_HOME','VSCODE_PORTABLE','VSCODE_IPC_HOOK_CLI')) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
try {
    $env:UD_FOCUS_PROBE = 'M1.2'
    $env:CODEX_HOME = Join-Path $state 'codex-home'
    New-Item -ItemType Directory -Force -Path $env:CODEX_HOME | Out-Null
    Remove-Item Env:VSCODE_PORTABLE -ErrorAction SilentlyContinue
    Remove-Item Env:VSCODE_IPC_HOOK_CLI -ErrorAction SilentlyContinue
    $common = @('--user-data-dir', $userData, '--extensions-dir', $extensions)
    if ($CodexVsix) {
        $vsix = (Resolve-Path -LiteralPath $CodexVsix).Path
        & (Join-Path $hostRoot 'bin/code-oss.cmd') @common '--install-extension' $vsix
        if ($LASTEXITCODE -ne 0) { throw 'Codex VSIX installation failed. Mark Codex cases Blocked; do not substitute another composer.' }
    }
    if ($InstallCodexOnly) { return }
    & $exe @common '--new-window' '--skip-welcome' '--skip-release-notes' "--extensionDevelopmentPath=$(Join-Path $kit 'extension')" $scratch
    if ($LASTEXITCODE -ne 0) { throw "Diagnostic host exited with $LASTEXITCODE" }
} finally {
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
}
