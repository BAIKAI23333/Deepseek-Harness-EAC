/**
 * dsh-plugin-shield — browser half: the 插件保护中心 settings section.
 *
 *   - 状态卡：当前 profile、快照份数、最后良好快照时间
 *   - 快照：立即快照 / 列表（时间 · 原因 · 插件行数）/ 一键回滚
 *   - 健康检查：静态体检（模块遮蔽 / patch 行 / junction 归属 / 高危扫描）
 *     + 一键修复（只动插件与配置层，绝不碰内核与用户数据）
 *   - 事故报告：读取已有记录并标记解决；不据此推断启动健康
 *
 * All actions ride the window.dshDesktop.guard IPC bridge (desktop shell's
 * plugin-guard.js engine). Outside the desktop shell the section renders a
 * short note instead of half-broken controls.
 *
 * Hand-written ModuleLoader bundle — no build step required.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-shield",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require("react");
    var h = react.createElement;

    var CSS = ".__sh_root{max-width:640px;display:flex;flex-direction:column;gap:12px}" +
      ".__sh_hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);margin:0}" +
      ".__sh_cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}" +
      ".__sh_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-3)}" +
      ".__sh_cardk{font-size:11px;color:var(--dsw-alias-label-tertiary)}" +
      ".__sh_cardv{font-size:14px;font-weight:600;margin-top:2px;word-break:break-all}" +
      ".__sh_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}" +
      ".__sh_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}" +
      ".__sh_btn:disabled{opacity:.5;cursor:default}" +
      ".__sh_btnPrimary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-accent)}" +
      ".__sh_btnDanger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}" +
      ".__sh_actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
      ".__sh_list{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto}" +
      ".__sh_row{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-3);display:flex;gap:10px;align-items:center}" +
      ".__sh_rowmain{flex:1;min-width:0}" +
      ".__sh_rowtitle{font-size:13px;font-weight:600}" +
      ".__sh_rowsub{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:1px;word-break:break-all}" +
      ".__sh_ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}" +
      ".__sh_err{font-size:12px;color:var(--dsw-alias-state-error-primary)}" +
      ".__sh_warn{font-size:12px;color:#e6a23c}" +
      ".__sh_finding{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 10px;background:var(--dsw-alias-bg-layer-3);font-size:12px;line-height:18px}" +
      ".__sh_fcode{font-family:var(--dsw-alias-font-mono,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary)}" +
      ".__sh_pre{white-space:pre-wrap;font-family:var(--dsw-alias-font-mono,monospace);font-size:11px;line-height:1.5;max-height:260px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;background:var(--dsw-alias-bg-layer-2)}" +
      ".__sh_h3{font-size:13px;font-weight:600;margin:0}";
    var tagId = "dsh-plugin-shield/main.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-shield";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    var NS = "pluginShield";
    var zh = {
      nav: "插件保护",
      intro: "此页面提供插件配置的手动快照、静态检查、修复及已有事故报告。v6 不提供自动启动快照或插件启动失败自动修复；空列表不代表启动健康。手动回滚需明确确认，之后会停止并重启 Web 服务。",
      needDesktop: "插件保护中心需要 Deepseek Harness EAC 桌面端运行（此页面在浏览器/CLI 模式下只读展示）。",
      statProfile: "受保护 profile",
      statSnapshots: "快照份数",
      statLastGood: "最后良好快照",
      statIncidents: "待处理事故",
      none: "（无）",
      snapshotNow: "立即快照",
      check: "运行健康检查",
      repair: "一键修复",
      refresh: "刷新",
      snapshotsTitle: "快照",
      snapshotDone: "已创建快照",
      restore: "回滚到此快照",
      restoreConfirm: "将中断当前任务，停止 Web 服务，恢复 package.json、pnpm-lock.yaml、pnpm-workspace.yaml、cordis.patch.yml 并重启。不还原插件包、会话或 Skill。页面将重新载入，可重新打开本页查看结果。",
      restoreRunning: "服务正在运行，当前界面不能执行回滚；本次未改动配置。",
      restored: "配置已回滚，Web 服务已重新启动",
      confirmRestore: "确认回滚并重启",
      cancelRestore: "取消",
      restoreResult: "最近一次回滚",
      restoreRecovered: "回滚失败；原配置已恢复并重新启动。",
      restoreFailed: "回滚未完成，请检查错误与备份。",
      restorePending: "回滚进行中，请勿重复操作；完成后页面将重新载入。",
      restoreInterrupted: "上次回滚没有完成记录；配置状态未确认，请先检查备份。",
      restoreCancelled: "回滚因应用退出而取消。",
      backup: "操作前备份",
      findingsTitle: "体检发现",
      findingsClean: "本次静态检查未发现模块遮蔽 / patch 行 / junction 归属 / 高危扫描问题；不涵盖插件运行或全部安全风险。",
      fixable: "可修复",
      manual: "需人工处理",
      repaired: "已应用修复",
      repairedNone: "没有可自动修复的项",
      incidentsTitle: "事故报告",
      incidentsEmpty: "（暂无未解决事故报告；不代表已验证启动健康）",
      view: "查看",
      resolve: "标记解决",
      close: "关闭",
      busy: "处理中…",
      actionFailed: "操作失败：",
      invalidResponse: "保护中心返回了不完整的结果",
      reason: "原因",
      pluginRows: "插件行",
      files: "文件"
    };
    var en = {
      nav: "Plugin Guard",
      intro: "This page provides manual plugin-configuration snapshots, static checks, repairs and existing incident reports. v6 does not provide automatic boot snapshots or automatic repair of plugin boot failures. Empty lists do not establish boot health. Manual rollback requires confirmation and stops/restarts the web service.",
      needDesktop: "The guard center needs the Deepseek Harness EAC desktop shell (read-only outside it).",
      statProfile: "protected profile",
      statSnapshots: "snapshots",
      statLastGood: "last good boot",
      statIncidents: "open incidents",
      none: "(none)",
      snapshotNow: "Snapshot now",
      check: "Run health check",
      repair: "Repair",
      refresh: "Refresh",
      snapshotsTitle: "Snapshots",
      snapshotDone: "Snapshot created",
      restore: "Roll back here",
      restoreConfirm: "This interrupts active tasks, stops the web service, restores package.json, pnpm-lock.yaml, pnpm-workspace.yaml and cordis.patch.yml, then restarts. Plugin binaries, sessions and skills are not restored. The page reloads; reopen this panel for the result.",
      restoreRunning: "The web service is running, so rollback is unavailable from this page. No configuration was changed.",
      restored: "Configuration restored and web service restarted",
      confirmRestore: "Confirm rollback and restart",
      cancelRestore: "Cancel",
      restoreResult: "Latest rollback",
      restoreRecovered: "Rollback failed; the original configuration was restored and restarted.",
      restoreFailed: "Rollback did not complete. Check the error and backup.",
      restorePending: "Rollback is running. Do not repeat it; the page will reload.",
      restoreInterrupted: "The last rollback has no completion record. Configuration is unconfirmed; inspect the backup first.",
      restoreCancelled: "Rollback was cancelled because the application exited.",
      backup: "Pre-operation backup",
      findingsTitle: "Findings",
      findingsClean: "This static check found no module-shadowing / patch-row / junction-ownership / threat-scan issues. It does not verify plugin execution or all security risks.",
      fixable: "fixable",
      manual: "manual",
      repaired: "Repairs applied",
      repairedNone: "Nothing auto-repairable",
      incidentsTitle: "Incidents",
      incidentsEmpty: "(no open incident reports; boot health has not been established)",
      view: "View",
      resolve: "Resolve",
      close: "Close",
      busy: "Working…",
      actionFailed: "Operation failed: ",
      invalidResponse: "The guard center returned an incomplete result",
      reason: "reason",
      pluginRows: "plugin rows",
      files: "files"
    };

    var inject = ["slots", "locale"];

    function fmtTime(iso) {
      try {
        var d = new Date(iso);
        return d.toLocaleString(undefined, { hour12: false });
      } catch (e) {
        return String(iso || "");
      }
    }

    function ShieldSection(props) {
      var t = props.t;
      var bridge = (typeof window !== "undefined" && window.dshDesktop && window.dshDesktop.guard) || null;

      var state = react.useState({ status: "loading" });
      var data = state[0];
      var setData = state[1];
      var busyState = react.useState(null);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var reportState = react.useState(null);
      var report = reportState[0];
      var setReport = reportState[1];
      var incidentState = react.useState(null);
      var incident = incidentState[0];
      var setIncident = incidentState[1];
      var errorState = react.useState(null);
      var error = errorState[0];
      var setError = errorState[1];

      var confirmationState = react.useState(null);
      var confirmation = confirmationState[0];
      var setConfirmation = confirmationState[1];
      var restoreState = react.useState(null);
      var restoreOutcome = restoreState[0];
      var setRestoreOutcome = restoreState[1];

      var call = function (action, value) {
        if (!bridge) return Promise.resolve({ ok: false, error: "no-bridge" });
        return bridge.action(action, value);
      };

      var load = react.useCallback(function () {
        if (!bridge) { setData({ status: "no-bridge" }); return; }
        setError(null);
        setRestoreOutcome(null);
        setData({ status: "loading" });
        call("status").then(function (r) {
          if (r && r.ok) setData({ status: "ready", profile: r.profile, snapshots: r.snapshots || [], incidents: r.incidents || [], lastGood: r.lastGood || null, lastRestore: r.lastRestore || null, restoreInProgress: r.restoreInProgress === true });
          else setData({ status: "error", error: (r && r.error) || "failed" });
        }).catch(function (e) { setData({ status: "error", error: String(e) }); });
      }, [bridge]);
      react.useEffect(load, [load]);

      if (data.status === "loading") return h("div", { className: "__sh_root" }, h("p", { className: "__sh_hint" }, "…"));
      if (data.status === "no-bridge") {
        return h("div", { className: "__sh_root" },
          h("p", { className: "__sh_hint" }, t("needDesktop")));
      }
      if (data.status === "error") {
        return h("div", { className: "__sh_root" }, h("p", { className: "__sh_err" }, String(data.error)));
      }

      var perform = function (action, value, done, busyKey) {
        setBusy(busyKey || action);
        setError(null);
        return Promise.resolve().then(function () { return call(action, value); }).then(function (r) {
          if (action === "restore" && r && ["succeeded", "failed", "cancelled", "pending"].indexOf(r.phase) >= 0) setRestoreOutcome(r);
          if (!r || r.ok !== true) throw new Error(r && r.error === "service-running" ? t("restoreRunning") : (r && r.error) || t("invalidResponse"));
          done(r);
        }).catch(function (e) {
          setError(t("actionFailed") + String((e && e.message) || e));
        }).finally(function () { setBusy(null); });
      };
      var doSnapshot = function () {
        perform("snapshot", "manual", function (r) {
          if (!r.snapshot || typeof r.snapshot.id !== "string" || !r.snapshot.id) throw new Error(t("invalidResponse"));
          load();
        });
      };
      var doCheck = function () {
        setReport(null);
        perform("check", undefined, function (r) {
          if (!r.report || !Array.isArray(r.report.findings)) throw new Error(t("invalidResponse"));
          setReport(r.report);
        });
      };
      var doRepair = function () {
        setReport(null);
        perform("repair", undefined, function (r) {
          if (!Array.isArray(r.applied)) throw new Error(t("invalidResponse"));
          setReport({ repaired: r.applied, at: new Date().toISOString() });
        });
      };
      var doRestore = function (id) {
        setConfirmation({ id: id });
        setError(null);
      };
      var confirmRestore = function () {
        if (!confirmation || busy || data.restoreInProgress) return;
        var id = confirmation.id;
        setConfirmation(null);
        setReport(null);
        perform("restore", id, function (r) {
          if (r.phase !== "succeeded" || r.code !== "restore-succeeded") throw new Error(t("invalidResponse"));
        }, "restore:" + id);
      };
      var openIncident = function (id) {
        perform("incident", id, function (r) {
          if (typeof r.content !== "string") throw new Error(t("invalidResponse"));
          setIncident({ id: id, content: r.content });
        }, "incident:" + id);
      };
      var resolveIncident = function (id) {
        perform("resolve-incident", id, function () { setIncident(null); load(); }, "resolve:" + id);
      };

      var locked = !!busy || !!confirmation || data.restoreInProgress;
      var latestRestore = restoreOutcome || data.lastRestore;
      var findings = report && report.findings ? report.findings : null;
      var repairedList = report && report.repaired ? report.repaired : null;

      return h("div", { className: "__sh_root" },
        h("p", { className: "__sh_hint", style: { margin: 0 } }, t("intro")),
        h("div", { className: "__sh_cards" },
          h("div", { className: "__sh_card" }, h("div", { className: "__sh_cardk" }, t("statProfile")), h("div", { className: "__sh_cardv" }, data.profile || "—")),
          h("div", { className: "__sh_card" }, h("div", { className: "__sh_cardk" }, t("statSnapshots")), h("div", { className: "__sh_cardv" }, String(data.snapshots.length))),
          h("div", { className: "__sh_card" }, h("div", { className: "__sh_cardk" }, t("statLastGood")), h("div", { className: "__sh_cardv" }, data.lastGood ? fmtTime(data.lastGood.at) : t("none"))),
          h("div", { className: "__sh_card" }, h("div", { className: "__sh_cardk" }, t("statIncidents")), h("div", { className: "__sh_cardv" }, String(data.incidents.length)))
        ),
        h("div", { className: "__sh_actions" },
          h("button", { className: "__sh_btn __sh_btnPrimary", disabled: locked, onClick: doSnapshot }, busy === "snapshot" ? t("busy") : t("snapshotNow")),
          h("button", { className: "__sh_btn", disabled: locked, onClick: doCheck }, busy === "check" ? t("busy") : t("check")),
          h("button", { className: "__sh_btn", disabled: locked, onClick: doRepair }, busy === "repair" ? t("busy") : t("repair")),
          h("button", { className: "__sh_btn", disabled: locked, onClick: load }, t("refresh"))
        ),

        error ? h("p", { className: "__sh_err", role: "alert" }, error) : null,
        confirmation ? h("div", { className: "__sh_finding", role: "alertdialog", "aria-label": t("confirmRestore") },
          h("p", null, t("restoreConfirm")),
          h("p", { className: "__sh_fcode" }, confirmation.id),
          h("div", { className: "__sh_actions" },
            h("button", { className: "__sh_btn __sh_btnDanger", disabled: !!busy || data.restoreInProgress, onClick: confirmRestore }, t("confirmRestore")),
            h("button", { className: "__sh_btn", disabled: !!busy, onClick: function () { setConfirmation(null); } }, t("cancelRestore"))
          )
        ) : null,
        busy && busy.indexOf("restore:") === 0 ? h("p", { className: "__sh_hint", role: "status" }, t("restorePending")) : null,
        latestRestore ? h("div", { className: "__sh_finding", role: latestRestore.phase === "failed" ? "alert" : "status" },
          h("h3", { className: "__sh_h3" }, t("restoreResult")),
          h("p", { className: latestRestore.phase === "failed" ? "__sh_err" : "__sh_hint" },
            latestRestore.phase === "succeeded" ? t("restored") :
            latestRestore.phase === "cancelled" ? t("restoreCancelled") :
            latestRestore.phase === "pending" ? t(data.restoreInProgress ? "restorePending" : "restoreInterrupted") :
            latestRestore.recovered === true ? t("restoreRecovered") : t("restoreFailed")),
          h("p", { className: "__sh_fcode" }, fmtTime(latestRestore.at) + " · " + latestRestore.code),
          latestRestore.backupId ? h("p", { className: "__sh_fcode" }, t("backup") + ": " + latestRestore.backupId) : null
        ) : null,
        findings ? h("div", null,
          h("h3", { className: "__sh_h3" }, t("findingsTitle")),
          findings.length === 0 ? h("p", { className: "__sh_ok" }, t("findingsClean")) :
            findings.map(function (f, i) {
              return h("div", { className: "__sh_finding", key: String(i) },
                h("span", { className: f.severity === "high" ? "__sh_err" : "__sh_warn" },
                  "[" + f.severity + "] " + (f.fixable ? t("fixable") : t("manual")) + " · "),
                h("span", { className: "__sh_fcode" }, f.code),
                h("div", null, f.message)
              );
            })
        ) : null,
        repairedList ? h("div", null,
          repairedList.length ? h("p", { className: "__sh_ok" }, t("repaired") + "：") : h("p", { className: "__sh_ok" }, t("repairedNone")),
          repairedList.length ? h("ul", { className: "__sh_hint" }, repairedList.map(function (a, i) { return h("li", { key: String(i) }, a); })) : null
        ) : null,

        h("div", null,
          h("h3", { className: "__sh_h3" }, t("snapshotsTitle")),
          data.snapshots.length === 0 ? h("p", { className: "__sh_hint" }, t("none")) :
            h("div", { className: "__sh_list" }, data.snapshots.map(function (s) {
              return h("div", { className: "__sh_row", key: s.id },
                h("div", { className: "__sh_rowmain" },
                  h("div", { className: "__sh_rowtitle" }, fmtTime(s.at)),
                  h("div", { className: "__sh_rowsub" }, t("reason") + "：" + (s.reason || "manual") + " · " + t("pluginRows") + " " + String((s.pluginRows || []).length) + " · " + t("files") + " " + String((s.files || []).length))
                ),
                h("button", {
                  className: "__sh_btn __sh_btnDanger",
                  disabled: locked,
                  onClick: function () { doRestore(s.id); }
                }, busy === "restore:" + s.id ? t("busy") : t("restore"))
              );
            }))
        ),

        h("div", null,
          h("h3", { className: "__sh_h3" }, t("incidentsTitle")),
          data.incidents.length === 0 ? h("p", { className: "__sh_hint" }, t("incidentsEmpty")) :
            h("div", { className: "__sh_list" }, data.incidents.map(function (it) {
              return h("div", { className: "__sh_row", key: it.id },
                h("div", { className: "__sh_rowmain" },
                  h("div", { className: "__sh_rowtitle" }, it.title),
                  incident && incident.id === it.id
                    ? h("div", { style: { marginTop: 6 } },
                        h("pre", { className: "__sh_pre" }, incident.content),
                        h("div", { className: "__sh_actions", style: { marginTop: 6 } },
                          h("button", { className: "__sh_btn", onClick: function () { setIncident(null); } }, t("close")),
                          h("button", { className: "__sh_btn", disabled: locked, onClick: function () { resolveIncident(it.id); } }, busy === "resolve:" + it.id ? t("busy") : t("resolve"))
                        )
                      )
                    : null
                ),
                incident && incident.id === it.id ? null : h("button", {
                  className: "__sh_btn",
                  disabled: locked,
                  onClick: function () { openIncident(it.id); }
                }, busy === "incident:" + it.id ? t("busy") : t("view"))
              );
            }))
        )
      );
    }

    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-plugin-shield: dictionaries");
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "plugin-shield",
          order: 23,
          label: function () { return t("nav"); },
          locale: NS
        }, function (props) {
          return h(ShieldSection, props);
        });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
