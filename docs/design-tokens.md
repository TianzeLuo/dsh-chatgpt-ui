# 样式令牌

令牌分两层，都在 `body[data-chatgpt-ui]` 上定义，所以卸载插件即整体消失：

| 文件 | 层 | 内容 |
| --- | --- | --- |
| `lib/client/css/00-tokens.css` | 文案/旋钮 | 问候语、占位符、卡片高度上限、宿主变量重定向 |
| `lib/client/css/05-cgpt-tokens.css` | 语义层（浅色） | 颜色、圆角、字号、间距、几何 |
| `lib/client/css/06-cgpt-tokens-dark.css` | 语义层（暗色） | 仅 `[data-ds-dark-theme]` 下生效 |

规则里只准出现 `--cgpt-*` / `--dsh-chatgpt-*` 语义名；**原始色值只允许写在上面三份
令牌文件里**（`test/work-composer.test.mjs` 会失败于规则层出现的裸色值）。

## 1. 颜色

| 令牌 | 浅色 | 暗色 | 用途 |
| --- | --- | --- | --- |
| `--cgpt-surface-main` | `#fcfcfc` | `#0e0e0e` | 主内容底 |
| `--cgpt-surface-rail` | `#f9f9f9` | `#000000` | 52px 导轨 |
| `--cgpt-surface-panel` | `#fcfcfc` | `#0e0e0e` | 侧栏面板 |
| `--cgpt-surface-raised` | `#ffffff` | `#212121` | 卡片/输入卡 |
| `--cgpt-surface-hover` | `rgba(13,13,13,.05)` | `rgba(255,255,255,.1)` | 悬停 |
| `--cgpt-surface-selected` | `#ececec` | `#1a1a1a` | 选中行 |
| `--cgpt-surface-segment` | `rgba(13,13,13,.03)` | `#1b1b1b` | 分段轨道 |
| `--cgpt-text-primary` | `#0d0d0d` | `#ededed` | 正文 |
| `--cgpt-text-secondary` | `#5d5d5d` | `#cdcdcd` | 次要文字 |
| `--cgpt-text-tertiary` | `#8f8f8f` | `#afafaf` | 辅助/图标未选中 |
| `--cgpt-text-placeholder` | `#767676` | `#afafaf` | 占位符（浅色单独调深过 AA） |
| `--cgpt-text-danger` | `#b42318` | `#ff8a80` | 危险操作 |
| `--cgpt-border-subtle` | `rgba(0,0,0,.1)` | `rgba(255,255,255,.16)` | 描边 |
| `--cgpt-border-strong` | `rgba(0,0,0,.16)` | `rgba(255,255,255,.24)` | 强调描边 |
| `--cgpt-accent` | `var(--dsw-alias-brand-primary)` | 同左 | 品牌色沿用宿主，不改宿主控件 |

推理强度面板自带一组色：轨道 `#e9e9e9` / `#3f3f3f`，填充 `#2f7cf6`，档位名
`#4c8dff`，最高档渐变 `#4f6bff → #a855f7 → #7c3aed`（浅色 `#6e84ff → #b57bf6 →
#8b5cf6`）。

## 2. 圆角

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--cgpt-radius-panel` | `16px` | 侧栏面板、浮层 |
| `--cgpt-radius-control` | `10px` | 按钮、控件 |
| `--cgpt-radius-row` | `8px` | 列表行 |
| `--cgpt-radius-row-menu` | `12px` | 菜单行 |
| `--cgpt-radius-full` | `999px` | 胶囊 |
| `--cgpt-composer-empty-radius` | `26px` | 空态输入卡 |
| `--dsh-chatgpt-radius-bubble` | `18px` | 通用气泡 |
| 用户气泡（`30-chat.css`） | `22px` | 实测值，见下表 |

## 3. 字号与行高

| 位置 | 值 |
| --- | --- |
| 消息正文 `--cgpt-msg-font-size` / `--cgpt-msg-line-height` | `16px` / `26px` |
| 空态输入卡文字 | `16px` / `26px` |
| 已开会话输入卡占位符 | `15px` |
| 菜单行 | `14px`，行高 36px |
| 侧栏分组标题（项目/最近） | `14px`，行高 36px |
| 分段控件文字 | `14px` |
| 推理强度档位名 | `18px`/600，颜色 `#4c8dff` |
| 推理强度面板模型名 | `15px`/400，`›` 12px |

字体族沿用宿主（`--dsw-font-*`），插件不引入 Web 字体，避免 FOUT 与回退差异。

## 4. 间距

| 令牌 | 值 |
| --- | --- |
| `--cgpt-space-1` … `--cgpt-space-6` | `2 / 4 / 6 / 8 / 10 / 12px` |

面板内边距按「外层 8 + 内层 4/8/8」复刻参考的 12/16/16 节奏；行内水平内边距 10px，
行间距 2px。

## 5. 几何

| 对象 | 尺寸 |
| --- | --- |
| 导轨 + 侧栏 | `52 + 288 = 340px` |
| 导轨按钮 / 图标 | `36px` / `20px`，间距 8px，圆角 10px |
| `新聊天` 行 | `276×35`，圆角 8px；会话行 32px |
| 产品分段 | `224×36`，两半各 `112×36` |
| 消息列宽 | 宿主驱动，皮肤上限 `--cgpt-msg-max: 920px` |
| 用户气泡 | 圆角 `22px`、内边距 `10px 16px` |
| 空态输入卡 | `757×52`，圆角 26px；已开会话卡片 = 消息列 − 60px |
| 输入卡内容上限 | `min(336px, 40vh)`，超出内部滚动 |
| 推理强度面板 | 宽 `280px`，外层内边距 10px，圆角 `var(--cgpt-overlay-radius)`（16px）；右边缘对齐药丸右边缘，与药丸间距 8px；已开会话向上覆盖输入卡，空态向下 |
| 面板模型列表 | 行高 32px（点击区 32px），分组标题 26px；滚动区在面板 10px 内边距内，滚动条 8px |
| 强度滑轨 | `252×36`，圆角 18px，5 个 5px 档位点，手柄 44px 正圆 |
| 模型/强度药丸 | 高 36px，展开后文案为「选择推理强度」 |

## 6. 响应式与动效

- 断点：640 / 768 / 900 / 1024 / 1280 / 1600（见 `docs/testing.md` 的响应式审计）；
  `<1024px` 由**宿主**自动折叠侧栏，皮肤不接管这个行为。
- 空态渐显 180ms；最高档渐变一次性 2s 揭示；`prefers-reduced-motion: reduce` 下两者都
  关闭，滑块过渡同时取消。
- 焦点环 2px，偏移 2px；全部控件在浅/深两套主题下满足 4.5:1。
