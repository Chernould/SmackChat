# Run from the SmackChat repository with Steam open.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$CsdkRoot,
    [Parameter(Mandatory = $true)][string]$ResourceCompiler,
    [Parameter(Mandatory = $true)][string]$Source2ViewerCli
)

$ErrorActionPreference = 'Stop'
$CsdkRoot = (Resolve-Path -LiteralPath $CsdkRoot).Path
$ResourceCompiler = (Resolve-Path -LiteralPath $ResourceCompiler).Path
$Source2ViewerCli = (Resolve-Path -LiteralPath $Source2ViewerCli).Path

$source = Join-Path $PSScriptRoot '..\deadlock-kill-chat\panorama'
if (-not (Test-Path -LiteralPath (Join-Path $source 'layout\hud_damage_impact.xml') -PathType Leaf)) {
    throw 'Put build.ps1 at the repository root, next to deadlock-kill-chat.'
}

# A fresh staging addon keeps stale compiler outputs out of the VPK.
$addon = 'build_smackchat_' + [guid]::NewGuid().ToString('N')
$content = Join-Path $CsdkRoot "content\citadel_addons\$addon"
$game = Join-Path $CsdkRoot "game\citadel_addons\$addon"
$dist = Join-Path $PSScriptRoot '..\dist'
$pending = Join-Path $dist "$addon.vpk"
$output = Join-Path $dist 'SmackChat.vpk'

try {
    New-Item -ItemType Directory -Path $content -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $content -Recurse
    $staged = Join-Path $content 'panorama'

    # Compile scripts first so the layout can reference their compiled resources.
    $scripts = @(Get-ChildItem -LiteralPath (Join-Path $staged 'scripts') -Filter '*.js' -Recurse -File)
    if ($scripts.Count -eq 0) { throw 'No Panorama scripts found.' }
    $layout = Get-Item -LiteralPath (Join-Path $staged 'layout\hud_damage_impact.xml')
    foreach ($file in ($scripts + @($layout))) {
        Write-Host "Compiling $($file.Name)"
        & $ResourceCompiler -i $file.FullName -nop4
        if ($LASTEXITCODE -ne 0) { throw "Compiler failed for $($file.FullName)." }
        $extension = if ($file.Extension -eq '.js') { '.vjs_c' } else { '.vxml_c' }
        $relative = $file.FullName.Substring($content.Length + 1)
        $compiled = Join-Path $game ([IO.Path]::ChangeExtension($relative, $extension))
        if (-not (Test-Path -LiteralPath $compiled -PathType Leaf)) {
            throw "Compiler did not produce $compiled."
        }
    }

    # Check the exact compiled paths referenced by the layout before packing.
    $xml = Get-Content -LiteralPath $layout.FullName -Raw
    foreach ($include in [regex]::Matches($xml, 's2r://(panorama/scripts/[^"]+\.vjs_c)')) {
        $compiled = Join-Path $game $include.Groups[1].Value
        if (-not (Test-Path -LiteralPath $compiled -PathType Leaf)) {
            throw "HUD layout references a missing script: $($include.Groups[1].Value)"
        }
    }

    New-Item -ItemType Directory -Path $dist -Force | Out-Null
    & $Source2ViewerCli -i $game --vpk_create $pending
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pending -PathType Leaf)) {
        throw 'Source 2 Viewer CLI did not create the VPK.'
    }
    Move-Item -LiteralPath $pending -Destination $output -Force
    Write-Host "Built $output"
}
finally {
    foreach ($path in @($content, $game, $pending)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}
