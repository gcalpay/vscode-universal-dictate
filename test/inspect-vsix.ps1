# Build-time package audit only. This never installs or starts the extension.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$SourceRoot = (Join-Path $PSScriptRoot '..'),
    [Parameter(Mandatory = $true)][string]$ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Resolve-Path -LiteralPath $SourceRoot).Path
$vsix = (Resolve-Path -LiteralPath $Path).Path
$source = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json -AsHashtable
$zip = [System.IO.Compression.ZipFile]::OpenRead($vsix)

function Assert-Valid([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw "VSIX audit failed: $Message" }
}
function Get-Entry([string]$Name) {
    $entry = $zip.GetEntry($Name)
    Assert-Valid ($null -ne $entry) "missing entry $Name"
    return $entry
}
function Read-EntryText([string]$Name) {
    $stream = (Get-Entry $Name).Open()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() }
    finally { $reader.Dispose() }
}
function Get-EntryHash([string]$Name) {
    $stream = (Get-Entry $Name).Open()
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose(); $stream.Dispose() }
}
function Assert-X64Executable([string]$Name) {
    $stream = (Get-Entry $Name).Open()
    $reader = [System.IO.BinaryReader]::new($stream)
    try {
        $header = $reader.ReadBytes(64)
        Assert-Valid ($header.Length -eq 64 -and $header[0] -eq 0x4d -and $header[1] -eq 0x5a) "invalid executable $Name"
        $offset = [System.BitConverter]::ToInt32($header, 60)
        Assert-Valid ($offset -ge 64 -and $offset -le 1048576) "invalid PE offset $Name"
        $remaining = $reader.ReadBytes($offset - 64 + 6)
        Assert-Valid ($remaining.Length -eq $offset - 64 + 6) "truncated PE header $Name"
        $index = $offset - 64
        Assert-Valid ([System.BitConverter]::ToUInt32($remaining, $index) -eq 0x00004550) "missing PE signature $Name"
        Assert-Valid ([System.BitConverter]::ToUInt16($remaining, $index + 4) -eq 0x8664) "not an x64 executable: $Name"
    } finally { $reader.Dispose() }
}

try {
    $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName
        Assert-Valid ($names.Add($name)) "duplicate/case-colliding entry $name"
        Assert-Valid ($name -notmatch '(^/|\\|(^|/)\.\.(/|$))') "unsafe archive path $name"
        Assert-Valid ($name -notmatch '^extension/(\.git|\.github|\.vscode|\.deps|docs|native|test|src|node_modules)/') "development directory packaged: $name"
        Assert-Valid ($name -notmatch '(^|/)(AGENTS\.md|tsconfig\.json|\.gitignore|windows-fast-paste\.exe|windows-clipboard-paste\.exe|clipboard-protocol\.js)$') "development/legacy file packaged: $name"
        Assert-Valid ($name -notmatch '\.(ts|map|obj|lib|exp|pdb|vsix|ttf|otf|woff|woff2)$') "source/debug/build file packaged: $name"
        Assert-Valid ($name -notmatch '(?i)(^|/)[^/]*-test\.exe$') "test executable packaged: $name"
        Assert-Valid ($name -notmatch '^extension/resources/whisper/.*\.exe$' -or $name -match '^extension/resources/whisper/whisper-(cli|server)\.exe$') "unused upstream executable packaged: $name"
    }

    $manifest = Read-EntryText 'extension/package.json' | ConvertFrom-Json -AsHashtable
    foreach ($key in @('name', 'publisher', 'version', 'main')) {
        Assert-Valid ($manifest[$key] -eq $source[$key]) "package.json $key differs from source"
    }
    Assert-Valid ($manifest.engines.vscode -eq $source.engines.vscode) 'VS Code engine range differs from source'
    Assert-Valid (@($manifest.extensionKind).Count -eq 1 -and $manifest.extensionKind[0] -eq 'ui') 'extension must run in the UI host'
    Assert-Valid ($manifest.contributes.configuration.properties.'universalDictate.language'.default -eq 'en') 'English must be the default language'
    Assert-Valid ($manifest.contributes.configuration.properties.'universalDictate.overlaySize'.default -eq 'medium') 'Medium overlay is not the default'
    Assert-Valid ($manifest.contributes.configuration.properties.'universalDictate.overwriteClipboard'.default -eq $false) 'Overwrite clipboard must default Off'
    Assert-Valid ($manifest.contributes.configuration.properties.'universalDictate.livePreview'.default -eq $false) 'Live preview must default Off'
    foreach ($command in @('copyLastTranscript')) {
        $id = "universalDictate.$command"
        $commandEntries = @($manifest.contributes.commands | Where-Object { $_.command -eq $id })
        Assert-Valid ($commandEntries.Count -eq 1) "missing/duplicate recovery command $id"
    }
    foreach ($removed in @('insertLastTranscript', 'clearLastTranscript')) {
        Assert-Valid (@($manifest.contributes.commands | Where-Object { $_.command -eq "universalDictate.$removed" }).Count -eq 0) 'obsolete recovery command packaged'
    }
    # Parse XML without any external resolver; do not execute archive content.
    $xml = [System.Xml.XmlDocument]::new()
    $xml.XmlResolver = $null
    $xml.LoadXml((Read-EntryText 'extension.vsixmanifest'))
    $identity = $xml.SelectSingleNode("//*[local-name()='Metadata']/*[local-name()='Identity']")
    Assert-Valid ($null -ne $identity) 'VSIX identity missing'
    Assert-Valid ($identity.GetAttribute('Id') -eq $source.name) 'VSIX extension ID mismatch'
    Assert-Valid ($identity.GetAttribute('Publisher') -eq $source.publisher) 'VSIX publisher mismatch'
    Assert-Valid ($identity.GetAttribute('Version') -eq $source.version) 'VSIX version mismatch'
    [void](Get-Entry ('extension/' + $source.main.TrimStart([char[]]'./')))

    $hashes = [ordered]@{}
    foreach ($relative in @('media/status-bar-controls.webp', 'media/settings-menu.webp', 'media/live-preview.webp', 'media/enhanced-overlay.webp', 'media/icon.png')) {
        $entryName = "extension/$relative"
        $actual = Get-EntryHash $entryName
        Assert-Valid ($actual -eq (Get-FileHash -LiteralPath (Join-Path $root $relative) -Algorithm SHA256).Hash.ToLowerInvariant()) "stale release image: $relative"
        $hashes[$entryName] = $actual
    }
    Assert-Valid ($null -eq $zip.GetEntry('extension/media/universal-dictate-overview.webp')) 'obsolete overview image packaged'
    $readme = Read-EntryText 'extension/readme.md'
    $changelog = Read-EntryText 'extension/changelog.md'
    foreach ($image in @('status-bar-controls.webp', 'settings-menu.webp', 'live-preview.webp', 'enhanced-overlay.webp')) {
        Assert-Valid ($readme.Contains("media/$image")) "README screenshot missing: $image"
    }
    Assert-Valid ($changelog.Contains("## $($manifest.version)")) 'current version missing from changelog'
    $hashes['extension/readme.md'] = Get-EntryHash 'extension/readme.md'
    $hashes['extension/changelog.md'] = Get-EntryHash 'extension/changelog.md'
    $compiled = @(Get-ChildItem -LiteralPath (Join-Path $root 'dist') -Filter '*.js' -File -Recurse)
    Assert-Valid ($compiled.Count -gt 0) 'compiled extension modules missing'
    foreach ($file in $compiled) {
        $relative = [System.IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
        $entryName = "extension/$relative"
        $actual = Get-EntryHash $entryName
        Assert-Valid ($actual -eq (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()) "stale compiled module $entryName"
        $hashes[$entryName] = $actual
    }
    Assert-Valid ((Read-EntryText 'extension/dist/core/input-protocol.js').Contains('--unicode-input-v1')) 'host Unicode input protocol mismatch'

    foreach ($file in @('windows-text-input.exe', 'universal-dictate-recorder.exe')) {
        $relative = "resources/bin/$file"
        $entryName = "extension/$relative"
        Assert-X64Executable $entryName
        $hash = Get-EntryHash $entryName
        Assert-Valid ($hash -eq (Get-FileHash -LiteralPath (Join-Path $root $relative) -Algorithm SHA256).Hash.ToLowerInvariant()) "packaged helper differs from the native build: $file"
        $hashes[$entryName] = $hash
    }
    foreach ($file in @('whisper-cli.exe', 'whisper-server.exe')) {
        $entryName = "extension/resources/whisper/$file"
        Assert-X64Executable $entryName
        $hashes[$entryName] = Get-EntryHash $entryName
    }

    $report = [ordered]@{
        audit = 'passed'
        run_id = $env:GITHUB_RUN_ID
        run_attempt = $env:GITHUB_RUN_ATTEMPT
        checked_out_commit = $env:GITHUB_SHA
        source_branch = $env:GITHUB_HEAD_REF
        extension_version = $manifest.version
        sha256 = (Get-FileHash -LiteralPath $vsix -Algorithm SHA256).Hash.ToLowerInvariant()
        zip_entries = $zip.Entries.Count
        verified_payload_sha256 = $hashes
        note = 'Build/package checks only; not a real VS Code/Codex acceptance test.'
    }
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8
    Write-Output "VSIX audit passed: $($zip.Entries.Count) entries; archive SHA-256 $($report.sha256)"
} finally {
    $zip.Dispose()
}
