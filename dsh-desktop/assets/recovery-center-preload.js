/**
 * assets/recovery-center-preload.js — 恢复中心窗口的 Tauri init script。
 *
 * 重构版为 Electron contextBridge；本地 Tauri 架构下该脚本由 Rust 壳作为
 * 恢复中心窗口的 initialization_script 注入（见 main.rs open_recovery_center），
 * 走既有 WS JSON-RPC 桥（127.0.0.1:19873，与 bridge.js 同协议）调用 sidecar
 * 的 `rc.action` / `rc.close` 方法。只暴露白名单动作，不透出底层 socket。
 * 独立于主窗 bridge.js（恢复中心不依赖 Web UI，见 vnext 架构文档 §3.4）。
 */
'use strict';
(function () {
  var WS_URL = (typeof window !== 'undefined' && window.__DSH_BRIDGE_WS__) || 'ws://127.0.0.1:19873/ws';
  var seq = 0;
  var pending = {};
  var ws = null;
  var wsReady = false;
  var queue = [];

  function rawSend(obj) {
    try {
      if (ws) ws.send(JSON.stringify(obj));
    } catch (e) { /* 断线由重连兜底 */ }
  }

  // invoke 语义：Promise + 超时。
  function call(method, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      if (!wsReady) {
        queue.push({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
      } else {
        rawSend({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
      }
      setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          reject(new Error('recovery-center bridge call timeout: ' + method));
        }
      }, timeoutMs || 60000);
    });
  }

  function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = function () {
      wsReady = true;
      while (queue.length) rawSend(queue.shift());
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id != null && pending[msg.id]) {
        var r = pending[msg.id];
        delete pending[msg.id];
        if (msg.error) r.reject(new Error(msg.error.message || 'rpc error'));
        else r.resolve(msg.result);
      }
    };
    ws.onclose = function () {
      wsReady = false;
      setTimeout(connect, 1500);
    };
    ws.onerror = function () {
      try { if (ws) ws.close(); } catch (e) { /* 重连由 onclose 驱动 */ }
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function () { connect(); });
    // 恢复中心页面只消费这两个方法（assets/recovery-center.html）。
    window.rc = {
      /** 统一动作入口：{ action, value } → 结果对象。 */
      action: function (action, value) { return call('rc.action', { action: action, value: value }); },
      /** 窗口自关闭（sidecar rc.close → Rust 关窗）。 */
      close: function () { return call('rc.close', {}); },
    };
  }
})();
