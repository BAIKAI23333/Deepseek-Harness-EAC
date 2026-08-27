# DSH 小鲸鱼余额挂件 —— 安装说明

这是 DeepSeek Harness（DSH）Web 界面的右下角余额挂件发布包。**图片跟随插件自身目录解析**，整个文件夹放哪都能用，无需配置环境变量。

## 文件清单

| 文件 | 说明 |
|---|---|
| `whale-balance.mjs` | 挂件插件本体（ESM，宿主侧，含全部路由 + 页面脚本注入） |
| `DSniang02.png` | 小鲸鱼气泡图（1026×1026），必须和插件在同一目录 |
| `cordis.patch.yml` | profile 补丁模板（把里面的 insert 合并进你自己的补丁文件） |
| `INSTALL.md` | 本文件 |
| `whale-widget-prompt.md` | 完整规格/维护提示词（改文字位置、颜色、动画时参考） |

## 两种安装方式

### 方式 A：交给你的 AI 安装（推荐，无需手动操作）

把整个 `dsh-whale-widget` 文件夹放进你的 DSH 工作区，然后对你的 AI 说（或粘贴下面这段话）：

> 请把工作区 `dsh-whale-widget` 文件夹里的 `whale-balance.mjs` 和 `DSniang02.png` 安装到本机 DSH 的 Web profile 目录（Windows 一般为 `%USERPROFILE%\.dsh\profiles\web\`，其他平台为 `$DSH_HOME/profiles/web/`，`$DSH_HOME` 未设置时默认 `~/.dsh`）：把两个文件复制进去；然后把 `cordis.patch.yml` 模板中的 insert 行合并进同目录的 `cordis.patch.yml`（若文件内容为空 `[]` 或不存在则整段使用）；合并后确认插件已生效（可 curl 验证 `/dsh-whale/image.png` 与 `/dsh-whale/balance.json` 返回 200），并告诉我需要刷新页面。写入 profile 目录（工作区之外）需要申请文件权限时请批准。

AI 会负责：复制文件、合并补丁、验证路由、提醒你刷新。整个过程只需要你在权限弹窗里点「允许」。

### 方式 B：手动安装

1. 确认 DSH 凭据已配置 `DEEPSEEK_API_KEY`（环境变量或 `$DSH_HOME/.credentials.yaml`）。
2. 把 `whale-balance.mjs` 和 `DSniang02.png` 复制进你的 profile 目录：
   - Windows：`%USERPROFILE%\.dsh\profiles\web\`
   - 其他：`$DSH_HOME/profiles/web/`（默认 `~/.dsh/profiles/web/`）
3. 编辑同一目录的 `cordis.patch.yml`，把下面这段**追加**到数组里（已有其他行就并排追加；文件是 `[]` 或不存在就整段使用）：
   ```yaml
   - insert:
       - id: whale-balance-widget
         name: ./whale-balance.mjs?v=1
   ```
4. 保存即热生效（profile 补丁文件被实时监视，无需重启）；若未生效，重启 `dsh web`。
5. F5 刷新浏览器，右下角出现挂件。

## 验证

- `curl http://127.0.0.1:3080/dsh-whale/image.png` → 200 image/png
- `curl http://127.0.0.1:3080/dsh-whale/balance.json` → 200，含 `{"ok":true,"totalBalance":...,"currency":"CNY"}`
- 刷新页面后右下角出现挂件

## 常见问题

- **挂件不出现**：确认 `cordis.patch.yml` 合并正确；确认两个文件在 profile 目录；F5 刷新（注入只影响之后加载的页面）。
- **图片不显示**：确认 `DSniang02.png` 与 `whale-balance.mjs` 在同一目录。
- **余额报「未配置 DEEPSEEK_API_KEY」**：去 DSH 配置凭据。
- **更新插件**：替换 `whale-balance.mjs` 后，把补丁行的 `?v=` 数字 +1（如 `?v=2`）再保存——ESM 缓存需要破缓存才能热更新。
- **自定义图片**：必须是 1026×1026、气泡几何一致（中心 455,247、长轴 710、纵轴 430），否则按 `whale-widget-prompt.md` 调整文字定位参数。

## 隐私

插件不含任何密钥，余额 Key 运行时从 DSH 凭据服务读取。请勿把 `.credentials.yaml`、`settings.yaml`、`sessions` 等敏感文件放入本目录或上传任何仓库。
