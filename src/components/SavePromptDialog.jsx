import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import {
  getSubDirectory, listEntries,
  readMetadata, writeMetadata,
  stringifyMarkdown,
} from '../utils/fileSystem';
import { t } from '../utils/i18n';

/**
 * SavePromptDialog
 *
 * Props:
 *   isOpen        {boolean}
 *   onClose       {(savedInfo: {path:string[], filename:string} | null) => void}
 *                   called with savedInfo on success, null on cancel/close
 *   fileData      {{ filename, tags, preview, content }}
 *   originalFile  {{ path: string[], filename: string } | null}
 *                   null  => brand-new file  (block same-name overwrite)
 *                   value => editing existing file (auto-navigate to original dir;
 *                            silent overwrite only when path+name unchanged)
 *
 * Bug fixes:
 *   #1 – Path tracking: dialog opens in the original file's directory, not always root
 *   #2 – New-file conflict: BLOCK (do not overwrite) if a same-name file already exists
 *   #3 – Old-vs-new distinction: originalFile prop signals which mode we are in
 */
export default function SavePromptDialog({ isOpen, onClose, fileData, originalFile }) {
  const { workspaceHandle, language } = useSettings();
  const navigate = useNavigate();

  const [currentPath, setCurrentPath] = useState([]);
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [currentDirHandle, setCurrentDirHandle] = useState(null);

  const tr = (key) => t(key, language);

  // ── When dialog opens (or originalFile changes), navigate to the right dir ─
  // We compute the target path and load the directory in ONE effect so there
  // is no race between setCurrentPath() and loadDirectory(currentPath).
  useEffect(() => {
    if (!isOpen || !workspaceHandle) return;

    const targetPath = (originalFile && Array.isArray(originalFile.path))
      ? originalFile.path
      : [];

    setCurrentPath(targetPath);
    loadDirectory(targetPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceHandle, originalFile]);

  const loadDirectory = async (pathSegments) => {
    setIsLoading(true);
    try {
      const dirHandle = await getSubDirectory(workspaceHandle, pathSegments, false);
      setCurrentDirHandle(dirHandle);
      const items = await listEntries(dirHandle);
      setEntries(items);
    } catch (err) {
      console.error("Failed to load directory", err);
      if (pathSegments.length > 0) {
        setCurrentPath([]);
        loadDirectory([]); // fall back to root
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigateIn = (folderName) => {
    const newPath = [...currentPath, folderName];
    setCurrentPath(newPath);
    loadDirectory(newPath); // explicit call, no effect needed
  };

  const handleNavigateUp = () => {
    const newPath = currentPath.slice(0, -1);
    setCurrentPath(newPath);
    loadDirectory(newPath); // explicit call, no effect needed
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentDirHandle) return;
    try {
      await currentDirHandle.getDirectoryHandle(newFolderName.trim(), { create: true });
      setNewFolderName('');
      setIsCreatingFolder(false);
      loadDirectory(currentPath);
    } catch (err) {
      console.error("Failed to create folder", err);
      alert(tr('common.error') || "Error creating folder");
    }
  };

  const handleConfirmSave = async () => {
    if (!currentDirHandle) return;

    if (!workspaceHandle) {
      alert(tr('editor.save.noWorkspace') || 'Please set a Local Storage Path in Settings first.');
      return;
    }

    setIsSaving(true);

    const canonicalTags = fileData.tags ?? [];
    const canonicalPreview = fileData.preview ?? '';

    try {
      // ── 1. Serialise content with YAML Frontmatter ────────────────────────
      const finalContent = stringifyMarkdown(fileData.content, {
        tags: canonicalTags,
        preview: canonicalPreview,
      });

      // ── 2. Bug Fix #2 & #3: Determine save mode ───────────────────────────
      //
      //  isSameFileOverwrite = true
      //    → user is saving back to the exact original location (path + filename
      //      unchanged). Silent overwrite, no conflict check needed.
      //
      //  isSameFileOverwrite = false
      //    → brand-new file, or the user relocated/renamed it.
      //      Check for collision and BLOCK outright (do not allow overwrite).
      //
      const pathsEqual = (a, b) =>
        JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

      const isSameFileOverwrite =
        originalFile !== null &&
        originalFile !== undefined &&
        pathsEqual(currentPath, originalFile.path) &&
        fileData.filename === originalFile.filename;

      if (!isSameFileOverwrite) {
        // Bug Fix #2: block — do NOT silently overwrite existing files
        let exists = false;
        try {
          await currentDirHandle.getFileHandle(fileData.filename, { create: false });
          exists = true;
        } catch {
          // File not found — good, proceed
        }

        if (exists) {
          alert(
            tr('editor.save.nameConflict') ||
            `"${fileData.filename}" already exists in this folder.\n\nPlease rename your file before saving.`
          );
          setIsSaving(false);
          return; // Caller must change the filename — we will NOT overwrite
        }
      }

      // ── 3. Write the .md file ─────────────────────────────────────────────
      const mdFileHandle = await currentDirHandle.getFileHandle(fileData.filename, { create: true });
      const mdWritable = await mdFileHandle.createWritable();
      try {
        await mdWritable.write(finalContent);
        await mdWritable.close();
      } catch (writeErr) {
        try { await mdWritable.abort(); } catch { /* ignore */ }
        throw writeErr;
      }

      // ── 4. Update .metadata.json ──────────────────────────────────────────
      // Key format: "subdir/file.md" for nested, "file.md" for root
      const newMetaKey = currentPath.length > 0
        ? `${currentPath.join('/')}/${fileData.filename}`
        : fileData.filename;

      const metadata = await readMetadata(workspaceHandle);

      // If file was renamed or relocated, remove the stale old entry and delete the physical file
      if (originalFile) {
        const oldMetaKey = (originalFile.path ?? []).length > 0
          ? `${originalFile.path.join('/')}/${originalFile.filename}`
          : originalFile.filename;

        if (oldMetaKey !== newMetaKey) {
          // 1. 删除元数据索引
          if (metadata[oldMetaKey] !== undefined) {
            delete metadata[oldMetaKey];
          }

          // 2. 【新增补丁】彻底删除磁盘上的旧物理文件，防止变为“另存为”
          try {
            const oldPathSegments = originalFile.path ?? [];
            const oldDirHandle = await getSubDirectory(workspaceHandle, oldPathSegments, false);
            await oldDirHandle.removeEntry(originalFile.filename);
          } catch (delErr) {
            console.warn('[SavePromptDialog] Failed to delete old physical file:', delErr);
          }
        }
      }

      metadata[newMetaKey] = {
        tags: canonicalTags,
        preview: canonicalPreview.trim(),
        lastModified: Date.now(),
      };
      await writeMetadata(workspaceHandle, metadata);

      setIsSaving(false);
      alert(tr('editor.save.success') || 'File saved successfully!');

      // Return the actual saved location so Editor can update its originalFile state
      onClose({ path: currentPath, filename: fileData.filename });
    } catch (err) {
      console.error('[SavePromptDialog] Save failed:', err);
      if (err.name === 'NotAllowedError') {
        alert('Permission denied. Please grant write access to the folder and try again.');
      } else if (err.name === 'QuotaExceededError') {
        alert('Not enough disk space to save the file.');
      } else {
        alert(`Save failed: ${err?.message || err}`);
      }
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-on-background/20 backdrop-blur-sm p-4">
      <div className="bg-surface-container-lowest border border-outline-variant/20 shadow-ambient rounded-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-xl font-headline font-bold text-on-surface">
              {tr('editor.save.title')}
            </h2>
            {/* Bug Fix #3: clear visual indicator of save mode */}
            {originalFile ? (
              <span className="text-[10px] font-mono text-secondary uppercase tracking-widest">
                Editing existing file
              </span>
            ) : (
              <span className="text-[10px] font-mono text-primary uppercase tracking-widest">
                New file
              </span>
            )}
          </div>
          <button
            onClick={() => onClose(null)}
            className="text-outline-variant hover:text-on-surface transition-colors cursor-pointer p-1 rounded-full hover:bg-surface-container"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[50vh]">
          {!workspaceHandle ? (
            <div className="text-center py-8">
              <span className="material-symbols-outlined text-4xl text-outline-variant mb-4">folder_off</span>
              <p className="text-on-surface-variant font-medium mb-6">
                {tr('editor.save.noWorkspace')}
              </p>
              <button
                onClick={() => navigate('/settings')}
                className="px-6 py-2 rounded-xl bg-primary text-on-primary font-medium hover:brightness-110 cursor-pointer transition-all shadow-ambient"
              >
                {tr('editor.save.goToSettings')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-full">

              {/* Path Breadcrumbs */}
              <div className="flex items-center gap-2 mb-4 text-sm bg-surface-container p-2 rounded-lg overflow-x-auto hide-scrollbar">
                <button
                  onClick={() => setCurrentPath([])}
                  className="flex items-center text-outline hover:text-primary transition-colors cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">home</span>
                </button>
                {currentPath.map((segment, idx) => (
                  <div key={idx} className="flex items-center gap-2 shrink-0">
                    <span className="material-symbols-outlined text-outline-variant text-[14px]">chevron_right</span>
                    <button
                      onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                      className="text-on-surface-variant hover:text-primary transition-colors cursor-pointer font-medium"
                    >
                      {segment}
                    </button>
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div className="flex justify-between items-center mb-4">
                <div className="text-xs font-mono text-outline-variant">
                  {entries.filter(e => e.kind === 'directory').length} folders,&nbsp;
                  {entries.filter(e => e.kind === 'file').length} files
                </div>
                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:text-on-primary hover:bg-primary px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-primary/20"
                >
                  <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                  {tr('editor.save.newFolder')}
                </button>
              </div>

              {/* Create Folder Input */}
              {isCreatingFolder && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-surface-container-high rounded-xl border border-outline-variant/20">
                  <span className="material-symbols-outlined text-secondary text-[20px]">folder</span>
                  <input
                    autoFocus
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder={tr('editor.save.folderNamePlaceholder')}
                    className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-on-surface placeholder:text-outline"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                  <button
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                    className="text-primary hover:brightness-125 disabled:opacity-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined">check_circle</span>
                  </button>
                  <button
                    onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                    className="text-error hover:brightness-125 cursor-pointer"
                  >
                    <span className="material-symbols-outlined">cancel</span>
                  </button>
                </div>
              )}

              {/* Entry List */}
              <div className="flex-1 overflow-y-auto border border-outline-variant/10 rounded-xl bg-surface-container-low min-h-[200px]">
                {isLoading ? (
                  <div className="flex justify-center items-center h-full text-outline min-h-[200px]">
                    <span className="material-symbols-outlined animate-spin">refresh</span>
                  </div>
                ) : (
                  <ul className="divide-y divide-outline-variant/10">
                    {currentPath.length > 0 && (
                      <li>
                        <button
                          onClick={handleNavigateUp}
                          className="w-full flex items-center gap-3 p-3 hover:bg-surface-container text-left transition-colors cursor-pointer group"
                        >
                          {/* 统一了图标的颜色和悬停效果，把容易乱码的 folder_up 换成了更清晰的 arrow_upward 或 keyboard_return */}
                          <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">
                            keyboard_return
                          </span>
                          {/* 统一了文字的颜色亮度 */}
                          <span className="text-sm font-medium text-on-surface">..</span>
                        </button>
                      </li>
                    )}
                    {entries.length === 0 && currentPath.length === 0 && !isCreatingFolder && (
                      <div className="p-8 text-center text-outline text-sm">
                        Empty folder
                      </div>
                    )}
                    {entries.map(entry => (
                      <li key={entry.name}>
                        {entry.kind === 'directory' ? (
                          <button
                            onClick={() => handleNavigateIn(entry.name)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-surface-container text-left transition-colors cursor-pointer group"
                          >
                            <span className="material-symbols-outlined text-secondary group-hover:text-primary transition-colors">folder</span>
                            <span className="text-sm font-medium text-on-surface">{entry.name}</span>
                          </button>
                        ) : (
                          <div className="w-full flex items-center gap-3 p-3 text-left opacity-60">
                            <span className="material-symbols-outlined text-outline">draft</span>
                            <span className="text-sm font-medium text-on-surface-variant">{entry.name}</span>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        {workspaceHandle && (
          <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex items-center justify-between">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container rounded-lg max-w-[200px] overflow-hidden">
              <span className="material-symbols-outlined text-outline text-[16px] shrink-0">edit_document</span>
              <span
                className="text-xs font-mono font-medium text-on-surface truncate"
                title={fileData.filename}
              >
                {fileData.filename}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => onClose(null)}
                className="px-5 py-2 rounded-xl text-sm font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer"
              >
                {tr('editor.save.cancel')}
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={isSaving || !currentDirHandle}
                className="px-6 py-2 rounded-xl text-sm font-bold text-white shadow-ambient bg-gradient-to-br from-primary-container to-primary hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                    {tr('editor.save.saving')}
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    {tr('editor.save.confirm')}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
