# 变更日志

按里程碑倒序。`M*` 是九个复刻模块，`P0-*` 是复刻过程中按用户反馈插入的对齐项；
每条都附当时的验收方式（矩阵截图 / 证据 JSON / 测试套件）。

## 2026-11 — 适配 DSH 0.2.2-rc.3（P2-b）

- 宿主升级后侧栏多出原生导航行、会话头分段控件被压成「对话轨迹」、用户气泡退回灰色
  20px：三处分别修在 `20-sidebar.css`（隐藏面板正文里的 `nav` 列表）、`30-chat.css`
  （分段条 `max-content`/`nowrap`/`min-height: 32px`，tab 外边距归零）与
  `30-chat.css`（气泡匹配新增的 `data-message-bubble`）。
- 兼容层一律双写选择器，保留 0.2.1 的 `.Sixlwa_bubble` 与 `> div > nav`，不写版本分支。
- `test/contract.json` 收录 `class.panelList`；`test/m33.test.mjs`、`test/messages.test.mjs`
  跟着新选择器更新，`docs/m27.json` 的规则行号刷新。
- 新增 `scripts/m41-capture.mjs`：一次采齐侧栏 / 输入卡 / 消息 / 设置四张深色帧与
  「不装插件」对照组，并断言 52/288/340、26px、22px、36×36、98×32 与零 console error。

## 2026-11 — 截图重拍（P1-f2）

- 首图改成 **Chat 空态**（`我们从哪里开始?`）+ 推理强度滑块展开，与 README 正文一致。
- 滑块面板改为对齐输入卡右缘、底边停在卡片上方 8px：不再压住输入卡，也不再挡空态
  标题；一个会话只有一个展开的触发药丸。
- 演示数据统一为英文（`Demo Project` / `Personal Notes` / `Marketing Site`，
  会话 `Draft the README outline` / `Weekly review notes` / …），隔离实例重造。
- `tools/showcase-capture.mjs` 增加三道截图自检：滑块存在、面板与卡片不重叠、可见
  文本里没有本机路径；采集前把指针移开项目行，避免 hover 卡片挡住对话。

## 2026-11 — 仓库化

- 整理为可发布仓库：`.gitignore`（证据与参考截图不入库）、README 与 `docs/`
  （架构、样式令牌、测试、路线图、已知限制、about）、`LICENSE`（MIT）。
- 新增 `tools/showcase-capture.mjs`：在隔离实例里生成 README 的四张演示截图，
  固定 1440×900 @2x、深色、zh-CN。
- 新增 `test:core` / `check:core`：不依赖本机证据、任何 clone 可跑的两道门禁。

## 2026-11 — P0-22 / P0-21 / P0-19

- **P0-22** 项目内会话分页隔离：每个项目首屏 8 条，「显示更多」只加本项目；折叠再展开
  保留已加载条数，「最近」保持自己的 12 条分页，两者互不串扰。
- **P0-21（M39）** 输入框内容自适应：Chat / Work 共用 `min(336px, 40vh)` 上限，向上增高，
  超出内部滚动；不同窗口高度下卡片高度稳定。
- **P0-19f** 侧栏头部去掉图标，「项目」区在 Chat 与 Work 都常显。
- **P0-19b** 顶部产品切换只在空白会话出现；侧栏恢复宿主原生品牌字标。

## 2026-11 — P0-16 / P0-17 / P0-18 / M30 / M33

- **P0-16** 空态复刻：模式分段 224×36（单项 112×36）、空态输入卡 757×52 / 圆角 26、
  占位符与强度标签共用一个 muted 灰、发送键的箭头恒为白色。
- **P0-17** Chat 输入卡：可输入、无工作区入口、`+` 与内容同心、两条宽度
  （空态 757 / 已开会话 = 消息列 − 60）。
- **P0-18 / P0-18b** Work 输入卡：与正文列同宽、权限按钮入卡（`帮我批准`）、底部由三行
  收成两行、切换模式不闪。
- **M30** 两态（空态 / 已开始）占位符统一走 `--dsh-chatgpt-placeholder-chat`。
- **M33** 插队注入消息与普通用户消息共用同一个蓝色气泡。

## 2026-11 — P0-13 图标实测复刻（M25）

- 38 个菜单字形全部来自参考页实测（sprite 30 / mask 5 / 行内 1），
  `docs/m25-icons-diff.json` 38/38 `identical: true`，源码内手绘 path 归零。
- 项目行文件夹图标开/合、行高 36、`⋯` 与「新建会话」按钮几何按实测值落位；
  菜单 160px 下限、16px 圆角、36px 行、深色表面 `rgba(33,33,33,.9)`。
- 生成器：`scripts/build-menu-icons.mjs`（禁止手改产物 `lib/client/menu-icons.js`）。

## 2026-11 — P0-8 ~ P0-10 面板与侧栏

- **P0-10A** 导轨五个入口、新聊天 / super-agent 固定块、项目行展开与悬浮菜单。
- **P0-10B** 侧栏列表跟随宿主 track 重排；Chat / Work 输入卡统一读
  `--dsh-chat-content-width`；新增权限选择器（`conversation.input.left`，order 30），
  标签与菜单都用宿主 `permissionPresets/catalog` 枚举，切换走 `/permission`。
- **P0-9** 在皮肤根节点覆写 `--dsw-corner-shape: round`，修掉宿主 squircle 把圆形和
  胶囊切成超椭圆的问题。
- **P0-8** 推理强度面板调色：轨道、填充、最高档渐变按参考取值。
- **P0-6（M17）** 强度面板逐像素：280px 宽、12-16-16 内边距、252×36 轨道、44px 正圆
  手柄、5 个档位点、最高档渐变；药丸展开文案「选择推理强度」。
- **P0-2 / P0-3 / P0-4（M12–M14）** 模型 + 强度合并药丸，简单/列表两级视图，模型列表
  按宿主 provider 分组。

## 2026-11-08 — 模块 1–9 完成

- **M1** 外壳 / 导轨 / 图标：52px 导轨、四个固定入口 + 底部设置、500ms tooltip。
- **M2** 侧栏 / 会话列表：340px 侧栏、置顶/重命名/归档、项目右键菜单、分页。
- **M3** 产品切换 / 空态 / 输入卡：Chat / Work 两段、空态标题 180ms 渐显、Toast。
- **M4** 消息区：用户气泡 22px、助手正文 768 列、附件/图片/代码块/过程行；
  装与不装插件的 transcript 对照 15/15、偏移 0px。
- **M5** 项目页 / 项目选择 / 文件：真实 workspace 数据 + 宿主原生预览。
- **M6** 设置 / 插件 / 定时入口：`layout.selectPanel` 桥接，齿轮路径逐像素 0.00%。
- **M7** 命令 / `@` / 搜索：`/` 只列宿主真实命令（240×36）、`@` 760px、搜索 720×460、
  `Ctrl/Cmd+K`、↑↓/Enter、Esc 与焦点还原。
- **M8** 主题 / 对比度 / 响应式：16 控件 × 2 主题 0 mismatch、24 项对比度全过、
  六断点 85/85、DPR2 与 reduced-motion 实测。
- **M9** 整体矩阵与回归：`npm run matrix`（29 格 + native-parity 分组）、
  `scripts/regression9.mjs`（16 项）、测试入口并入 `npm test` / `npm run check`。

## 2026-11 — Phase 1

- 令牌层 + 单张样式表 + 明暗两套外观 + `chat` preset（Host 只读策略）落地；
  选择器契约（`test/contract.json`）与「卸载即还原」的 `ctx.effect` 生命周期确定。
