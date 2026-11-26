<#
.SYNOPSIS
    Exports heroes' generic lines from the hero files so they can be pasted into the Google Sheet.

.DESCRIPTION
    Writes one text file per hero (one line per row) to dist/sheet_export/. To get them into the
    sheet: open the file, select all, copy, click cell A2 of that hero's tab, paste. Each line
    lands in its own row of column A.

    Lines starting with = + - @ get a leading apostrophe so Sheets keeps them as text.
    Only generic `lines` are exported; vsHero lines are not (each tab's columns differ).

.PARAMETER Heroes
    Display names or internal ids, e.g. -Heroes "Billy,Solomon" or -Heroes hero_punkgoat.
    Omit to export every hero.

.PARAMETER Clipboard
    Also copy the lines to the clipboard (only when exporting a single hero).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\Export-HeroLines.ps1 -Heroes "Billy,Solomon"
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\Export-HeroLines.ps1 -Heroes Billy -Clipboard
#>
[CmdletBinding()]
param(
    [string[]]$Heroes,
    [switch]$Clipboard,
    [string]$OutDir,
    [string]$HeroDir
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HeroDir) { $HeroDir = Join-Path $RepoRoot 'deadlock-kill-chat\panorama\scripts\heroes' }
if (-not $OutDir) { $OutDir = Join-Path $RepoRoot 'dist\sheet_export' }
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Unescape a JS double-quoted string body (\" \' \\ \n \t \uXXXX).
function ConvertFrom-JsString([string]$s) {
    return [regex]::Replace($s, '\\(u[0-9A-Fa-f]{4}|.)', {
        param($m)
        $e = $m.Groups[1].Value
        switch -CaseSensitive ($e) {
            'n' { ' ' } 't' { ' ' } 'r' { '' }
            default { if ($e.Length -eq 5) { [string][char][Convert]::ToInt32($e.Substring(1), 16) } else { $e } }
        }
    })
}

$wanted = $null
if ($Heroes) { $wanted = @($Heroes | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ }) }

$found = @()
foreach ($file in Get-ChildItem -Path $HeroDir -Filter 'hero_*.js') {
    $text = [System.IO.File]::ReadAllText($file.FullName)
    $id = [regex]::Match($text, "(?m)^\s*id:\s*'([^']+)'").Groups[1].Value
    $name = [regex]::Match($text, "(?m)^\s*name:\s*'([^']+)'").Groups[1].Value
    if ($wanted -and $wanted -notcontains $id.ToLowerInvariant() -and $wanted -notcontains $name.ToLowerInvariant()) { continue }

    $block = [regex]::Match($text, '(?s)\blines:\s*\[(.*?)\n\s*\],').Groups[1].Value
    $lines = foreach ($m in [regex]::Matches($block, '"((?:[^"\\]|\\.)*)"')) {
        $line = (ConvertFrom-JsString $m.Groups[1].Value).Trim()
        if (-not $line) { continue }
        if ($line -match '^[=+\-@]') { $line = "'" + $line }
        $line
    }
    $lines = @($lines)
    $found += [pscustomobject]@{ Hero = $name; Id = $id; Lines = $lines.Count; Text = ($lines -join "`r`n") }
}

if ($wanted) {
    $missing = @($wanted | Where-Object { $w = $_; -not ($found | Where-Object { $_.Id -eq $w -or $_.Hero.ToLowerInvariant() -eq $w }) })
    if ($missing.Count) { throw "No hero file for: $($missing -join ', ')" }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
foreach ($h in $found) {
    $path = Join-Path $OutDir ($h.Hero + '.txt')
    [System.IO.File]::WriteAllText($path, $h.Text + "`r`n", $Utf8NoBom)
    $h | Add-Member -NotePropertyName File -NotePropertyValue $path
}
$found | Select-Object Hero, Id, Lines, File | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

if ($Clipboard) {
    if ($found.Count -ne 1) { Write-Warning "-Clipboard needs exactly one hero; nothing copied." }
    else { Set-Clipboard -Value $found[0].Text; Write-Host "Copied $($found[0].Lines) $($found[0].Hero) lines - click A2 in the '$($found[0].Hero)' tab and paste." }
}
