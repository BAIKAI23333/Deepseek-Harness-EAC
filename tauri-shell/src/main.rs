// Deepseek Harness EAC — Tauri ShellHost（ADR 0002 L1；P2 回环 WS 桥）
//
// 运行模式：
//   dsh-eac-shell               → 窗口 + 托盘 + sidecar 常驻 + WS 桥
//   dsh-eac-shell --bridge-test → 无 GUI，stdio JSON-RPC 驱动 server.js 冒烟
//
// 架构对应（docs/adr/0002）：
//   Rust 本体    = L1（窗口/托盘/WS 回环桥/生命周期）
//   Node sidecar = L2（tauri-shell/sidecar/server.js，挂载 lib/desktop/* 全部模块）
//   dsh 内核     = L3（零改动）
//
// WS 桥协议（127.0.0.1:19873）：
//   GET /bootstrap  → 最小 HTML（探针页，加载 inject/bridge.js 同款逻辑内联）
//   GET /inject/bridge.js → 桥脚本（initialization_script 与页面双通道共用）
//   GET /ws 升级    → JSON-RPC 双向：请求转发 sidecar stdio，响应按 id 回填，
//                     sidecar 的无 id 帧（通知）广播给所有连接。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader as ABufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use std::process::Stdio;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex as AMutex};
use tokio_tungstenite::tungstenite::Message;

const SIDECAR_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/sidecar/server.js");
const BRIDGE_JS: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/inject/bridge.js"));
const DSH_DESKTOP_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../dsh-desktop");
const WS_PORT: u16 = 19873;

/// 解析 Node 运行时：优先内置 vendor/node（与 Electron 壳共用一份），回退 PATH。
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

/// L1 ↔ L2 sidecar 异步客户端：行分隔 JSON-RPC over stdio。
struct Sidecar {
    child: Child,
    writer: Arc<AMutex<ChildStdin>>,
    next_id: Arc<AtomicU64>,
    pending: Arc<AMutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    notify_tx: broadcast::Sender<Value>,
}

impl Sidecar {
    async fn spawn() -> Result<Self, String> {
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
        let (notify_tx, _rx) = broadcast::channel::<Value>(64);
        let sc = Sidecar {
            child,
            writer: Arc::new(AMutex::new(stdin)),
            next_id: Arc::new(AtomicU64::new(0)),
            pending: Arc::new(AMutex::new(HashMap::new())),
            notify_tx,
        };
        sc.spawn_reader(ABufReader::new(stdout));
        Ok(sc)
    }

    fn spawn_reader(&self, mut reader: ABufReader<ChildStdout>) {
        let pending = self.pending.clone();
        let notify_tx = self.notify_tx.clone();
        tauri::async_runtime::spawn(async move {
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // stdout closed
                    Ok(_) => {}
                    Err(_) => break,
                }
                let text = line.trim();
                if text.is_empty() {
                    continue;
                }
                let v: Value = match serde_json::from_str(text) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(id) = v.get("id").and_then(|x| x.as_u64()) {
                    if let Some(tx) = pending.lock().await.remove(&id) {
                        let payload = if let Some(err) = v.get("error") {
                            Err(format!("rpc error: {}", err))
                        } else {
                            Ok(v.get("result").cloned().unwrap_or(Value::Null))
                        };
                        let _ = tx.send(payload);
                    }
                } else if v.get("method").is_some() {
                    // 通知帧：广播给所有 WS 连接。
                    let _ = notify_tx.send(v);
                }
            }
        });
    }

    async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let req = serde_json::json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        let mut w = self.writer.lock().await;
        let mut line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        line.push('\n');
        w.write_all(line.as_bytes()).await.map_err(|e| format!("write rpc: {}", e))?;
        w.flush().await.map_err(|e| format!("flush rpc: {}", e))?;
        drop(w);
        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(res)) => res,
            Ok(Err(_)) => Err("sidecar dropped reply channel".into()),
            Err(_) => Err("sidecar call timeout (30s)".into()),
        }
    }

    async fn kill(&mut self) {
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
    }
}

/// 每连接共享态：sidecar 句柄。
#[derive(Clone)]
struct BridgeState {
    sidecar: Arc<AMutex<Option<Arc<Sidecar>>>>,
}

/// 同端口上的极简 HTTP + WebSocket 服务：
///   GET /bootstrap          → 探针页（内联 bridge 逻辑）
///   GET /inject/bridge.js   → 桥脚本
///   其余（Upgrade: websocket）→ JSON-RPC 中继
async fn serve_ws(state: BridgeState) {
    let listener = match TcpListener::bind(("127.0.0.1", WS_PORT)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[ws] bind {} failed: {}", WS_PORT, e);
            return;
        }
    };
    println!("[ws] bridge listening on http://127.0.0.1:{}/bootstrap", WS_PORT);
    loop {
        let Ok((stream, _)) = listener.accept().await else { continue };
        let state = BridgeState {
            sidecar: state.sidecar.clone(),
        };
        tauri::async_runtime::spawn(async move {
            let _ = handle_conn(stream, state).await;
        });
    }
}

async fn handle_conn(stream: TcpStream, state: BridgeState) -> std::io::Result<()> {
    // 先窥探请求头：决定 WS 升级还是极简 HTTP。（peek 取 &self，不消耗流）
    let (req_path, wants_upgrade) = {
        let mut buf = [0u8; 2048];
        let n = stream.peek(&mut buf).await?;
        let head = String::from_utf8_lossy(&buf[..n]).to_string();
        let first = head.lines().next().unwrap_or("");
        let path = first.split_whitespace().nth(1).unwrap_or("/").to_string();
        (path, head.to_lowercase().contains("upgrade: websocket"))
    };

    if !wants_upgrade {
        return http_serve(stream, &req_path).await;
    }

    let ws = tokio_tungstenite::accept_async(stream)
        .await
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let (mut sink, mut source) = ws.split();

    // 单一写任务：回复与通知统一经 out_tx 出站（SplitSink 不可克隆）。
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Message>();
    tauri::async_runtime::spawn(async move {
        while let Some(m) = out_rx.recv().await {
            let _ = sink.send(m).await;
        }
    });

    // 通知订阅 → 出站。
    if let Some(sc) = state.sidecar.lock().await.clone() {
        let mut rx = sc.notify_tx.subscribe();
        let tx = out_tx.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(v) => {
                        let _ = tx.send(Message::Text(v.to_string()));
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        });
    }

    while let Some(msg) = source.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };
        if let Message::Text(txt) = msg {
            let Ok(mut req) = serde_json::from_str::<Value>(&txt) else { continue };
            let id = req.get("id").cloned().unwrap_or(Value::Null);
            let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("").to_string();
            let params = req.get("params").cloned().unwrap_or(Value::Null);
            let sc = state.sidecar.lock().await.clone();
            let reply = match sc {
                Some(sc) => match sc.call(&method, params).await {
                    Ok(result) => serde_json::json!({"jsonrpc":"2.0","id":id,"result":result}),
                    Err(e) => serde_json::json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":e}}),
                },
                None => serde_json::json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":"sidecar not running"}}),
            };
            let _ = out_tx.send(Message::Text(reply.to_string()));
        }
    }
    Ok(())
}

async fn http_serve(mut stream: TcpStream, path: &str) -> std::io::Result<()> {
    // 排空请求头直到空行（避免未读数据导致 RST 抢在响应前）。
    {
        let mut buf = [0u8; 2048];
        loop {
            let n = stream.peek(&mut buf).await?;
            if n == 0 {
                break;
            }
            let head = String::from_utf8_lossy(&buf[..n]);
            if head.contains("\r\n\r\n") {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    }
    let (body, ctype) = if path.starts_with("/inject/bridge.js") {
        (BRIDGE_JS.to_string(), "application/javascript")
    } else {
        let page = format!(
            "<!doctype html><meta charset=utf-8><title>DSH EAC Shell</title>\
             <body style=\"font-family:Consolas,monospace;background:#0b1220;color:#dfe6ff\">\
             <h3>DSH EAC — Tauri ShellHost</h3><pre id=out>connecting…</pre>\
             <script>window.__DSH_BRIDGE_WS__='ws://127.0.0.1:{}/ws';{}</script>",
            WS_PORT, BRIDGE_JS
        );
        (page, "text/html; charset=utf-8")
    };
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        ctype,
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes()).await?;
    stream.flush().await?;
    Ok(())
}

fn run_bridge_test() -> i32 {
    println!("[bridge] node = {}", resolve_node());
    println!("[bridge] sidecar = {}", SIDECAR_SCRIPT);
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");
    let code = rt.block_on(async move {
        let mut sc = match Sidecar::spawn().await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[bridge] FAIL spawn: {}", e);
                return 1;
            }
        };
        let checks: Vec<(&str, Value, Box<dyn Fn(&Value) -> bool>)> = vec![
            ("ping", serde_json::json!({}), Box::new(|r: &Value| r.get("pong") == Some(&serde_json::json!(true)))),
            (
                "shell.info",
                serde_json::json!({}),
                Box::new(|r: &Value| r.get("sidecar") == Some(&serde_json::json!("server.ts"))),
            ),
            (
                "profile.name",
                serde_json::json!({}),
                Box::new(|r: &Value| r.get("name") == Some(&serde_json::json!("web-desktop"))),
            ),
            (
                "plugins.removedIds",
                serde_json::json!({}),
                Box::new(|r: &Value| r.get("ids").map(|v| v.is_object()).unwrap_or(false)),
            ),
        ];
        let mut ok = 0;
        for (name, params, check) in &checks {
            match sc.call(name, params.clone()).await {
                Ok(r) => {
                    println!("[bridge] {:<20} -> {}", name, r);
                    if check(&r) {
                        ok += 1;
                    } else {
                        eprintln!("[bridge] {} CHECK-FAIL", name);
                    }
                }
                Err(e) => eprintln!("[bridge] {} FAIL: {}", name, e),
            }
        }
        sc.kill().await;
        println!("[bridge] {}/{} checks passed", ok, checks.len());
        if ok == checks.len() {
            0
        } else {
            1
        }
    });
    code
}

#[tauri::command]
fn shell_ping() -> serde_json::Value {
    serde_json::json!({ "pong": true, "shell": "tauri", "pid": std::process::id() })
}

#[tauri::command]
async fn sidecar_call(method: String, params: Value) -> Result<Value, String> {
    let state = BRIDGE.get_or_init(|| BridgeState {
        sidecar: Arc::new(AMutex::new(None)),
    });
    let sc = state.sidecar.lock().await.clone();
    match sc {
        Some(sc) => sc.call(&method, params).await,
        None => Err("sidecar not running".into()),
    }
}

static BRIDGE_ONCE: std::sync::Once = std::sync::Once::new();
static BRIDGE: std::sync::OnceLock<BridgeState> = std::sync::OnceLock::new();

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--bridge-test") {
        std::process::exit(run_bridge_test());
    }

    let state = BRIDGE.get_or_init(|| BridgeState {
        sidecar: Arc::new(AMutex::new(None)),
    });

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![shell_ping, sidecar_call])
        .setup(move |_app| {
            use tauri::Manager;

            BRIDGE_ONCE.call_once(|| {
                let st = BridgeState {
                    sidecar: state.sidecar.clone(),
                };
                tauri::async_runtime::spawn(async move {
                    match Sidecar::spawn().await {
                        Ok(sc) => {
                            *st.sidecar.lock().await = Some(Arc::new(sc));
                            println!("[shell] sidecar ready");
                            serve_ws(st).await;
                        }
                        Err(e) => eprintln!("[shell] sidecar spawn failed: {}", e),
                    }
                });
            });

            // 托盘（L1）：显示窗口 / 退出。
            let app_handle = _app.handle().clone();
            let show = tauri::menu::MenuItem::with_id(_app, "show", "显示窗口", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(_app, "quit", "退出", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(_app, &[&show, &quit])?;
            let mut tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("Deepseek Harness EAC")
                .menu(&menu);
            if let Some(icon) = _app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(move |app, event| match event.id.as_ref() {
                "show" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "quit" => app_handle.exit(0),
                _ => {}
            })
            .build(_app)?;
            println!("[shell] tray ready");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let _ = window;
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app, event| {
            if let tauri::RunEvent::Exit = event {
                // 退出回收：不留孤儿 sidecar 进程。
                let state = BRIDGE.get_or_init(|| BridgeState {
                    sidecar: Arc::new(AMutex::new(None)),
                });
                let st = BridgeState { sidecar: state.sidecar.clone() };
                tauri::async_runtime::spawn(async move {
                    if let Some(sc) = st.sidecar.lock().await.take() {
                        if let Some(mut owned) = Arc::into_inner(sc) {
                            owned.kill().await;
                        }
                    }
                });
                println!("[shell] sidecar reap scheduled");
                let _ = app;
            }
        });
}
