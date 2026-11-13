# 开发

## 目录

- `lib/client/{theme,styles,entry}.js` + `lib/client/css/*.css` — 浏览器半部源码。
- `scripts/build-client.mjs` — 零依赖拼接脚本，产出 `lib/client.js`（提交产物）。
- `lib/host/` — 宿主半部：`chat-policy`（只读策略）、preset 校验。
- `presets/chat.patch.yml`、`cordis.patch.yml`、`skin.json` — profile 挂载与 preset 声明。
- `test/` — 契约快照、模式决策、preset 声明、Host 策略；`scripts/` 里是截图/抓快照工具。

## 构建

```sh
npm run build     # lib/client/*.js + css/*.css → lib/client.js
npm run check     # node --check 全部入口
```

浏览器半部必须是一个 `window.__ModuleLoader__.load({ id, factory })` 形状的 bundle；
源码按职责拆分，由 `scripts/build-client.mjs` 按文件名排序拼接。构建产物要提交（用户
按路径安装时不会跑构建）。

- **CSS 规则必须以 `body[data-chatgpt-ui]` 开头**，否则宿主升级/卸载后会误伤。
- **令牌**只用 `ctx.theme.overrideTokens(source, {light, dark})`，不注册主题 id；用户
  的 light/dark/system 偏好保持权威，卸载即还原。
- **preset 文件独立**：`presets/chat.patch.yml` 由 `package.json` 的 `dsh.bundle.patch`
  加载，与 `cordis.patch.yml` 分开，方便单独阅读。

## 与方案文档的偏离（摘要）

1. `lib/client.js` 是构建产物，源码在 `lib/client/`（模块加载器只认包名）。
2. `--dsw-specific-*`（bubble/input/sidebar）放 `css/00-tokens.css`，不塞进
   `overrideTokens`。
3. 正文列走 `--dsh-chat-user-width`（宿主元素级变量），不直接改
   `--dsh-chat-content-width`。
4. assistant 正文没有槽位，用 `[data-chat-flow-kind='assistant']` 内的元素选择器；
   段落间距由宿主 gap 提供，`p` 外边距清零。
5. 品牌 `hidden` 用空组件遮蔽宿主默认项；第三方同优先级时只 warn，不抛错。
6. `Work` 分段目标是部署默认 preset（`isDefault`），不是字面量 `agent`；显示名由
   `lib/shared/mode-core.mjs` 的 `PRODUCT_LABELS` 决定。
7. 非空白会话切换先确认，确认后开新会话（宿主对已开始会话锁定 preset）。
8. 徽标放在 [dsh-super-agent](https://github.com/TianzeLuo/dsh-super-agent)，不放在皮肤里：皮肤卸载后徽标仍应存在。
9. 产品切换器放在 `sidebar.brand.name`，`mark` 清空；菜单必须 portal，否则会被宿主
   brand 按钮的 `aria-hidden`/新建会话点击吞掉。
10. `brand` 配置现在只区分 `hidden` 和可见；名称跟随会话的 `agentPreset`（chat →
    Chat，其它 → Work）。
11. 客户端 `inject` 必须含 `uiWorkspace`、`remote`、`remote.agentPresets`；缺一个就会在
    点击处理里抛 `cannot get property … without inject`，表现为菜单点了没反应。

完整方案与更多细节见 [测试与验收](testing.md) 与 [架构](architecture.md)。

## 与其它插件的独立性

本皮肤不 import 其它插件包，也不要求对方存在：

- **只装本皮肤**：`apply` 只 inject `slots`，再等宿主 `theme` / `locale` / `remote` /
  `uiWorkspace` / `layout` 就绪后挂装饰；缺哪个就跳过对应部件。
- **与 [dsh-super-agent](https://github.com/TianzeLuo/dsh-super-agent) 的唯一耦合**是 dot 面板键：`chatgptDotPanelAvailable` 用
  `ctx.slots.entriesOfSlot('main')` 探测；产品切换器不再渲染 dot 分段。Super-agent 的徽标由它自己注册，本皮肤既不注册也不
  依赖它的 service/slot/配置。
- **证据**：`test/independence.test.mjs`（8 项，已并入 `npm test`）；隔离实例
  `DSH_HOME=/tmp/dsh-indep-cg dsh web --port 3098` 启动 HTTP 200，boot combo 只含
  `dsh-chatgpt-ui/client.js`，服务端日志无 error。
