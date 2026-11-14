# 测试与验收

## 1. 四种门禁

| 命令 | 需要什么 | 何时用 |
| --- | --- | --- |
| `npm run check:core` | 只要 Node 24 | 提交前最低门槛：入口、片段与新测试脚手架的 `node --check` |
| `npm run test:core` | 只要 Node 24 | 契约、纯函数逻辑、CSS 作用域、工具函数（12 个套件） |
| `npm test` | 证据齐全时跑全量；缺证据自动降级 | 唯一的总门禁：12 个 core 套件 + 37 个证据套件（见第 2 节） |
| `npm run check` | 本机已采集的证据（`docs/`） | 全量语法门禁 + 报告脚本重放；缺证据时同样会中断，属于开发机命令 |

```sh
npm run check:core      # 任何 clone 都能跑
npm run test:core       # 任何 clone 都能跑
npm test                # 干净 clone 跑 core 层并打印 skip 原因；证据齐全时跑全量
npm run check           # 维护机：还会重放 m17/m14 报告，缺证据会中断
```

`npm run build` 只影响产物，不参与门禁：改 `lib/client/**` 或 `lib/client/css/*.css`
之后必须重新构建，`lib/client.js` 是提交产物。

## 2. 哪些测试需要本机证据

`npm test` 里有 **37 个套件会重放采集证据**：几何 JSON、参考抓取、对照截图与维护者桌面
的参考帧。这些文件里有真实会话标题、工作区路径与宿主 DOM，属于隐私材料，**不在仓库里**；
`.gitignore` 也继续排除这类产物。

- **清单只有一处**：`test/evidence.mjs` 的 `EVIDENCE` 表，逐套件列出它需要的证据文件或
  目录；`scripts/run-tests.mjs` 与每个套件的证据门都用这张表，改套件时只改这一处。
- **默认位置**：`<repo>/docs`。证据放在别处时用环境变量指过去：

  ```sh
  export CHATGPT_UI_EVIDENCE=/path/to/_archive/dsh-chatgpt-ui/docs
  npm test
  ```

  只有采集产物会被重定向；`docs/` 里提交的散文（`testing.md`、`architecture.md` 等）永远
  从仓库读。
- **怎么生成**：按第 4 节在隔离实例里跑对应的采集脚本，产物落在 `docs/`。每个套件的
  `SKIP` 行会直接列出它缺哪些文件，按名去找对应脚本即可。

### 没有证据时会怎样

套件**跳过**，不通过也不失败，并把原因打在输出里：

```
SKIP  test/m25.test.mjs — 缺少本机证据：docs/m25.json、docs/m25-sheets.json、docs/screenshots（docs/testing.md §2）
```

- 手写 `check()` 的套件在模块顶层加载证据，所以在读证据前就 `SKIP` 并退出 0。
- `node:test` 套件用 `{ skip }` 标记每个用例，`ℹ skipped` 计数与逐条原因都在输出里。
- `npm test` 自己按证据是否齐全分层：开头一行说明这次跑的是哪一层，结尾一行汇总
  `passed · skipped · failed`。**skip 不计入通过**，也不会让退出码变 1；只有真的失败才非零。

这不是「假装通过」的旁路：证据齐全时全量套件必须通过，缺证据时失败即失败——
证据门只负责把「本机没有证据」与「证据说实现坏了」区分开。

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
dsh web --no-open --port 3105          # 打印带 token 的 URL
```

- **矩阵**：`npm run matrix -- --url "http://127.0.0.1:3105/?token=…" --playwright …`
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
node tools/showcase-capture.mjs --url "http://127.0.0.1:3105/?token=…"
```

脚本默认只接受 `127.0.0.1:3105`（可用 `--port` 改），固定 1440×900 @2x、深色、
zh-CN，并断言：推理强度滑块确实展开、面板右边缘与触发药丸右边缘对齐（差 ≤1px）、
空态面板在药丸下方 8px、只存在一个展开的触发药丸、没有 hover 卡片遮住对话、界面里
不出现本机路径。

演示数据全部用英文，避免和中文界面混在一起：三个项目 `Demo Project`（3 条会话）、
`Personal Notes`（3 条）、`Marketing Site`（2 条），其中 `Draft the README outline`
有一条完整对话（用户气泡 + 助手回答）。截图里不允许出现真实项目名、会话标题、
用户路径或头像——提交前逐张目检。

## 6. 已知的验收边界

- 参考里的语音/录音入口不迁移（DSH 没有对应能力）。
- 宿主没有文件写/上传/删除 API，相关按钮不画。
- 项目说明只存浏览器 localStorage。
- `<1024px` 由宿主折叠侧栏；640px 参考没有导轨，DSH 保留 52px 导轨。
- 设置面板打开时被宿主 modal 遮罩覆盖导轨，这是宿主行为，皮肤不绕过。
