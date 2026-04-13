import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import TopToolbar from '../components/TopToolbar';
import { useSettings } from '../contexts/SettingsContext';
import { t } from '../utils/i18n';
import { scanDirectory, formatBytes } from '../utils/fileSystem';

// ─── Asset Stats Hook ─────────────────────────────────────────────────────────
function useAssetStats(workspaceHandle) {
  const [stats, setStats] = useState({ fileCount: null, totalBytes: null, scanning: false });

  useEffect(() => {
    if (!workspaceHandle) {
      setStats({ fileCount: null, totalBytes: null, scanning: false });
      return;
    }
    let cancelled = false;
    setStats(s => ({ ...s, scanning: true }));
    scanDirectory(workspaceHandle).then(({ fileCount, totalBytes }) => {
      if (!cancelled) setStats({ fileCount, totalBytes, scanning: false });
    }).catch(() => {
      if (!cancelled) setStats({ fileCount: 0, totalBytes: 0, scanning: false });
    });
    return () => { cancelled = true; };
  }, [workspaceHandle]);

  return stats;
}

// ─── Git Status Hook ──────────────────────────────────────────────────────────
function useGitStatus() {
  const [gitInfo, setGitInfo] = useState({ lastCommitDate: null, isDirty: null, loading: true, error: false });

  useEffect(() => {
    fetch('/api/git-status')
      .then(r => r.json())
      .then(data => setGitInfo({ ...data, loading: false, error: false }))
      .catch(() => setGitInfo({ lastCommitDate: null, isDirty: null, loading: false, error: true }));
  }, []);

  return gitInfo;
}

// ─── Relative Time Formatter ─────────────────────────────────────────────────
function relativeTime(isoDate, lang) {
  if (!isoDate) return lang === 'zh' ? '从未' : 'Never';
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return lang === 'zh' ? `${diff}秒前` : `${diff}s ago`;
  if (diff < 3600) return lang === 'zh' ? `${Math.floor(diff / 60)}分钟前` : `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return lang === 'zh' ? `${Math.floor(diff / 3600)}小时前` : `${Math.floor(diff / 3600)}h ago`;
  return lang === 'zh' ? `${Math.floor(diff / 86400)}天前` : `${Math.floor(diff / 86400)}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Settings() {
  const { theme, setTheme, language, setLanguage, workspaceHandle, workspaceRestored, chooseWorkspace, resetWorkspace } = useSettings();
  const navigate = useNavigate();

  const stats = useAssetStats(workspaceHandle);
  const gitInfo = useGitStatus();

  const [isExporting, setIsExporting] = useState(false);
  const importInputRef = useRef(null);

  const tr = (key) => t(key, language);

  // ── Export Workspace ──────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!workspaceHandle) {
      alert(tr('settings.export.noFolder'));
      return;
    }
    setIsExporting(true);
    try {
      const zip = new JSZip();

      async function addToZip(dirHandle, folder) {
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            folder.file(entry.name, await file.arrayBuffer());
          } else if (entry.kind === 'directory') {
            await addToZip(entry, folder.folder(entry.name));
          }
        }
      }

      await addToZip(workspaceHandle, zip);

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Settings] Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Import Markdown ───────────────────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.md')) return;

    const content = await file.text();
    const filename = file.name.replace(/\.md$/, '');

    // Navigate to Editor with the imported content as route state
    navigate('/', { state: { importedContent: content, importedFilename: filename } });

    // Reset the file input so the same file can be re-imported later
    e.target.value = '';
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
      <TopToolbar title={tr('settings.title')} />

      <div className="flex-1 overflow-y-auto hide-scrollbar p-8 lg:p-12">
        <div className="max-w-4xl mx-auto">

          {/* Page Header */}
          <header className="mb-12">
            <h1 className="text-4xl font-headline font-bold text-on-background tracking-tight mb-2">
              {tr('settings.title')}
            </h1>
            <p className="text-on-surface-variant font-body">{tr('settings.subtitle')}</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* ── Appearance ─────────────────────────────────────────────── */}
            <section className="bg-surface-container-low rounded-xl p-6 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">palette</span>
                <h2 className="text-lg font-headline font-semibold text-on-surface">
                  {tr('settings.appearance.title')}
                </h2>
              </div>

              <div className="flex bg-surface-container p-1 rounded-2xl w-full gap-1">
                <button
                  id="theme-light-btn"
                  onClick={() => setTheme('light')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all cursor-pointer ${theme === 'light'
                    ? 'bg-surface-container-lowest text-primary shadow-ambient'
                    : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">light_mode</span>
                  {tr('settings.appearance.lightMode')}
                </button>
                <button
                  id="theme-dark-btn"
                  onClick={() => setTheme('dark')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl transition-all cursor-pointer ${theme === 'dark'
                    ? 'bg-surface-container-highest text-primary shadow-ambient'
                    : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">dark_mode</span>
                  {tr('settings.appearance.darkMode')}
                </button>
              </div>

              <p className="text-xs text-on-surface-variant italic">
                {tr('settings.appearance.hint')}
              </p>
            </section>

            {/* ── Language ───────────────────────────────────────────────── */}
            <section className="bg-surface-container-low rounded-xl p-6 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary">translate</span>
                <h2 className="text-lg font-headline font-semibold text-on-surface">
                  {tr('settings.language.title')}
                </h2>
              </div>

              <div className="space-y-2">
                {[
                  { code: 'en', label: tr('settings.language.english') },
                  { code: 'zh', label: tr('settings.language.chinese') },
                ].map(({ code, label }) => (
                  <button
                    key={code}
                    id={`lang-${code}-btn`}
                    onClick={() => setLanguage(code)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all cursor-pointer ${language === code
                      ? 'bg-surface-container text-on-surface'
                      : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full transition-colors ${language === code ? 'bg-primary' : 'bg-outline-variant'}`} />
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    {language === code && (
                      <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* ── Local Storage Path ─────────────────────────────────────── */}
            <section className="md:col-span-2 bg-surface-container-low rounded-xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">folder_special</span>
                  <h2 className="text-lg font-headline font-semibold text-on-surface">
                    {tr('settings.storage.title')}
                  </h2>
                </div>
                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded-lg">
                  {tr('settings.storage.badge')}
                </span>
              </div>

              <div className="flex flex-col gap-4">
                {/* Path display */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">terminal</span>
                  </div>
                  <input
                    id="workspace-path-input"
                    className="w-full bg-surface-container-lowest text-on-surface font-mono text-sm pl-12 pr-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    spellCheck="false"
                    readOnly
                    type="text"
                    value={
                      workspaceRestored
                        ? (workspaceHandle ? workspaceHandle.name : '')
                        : '…'
                    }
                    placeholder={tr('settings.storage.placeholder')}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    id="workspace-reset-btn"
                    onClick={resetWorkspace}
                    className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer rounded-xl hover:bg-surface-container"
                  >
                    {tr('settings.storage.reset')}
                  </button>
                  <button
                    id="workspace-browse-btn"
                    onClick={chooseWorkspace}
                    className="px-6 py-2 text-sm font-medium text-white rounded-xl shadow-ambient active:scale-95 transition-all cursor-pointer btn-primary-gradient"
                  >
                    {tr('settings.storage.browse')}
                  </button>
                </div>
              </div>

              {/* ── Asset Preview ─────────────────────────────────────────── */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Assets */}
                <div className="bg-surface-container p-4 rounded-xl border-l-4 border-primary">
                  <span className="block text-xs text-on-surface-variant uppercase tracking-widest font-semibold mb-1">
                    {tr('settings.assets.totalFiles')}
                  </span>
                  <span className="text-2xl font-headline font-bold text-on-surface">
                    {stats.scanning
                      ? tr('settings.assets.scanning')
                      : stats.fileCount === null
                        ? tr('settings.assets.noFolder')
                        : `${stats.fileCount.toLocaleString()} files`}
                  </span>
                </div>

                {/* Disk Usage */}
                <div className="bg-surface-container p-4 rounded-xl border-l-4 border-secondary">
                  <span className="block text-xs text-on-surface-variant uppercase tracking-widest font-semibold mb-1">
                    {tr('settings.assets.diskUsage')}
                  </span>
                  <span className="text-2xl font-headline font-bold text-on-surface">
                    {stats.scanning
                      ? tr('settings.assets.scanning')
                      : stats.totalBytes === null
                        ? '—'
                        : formatBytes(stats.totalBytes)}
                  </span>
                </div>

                {/* Last Sync */}
                <div className="bg-surface-container p-4 rounded-xl border-l-4 border-tertiary">
                  <span className="block text-xs text-on-surface-variant uppercase tracking-widest font-semibold mb-1">
                    {tr('settings.assets.lastSync')}
                  </span>
                  <span className="text-2xl font-headline font-bold text-on-surface">
                    {gitInfo.loading
                      ? tr('common.loading')
                      : gitInfo.error
                        ? tr('settings.assets.never')
                        : relativeTime(gitInfo.lastCommitDate, language)}
                  </span>
                  {!gitInfo.loading && !gitInfo.error && (
                    <span className={`block text-xs mt-1 font-medium ${gitInfo.isDirty ? 'text-error' : 'text-secondary'}`}>
                      {gitInfo.isDirty ? tr('settings.assets.dirty') : tr('settings.assets.clean')}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* ── Export / Import ────────────────────────────────────────── */}
            <section className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Export */}
              <button
                id="export-workspace-btn"
                onClick={handleExport}
                disabled={isExporting}
                className="bg-surface-container-high rounded-xl p-8 text-left group hover:bg-surface-bright transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-3xl">
                      {isExporting ? 'hourglass_empty' : 'ios_share'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-headline font-bold text-on-surface">
                      {tr('settings.export.title')}
                    </h3>
                    <p className="text-sm text-on-surface-variant">
                      {isExporting ? tr('settings.export.exporting') : tr('settings.export.description')}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-6">
                  <span className="text-xs text-on-surface-variant">{tr('settings.export.hint')}</span>
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </div>
              </button>

              {/* Import */}
              <button
                id="import-data-btn"
                onClick={() => importInputRef.current?.click()}
                className="bg-surface-container-high rounded-xl p-8 text-left group hover:bg-surface-bright transition-all cursor-pointer"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-secondary text-3xl">file_upload</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-headline font-bold text-on-surface">
                      {tr('settings.import.title')}
                    </h3>
                    <p className="text-sm text-on-surface-variant">{tr('settings.import.description')}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-6">
                  <span className="text-xs text-on-surface-variant">{tr('settings.import.hint')}</span>
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </div>
              </button>

              {/* Hidden file input for import */}
              <input
                ref={importInputRef}
                type="file"
                accept=".md"
                className="hidden"
                onChange={handleImportFile}
              />
            </section>

          </div>

          {/* Footer */}
          <footer className="mt-20 pt-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 opacity-50">
            <p className="text-xs font-mono text-on-surface-variant">v0.1.0-alpha | PromptManager</p>
            <p className="text-xs font-mono text-on-surface-variant"><a href="https://github.com/sibuchen">Made with ❤️ by sibuchen</a></p>
          </footer>

        </div>
      </div>
    </div>
  );
}
