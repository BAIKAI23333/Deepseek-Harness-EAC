; Deepseek Harness EAC — Tauri NSIS 安装钩子。
; 职责：
;   1. Electron → Tauri 无缝接管（v5.0 切换）+ Tauri 覆盖升级清理：
;      检测旧壳卸载键（HKCU/HKLM 双 hive），静默卸载旧版再安装 ——
;      同安装目录、同快捷方式名，用户数据（%APPDATA%\Deepseek Harness EAC
;      与 ~/.dsh）不受影响。
;      R6 实测修正：electron-builder NSIS 的卸载键名 = **productName**
;      （"Deepseek Harness EAC"），不是应用 identifier（com.deepseek.dsh.desktop）。
;      三个候选键名都探测（productName、Electron identifier、
;      Tauri identifier），并同时查 HKCU 与 HKLM —— 旧版若曾 perMachine
;      安装（HKLM hive），只查 HKCU 会漏掉 → 已安装列表出现两个版本
;      （issue #224）。
;   2. 防御注册表脏值：
;      a) InstallLocation 内嵌引号会炸批处理解析 —— 读取后剥引号再使用。
;      b) UninstallString 指向已删除的卸载器（本机实测脏键：指向不存在的
;         D:\Deepseek Harness EACeac\uninstall.exe）—— 文件不存在时跳过
;         ExecWait，只清注册表键，避免静默安装被无效路径卡死。
;      c) R6 复核实锤（mock 卸载器 + 最小安装器 A/B 对照）：ExecWait 必须用
;         剥过引号的 $3 作程序路径 —— 原实现内嵌原始 $0，真实键值带整串引号时
;         展开成 ""path" 导致 spawn 静默失败；_?= 必须裸写 —— NSIS 卸载器原样
;         取命令行剩余串当目录，带引号反而失效（实测退出码 2、零删除），
;         含空格目录无需引号；尾反斜杠先剥防边界歧义。
;      d) UninstallString 仅整串被一对引号包裹才剥对，`"path" args` 形态保持
;         原值走脏值分支（防剥坏）；e) InstallLocation 为空时跳过 ExecWait
;         （_?= 空目录未定义），只清注册表键。

; 注意：currentUser 安装器对 HKLM 通常只有读权限，删除 HKLM 键会静默失败
; （NSIS DeleteRegKey 无错误返回）。该路径为 best-effort：尽力卸载旧文件并
; 提示，避免「两个版本并存 + 旧条目打开报错」；HKCU 场景才是全覆盖清理。

!macro DSH_TakeoverOldShell HIVE KEYNAME
  ReadRegStr $0 ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}" "UninstallString"
  ${If} $0 != ""
    ; UninstallString 剥引号（窄修）：仅当整串恰被一对引号包裹（引号总数为 2
    ; 且首尾各一）才整体剥对 —— `"path" args` 形态若沿用旧的「删首字符 + StrCpy
    ; -1 删尾字符」会剥成 `path" arg` 的脏值；此时保持 $0 原值，交给下方
    ; FileExists 脏值分支兜底。NSIS 无内建子串搜索，引号计数用 $R0（工作副本，
    ; 逐字符右移）/ $R1（计数器）实现。
    StrCpy $3 $0
    StrCpy $R0 $0
    StrCpy $R1 0
    ${Do}
      StrCpy $4 $R0 1
      ${If} $4 == '"'
        IntOp $R1 $R1 + 1
      ${EndIf}
      StrCpy $R0 $R0 "" 1
    ${LoopUntil} $R0 == ""
    ${If} $R1 == 2
      StrCpy $4 $3 1
      StrCpy $R0 $3 1 -1
      ${If} $4 == '"'
      ${AndIf} $R0 == '"'
        StrCpy $3 $3 "" 1
        StrCpy $3 $3 -1
      ${EndIf}
    ${EndIf}
    ; InstallLocation 剥引号防御（_?= 需要目录路径）。
    ReadRegStr $1 ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}" "InstallLocation"
    ${If} $1 != ""
      StrCpy $2 $1 1
      ${If} $2 == '"'
        StrCpy $1 $1 "" 1
        StrCpy $1 $1 -1
      ${EndIf}
      ; 尾反斜杠在带引号命令行里会转义收尾引号，先剥掉（盘符根除外）。
      StrLen $2 $1
      ${If} $2 > 3
        StrCpy $2 $1 1 -1
        ${If} $2 == '\'
          StrCpy $1 $1 -1
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$3"
      DetailPrint "DSH EAC: 检测到旧壳（${KEYNAME} @ ${HIVE}），静默卸载以接管安装（数据不受影响）"
      ; 程序路径必须用剥过引号的 $3：内嵌原始 $0 展开成 ""path" 会导致
      ; spawn 失败（R6 实测复现）。_?= 必须裸写不加引号：NSIS 卸载器原样
      ; 取命令行剩余串当安装目录，带引号会内嵌字面 " 而静默失效（实测退出码 2、
      ; 零删除）；也正因原样取剩余，含空格目录无需引号（官方文档示例 _?=$INSTDIR）。
      ; $1（InstallLocation）为空时 _?= 空目录行为未定义 —— 跳过卸载器调用，
      ; 只清注册表键（下方 DeleteRegKey 兜底）。
      ${If} $1 == ""
        DetailPrint "DSH EAC: 旧壳 InstallLocation 为空，跳过卸载器调用，仅清理注册表"
      ${Else}
        ExecWait '"$3" /S _?=$1' $R0
        DetailPrint "DSH EAC: 旧壳卸载退出码 $R0"
      ${EndIf}
    ${Else}
      DetailPrint "DSH EAC: 旧壳卸载键为脏值（卸载器缺失），仅清理注册表"
    ${EndIf}
    ; 卸载器自删后键可能残留，兜底清理。
    DeleteRegKey ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}"
  ${EndIf}
!macroend

;   3. 升级/接管前结束运行中的应用进程树（用户实测反馈：安装时报
;      「不能打开要写入的文件: ...\dsh-pet\assets\thumb\东张西望.webm」——
;      旧壳运行中（宠物动画等资源被占用）时，卸载与解压都会撞锁）。
;      taskkill /T 按镜像名整树终结（node sidecar / dsh web 均为子孙进程，
;      一并结束释放句柄）；进程不存在时退出码非零，属预期，不视为失败。

!macro DSH_KillAppExe EXENAME
  DetailPrint "DSH EAC: 结束运行中的 ${EXENAME} 进程树（升级需独占安装文件）"
  nsExec::ExecToLog 'taskkill /F /T /IM "${EXENAME}"'
  Pop $R1
!macroend

;   4. 安装形态选择（v5.4 单发行版双形态）：同一个安装包，安装时选
;      「完整版 / 精简版」。PREINSTALL 弹窗询问（静默安装 /S 默认完整版），
;      POSTINSTALL 把选择写入 $INSTDIR\dsh-desktop\profile.txt；companion-sync
;      启动时读取，精简版仅改变外围插件的「新行默认启停」（用户选择优先，
;      随时可在设置里启用全部）。文件缺失/脏值 = 完整版，永不阻塞启动。
Var DshProfileChoice

!macro DSH_AskInstallProfile
  StrCpy $DshProfileChoice "full"
  ; 本文件禁用任何管道符（installer-nsh-pipe 守护测试）：MessageBox 组合标志
  ; 需要管道符，故只用单一 MB_YESNO，不叠加图标位。
  MessageBox MB_YESNO \
    "请选择要安装的版本：$\n$\n\
    【是】完整版 —— 全部内置插件（多智能体 / 手机桥 / 桌宠等）$\n\
    【否】精简版 —— 精选插件，界面更简洁（后续可在「设置 → 插件 → 管理」$\n\
    一键启用全部功能，无需重装）$\n$\n\
    升级安装会重新询问，用户数据不受影响。" \
    /SD IDYES IDYES dsh_profile_full IDNO dsh_profile_lite
  dsh_profile_full:
    StrCpy $DshProfileChoice "full"
    Goto dsh_profile_done
  dsh_profile_lite:
    StrCpy $DshProfileChoice "lite"
  dsh_profile_done:
!macroend

!macro DSH_WriteProfileMarker
  ClearErrors
  FileOpen $R9 "$INSTDIR\dsh-desktop\profile.txt" w
  ${If} ${Errors}
    DetailPrint "DSH EAC: 写入安装形态标记失败（按默认完整版处理）"
  ${Else}
    FileWrite $R9 "$DshProfileChoice"
    FileClose $R9
    DetailPrint "DSH EAC: 安装形态 = $DshProfileChoice"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; 官方安装位置屏契约：写入/接管之前先做安装位置 preflight（fail-closed）。
  !insertmacro DSH_InstallLocationGuard
  ; 先杀进程再接管：旧壳运行中时其卸载器删不动被占用文件，宠物插件
  ; webm 等资源锁不释放则解压同样报「不能打开要写入的文件」。
  !insertmacro DSH_KillAppExe "dsh-eac-shell.exe"
  !insertmacro DSH_KillAppExe "Deepseek Harness EAC.exe"
  ; 句柄异步释放，给文件系统一点缓冲（NSIS 原生 Sleep，不产生网络行为）。
  Sleep 2000
  ; 三个候选键名 × HKCU/HKLM 双 hive：覆盖
  ;   - Electron 时代（productName 键 / com.deepseek.dsh.desktop 键，含
  ;     perMachine 安装残留在 HKLM 的情况）；
  ;   - Tauri 自身旧版（productName 键与 com.deepseek.dsh.desktop.tauri 键）。
  ; HKLM 只读/删除失败走 best-effort（currentUser 安装器无提权），
  ; 主路径（per-user 安装）在 HKCU 全覆盖。
  !insertmacro DSH_TakeoverOldShell HKCU "Deepseek Harness EAC"
  !insertmacro DSH_TakeoverOldShell HKCU "com.deepseek.dsh.desktop"
  !insertmacro DSH_TakeoverOldShell HKCU "com.deepseek.dsh.desktop.tauri"
  !insertmacro DSH_TakeoverOldShell HKLM "Deepseek Harness EAC"
  !insertmacro DSH_TakeoverOldShell HKLM "com.deepseek.dsh.desktop"
  !insertmacro DSH_TakeoverOldShell HKLM "com.deepseek.dsh.desktop.tauri"
  ; 不在安装/升级阶段删除 ~/.dsh 下的任何用户数据。退役 dsh-stt 的插件行与
  ; profile 包副本仍由应用内的精确迁移处理；模型缓存可能是 CLI 或其他产品
  ; 共用资产，只能由用户明确确认后单独清理。
  ; 安装形态：解压前询问（精简版/完整版），选择暂存到 $DshProfileChoice。
  !insertmacro DSH_AskInstallProfile
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 资源已解压到 $INSTDIR\dsh-desktop\，覆盖随包默认的 profile.txt（full）。
  !insertmacro DSH_WriteProfileMarker
!macroend
; ===========================================================================
; 官方安装器 UI 复用（s7，2026-09-26）
; 来源：MIT 仓库 deepseek-ai/deepseek-harness
;       @ 477b4f420553e8a52c2fbccc464d7561b239c443（dsh-v0.1.7-rc.2）
;       apps/desktop/installer/{pages.nsh,path.nsh,theme.nsh,strings.nsh,lifecycle.nsh}
;
; EAC 是 Tauri：官方 Electron 安装器是 600x600 无边框自绘窗口（window-frame.cpp
; 加 GDI+ 圆角与控件重绘再加 nsDialogs 自定义页），无法整体搬进 Tauri 的 NSIS
; 模板。这里只移植「安装位置屏 + 收尾页 + 主题开关」的视觉与交互契约：
;   a) 安装位置屏：DirText 顶部说明与目标目录标签，离开即校验
;      （官方 InstallerWelcomeLeave 的 Abort 语义 → MUI_DIRECTORYPAGE_VERIFYONLEAVE）；
;   b) 路径规则：官方 path.nsh 的 InstallerValidatePath 与 InstallerPreflight
;      （本地固定盘、4..180 字符、无重解析点、非系统目录、非保留设备名、
;       空目录或已注册安装目录、可写、磁盘余量）；
;   c) 主题开关：官方 /THEME=auto、/THEME=light、/THEME=dark（auto 读
;      HKCU 的 AppsUseLightTheme），非法取值直接报错退出；
;   d) 几何与配色常量：官方 theme.nsh 的 96-DPI 逻辑像素与 GDI+ ARGB 值逐值保留，
;      作为窗口与 DPI 契约（MulDiv(逻辑像素, dpi, 96)）；
;   e) 收尾页：官方「立即启动」勾选（官方默认勾选）与 EAC 收尾文案。
;
; 边界裁定（如实标注，不伪造能力）：
;   - MUI2 原生向导页保持原生排版与原生配色：官方自绘窗口的品牌位图区
;     （y=174、高 196）、圆角按钮与状态行无法在原生控件上重绘；官方
;     installer/assets 下的品牌位图一律不引入，品牌位改由 EAC 文本字标承担。
;   - 官方 InstallerFinishLeave 的「启动失败」提示挂在其 finish 页函数上，
;     Tauri 模板的 finish 页 Run 函数（RunMainBinary）不可注入，故该提示未移植，
;     见报告「不可避免的边界」一节。
;   - 官方 InstallerShowProgress 进度覆层随 Electron 壳退役，不在此移植。
; ===========================================================================

; ---- 字标与产品标签（单源：测试比对 tauri.conf.json 的 productName） -------
!define DSH_WORDMARK "EAC"
!define DSH_PRODUCT_LABEL "Deepseek Harness EAC"

; ---- 官方 theme.nsh 几何常量（96-DPI 逻辑像素，逐值保留） ----------------
!define DSH_INSTALLER_WINDOW_SIZE 600
!define DSH_INSTALLER_BRAND_Y 174
!define DSH_INSTALLER_BRAND_HEIGHT 196
!define DSH_INSTALLER_BUTTON_X 240
!define DSH_INSTALLER_BUTTON_Y 490
!define DSH_INSTALLER_BUTTON_WIDTH 120
!define DSH_INSTALLER_BUTTON_HEIGHT 44
!define DSH_INSTALLER_STATUS_Y 512
!define DSH_INSTALLER_STATUS_HEIGHT 22
!define DSH_INSTALLER_FONT "Microsoft YaHei UI"
!define DSH_INSTALLER_BUTTON_FONT_SIZE 16
!define DSH_INSTALLER_STATUS_FONT_SIZE 14

; ---- 官方 theme.nsh 亮、暗配色（GDI+ ARGB 与 GDI COLORREF） --------------
!define DSH_INSTALLER_PRIMARY 0xFF0F1115
!define DSH_INSTALLER_PRIMARY_HOVER 0xFF2D3135
!define DSH_INSTALLER_PRIMARY_PRESSED 0xFF000000
!define DSH_INSTALLER_CONTROL_HOVER 0xFFEEF0F2
!define DSH_INSTALLER_TRACK_COLOR 0xFFE9ECF2
!define DSH_INSTALLER_TEXT_COLORREF 0x15110F
!define DSH_INSTALLER_DARK_BG 0xFF151517
!define DSH_INSTALLER_DARK_TEXT 0xFFFFFF

; ---- 官方 path.nsh 路径规则常量（逐值保留） -----------------------------
!define DSH_PATH_MIN_LENGTH 4
!define DSH_PATH_MAX_LENGTH 180
!define DSH_DRIVE_FIXED 3
!define DSH_FILE_ATTRIBUTE_REPARSE_POINT 0x400
!define DSH_FILE_ATTRIBUTE_DIRECTORY 0x10

; ---- 语言 id（本文件早于模板的 MUI_LANGUAGE 被包含：此时 ${LANG_*} 尚未建立，
; makensis 实测会把中文字串并进 1033 并且 SimpChinese 语言表缺串；显式给出
; NSIS 官方语言 id（Tauri 模板 languages = SimpChinese + English）。 ----
!ifndef LANG_ENGLISH
  !define LANG_ENGLISH 1033
!endif
!ifndef LANG_SIMPCHINESE
  !define LANG_SIMPCHINESE 2052
!endif
; DSH_LANGUAGE_IDS
; ---- 安装器本地化文案（官方 strings.nsh 的 EAC 版，中英双语） ------------
; 官方要求安装器自带本地化，与 Electron 应用语言解耦；EAC 同此。
LangString DSH_STR_WELCOME_TITLE ${LANG_ENGLISH} "${DSH_PRODUCT_LABEL} Setup"
LangString DSH_STR_WELCOME_TITLE ${LANG_SIMPCHINESE} "${DSH_PRODUCT_LABEL} 安装程序"
LangString DSH_STR_WELCOME_TEXT ${LANG_ENGLISH} "This wizard installs ${DSH_PRODUCT_LABEL} for the current user. The next page chooses the install location.$\r$\n$\r$\n${DSH_WORDMARK}"
LangString DSH_STR_WELCOME_TEXT ${LANG_SIMPCHINESE} "本向导为当前用户安装 ${DSH_PRODUCT_LABEL}。安装位置在下一页选择。$\r$\n$\r$\n${DSH_WORDMARK}"
LangString DSH_STR_LOCATION_TOP ${LANG_ENGLISH} "Choose the install location: a full folder path on a local fixed drive. Drive roots, system folders, linked folders and special characters are not supported."
LangString DSH_STR_LOCATION_TOP ${LANG_SIMPCHINESE} "请选择安装位置：本地固定磁盘上的完整文件夹路径。不能使用磁盘根目录、系统目录（安装目录除外）、链接目录或包含特殊字符的路径。"
LangString DSH_STR_LOCATION_DESTINATION ${LANG_ENGLISH} "Install location (current user only)"
LangString DSH_STR_LOCATION_DESTINATION ${LANG_SIMPCHINESE} "安装位置（仅当前用户）"
LangString DSH_STR_FINISH_TITLE ${LANG_ENGLISH} "${DSH_PRODUCT_LABEL} is installed"
LangString DSH_STR_FINISH_TITLE ${LANG_SIMPCHINESE} "${DSH_PRODUCT_LABEL} 安装完成"
LangString DSH_STR_FINISH_TEXT ${LANG_ENGLISH} "The application is ready. Launch it now, or open it later from the Start menu.$\r$\n$\r$\n${DSH_WORDMARK}"
LangString DSH_STR_FINISH_TEXT ${LANG_SIMPCHINESE} "应用已就绪。可立即启动，也可稍后从开始菜单打开。$\r$\n$\r$\n${DSH_WORDMARK}"
LangString DSH_STR_LAUNCH_NOW ${LANG_ENGLISH} "Launch now"
LangString DSH_STR_LAUNCH_NOW ${LANG_SIMPCHINESE} "立即启动"
LangString DSH_STR_PATH_INVALID ${LANG_ENGLISH} "Choose a full local folder path on a fixed drive. Drive roots, system folders, links and special characters are not supported."
LangString DSH_STR_PATH_INVALID ${LANG_SIMPCHINESE} "请选择本地固定磁盘上的完整文件夹路径，不能使用磁盘根目录、系统目录、链接目录或包含特殊字符的路径。"
LangString DSH_STR_PATH_OWNERSHIP ${LANG_ENGLISH} "Choose an empty folder or the registered ${DSH_PRODUCT_LABEL} installation folder."
LangString DSH_STR_PATH_OWNERSHIP ${LANG_SIMPCHINESE} "请选择空文件夹，或 ${DSH_PRODUCT_LABEL} 原来的安装目录。"
LangString DSH_STR_PATH_WRITABLE ${LANG_ENGLISH} "This location is not writable. Choose a folder available to the current user; the installer does not request administrator rights."
LangString DSH_STR_PATH_WRITABLE ${LANG_SIMPCHINESE} "无法写入此位置。请选择当前用户可写入的文件夹；安装程序不会申请管理员权限。"
LangString DSH_STR_DISK_SPACE ${LANG_ENGLISH} "There is not enough free disk space. Choose another location."
LangString DSH_STR_DISK_SPACE ${LANG_SIMPCHINESE} "此磁盘的可用空间不足，请选择其他位置。"
LangString DSH_STR_PER_USER ${LANG_ENGLISH} "This installer supports the current user only. Uninstall the existing all-users installation first."
LangString DSH_STR_PER_USER ${LANG_SIMPCHINESE} "此安装程序仅支持当前用户。请先卸载已有的所有用户安装版本。"
LangString DSH_STR_THEME_ERROR ${LANG_ENGLISH} "Use /THEME=auto, /THEME=light or /THEME=dark."
LangString DSH_STR_THEME_ERROR ${LANG_SIMPCHINESE} "主题参数须为 /THEME=auto、/THEME=light 或 /THEME=dark。"

; ---- 官方 pages.nsh 页面契约（MUI2 原生页等价面） ------------------------
!define MUI_WELCOMEPAGE_TITLE "$(DSH_STR_WELCOME_TITLE)"
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TEXT "$(DSH_STR_WELCOME_TEXT)"
!define MUI_DIRECTORYPAGE_TEXT_TOP "$(DSH_STR_LOCATION_TOP)"
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "$(DSH_STR_LOCATION_DESTINATION)"
!define MUI_DIRECTORYPAGE_VERIFYONLEAVE
!define MUI_FINISHPAGE_TITLE "$(DSH_STR_FINISH_TITLE)"
!define MUI_FINISHPAGE_TEXT "$(DSH_STR_FINISH_TEXT)"
!define MUI_FINISHPAGE_RUN_TEXT "$(DSH_STR_LAUNCH_NOW)"

; ---- 官方 lifecycle.nsh：GUI 初始化（DPI 与主题） ------------------------
; MUI2 在首个 MUI_LANGUAGE 处插入 .onGUIInit 并回调本函数（宏名由 MUI2 支持，
; 不 !undef）；模板自身不定义 .onGUIInit，故这里可安全注册。
!define MUI_CUSTOMFUNCTION_GUIINIT "DshOnGuiInit"

Var DshInstallerDpi
Var DshInstallerTheme
Var DshLocationError

!macro DSH_ResolveInstallerDpi
  StrCpy $DshInstallerDpi 96
  System::Call 'user32::GetDC(p $HWNDPARENT) p.r0'
  ${If} $0 != 0
    ; LOGPIXELSX = 88（官方 lifecycle.nsh InstallerGuiInit 同源）。
    System::Call 'gdi32::GetDeviceCaps(p r0, i 88) i.r1'
    System::Call 'user32::ReleaseDC(p $HWNDPARENT, p r0)'
    ${If} $1 > 0
      StrCpy $DshInstallerDpi $1
    ${EndIf}
  ${EndIf}
!macroend

; 官方 theme.nsh InstallerResolveTheme 的开关解析（auto 读系统浅色偏好）。
!macro DSH_ValidateThemeSwitch
  ${GetOptions} $CMDLINE "/THEME=" $DshInstallerTheme
  ${If} ${Errors}
    StrCpy $DshInstallerTheme "auto"
  ${EndIf}
  ${If} $DshInstallerTheme != "auto"
  ${AndIf} $DshInstallerTheme != "light"
  ${AndIf} $DshInstallerTheme != "dark"
    MessageBox MB_ICONEXCLAMATION "$(DSH_STR_THEME_ERROR)" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ${If} $DshInstallerTheme == "auto"
    ClearErrors
    ReadRegDWORD $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "AppsUseLightTheme"
    ${If} ${Errors}
      StrCpy $DshInstallerTheme "light"
    ${ElseIf} $0 == 0
      StrCpy $DshInstallerTheme "dark"
    ${Else}
      StrCpy $DshInstallerTheme "light"
    ${EndIf}
  ${EndIf}
!macroend

Function DshOnGuiInit
  !insertmacro DSH_ResolveInstallerDpi
  !insertmacro DSH_ValidateThemeSwitch
  ; 官方 600 逻辑像素窗口换算成设备像素：MulDiv(逻辑像素, dpi, 96)。
  ; MUI2 原生向导不重排原生控件，故只记录该契约，不调整窗口尺寸。
  System::Call 'kernel32::MulDiv(i ${DSH_INSTALLER_WINDOW_SIZE}, i $DshInstallerDpi, i 96) i.r2'
  DetailPrint "DSH EAC: installer UI contract 477b4f42 dpi=$DshInstallerDpi theme=$DshInstallerTheme window=${DSH_INSTALLER_WINDOW_SIZE}lp=$2px"
FunctionEnd

; 官方 path.nsh InstallerValidatePath 的 EAC 版：只做只读判定与归一化；
; 合法时清空 $DshLocationError，非法时保持错误文案。
; 规则（逐条对应官方实现）：4..180 字符、X:\ 盘符形态、仅本地固定盘、
; 排除 : * ? 双引号 < > / 与控制字符、逐级上溯排除保留设备名（含扩展名形态）、
; 重解析点与非目录、WINDIR 与 PROGRAMFILES 根、PROFILE 与 LOCALAPPDATA 自身。
Function DshValidateInstallLocation
  StrCpy $DshLocationError "$(DSH_STR_PATH_INVALID)"
  ; 尾反斜杠剥除（盘符根除外），避免 GetFileName 取到空段。
  StrLen $0 $INSTDIR
  ${If} $0 > 3
    StrCpy $1 $INSTDIR 1 -1
    ${If} $1 == "\"
      StrCpy $INSTDIR $INSTDIR -1
    ${EndIf}
  ${EndIf}
  StrLen $0 $INSTDIR
  ${If} $0 < ${DSH_PATH_MIN_LENGTH}
  ${OrIf} $0 > ${DSH_PATH_MAX_LENGTH}
    Return
  ${EndIf}
  StrCpy $1 $INSTDIR 2 1
  ${If} $1 != ":\"
    Return
  ${EndIf}
  StrCpy $1 $INSTDIR 3
  System::Call 'kernel32::GetDriveTypeW(w r1) i.r2'
  ${If} $2 != ${DSH_DRIVE_FIXED}
    Return
  ${EndIf}
  StrCpy $1 3
  ${Do}
    StrCpy $2 $INSTDIR 1 $1
    ${If} $2 == ""
      ${ExitDo}
    ${EndIf}
    ${If} $2 == ':'
    ${OrIf} $2 == '*'
    ${OrIf} $2 == '?'
    ${OrIf} $2 == '"'
    ${OrIf} $2 == '<'
    ${OrIf} $2 == '>'
    ${OrIf} $2 == '/'
    ${OrIf} $2 == '$\r'
    ${OrIf} $2 == '$\n'
    ${OrIf} $2 == '$\t'
      Return
    ${EndIf}
    IntOp $1 $1 + 1
  ${Loop}
  ; 逐级上溯父目录。
  StrCpy $3 $INSTDIR
  ${Do}
    StrLen $0 $3
    ${If} $0 <= 3
      ${ExitDo}
    ${EndIf}
    ${GetFileName} $3 $4
    StrCpy $0 $4 1 -1
    ${If} $4 == ""
    ${OrIf} $0 == "."
    ${OrIf} $0 == " "
      Return
    ${EndIf}
    ; 保留设备名：Windows 保留它们，即使带扩展名。
    StrCpy $5 ""
    StrCpy $6 0
    ${Do}
      StrCpy $0 $4 1 $6
      ${If} $0 == ""
      ${OrIf} $0 == "."
        ${ExitDo}
      ${EndIf}
      StrCpy $5 "$5$0"
      IntOp $6 $6 + 1
    ${Loop}
    ${If} $5 == "CON"
    ${OrIf} $5 == "PRN"
    ${OrIf} $5 == "AUX"
    ${OrIf} $5 == "NUL"
      Return
    ${EndIf}
    StrCpy $0 $5 3
    ${If} $0 == "COM"
    ${OrIf} $0 == "LPT"
      StrLen $0 $5
      StrCpy $5 $5 1 3
      ${If} $0 == 4
      ${AndIf} $5 >= 1
      ${AndIf} $5 <= 9
        Return
      ${EndIf}
    ${EndIf}
    ; 重解析点（符号链接、junction）与存在的非目录一律拒绝。
    System::Call 'kernel32::GetFileAttributesW(w r3) i.r0'
    ${If} $0 != -1
      IntOp $1 $0 & ${DSH_FILE_ATTRIBUTE_REPARSE_POINT}
      IntOp $0 $0 & ${DSH_FILE_ATTRIBUTE_DIRECTORY}
      ${If} $1 != 0
      ${OrIf} $0 == 0
        Return
      ${EndIf}
    ${EndIf}
    ; 受保护根：PROFILE 与 LOCALAPPDATA 允许作为祖先，其余命中即拒绝。
    ${If} $3 == $WINDIR
    ${OrIf} $3 == $PROGRAMFILES32
    ${OrIf} $3 == $PROGRAMFILES64
    ${OrIf} $3 == $PROFILE
    ${OrIf} $3 == $LOCALAPPDATA
      ${If} $3 == $WINDIR
      ${OrIf} $3 == $PROGRAMFILES32
      ${OrIf} $3 == $PROGRAMFILES64
      ${OrIf} $3 == $INSTDIR
        Return
      ${EndIf}
    ${EndIf}
    ${GetParent} $3 $3
  ${Loop}
  ; 全路径归一化，随后重校验长度。
  System::Call 'kernel32::GetFullPathNameW(w "$INSTDIR", i ${NSIS_MAX_STRLEN}, w .r3, p 0) i.r0'
  ${If} $0 == 0
  ${OrIf} $0 >= ${NSIS_MAX_STRLEN}
    Return
  ${EndIf}
  StrCpy $INSTDIR $3
  StrLen $0 $INSTDIR
  ${If} $0 < ${DSH_PATH_MIN_LENGTH}
  ${OrIf} $0 > ${DSH_PATH_MAX_LENGTH}
    Return
  ${EndIf}
  StrCpy $DshLocationError ""
FunctionEnd

; 官方 path.nsh InstallerPreflight 的 EAC 版：归属（空目录或已注册安装目录）、
; 可写探针、磁盘余量（对比模板的 ESTIMATEDSIZE，单位 KB）。
; 宏而非函数：这里的 ${UNINSTKEY}、${MAINBINARYNAME}、${ESTIMATEDSIZE} 由 Tauri
; 模板在本文件之后定义，宏在 !insertmacro 处（Section 内）才展开。
!macro DSH_InstallPreflight
  !insertmacro DSH_ResolveInstallerDpi
  System::Call 'kernel32::MulDiv(i ${DSH_INSTALLER_WINDOW_SIZE}, i $DshInstallerDpi, i 96) i.r2'
  DetailPrint "DSH EAC: install location preflight (official path.nsh) dpi=$DshInstallerDpi window=${DSH_INSTALLER_WINDOW_SIZE}lp=$2px"
  Call DshValidateInstallLocation
  ; 归属：非空目录必须是已注册安装目录（Tauri 模板把 InstallLocation 写成带引号形态）。
  ${If} $DshLocationError == ""
    ReadRegStr $1 SHCTX "${UNINSTKEY}" "InstallLocation"
    ${If} $1 != ""
      StrCpy $2 $1 1
      ${If} $2 == '"'
        StrCpy $1 $1 "" 1
        StrCpy $1 $1 -1
      ${EndIf}
    ${EndIf}
    ${If} $1 != $INSTDIR
    ${AndIfNot} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      StrCpy $3 0
      FindFirst $0 $2 "$INSTDIR\*.*"
      ${DoWhile} $2 != ""
        ${If} $2 != "."
        ${AndIf} $2 != ".."
          StrCpy $3 1
          ${ExitDo}
        ${EndIf}
        FindNext $0 $2
      ${Loop}
      FindClose $0
      ${If} $3 == 1
        StrCpy $DshLocationError "$(DSH_STR_PATH_OWNERSHIP)"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ; 可写探针：在最近的已存在祖先里建临时文件再删除。
  ${If} $DshLocationError == ""
    StrCpy $2 $INSTDIR
    ${Do}
      System::Call 'kernel32::GetFileAttributesW(w r2) i.r0'
      ${If} $0 != -1
        ${ExitDo}
      ${EndIf}
      ${GetParent} $2 $2
      ${If} $2 == ""
      ${OrIf} $2 == $INSTDIR
        ${ExitDo}
      ${EndIf}
    ${Loop}
    System::Call 'kernel32::GetTempFileNameW(w r2, w "HIL", i 0, w .r3) i.r0'
    ${If} $0 == 0
      StrCpy $DshLocationError "$(DSH_STR_PATH_WRITABLE)"
    ${Else}
      System::Call 'kernel32::DeleteFileW(w r3)'
    ${EndIf}
  ${EndIf}
  ; 磁盘余量：ESTIMATEDSIZE 为 KB，换算字节后与可用空间比较。
  ${If} $DshLocationError == ""
    System::Call 'kernel32::GetDiskFreeSpaceExW(w r2, *l .r0, p 0, p 0) i.r1'
    ${If} $1 == 0
      StrCpy $DshLocationError "$(DSH_STR_PATH_WRITABLE)"
    ${Else}
      IntOp $2 ${ESTIMATEDSIZE} + 65536
      System::Int64Op $2 * 1024
      Pop $2
      System::Int64Op $0 < $2
      Pop $0
      ${If} $0 != 0
        StrCpy $DshLocationError "$(DSH_STR_DISK_SPACE)"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; 官方 InstallerBeforeInstall：写入前 fail-closed（错误码 2 退出）。
!macro DSH_InstallLocationGuard
  !insertmacro DSH_ValidateThemeSwitch
  !insertmacro DSH_InstallPreflight
  ${If} $DshLocationError != ""
    MessageBox MB_ICONEXCLAMATION "$DshLocationError" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  ; 官方「仅当前用户」提示（非阻塞，见宏内裁定）。
  !insertmacro DSH_NotifyPerMachineInstall
!macroend

; 官方 strings.nsh 的 INSTALLER_PER_USER：官方直接拒绝 per-machine 场景；
; EAC 裁定保留既有接管语义（issue #224：HKLM 残留键必须能继续升级），
; 因此改为「提示但不阻塞」，且静默安装不弹窗。
!macro DSH_NotifyPerMachineInstall
  ReadRegStr $1 HKLM "${UNINSTKEY}" "InstallLocation"
  ${If} $1 != ""
    StrCpy $2 $1 1
    ${If} $2 == '"'
      StrCpy $1 $1 "" 1
      StrCpy $1 $1 -1
    ${EndIf}
  ${EndIf}
  ${If} $1 != ""
  ${AndIf} $1 != $INSTDIR
  ${AndIfNot} ${Silent}
    DetailPrint "DSH EAC: detected per-machine install at $1 (current-user installer keeps takeover semantics)"
    MessageBox MB_ICONINFORMATION "$(DSH_STR_PER_USER)" /SD IDOK
  ${EndIf}
!macroend
