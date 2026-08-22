'use strict';
// DSH 桥探针（P2）：经回环 WS 与 sidecar JSON-RPC 通话的最小实现。
// P3 将按 preload.js 逐字节重建 window.dshDesktop 全量 API（bridge.ts）。
(function () {
  var WS_URL = window.__DSH_BRIDGE_WS__ || 'ws://127.0.0.1:19873/ws';
  var seq = 0;
  var pending = {};
  var ws = null;
  var hooks = [];

  function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = function () {
      document.title = document.title.replace(/^…/, '') ;
      call('shell.info', {}).then(function (info) {
        document.title = 'DSH Bridge OK · sidecar=' + (info && info.sidecar) + ' · node=' + (info && info.node);
        render(JSON.stringify(info, null, 2));
        hooks.forEach(function (h) { try { h(info); } catch (e) {} });
      }).catch(function (e) { render('bridge error: ' + e); });
    };
    ws.onmessage = function (ev) {
      var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id != null && pending[msg.id]) {
        var r = pending[msg.id]; delete pending[msg.id];
        if (msg.error) r.reject(new Error(msg.error.message || 'rpc error'));
        else r.resolve(msg.result);
      }
    };
    ws.onclose = function () { setTimeout(connect, 1500); };
  }

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      if (!ws || ws.readyState !== 1) { reject(new Error('ws not open')); return; }
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params || {} }));
    });
  }

  function render(text) {
    var el = document.getElementById('out');
    if (el) el.textContent = text;
  }
  window.addEventListener('DOMContentLoaded', function () { connect(); });

  // 最小桥面（P2 探针级；P3 逐字节全量）
  window.dshDesktop = {
    appVersion: '',
    getInfo: function () { return call('shell.info', {}); },
    _call: call,
    _onReady: function (fn) { hooks.push(fn); },
  };
})();
