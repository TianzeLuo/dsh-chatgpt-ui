/**
 * dsh-chatgpt-ui — message-area affordances (browser half fragment).
 *
 * M15: the process/step/thinking region is the Host's. The previous fragment
 * counted steps and wrote a summary attribute onto the Host's group title so
 * CSS could replace the Host's prose ("执行了命令，已搜索代码，已读取文件")
 * with a generated step count. That rewrite is gone: no node is read for
 * process information and no Host summary is mirrored or replaced.
 *
 * The one behaviour CSS cannot derive stays: the reference opens code cards
 * unwrapped. The Host's own wrap toggle remains authoritative after the first
 * pass, so a reader can turn wrapping back on and this fragment will not fight
 * that choice.
 */

/**
 * Match the reference's default: code is horizontally scrollable, not wrapped.
 * The Host's own wrap toggle stays in charge; this only flips its initial
 * pressed=true state once per block, so the user can turn wrapping back on and
 * the observer will not fight that choice.
 * @param {Document} doc - host document.
 * @returns {void}
 */
function chatgptDefaultCodeWrap(doc) {
  for (const block of doc.querySelectorAll('[data-code-wrap]')) {
    if (!(block instanceof HTMLElement) || block.hasAttribute('data-cgpt-wrap-defaulted')) continue
    block.setAttribute('data-cgpt-wrap-defaulted', '')
    const toggle = block.querySelector('button[aria-label="Wrap lines"]')
    if (toggle instanceof HTMLElement && toggle.getAttribute('aria-pressed') === 'true') toggle.click()
  }
}

/**
 * Observe the transcript for code cards and flip their initial wrap state.
 * @param {Document} doc - host document.
 * @returns {() => void} disposer.
 */
function mountChatgptMessages(doc) {
  let codePending = false
  let frame = 0
  let disposed = false

  const flush = () => {
    frame = 0
    if (disposed) return
    if (codePending) {
      codePending = false
      chatgptDefaultCodeWrap(doc)
    }
  }

  const schedule = () => {
    if (disposed || frame !== 0) return
    frame = window.requestAnimationFrame(flush)
  }

  const collect = (node) => {
    if (!(node instanceof Element)) return
    if (node.matches('[data-code-wrap]')) codePending = true
    if (!codePending && node.querySelector('[data-code-wrap]') !== null) codePending = true
  }

  if (doc.querySelector('[data-code-wrap]') !== null) codePending = true
  flush()

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) collect(node)
    }
    if (codePending) schedule()
  })
  observer.observe(doc.body, { childList: true, subtree: true })

  return () => {
    disposed = true
    observer.disconnect()
    if (frame !== 0) window.cancelAnimationFrame(frame)
    codePending = false
  }
}
