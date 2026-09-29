// CDP capture v2: preload a hook that wraps the installer's client apply to surface its error,
// then reload and collect console output.
import WebSocket from 'ws';

const cdpUrl = process.argv[2];
const pageUrl = process.argv[3];
const ws = new WebSocket(cdpUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
const logs = [];
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[${msg.params.type}] ${String(text).slice(0, 900)}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${d.text} ${d.exception?.description || ''}`.slice(0, 1200));
  }
});
ws.on('open', async () => {
  try {
    const { targetInfos } = await send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page' && t.url.includes('127.0.0.1'));
    if (!page) { console.log('NO PAGE'); process.exit(1); }
    const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (function() {
          const iv = setInterval(() => {
            const ml = window.__ModuleLoader__;
            if (!ml || typeof ml.load !== 'function') return;
            clearInterval(iv);
            const orig = ml.load.bind(ml);
            ml.load = (def) => {
              if (def && def.id === '@dsh-eac/pack-installer') {
                console.log('[HOOK] installer module registered, wrapping factory');
                const of = def.factory;
                def.factory = (require) => {
                  const mod = of(require);
                  if (mod && typeof mod.apply === 'function') {
                    const oa = mod.apply;
                    mod.apply = async (ctx, config) => {
                      try {
                        console.log('[HOOK] installer apply START');
                        const r = await oa(ctx, config);
                        console.log('[HOOK] installer apply OK');
                        return r;
                      } catch (e) {
                        console.error('[HOOK] installer apply THREW:', e && (e.stack || String(e)));
                        throw e;
                      }
                    };
                  }
                  return mod;
                };
              }
              return orig(def);
            };
          }, 5);
        })();
      `,
    }, sessionId);
    await send('Page.reload', {}, sessionId);
    await new Promise((r) => setTimeout(r, 12000));
    console.log('=== relevant ===');
    for (const l of logs.filter((l) => l.includes('pack-installer') || l.includes('HOOK') || l.includes('EXCEPTION') || l.includes('did not activate'))) console.log(l);
    console.log('=== all (first 25) ===');
    console.log(logs.slice(0, 25).join('\n'));
    process.exit(0);
  } catch (e) {
    console.error('capture failed:', e.message);
    process.exit(1);
  }
});
