<#
.SYNOPSIS
    Imports SmackChat lines from the Google Sheet (or a local .xlsx) into the hero files.

.DESCRIPTION
    Sheet layout: one tab per hero, named by display name (e.g. "Abrams", "Mo & Krill").
    Column A = generic lines. Every other column is headed by the VICTIM hero's display name and
    holds that hero-vs-hero's lines. Columns are matched by header text, so their order, and
    whether a tab has its own hero's column, do not matter. Row 1 is the header row.

    For each tab the matching scripts/heroes/hero_*.js file is rewritten from scratch:
    `lines` from column A, `vsHero` from the other columns (every hero is listed; heroes without
    a column or with an empty column get []). The file's id and display name are kept.

    Safety:
      - A tab with no generic lines is skipped, so a blank tab never wipes a hero's lines.
      - Use -DryRun to see what would change without writing anything.
      - Files are plain text in git: review with `git diff`, undo with `git checkout -- <file>`.

.PARAMETER SheetUrl
    Link to the Google Sheet (must be shared as "Anyone with the link can view").
    Defaults to $DefaultSheetUrl below.

.PARAMETER XlsxPath
    Import from a local .xlsx instead of downloading (File > Download > Microsoft Excel).

.PARAMETER Heroes
    Only import these tabs (display names, e.g. -Heroes Abrams,'Mo & Krill').

.PARAMETER DryRun
    Report what would change, write nothing.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\Import-SheetLines.ps1 -DryRun
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\Import-SheetLines.ps1 -SheetUrl "https://docs.google.com/spreadsheets/d/XXXX/edit"
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\Import-SheetLines.ps1 -XlsxPath "$HOME\Downloads\Chatlock.xlsx" -Heroes Abrams
#>
[CmdletBinding()]
param(
    [string]$SheetUrl,
    [string]$XlsxPath,
    [string[]]$Heroes,
    [switch]$DryRun,
    # Folder of hero_*.js files to update. Defaults to the mod's scripts/heroes folder.
    [string]$HeroDir
)

# Paste the sheet link here once so you can run the script with no arguments.
$DefaultSheetUrl = 'https://docs.google.com/spreadsheets/d/14DDKATWqFT_Tk92IwX34IRLEs2EnqJ1-ebHjd2n5DdM/edit'

# Tab/column names that differ from the hero files' display names (compared case-insensitively).
$NameAliases = @{
    'gray talon' = 'grey talon'
    'doorman'    = 'the doorman'
    'mo and krill' = 'mo & krill'
}

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $HeroDir) { $HeroDir = Join-Path $RepoRoot 'deadlock-kill-chat\panorama\scripts\heroes' }
$HeroDir = (Resolve-Path $HeroDir).Path
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-NameKey([string]$name) {
    $key = ($name -replace '\s+', ' ').Trim().ToLowerInvariant()
    if ($NameAliases.ContainsKey($key)) { $key = $NameAliases[$key] }
    return $key
}

# ------------------------------------------------------------------ hero files

function Get-HeroFiles {
    $list = @()
    foreach ($file in Get-ChildItem -Path $HeroDir -Filter 'hero_*.js') {
        $text = [System.IO.File]::ReadAllText($file.FullName)
        $id = [regex]::Match($text, "(?m)^\s*id:\s*'([^']+)'").Groups[1].Value
        $name = [regex]::Match($text, "(?m)^\s*name:\s*'([^']+)'").Groups[1].Value
        if (-not $id -or -not $name) { Write-Warning "Skipping $($file.Name): no id/name found"; continue }
        $lineCount = ([regex]::Match($text, '(?s)lines:\s*\[(.*?)\n\s*\],').Groups[1].Value -split "`n" |
            Where-Object { $_ -match '^\s*"' }).Count
        $list += [pscustomobject]@{ Id = $id; Name = $name; Key = (Get-NameKey $name); Path = $file.FullName; LineCount = $lineCount; Text = $text }
    }
    return $list
}

# ------------------------------------------------------------------ xlsx reading

function Get-ZipXml($zip, [string]$path) {
    $entry = $zip.GetEntry($path)
    # Some zip tools (e.g. .NET Framework's) store entry names with backslashes.
    if (-not $entry) { $entry = $zip.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $path } | Select-Object -First 1 }
    if (-not $entry) { return $null }
    $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
    try { $doc = New-Object System.Xml.XmlDocument; $doc.LoadXml($reader.ReadToEnd()); return $doc }
    finally { $reader.Dispose() }
}

# Text of a <si> or <is> node: all <t> runs, ignoring phonetic (<rPh>) runs.
function Get-RichText($node) {
    if (-not $node) { return '' }
    $parts = $node.SelectNodes(".//*[local-name()='t' and not(ancestor::*[local-name()='rPh'])]")
    return (($parts | ForEach-Object { $_.InnerText }) -join '')
}

function Get-ColumnIndex([string]$cellRef) {
    $letters = ($cellRef -replace '[^A-Za-z]', '').ToUpperInvariant()
    $n = 0
    foreach ($ch in $letters.ToCharArray()) { $n = $n * 26 + ([int]$ch - 64) }
    return $n - 1
}

# Returns an ordered list of @{ Name; Rows } where Rows is a list of string arrays.
function Read-Workbook([string]$path) {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($path)
    try {
        $shared = @()
        $sst = Get-ZipXml $zip 'xl/sharedStrings.xml'
        if ($sst) { $shared = @($sst.DocumentElement.ChildNodes | Where-Object { $_.LocalName -eq 'si' } | ForEach-Object { Get-RichText $_ }) }

        $wb = Get-ZipXml $zip 'xl/workbook.xml'
        $rels = Get-ZipXml $zip 'xl/_rels/workbook.xml.rels'
        $targets = @{}
        foreach ($rel in $rels.DocumentElement.ChildNodes) { $targets[$rel.GetAttribute('Id')] = $rel.GetAttribute('Target') }

        $tabs = @()
        foreach ($sheet in $wb.SelectNodes("//*[local-name()='sheet']")) {
            $rid = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
            $target = $targets[$rid] -replace '^/?xl/', ''
            $xml = Get-ZipXml $zip ('xl/' + $target)
            $rows = @{}
            $maxRow = 0
            foreach ($c in $xml.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']/*[local-name()='c']")) {
                $ref = $c.GetAttribute('r')
                $type = $c.GetAttribute('t')
                $v = $c.SelectSingleNode("*[local-name()='v']")
                $text = switch ($type) {
                    's'         { if ($v) { $shared[[int]$v.InnerText] } else { '' } }
                    'inlineStr' { Get-RichText ($c.SelectSingleNode("*[local-name()='is']")) }
                    default     { if ($v) { $v.InnerText } else { '' } }
                }
                $row = [int]($ref -replace '[^0-9]', '')
                if (-not $rows.ContainsKey($row)) { $rows[$row] = @{} }
                $rows[$row][(Get-ColumnIndex $ref)] = [string]$text
                if ($row -gt $maxRow) { $maxRow = $row }
            }
            $tabs += [pscustomobject]@{ Name = $sheet.GetAttribute('name'); Rows = $rows; MaxRow = $maxRow }
        }
        return $tabs
    }
    finally { $zip.Dispose() }
}

function Get-SheetXlsx([string]$url) {
    $m = [regex]::Match($url, '/spreadsheets/d/([A-Za-z0-9_-]+)')
    if (-not $m.Success) { throw "Not a Google Sheets link: $url" }
    $exportUrl = "https://docs.google.com/spreadsheets/d/$($m.Groups[1].Value)/export?format=xlsx"
    $out = Join-Path ([System.IO.Path]::GetTempPath()) ('smackchat_sheet_' + [guid]::NewGuid().ToString('N') + '.xlsx')
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host "Downloading sheet..."
    Invoke-WebRequest -Uri $exportUrl -OutFile $out -UseBasicParsing
    $head = [System.IO.File]::ReadAllBytes($out) | Select-Object -First 2
    if ($head.Count -lt 2 -or $head[0] -ne 0x50 -or $head[1] -ne 0x4B) {
        Remove-Item $out -Force
        throw "Google did not return a spreadsheet. Make sure the sheet is shared as 'Anyone with the link can view'."
    }
    return $out
}

# ------------------------------------------------------------------ line cleanup + JS output

function ConvertTo-CleanLine([string]$s) {
    if ($null -eq $s) { return '' }
    $s = $s -replace '[\r\n\t]+', ' '
    $s = $s -replace '[​‌‍﻿]', ''
    return ($s -replace ' {2,}', ' ').Trim()
}

function Get-UniqueLines([string[]]$values, [string]$where, [ref]$warnings) {
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $result = New-Object System.Collections.Generic.List[string]
    foreach ($raw in $values) {
        $line = ConvertTo-CleanLine $raw
        if (-not $line) { continue }
        if (-not $seen.Add($line)) { $warnings.Value += "$where - duplicate line skipped: $line"; continue }
        $result.Add($line)
    }
    return ,$result.ToArray()
}

function ConvertTo-JsString([string]$s) {
    return '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"'
}

function New-HeroFileText($hero, [string[]]$lines, [hashtable]$vsLines, $allHeroes) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("// $($hero.Name) ($($hero.Id))")
    [void]$sb.AppendLine("// Generated by tools/Import-SheetLines.ps1 - edit the Google Sheet and re-import rather than editing here.")
    [void]$sb.AppendLine('$.SmackChatHeroes.register({')
    [void]$sb.AppendLine("    id: '$($hero.Id)',")
    [void]$sb.AppendLine("    name: '$($hero.Name)',")
    [void]$sb.AppendLine('    lines: [')
    foreach ($l in $lines) { [void]$sb.AppendLine('        ' + (ConvertTo-JsString $l) + ',') }
    [void]$sb.AppendLine('    ],')
    [void]$sb.AppendLine('    // Lines used instead of `lines` when the victim is that hero.')
    [void]$sb.AppendLine('    // Leave an array empty to fall back to the generic `lines` above.')
    [void]$sb.AppendLine('    vsHero: {')
    foreach ($other in ($allHeroes | Sort-Object Name)) {
        $vs = $vsLines[$other.Id]
        if ($vs -and $vs.Count) {
            [void]$sb.AppendLine("        $($other.Id): [ // $($other.Name)")
            foreach ($l in $vs) { [void]$sb.AppendLine('            ' + (ConvertTo-JsString $l) + ',') }
            [void]$sb.AppendLine('        ],')
        } else {
            [void]$sb.AppendLine(('        {0,-20} // {1}' -f "$($other.Id): [],", $other.Name))
        }
    }
    [void]$sb.AppendLine('    },')
    [void]$sb.AppendLine('});')
    return $sb.ToString().Replace("`r`n", "`n")
}

# ------------------------------------------------------------------ main

$heroFiles = Get-HeroFiles
$heroByKey = @{}
foreach ($h in $heroFiles) { $heroByKey[$h.Key] = $h }
Write-Host "Found $($heroFiles.Count) hero files in $HeroDir"

$downloaded = $null
if ($XlsxPath) {
    if (-not (Test-Path $XlsxPath)) { throw "File not found: $XlsxPath" }
    $source = (Resolve-Path $XlsxPath).Path
} else {
    if (-not $SheetUrl) { $SheetUrl = $DefaultSheetUrl }
    if (-not $SheetUrl) { throw "Pass -SheetUrl <link> (or -XlsxPath <file>), or set `$DefaultSheetUrl at the top of this script." }
    $downloaded = Get-SheetXlsx $SheetUrl
    $source = $downloaded
}

try { $tabs = Read-Workbook $source }
finally { if ($downloaded) { Remove-Item $downloaded -Force -ErrorAction SilentlyContinue } }

$filter = $null
if ($Heroes) {
    # `powershell -File` passes "A,B" as one string, so split on commas ourselves.
    $filter = @($Heroes | ForEach-Object { $_ -split ',' } | Where-Object { $_.Trim() } | ForEach-Object { Get-NameKey $_ })
    $unknown = @($filter | Where-Object { -not $heroByKey.ContainsKey($_) })
    if ($unknown.Count) { throw "-Heroes: no hero file named $($unknown -join ', ')" }
}

$warnings = @()
$summary = @()
$doneKeys = @{}

foreach ($tab in $tabs) {
    $key = Get-NameKey $tab.Name
    if ($filter -and $filter -notcontains $key) { continue }
    $hero = $heroByKey[$key]
    if (-not $hero) { $warnings += "Tab '$($tab.Name)' does not match any hero file - skipped"; continue }
    if ($doneKeys.ContainsKey($key)) { $warnings += "Tab '$($tab.Name)' is a second tab for $($hero.Name) - skipped"; continue }
    $doneKeys[$key] = $true

    $header = $tab.Rows[1]
    if (-not $header) { $header = @{} }
    $columns = @{}   # column index -> lines
    for ($r = 2; $r -le $tab.MaxRow; $r++) {
        $row = $tab.Rows[$r]
        if (-not $row) { continue }
        foreach ($col in $row.Keys) {
            if (-not $columns.ContainsKey($col)) { $columns[$col] = New-Object System.Collections.Generic.List[string] }
            $columns[$col].Add($row[$col])
        }
    }

    $lines = if ($columns.ContainsKey(0)) { Get-UniqueLines $columns[0].ToArray() "$($tab.Name) / generic" ([ref]$warnings) } else { @() }
    if (-not $lines.Count) {
        $warnings += "Tab '$($tab.Name)' has no generic lines in column A - $($hero.Id).js left unchanged"
        continue
    }

    $vsLines = @{}
    $vsCount = 0
    foreach ($col in ($header.Keys | Where-Object { $_ -ne 0 } | Sort-Object)) {
        $headName = $header[$col]
        if (-not (ConvertTo-CleanLine $headName)) { continue }
        $victim = $heroByKey[(Get-NameKey $headName)]
        if (-not $victim) {
            if ($columns.ContainsKey($col) -and ($columns[$col] | Where-Object { ConvertTo-CleanLine $_ })) {
                $warnings += "Tab '$($tab.Name)': column '$headName' does not match any hero - its lines were ignored"
            }
            continue
        }
        if (-not $columns.ContainsKey($col)) { continue }
        $vs = Get-UniqueLines $columns[$col].ToArray() "$($tab.Name) / vs $headName" ([ref]$warnings)
        if ($vs.Count) { $vsLines[$victim.Id] = $vs; $vsCount += $vs.Count }
    }
    foreach ($col in $columns.Keys) {
        if ($col -ne 0 -and -not $header.ContainsKey($col) -and ($columns[$col] | Where-Object { ConvertTo-CleanLine $_ })) {
            $warnings += "Tab '$($tab.Name)': column $($col + 1) has lines but no header - ignored"
        }
    }

    if ($hero.LineCount -ge 10 -and $lines.Count -lt $hero.LineCount / 2) {
        $warnings += "$($hero.Name): generic lines would drop from $($hero.LineCount) to $($lines.Count) - check the '$($tab.Name)' tab is filled in"
    }

    $newText = New-HeroFileText $hero $lines $vsLines $heroFiles
    $oldText = $hero.Text.Replace("`r`n", "`n")
    $changed = $newText -ne $oldText
    $summary += [pscustomobject]@{
        Hero = $hero.Name
        File = Split-Path -Leaf $hero.Path
        Generic = "$($hero.LineCount) -> $($lines.Count)"
        VsLines = $vsCount
        VsHeroes = $vsLines.Count
        Status = if (-not $changed) { 'unchanged' } elseif ($DryRun) { 'would change' } else { 'updated' }
    }
    if ($changed -and -not $DryRun) { [System.IO.File]::WriteAllText($hero.Path, $newText, $Utf8NoBom) }
}

foreach ($h in $heroFiles) {
    if (-not $doneKeys.ContainsKey($h.Key) -and (-not $filter -or $filter -contains $h.Key)) {
        $warnings += "No tab for $($h.Name) - $(Split-Path -Leaf $h.Path) left unchanged"
    }
}

$summary | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
foreach ($w in $warnings) { Write-Warning $w }
$changedCount = @($summary | Where-Object Status -ne 'unchanged').Count
if ($DryRun) { Write-Host "Dry run: $changedCount file(s) would change. Nothing was written." }
else { Write-Host "$changedCount file(s) updated. Review with: git diff -- deadlock-kill-chat/panorama/scripts/heroes" }
