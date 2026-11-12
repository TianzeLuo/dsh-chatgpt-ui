# 架构

## 1. 一句话

`dsh-chatgpt-ui` 是一个 DSH 插件包，分两半：**Host 半部**只做策略（Chat preset 的只读
沙箱与审批），**Browser 半部**做全部视觉与交互适配。浏览器半部不接管宿主组件，只往宿主
自己的槽位里塞少量控件，其余全靠以 `body[data-chatgpt-ui]` 开头的样式表改外观。

```
package.json        exports + dsh.bundle.patch + dsh.client.platform = web
cordis.patch.yml    ui-skin-chatgpt（皮肤本体）、chat-policy（Host 策略）
presets/chat.patch.yml  chat preset 声明（无 shell / 无文件写 / 无子代理）
skin.json           皮肤元数据（与 package.json 版本同步）
lib/host/           Host 半部：index.js（空实现）、chat-policy(-core).js
lib/client/         Browser 半部源码（JS 片段 + css/ 分片）
lib/shared/         纯函数核心，Node 测试直接 import（*.mjs）
lib/client.js       构建产物，浏览器实际加载的入口
scripts/build-client.mjs  片段 + CSS → lib/client.js
```

## 2. 加载链路

1. profile 的 `dsh.profile.bundles` 里有本包 → `dsh.bundle.patch` 列出的两个 patch 文件
   被叠加到宿主配置里；
2. `cordis.patch.yml` 插入两行：`ui-skin-chatgpt`（本包主入口）与
   `chat-policy`（`dsh-chatgpt-ui/chat-policy`）；
3. 浏览器加载 `./client` 导出，即 `lib/client.js`：一个
   `window.__ModuleLoader__.load({ id, factory })` bundle，由
   `scripts/build-client.mjs` 把 `lib/client/*.js` 片段与 `lib/client/css/*.css`
   按固定顺序拼接而成（`lib/shared/*.mjs` 先内联，供 Node 测试复用）；
4. `factory` 里的 `apply(ctx, config)` 依次安装：令牌层 → 样式表 → 连接/本地化 →
   产品切换器 → 品牌位 → 导轨 → 侧栏会话列表 → 输入卡 → 项目页 → 消息区。
   每一步都包在 `ctx.effect` 里，卸载即还原（`<style>` 移除、令牌回滚、槽位注销）。

`lib/client.js` 是**提交产物**：使用者按路径安装时不会跑构建。改源码后必须
`npm run build`，否则浏览器加载的还是旧 bundle。

## 3. 槽位注入

| 槽位 | 注入物 | 说明 |
| --- | --- | --- |
| `sidebar.brand.mark` | 空组件 | 遮蔽宿主 FishLogo，让位给 dot 品牌位 |
| `sidebar.brand.name` | 品牌名 | 默认保留宿主字标；`brand: hidden` 时整体隐藏 |
| `sidebar.workspaces` | 自绘会话列表 | 宿主外壳保留，只替换列表 occupant |
| `conversation.input.left` | `+` 文件入口、权限按钮、项目按钮 | Work 卡的动作行与底部行 |
| `conversation.input.right` | 模型/推理强度药丸、发送键装饰 | 面板与滑块由本插件渲染 |
| `conversation.header.leading` | 会话头部补充控件 | 只在宿主提供该槽位时挂载 |

导轨是固定 52px 的覆盖层（不是槽位），入口包括首页 / 定时任务 / 插件 / 更多 / 设置。
super-agent 的入口来自它自己的侧栏行；本插件只在运行时探测 `main` 槽位，找不到就跳过，
不产生死按钮。

## 4. 样式作用域

- 每条规则都以 `body[data-chatgpt-ui]` 开头；`test/scoped-css.test.mjs` 会失败于任何
  全局选择器、任何命中宿主类名却未收口的规则。
- 暗色只由宿主的 `data-ds-dark-theme` 决定（`06-cgpt-tokens-dark.css`），插件不注册
  自己的主题 id，也不改用户的 light/dark/system 偏好。
- 产品模式写在 `body[data-chatgpt-mode]`（`chat` / `agent`），只供显示规则使用；
  真正的行为差异来自 session 的 composed preset。
- `body[data-cgpt-skin="off"]`（或 profile 配置 `skin: off`）让插件不挂任何样式，用于
  「装/不装插件」的像素回归闸门。
- `--dsw-corner-shape: round` 在皮肤根节点覆写一次，修正宿主默认的 squircle，使所有
  `50%` 圆与胶囊都是正圆/正胶囊；该变量会被宿主子树自动继承。

## 5. CSS 分片（级联顺序即文件名顺序）

| 文件 | 职责 |
| --- | --- |
| `00-tokens.css` | 文案与内容旋钮（问候语、占位符、卡片上限），宿主变量重定向 |
| `05-cgpt-tokens.css` | 语义令牌：颜色、圆角、字号、间距、几何（浅色） |
| `06-cgpt-tokens-dark.css` | 暗色令牌，仅 `data-ds-dark-theme` 下生效 |
| `10-frame.css` | 外壳、导轨列与内容列的关系 |
| `20-sidebar.css` / `21-rail.css` / `25-sessions.css` | 侧栏、导轨、会话列表 |
| `30-chat.css` | 消息区（用户气泡、助手正文、代码块、过程行） |
| `35-project.css` | 项目页、项目选择器、文件面板 |
| `40-composer.css` | 输入卡（三行结构、动作行、发送键） |
| `50-dark.css` | 暗色下的局部修补 |
| `60-hero.css` / `65-work-card.css` | 空态主界面 / Work 卡 |
| `70-mode.css` / `72-trigger.css` | 产品分段 / 模型与强度药丸 |
| `75-search.css` / `76-overlay.css` | 搜索浮层 / 宿主面板遮罩 |
| `85-a11y.css` | 焦点环、对比度、`prefers-reduced-motion` |
| `90-fallback.css` | 兜底，必须存在且排在最后 |

## 6. 选择器契约

CSS 依赖的宿主锚点全部登记在 `test/contract.json`：

- `test/selectors.contract.mjs` 校验 52 个 boot 锚点在快照 DOM 中命中，并 lint
  `lib/client/css/*.css` 里出现的 `data-slot='…'` / `[class*="…"]` 必须已声明；
- 宿主升级后若契约失败，先 `node scripts/capture-snapshot.mjs --url …` 抓新快照，
  再决定是改选择器还是补声明——不要直接删断言；
- 槽位形状（例如 `conversation.input.right` 是否还有宿主 occupant）变化时，插件必须
  继续工作而不是报错：所有安装点都允许「宿主没有这个座位」。
