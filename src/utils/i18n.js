/**
 * i18n.js
 * Lightweight bilingual dictionary for the PromptManager UI.
 * Supported locales: 'en' (English) | 'zh' (Chinese Simplified)
 *
 * Usage:
 *   import { t } from '../utils/i18n'
 *   t('settings.title', 'zh')  // → "设置"
 *   t('settings.title', 'en')  // → "Settings"
 */

const translations = {
  // ── Sidebar ──────────────────────────────────────────────────────────────
  'sidebar.newPrompt': {
    en: '+ New Prompt',
    zh: '+ 新建提示词',
  },
  'sidebar.library': {
    en: 'Library',
    zh: '提示词库',
  },
  'sidebar.history': {
    en: 'History',
    zh: '历史记录',
  },
  'sidebar.workspace': {
    en: 'Workspace',
    zh: '工作区',
  },
  'sidebar.settings': {
    en: 'Settings',
    zh: '设置',
  },
  'sidebar.support': {
    en: 'Support',
    zh: '帮助与支持',
  },
  'sidebar.documentation': {
    en: 'Documentation',
    zh: '文档',
  },
  'sidebar.noWorkspaceConfigured': {
    en: 'No workspace configured',
    zh: '未配置工作区',
  },
  'sidebar.goToSettings': {
    en: 'Go to Settings',
    zh: '前往设置',
  },
  'toolbar.title': {
    en: 'Architectural Editor',
    zh: '架构编辑器',
  },
  'toolbar.switchToLight': {
    en: 'Switch to Light Mode',
    zh: '切换到浅色模式',
  },
  'toolbar.switchToDark': {
    en: 'Switch to Dark Mode',
    zh: '切换到深色模式',
  },
  'toolbar.switchToChinese': {
    en: 'Switch to Chinese',
    zh: '切换到中文',
  },
  'toolbar.switchToEnglish': {
    en: 'Switch to English',
    zh: 'Switch to English',
  },

  // ── Settings Page ─────────────────────────────────────────────────────────
  'settings.title': {
    en: 'Settings',
    zh: '设置',
  },
  'settings.subtitle': {
    en: 'Manage your workspace preferences and local configuration.',
    zh: '管理您的工作区偏好设置和本地配置。',
  },

  // Appearance
  'settings.appearance.title': {
    en: 'Appearance',
    zh: '外观',
  },
  'settings.appearance.lightMode': {
    en: 'Light Mode',
    zh: '浅色模式',
  },
  'settings.appearance.darkMode': {
    en: 'Dark Mode',
    zh: '深色模式',
  },
  'settings.appearance.hint': {
    en: 'Theme shifts are applied instantly across the entire workspace.',
    zh: '主题将立即应用于整个工作区。',
  },

  // Language
  'settings.language.title': {
    en: 'Language',
    zh: '语言',
  },
  'settings.language.english': {
    en: 'English',
    zh: 'English',
  },
  'settings.language.chinese': {
    en: 'Chinese (Simplified)',
    zh: '简体中文',
  },

  // Local Storage
  'settings.storage.title': {
    en: 'Local Storage Path',
    zh: '本地存储路径',
  },
  'settings.storage.badge': {
    en: 'Read / Write Enabled',
    zh: '读写已启用',
  },
  'settings.storage.placeholder': {
    en: 'No folder selected — click Browse to choose one',
    zh: '未选择文件夹，请点击"选择目录"',
  },
  'settings.storage.browse': {
    en: 'Browse Folder',
    zh: '选择目录',
  },
  'settings.storage.reset': {
    en: 'Reset Default',
    zh: '重置默认',
  },

  // Asset Preview
  'settings.assets.totalFiles': {
    en: 'Total Assets',
    zh: '文件总数',
  },
  'settings.assets.diskUsage': {
    en: 'Disk Usage',
    zh: '磁盘占用',
  },
  'settings.assets.lastSync': {
    en: 'Last Sync',
    zh: '上次同步',
  },
  'settings.assets.scanning': {
    en: 'Scanning…',
    zh: '扫描中…',
  },
  'settings.assets.noFolder': {
    en: 'No folder selected',
    zh: '未选择文件夹',
  },
  'settings.assets.never': {
    en: 'Never',
    zh: '从未',
  },
  'settings.assets.clean': {
    en: 'Synced',
    zh: '已同步',
  },
  'settings.assets.dirty': {
    en: 'Uncommitted changes',
    zh: '有未提交更改',
  },

  // Export
  'settings.export.title': {
    en: 'Export Workspace',
    zh: '导出工作区',
  },
  'settings.export.description': {
    en: 'Back up your entire prompt collection as a .zip archive.',
    zh: '将全部提示词文件打包为 .zip 压缩包并下载。',
  },
  'settings.export.hint': {
    en: 'Supports .md, .json, .yaml',
    zh: '支持 .md、.json、.yaml 格式',
  },
  'settings.export.exporting': {
    en: 'Exporting…',
    zh: '导出中…',
  },
  'settings.export.noFolder': {
    en: 'Please select a workspace folder first.',
    zh: '请先选择工作区文件夹。',
  },

  // ── Import ───────────────────────────────────────────────────────────────
  'settings.import.title': {
    en: 'Import Data',
    zh: '导入数据',
  },
  'settings.import.description': {
    en: 'Import a Markdown file to automatically open a new prompt session.',
    zh: '导入 Markdown 文件，自动在新建提示词页面打开。',
  },
  'settings.import.hint': {
    en: 'Supports .md files only',
    zh: '仅支持 .md 格式',
  },

  // ── Save Modal ────────────────────────────────────────────────────────
  'editor.save.title': {
    en: 'Save Prompt',
    zh: '保存提示词',
  },
  'editor.save.noWorkspace': {
    en: 'Workspace not set. Please configure it in Settings first.',
    zh: '未设置工作区，请先在设置中配置。',
  },
  'editor.save.goToSettings': {
    en: 'Go to Settings',
    zh: '前往设置',
  },
  'editor.save.cancel': {
    en: 'Cancel',
    zh: '取消',
  },
  'editor.save.confirm': {
    en: 'Save Here',
    zh: '保存到此处',
  },
  'editor.save.newFolder': {
    en: 'New Folder',
    zh: '新建文件夹',
  },
  'editor.save.folderNamePlaceholder': {
    en: 'Folder name...',
    zh: '文件夹名称...',
  },
  'editor.save.saving': {
    en: 'Saving...',
    zh: '保存中...',
  },
  'editor.save.success': {
    en: 'File saved successfully!',
    zh: '文件保存成功！',
  },
  'editor.save.overwritePrompt': {
    en: 'A file with this name already exists. Overwrite?',
    zh: '同名文件已存在，是否覆盖？',
  },

  // Common
  'common.loading': {
    en: 'Loading…',
    zh: '加载中…',
  },
  'common.error': {
    en: 'Error',
    zh: '错误',
  },
}

/**
 * Translate a key into the target locale.
 * Falls back to English if the locale is not found.
 * @param {string} key        – dot-notation key from the translations map
 * @param {'en'|'zh'} locale  – target locale
 * @returns {string}
 */
function t(key, locale = 'en') {
  const entry = translations[key]
  if (!entry) {
    console.warn(`[i18n] Missing translation key: "${key}"`)
    return key
  }
  return entry[locale] ?? entry['en'] ?? key
}

/**
 * Returns all keys that start with a given namespace prefix.
 * Useful for iterating a section's translations.
 * @param {string} prefix – e.g. "settings.language"
 * @param {'en'|'zh'} locale
 * @returns {Record<string, string>}
 */
function tSection(prefix, locale = 'en') {
  return Object.fromEntries(
    Object.entries(translations)
      .filter(([k]) => k.startsWith(prefix + '.'))
      .map(([k, v]) => [k.slice(prefix.length + 1), v[locale] ?? v['en'] ?? k])
  )
}

export { t, tSection, translations }
