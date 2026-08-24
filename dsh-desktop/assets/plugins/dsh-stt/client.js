/**
 * dsh-stt — 语音识别（仅 STT）client 半区。
 *
 * 对齐 SPEECH_DESIGN.md「采集与识别分离」：浏览器负责「何时录 + 是否理」，
 * 服务端只负责「说了什么」。多轮语音交互：
 *   · 点按切换待机：点麦克风 = 打开监听（清晰开关），再点 = 关闭
 *   · 唤醒词激活：待机时说唤醒词 → 激活（armed）
 *   · 激活后说内容 → 填输入框；说「发送」→ 直接发送
 *   · 一句结束自动取消激活（回待机）；提交后重新激活窗口（模型处理后可继续说）
 *   · 深度审批响应：模型返回选择/确认时，语音说「允许/是」或「拒绝/取消」直接响应
 *
 * 纯逻辑（VAD/唤醒匹配/过滤/合并/发送词/审批意图/门控）与 src/voice-logic.mjs
 * 同步，单测覆盖 voice-logic.mjs；此处内联同一实现。
 *
 * Hand-written ModuleLoader bundle — no build step.
 */

window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-stt",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");
    var h = react.createElement;

    var NS = "dsh-stt";
    var inject = ["slots", "locale", "settingsScope"];

    var zh = {
      nav: "语音识别",
      intro: "语音识别：点麦克风打开监听，说唤醒词后说话，识别文本填输入框；说「发送」直接发送。",
      micOn: "麦克风待机中，说唤醒词激活",
      micOff: "点击打开语音",
      micArmed: "已激活，请说话",
      micRecording: "录音中…",
      micRecognizing: "识别中…",
      micApproval: "等待审批，说「允许」或「拒绝」",
      micSent: "已发送",
      wakeWords: "唤醒词",
      wakeWordsHint: "逗号分隔。待机时说任一唤醒词激活",
      model: "识别模型",
      modelReady: "已就绪",
      modelMissing: "未下载",
      modelDownloading: "下载中",
      modelError: "下载失败",
      downloadModels: "下载模型",
      statusStandby: "待机",
      statusArmed: "已激活",
      modelNeeded: "模型未就绪，请先在设置中下载",
      micDenied: "无法访问麦克风，请在系统设置中允许",
      micTimeout: "麦克风无响应，请重试",
      noSpeak: "没听清，请重说",
      saveFailed: "保存失败",
      enabled: "开启",
      disabled: "关闭",
      approved: "已允许",
      rejected: "已拒绝",
    };
    var en = {
      nav: "Speech to Text",
      intro: "Click mic to listen. Say a wake word, then speak. Text is inserted; say 'send' to send.",
      micOn: "Listening… say the wake word",
      micOff: "Click to turn on voice",
      micArmed: "Armed, speak now",
      micRecording: "Recording…",
      micRecognizing: "Recognizing…",
      micApproval: "Approval pending — say allow or reject",
      micSent: "Sent",
      wakeWords: "Wake words",
      wakeWordsHint: "Comma-separated. Any match arms listening.",
      model: "Model",
      modelReady: "Ready",
      modelMissing: "Not downloaded",
      modelDownloading: "Downloading",
      modelError: "Download failed",
      downloadModels: "Download model",
      statusStandby: "Standby",
      statusArmed: "Armed",
      modelNeeded: "Model not ready — download it in settings first",
      micDenied: "Microphone access denied",
      micTimeout: "Microphone timed out, retry",
      noSpeak: "Could not hear clearly, please repeat",
      saveFailed: "Failed to save",
      enabled: "On",
      disabled: "Off",
      approved: "Approved",
      rejected: "Rejected",
    };

    // ── CSS（theme tokens）──────────────────────────────────
    var CSS =
      ".__stt_root{display:flex;flex-direction:column;gap:10px}" +
      ".__stt_field{display:flex;flex-direction:column;gap:4px}" +
      ".__stt_label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:6px}" +
      ".__stt_hint{font-size:11px;color:var(--dsw-alias-label-tertiary)}" +
      ".__stt_row{display:flex;align-items:center;gap:8px}" +
      ".__stt_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 10px;font-size:13px;box-sizing:border-box;width:100%}" +
      ".__stt_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:5px 12px;font:inherit;font-size:13px;cursor:pointer}" +
      ".__stt_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}" +
      ".__stt_btn:disabled{opacity:.5;cursor:default}" +
      ".__stt_btnPrimary{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-accent)}" +
      ".__stt_micBtn{width:28px;height:28px;flex:none;cursor:pointer;border:none;border-radius:999px;display:grid;place-items:center;color:var(--dsw-alias-label-secondary);background:transparent;transition:background-color .12s ease}" +
      ".__stt_micBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".__stt_micBtnStandby{background:var(--dsw-alias-state-business-primary);color:#fff;animation:__stt_pulse 1.6s ease-in-out infinite}" +
      ".__stt_micBtnArmed{background:var(--dsw-alias-state-success-primary,#2ea043);color:#fff}" +
      ".__stt_micBtnRecording{background:var(--dsw-alias-state-error-primary);color:#fff;animation:__stt_pulse 1s ease-in-out infinite}" +
      ".__stt_micBtnRecognizing{background:var(--dsw-alias-state-business-primary);color:#fff}" +
      ".__stt_micBtnApproval{background:var(--dsw-alias-state-warn-primary,#e0a800);color:#fff}" +
      ".__stt_spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:__stt_spin .8s linear infinite}" +
      "@keyframes __stt_pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}" +
      "@keyframes __stt_spin{to{transform:rotate(360deg)}}" +
      ".__stt_status{font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
      ".__stt_statusPulse{font-size:12px;color:var(--dsw-alias-state-business-primary)}" +
      ".__stt_error{font-size:12px;color:var(--dsw-alias-state-error-primary)}" +
      ".__stt_ok{font-size:12px;color:var(--dsw-alias-state-success-primary,#2ea043)}" +
      ".__stt_modelRow{display:flex;align-items:center;gap:8px;font-size:12px}" +
      ".__stt_modelName{flex:1;color:var(--dsw-alias-label-primary)}" +
      ".__stt_modelState{font-size:11px;color:var(--dsw-alias-label-tertiary)}" +
      ".__stt_toggle{display:flex;align-items:center;gap:8px}";
    var tagId = "dsh-stt/main.css";
    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-stt";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ── 纯逻辑（与 src/voice-logic.mjs 同步）────────────────
    var SILENCE_THRESHOLD = 0.05;
    var BASELINE_MULTIPLIER = 1.8;
    var BASELINE_FRAMES = 60;        // ~1s @60fps
    var SILENCE_TIMEOUT_MS = 900;
    var MIN_RECORDING_MS = 350;
    var MAX_RECORDING_MS = 8000;
    var FOLLOWUP_WAKE_MS = 10000;
    var COALESCE_MS = 800;
    var MIC_TIMEOUT_MS = 3000;

    var HALLUCINATION_RE = /(感谢观看|谢谢观看|谢谢收看|thanks for watching|subscribe to|点赞关注|喜欢本视频)/gi;
    var FILLER_RE = /^(嗯|啊|哦|呃|诶|唉|那个|这个|就是|然后|那么|其实|对吧|对吧嘛)\s*/;
    var SEND_PHRASES = ['发送', '发出去', '发一下', 'send', 'sent', 'submit'];
    var ALLOW_RE = /(允许|同意|确认|可以|好的|第一个|选1|approve|allow|yes|ok)/i;
    var REJECT_RE = /(拒绝|取消|不要|不用|算了|stop|cancel|no)/i;

    function filterText(text) {
      if (!text) return '';
      var t = String(text);
      t = t.replace(HALLUCINATION_RE, ' ').replace(/\s+/g, ' ').trim();
      t = t.replace(FILLER_RE, '').trim();
      return t;
    }

    // 只在开头/结尾匹配发送词（说完内容后说"发送"，或"发送"+内容）；拒绝否定/疑问。
    // 纯"发送" → { text:'', send:true }（提交当前已填草稿）
    function stripSendPhrase(text) {
      var t = String(text || '').trim();
      if (!t) return { text: t, send: false };
      if (/(不要|别|不用|不想|能.{0,3}吗|是否|应该).{0,2}(发送|发出|send)/.test(t)) return { text: t, send: false };
      var lower = t.toLowerCase();
      for (var i = 0; i < SEND_PHRASES.length; i++) {
        var phrase = SEND_PHRASES[i];
        if (lower.startsWith(phrase)) {
          var rest = t.slice(phrase.length).replace(/^\s+/, '');
          return { text: rest, send: true };
        }
        if (lower.endsWith(phrase)) {
          var head = t.slice(0, t.length - phrase.length).replace(/\s+$/, '');
          return { text: head, send: true };
        }
      }
      return { text: t, send: false };
    }

    // 去掉末尾标点（SenseVoice ITN 输出带句号）
    function stripTrailingPunctuation(text) {
      return String(text || '').replace(/[。！？!?.,，、；;：:]+$/g, '').trim();
    }

    // 片段合并：按 seq 排序拼接，各段去末尾标点
    function mergeSegments(parts) {
      var sorted = parts.slice().sort(function (a, b) { return a.seq - b.seq; });
      var text = sorted.map(function (p) { return stripTrailingPunctuation(p.text); }).join('').replace(/\s+/g, ' ').trim();
      return stripTrailingPunctuation(text);
    }

    function approvalIntent(text) {
      var t = String(text || '').trim();
      if (!t) return { action: null };
      if (REJECT_RE.test(t) && !/(不是|不行|不能|不会)/.test(t)) return { action: 'reject' };
      if (ALLOW_RE.test(t)) return { action: 'allow' };
      return { action: null };
    }

    function levenshtein(a, b) {
      var m = a.length, n = b.length;
      if (m === 0) return n;
      if (n === 0) return m;
      var dp = new Uint32Array((m + 1) * (n + 1));
      for (var i = 0; i <= m; i++) dp[i * (n + 1)] = i;
      for (var j = 0; j <= n; j++) dp[j] = j;
      for (var i = 1; i <= m; i++) {
        for (var j = 1; j <= n; j++) {
          var cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i * (n + 1) + j] = Math.min(
            dp[(i - 1) * (n + 1) + j] + 1,
            dp[i * (n + 1) + j - 1] + 1,
            dp[(i - 1) * (n + 1) + j - 1] + cost);
        }
      }
      return dp[m * (n + 1) + n];
    }

    function editDistanceIn(text, word, maxDist) {
      var n = text.length, m = word.length;
      if (n < Math.max(1, m - maxDist)) return false;
      for (var i = 0; i < n; i++) {
        for (var len = Math.max(1, m - maxDist); len <= Math.min(n - i, m + maxDist); len++) {
          if (levenshtein(text.slice(i, i + len), word) <= maxDist) return true;
        }
      }
      return false;
    }

    function shapePatternOf(word) {
      if (/[一-鿿]/.test(word)) return null;
      var CONSONANT = 'bcdfghjklmnpqrstvwxyz';
      var VOWEL = 'aeiouy';
      var pat = '';
      for (var k = 0; k < word.length; k++) {
        var ch = word[k];
        if (CONSONANT.indexOf(ch) !== -1) pat += '[' + CONSONANT + ']';
        else if (VOWEL.indexOf(ch) !== -1) pat += '[' + VOWEL + ']';
        else pat += '\\' + ch;
      }
      try { return new RegExp(pat); } catch (e) { return null; }
    }

    function isWakeWord(text, wakeWords) {
      var t = String(text || '').trim().toLowerCase();
      if (!t) return false;
      for (var i = 0; i < wakeWords.length; i++) {
        var w = String(wakeWords[i]).trim().toLowerCase();
        if (!w) continue;
        if (t.indexOf(w) !== -1) return true;
        var shape = shapePatternOf(w);
        if (shape && shape.test(t)) return true;
        if (editDistanceIn(t, w, 2)) return true;
      }
      return false;
    }

    // ── 音频工具 ─────────────────────────────────────────────
    function decodeToPcm16(arrayBuffer, sampleRate) {
      return new Promise(function (resolve, reject) {
        var audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtx.decodeAudioData(arrayBuffer, function (audioBuffer) {
          var src = audioBuffer.getChannelData(0);
          var targetRate = 16000;
          var out = new Float32Array(Math.ceil(src.length * targetRate / (audioBuffer.sampleRate || sampleRate)));
          var ratio = src.length / out.length;
          for (var i = 0; i < out.length; i++) {
            var pos = i * ratio;
            var i0 = Math.floor(pos);
            var i1 = Math.min(i0 + 1, src.length - 1);
            var frac = pos - i0;
            out[i] = src[i0] * (1 - frac) + src[i1] * frac;
          }
          audioCtx.close();
          resolve(out);
        }, function (err) {
          audioCtx.close();
          reject(err);
        });
      });
    }

    function f32ToWav(samples) {
      var numSamples = samples.length;
      var buffer = new ArrayBuffer(44 + numSamples * 2);
      var view = new DataView(buffer);
      function writeStr(offset, str) { for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }
      writeStr(0, "RIFF"); view.setUint32(4, 36 + numSamples * 2, true); writeStr(8, "WAVE");
      writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 16000 * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      writeStr(36, "data"); view.setUint32(40, numSamples * 2, true);
      var offset = 44;
      for (var i = 0; i < numSamples; i++) {
        var s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
      return new Blob([buffer], { type: "audio/wav" });
    }

    function postWavForTranscribe(wav) {
      var fd = new FormData();
      fd.append('audio', wav, 'speech.wav');
      return fetch('/api/dsh-stt/transcribe', { method: 'POST', body: fd })
        .then(function (res) { return res.json().catch(function () { return {}; }); });
    }

    function getUserMediaWithTimeout(constraints) {
      var gum = navigator.mediaDevices.getUserMedia({ audio: constraints });
      var timer = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('mic-timeout')); }, MIC_TIMEOUT_MS);
      });
      return Promise.race([gum, timer]);
    }

    // 深度审批响应：识别到审批意图时，DOM 点审批面板的 allow/reject 按钮
    function respondToApproval(intent) {
      var panel = document.querySelector('[data-approval-key]');
      if (!panel) return false;
      var buttons = panel.querySelectorAll('button');
      var target = null;
      for (var i = 0; i < buttons.length; i++) {
        var txt = (buttons[i].textContent || '').trim();
        if (intent === 'allow' && /允许|同意|Allow|Approve|Allow once|Yes/.test(txt)) { target = buttons[i]; break; }
        if (intent === 'reject' && /拒绝|取消|Reject|Deny|No/.test(txt)) { target = buttons[i]; break; }
      }
      if (!target) return false;
      target.click();
      return true;
    }

    // ── 状态管理（模块级，跨组件共享）────────────────────────
    var state = {
      micOn: false,          // 待机开关
      gate: { state: 'standby', awakeUntil: 0 },  // standby=待机 / armed=激活
      phase: 'idle',         // idle | recording | recognizing | approval
      wakeWords: (function () { try { return localStorage.getItem('dsh-stt-wakewords') || '你好小助手'; } catch (e) { return '你好小助手'; } })(),
      models: {}, download: {}, engine: null, error: null,
      recognized: "", sent: false, lastError: null,
    };
    var listeners = [];
    function setState(patch) {
      Object.assign(state, patch);
      listeners.forEach(function (l) { try { l(); } catch (e) {} });
    }
    function useSttState() {
      var reactState = react.useState(0);
      react.useEffect(function () {
        var i = listeners.push(function () { reactState[1](function (c) { return c + 1; }); });
        return function () { listeners.splice(i - 1, 1); };
      }, []);
      return state;
    }

    function refreshStatus() {
      fetch('/api/dsh-stt/status').then(function (res) {
        return res.json().then(function (s) {
          setState({ models: s.models, download: s.download, engine: s.engine, error: null });
        }).catch(function () { setState({ status: "init" }); });
      }).catch(function () { setState({ status: "init" }); });
    }

    // ── VAD 控制器（点按切换后持续运行）─────────────────────
    var moduleInputActions = null;
    var controller = null;
    var pending = { parts: [], timer: null };   // 激活态累积的待提交片段（长句分段合并）
    var COALESCE_WINDOW_MS = 1500;              // 合并窗口：覆盖 VAD 切段 + 识别延迟

    function getWakeWords() {
      return (state.wakeWords || '').split(',').map(function (w) { return w.trim(); }).filter(Boolean);
    }

    function clearPendingTimer() {
      if (pending.timer) { clearTimeout(pending.timer); pending.timer = null; }
    }

    // 提交累积片段（合并窗口到/说"发送"触发）
    function commitPending(extraText) {
      clearPendingTimer();
      var parts = pending.parts.slice();
      pending.parts = [];
      if (extraText) parts.push({ seq: 1e9, text: extraText });
      if (!parts.length) return;
      var combined = mergeSegments(parts);
      if (!combined) return;
      var actions = moduleInputActions;
      if (actions && actions.setDraft) actions.setDraft(combined);
      setState({ recognized: combined, sent: false, lastError: null, gate: { state: 'standby', awakeUntil: 0 } });
    }

    // 激活态说话：累积到 pending，合并窗口后一次提交（长句被切段不丢）
    function bufferUtterance(text, seq) {
      pending.parts.push({ seq: seq, text: text });
      clearPendingTimer();
      pending.timer = setTimeout(function () { commitPending(); }, COALESCE_WINDOW_MS);
    }

    function createVoiceController() {
      var stream = null, audioCtx = null, analyser = null, data = null, source = null;
      var recorder = null, chunks = [];
      var baseline = 0, baseFrames = 0;
      var recording = false, recStart = 0, lastVoiceAt = 0;
      var rafId = 0, active = false;
      var segSeq = 0;   // 每段录音递增序号，合并时按序拼接（解决返回乱序）

      function start() {
        if (active) return Promise.resolve();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          return Promise.reject(new Error('getUserMedia unavailable'));
        }
        return getUserMediaWithTimeout({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }).then(function (s) {
          stream = s;
          audioCtx = new AudioContext();
          source = audioCtx.createMediaStreamSource(stream);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 2048;
          data = new Uint8Array(analyser.frequencyBinCount);
          source.connect(analyser);
          active = true;
          rafId = requestAnimationFrame(frame);
        });
      }

      function stop() {
        active = false;
        if (rafId) cancelAnimationFrame(rafId);
        if (recorder && recording) { try { recorder.stop(); } catch (e) {} }
        if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
        if (audioCtx) { audioCtx.close().catch(function () {}); audioCtx = null; }
      }

      function frame() {
        if (!active) return;
        analyser.getByteFrequencyData(data);
        var sum = 0;
        for (var i = 0; i < data.length; i++) sum += data[i];
        var lvl = sum / data.length / 255;
        var now = performance.now();
        if (!recording) {
          if (baseFrames < BASELINE_FRAMES) {
            baseline = baseline === 0 ? lvl : baseline * 0.9 + lvl * 0.1;
            baseFrames++;
          }
          var thr = Math.max(SILENCE_THRESHOLD, baseline * BASELINE_MULTIPLIER);
          if (lvl > thr) startRecording(now);
        } else {
          var thr2 = Math.max(SILENCE_THRESHOLD, baseline * BASELINE_MULTIPLIER);
          if (lvl > thr2) lastVoiceAt = now;
          else if (now - lastVoiceAt > SILENCE_TIMEOUT_MS) { stopRecording(); }
          else if (now - recStart > MAX_RECORDING_MS) { stopRecording(); }
        }
        rafId = requestAnimationFrame(frame);
      }

      function startRecording(now) {
        recording = true; recStart = now; lastVoiceAt = now; chunks = [];
        setState({ phase: 'recording' });
        var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = onRecordingStopped;
        recorder.start(100);
      }

      function stopRecording() {
        recording = false;
        if (recorder) { try { recorder.stop(); } catch (e) {} }
      }

      function onRecordingStopped() {
        var duration = performance.now() - recStart;
        recorder = null;
        setState({ phase: 'recognizing' });
        if (duration < MIN_RECORDING_MS) { setState({ phase: 'idle' }); return; }
        var mySeq = segSeq++;
        var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        var blob = new Blob(chunks, { type: mime || 'audio/webm' });
        blob.arrayBuffer().then(function (ab) {
          return decodeToPcm16(ab, 48000).then(f32ToWav);
        }).then(function (wav) {
          return postWavForTranscribe(wav);
        }).then(function (r) {
          handleTranscribed(filterText(r.text || ''), mySeq);
          setState({ phase: 'idle' });
        }).catch(function () {
          setState({ phase: 'idle', lastError: 'noSpeak' });
        });
      }

      return { start: start, stop: stop };
    }

    // 识别结果统一处理（审批响应优先，然后发送触发，然后门控 + 合并累积）
    function handleTranscribed(text, seq) {
      if (!text) { setState({ lastError: 'noSpeak' }); return; }
      // 1. 审批响应：页面有审批面板时，识别到允许/拒绝直接响应
      var hasApproval = !!document.querySelector('[data-approval-key]');
      if (hasApproval) {
        var intent = approvalIntent(text);
        if (intent.action) {
          var done = respondToApproval(intent.action);
          if (done) {
            setState({ recognized: intent.action === 'allow' ? 'approved' : 'rejected', sent: false, lastError: null, gate: { state: 'standby', awakeUntil: 0 } });
            clearPendingTimer();
            pending.parts = [];
            return;
          }
        }
        setState({ gate: { state: 'standby', awakeUntil: 0 }, lastError: null });
        return;
      }
      // 2. 发送触发：识别到「发送」→ 提交累积内容 + 本次去发送词内容（不依赖激活态）
      var stripped = stripSendPhrase(text);
      if (stripped.send) {
        var actions0 = moduleInputActions;
        if (actions0 && actions0.submit) {
          // 累积片段 + 本次内容去标点后填框提交；若都空则提交当前草稿
          var allParts = pending.parts.slice();
          clearPendingTimer();
          pending.parts = [];
          var combined = mergeSegments(stripped.text ? allParts.concat([{ seq: 1e9, text: stripped.text }]) : allParts);
          if (combined && actions0.setDraft) actions0.setDraft(combined);
          setState({ recognized: combined || '发送', sent: true, lastError: null, gate: { state: 'standby', awakeUntil: 0 } });
          setTimeout(function () { try { actions0.submit(); } catch (e) {} }, 50);
        }
        return;
      }
      // 3. 门控：待机 → 仅唤醒词激活；激活 → 内容累积合并
      var words = getWakeWords();
      var gate = state.gate;
      var now = Date.now();
      if (gate.state === 'armed' && now >= gate.awakeUntil) {
        gate = { state: 'standby', awakeUntil: 0 };
        setState({ gate: gate });
      }
      if (gate.state === 'standby') {
        if (words.length && isWakeWord(text, words)) {
          setState({ gate: { state: 'armed', awakeUntil: now + FOLLOWUP_WAKE_MS }, recognized: '', sent: false, lastError: null });
        }
        // 待机非唤醒词丢弃（P2 静默丢弃）——绝不填框
        return;
      }
      // armed：累积片段，合并窗口后一次提交（长句被切段不丢，按序拼接）
      bufferUtterance(stripTrailingPunctuation(text), seq);
      setState({ recognized: stripTrailingPunctuation(text), sent: false, lastError: null });
    }

    function startMic() {
      if (controller) return;
      setState({ micOn: true, lastError: null, phase: 'idle', gate: { state: 'standby', awakeUntil: 0 } });
      controller = createVoiceController();
      controller.start().catch(function (err) {
        controller = null;
        setState({ micOn: false, lastError: err && err.message === 'mic-timeout' ? 'micTimeout' : 'micDenied' });
      });
    }

    function stopMic() {
      if (controller) { controller.stop(); controller = null; }
      clearPendingTimer();
      pending.parts = [];
      setState({ micOn: false, phase: 'idle', gate: { state: 'standby', awakeUntil: 0 } });
    }

    // ── 麦克风按钮（点按切换待机）────────────────────────────
    var MicButton = function (props) {
      var stt = useSttState();
      if (props.inputActions) moduleInputActions = props.inputActions;

      function onToggle() {
        if (stt.engine !== 'ready') { setState({ lastError: 'modelNeeded', recognized: '', sent: false }); return; }
        if (stt.micOn) stopMic();
        else startMic();
      }

      var cls = "__stt_micBtn ";
      if (stt.micOn) {
        if (stt.phase === 'recording') cls += '__stt_micBtnRecording';
        else if (stt.phase === 'recognizing') cls += '__stt_micBtnRecognizing';
        else if (stt.gate.state === 'armed') cls += '__stt_micBtnArmed';
        else if (document.querySelector('[data-approval-key]')) cls += '__stt_micBtnApproval';
        else cls += '__stt_micBtnStandby';
      }

      var title = !stt.micOn ? zh.micOff
        : stt.phase === 'recording' ? zh.micRecording
        : stt.phase === 'recognizing' ? zh.micRecognizing
        : stt.gate.state === 'armed' ? zh.micArmed
        : document.querySelector('[data-approval-key]') ? zh.micApproval
        : zh.micOn;

      return h("button", {
        type: "button",
        className: cls,
        title: title,
        "aria-label": title,
        onClick: onToggle,
      }, stt.phase === 'recognizing' ? h("span", { className: "__stt_spinner" })
        : h("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
          h("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" }),
          h("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
          h("line", { x1: 12, y1: 19, x2: 12, y2: 22 })
        ));
    };

    // ── 设置卡片 ─────────────────────────────────────────────
    var SettingRow = function (props) {
      return h("div", { className: "__stt_field" },
        h("label", { className: "__stt_label" }, props.label, props.hint && h("span", { className: "__stt_hint" }, props.hint)),
        props.children);
    };

    var SettingsCard = function (props) {
      var t = props.t;
      var wakeState = react.useState(state.wakeWords);
      var wake = wakeState[0];
      var setWake = wakeState[1];

      react.useEffect(function () {
        function sync() { }
        var i = listeners.push(sync);
        return function () { listeners.splice(i - 1, 1); };
      }, []);

      function save() {
        var v = (wake || '').trim();
        try { localStorage.setItem('dsh-stt-wakewords', v); } catch (e) {}
        setState({ wakeWords: v, error: null });
      }

      function downloadModel() {
        setState({ error: null });
        fetch('/api/dsh-stt/download', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
          .then(function (res) { return res.json(); })
          .then(function () { refreshStatus(); })
          .catch(function () { setState({ error: 'saveFailed' }); });
      }

      var models = state.models || {};
      var modelState = models.asr || 'missing';
      var dl = state.download && state.download.asr;
      var modelLabel = modelState === 'ready' ? t('modelReady')
        : modelState === 'downloading' ? (dl && dl.pct != null ? dl.pct + '% ' : '') + t('modelDownloading')
        : modelState === 'error' ? t('modelError') : t('modelMissing');

      return h("div", { className: "__stt_root" },
        h("p", { className: "__stt_hint" }, t("intro")),
        h(SettingRow, { label: t("wakeWords"), hint: t("wakeWordsHint") },
          h("input", {
            className: "__stt_input",
            value: wake,
            placeholder: zh.wakeWords,
            onChange: function (e) { setWake(e.target.value); },
          })),
        h("div", { className: "__stt_row" },
          h("button", { className: "__stt_btn __stt_btnPrimary", onClick: save }, "保存"),
          state.error && h("span", { className: "__stt_error" }, t(state.error) || state.error),
          state.lastError && h("span", { className: "__stt_error" }, t(state.lastError) || state.lastError),
          state.recognized && h("span", { className: "__stt_ok" }, (state.sent ? t('micSent') : '') + ": " + state.recognized.slice(0, 30))),
        h(SettingRow, { label: t("model") },
          h("div", { className: "__stt_modelRow" },
            h("span", { className: "__stt_modelName" }, "ASR"),
            h("span", { className: "__stt_modelState" }, modelLabel),
            h("button", { className: "__stt_btn", onClick: downloadModel, disabled: modelState === 'ready' }, t("downloadModels")))));
    };

    // ── 插件体 ───────────────────────────────────────────────
    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-stt: dictionaries");
      var scope = ctx.settingsScope.bind({ namespace: NS });

      ctx.slots.inject("conversation.input.right", function () {
        return ctx.slots.register({ name: "conversation.input.right", id: "dsh-stt", order: 100 }, MicButton);
      });

      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section", id: "dsh-stt", order: 40,
          label: function () { return t("nav"); }, locale: NS,
        }, function (props) {
          return h(SettingsCard, Object.assign({}, props, { scope: scope, t: t }));
        });
      });

      refreshStatus();
      var timer = setInterval(refreshStatus, 5000);
      ctx.effect(function () { return function () { clearInterval(timer); }; }, "dsh-stt: poll");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
