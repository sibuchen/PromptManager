import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../utils/i18n';
import WorkspaceTree from './WorkspaceTree';

export default function Sidebar() {
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const { workspaceHandle, theme, language } = useSettings();
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex flex-col py-4 h-screen w-64 sticky left-0 bg-white dark:bg-[#111316] border-r border-gray-200 dark:border-[#1c1e21] z-20 transition-colors duration-200">
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3 mb-1">
          {/* 使用 public 目录下的 icon.png，并保持原有的圆角和大小 */}
          <img src="/icon.png" alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-primary-container/20" />
          {/* 在下方替换为你想要的新标题 */}
          <h1 className="text-lg font-headline font-bold text-[#e2e2e6]">PromptManager</h1>
        </div>
        {/* 在下方替换为你想要的新副标题 */}
        <p className="text-xs text-outline font-medium tracking-tight">sibuchen's studio</p>
      </div>

      <nav className="flex-1 font-body text-sm font-medium space-y-1">
        <NavLink
          to="/"
          state={{ isNew: Date.now() }} // 【新增补丁】强制注入一个时间戳状态，确保每次点击都会触发 location.key 更新
          className="mx-4 mb-2 bg-primary-container text-on-primary-container rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 font-semibold text-sm active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          {t('sidebar.newPrompt', language)}
        </NavLink>

        <NavLink
          to="/library"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-all cursor-pointer active:scale-95 ${isActive
              ? 'bg-secondary-container text-primary'
              : 'text-[#909194] hover:bg-surface-container-high hover:text-on-surface'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">folder_open</span>
          <span>{t('sidebar.library', language)}</span>
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-all cursor-pointer active:scale-95 ${isActive
              ? 'bg-secondary-container text-primary'
              : 'text-[#909194] hover:bg-surface-container-high hover:text-on-surface'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">history</span>
          <span>{t('sidebar.history', language)}</span>
        </NavLink>

        <div
          onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-all cursor-pointer active:scale-95 ${isWorkspaceOpen
            ? 'bg-secondary-container text-primary'
            : 'text-[#909194] hover:bg-surface-container-high hover:text-on-surface'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">description</span>
          <span>{t('sidebar.workspace', language)}</span>
        </div>

        {isWorkspaceOpen && (
          <div className="px-3 mb-2">
            {!workspaceHandle ? (
              <div className="bg-surface-container-low rounded-xl p-4 mx-1 border border-outline-variant/10 text-center flex flex-col gap-2 relative z-10">
                <span className="material-symbols-outlined text-outline text-2xl">folder_off</span>
                <p className="text-xs text-on-surface-variant mb-1">{t('sidebar.noWorkspaceConfigured', language)}</p>
                <button
                  onClick={() => navigate('/settings')}
                  className="bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary px-3 py-1.5 rounded-lg text-xs font-semibold self-center transition-colors shadow-sm cursor-pointer"
                >
                  {t('sidebar.goToSettings', language)}
                </button>
              </div>
            ) : (
              <WorkspaceTree workspaceHandle={workspaceHandle} />
            )}
          </div>
        )}

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-xl transition-all cursor-pointer active:scale-95 ${isActive
              ? 'bg-secondary-container text-primary'
              : 'text-[#909194] hover:bg-surface-container-high hover:text-on-surface'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span>{t('sidebar.settings', language)}</span>
        </NavLink>
      </nav>

      <footer className="p-4 mt-auto space-y-1 border-t border-outline-variant/10">
        <a
          href="https://github.com/sibuchen"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 text-[#909194] px-4 py-2 hover:bg-surface-container-high hover:text-on-surface rounded-lg transition-all cursor-pointer no-underline block"
        >
          <span className="material-symbols-outlined text-[20px]">help</span>
          <span className="text-xs">{t('sidebar.support', language)}</span>
        </a>
        <a
          href="https://github.com/sibuchen"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 text-[#909194] px-4 py-2 hover:bg-surface-container-high hover:text-on-surface rounded-lg transition-all cursor-pointer no-underline block"
        >
          <span className="material-symbols-outlined text-[20px]">menu_book</span>
          <span className="text-xs">{t('sidebar.documentation', language)}</span>
        </a>
      </footer>
    </aside>
  );
}
