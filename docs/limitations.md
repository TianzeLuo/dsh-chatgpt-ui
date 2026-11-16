# 已知限制

这些是**刻意保留**或**暂时做不到**的行为，不是待修的 bug。修其中任何一条都需要先改
宿主能力，或先拿到桌面版的参考帧。

## 1. 文件预览只认会话内资源

皮肤把文件点开交给宿主的 `sidebarRight.openResource`，地址形如
`dsh-resource://file/session/<sessionId>/<绝对路径>`。因此：

- 只能预览**会话作用域内**的资源；外部链接、`http(s)` 地址交给宿主或浏览器处理，
  皮肤不做二次拦截；
- 宿主尚未提供文件写 / 上传 / 删除接口，所以项目页、输入卡里**不画**这些按钮
  （画了也是死按钮）。

## 2. 宿主 modal 会盖住导轨

打开设置 / 插件管理 / 定时任务等宿主主面板时，宿主自己的遮罩层覆盖导轨与侧栏，
点击穿透被宿主接管。皮肤不绕过这个遮罩——绕过会破坏宿主的焦点约束。

## 3. 窄窗由宿主折叠侧栏

`<1024px` 时宿主自动折叠侧栏（原生化行为），皮肤只跟随。640px 参考帧里没有导轨，
而 DSH 保留 52px 导航栏；这是宿主结构差异，不做「隐藏导轨」的模拟。

## 4. 项目详情页没有桌面参考

项目页（标题、说明、文件列表、会话列表）是按网页版与同类表面推断的布局；桌面版没有
可对照的帧。**项目说明只存在浏览器 localStorage**：宿主没有说明写接口，换浏览器即丢失，
页面里会明示这一点。

## 5. Chat 模式是只读 preset

Chat 会话固定为 `chat` preset：无 shell、无文件写、无子代理，沙箱与审批由 Host 半部
钉死。已开始的会话不能换产品；想切 Chat / Work 请新建一个会话。

## 6. 侧栏宽度是皮肤既有值

皮肤侧栏（含 52px 导轨）340px，宿主原生 264px。列表跟宿主 track 同步重排，但宽度本身
不持久化（宿主不存这个值）。侧栏只有一个滚动区：宿主 0.2.2 的 `scrollArea` 被钉成
`overflow: hidden` 且区域行取剩余高度，新聊天 / super-agent 与列表一起留在面板内，
只有会话列表自身滚动。

## 7. 参考里没有、DSH 也没有的，不迁移

- 语音 / 录音入口：DSH 没有对应能力，直接删除，不做视觉占位。
- 桌面版独有的菜单项（例如项目 `⋯` 的四项）：网页版只有三项，图标取自官方 sprite，
  几何取自同类表面，逐像素对齐仅到「同类表面」级别。

## 8. 原生控件只做视觉适配

执行步骤、任务/目标、文件与输出聚合、折叠面板、Trajectory 标签、`/` 命令与 `@` 菜单的
**行为**全部归宿主，皮肤只改外观。宿主升级后若结构与样式钩子变化，先跑 `npm run test:core`
的契约套件，再按 `docs/architecture.md` §6 的流程处理，不删断言。

## 9. 验收证据不进仓库

`npm test` / `npm run check` 的后半段需要本机采集的证据（几何 JSON、截图），这些文件含真实会话标题与路径，已经从仓库移出并保留在本机的 `_archive/dsh-chatgpt-ui/` 下，`.gitignore` 也继续排除。干净的 clone 只能跑 `npm run test:core` 与 `npm run check:core`，详见
[测试与验收](testing.md) §2。

## 10. 未实测的部分

- 真实 provider 下的「停止 / Retry」按钮状态：可用的离线模型响应太快，没能稳定复现
  running 窗口，因此只做了静态样式验收。
- 极窄窗口（< 640px）下的输入卡与面板：DSH Web 的宿主布局在移动宽度下会切换结构，
  皮肤未覆盖该分支。

## 11. 升级到 DSH 0.2.2-rc.3 后的兼容层

宿主从 0.2.1-rc.1 升到 0.2.2-rc.3 时改了三处皮肤依赖的结构；每处都用「新旧同时匹配」
而不是按版本分支：

| 变更 | 旧结构 | 新结构 | 兼容位置 |
| --- | --- | --- | --- |
| 侧栏导航行 | `[data-slot='sidebar'] > div > nav`（独立导轨） | `sidebar > root > scrollArea > scrollRegion > nav[class*='_panelList']`（面板正文） | `lib/client/css/20-sidebar.css`，两个选择器并列，命中哪个都隐藏 |
| 会话头分段控件 | 整条 tablist 铺满，可直接给 `width: fit-content` | 外层多一层 `.viewTabs`（`flex-wrap: wrap`），每个 tab 带 ±10px 负外边距、35px 最小高 | `lib/client/css/30-chat.css`：`max-content` + `nowrap` + `min-height: 32px`，tab 归零外边距后 46×28 并排 |
| 用户气泡 | `.Sixlwa_bubble` | primitives `UserMessageBubble`：模块哈希类名 + `data-message-bubble` | `lib/client/css/30-chat.css`：`:is(.Sixlwa_bubble, [data-message-bubble])` |
| 回答提问的提交 | 用户气泡同款，`data-chat-flow-kind='user'` | 独立 `question-reply` 节点；`QuestionReplyView` 的气泡**没有** `data-message-bubble` | `lib/client/css/30-chat.css`：`question-reply` 的 `[data-reply-outcome]` 结构 + 与普通气泡共用的胶囊变量 |
| 侧栏滚动 | 宿主侧栏自身滚动 | `scrollArea` 网格区域行是 `max-content`，皮肤列表按视口高度会撑出第二根滚动条 | `lib/client/css/20-sidebar.css` + `25-sessions.css`：区域行 `minmax(0, 1fr)`、宿主 `overflow: hidden`、列表 `height: 100%` |

- 选择器契约（`test/contract.json`）已收录 `class.panelList` 与气泡属性的说明；`npm test`
  会拦住「没登记的宿主选择器」。
- 回答提问的提交不是 `user` 节点，而是 `question-reply`；它沿用宿主自己的问答定义列表与操作行，
  皮肤只接管胶囊表面（背景、圆角、内边距、最大宽度），问答文案结构不复制。
- 侧栏的单滚动区由「宿主 `scrollArea` 不滚动 + 列表填满区域」两段组成；升级宿主后若侧栏结构
  变化，`npm run test:core` 的 `scoped-css` 套件会先失败，不要删断言。
- 代码块、附件、图片、工具卡片的宿主类名在 0.2.2 没有变（逐包核对过 `client.js`），
  样式照旧；但「停止 / Retry」「窄窗」等状态仍属 §10 的未实测范围。
- 实测几何（本机采集的 m41 证据，不在仓库）：导轨 52、面板 288、侧栏合计 340、Chat 卡片 26px /
  Work 卡片 28px、气泡 22px / `#173e76` / 16–24、发送键 36×36、分段条 98×32。消息列跟随
  宿主 `--dsh-chat-content-width`（现在是 `clamp(680px, 主区 × 0.64, 920px)`，1600 视口下
  704px），皮肤只夹上界、不重指宿主变量，拖动列宽的把手因此仍然可用。
- 再次升级时：先 `npm run test:core`，再在隔离实例上跑
  `node scripts/m41-capture.mjs`（会断言上面这组几何与零 console error），矩阵用
  `npm run matrix -- --allow-diff --url <隔离实例>`复核。
