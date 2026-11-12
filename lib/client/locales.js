/**
 * dsh-chatgpt-ui — localized copy (browser half fragment).
 *
 * The skin's own text (mode segments, hero cards, brand name, confirm copy) is
 * registered as one locale namespace, so switching the host's Language setting
 * re-renders it the same way the host's own text does. Both dictionaries are
 * complete: the host requires every built-in locale for a namespace.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory.
 */

/** Namespace owned by this skin. */
const CHATGPT_LOCALE_NS = 'chatgpt-ui'

/** Complete dictionaries for the shipped locales. */
const CHATGPT_LOCALES = {
  en: {
    'brand.switch': 'Switch product',
    'brand.menu': 'Products',
    'mode.label': 'Conversation mode',
    'mode.chat': 'Chat',
    'mode.agent': 'Work',
    'mode.dot': 'dot',
    'mode.readonly': 'Read-only',
    'mode.readonly.title': 'Chat mode is read-only: no file writes, no shell commands.',
    'mode.chat.hint': 'Conversation only: no shell, no file writes',
    'mode.agent.hint': 'Work: shell, files and tools',
    'mode.dot.hint': 'Open the dot super-agent panel',
    'mode.confirm.title': 'This conversation already started',
    'mode.confirm.body': 'This chat already started — switch in a new chat?',
    'mode.confirm.action': 'New chat',
    'mode.confirm.cancel': 'Keep current mode',
    'mode.hero.chat': 'Chat',
    'mode.hero.chat.desc': 'Ask anything',
    'mode.hero.agent': 'Work',
    'mode.hero.agent.desc': 'Shell, files and tools',
    'mode.hero.dot': 'dot',
    'mode.hero.dot.desc': 'Open the dot panel',
    'work.effort': 'Reasoning effort',
    'work.model': 'Model',
    'work.effort.hint': 'Left/Right to adjust',
    'work.effort.max': 'Highest effort',
    'work.approval': 'Approve for me',
    'work.approval.hint': 'What this session may do without asking',
    'work.permission': 'Permissions',
    'work.permission.hint': 'Current approval level for this session',
    'work.permission.chatLocked': 'Chat mode is pinned to read-only; escalation is unavailable',
    'work.tools.project': 'Choose project',
    'work.tools.files': 'Files',
    'work.tools.plugins': 'Plugins',
    'work.tools.desktop': 'Open desktop app',
    'work.dictate': 'Dictate',
    'work.voice': 'Voice',
    'work.unavailable': 'Not available in DSH yet',
    'work.newSessionIn': 'New session in'
  },
  zh: {
    'brand.switch': '切换产品',
    'brand.menu': '产品',
    'mode.label': '对话模式',
    'mode.chat': '聊天',
    'mode.agent': '工作',
    'mode.dot': 'dot',
    'mode.readonly': '只读',
    'mode.readonly.title': 'Chat 模式固定只读：不能写文件、不能执行命令。',
    'mode.chat.hint': '纯对话：无 shell、无文件写',
    'mode.agent.hint': '工作模式：shell、文件与工具',
    'mode.dot.hint': '打开 dot 超级代理面板',
    'mode.confirm.title': '这个会话已经开始对话',
    'mode.confirm.body': '这个对话已经开始了，新开一个再切换？',
    'mode.confirm.action': '新建并切换',
    'mode.confirm.cancel': '保持当前模式',
    'mode.hero.chat': '聊天',
    'mode.hero.chat.desc': '随便问',
    'mode.hero.agent': '工作',
    'mode.hero.agent.desc': 'shell、文件与工具',
    'mode.hero.dot': 'dot',
    'mode.hero.dot.desc': '打开 dot 面板',
    'work.effort': '推理强度',
    'work.model': '模型',
    'work.effort.hint': '左右方向键调整',
    'work.effort.max': '已到最高档',
    'work.approval': '帮我批准',
    'work.approval.hint': '这个会话在什么范围内可以不经询问直接执行',
    'work.permission': '权限',
    'work.permission.hint': '当前会话的审批级别',
    'work.permission.chatLocked': 'Chat 模式固定只读，无法提升',
    'work.tools.project': '选择项目',
    'work.tools.files': '文件',
    'work.tools.plugins': '插件',
    'work.tools.desktop': '打开桌面应用',
    'work.dictate': '听写',
    'work.voice': '语音',
    'work.unavailable': 'DSH 暂未接入',
    'work.newSessionIn': '在该项目新建会话'
  }
}

/**
 * Register the skin's dictionaries.
 * @param {object} ctx - client Cordis context (needs `locale`).
 * @returns {() => void} disposer removing every dictionary.
 */
function mountChatgptLocales(ctx) {
  const disposers = []
  for (const [locale, dict] of Object.entries(CHATGPT_LOCALES)) {
    disposers.push(ctx.locale.register(CHATGPT_LOCALE_NS, locale, dict))
  }
  return () => {
    for (const dispose of disposers) dispose()
  }
}
