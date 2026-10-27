@echo off
setlocal DisableDelayedExpansion
rem F2-H0 STATIC BUILD ONLY. NEVER RUN THE EXE.
rem Pin the installed, registered JEABPC VS BuildTools/MSVC/Windows SDK.
if not exist "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" exit /b 81
if not exist "C:\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe" exit /b 82
call "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" 10.0.26100.0 >nul
if errorlevel 1 exit /b 83
set "F2H0_SOURCE=%~dp0one-shot-launch-host.cpp"
set "F2H0_OUT=%~dp0..\..\..\..\.serena\runner-f2-h0-build"
"C:\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe" /nologo /std:c++17 /W4 /WX /EHsc /utf-8 /DUNICODE /D_UNICODE /D_WIN32_WINNT=0x0A00 /O2 /GS /sdl /MT "%F2H0_SOURCE%" "/Fo:%F2H0_OUT%\one-shot-launch-host.obj" "/Fe:%F2H0_OUT%\sud-d-f2-h0.exe" /link /SUBSYSTEM:CONSOLE /MACHINE:X64 /DYNAMICBASE /NXCOMPAT /GUARD:CF userenv.lib advapi32.lib kernel32.lib
exit /b %errorlevel%
