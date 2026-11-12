/**
 * dsh-chatgpt-ui — token layer (browser half).  Generated into lib/client.js.
 *
 * Written from scratch against the documented API of
 * `@deepseek-ai/dsh-client-ui-theme` (`ctx.theme.overrideTokens(source,
 * tokens)`; see that package's lib/types/client/index.d.ts:200 and its README
 * §"Third-party themes"). No third-party source was copied; the approach
 * (token layer instead of a registered theme id) is our own decision, made so
 * the user's light/dark/system preference stays authoritative and uninstalling
 * the skin restores the previous palette exactly.
 *
 * Every value is a { light, dark } pair on purpose: the theme service rejects a
 * bare string because a single value goes illegible when the user switches
 * colour scheme (validateOverrides in the shipped bundle).
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory.
 */

/** Layer identity; re-calling with the same source replaces the layer atomically. */
const CHATGPT_THEME_SOURCE = 'dsh-chatgpt-ui'

/**
 * M0 baseline: ChatGPT app canvas greys plus the three label steps the shell
 * uses most. M1 widens this (bubbles, composer card, sidebar rows) after the
 * side-by-side screenshot pass — token names here are the ones already proven
 * to exist in 0.2.1-rc.1's alias sheet.
 * @type {Record<string, { light: string, dark: string }>}
 */
const CHATGPT_TOKEN_LAYERS = {
  '--dsw-alias-bg-base': { light: '#fcfcfc', dark: '#0e0e0e' },
  '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#212121' },
  '--dsw-alias-bg-layer-2': { light: '#f4f4f4', dark: '#2f2f2f' },
  '--dsw-alias-bg-layer-3': { light: '#ececec', dark: '#383838' },
  '--dsw-alias-bg-overlay': { light: 'rgba(0, 0, 0, 0.40)', dark: 'rgba(0, 0, 0, 0.60)' },
  '--dsw-alias-border-l1': { light: '#e8e8e8', dark: '#3c3c3c' },
  '--dsw-alias-border-l2': { light: '#ececec', dark: '#444444' },
  '--dsw-alias-border-l3': { light: '#f0f0f0', dark: '#4a4a4a' },
  '--dsw-alias-label-primary': { light: '#0d0d0d', dark: '#ededed' },
  '--dsw-alias-label-secondary': { light: '#5d5d5d', dark: '#cdcdcd' },
  '--dsw-alias-label-caption': { light: '#8f8f8f', dark: '#afafaf' },
  '--dsw-alias-label-dimmed': { light: '#b4b4b4', dark: '#7d7d7d' },
  '--dsw-alias-interactive-bg-hover': { light: '#f0f0f0', dark: '#2f2f2f' },
  '--dsw-alias-turn-trigger-bg': { light: '#f0f0f0', dark: '#2f2f2f' }
}

/**
 * Install the token layer on a scope that already provides `theme`.
 * @param {{ theme: { overrideTokens: (source: string, tokens: object) => () => void } }} scope
 * @returns {() => void} disposer that removes exactly this layer.
 */
function installChatgptTheme(scope) {
  return scope.theme.overrideTokens(CHATGPT_THEME_SOURCE, CHATGPT_TOKEN_LAYERS)
}
