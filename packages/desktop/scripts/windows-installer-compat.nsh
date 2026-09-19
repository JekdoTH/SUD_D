!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  !insertmacro _CHECK_APP_RUNNING

  ${If} ${FileExists} "$INSTDIR\resources\mcp-gateway\*.*"
    nsExec::Exec `"$SYSDIR\cmd.exe" /d /c rd /s /q "\\?\$INSTDIR\resources\mcp-gateway"`
    Pop $R9
  ${EndIf}
!macroend
