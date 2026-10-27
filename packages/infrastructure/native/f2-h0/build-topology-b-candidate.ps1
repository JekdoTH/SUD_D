# F2 H1 TOPOLOGY B NON-EXECUTING COMPILE CANDIDATE. Compile/link only. NEVER invoke helper.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\..')).Path
$out=Join-Path $repo '.serena\runner-f2-h1-topology-b-candidate-20261008'
if(Test-Path -LiteralPath $out){throw 'TOPOLOGY_B_OUTPUT_ALREADY_EXISTS_NO_OVERWRITE'}
$legacy=Join-Path $repo '.serena\runner-f2-h0-build\sud-d-f2-h0.exe'
if(-not (Test-Path -LiteralPath $legacy -PathType Leaf)){throw 'H0_HISTORICAL_MISSING'}
$legacyFile=[IO.File]::OpenRead($legacy)
try {$sha=[Security.Cryptography.SHA256]::Create()
 try {$legacyHash=[BitConverter]::ToString($sha.ComputeHash($legacyFile)).Replace('-','').ToLowerInvariant()}
 finally {$sha.Dispose()}} finally{$legacyFile.Dispose()}
if($legacyHash -ne '5c90be00399f8867db6a6db7373e22faefdcdeeef2dcd15650602fa5c748d01b'){
 throw 'H0_HISTORICAL_HASH_CHANGED'
}
$previous=Join-Path $repo '.serena\runner-f2-h1-candidate-20261008\sud-d-f2-h0.exe'
if(-not (Test-Path -LiteralPath $previous -PathType Leaf)){throw 'H1_HISTORICAL_MISSING'}
$stream=[IO.File]::OpenRead($previous)
try {$digest=[Security.Cryptography.SHA256]::Create()
 try {$prevHash=[BitConverter]::ToString($digest.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
 finally {$digest.Dispose()}} finally {$stream.Dispose()}
if($prevHash -ne '34e1034a27441d83dfaf11dff611cd98ed35743e9b26d5b32e964b8972046122'){
 throw 'H1_HISTORICAL_HASH_CHANGED'
}
foreach($f in @('one-shot-launch-host.cpp','build-topology-b-candidate.cmd')){
 if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $f) -PathType Leaf)){
   throw ('H1_SOURCE_MISSING_'+$f)
 }
}
foreach($f in @('C:\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe',
'C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat',
'C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um\windows.h',
'C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64\advapi32.lib')){
 if(-not (Test-Path -LiteralPath $f -PathType Leaf)){throw 'H1_TOOLCHAIN_MISSING'}
}
New-Item -ItemType Directory -Path $out -ErrorAction Stop | Out-Null
Push-Location -LiteralPath $out
try{
 & "$env:SystemRoot\System32\cmd.exe" /d /c (Join-Path $PSScriptRoot 'build-topology-b-candidate.cmd')
 $code=$LASTEXITCODE
 Write-Output ('TOPOLOGY_B_CODE_ONLY_BUILD_EXIT='+$code)
 if($code -ne 0){throw 'H1_COMPILE_LINK_FAILED_STOP_NO_REUSE'}
 $files=@(Get-ChildItem -LiteralPath $out -Force)
 if($files.Count -ne 2 -or ($files | Where-Object {$_.PSIsContainer -or $_.Name -notin @('sud-d-f2-h0.exe','one-shot-launch-host.obj')})){
   throw 'H1_UNEXPECTED_OUTPUT_INVENTORY'
 }
 foreach($file in $files){
  $stream=[IO.File]::OpenRead($file.FullName)
  try{$sha=[Security.Cryptography.SHA256]::Create()
   try{$digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
   finally{$sha.Dispose()}} finally{$stream.Dispose()}
  Write-Output ('TOPOLOGY_B_CODE_ONLY_ARTIFACT|'+$file.FullName+'|'+$file.Length+'|'+$digest)
 }
}finally{Pop-Location}
