; Deepseek Harness EAC — Tauri NSIS 安装钩子。
; 职责：
;   1. Electron → Tauri 无缝接管（v5.0 切换）：检测旧 Electron 壳（HKCU 卸载键
;      com.deepseek.dsh.desktop），静默卸载旧版再安装 —— 同安装目录、同快捷方式
;      名，用户数据（%APPDATA%\Deepseek Harness EAC 与 ~/.dsh）不受影响。
;   2. 防御注册表 InstallLocation 脏值（内嵌引号会炸批处理解析，commit 8385aef
;      的教训）：读取后一律剥引号再使用。

!macro NSIS_HOOK_PREINSTALL
  ; —— 旧 Electron 壳接管 ——
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.deepseek.dsh.desktop" "UninstallString"
  ${If} $0 != ""
    ; InstallLocation 剥引号防御
    ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.deepseek.dsh.desktop" "InstallLocation"
    ${If} $1 != ""
      StrCpy $2 $1 1
      ${If} $2 == '"'
        StrCpy $1 $1 "" 1
        StrCpy $1 $1 -1
      ${EndIf}
    ${EndIf}
    DetailPrint "DSH EAC: 检测到旧 Electron 壳，静默卸载以接管安装（数据不受影响）"
    ; _?= 需要带引号的完整路径；旧卸载器为 NSIS 生成，支持 /S 静默。
    ExecWait '"$0" /S _?=$1' $3
    DetailPrint "DSH EAC: 旧壳卸载退出码 $3"
    ; 卸载器自删后键可能残留，兜底清理。
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.deepseek.dsh.desktop"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend
