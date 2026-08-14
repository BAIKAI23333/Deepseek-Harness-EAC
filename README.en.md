<div align="center">

[中文](README.md) | [English](README.en.md)

# Deepseek Harness EAC — Embracing All Creation

**EAC = Embracing All Creation (揽尽万象)**

[![GitHub stars](https://img.shields.io/github/stars/zouyuxuan122/Deepseek-Harness-EAC?style=flat&label=%E2%AD%90&color=08C)](https://github.com/zouyuxuan122/Deepseek-Harness-EAC) [![Windows](https://img.shields.io/badge/Windows-10%2F11-4493F8?style=flat)](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases) [![Desktop App](https://img.shields.io/badge/Desktop-App-47848F?style=flat)](https://github.com/zouyuxuan122/Deepseek-Harness-EAC) [![MIT License](https://img.shields.io/badge/license-MIT-2EA44F?style=flat)](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/blob/main/LICENSE)

A ready-to-use **Windows desktop client** wrapping the official [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (`@deepseek-ai/dsh`, the everything-is-a-plugin agent harness).
On top of the original, EAC embraces the community's creations — skins, plugins, tools, memories — everything installable with one click.

[![Deepseek Harness EAC UI preview](docs/screenshot-preview.jpg)](docs/screenshot-preview.jpg)

</div>

---

## Advantages over the original DeepSeek Harness

| Capability | Official dsh (deepseek-harness) | Deepseek Harness EAC |
| --- | --- | --- |
| Running | Requires Node.js, `npx @deepseek-ai/dsh web` + browser | **No Node.js needed**: bundled standalone Node runtime + npm CLI, double-click to run |
| UI skins | Official default look only | **10 built-in Web UI skins** (XP / QQ98 / Miku / Minecraft / THS / Whale Song…), one-click mutual-exclusive switching, disabled by default to keep native look |
| Window | Browser tab | **Native frameless window** (custom glass bar) + **system tray**, close-to-tray doesn't interrupt tasks |
| Portability | N/A | **Portable build**: data follows the exe, run from a USB stick |
| Balance | Check the website manually | Inline **「this turn ¥X · balance ¥Y」** widget in the conversation stats bar, click to top up |
| File management | Manually browse folders | **Session file-change tracking** (line-level diffs) + **one-click revert** (all or per-file) |
| In-session terminal | N/A | **Terminal tab**: persistent PowerShell in the session project dir, SSE streaming, auto-reconnect |
| Configuration | Hand-edit YAML | **Visual setup page**: one-click vision-model provider/model picker, `soul.md` persona editor, **one-click migration of skills + MCP + memory from Codex / Claude Code** |
| Plugin install | Manual npm | Built-in **plugin marketplace** in Settings: search / one-click install / uninstall |
| Updates | Manual `npm update` | **Dual auto-update**: official agent updates (npm overlay, rollback on failure) + client self-update — both user-consented |
| Notifications | N/A | **Windows system notification** when an agent task completes, click to bring the window back |
| Requirements | Node.js environment | Windows 10/11 (x64), **no runtime required** |

> Zero kernel modification: EAC runs the official `dsh web` as-is, keeping the full "everything is a plugin" architecture,
> and shares the `DSH_HOME` configuration with the CLI — existing sessions/API keys just work.

---

## Download & Install (Deployment)

### GitHub Releases (recommended)

> No single-file size limit on GitHub — download the complete installer directly.

| File | Description | Size |
| --- | --- | --- |
| [Portable exe](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases/latest/download/Deepseek-Harness-EAC-v1.0-Portable-x64.exe) | No install needed, double-click to run, USB-friendly | ~150 MB |
| [Setup exe](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases/latest/download/Deepseek-Harness-EAC-v1.0-Setup-x64.exe) | Installs to system, creates desktop/Start-Menu shortcuts | ~150 MB |

More versions on the [Releases page](https://github.com/zouyuxuan122/Deepseek-Harness-EAC/releases).

**First run**:

1. Double-click — a loading animation appears, then the DeepSeek Harness Web UI loads in a native window (localhost only).
2. If you haven't configured an API Key yet, set it up in the UI to get started (identical to the `dsh` CLI).
3. Highlights: Settings → Skins (10 built-in skins) / Plugin Marketplace / one-click model picker; conversation area → Terminal / Files tabs.

> Portable data lives next to the exe in `data\`; the installer uses `%APPDATA%\Deepseek Harness EAC v1.0\`.
> To override the DSH config directory, set the `DSH_HOME` environment variable before launch (same as the dsh CLI).

### Upgrading

- **Client**: checks the upstream repo (GitHub Releases with fallback) after launch; once you agree it downloads and installs — the portable build replaces itself in place and restarts, the setup build launches the new installer. On failure the current version is kept.
- **Official agent (dsh)**: new versions of `@deepseek-ai/dsh` are detected and installed into a data-dir overlay (atomic switch; one-click rollback to the bundled version if the new one fails to start).
- You can also just download the latest installer above and run it — data is preserved.

---

## Features

### UI Skins (EAC signature)

- The Settings → Skins tab ships **10 Web UI skins** as cards (name / description / accent color / author / source & license badges).
- 9 from the community [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) (BSD-3-Clause) + 1 [dsh-deep-whale maid-atelier](https://github.com/Small-tailqwq/dsh-deep-whale) (CC BY-NC-SA 4.0, non-commercial).
- **No skin is enabled by default** (native look); picking one disables the others (mutual exclusion), "restore default skin" resets it; the web service restarts automatically to apply.
- Skins are browser-only dsh client plugins synced into the web profile and idempotently registered in `cordis.patch.yml`; full attribution ships with each bundle.

| Skin | Source | License |
| --- | --- | --- |
| xp (Windows XP style) | [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui) | BSD-3-Clause |
| qq98 (QQ classic 98 style) | same | BSD-3-Clause |
| ths (THS style) | same | BSD-3-Clause |
| blue-fantasy | same | BSD-3-Clause |
| dragon-heir | same | BSD-3-Clause |
| minecraft | same | BSD-3-Clause |
| trading | same | BSD-3-Clause |
| whale-song | same | BSD-3-Clause |
| miku (Hatsune Miku) | same | BSD-3-Clause |
| maid-atelier (Deep-Sea Maid Workshop) | [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) | **CC BY-NC-SA 4.0** (non-commercial) |

### Out of the box

- **No Node.js needed**: bundles a standalone Node runtime and npm CLI — the target machine needs nothing
- **Bundled dsh CLI**: full `@deepseek-ai/dsh` with all official plugins, works offline
- **One-click launch**: double-click to start `dsh web`, auto-selects a free port, loads into a native window
- **Shares CLI config**: defaults to `DSH_HOME` (typically `~\.dsh`) — existing sessions/API keys work out of the box
- **Portable**: data follows the exe; copy to a USB stick and go

### Desktop experience

- **Frameless styled window + system tray**: no native title/menu bars — custom glass bar (rounded icon, ⋯ menu, window controls) with Win11 rounded corners; closing hides to the tray
- **Clean exit**: quitting kills the entire dsh process tree — no orphans
- **Shortcut self-healing**: the portable build creates/repairs desktop & Start Menu shortcuts automatically (re-pointed after the exe moves)
- **Session notifications**: Windows toast when an agent task completes — click to return to the window

### Productivity (companion plugin system)

- **DeepSeek balance widget**: inline「this turn ¥X · balance ¥Y」in the conversation stats bar, click to top up, auto-refresh every 15 min
- **File-change tracking + one-click revert**: a Files tab aggregates every file the agent touched (created/modified/deleted + line-level diffs) with per-file or bulk revert; data is read-only reuse of session logs, stable across upgrades
- **In-session terminal**: a Terminal tab starts a persistent PowerShell in the session's project dir (SSE streaming, command history, auto-reconnect, clean CJK encoding)
- **Project file tree + HTML/port preview**: VSCode-style tree, in-app preview of HTML files and localhost ports (loopback only)
- **Plugin marketplace**: Settings → Plugins — search npm for dsh plugins and install/uninstall them into the web profile with one click
- **Easy setup (dsh-easy-setup)**: one-click vision-model provider/model picker, `soul.md` persona visual editor, one-click migration of skills + MCP + memory from Codex / Claude Code directories
- **Dual auto-update**: official dsh agent updates (npm overlay) + client-wrapper self-update — both user-consented, automatic rollback on failure
- **Self-healing**: `profile-module-heal` fixes profile module shadowing issues (e.g. `prompt section already registered`, broken model list / mode switching)

---

## Requirements

- Windows 10/11 (x64)
- No pre-installed Node.js or any other runtime

## Build from source

```powershell
cd dsh-desktop
npm install
npm run fetch-runtime    # bundle node.exe + npm CLI
npm run dist             # build portable + NSIS installer -> dist/
```

> Behind a firewall? Electron mirror: `$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'`; builder toolchain mirror: `$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'`.

Run tests:

```powershell
npm test                 # node --test test/*.test.mjs
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Electron shell (main.js)                                │
│  · Single-instance lock / window / menu / lifecycle      │
│  · Session watcher (session-watcher.js) → notifications  │
│  · Official updater (updater.js) → user-consented overlay│
│  · Client updater (client-updater.js) → download/replace │
│  · spawn node.exe from vendor|resources                  │
└──────────────┬───────────────────────────────────────────┘
               │  dsh web --host 127.0.0.1 --port 0
               ▼
       Bundled node.exe + @deepseek-ai/dsh
       Path resolution: user overlay > bundled package
       Prints "dsh web: http://127.0.0.1:<port>"
               │  Parse URL, poll HTTP 200
               ▼
       Native window loads Web UI (localhost only)
```

## Project structure

```
dsh-desktop/                  # Electron desktop app
├── main.js                   # Electron main process
├── updater.js                # Official dsh agent updater
├── client-updater.js         # Client self-updater
├── balance.js                # DeepSeek balance query
├── session-watcher.js        # Session completion watcher
├── profile-module-heal.js    # Profile module shadowing heal
├── preload.js                # Sandbox preload
├── assets/                   # Loading page, update page, icons, skins, companion plugins
│   ├── skins/                # 10 built-in Web UI skins
│   └── plugins/              # dsh-balance / dsh-file-changes / dsh-terminal
│                             # / dsh-easy-setup / dsh-skin-switch / dsh-plugin-marketplace …
├── scripts/                  # Build & dev helper scripts
├── build/icon.png            # electron-builder icon
├── vendor/                   # Bundled node.exe / npm CLI (not in repo)
├── electron-builder.yml      # Build config
└── dist/                     # Build output (not in repo; published to Releases)
openclaw-dsh-bridge/          # WeChat bridge plugin (optional, research-grade)
research/                     # Third-party WeChat / bridge protocol research
```

## License

MIT. Based on [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (MIT). Built-in skins are owned by their original authors (see the skin license table above).
