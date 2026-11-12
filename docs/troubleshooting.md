# 排障

## 皮肤没生效

- 控制台应有 `[dsh-chatgpt-ui] v0.1.0 mounted …`，`<body>` 应有
  `data-chatgpt-ui="0.1.0"`。两条都没有：确认 profile 的 `dsh.profile.bundles` 里有
  `ui-skin-chatgpt`，且没有 `disabled: true`。
- 只改了 `lib/client/*.js` 却忘了 `npm run build`：浏览器加载的是 `lib/client.js`。
- 在 `?navdebug=1`/其它插件面板下样式错位：本皮肤只负责 `body[data-chatgpt-ui]` 内的
  元素；Super-agent 面板是宿主的 main panel，皮肤不接管它的布局。

## 找不到 dot 入口

Phase 1 起 dot 不再出现在顶部/新建页；从侧栏 `Super-agent` 面板行打开。没装
`dsh-super-agent`（或它的 `main` 槽未注册）时没有这一行，这是预期行为。

## Chat 模式没有变只读

只读来自 Host 半部 `lib/host/chat-policy.js`，不是 `body[data-chatgpt-mode]`。确认
`chat-policy` 行已加载、会话的 composed preset 确实是 `chat`；切出只可能发生在空白
会话，非空白会话请新开。

## 宿主升级后契约失败

`npm test` 报某个锚点缺失：先用 `scripts/capture-snapshot.mjs` 抓新快照，对比
`test/contract.json` 与 CSS 选择器，再决定改选择器还是补声明。不要直接删断言。

## 卸载后残留

`<body>` 标记、`<style>`、令牌层都在 `ctx.effect` 的 disposer 里；如果仍有残留，检查
是否有第三方样式以 `body[data-chatgpt-ui]` 为前缀硬编码。卸载不需要刷新页面。
