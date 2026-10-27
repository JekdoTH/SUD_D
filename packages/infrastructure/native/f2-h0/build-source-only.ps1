# F2-H0 fixed reviewed local build. NO launcher execution.
# Exact registered VS BuildTools/SDK; only build subprocess initializes vcvars.
# Result is an unproven, unrunnable-for-H1 code artifact pending Steward review.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path
$out = Join-Path $repo '.serena\runner-f2-h0-build'
$source = Join-Path $PSScriptRoot 'one-shot-launch-host.cpp'
$buildCmd = Join-Path $PSScriptRoot 'build-fixed-msvc.cmd'
$compiler = 'C:\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe'
$vcvars = 'C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
$sdkHeader = 'C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um\windows.h'
$sdkLib = 'C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64\userenv.lib'
foreach ($p in @($source, $buildCmd, $compiler, $vcvars, $sdkHeader, $sdkLib)) {
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
    throw ('F2_H0_PINNED_TOOLCHAIN_OR_SOURCE_MISSING: ' + $p)
  }
}
if (Test-Path -LiteralPath $out) {
  throw 'F2_H0_OUTPUT_ROOT_ALREADY_EXISTS_REVIEW_BEFORE_BUILD'
}
$serenaRoot = Join-Path $repo '.serena'
if (-not (Test-Path -LiteralPath $serenaRoot -PathType Container)) {
  throw 'F2_H0_OWNED_IGNORED_PARENT_MISSING'
}
New-Item -ItemType Directory -Path $out -ErrorAction Stop | Out-Null
Push-Location -LiteralPath $out
try {
  # cmd.exe runs solely the pinned local build command, which calls vcvars64
  # in its child environment (NO machine/user PATH/SDK mutations).
  & "$env:SystemRoot\System32\cmd.exe" '/d' '/c' $buildCmd
  $exit = $LASTEXITCODE
  Write-Output ("F2_H0_BUILD_EXIT|" + $exit)
  if ($exit -ne 0) { throw 'F2_H0_BUILD_FAILED_DO_NOT_REUSE_EXISTING_OUTPUT' }
  $bin = Join-Path $out 'sud-d-f2-h0.exe'
  if (-not (Test-Path -LiteralPath $bin -PathType Leaf)) {
    throw 'F2_H0_BINARY_MISSING'
  }
  foreach ($item in (Get-ChildItem -LiteralPath $out -Force)) {
    if ($item.PSIsContainer -or $item.Name -notin @('sud-d-f2-h0.exe', 'one-shot-launch-host.obj')) {
      throw ('F2_H0_UNEXPECTED_OUTPUT_REVIEW: ' + $item.Name)
    }
  }
  $stream = [IO.File]::OpenRead($bin)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
      $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
      Write-Output ("F2_H0_COMPILED_ONLY_NOT_EXECUTED|" + $bin + "|" + $digest)
    } finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
} finally {
  Pop-Location
}
