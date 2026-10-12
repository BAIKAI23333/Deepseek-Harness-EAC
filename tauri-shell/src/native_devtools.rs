use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TargetInfo {
    target_id: String,
    browser_context_id: Option<String>,
    #[serde(rename = "type")]
    kind: String,
    url: String,
}

struct TrackedTools {
    inspected_target: String,
    context: String,
    tools_target: String,
}

fn is_tools_for(target: &TargetInfo, main: &TargetInfo) -> bool {
    target.kind == "page"
        && target.target_id != main.target_id
        && !target.target_id.is_empty()
        && main
            .browser_context_id
            .as_ref()
            .is_some_and(|id| !id.is_empty())
        && target.browser_context_id == main.browser_context_id
        && tauri::Url::parse(&target.url).is_ok_and(|url| {
            url.scheme() == "devtools"
                && url.host_str() == Some("devtools")
                && url.path().starts_with("/bundled/")
        })
}

fn tracked_target<'a>(
    tracked: &TrackedTools,
    main: &TargetInfo,
    targets: &'a [TargetInfo],
) -> Option<&'a TargetInfo> {
    if tracked.inspected_target != main.target_id
        || main.browser_context_id.as_deref() != Some(tracked.context.as_str())
    {
        return None;
    }
    targets
        .iter()
        .find(|target| target.target_id == tracked.tools_target && is_tools_for(target, main))
}

fn newly_opened(
    before: &[TargetInfo],
    after: &[TargetInfo],
    main: &TargetInfo,
) -> Result<Option<TargetInfo>, String> {
    if before.iter().any(|target| is_tools_for(target, main)) {
        return Err(
            "Existing developer tools cannot be safely associated; close them manually and retry"
                .into(),
        );
    }
    let mut added = after.iter().filter(|target| {
        is_tools_for(target, main) && !before.iter().any(|old| old.target_id == target.target_id)
    });
    let first = added.next().cloned();
    if added.next().is_some() {
        return Err("Developer tools target association is ambiguous".into());
    }
    Ok(first)
}

#[cfg(windows)]
async fn protocol(
    view: &tauri::Webview,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use std::sync::{Arc, Mutex};
    use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let method = method.to_owned();
    view.with_webview(move |view| {
        let completion_sender = sender.clone();
        let result = (|| unsafe {
            let core = view.controller().CoreWebView2()?;
            let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |status, response| {
                    let result = status.map_err(|e| e.to_string()).and_then(|_| {
                        serde_json::from_str::<serde_json::Value>(&response)
                            .map_err(|e| e.to_string())
                    });
                    if let Ok(mut guard) = completion_sender.lock() {
                        if let Some(sender) = guard.take() {
                            let _ = sender.send(result);
                        }
                    }
                    Ok(())
                },
            ));
            let method = CoTaskMemPWSTR::from(method.as_str());
            let params = params.to_string();
            let params = CoTaskMemPWSTR::from(params.as_str());
            core.CallDevToolsProtocolMethod(
                *method.as_ref().as_pcwstr(),
                *params.as_ref().as_pcwstr(),
                &callback,
            )
        })();
        if let Err(error) = result {
            if let Ok(mut guard) = sender.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(Err(error.to_string()));
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(2), receiver)
        .await
        .map_err(|_| "Native developer tools callback timed out".to_string())?
        .map_err(|_| "Native developer tools callback was lost".to_string())?
}

#[cfg(windows)]
async fn open(view: &tauri::Webview) -> Result<(), String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    view.with_webview(move |view| {
        let result = unsafe {
            view.controller()
                .CoreWebView2()
                .and_then(|core| core.OpenDevToolsWindow())
        }
        .map_err(|e| e.to_string());
        let _ = sender.send(result);
    })
    .map_err(|e| e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(2), receiver)
        .await
        .map_err(|_| "Native developer tools open timed out".to_string())?
        .map_err(|_| "Native developer tools open was lost".to_string())?
}

#[cfg(windows)]
async fn targets(view: &tauri::Webview) -> Result<Vec<TargetInfo>, String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Targets {
        target_infos: Vec<TargetInfo>,
    }
    let value = protocol(view, "Target.getTargets", serde_json::json!({})).await?;
    serde_json::from_value::<Targets>(value)
        .map(|value| value.target_infos)
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
pub(super) async fn toggle(app: &tauri::AppHandle) -> Result<(), String> {
    static STATE: std::sync::OnceLock<tokio::sync::Mutex<Option<TrackedTools>>> =
        std::sync::OnceLock::new();
    let operation = async {
        use tauri::Manager;
        let mut state = STATE
            .get_or_init(|| tokio::sync::Mutex::new(None))
            .lock()
            .await;
        let view = app
            .get_webview("main")
            .ok_or("Main WebView is unavailable")?;
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Current {
            target_info: TargetInfo,
        }
        let current: Current = serde_json::from_value(
            protocol(&view, "Target.getTargetInfo", serde_json::json!({})).await?,
        )
        .map_err(|e| e.to_string())?;
        let main = current.target_info;
        let context = main
            .browser_context_id
            .as_ref()
            .filter(|id| !id.is_empty())
            .ok_or("Main WebView context is unavailable")?
            .clone();
        if main.target_id.is_empty() {
            return Err("Main WebView target is unavailable".into());
        }
        let before = targets(&view).await?;
        if let Some(target) = state
            .as_ref()
            .and_then(|state| tracked_target(state, &main, &before))
        {
            let target_id = target.target_id.clone();
            let result = protocol(
                &view,
                "Target.closeTarget",
                serde_json::json!({"targetId":target_id}),
            )
            .await?;
            if result.get("success").and_then(serde_json::Value::as_bool) != Some(true) {
                return Err("Developer tools refused to close".into());
            }
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
            loop {
                if !targets(&view)
                    .await?
                    .iter()
                    .any(|target| target.target_id == target_id)
                {
                    *state = None;
                    return Ok(());
                }
                if tokio::time::Instant::now() >= deadline {
                    return Err("Developer tools target remained after close".into());
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }
        *state = None;
        open(&view).await?;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            if let Some(target) = newly_opened(&before, &targets(&view).await?, &main)? {
                // Only a target actually created by this main WebView open can be closed later.
                *state = Some(TrackedTools {
                    inspected_target: main.target_id.clone(),
                    context,
                    tools_target: target.target_id,
                });
                return Ok(());
            }
            if tokio::time::Instant::now() >= deadline {
                return Err("Existing developer tools cannot be safely associated; close them manually and retry".into());
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    };
    tokio::time::timeout(std::time::Duration::from_secs(8), operation)
        .await
        .map_err(|_| "Developer tools operation timed out".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn target(id: &str, context: &str, url: &str) -> TargetInfo {
        TargetInfo {
            target_id: id.into(),
            browser_context_id: Some(context.into()),
            kind: "page".into(),
            url: url.into(),
        }
    }
    fn main() -> TargetInfo {
        target("main", "own", "http://127.0.0.1:12345/")
    }
    fn tools(id: &str) -> TargetInfo {
        target(id, "own", "devtools://devtools/bundled/devtools_app.html")
    }
    fn tracked() -> TrackedTools {
        TrackedTools {
            inspected_target: "main".into(),
            context: "own".into(),
            tools_target: "tools".into(),
        }
    }
    #[test]
    fn close_uses_exact_tracked_target_when_other_tools_exist() {
        let all = vec![tools("other"), tools("tools")];
        assert_eq!(
            tracked_target(&tracked(), &main(), &all).unwrap().target_id,
            "tools"
        );
    }
    #[test]
    fn manual_close_does_not_reuse_old_target() {
        assert!(tracked_target(&tracked(), &main(), &[tools("reopened")]).is_none());
    }
    #[test]
    fn recreated_main_does_not_inherit_tools_ownership() {
        let mut current = main();
        current.target_id = "new-main".into();
        assert!(tracked_target(&tracked(), &current, &[tools("tools")]).is_none());
    }
    #[test]
    fn other_profile_and_non_tools_targets_cannot_be_closed() {
        for url in [
            "https://example.test/",
            "devtools://other/bundled/devtools_app.html",
        ] {
            assert!(!is_tools_for(&target("tools", "own", url), &main()));
        }
        assert!(!is_tools_for(
            &target(
                "tools",
                "other",
                "devtools://devtools/bundled/devtools_app.html"
            ),
            &main()
        ));
    }
    #[test]
    fn missing_context_cannot_associate_targets() {
        let mut current = main();
        current.browser_context_id = None;
        let mut tool = tools("tools");
        tool.browser_context_id = None;
        assert!(!is_tools_for(&tool, &current));
    }
    #[test]
    fn worker_or_main_target_is_never_tools() {
        let mut worker = tools("worker");
        worker.kind = "worker".into();
        assert!(!is_tools_for(&worker, &main()));
        let own = target(
            "main",
            "own",
            "devtools://devtools/bundled/devtools_app.html",
        );
        assert!(!is_tools_for(&own, &main()));
    }
    #[test]
    fn existing_untracked_tools_prevent_claiming_new_targets() {
        let before = vec![tools("other")];
        let after = vec![tools("other"), tools("new")];
        assert!(newly_opened(&before, &after, &main()).is_err());
    }
    #[test]
    fn existing_untracked_tools_are_not_claimed() {
        let before = vec![tools("tools")];
        assert!(newly_opened(&before, &before, &main()).is_err());
    }
    #[test]
    fn concurrent_new_tools_fail_association() {
        assert!(newly_opened(&[], &[tools("one"), tools("two")], &main()).is_err());
    }
    #[test]
    fn shared_context_guest_pages_do_not_block_main_tools() {
        let before = vec![main(), target("guest", "own", "about:blank")];
        let mut after = before.clone();
        after.push(tools("new"));
        assert_eq!(
            newly_opened(&before, &after, &main())
                .unwrap()
                .unwrap()
                .target_id,
            "new"
        );
    }
    #[test]
    fn other_context_webviews_do_not_block_main_tools() {
        let before = vec![
            main(),
            target("guest", "guest-context", "https://example.test/"),
        ];
        let mut after = before.clone();
        after.push(tools("new"));
        assert_eq!(
            newly_opened(&before, &after, &main())
                .unwrap()
                .unwrap()
                .target_id,
            "new"
        );
    }
}
