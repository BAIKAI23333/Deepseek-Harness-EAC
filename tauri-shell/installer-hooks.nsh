; Deepseek Harness EAC — Tauri NSIS 安装钩子。
; 职责：
;   1. Electron → Tauri 无缝接管（v5.0 切换）：检测旧 Electron 壳卸载键，
;      静默卸载旧版再安装 —— 同安装目录、同快捷方式名，用户数据
;      （%APPDATA%\Deepseek Harness EAC 与 ~/.dsh）不受影响。
;      R6 实测修正：electron-builder NSIS 的卸载键名 = **productName**
;      （"Deepseek Harness EAC"），不是应用 identifier（com.deepseek.dsh.desktop）。
;      两个候选键都探测，存在即处理。
;   2. 防御注册表脏值：
;      a) InstallLocation 内嵌引号会炸批处理解析 —— 读取后剥引号再使用。
;      b) UninstallString 指向已删除的卸载器（本机实测脏键：指向不存在的
;         D:\Deepseek Harness EACeac\uninstall.exe）—— 文件不存在时跳过
;         ExecWait，只清注册表键，避免静默安装被无效路径卡死。

!macro DSH_TakeoverOldShell KEYNAME
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}" "UninstallString"
  ${If} $0 != ""
    ; UninstallString 常带整串引号：剥掉再判存。
    StrCpy $3 $0
    StrCpy $4 $3 1
    ${If} $4 == '"'
      StrCpy $3 $3 "" 1
      StrCpy $3 $3 -1
    ${EndIf}
    ; InstallLocation 剥引号防御（_?= 需要目录路径）。
    ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}" "InstallLocation"
    ${If} $1 != ""
      StrCpy $2 $1 1
      ${If} $2 == '"'
        StrCpy $1 $1 "" 1
        StrCpy $1 $1 -1
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$3"
      DetailPrint "DSH EAC: 检测到旧壳（${KEYNAME}），静默卸载以接管安装（数据不受影响）"
      ; _?= 需要带引号的完整路径；旧卸载器为 NSIS 生成，支持 /S 静默。
      ExecWait '"$0" /S _?=$1' $3
      DetailPrint "DSH EAC: 旧壳卸载退出码 $3"
    ${Else}
      DetailPrint "DSH EAC: 旧壳卸载键为脏值（卸载器缺失），仅清理注册表"
    ${EndIf}
    ; 卸载器自删后键可能残留，兜底清理。
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro DSH_TakeoverOldShell "Deepseek Harness EAC"
  !insertmacro DSH_TakeoverOldShell "com.deepseek.dsh.desktop"
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend
