window.__ModuleLoader__.load({
  id: 'dsh-settings-scroll-fix',
  factory: () => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const PLUGIN_ID = 'dsh-settings-scroll-fix'
    const STYLE_ID = 'dsh-settings-scroll-fix/styles.css'
    const STATE_KEY = '__dshSettingsScrollFixV2'
    const ROOT_ATTR = 'data-dssf-settings-root'
    const SCROLL_ATTR = 'data-dssf-scrollable'
    const FLEX_ATTR = 'data-dssf-flex-min-height'
    const SETTINGS_LABELS = [
      '设置', '基础', '通用', '模型', '供应商', '插件', '外观',
      'settings', 'general', 'models', 'providers', 'plugins', 'appearance',
    ]

    const STYLE_TEXT = [
      `[${SCROLL_ATTR}="true"] {`,
      '  min-height: 0 !important;',
      '  overflow-y: auto !important;',
      '  overscroll-behavior: contain;',
      '  scrollbar-width: thin;',
      '}',
      `[${FLEX_ATTR}="true"] {`,
      '  min-height: 0 !important;',
      '}',
      `[${SCROLL_ATTR}="true"]::-webkit-scrollbar {`,
      '  width: 8px;',
      '}',
    ].join('\n')

    function isElement(value) {
      return value !== null && typeof value === 'object' && value.nodeType === 1
    }

    function rectOf(element) {
      try {
        return element.getBoundingClientRect()
      } catch {
        return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }
      }
    }

    function isVisible(element) {
      if (!isElement(element)) return false
      const rect = rectOf(element)
      if (rect.width < 1 || rect.height < 1) return false
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }

    function normalizedText(element) {
      return String(element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
    }

    function settingsSignalCount(element) {
      const text = normalizedText(element)
      let count = 0
      for (const label of SETTINGS_LABELS) {
        if (text.includes(label)) count += 1
      }
      return count
    }

    function promoteToSettingsRoot(seed) {
      let current = seed
      for (let depth = 0; isElement(current) && depth < 9; depth += 1) {
        if (current === document.body || current === document.documentElement) break
        const rect = rectOf(current)
        const role = String(current.getAttribute('role') || '').toLowerCase()
        if (role === 'dialog' && rect.width >= 200 && rect.height >= 150 && settingsSignalCount(current) >= 1) return current
        if (rect.width >= 250 && rect.height >= 180 && settingsSignalCount(current) >= 2) return current
        current = current.parentElement
      }
      return null
    }

    function commonAncestor(elements) {
      if (elements.length === 0) return null
      let candidate = elements[0]
      while (isElement(candidate)) {
        if (elements.every(element => candidate.contains(element))) return candidate
        candidate = candidate.parentElement
      }
      return null
    }

    function discoverSettingsRoots() {
      const seeds = []
      // Canonical, high-confidence anchors only. The settings UI renders under a
      // `settings.*` slot (the left rail is `settings.section`), so we key off
      // that plus an explicit opt-in marker. The old loose text/aria-label
      // heuristics (any dialog, any element labelled "设置"/"Settings") used to
      // over-match generic popovers, pickers and chat panels and force them to
      // scroll — the reported "non-slidable interfaces now slide" bug.
      const selectors = [
        '[data-dsh-settings-root]',
        '[data-slot^="settings."]',
      ]
      for (const selector of selectors) {
        try {
          seeds.push(...document.querySelectorAll(selector))
        } catch {
          // Ignore unsupported selectors in older Chromium builds.
        }
      }

      // A dialog counts as a settings root ONLY when it genuinely embeds a
      // settings slot (a settings modal). Plain dialogs are skipped.
      try {
        for (const dialog of document.querySelectorAll('[role="dialog"]')) {
          if (dialog.querySelector('[data-slot^="settings."]') !== null) seeds.push(dialog)
        }
      } catch {
        // Ignore unsupported selectors in older Chromium builds.
      }

      const roots = []
      for (const seed of seeds) {
        if (!isVisible(seed)) continue
        const root = promoteToSettingsRoot(seed)
        if (root === null || roots.includes(root)) continue
        roots.push(root)
      }
      return roots
    }

    function isExcludedScrollable(element) {
      try {
        return element.matches('input, textarea, select, pre, code, [contenteditable="true"]')
      } catch {
        return false
      }
    }

    function scoreCandidate(element, root) {
      if (!isVisible(element) || isExcludedScrollable(element)) return -1
      const clientHeight = Number(element.clientHeight || 0)
      const scrollHeight = Number(element.scrollHeight || 0)
      if (clientHeight < 24 || scrollHeight <= clientHeight + 1) return -1

      const rect = rectOf(element)
      const rootRect = rectOf(root)
      if (rect.width < 50 || rect.height < 40) return -1

      const style = window.getComputedStyle(element)
      const role = String(element.getAttribute('role') || '').toLowerCase()
      // Only take over scrolling for areas the design already intended to scroll
      // (the element constrains its overflow) or the settings nav rail itself.
      // A plain `overflow: visible` layout container must NOT be forced to
      // `overflow-y: auto` — that is what made unrelated, non-scrolling
      // interfaces start sliding. The settings sidebar (`settings.section`, a
      // NAV / navigation / tablist) stays scrollable either way.
      const isNavLike =
        role === 'navigation' || role === 'tablist' || element.tagName === 'NAV' ||
        (typeof element.matches === 'function' && element.matches('[data-slot^="settings."]'))
      const overflowConstrained =
        style.overflowY === 'auto' || style.overflowY === 'scroll' ||
        style.overflowY === 'hidden' || style.overflowY === 'clip'
      if (!isNavLike && !overflowConstrained) return -1

      let score = Math.min(scrollHeight - clientHeight, 2000)
      if (style.overflowY === 'hidden' || style.overflowY === 'clip') score += 600
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') score += 300
      if (role === 'navigation' || role === 'tablist') score += 400
      if (element.tagName === 'NAV') score += 500
      if (rootRect.width > 0 && rect.width < rootRect.width * 0.45) score += 120
      score += Math.min(rect.width * rect.height / 1000, 300)
      return score
    }

    function collectScrollableCandidates(root) {
      const all = [root, ...root.querySelectorAll('*')]
      // Also include nav elements within the root
      const navElements = root.querySelectorAll('nav')
      const combined = [...new Set([...all, ...navElements])]
      return combined
        .map(element => ({ element, score: scoreCandidate(element, root) }))
        .filter(entry => entry.score >= 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 8)
        .map(entry => entry.element)
    }

    function install() {
      if (typeof document === 'undefined' || document.documentElement === null) return () => {}

      const previous = window[STATE_KEY]
      if (previous !== undefined && typeof previous.dispose === 'function') previous.dispose()

      let style = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)
      if (style === null) {
        style = document.createElement('style')
        style.dataset.plugin = PLUGIN_ID
        style.dataset.pluginCss = STYLE_ID
        style.textContent = STYLE_TEXT
        document.head.appendChild(style)
      }

      let markedRoots = new Set()
      let markedScrollables = new Set()
      let markedFlexItems = new Set()
      let animationFrame = 0
      let lastRepairAt = 0
      let lastRootsKey = ''
      let lastFullScanAt = 0
      let rootIdSeq = 0
      let disposed = false

      const syncMarks = (previousSet, nextSet, attribute) => {
        for (const element of previousSet) {
          if (!nextSet.has(element)) element.removeAttribute(attribute)
        }
        for (const element of nextSet) element.setAttribute(attribute, 'true')
      }

      const repair = () => {
        animationFrame = 0
        if (disposed) return
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
        // Coalesce bursty mutations (boot / settings-open churn) into at most
        // one scan per ~100ms so we never run the candidate scan in a tight
        // per-frame loop. Imperceptible for the user, eliminates the jank.
        if (now - lastRepairAt < 100) {
          animationFrame = window.requestAnimationFrame(repair)
          return
        }
        lastRepairAt = now

        const nextRoots = new Set(discoverSettingsRoots())
        // Stable-root cache: during boot / settings-open churn the settings
        // root's identity does not change, yet the MutationObserver fires
        // constantly. Re-running the full-subtree candidate scan on every
        // frame was the startup regression, so we only rescan when the root
        // set actually changes or every ~2s (to pick up dynamically added
        // scroll areas). The 100ms gate above already coalesces bursts.
        const rootKey = [...nextRoots].map(r => {
          if (r.__dssfId == null) r.__dssfId = ++rootIdSeq
          return r.__dssfId
        }).join(',')
        const rootsChanged = rootKey !== lastRootsKey
        const forceRescan = now - lastFullScanAt > 2000
        let nextScrollables
        let nextFlexItems
        if (rootsChanged || forceRescan) {
          nextScrollables = new Set()
          nextFlexItems = new Set()
          for (const root of nextRoots) {
            for (const candidate of collectScrollableCandidates(root)) {
              nextScrollables.add(candidate)
              let parent = candidate.parentElement
              while (isElement(parent) && parent !== root) {
                const display = window.getComputedStyle(parent).display
                if (display === 'flex' || display === 'grid') nextFlexItems.add(parent)
                parent = parent.parentElement
              }
            }
          }
          lastFullScanAt = now
        } else {
          nextScrollables = markedScrollables
          nextFlexItems = markedFlexItems
        }
        lastRootsKey = rootKey

        syncMarks(markedRoots, nextRoots, ROOT_ATTR)
        syncMarks(markedScrollables, nextScrollables, SCROLL_ATTR)
        syncMarks(markedFlexItems, nextFlexItems, FLEX_ATTR)
        markedRoots = nextRoots
        markedScrollables = nextScrollables
        markedFlexItems = nextFlexItems
      }

      const scheduleRepair = () => {
        if (disposed || animationFrame !== 0) return
        animationFrame = window.requestAnimationFrame(repair)
      }

      const canScroll = (element, delta) => {
        if (element.scrollHeight <= element.clientHeight) return false
        if (delta < 0) return element.scrollTop > 0
        return element.scrollTop + element.clientHeight < element.scrollHeight
      }

      const wheelDeltaPixels = event => {
        if (event.deltaMode === 1) return event.deltaY * 16
        if (event.deltaMode === 2) return event.deltaY * window.innerHeight
        return event.deltaY
      }

      const onWheel = event => {
        if (event.defaultPrevented || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
        const root = [...markedRoots].find(candidate => path.some(node => isElement(node) && candidate.contains(node)))
        if (root === undefined) return

        const delta = wheelDeltaPixels(event)
        let target = path.find(node => isElement(node) && markedScrollables.has(node) && canScroll(node, delta))
        if (target === undefined) {
          target = [...markedScrollables].find(node => root.contains(node) && canScroll(node, delta))
        }
        if (target === undefined) return

        event.preventDefault()
        target.scrollTop += delta
      }

      const observer = new MutationObserver(scheduleRepair)
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
      })
      document.addEventListener('wheel', onWheel, { capture: true, passive: false })
      window.addEventListener('resize', scheduleRepair)
      scheduleRepair()

      const dispose = () => {
        if (disposed) return
        disposed = true
        observer.disconnect()
        document.removeEventListener('wheel', onWheel, true)
        window.removeEventListener('resize', scheduleRepair)
        if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
        for (const element of markedRoots) element.removeAttribute(ROOT_ATTR)
        for (const element of markedScrollables) element.removeAttribute(SCROLL_ATTR)
        for (const element of markedFlexItems) element.removeAttribute(FLEX_ATTR)
        style.remove()
        if (window[STATE_KEY] !== undefined && window[STATE_KEY].dispose === dispose) {
          delete window[STATE_KEY]
        }
      }

      window[STATE_KEY] = { dispose, repair: scheduleRepair }
      return dispose
    }

    exports.apply = install
    exports.inject = []
    return module.exports
  },
})
