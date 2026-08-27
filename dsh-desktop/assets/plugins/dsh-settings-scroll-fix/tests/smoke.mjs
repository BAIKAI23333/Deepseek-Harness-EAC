import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vm from 'node:vm'

// ---------------------------------------------------------------------------
// Minimal DOM shim. Supports the selectors the plugin actually uses:
//   [data-dsh-settings-root], [data-slot^="settings."], [role="dialog"],
//   and the input/textarea/... exclusion used by isExcludedScrollable.
// ---------------------------------------------------------------------------
function matchSelector(el, selector) {
  if (selector === '*') return true
  if (selector === '[data-dsh-settings-root]') return el.attributes.has('data-dsh-settings-root')
  if (selector === '[role="dialog"]') return el.getAttribute('role') === 'dialog'
  if (selector.startsWith('[data-slot^="')) {
    const prefix = selector.slice('[data-slot^="'.length, -2)
    const v = el.getAttribute('data-slot')
    return typeof v === 'string' && v.startsWith(prefix)
  }
  if (/input|textarea|select|pre|code|contenteditable/.test(selector)) return false
  return false
}

class FakeElement {
  constructor({ text = '', role = '', width = 640, height = 480, clientHeight = height, scrollHeight = height, attrs = {} } = {}) {
    this.nodeType = 1
    this.textContent = text
    this.parentElement = null
    this.children = []
    this.attributes = new Map(role === '' ? [] : [['role', role]])
    for (const [k, v] of Object.entries(attrs)) this.attributes.set(k, v)
    this.dataset = {}
    this.clientHeight = clientHeight
    this.scrollHeight = scrollHeight
    this.scrollTop = 0
    this._rect = { top: 0, left: 0, right: width, bottom: height, width, height }
    this.removed = false
  }

  append(child) {
    child.parentElement = this
    this.children.push(child)
  }

  contains(candidate) {
    if (candidate === this) return true
    return this.children.some(child => child.contains(candidate))
  }

  getBoundingClientRect() { return this._rect }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  setAttribute(name, value) { this.attributes.set(name, value) }
  removeAttribute(name) { this.attributes.delete(name) }
  matches(selector) { return matchSelector(this, selector) }
  querySelectorAll(selector) {
    const out = []
    const walk = el => {
      for (const child of el.children) {
        if (matchSelector(child, selector)) out.push(child)
        walk(child)
      }
    }
    walk(this)
    return out
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (matchSelector(child, selector)) return child
      const found = child.querySelector(selector)
      if (found !== null) return found
    }
    return null
  }
  remove() { this.removed = true }
}

function makeEnvironment() {
  const documentElement = new FakeElement({ width: 1280, height: 900 })
  const body = new FakeElement({ width: 1280, height: 900 })
  documentElement.append(body)
  const styleElement = new FakeElement()
  const listeners = new Map()
  const document = {
    body,
    documentElement,
    head: { appendChild(element) { assert.equal(element, styleElement) } },
    createElement(name) { assert.equal(name, 'style'); return styleElement },
    querySelector(selector) {
      if (selector.startsWith('style[')) return null
      return documentElement.querySelector(selector)
    },
    querySelectorAll(selector) { return documentElement.querySelectorAll(selector) },
    addEventListener(name, handler) { listeners.set(name, handler) },
    removeEventListener(name) { listeners.delete(name) },
    body,
    documentElement,
  }
  const window = {
    innerHeight: 900,
    __ModuleLoader__: { load(definition) { window.definition = definition } },
    getComputedStyle() { return { display: 'flex', visibility: 'visible', overflowY: 'hidden' } },
    requestAnimationFrame(callback) { callback(); return 1 },
    cancelAnimationFrame() {},
    addEventListener(name, handler) { listeners.set(`window:${name}`, handler) },
    removeEventListener(name) { listeners.delete(`window:${name}`) },
  }
  return { document, window, styleElement, listeners, documentElement, body }
}

class MutationObserver {
  constructor(callback) { this.callback = callback }
  observe() {}
  disconnect() { this.disconnected = true }
}

async function loadPlugin() {
  const source = await readFile(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')
  const env = makeEnvironment()
  vm.runInNewContext(source, { window: env.window, document: env.document, MutationObserver, console, Symbol, Set, Map, Math })
  assert.equal(env.window.definition.id, 'dsh-settings-scroll-fix')
  const plugin = env.window.definition.factory()
  return { plugin, ...env }
}

// --- Scenario 1: a genuine settings root (explicit opt-in marker) is fixed. ---
{
  const env = await loadPlugin()
  const root = new FakeElement({ text: '设置 通用 模型 插件', role: 'dialog', width: 900, height: 620, attrs: { 'data-dsh-settings-root': '' } })
  const scrollable = new FakeElement({ width: 620, height: 320, clientHeight: 320, scrollHeight: 900 })
  root.append(scrollable)
  env.body.append(root)
  const dispose = env.plugin.apply()
  assert.equal(scrollable.getAttribute('data-dssf-scrollable'), 'true', 'settings root overflow should be marked scrollable')
  assert.equal(env.listeners.has('wheel'), true)
  dispose()
  assert.equal(scrollable.getAttribute('data-dssf-scrollable'), null)
  assert.equal(env.listeners.has('wheel'), false)
  assert.equal(env.styleElement.removed, true)
  console.log('Scenario 1 (genuine settings root): OK')
}

// --- Scenario 2 (regression): a non-settings dialog must NOT be forced to
//     scroll. It contains a settings-word button but no settings slot, so it
//     must not be treated as a settings root. ---
{
  const env = await loadPlugin()
  const dialog = new FakeElement({ text: '确认', role: 'dialog', width: 400, height: 300 })
  const settingsWordButton = new FakeElement({ text: '通用', width: 80, height: 30 })
  const overflowing = new FakeElement({ width: 360, height: 260, clientHeight: 260, scrollHeight: 800 })
  dialog.append(settingsWordButton)
  dialog.append(overflowing)
  env.body.append(dialog)
  const dispose = env.plugin.apply()
  assert.equal(overflowing.getAttribute('data-dssf-scrollable'), null, 'non-settings dialog must not be forced scrollable')
  dispose()
  console.log('Scenario 2 (non-settings dialog regression): OK')
}

console.log('All dsh-settings-scroll-fix tests passed.')
