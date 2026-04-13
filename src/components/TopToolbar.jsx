import { useSettings } from '../contexts/SettingsContext';
import { t } from '../utils/i18n';

export default function TopToolbar({ title }) {
  // 1. 获取上下文中提供的主题和语言状态与切换方法
  const { theme, setTheme, language, setLanguage } = useSettings();

  // 2. 切换主题函数
  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // 3. 切换语言函数
  const handleLanguageToggle = () => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-[#111316] border-b border-outline-variant/10 sticky top-0 z-50 shrink-0 transition-colors duration-200">
      <div className="flex items-center gap-8 flex-1">
        <span className="text-lg font-headline font-bold text-on-surface">{title || t('toolbar.title', language)}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {/* 主题切换按钮 */}
          <button
            onClick={handleThemeToggle}
            className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-high rounded-full transition-all active:scale-95 duration-200"
            title={theme === 'dark' ? t('toolbar.switchToLight', language) : t('toolbar.switchToDark', language)}
          >
            {/* 动态切换图标：如果是暗色模式就显示月亮(或太阳)，这里我们根据状态变换 */}
            <span className="material-symbols-outlined">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* 语言切换按钮 */}
          <button
            onClick={handleLanguageToggle}
            className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-high rounded-full transition-all active:scale-95 duration-200"
            title={language === 'en' ? t('toolbar.switchToChinese', language) : t('toolbar.switchToEnglish', language)}
          >
            <span className="material-symbols-outlined">language</span>
          </button>
        </div>

        {/* 头像区域 */}
        <div className="h-8 w-8 rounded-full bg-surface-container-high overflow-hidden border border-outline-variant/20">
          <img
            alt="User profile"
            className="h-full w-full object-cover"
            src="/1.jpg"  /* 替换为本地的 1.jpg */
          />
        </div>
      </div>
    </header>
  );
}