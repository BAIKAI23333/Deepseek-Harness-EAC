import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientPath = join(root, 'assets', 'plugins', 'dsh-raw-html', 'lib', 'client.js');

interface SanitizerExports {
  sanitizeVcpHtml(html: string): string;
  sanitizeCss(css: string): string;
  isAllowedUrl(value: string, image?: boolean): boolean;
  hasVcpRoot(text: string): boolean;
}

/** 在 jsdom 中加载真实的 client.js 工厂，取回安全过滤函数。 */
function loadSanitizer(): SanitizerExports {
  const source = readFileSync(clientPath, 'utf8');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1/',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  let captured: { factory: (require: (id: string) => unknown) => unknown } | null = null;
  (window as unknown as { __ModuleLoader__: unknown }).__ModuleLoader__ = {
    load(def: { factory: (require: (id: string) => unknown) => unknown }) {
      captured = def;
    },
  };
  window.eval(source);
  assert.ok(captured, 'client.js must register itself through window.__ModuleLoader__.load');
  const moduleExports = captured.factory((id) => {
    if (id === 'react') return { createElement: () => null };
    throw new Error(`unexpected require inside client.js factory: ${id}`);
  });
  return moduleExports as unknown as SanitizerExports;
}

const s = loadSanitizer();

test('sanitizer functions are exported from client.js for testing', () => {
  for (const fn of ['sanitizeVcpHtml', 'sanitizeCss', 'isAllowedUrl', 'hasVcpRoot'] as const) {
    assert.equal(typeof s[fn], 'function', `${fn} must be exported`);
  }
});

test('hasVcpRoot detects only the exact vcp-root marker', () => {
  assert.equal(s.hasVcpRoot('<div id="vcp-root"><p>hi</p></div>'), true);
  assert.equal(s.hasVcpRoot('<div id="vcp-roots">x</div>'), false);
  assert.equal(s.hasVcpRoot('<div class="vcp-root">x</div>'), false);
  assert.equal(s.hasVcpRoot('plain text'), false);
});

test('sanitizeVcpHtml requires #vcp-root and returns empty otherwise', () => {
  assert.equal(s.sanitizeVcpHtml('<p>no root here</p>'), '');
  assert.equal(s.sanitizeVcpHtml(''), '');
  assert.equal(s.sanitizeVcpHtml('<div id="vcp-root">ok</div>').length > 0, true);
});

test('sanitizeVcpHtml strips script/iframe/object/embed/base/meta/link', () => {
  const html = [
    '<div id="vcp-root">',
    '<script>alert(1)</script>',
    '<iframe src="//evil.example"></iframe>',
    '<object data="//evil.example"></object>',
    '<embed src="//evil.example">',
    '<base href="//evil.example">',
    '<meta http-equiv="refresh" content="0;url=//evil.example">',
    '<link rel="stylesheet" href="//evil.example">',
    '<p>kept</p>',
    '</div>',
  ].join('');
  const out = s.sanitizeVcpHtml(html);
  assert.match(out, /id="vcp-root"/);
  assert.match(out, /kept/);
  for (const tag of ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link']) {
    assert.doesNotMatch(out, new RegExp(`<${tag}\\b`, 'i'), `${tag} must be removed`);
  }
});

test('sanitizeVcpHtml keeps only the controlled input() onclick bridge', () => {
  const out = s.sanitizeVcpHtml(
    '<div id="vcp-root"><button onclick="input(\'发送文案\')">go</button>' +
      '<button onclick="alert(1)">bad</button><img src="x" onerror="steal()"></div>',
  );
  assert.match(out, /data-vcp-input="发送文案"/);
  assert.doesNotMatch(out, /onclick\s*=/);
  assert.doesNotMatch(out, /onerror\s*=/);
});

test('sanitizeVcpHtml drops on* attributes and dangerous attributes', () => {
  const out = s.sanitizeVcpHtml(
    '<div id="vcp-root">' +
      '<img src="a.png" onload="x()" srcdoc="<script>x</script>" srcset="a 1x, b 2x">' +
      '<form action="//evil" formaction="//evil"><input></form>' +
      '</div>',
  );
  assert.doesNotMatch(out, /onload\s*=/);
  assert.doesNotMatch(out, /srcdoc\s*=/);
  assert.doesNotMatch(out, /srcset\s*=/);
  assert.doesNotMatch(out, /action\s*=/);
  assert.doesNotMatch(out, /formaction\s*=/);
});

test('sanitizeVcpHtml filters javascript: URLs and keeps safe ones', () => {
  const out = s.sanitizeVcpHtml(
    '<div id="vcp-root">' +
      '<a href="javascript:alert(1)">bad</a>' +
      '<a href="https://ok.example/a">good</a>' +
      '<a href="/relative">rel</a>' +
      '<a href="#section">anchor</a>' +
      '<img src="data:image/png;base64,AAAA">' +
      '<img src="data:text/html;base64,PGI+">' +
      '</div>',
  );
  assert.match(out, /https:\/\/ok\.example/);
  assert.match(out, /href="\/relative"/);
  assert.match(out, /href="#section"/);
  assert.match(out, /data:image\/png;base64,AAAA/);
  assert.doesNotMatch(out, /javascript:/i);
  assert.doesNotMatch(out, /data:text\/html/i);
});

test('sanitizeVcpHtml sanitizes inline style', () => {
  const out = s.sanitizeVcpHtml(
    '<div id="vcp-root"><p style="position:fixed;color:red;background:url(javascript:alert(1))">x</p></div>',
  );
  assert.doesNotMatch(out, /position\s*:\s*fixed/i);
  assert.doesNotMatch(out, /javascript:/i);
  assert.match(out, /color:\s*red/);
});

test('sanitizeVcpHtml adds rel=noopener to _blank links', () => {
  const out = s.sanitizeVcpHtml(
    '<div id="vcp-root"><a href="https://example.com" target="_blank">x</a></div>',
  );
  assert.match(out, /rel="noopener noreferrer"/);
});

test('isAllowedUrl protocol allowlist', () => {
  assert.equal(s.isAllowedUrl('https://example.com'), true);
  assert.equal(s.isAllowedUrl('http://example.com'), true);
  assert.equal(s.isAllowedUrl('/relative/path'), true);
  assert.equal(s.isAllowedUrl('#fragment'), true);
  assert.equal(s.isAllowedUrl('javascript:alert(1)'), false);
  assert.equal(s.isAllowedUrl('//evil.example'), false);
  assert.equal(s.isAllowedUrl('data:text/html,<b>x</b>'), false);
  assert.equal(s.isAllowedUrl('file:///etc/passwd'), false);
  assert.equal(s.isAllowedUrl('mailto:a@b.c', false), true);
  assert.equal(s.isAllowedUrl('mailto:a@b.c', true), false);
  assert.equal(s.isAllowedUrl('data:image/png;base64,AAAA', true), true);
  assert.equal(s.isAllowedUrl('data:image/png;base64,AAAA', false), false);
});

test('sanitizeCss strips dangerous CSS constructs', () => {
  const out = s.sanitizeCss(
    '@import url("//evil");color:red;' +
      'background:url(javascript:alert(1));' +
      'expression(alert(1));' +
      'behavior:url(x);' +
      'position:fixed;left:0;' +
      'z-index:9999;' +
      'z-index:99;' +
      'position:sticky;top:0;' +
      'content:"x";',
  );
  assert.doesNotMatch(out, /@import/i);
  assert.doesNotMatch(out, /javascript:/i);
  assert.doesNotMatch(out, /expression/i);
  assert.doesNotMatch(out, /behavior/i);
  assert.doesNotMatch(out, /position\s*:\s*fixed/i);
  assert.doesNotMatch(out, /position\s*:\s*sticky/i);
  assert.doesNotMatch(out, /z-index\s*:\s*9999/i);
  assert.doesNotMatch(out, /content\s*:/i);
  assert.match(out, /color:\s*red/);
  assert.match(out, /z-index\s*:\s*99/i);
});
