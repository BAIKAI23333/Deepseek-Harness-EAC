(function (isChinese) {
  'use strict'
  if (window.__dshExitOverlay && typeof window.__dshExitOverlay.dismiss === 'function') {
    window.__dshExitOverlay.dismiss()
  }
  var text = isChinese ? {
    title: '退出 Deepseek Harness EAC',
    body: '后台运行时窗口会隐藏到系统托盘，任务完成后会发通知。',
    minimize: '最小化到托盘', quit: '退出应用', cancel: '取消',
  } : {
    title: 'Quit Deepseek Harness EAC',
    body: 'Running in the background hides the window in the system tray. You will be notified when tasks finish.',
    minimize: 'Minimize to tray', quit: 'Quit app', cancel: 'Cancel',
  }
  var HTML = [
    '<div id="dsh-exit-overlay" data-region="overlay" data-control-name="overlay-root" data-state="idle">',
    '  <div id="dsh-exit-card" role="dialog" aria-modal="true" aria-labelledby="dsh-exit-title" aria-describedby="dsh-exit-description" data-control-name="dialog-surface">',
    '    <div id="dsh-exit-title" data-control-name="dialog-title">' + text.title + '</div>',
    '    <div id="dsh-exit-description" data-control-name="dialog-body">' + text.body + '</div>',
    '    <div data-control-name="dialog-actions">',
    '      <button data-control-name="system.default.exit-minimize" data-state="idle" data-v="minimize">' + text.minimize + '</button>',
    '      <button data-control-name="system.default.exit-quit" data-state="dangerous" data-v="quit">' + text.quit + '</button>',
    '      <button data-control-name="overlay-close" data-state="idle" data-v="cancel">' + text.cancel + '</button>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n')
  var activeKeyHandler = null
  var previousFocus = null

  function dismiss(restoreFocus) {
    var el = document.getElementById('dsh-exit-overlay')
    if (el) el.remove()
    if (activeKeyHandler) {
      document.removeEventListener('keydown', activeKeyHandler, true)
      activeKeyHandler = null
    }
    if (restoreFocus !== false && previousFocus && previousFocus.isConnected) previousFocus.focus()
    previousFocus = null
  }

  function call(method) {
    if (window.dshDesktop && window.dshDesktop._call) {
      window.dshDesktop._call(method, {}).catch(function () { dismiss() })
    }
  }

  function show() {
    dismiss()
    previousFocus = document.activeElement
    document.body.insertAdjacentHTML('beforeend', HTML)
    var overlay = document.getElementById('dsh-exit-overlay')
    var buttons = Array.from(overlay.querySelectorAll('button[data-v]'))
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-v')
        dismiss(v === 'cancel')
        call(v === 'cancel' ? 'win.close-dialog' : (v === 'quit' ? 'win.close-force' : 'win.hide-and-close-dialog'))
      })
    })
    activeKeyHandler = function (e) {
      if (e.key === 'Escape' || (e.metaKey && e.key === 'w')) {
        e.preventDefault()
        e.stopPropagation()
        dismiss()
        call('win.close-dialog')
      } else if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        var index = buttons.indexOf(document.activeElement)
        var next = index < 0 ? (e.shiftKey ? buttons.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        buttons[next].focus()
      }
    }
    // Capture before host settings shortcuts; only this modal consumes Escape/Tab.
    document.addEventListener('keydown', activeKeyHandler, true)
    overlay.querySelector('[data-v="cancel"]').focus()
  }

  window.__dshExitOverlay = { show: show, dismiss: dismiss }
  show()
})
