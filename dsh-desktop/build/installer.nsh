; electron-builder NSIS include.
;
; customInit runs in .onInit after $INSTDIR was resolved from the registry
; (initMultiUser) and before the directory page is shown.
; customCheckAppRunning replaces electron-builder's built-in close/retry
; MessageBox loop (issue #4: it dead-ends in a "cannot close the app"
; dialog even when no matching process exists).

!macro customInit
  ; Kill still-running instances first (current + legacy exe names). Windows
  ; file locks otherwise make the old-version uninstall fail with "Failed to
  ; uninstall old application files". /F is force, /T takes child processes
  ; (the dsh web node tree) along.
  nsExec::Exec 'taskkill /F /T /IM "Deepseek Harness EAC.exe"'
  nsExec::Exec 'taskkill /F /T /IM "Deepseek Harness EAC v2.0.exe"'
  nsExec::Exec 'taskkill /F /T /IM "Deepseek Harness EAC v1.0.exe"'
  nsExec::Exec 'taskkill /F /T /IM "DSH Desktop.exe"'

  ; Heal the nested install dir v2.0.x created when upgrading over v1.0:
  ; productName used to carry a version, so the assistant's instFilesPre
  ; "sanitize" step appended the new product folder under the OLD install
  ; root (.../Deepseek Harness EAC v1.0/Deepseek Harness EAC v2.0). The
  ; extra level pushes deep node_modules paths past MAX_PATH, which the
  ; NSIS 7z extractor then silently drops (issue #4 problem 2). If $INSTDIR
  ; ends with a legacy versioned product segment whose parent is itself an
  ; install root (has resources\app), strip that segment.
  ;
  ; The registry MUST be healed too, not just $INSTDIR: the built-in
  ; "uninstall old version" step re-reads InstallLocation/UninstallString
  ; on its own, and the old uninstaller itself re-reads InstallLocation
  ; (overriding the _?= argument). Left pointing at the nested stub they
  ; make the upgrade abort with "Failed to uninstall old application
  ; files ... : 2". Point both keys at the healed root; if no real old
  ; uninstaller survives there, drop the values so the old-version
  ; uninstall step is skipped entirely instead of failing.
  StrLen $1 "$INSTDIR"
  ${If} $1 > 26
    StrCpy $2 $INSTDIR "" -26
    ${If} $2 == "\Deepseek Harness EAC v2.0"
    ${OrIf} $2 == "\Deepseek Harness EAC v1.0"
      StrCpy $3 $INSTDIR -26
      IfFileExists "$3\resources\app" 0 dshHealDone
      StrCpy $INSTDIR $3

      WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation "$INSTDIR"

      StrCpy $4 ""
      ${If} ${FileExists} "$INSTDIR\Uninstall Deepseek Harness EAC.exe"
        StrCpy $4 "$INSTDIR\Uninstall Deepseek Harness EAC.exe"
      ${ElseIf} ${FileExists} "$INSTDIR\Uninstall Deepseek Harness EAC v2.0.exe"
        StrCpy $4 "$INSTDIR\Uninstall Deepseek Harness EAC v2.0.exe"
      ${ElseIf} ${FileExists} "$INSTDIR\Uninstall Deepseek Harness EAC v1.0.exe"
        StrCpy $4 "$INSTDIR\Uninstall Deepseek Harness EAC v1.0.exe"
      ${EndIf}

      ${If} $4 != ""
        WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$4" /currentuser'
        WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString '"$4" /currentuser /S'
      ${Else}
        DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
        DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString
      ${EndIf}

      dshHealDone:
    ${EndIf}
  ${EndIf}
!macroend

; Dialog-free replacement for the built-in CHECK_APP_RUNNING: wait (up to
; ~10s) until no current/legacy app exe is alive, then continue regardless.
; Force-kill was already attempted in customInit; if something survives
; (elevated instance), proceeding still lets the silent path work and never
; traps the user in a retry MessageBox loop.
!macro customCheckAppRunning
  StrCpy $1 0
  dshWaitLoop:
    IntOp $1 $1 + 1
    ${If} $1 > 20
      DetailPrint "App process did not exit; continuing anyway"
      Goto dshWaitDone
    ${EndIf}

    StrCpy $2 0

    nsExec::Exec 'cmd /C tasklist /FI "IMAGENAME eq Deepseek Harness EAC.exe" /NH | find /I "Deepseek Harness EAC.exe"'
    Pop $0
    ${If} $0 == 0
      StrCpy $2 1
    ${EndIf}

    nsExec::Exec 'cmd /C tasklist /FI "IMAGENAME eq Deepseek Harness EAC v2.0.exe" /NH | find /I "Deepseek Harness EAC v2.0.exe"'
    Pop $0
    ${If} $0 == 0
      StrCpy $2 1
    ${EndIf}

    nsExec::Exec 'cmd /C tasklist /FI "IMAGENAME eq Deepseek Harness EAC v1.0.exe" /NH | find /I "Deepseek Harness EAC v1.0.exe"'
    Pop $0
    ${If} $0 == 0
      StrCpy $2 1
    ${EndIf}

    ${If} $2 == 1
      Sleep 500
      Goto dshWaitLoop
    ${EndIf}
  dshWaitDone:
!macroend
