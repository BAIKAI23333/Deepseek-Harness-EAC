use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // ACL（Tauri v2 权限）：**自定义 command 默认被拒**（实测报
    // "Command X not allowed by ACL"），必须在 build 期声明它们，
    // tauri-build 才会自动生成 `allow-<cmd>` / `deny-<cmd>` 权限，
    // 再由 capabilities/*.json 授权给具体窗口。
    //
    // 这份清单必须与 `invoke_handler(generate_handler![...])` 保持一致：
    //   - **少一个** → 该命令运行期被 ACL 拒（页面只显示 unavailable，无线索）；
    //   - **多一个** → 不会报错（实测：声明一个不存在的命令，cargo check 照常
    //     通过），只会生成一个永远用不上的 allow/deny 权限。因此**不能指望
    //     build 期拦住这类笔误** —— 由 `cargo test` 的
    //     `every_invoked_command_is_declared_for_acl` 双向校验兜底。
    //
    // 授权面说明（2026-09-30 review 记录，供将来收窄时参考）：
    //   - `diagnose_environment` / `repair_environment` 是 `/died` 自愈面板**实际**
    //     使用的两个命令（`boot.start` 走的是 WS 桥 `window.dshDesktop._call`，
    //     不经 Tauri command）。
    //   - `shell_ping` / `sidecar_call` 是 HEAD 既有的注册意图，**当前零前端调用者**
    //     （它们在 capabilities 出现之前一直被 ACL 拒，从未可用）。其中
    //     `sidecar_call` **无方法白名单**，可把任意 method 转发到 sidecar 的
    //     16 个 RPC（含 `boot.stop` / `files.revert` / `plugins.set-removed`）。
    //   - 本轮**有意保留**这四个（决策：维持 HEAD 意图），来源面已由
    //     capabilities 的端口段正则收窄到壳桥端口段。若将来要最小化，先确认
    //     无人依赖 `sidecar_call`，再从此清单 + capability 的 `permissions` 同步移除。
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "shell_ping",
            "sidecar_call",
            "diagnose_environment",
            "repair_environment",
        ]),
    ))
    .expect("failed to run tauri-build");
    // 窗口桥单源打包：把 WS 回环客户端（assets/ws-jsonrpc-client.js）拼到
    // tsc 产物 sidecar/bridge.js 之前，产出 OUT_DIR/bridge-bundle.js 供
    // main.rs include_str! 统一注入，
    // 保证 window.__DSH_WS_RPC__ 先于桥胶水就位。
    println!("cargo:rerun-if-changed=sidecar/bridge.js");
    println!("cargo:rerun-if-changed=../dsh-desktop/assets/ws-jsonrpc-client.js");
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let ws = fs::read_to_string(
        manifest
            .join("..")
            .join("dsh-desktop")
            .join("assets")
            .join("ws-jsonrpc-client.js"),
    )
    .expect("assets/ws-jsonrpc-client.js missing（单源 WS 客户端）");
    let bridge = fs::read_to_string(manifest.join("sidecar").join("bridge.js"))
        .expect("sidecar/bridge.js missing（先跑 dsh-desktop 的 npm run build）");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("bridge-bundle.js");
    fs::write(&out, format!("{}\n{}\n", ws, bridge)).expect("write bridge-bundle.js");
    println!("cargo:rerun-if-changed=skin-manager-artifact.lock.json");
}
