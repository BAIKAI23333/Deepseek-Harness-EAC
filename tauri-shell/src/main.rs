// Deepseek Harness EAC — Tauri ShellHost PoC (ADR 0002 L1)
//
// 两种运行模式：
//   dsh-eac-shell                 → Tauri 窗口 + 托盘 + sidecar 常驻（GUI 冒烟）
//   dsh-eac-shell --bridge-test   → 无 GUI，stdio JSON-RPC 驱动 Node sidecar 三连呼叫
//
// 架构对应关系（见 docs/adr/0002）：
//   Rust 本体 = L1 桌面集成层（窗口/托盘/生命周期）
//   Node sidecar = L2 业务服务层（lib/desktop/* 的未来宿主，本 PoC 用 ping.js 演示协议）
//   dsh 内核 = L3（dsh.probe 方法验证 sidecar 可定位内核 CLI，零改动）

use std::io::{BufRead, BufReader, BufWriter, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};

const SIDECAR_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/sidecar/ping.js");
const DSH_DESKTOP_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../dsh-desktop");

/// 解析 Node 运行时：优先内置 vendor/node（与 Electron 壳共用一份，免双份），
/// 回退 PATH 上的 node。
fn resolve_node() -> String {
    if let Ok(p) = std::env::var("DSH_NODE_EXE") {
        if !p.is_empty() {
            return p;
        }
    }
    let vendored = format!("{}/vendor/node/node.exe", DSH_DESKTOP_DIR);
    if std::path::Path::new(&vendored).exists() {
        return vendored;
    }
    "node.exe".to_string()
}

/// L1 ↔ L2 的 stdio JSON-RPC 客户端（行分隔帧）。
struct Sidecar {
    child: Child,
    reader: BufReader<ChildStdout>,
    writer: BufWriter<ChildStdin>,
    next_id: u64,
}

impl Sidecar {
    fn spawn() -> Result<Self, String> {
        let node = resolve_node();
        let mut child = Command::new(&node)
            .arg(SIDECAR_SCRIPT)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("spawn node({}) failed: {}", node, e))?;
        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        Ok(Sidecar {
            child,
            reader: BufReader::new(stdout),
            writer: BufWriter::new(stdin),
            next_id: 0,
        })
    }

    fn call(&mut self, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let req = serde_json::json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        let mut line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        line.push('\n');
        self.writer
            .write_all(line.as_bytes())
            .and_then(|_| self.writer.flush())
            .map_err(|e| format!("write rpc: {}", e))?;
        let mut buf = String::new();
        loop {
            buf.clear();
            let n = self
                .reader
                .read_line(&mut buf)
                .map_err(|e| format!("read rpc: {}", e))?;
            if n == 0 {
                return Err("sidecar stdout closed".into());
            }
            let v: serde_json::Value = serde_json::from_str(buf.trim())
                .map_err(|e| format!("parse rpc: {} | raw: {}", e, buf.trim()))?;
            if v.get("id").and_then(|x| x.as_u64()) == Some(id) {
                if let Some(err) = v.get("error") {
                    return Err(format!("rpc error: {}", err));
                }
                return Ok(v.get("result").cloned().unwrap_or(serde_json::Value::Null));
            }
            // 非本次请求的行（通知等）跳过继续读
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn run_bridge_test() -> i32 {
    println!("[bridge] node = {}", resolve_node());
    println!("[bridge] sidecar = {}", SIDECAR_SCRIPT);
    let mut sc = match Sidecar::spawn() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[bridge] FAIL spawn: {}", e);
            return 1;
        }
    };
    let mut ok = 0;
    let total = 3;

    // 1) ping
    match sc.call("ping", serde_json::json!({})) {
        Ok(r) => {
            println!("[bridge] ping  -> {}", r);
            if r.get("pong") == Some(&serde_json::json!(true)) {
                ok += 1;
            }
        }
        Err(e) => eprintln!("[bridge] ping FAIL: {}", e),
    }
    // 2) shell.info
    match sc.call("shell.info", serde_json::json!({})) {
        Ok(r) => {
            println!("[bridge] info  -> {}", r);
            if r.get("sidecar") == Some(&serde_json::json!("ping.js")) {
                ok += 1;
            }
        }
        Err(e) => eprintln!("[bridge] info FAIL: {}", e),
    }
    // 3) dsh.probe（L2 定位 L3 内核 CLI —— 万物皆插件的载体仍在）
    match sc.call("dsh.probe", serde_json::json!({})) {
        Ok(r) => {
            println!("[bridge] probe -> {}", r);
            if r.get("found") == Some(&serde_json::json!(true)) {
                ok += 1;
            }
        }
        Err(e) => eprintln!("[bridge] probe FAIL: {}", e),
    }

    drop(sc);
    println!("[bridge] {}/{} checks passed", ok, total);
    if ok == total {
        0
    } else {
        1
    }
}

#[tauri::command]
fn shell_ping() -> serde_json::Value {
    serde_json::json!({ "pong": true, "shell": "tauri", "pid": std::process::id() })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--bridge-test") {
        std::process::exit(run_bridge_test());
    }

    let sidecar_state: Arc<Mutex<Option<Sidecar>>> = Arc::new(Mutex::new(None));
    let state_for_setup = sidecar_state.clone();

    tauri::Builder::default()
        .manage(sidecar_state.clone())
        .invoke_handler(tauri::generate_handler![shell_ping])
        .setup(move |app| {
            use tauri::Manager;

            // L2 sidecar 常驻（GUI 模式）：随壳启动，退出时统一回收。
            match Sidecar::spawn() {
                Ok(sc) => {
                    *state_for_setup.lock().unwrap() = Some(sc);
                    println!("[shell] sidecar ready");
                }
                Err(e) => eprintln!("[shell] sidecar spawn failed: {}", e),
            }

            // 托盘（L1）：显示窗口 / 退出。
            let show = tauri::menu::MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            let mut tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("Deepseek Harness EAC (Tauri PoC)")
                .menu(&menu);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "quit" => app.exit(0),
                _ => {}
            })
            .build(app)?;
            println!("[shell] tray ready");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app, event| {
            if let tauri::RunEvent::Exit = event {
                // 退出回收：不留孤儿 sidecar 进程（对应 Electron 壳的 before-quit 纪律）。
                if let Some(mut sc) = sidecar_state.lock().unwrap().take() {
                    let _ = sc.child.kill();
                    let _ = sc.child.wait();
                    println!("[shell] sidecar reaped");
                }
            }
            let _ = app;
        });
}
