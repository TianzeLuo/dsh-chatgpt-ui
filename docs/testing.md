# 测试与验收

## 1. 四种门禁

| 命令 | 需要什么 | 何时用 |
| --- | --- | --- |
| `npm run check:core` | 只要 Node 24 | 提交前最低门槛：入口与片段的 `node --check` |
| `npm run test:core` | 只要 Node 24 | 契约、纯函数逻辑、CSS 作用域、工具函数（12 个套件） |
| `npm run check` | 本机已采集的证据（`docs/`） | 全量语法门禁 + 报告脚本重放 |
| `npm test` | 本机已采集的证据（`docs/`） | 全量验收：契约 + 证据断言（49 个套件） |

```sh
npm run check:core      # 任何 clone 都能跑
npm run test:core
npm run check           # 需要本机证据
npm test                # 需要本机证据
```

`npm run build` 只影响产物，不参与门禁：改 `lib/client/**` 或 `lib/client/css/*.css`
之后必须重新构建，`lib/client.js` 是提交产物。

## 2. 为什么证据是「本机」的

`npm test` 与 `npm run check` 的后半段会重放**采集证据**：`docs/*.json` 的几何读数、
`docs/capture/live/*.json` 的参考抓取、`docs/screenshots/*.png` 的对照图
（`docs/reference/` 是维护者桌面的截图，只作复刻依据）。这些文件里有真实会话标题、
工作区路径与宿主 DOM，属于隐私材料，所以 `.gitignore` 里整棵 `docs/` 只放行
`docs/images/` 与面向读者的文档；**不提交、不推送、不放进 CI**。

因此一份干净的 clone 能跑 `check:core` 与 `test:core`；`npm test` 的其余套件需要先
按第 4 节采集，或在维护者机器上直接跑。缺失证据时测试会显式失败（`ENOENT` 或
`is missing`），不会静默跳过——这是有意的：验收证据不允许「假装通过」。

## 3. 主要套件

| 套件 | 覆盖 |
| --- | --- |
| `test/selectors.contract.mjs` | 52 个 boot 锚点命中 + CSS 里出现的 `data-slot` / `[class*=]` 必须在 `test/contract.json` 声明 |
| `test/scoped-css.test.mjs` | 每条规则以 `body[data-chatgpt-ui]` 开头，无全局选择器、无宿主类名裸命中 |
| `test/mode.test.mjs` / `test/preset.test.mjs` | Chat / Work 模式决策；`chat` preset 声明（无 shell、无写文件、无子代理） |
| `test/chat-policy.test.mjs` | Host 只读策略：进入、恢复、非 chat 会话不动 |
| `test/layout.test.mjs` / `test/independence.test.mjs` | 面板服务缺失时不崩；不 import 其它插件、无死按钮 |
| `test/sessions.test.mjs` | 分页隔离、置顶、菜单、项目折叠、super-agent 内部会话过滤 |
| `test/work-composer.test.mjs` | 强度档位取自 `modelCatalog`、轨道/手柄几何、`selectModel` 请求体、权限映射 |
| `test/native-parity.test.mjs` | 「装/不装插件」像素对照（15 项，`maxOffset 0px`） |
| `test/m1x`–`test/m4x` | 各模块的证据断言：几何、令牌、图标字形、面板、消息区 |

## 4. 在隔离实例里采集

所有采集脚本都要求一个**隔离实例**（独立 `DSH_HOME`、独立端口，绝不连正在使用的
3080）：

```sh
export DSH_HOME=$(mktemp -d /tmp/dsh-demo-XXXX)
dsh plugin --profile web add /path/to/dsh-chatgpt-ui
dsh web --no-open --port 3104          # 打印带 token 的 URL
```

- **矩阵**：`npm run matrix -- --url "http://127.0.0.1:3104/?token=…" --playwright …`
  （即 `scripts/matrix9.mjs`），产出 `docs/screenshots/matrix9-*.png` 与
  `docs/matrix9.json`；有 `diff`/`missing` 时非零退出，`--allow-diff` 只报告。
- **全景矩阵（开发工具）**：`node tools/matrix.mjs --url-dark … --url-light … --out docs`，
  30 格 = 场景 × 会话状态 × 主题 × 交互 × 输入长度；加 `--include-sidebar` 才跑侧栏与
  项目格，结果写 `docs/matrix.json` 与 `matrix-*.png`。
- **回归清单**：`node scripts/regression9.mjs --url … --playwright …`，写
  `docs/regression9.json`；无法在无持久会话的实例上验证的项显式记 `skip`，不以 skip
  冒充 pass。
- **参考采集只读**：对 chatgpt.com 的抓取脚本不新建会话、不发消息、不改设置、不写宿主
  数据；只在已打开的标签上读 DOM 与截图。
- **主题/响应式**：`scripts/theme-audit.mjs`、`scripts/check-responsive.mjs`（16 控件 ×
  2 主题、640/768/900/1024/1280/1600 六断点、DPR2、reduced-motion）。

## 5. README 截图

README 里的四张图由 `tools/showcase-capture.mjs` 生成，同样只连隔离实例：

```sh
node tools/showcase-capture.mjs --url "http://127.0.0.1:3104/?token=…"
```

脚本会拒绝非 `127.0.0.1:3104` 的地址，固定 1440×900 @2x、深色、zh-CN，并断言推理
强度滑块确实展开。演示数据要求：两个项目（`示例项目` / `Demo Project`）加一个空项目
（`Empty Project`），三个会话（`你好` / `示例会话 B` / `Sample session`）。
截图里不得出现真实项目名、会话标题、路径或头像——提交前逐张目检。

## 6. 已知的验收边界

- 参考里的语音/录音入口不迁移（DSH 没有对应能力）。
- 宿主没有文件写/上传/删除 API，相关按钮不画。
- 项目说明只存浏览器 localStorage。
- `<1024px` 由宿主折叠侧栏；640px 参考没有导轨，DSH 保留 52px 导轨。
- 设置面板打开时被宿主 modal 遮罩覆盖导轨，这是宿主行为，皮肤不绕过。
