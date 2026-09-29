// Query the running kernel via WS JSON-RPC: pluginInventory.list
import WebSocket from 'ws';
const url = process.argv[2];
const ws = new WebSocket(url, { perMessageDeflate: false });
const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
ws.on('open', () => {
  ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pluginInventory.list', params: {} }));
});
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id !== 1) return;
  clearTimeout(timer);
  const v = m.result?.value ?? m.result;
  if (v && v.entries) {
    for (const e of v.entries) {
      if (e.moduleName?.includes('pack-installer') || e.fiberPhase !== 'started') {
        console.log(JSON.stringify(e));
      }
    }
    console.log('managementAvailable:', v.managementAvailable);
  } else {
    console.log(JSON.stringify(m).slice(0, 800));
  }
  process.exit(0);
});
ws.on('error', (e) => { console.log('WS ERR', e.message); process.exit(1); });
