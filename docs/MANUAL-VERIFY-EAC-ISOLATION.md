# EAC 隔离实操验证手册（本机）

产物：`2026-09-30 23:19:26`（exe 12,239,872 B / NSIS 230,536,186 B）
本手册覆盖：**当前代码的全部修复点** + **本次实测踩过的 3 个坑的回归**。

---

## 0. 环境基线（实操前先核对）

| 项 | 你的现状（2026-09-30 核对） |
| --- | --- |
| 真实产品数据根 | `%LOCALAPPDATA%\Deepseek Harness EAC` |
| 已注册环境 | `eac-beta`（09-29 12:03 创建，注册表 revision 3） |
| 环境根 | `…\dpx\dsh-environments\eac-beta` |
| 历史备份 | `environments.broken-20260928`、`eac-beta.broken-20260928`（未删） |

> 本手册的 **§1–§2 直接在你的真实环境上操作**（会在隔离根里建 profile，首次需登录）。
> **§3–§5 用临时根**，不碰你的真实数据。

---

## 1. 正常启动（主链路）

**双击**：`D:\AI_Coding\Deepseek-Harness-EAC\tauri-shell\target\release\dsh-eac-shell.exe`

### 期望

- [ ] 托盘图标出现
- [ ] 主窗口加载出 **DSH Web UI**（**不是**"服务已停止"页）
- [ ] 窗口标题栏是**自绘**的（左侧 `Deepseek Harness EAC` + 右侧 最小化/最大化/关闭）
- [ ] **页面上没有任何游离的反斜杠 `\`**（这是本轮修的 bug 之一）

### 如果失败

走 §6 的取日志方法，把 `/died` 页显示的信息给我。

### 关键核对（启动后）

```powershell
# 1) 环境根是否落在隔离位置
dir "%LOCALAPPDATA%\Deepseek Harness EAC\dpx\dsh-environments\eac-beta"

# 2) 身份清单
type "%LOCALAPPDATA%\Deepseek Harness EAC\dpx\dsh-environments\eac-beta\.dpx-environment.json"

# 3) 内核 profile 是否在隔离根里（而不是宿主 ~\.dsh）
dir "%LOCALAPPDATA%\Deepseek Harness EAC\dpx\dsh-environments\eac-beta\dsh-home\profiles"

# 4) 宿主 ~\.dsh 是否未被触碰（时间戳应仍是旧的）
dir "%USERPROFILE%\.dsh"
```

- [ ] `.dpx-environment.json` 里 `kind` 是 `DPXEnvironment`
- [ ] 隔离根 `dsh-home\profiles\` 里有 `web-desktop`
- [ ] 宿主 `~\.dsh` 时间戳**没有**变成"刚刚"

---

## 2. 隔离真实性验证（本轮重点）

> 目的：证明 EAC **没有**读宿主的旧插件/旧配置。

### 步骤

```powershell
# 在一个临时位置造"宿主旧 profile 陷阱"
$fake = "$env:TEMP\eac-verify-host"
New-Item -ItemType Directory -Force "$fake\.dsh\profiles\web-desktop" | Out-Null
'旧插件-不该被读到' | Set-Content "$fake\.dsh\profiles\web-desktop\old-plugin.txt"
```

然后**用命令行启动壳**（指向假宿主 + 临时隔离根，不碰真实数据）：

```powershell
cd D:\AI_Coding\Deepseek-Harness-EAC\tauri-shell\target\release
$env:DSH_EAC_DATA_ROOT        = "$env:TEMP\eac-verify-data-产品 根"   # 故意含空格与中文
$env:DSH_EAC_DPX_REGISTRY_HOME= "$env:TEMP\eac-verify-registry"
$env:DSH_EAC_CHANNEL          = 'beta'
$env:USERPROFILE              = $fake
$env:HOME                     = $fake
$env:LOCALAPPDATA             = $fake
.\dsh-eac-shell.exe
```

### 期望

- [ ] 主窗口正常加载
- [ ] 隔离根建在 `$env:TEMP\eac-verify-data-产品 根\dpx\dsh-environments\eac-beta`（**路径含空格与中文也能work**）
- [ ] 该隔离根的 `dsh-home\profiles\web-desktop\` 下**没有** `old-plugin.txt`
- [ ] `$fake\.dsh\profiles\web-desktop\old-plugin.txt` **内容原样未变**（没被删/没被改）

> ⚠️ 注意：`DSH_EAC_DATA_ROOT` **必须是原生 Windows 路径**（`C:\...`）。
> 用 Git Bash 的 `/tmp/...` 形式会启动失败（我实测踩过）。

---

## 3. `/died` 自愈页验证（本轮新功能）

> 目的：证明环境坏了时，页面给出**可读诊断**而不是白屏。

### 步骤

```powershell
# 1) 用临时根建一个健康环境
cd D:\AI_Coding\Deepseek-Harness-EAC\tauri-shell\target\release
$R = "$env:TEMP\eac-dead-demo-$(Get-Random)"
$env:DSH_RESOURCE_ROOT        = (Get-Location).Path
$env:DSH_EAC_DATA_ROOT        = "$R\产品 Data 根"
$env:DSH_EAC_DPX_REGISTRY_HOME= "$R\registry"
$env:DSH_EAC_CHANNEL          = 'beta'
$env:USERPROFILE              = "$R\h"; $env:HOME = "$R\h"; $env:LOCALAPPDATA = "$R\h"

.\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=repair

# 2) 把注册表写坏
Set-Content "$R\registry\registry.json" '{ 坏掉' -NoNewline

# 3) 启动壳（应 fail closed → /died）
.\dsh-eac-shell.exe
```

### 期望（这是本轮修复的核心）

- [ ] 壳导航到 **"服务已停止"** 页（**副作用：这是刻意的 fail closed，不是 bug**）
- [ ] 页面上出现 **「安装环境」** 区块
- [ ] 若干秒内，该区块显示：
  - 隔离根路径（`…\eac-beta`）
  - `已登记 / 未登记`
  - **可读的中文损坏原因**，形如：`损坏：…\registry.json（Expected property name or '}' …）`
- [ ] 因为 `removable=false`，「清理并重建环境」按钮**隐藏**，并显示**人工出路提示**：
  > 环境无法自动清理（注册表不可读或目录被占用）。可手动把上面那条路径整个删掉或改名，然后重启本应用。
- [ ] **页面上没有游离的反斜杠 `\`**

> 如果区块一直停在「正在检查隔离环境…」→ 那是本轮修的 ACL bug 复现了，请记录并告诉我。

### 清理

```powershell
Remove-Item -Recurse -Force $R -ErrorAction SilentlyContinue
```

---

## 4. 清理 / 重建闭环（`purge`）

```powershell
# 承接 §3 的临时根（先把注册表恢复成合法）
$R = "$env:TEMP\eac-dead-demo-<你上面用的随机数>"
# 或重新走 §3 的 1) 建一个新的健康环境

# dry-run：只看计划，不落盘
.\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=plan --purge

# 只摘记录、保数据
.\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=remove

# 彻底清理（连环境根一起删）
.\dsh-desktop\vendor\node\node.exe dsh-desktop\scripts\environment-diagnose.mjs --action=remove --purge
```

### 期望

- [ ] `--action=plan --purge` 输出 `plan.root.action = "delete"`，且**磁盘无变化**
- [ ] `--action=remove`（不带 purge）后：**环境根仍在**、用户数据仍在、注册表记录被摘除
- [ ] `--action=remove --purge` 后：**环境根消失**

---

## 5. 拒绝接管别人的目录（安全边界）

```powershell
# 造一个"未注册但非空"的环境根
$R2 = "$env:TEMP\eac-stray-$(Get-Random)"
New-Item -ItemType Directory -Force "$R2\产品 Data 根\dpx\dsh-environments\eac-beta" | Out-Null
'别人的数据' | Set-Content "$R2\产品 Data 根\dpx\dsh-environments\eac-beta\user-data.txt"
# 指过去启动 / 或跑 CLI
```

### 期望

- [ ] 创建 / 计划 / 移除**三个阶段都拒绝**（报 `dsh-dpx ...` 或 `Refusing to adopt non-empty environment directory`）
- [ ] `user-data.txt` **原样保留**（绝不能删别人的数据）

---

## 6. 取日志 / 排障（失败时用）

**release 壳会把 sidecar 的 stderr 丢弃**，所以要看日志需从这里取：

| 位置 | 内容 |
| --- | --- |
| `/died` 页上的 log 路径 | 内核（dsh web）日志，通常是 `<隔离根>\appdata\Deepseek Harness EAC\logs\dsh-web.log` |
| 控制台启动 | 若用命令行启动，壳自身的 `[shell]` / `[sidecar]` 输出会打到终端 |
| 隔离诊断 CLI | `dsh-desktop\scripts\environment-diagnose.mjs --action=status`（**须带 `DSH_RESOURCE_ROOT`**） |

**要看 `/died` 页的真实行为**（而不是在浏览器里渲染的假象）：

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9999 --remote-allow-origins=http://127.0.0.1:9999 --no-first-run'
.\dsh-eac-shell.exe
# 然后 http://127.0.0.1:9999/json/list 取页面；用 CDP 求值读 DOM
```

> 浏览器直接打开 `http://127.0.0.1:<壳端口>/died` **看不到真实结果** —— 浏览器里没有 `__TAURI_INTERNALS__`，诊断一直停在"正在检查…"。

---

## 7. 结果记录表

| # | 检查项 | 结果 | 备注 |
| --- | --- | --- | --- |
| 1 | 正常启动、主窗口加载 | ☐ | |
| 2 | 标题栏自绘正常 | ☐ | |
| 3 | 页面无游离反斜杠 | ☐ | |
| 4 | 隔离根落盘正确 | ☐ | |
| 5 | 宿主 `~\.dsh` 未被触碰 | ☐ | |
| 6 | 假宿主旧插件未被读入 | ☐ | |
| 7 | 空格/中文路径可用 | ☐ | |
| 8 | `/died` 显示可读诊断 | ☐ | |
| 9 | `/died` 按钮按 removable 显隐 | ☐ | |
| 10 | `plan` 不落盘 | ☐ | |
| 11 | 非 purge 保数据 | ☐ | |
| 12 | purge 删根 | ☐ | |
| 13 | 未注册非空目录被拒 | ☐ | |
| 14 | 清理后能干净重建 | ☐ | |

**遇到任何异常**，请把：① 哪一步 ② 屏幕现象 ③ `/died` 页显示的文案 ④ 终端输出 发我。

---

## 8. 附：自动化等价验证（如果不想手工点）

```powershell
cd D:\AI_Coding\Deepseek-Harness-EAC
node reports\eac-isolated-shell-evidence.mjs    # 真实 release 壳隔离启动（9 项断言）
node reports\t6-isolation-scenarios.mjs         # 隔离专项 37 项
node reports\t1x-stress-isolation.mjs           # 压力/并发 20 项
```

三者都用临时根，**不碰你的真实环境**。
