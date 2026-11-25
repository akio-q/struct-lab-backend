[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$distRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'dist'))
$lambdaRoot = [IO.Path]::GetFullPath((Join-Path $distRoot 'lambda'))

$repoPrefix = $repoRoot.TrimEnd([char[]]@('\', '/')) +
  [IO.Path]::DirectorySeparatorChar
if (-not $lambdaRoot.StartsWith(
  $repoPrefix,
  [StringComparison]::OrdinalIgnoreCase
)) {
  throw "Refusing to write outside the repository: $lambdaRoot"
}

if (
  (Split-Path -Leaf $lambdaRoot) -ne 'lambda' -or
  (Split-Path -Leaf $distRoot) -ne 'dist'
) {
  throw "Refusing to clean an unexpected path: $lambdaRoot"
}

if (Test-Path -LiteralPath $distRoot) {
  $distItem = Get-Item -LiteralPath $distRoot -Force
  if (-not $distItem.PSIsContainer) {
    throw "Refusing to use a non-directory dist path: $distRoot"
  }
  if (($distItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to use a reparse-point dist path: $distRoot"
  }
}

function Assert-NoReparsePoints {
  param([Parameter(Mandatory = $true)][string]$Path)

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to remove a reparse point: $Path"
  }

  if ($item.PSIsContainer) {
    foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) {
      Assert-NoReparsePoints -Path $child.FullName
    }
  }
}

$nodeCommand = Get-Command node -ErrorAction Stop
$nodeVersion = (& $nodeCommand.Source --version).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Node.js version check failed with exit code $LASTEXITCODE."
}
if ($nodeVersion -notmatch '^v?(\d+)\.') {
  throw "Could not determine the Node.js major version from '$nodeVersion'."
}

$nodeMajor = [int]$Matches[1]
if ($nodeMajor -lt 22) {
  throw "Node.js 22 or newer is required; found $nodeVersion."
}
if ($nodeMajor -ne 22) {
  Write-Warning (
    "Local Node.js is $nodeVersion; packages target node22. " +
    'Local execution does not prove Node.js 22 runtime compatibility.'
  )
}

$esbuildPath = Join-Path $repoRoot 'node_modules\.bin\esbuild.cmd'
if (-not (Test-Path -LiteralPath $esbuildPath -PathType Leaf)) {
  throw "esbuild was not found at $esbuildPath. Run pnpm install first."
}

$esbuildVersion = (& $esbuildPath --version).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "esbuild version check failed with exit code $LASTEXITCODE."
}

if (Test-Path -LiteralPath $lambdaRoot) {
  $lambdaItem = Get-Item -LiteralPath $lambdaRoot -Force
  if (-not $lambdaItem.PSIsContainer) {
    throw "Refusing to remove a non-directory Lambda output path: $lambdaRoot"
  }

  Assert-NoReparsePoints -Path $lambdaRoot
  Remove-Item -LiteralPath $lambdaRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $lambdaRoot -Force | Out-Null

$handlers = @(
  [pscustomobject]@{ Name = 'health'; Entry = 'src/handlers/health.ts' },
  [pscustomobject]@{ Name = 'create-student'; Entry = 'src/handlers/create-student.ts' },
  [pscustomobject]@{ Name = 'list-students'; Entry = 'src/handlers/list-students.ts' }
)

Write-Host "Using Node.js $nodeVersion and esbuild $esbuildVersion"

$archives = @()
foreach ($handler in $handlers) {
  $entryPath = Join-Path $repoRoot $handler.Entry
  if (-not (Test-Path -LiteralPath $entryPath -PathType Leaf)) {
    throw "Entry point not found: $entryPath"
  }

  $outputDirectory = Join-Path $lambdaRoot $handler.Name
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

  $outputFile = Join-Path $outputDirectory 'index.js'
  & $esbuildPath $entryPath `
    --bundle `
    --platform=node `
    --target=node22 `
    --format=cjs `
    --minify `
    "--outfile=$outputFile"

  if ($LASTEXITCODE -ne 0) {
    throw "esbuild failed for $($handler.Name) with exit code $LASTEXITCODE."
  }

  if (-not (Test-Path -LiteralPath $outputFile -PathType Leaf)) {
    throw "Expected bundle was not generated: $outputFile"
  }

  $bundle = Get-Item -LiteralPath $outputFile
  if ($bundle.Length -le 0) {
    throw "Generated bundle is empty: $outputFile"
  }

  $outputFiles = @(Get-ChildItem -LiteralPath $outputDirectory -File -Force)
  $outputDirectories = @(Get-ChildItem -LiteralPath $outputDirectory -Directory -Force)
  if (
    $outputFiles.Count -ne 1 -or
    $outputDirectories.Count -ne 0 -or
    $outputFiles[0].Name -ne 'index.js'
  ) {
    throw "Unexpected files were generated in $outputDirectory."
  }

  $zipPath = Join-Path $lambdaRoot "$($handler.Name).zip"
  $zipArchive = [System.IO.Compression.ZipFile]::Open(
    $zipPath,
    [System.IO.Compression.ZipArchiveMode]::Create
  )
  try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zipArchive,
      $outputFile,
      'index.js',
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
  finally {
    $zipArchive.Dispose()
  }

  $verificationArchive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entries = @($verificationArchive.Entries)
    if ($entries.Count -ne 1) {
      throw "Archive $zipPath must contain exactly one entry."
    }

    $entry = $entries[0]
    if (
      $entry.FullName -ne 'index.js' -or
      $entry.Name -ne 'index.js' -or
      $entry.Length -le 0
    ) {
      throw "Archive $zipPath must contain only a non-empty root index.js."
    }
  }
  finally {
    $verificationArchive.Dispose()
  }

  $zip = Get-Item -LiteralPath $zipPath
  $bundleRelativePath = $bundle.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
  $zipRelativePath = $zip.FullName.Substring($repoRoot.Length).TrimStart('\', '/')

  Write-Host ("Bundle:  {0} ({1} bytes)" -f $bundleRelativePath, $bundle.Length)
  Write-Host ("Archive: {0} ({1} bytes)" -f $zipRelativePath, $zip.Length)

  $archives += [pscustomobject]@{
    Path = $zipRelativePath
    Length = $zip.Length
  }
}

Write-Host ''
Write-Host 'Packaging complete. Deployment archives:'
foreach ($archive in $archives) {
  Write-Host (" - {0} ({1} bytes)" -f $archive.Path, $archive.Length)
}
