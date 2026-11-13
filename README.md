# dsh-chatgpt-ui

ChatGPT 桌面版风格的 DSH Web GUI 皮肤：只换外观，不动行为——装与不装插件，任务/目标、执行步骤、文件与输出聚合、折叠面板全部原样保留。

## 截图

![Chat 模式空态，推理强度面板在输入卡上方展开](docs/images/new-session-effort-dark.png)

![既有会话：用户气泡、助手正文与底部输入卡](docs/images/session-dark.png)

## 安装

```bash
dsh plugin --profile web add github:TianzeLuo/dsh-chatgpt-ui
```

1. 重启 `dsh web`（patch 层只在启动时展开）
2. 刷新页面

卸载：`dsh plugin --profile web remove dsh-chatgpt-ui`，重启后标记、样式与令牌还原。

开发调试时可改装本地目录：`dsh plugin --profile web add /path/to/dsh-chatgpt-ui`。

装不上或装完没反应，看 [排障](docs/troubleshooting.md)。

## 兼容性

| 项 | 值 |
| --- | --- |
| DSH | `>=0.2.1-rc.1`（只写下界） |
| 验证于 | 0.2.2-rc.3（2026-11-13）；0.2.1-rc.1 此前验证过 |
| Node | `>=22.5` |
| 平台 | WSL2 / Linux 已验证；Windows 未在当前版本复测 |

## 能做什么

- **Chat / Work 双模式**：侧栏、项目与会话列表、空态与输入卡按桌面版布局复刻，切换模式不闪。
- **完整界面覆盖**：消息区、模型与推理强度药丸、设置/插件/定时入口、`/` 命令、`@` 引用与搜索都做了视觉适配。
- **明暗主题与响应式**：跟随宿主主题偏好，窄窗由宿主折叠侧栏；样式作用域收口，卸载即还原。
- **保留 DSH 原生行为**：任务与目标、执行步骤、文件/输出聚合、折叠面板、审批与工具调用都走宿主原装组件。

## 用法

| 触发方式 | 位置 | 行为 |
| --- | --- | --- |
| 切换 Chat / Work | 侧栏顶部或新建会话 | Chat 为只读 preset；已开始的会话不能换，需新建 |
| 打开设置 / 插件 / 定时任务 | 侧栏入口 | 宿主原生面板，皮肤只做外观适配 |
| 关闭皮肤 | 卸载插件或刷新 | 页面恢复 DSH 原生外观与布局，行为不变 |

关掉插件后：界面回到 DSH 默认皮肤，会话、项目与数据都不受影响。

样式令牌、选择器契约与模块边界见 [架构](docs/architecture.md) 与 [样式令牌](docs/design-tokens.md)；边界见 [已知限制](docs/limitations.md)。

## 已知限制

- Chat 模式是只读 preset：无 shell、无文件写、无子代理；已开始的会话不能换产品。
- 项目说明只存在浏览器 localStorage，换浏览器即丢失。
- 宿主没有文件写 / 上传 / 删除接口，项目页与输入卡里不画这些按钮。

## 文档

| 文件 | 内容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 插件结构、槽位注入、样式作用域与选择器契约 |
| [docs/design-tokens.md](docs/design-tokens.md) | 颜色、圆角、字号、间距与几何令牌 |
| [docs/testing.md](docs/testing.md) | 核心测试、证据采集与截图复跑 |
| [docs/limitations.md](docs/limitations.md) | 已知限制、未实测项与兼容层 |
| [docs/roadmap.md](docs/roadmap.md) | 还差什么、为什么先不做 |
| [docs/development.md](docs/development.md) | 构建、目录约定与开发流程 |
| [docs/troubleshooting.md](docs/troubleshooting.md) | 常见故障排查 |
| [CHANGELOG.md](CHANGELOG.md) | 面向用户的版本变化 |

## 隐私与数据

- 读取：宿主已渲染的会话标题、项目与文件信息，只用于皮肤布局；不读取会话正文以外的本机文件。
- 外发：不发起任何网络请求，模型调用仍走 DSH 原有链路。
- 存储：只有项目说明写入浏览器 localStorage；截图演示数据在临时隔离实例中生成。
- 关闭后：`<style>`、令牌层与 `<body>` 标记随插件卸载移除，不刷新页面即可还原。

## 许可证

MIT，见 [LICENSE](LICENSE) © 2026 Tianze Luo。

本项目不是 OpenAI 官方项目，与 OpenAI 无隶属或授权关系；「ChatGPT」仅用于说明视觉参考对象。仓库不含真实会话、项目数据、凭据或用户路径。
