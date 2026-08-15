; electron-builder NSIS include. customInit runs before the old version is
; uninstalled and files are laid down. Kill a still-running app instance
; (current and legacy exe names) first: Windows file locks otherwise make the
; old-version uninstall fail with "Failed to uninstall old application files".
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "Deepseek Harness EAC v1.0.exe"'
  nsExec::Exec 'taskkill /F /T /IM "DSH Desktop.exe"'
  Sleep 1200
!macroend
