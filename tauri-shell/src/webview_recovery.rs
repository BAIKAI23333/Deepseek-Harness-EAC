use std::collections::VecDeque;
use std::time::{Duration, Instant};

const CRASH_WINDOW: Duration = Duration::from_secs(60);
const MAX_AUTO_RELOADS: usize = 2;

#[derive(Debug, PartialEq)]
enum Action {
    Reload,
    Notify,
    Ignore,
}

#[derive(Default)]
struct RecoveryBudget {
    reloads: VecDeque<Instant>,
    last_notice: Option<Instant>,
}

impl RecoveryBudget {
    fn on_failure(&mut self, renderer_exited: bool, now: Instant) -> Action {
        while self
            .reloads
            .front()
            .is_some_and(|t| now.duration_since(*t) >= CRASH_WINDOW)
        {
            self.reloads.pop_front();
        }
        if renderer_exited && self.reloads.len() < MAX_AUTO_RELOADS {
            self.reloads.push_back(now);
            return Action::Reload;
        }
        if self
            .last_notice
            .is_some_and(|t| now.duration_since(t) < CRASH_WINDOW)
        {
            return Action::Ignore;
        }
        self.last_notice = Some(now);
        Action::Notify
    }
}

#[cfg(windows)]
fn action_for_kind(
    budget: &mut RecoveryBudget,
    kind: webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_KIND,
    now: Instant,
) -> Action {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    match kind {
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED => budget.on_failure(true, now),
        COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => budget.on_failure(false, now),
        // WebView2 recovers GPU/subframe processes itself. 'Unresponsive' can
        // be temporary during an active task: never reload or kill it here.
        _ => Action::Ignore,
    }
}

#[cfg(windows)]
fn notify_manual_restart(app: &tauri::AppHandle) {
    use tauri::Manager;
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    let message = if super::shell_prefers_chinese() {
        "界面进程异常退出，或短时间内反复崩溃，已停止自动刷新。内核没有因此重启，已保存的会话仍保留；尚未发送的输入可能丢失。请退出后重新打开应用。"
    } else {
        "The interface process exited or crashed repeatedly. Automatic refresh has stopped. The kernel was not restarted and saved sessions are preserved; unsent input may be lost. Please quit and reopen the app."
    };
    let mut dialog = app
        .dialog()
        .message(message)
        .title("Deepseek Harness EAC")
        .kind(MessageDialogKind::Error);
    if let Some(win) = app.get_webview_window("main") {
        dialog = dialog.parent(&win);
    }
    dialog.show(|_| {});
}

#[cfg(windows)]
pub(super) fn install(win: &tauri::WebviewWindow) {
    use std::sync::Mutex;
    use tauri::Manager;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_FAILED_KIND,
        ProcessFailedEventHandler,
    };

    let app = win.app_handle().clone();
    let result = win.with_webview(move |view| {
        let registration = (|| unsafe {
            let core = view.controller().CoreWebView2()?;
            let budget = Mutex::new(RecoveryBudget::default());
            // Capture the app, not the WebView/controller: COM owns the callback.
            let callback_app = app.clone();
            let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
                if super::SIDECAR_STOPPING.load(std::sync::atomic::Ordering::SeqCst) {
                    return Ok(());
                }
                let Some(args) = args else {
                    return Ok(());
                };
                let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                args.ProcessFailedKind(&mut kind)?;
                let action = action_for_kind(
                    &mut budget.lock().unwrap_or_else(|e| e.into_inner()),
                    kind,
                    Instant::now(),
                );
                if action == Action::Ignore {
                    return Ok(());
                }
                eprintln!(
                    "[shell] WebView process failed kind={} action={:?}",
                    kind.0, action
                );
                let app = callback_app.clone();
                let queued_app = app.clone();
                if let Err(error) = app.run_on_main_thread(move || {
                    if super::SIDECAR_STOPPING.load(std::sync::atomic::Ordering::SeqCst) {
                        return;
                    }
                    match action {
                        Action::Reload => {
                            if let Some(win) = queued_app.get_webview_window("main") {
                                if let Err(error) = win.reload() {
                                    eprintln!("[shell] WebView native reload failed: {}", error);
                                    notify_manual_restart(&queued_app);
                                }
                            }
                        }
                        Action::Notify => notify_manual_restart(&queued_app),
                        Action::Ignore => {}
                    }
                }) {
                    eprintln!("[shell] WebView recovery dispatch failed: {}", error);
                }
                Ok(())
            }));
            let mut token = 0;
            core.add_ProcessFailed(&handler, &mut token)
        })();
        match registration {
            Ok(()) => eprintln!("[shell] WebView process recovery registered"),
            Err(error) => eprintln!(
                "[shell] WebView process recovery registration failed: {}",
                error
            ),
        }
    });
    if let Err(error) = result {
        eprintln!("[shell] WebView process recovery setup failed: {}", error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn only_top_level_renderer_or_browser_exit_spends_budget() {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        let now = Instant::now();
        let mut budget = RecoveryBudget::default();
        for kind in [
            COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
            COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
        ] {
            assert_eq!(action_for_kind(&mut budget, kind, now), Action::Ignore);
        }
        assert!(budget.reloads.is_empty());
        assert!(budget.last_notice.is_none());
        assert_eq!(
            action_for_kind(
                &mut budget,
                COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
                now
            ),
            Action::Reload
        );
        assert_eq!(
            action_for_kind(
                &mut budget,
                COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
                now
            ),
            Action::Notify
        );
    }

    #[test]
    fn reloads_twice_then_stops_and_notifies_once() {
        let now = Instant::now();
        let mut budget = RecoveryBudget::default();
        assert_eq!(budget.on_failure(true, now), Action::Reload);
        assert_eq!(
            budget.on_failure(true, now + Duration::from_secs(1)),
            Action::Reload
        );
        assert_eq!(
            budget.on_failure(true, now + Duration::from_secs(2)),
            Action::Notify
        );
        assert_eq!(
            budget.on_failure(true, now + Duration::from_secs(3)),
            Action::Ignore
        );
    }

    #[test]
    fn rolling_window_does_not_reset_all_attempts_at_once() {
        let now = Instant::now();
        let mut budget = RecoveryBudget::default();
        assert_eq!(budget.on_failure(true, now), Action::Reload);
        assert_eq!(
            budget.on_failure(true, now + Duration::from_secs(59)),
            Action::Reload
        );
        assert_eq!(
            budget.on_failure(true, now + Duration::from_secs(60)),
            Action::Reload
        );
        assert_eq!(
            budget.on_failure(true, now + Duration::from_secs(61)),
            Action::Notify
        );
    }

    #[test]
    fn browser_exit_requires_manual_restart_not_invalid_reload() {
        let now = Instant::now();
        let mut budget = RecoveryBudget::default();
        assert_eq!(budget.on_failure(false, now), Action::Notify);
        assert_eq!(
            budget.on_failure(false, now + Duration::from_secs(1)),
            Action::Ignore
        );
        assert!(budget.reloads.is_empty());
    }

    #[test]
    fn budget_recovers_after_cooldown() {
        let now = Instant::now();
        let mut budget = RecoveryBudget::default();
        budget.on_failure(true, now);
        budget.on_failure(true, now);
        assert_eq!(budget.on_failure(true, now), Action::Notify);
        assert_eq!(budget.on_failure(true, now + CRASH_WINDOW), Action::Reload);
    }
}
