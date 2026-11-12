/**
 * dsh-chatgpt-ui — stylesheet lifecycle (browser half).  Generated into lib/client.js.
 *
 * One <style> element owned by this plugin, mounted into <head> and removed by
 * its disposer. Written from scratch (no shadow DOM, no third-party
 * stylesheet-rewriting engine): the DOM contract is the host's own `data-slot`
 * outlets and `data-chat-*` flow markers, so a plain document-level sheet is
 * enough — and it keeps the skin removable without a reload.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory.
 */

/** Stable id so a stale sheet from a previous mount can be found and replaced. */
const CHATGPT_STYLE_ID = 'dsh-chatgpt-ui-styles'

/**
 * Mount one stylesheet element.
 * @param {Document} doc - browser document.
 * @param {string} css - stylesheet text.
 * @returns {() => void} disposer removing exactly the element it mounted.
 */
function mountChatgptStyles(doc, css) {
  if (doc === undefined || doc === null || doc.head === undefined || doc.head === null) {
    return () => {}
  }
  const stale = doc.getElementById(CHATGPT_STYLE_ID)
  if (stale !== null && stale.parentNode !== null) stale.parentNode.removeChild(stale)
  const node = doc.createElement('style')
  node.id = CHATGPT_STYLE_ID
  node.setAttribute('data-dsh-plugin', 'dsh-chatgpt-ui')
  node.textContent = css
  doc.head.appendChild(node)
  return () => {
    if (node.parentNode !== null) node.parentNode.removeChild(node)
  }
}
