import { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listEntries } from '../utils/fileSystem';

const WorkspaceNode = memo(function WorkspaceNode({
  handle,
  name,
  kind,
  path,
  depth,
  expandedPaths,
  togglePath,
  activeFilePath,
  onFileClick
}) {
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const isExpanded = expandedPaths.has(path);
  const isDirectory = kind === 'directory';
  const isMdFile = kind === 'file' && name.endsWith('.md');
  const isActive = activeFilePath === path;

  useEffect(() => {
    let cancelled = false;
    if (isDirectory && isExpanded && !isLoaded) {
      setIsLoading(true);
      listEntries(handle)
        .then(entries => {
          if (!cancelled) {
            setChildren(entries);
            setIsLoaded(true);
            setIsLoading(false);
          }
        })
        .catch(err => {
          console.error('[WorkspaceTree] Failed to load folder', path, err);
          if (!cancelled) setIsLoading(false);
        });
    }
    return () => { cancelled = true; };
  }, [handle, isDirectory, isExpanded, isLoaded, path]);

  if (kind === 'file' && !isMdFile) {
    return null; // hide non-md files
  }

  const paddingLeft = `${(depth * 1) + 1}rem`;

  if (isDirectory) {
    return (
      <div className="space-y-0.5">
        <div
          onClick={() => togglePath(path)}
          style={{ paddingLeft }}
          className="flex items-center gap-3 text-[#909094] pr-4 py-1.5 hover:text-on-surface cursor-pointer group"
        >
          <span className={`material-symbols-outlined text-[16px] transition-transform ${isExpanded ? 'rotate-90 text-on-surface' : ''}`}>
            chevron_right
          </span>
          <span className={`material-symbols-outlined text-[18px] ${isExpanded ? 'text-on-surface' : ''}`}>
            {isExpanded ? 'folder_open' : 'folder'}
          </span>
          <span className={`text-xs truncate ${isExpanded ? 'font-semibold text-on-surface' : ''}`}>
            {name}
          </span>
          {isLoading && (
            <span className="material-symbols-outlined text-[14px] animate-spin ml-auto text-outline">
              progress_activity
            </span>
          )}
        </div>

        {isExpanded && children.length > 0 && (
          <div className="flex flex-col space-y-0.5">
            {children.map(child => (
              <WorkspaceNode
                key={child.name}
                handle={child.handle}
                name={child.name}
                kind={child.kind}
                path={`${path}/${child.name}`}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                togglePath={togglePath}
                activeFilePath={activeFilePath}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // It's an .md file
  return (
    <div
      onClick={() => onFileClick(handle, path, name)}
      style={{ paddingLeft }}
      className={`flex items-center gap-2 text-xs py-1.5 pr-4 cursor-pointer relative ${isActive
          ? 'text-primary bg-primary/5 rounded-r-lg border-l-2 border-primary -ml-[2px]'
          : 'text-outline hover:text-on-surface ml-[2px]'
        }`}
    >
      <span className="material-symbols-outlined text-[16px]">markdown</span>
      <span className="truncate">{name}</span>
    </div>
  );
});

export default function WorkspaceTree({ workspaceHandle }) {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState(() => new Set());
  const [activeFilePath, setActiveFilePath] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (workspaceHandle) {
      setIsLoading(true);
      listEntries(workspaceHandle)
        .then(entries => {
          if (!cancelled) {
            setChildren(entries);
            setIsLoading(false);
          }
        })
        .catch(err => {
          console.error('[WorkspaceTree] Failed to load workspace root', err);
          if (!cancelled) setIsLoading(false);
        });
    } else {
      setChildren([]);
    }
    return () => { cancelled = true; };
  }, [workspaceHandle]);

  const togglePath = (path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileClick = async (fileHandle, path, name) => {
    try {
      setActiveFilePath(path);
      const file = await fileHandle.getFile();
      const content = await file.text();
      const basename = name.replace(/\.md$/, '');

      // 【新增补丁】将类似 "/folder/sub/file.md" 的字符串路径，转换为 Editor 需要的数组 ["folder", "sub"]
      const importedPath = path.split('/').filter(Boolean).slice(0, -1);

      // 【修改】把 importedPath 塞进路由 state 中传过去
      navigate('/', { state: { importedContent: content, importedFilename: basename, importedPath } });
    } catch (err) {
      console.error('[WorkspaceTree] Failed to read file', err);
    }
  };

  if (isLoading && children.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-sm text-outline">
        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
        Loading workspace...
      </div>
    );
  }

  if (children.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-0.5 max-h-[40vh] overflow-y-auto hide-scrollbar">
      {children.map(child => (
        <WorkspaceNode
          key={child.name}
          handle={child.handle}
          name={child.name}
          kind={child.kind}
          path={`/${child.name}`}
          depth={0}
          expandedPaths={expandedPaths}
          togglePath={togglePath}
          activeFilePath={activeFilePath}
          onFileClick={handleFileClick}
        />
      ))}
    </div>
  );
}
