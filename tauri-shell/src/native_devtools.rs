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

fn associated_target<'a>(
    main: &TargetInfo,
    target_id: Option<&str>,
    targets: &'a [TargetInfo],
) -> Result<Option<&'a TargetInfo>, String> {
    let Some(target_id) = target_id else {
        return Ok(None);
    };
    let target = targets
        .iter()
        .find(|target| target.target_id == target_id)
        .filter(|target| is_tools_for(target, main))
        .ok_or("Native developer tools association is invalid or no longer available")?;
    Ok(Some(target))
}

fn parse_protocol_response(
    status: Result<(), String>,
    response: &str,
) -> Result<serde_json::Value, String> {
    let parsed = serde_json::from_str::<serde_json::Value>(response);
    let detail = |value: &serde_json::Value| {
        let error = value.get("error").unwrap_or(value);
        error
            .get("message")
            .and_then(serde_json::Value::as_str)
            .map(|message| {
                format!(
                    "{message} (protocol code {:?})",
                    error.get("code").and_then(serde_json::Value::as_i64)
                )
            })
    };
    match status {
        Err(error) => Err(parsed
            .as_ref()
            .ok()
            .and_then(detail)
            .map(|message| format!("{error}: {message}"))
            .unwrap_or(error)),
        Ok(()) => {
            let value = parsed.map_err(|error| error.to_string())?;
            if value.get("error").is_some() {
                return Err(detail(&value)
                    .unwrap_or_else(|| "Native developer tools protocol failed".into()));
            }
            Ok(value)
        }
    }
}

#[cfg(windows)]
async fn protocol(
    view: &tauri::Webview,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    protocol_session(view, None, method, params).await
}

#[cfg(windows)]
async fn protocol_session(
    view: &tauri::Webview,
    session: Option<&str>,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    use std::sync::{Arc, Mutex};
    use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let method = method.to_owned();
    let session = session.map(str::to_owned);
    view.with_webview(move |view| {
        let completion_sender = sender.clone();
        let result = (|| unsafe {
            let core = view.controller().CoreWebView2()?;
            let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |status, response| {
                    let result =
                        parse_protocol_response(status.map_err(|e| e.to_string()), &response);
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
            if let Some(session) = session {
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_11;
                use windows_core::Interface;
                let extended = core.cast::<ICoreWebView2_11>()?;
                let session = CoTaskMemPWSTR::from(session.as_str());
                extended.CallDevToolsProtocolMethodForSession(
                    *session.as_ref().as_pcwstr(),
                    *method.as_ref().as_pcwstr(),
                    *params.as_ref().as_pcwstr(),
                    &callback,
                )
            } else {
                core.CallDevToolsProtocolMethod(
                    *method.as_ref().as_pcwstr(),
                    *params.as_ref().as_pcwstr(),
                    &callback,
                )
            }
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
async fn main_target(view: &tauri::Webview) -> Result<TargetInfo, String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Current {
        target_info: TargetInfo,
    }
    let current: Current = serde_json::from_value(
        protocol(view, "Target.getTargetInfo", serde_json::json!({})).await?,
    )
    .map_err(|error| error.to_string())?;
    let main = current.target_info;
    if main.target_id.is_empty()
        || main.kind != "page"
        || !main
            .browser_context_id
            .as_ref()
            .is_some_and(|id| !id.is_empty())
    {
        return Err("Main WebView target or context is unavailable".into());
    }
    Ok(main)
}

#[cfg(windows)]
struct ToolsSession {
    view: tauri::Webview,
    id: String,
}

#[cfg(windows)]
impl Drop for ToolsSession {
    fn drop(&mut self) {
        let id = self.id.clone();
        // Dropping a reply or a timed-out operation must also detach its private session.
        let result = self.view.with_webview(move |view| {
            use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};
            let result = (|| unsafe {
                let core = view.controller().CoreWebView2()?;
                let method = CoTaskMemPWSTR::from("Target.detachFromTarget");
                let params = serde_json::json!({"sessionId": id}).to_string();
                let params = CoTaskMemPWSTR::from(params.as_str());
                let callback =
                    CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|status, _| {
                        if let Err(error) = status {
                            eprintln!("[shell] developer tools session detach failed: {error}");
                        }
                        Ok(())
                    }));
                core.CallDevToolsProtocolMethod(
                    *method.as_ref().as_pcwstr(),
                    *params.as_ref().as_pcwstr(),
                    &callback,
                )
            })();
            if let Err(error) = result {
                eprintln!("[shell] developer tools session detach failed: {error}");
            }
        });
        if let Err(error) = result {
            eprintln!("[shell] developer tools session detach dispatch failed: {error}");
        }
    }
}

#[cfg(windows)]
async fn attach_tools(view: &tauri::Webview, target_id: &str) -> Result<ToolsSession, String> {
    use std::sync::{Arc, Mutex};
    use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let target_id = target_id.to_owned();
    let session_view = view.clone();
    view.with_webview(move |view| {
        let completion_sender = sender.clone();
        let result = (|| unsafe {
            let core = view.controller().CoreWebView2()?;
            let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |status, response| {
                    let result = parse_protocol_response(
                        status.map_err(|error| error.to_string()),
                        &response,
                    )
                    .and_then(|value| {
                        value
                            .get("sessionId")
                            .and_then(serde_json::Value::as_str)
                            .filter(|id| !id.is_empty())
                            .map(str::to_owned)
                            .ok_or_else(|| {
                                "Native developer tools session is unavailable".to_string()
                            })
                    })
                    .map(|id| ToolsSession {
                        view: session_view.clone(),
                        id,
                    });
                    if let Ok(mut guard) = completion_sender.lock() {
                        if let Some(sender) = guard.take() {
                            let _ = sender.send(result);
                        }
                    }
                    Ok(())
                },
            ));
            let method = CoTaskMemPWSTR::from("Target.attachToTarget");
            let params = serde_json::json!({"targetId":target_id,"flatten":true}).to_string();
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
    .map_err(|error| error.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(2), receiver)
        .await
        .map_err(|_| "Native developer tools attach timed out".to_string())?
        .map_err(|_| "Native developer tools attach callback was lost".to_string())?
}

fn inspected_target(value: &serde_json::Value) -> Result<Option<String>, String> {
    if value.get("exceptionDetails").is_some() {
        return Err("Native developer tools inspected target API is unavailable".into());
    }
    let result = value
        .get("result")
        .ok_or("Native developer tools inspected target response is invalid")?;
    match result.get("type").and_then(serde_json::Value::as_str) {
        Some("undefined") => Ok(None),
        Some("string") => result
            .get("value")
            .and_then(serde_json::Value::as_str)
            .filter(|id| !id.is_empty())
            .map(|id| Some(id.to_owned()))
            .ok_or_else(|| "Native developer tools inspected target ID is invalid".into()),
        _ => Err("Native developer tools inspected target response is invalid".into()),
    }
}

#[cfg(windows)]
async fn tools_for(view: &tauri::Webview, main: &TargetInfo) -> Result<Option<TargetInfo>, String> {
    let all = targets(view).await?;
    let mut associated = None;
    for tool in all.iter().filter(|tool| is_tools_for(tool, main)) {
        let session = attach_tools(view, &tool.target_id).await?;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        let inspected = loop {
            // WebView2 forbids browser-only getDevToolsTarget; ask the tool's own inspected-page manager.
            let value = protocol_session(view, Some(&session.id), "Runtime.evaluate", serde_json::json!({
                "expression":"(async()=>{const sdk=await import('/bundled/core/sdk/sdk.js');return sdk.TargetManager.TargetManager.instance().primaryPageTarget()?.id()})()",
                "awaitPromise":true,"returnByValue":true
            })).await?;
            if let Some(id) = inspected_target(&value)? {
                break id;
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(
                    "Native developer tools is still initializing; retry the operation".into(),
                );
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        };
        if inspected == main.target_id {
            if associated.is_some() {
                return Err("Native developer tools association is ambiguous".into());
            }
            associated = associated_target(main, Some(&tool.target_id), &all)?.cloned();
        }
    }
    Ok(associated)
}

#[cfg(windows)]
pub(super) async fn toggle(app: &tauri::AppHandle) -> Result<(), String> {
    static OPERATION: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();
    let operation = async {
        use tauri::Manager;
        let _guard = OPERATION
            .get_or_init(|| tokio::sync::Mutex::new(()))
            .lock()
            .await;
        let view = app
            .get_webview("main")
            .ok_or("Main WebView is unavailable")?;
        let main = main_target(&view).await?;
        if let Some(target) = tools_for(&view, &main).await? {
            let current = main_target(&view).await?;
            if current.target_id != main.target_id
                || current.browser_context_id != main.browser_context_id
            {
                return Err("Main WebView changed during developer tools operation".into());
            }
            if tools_for(&view, &current)
                .await?
                .as_ref()
                .map(|tools| &tools.target_id)
                != Some(&target.target_id)
            {
                return Err("Native developer tools association changed during close".into());
            }
            let target_id = target.target_id;
            let result = protocol(
                &view,
                "Target.closeTarget",
                serde_json::json!({"targetId": target_id}),
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
                    return Ok(());
                }
                if tokio::time::Instant::now() >= deadline {
                    return Err("Developer tools target remained after close".into());
                }
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }
        open(&view).await?;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
        loop {
            if tools_for(&view, &main).await?.is_some() {
                return Ok(());
            }
            if tokio::time::Instant::now() >= deadline {
                return Err("Main developer tools association was not observed after open".into());
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
    #[test]
    fn native_hresult_retains_protocol_error_detail_without_raw_response() {
        let error = parse_protocol_response(
            Err("HRESULT".into()),
            r#"{"code":-32601,"message":"Method not found","private":"hidden"}"#,
        )
        .unwrap_err();
        assert!(error.contains("Method not found"));
        assert!(error.contains("-32601"));
        assert!(!error.contains("hidden"));
    }
    #[test]
    fn malformed_native_error_response_preserves_hresult() {
        assert_eq!(
            parse_protocol_response(Err("HRESULT".into()), "not-json").unwrap_err(),
            "HRESULT"
        );
        assert!(parse_protocol_response(
            Ok(()),
            r#"{"error":{"code":-32601,"message":"Method not found"}}"#
        )
        .is_err());
    }
    #[test]
    fn uninitialized_frontend_is_pending_instead_of_main_tools_absent() {
        assert_eq!(
            inspected_target(&serde_json::json!({"result":{"type":"undefined"}})).unwrap(),
            None
        );
        assert_eq!(
            inspected_target(&serde_json::json!({"result":{"type":"string","value":"main"}}))
                .unwrap(),
            Some("main".into())
        );
    }
    #[test]
    fn unsupported_frontend_and_invalid_ids_fail_closed() {
        for value in [
            serde_json::json!({"exceptionDetails":{}}),
            serde_json::json!({}),
            serde_json::json!({"result":{"type":"string","value":""}}),
            serde_json::json!({"result":{"type":"number","value":1}}),
        ] {
            assert!(inspected_target(&value).is_err());
        }
    }
    #[test]
    fn precise_association_identifies_existing_untracked_main_tools() {
        let all = vec![tools("existing")];
        assert_eq!(
            associated_target(&main(), Some("existing"), &all)
                .unwrap()
                .unwrap()
                .target_id,
            "existing"
        );
    }
    #[test]
    fn same_context_other_tools_do_not_override_precise_association() {
        let all = vec![tools("guest"), tools("main-tools"), tools("external")];
        assert_eq!(
            associated_target(&main(), Some("main-tools"), &all)
                .unwrap()
                .unwrap()
                .target_id,
            "main-tools"
        );
    }
    #[test]
    fn other_tools_do_not_mean_main_tools_are_open() {
        assert!(associated_target(&main(), None, &[tools("guest")])
            .unwrap()
            .is_none());
    }
    #[test]
    fn closed_tools_are_not_replaced_by_a_different_existing_target() {
        assert!(associated_target(&main(), Some("old"), &[tools("reopened")]).is_err());
    }
    #[test]
    fn reused_discovery_order_does_not_select_an_unassociated_tool() {
        let all = vec![tools("concurrent-first"), tools("associated-second")];
        assert_eq!(
            associated_target(&main(), Some("associated-second"), &all)
                .unwrap()
                .unwrap()
                .target_id,
            "associated-second"
        );
    }
    #[test]
    fn invalid_or_empty_associated_id_is_rejected() {
        assert!(associated_target(&main(), Some("missing"), &[tools("valid")]).is_err());
        assert!(associated_target(&main(), Some(""), &[tools("")]).is_err());
    }
    #[test]
    fn other_profile_and_non_tools_targets_are_rejected() {
        for url in [
            "https://example.test/",
            "devtools://other/bundled/devtools_app.html",
        ] {
            assert!(
                associated_target(&main(), Some("tools"), &[target("tools", "own", url)]).is_err()
            );
        }
        assert!(associated_target(
            &main(),
            Some("tools"),
            &[target(
                "tools",
                "other",
                "devtools://devtools/bundled/devtools_app.html"
            )]
        )
        .is_err());
    }
    #[test]
    fn missing_context_cannot_associate_targets() {
        let mut current = main();
        current.browser_context_id = None;
        let mut tool = tools("tools");
        tool.browser_context_id = None;
        assert!(associated_target(&current, Some("tools"), &[tool]).is_err());
    }
    #[test]
    fn worker_and_main_targets_are_rejected() {
        let mut worker = tools("worker");
        worker.kind = "worker".into();
        assert!(associated_target(&main(), Some("worker"), &[worker]).is_err());
        let own = target(
            "main",
            "own",
            "devtools://devtools/bundled/devtools_app.html",
        );
        assert!(associated_target(&main(), Some("main"), &[own]).is_err());
    }
    #[test]
    fn shared_context_guest_pages_do_not_block_main_tools() {
        let all = vec![
            main(),
            target("guest", "own", "about:blank"),
            tools("main-tools"),
        ];
        assert_eq!(
            associated_target(&main(), Some("main-tools"), &all)
                .unwrap()
                .unwrap()
                .target_id,
            "main-tools"
        );
    }
    #[test]
    fn recreated_main_context_cannot_inherit_old_tools() {
        let current = target("new-main", "new-context", "http://127.0.0.1:12345/");
        assert!(associated_target(&current, Some("old-tools"), &[tools("old-tools")]).is_err());
    }
}
