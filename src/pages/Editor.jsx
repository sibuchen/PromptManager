import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import EditorComponent from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SavePromptDialog from '../components/SavePromptDialog';
import { useSettings } from '../contexts/SettingsContext';
import {
  readMetadata, writeMetadata,
  normaliseMetaEntry,
  parseMarkdown,
} from '../utils/fileSystem';

// ─── PreviewBar ───────────────────────────────────────────────────────────────
// Memoized so that typing in this textarea never triggers a re-render of the
// Monaco editor instance (which is expensive to reconcile).
const PreviewBar = memo(function PreviewBar({ value, onChange }) {
  const charCount = value.length;
  const inRange = charCount >= 100 && charCount <= 200;

  return (
    <div className="shrink-0 border-b border-outline-variant/10 bg-[#0f1114] px-8 py-3">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="mt-5 p-1.5 rounded-md bg-surface-container-low text-outline shrink-0">
          <span className="material-symbols-outlined text-[16px]">subject</span>
        </div>

        {/* Textarea group */}
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-outline font-label">
            Preview &middot; Summary
          </label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write a concise 100&#8211;200 character summary of what this prompt does…"
            rows={2}
            className={[
              'w-full resize-none bg-transparent border rounded-lg px-3 py-2',
              'text-xs font-body text-on-surface placeholder:text-outline/50',
              'outline-none transition-colors',
              'focus:ring-1',
              value.length === 0
                ? 'border-outline-variant/20 focus:border-primary/40 focus:ring-primary/20'
                : inRange
                  ? 'border-secondary/30 focus:border-secondary/50 focus:ring-secondary/20'
                  : 'border-error/30 focus:border-error/50 focus:ring-error/20',
            ].join(' ')}
          />
        </div>

        {/* Character counter */}
        <div className={[
          'mt-6 text-[10px] font-mono tabular-nums shrink-0 transition-colors',
          charCount === 0 ? 'text-outline/40' : inRange ? 'text-secondary' : 'text-error',
        ].join(' ')}>
          {charCount}&nbsp;/&nbsp;200
        </div>
      </div>
    </div>
  );
});

const DEFAULT_CONTENT = `# 🚀 后端架构与代码生成模板

## 1. 🎭 角色设定 (Role)
你现在是一位拥有多年大型分布式系统经验的资深 Java 后端架构师。你精通面向对象设计、高并发处理、数据库调优，并严格遵守 SOLID 原则和“高内聚低耦合”的编码规范。

## 2. 📝 业务上下文 (Context)
[在此输入：简述项目背景、核心痛点或当前遇到的 Bug]

## 3. 🎯 核心任务 (Task)
[在此输入：具体要求，例如“设计数据库表结构”、“实现多条件分页查询的 Service 层逻辑”或“Review 以下代码的线程安全问题”]

## 4. ⚙️ 技术栈与约束 (Constraints)
请在提供解决方案或代码时，严格基于以下技术栈：
* **基础环境**: Java 17+
* **核心框架**: Spring Boot 3.x
* **数据层**: MyBatis Plus, MySQL 8.0
* **其他组件**: [如 Redis 缓存、Docker 部署配置、LangGraph 框架等，请按需补充]
* **编码强制要求**: 
    1. 接口设计需符合 RESTful API 规范。
    2. 必须包含清晰的 JavaDoc 注释和业务内联注释。
    3. 统一使用全局异常处理，并返回标准的 \`Result<T>\` 响应体。

## 5. 📤 输出要求 (Output Format)
请按以下顺序输出你的回答：
1.  **架构思路**：写代码前，先简要说明你的设计思路和为什么这么做。
2.  **SQL 脚本**：若涉及数据库变动，优先输出带注释的 DDL 建表语句。
3.  **核心代码**：分层展示完整代码（Controller -> Service -> Mapper），避免省略关键业务逻辑。`;

export default function Editor() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaceHandle } = useSettings();

  const [filename, setFilename] = useState("Backend_Template");
  const [tags, setTags] = useState([
    { id: 1, text: "sibuchen" },
    { id: 2, text: "backend" },
    { id: 3, text: "java" },
    { id: 4, text: "spring-boot" }
  ]);
  const [preview, setPreview] = useState("这是一个用于后端开发架构的标准化 Prompt 模板。内置资深架构师角色设定、业务上下文占位符、技术约束及输出规范，助你快速生成高质量代码。");
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  // null = brand-new file; { path: string[], filename: string } = editing existing file
  const [originalFile, setOriginalFile] = useState(null);

  // Tracks the last location.key we already processed to prevent double-runs.
  // Using a ref means this check does NOT interfere with React state batching.
  const processedLocationKeyRef = useRef(null);

  // Stable callback for PreviewBar – prevents child re-render on each keystroke
  const handlePreviewChange = useCallback((val) => setPreview(val), []);

  const editorRef = useRef(null);

  // ── Handle content imported from Settings or Library ─────────────────────────
  useEffect(() => {
    // Guard: only process each navigation event once
    if (location.key === processedLocationKeyRef.current) return;

    // Mark this navigation key as processed FIRST to prevent any re-run
    processedLocationKeyRef.current = location.key;

    const { importedContent, importedFilename, importedPath } = location.state ?? {};

    // 【修改核心】如果没有导入的内容（说明是点击了 New Prompt 进来的）
    if (!importedContent) {
      // 恢复到你预设的空模板状态
      setFilename("New_Prompt");
      setTags([
        { id: 1, text: "sibuchen" },
        { id: 2, text: "backend" },
        { id: 3, text: "java" },
        { id: 4, text: "spring-boot" }
      ]);
      setPreview("这是一个用于后端开发架构的标准化 Prompt 模板。内置资深架构师角色设定、业务上下文占位符、技术约束及输出规范，助你快速生成高质量代码。");
      setContent(DEFAULT_CONTENT);
      setOriginalFile(null); // 设为 null，系统就会知道这是新建文件，保存时不会覆盖别的
      return;
    }

    if (importedFilename) setFilename(importedFilename);

    // 1. Parse raw file — physical YAML is the single source of truth
    const { metadata: parsedMetadata, content: strippedContent } =
      parseMarkdown(importedContent);

    setContent(strippedContent);

    const mdFilename = importedFilename ? `${importedFilename}.md` : null;

    // 2. Push parsed tags/preview straight into UI state
    setTags(parsedMetadata.tags.map((text, i) => ({ id: i, text })));
    setPreview(parsedMetadata.preview);

    // 3. Record the original file info so Save can track path and detect old-vs-new
    if (mdFilename) {
      setOriginalFile({
        path: Array.isArray(importedPath) ? importedPath : [],
        filename: mdFilename,
      });
    }

    // 4. Optional background JSON sync — never lets JSON override UI state
    if (mdFilename && workspaceHandle) {
      readMetadata(workspaceHandle).then(async (metadata) => {
        const entry = normaliseMetaEntry(metadata[mdFilename]);
        const isOutOfSync =
          JSON.stringify(entry.tags) !== JSON.stringify(parsedMetadata.tags) ||
          entry.preview !== parsedMetadata.preview;

        if (isOutOfSync) {
          metadata[mdFilename] = {
            tags: parsedMetadata.tags,
            preview: parsedMetadata.preview,
            lastModified: Date.now()
          };
          await writeMetadata(workspaceHandle, metadata);
          console.log(`[Editor] Auto-synced metadata index for ${mdFilename}`);
        }
      }).catch((err) => console.warn('[Editor] Sync check failed:', err));
    }

    // NOTE: We intentionally do NOT call navigate() to clear route state here.
    // The ref guard above ensures this effect only processes each key once,
    // so there is no risk of re-loading stale state on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // Optional: define a custom theme to better match the dark mode surface
    monaco.editor.defineTheme('logicCanvasDark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0c0e11', // matches bg-surface-container-lowest
      }
    });
    monaco.editor.setTheme('logicCanvasDark');
  };

  const handleFormat = (type) => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);

    let wrapStart = "";
    let wrapEnd = "";
    let linePrefix = "";

    switch (type) {
      case 'bold':
        wrapStart = "**";
        wrapEnd = "**";
        break;
      case 'italic':
        wrapStart = "*";
        wrapEnd = "*";
        break;
      case 'code':
        wrapStart = "\`";
        wrapEnd = "\`";
        break;
      case 'link':
        wrapStart = "[";
        wrapEnd = "](url)";
        break;
      case 'list':
        linePrefix = "- ";
        break;
      default:
        return;
    }

    let replacement = "";
    if (linePrefix) {
      replacement = linePrefix + (selectedText || "List item");
    } else {
      replacement = wrapStart + (selectedText || "text") + wrapEnd;
    }

    editor.executeEdits("formatBar", [
      {
        range: selection,
        text: replacement,
        forceMoveMarkers: true,
      }
    ]);

    editor.focus();
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      setTags([...tags, { id: Date.now(), text: newTagInput.trim() }]);
      setNewTagInput("");
      setIsAddingTag(false);
    } else if (e.key === 'Escape') {
      setIsAddingTag(false);
      setNewTagInput("");
    }
  };

  const removeTag = (idToRemove) => {
    setTags(tags.filter(tag => tag.id !== idToRemove));
  };

  const handleDiscard = () => {
    setFilename("New_Prompt");
    setTags([]);
    setContent("");
    setPreview("");
    setOriginalFile(null); // reset to new-file mode
  };

  const handleSave = () => {
    setIsSaveModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
      {/* Editor specific Top Toolbar */}
      <header className="h-16 flex items-center justify-between px-8 bg-[#111316] border-b border-outline-variant/10 shrink-0">
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-surface-container-low rounded-lg text-outline">
              <span className="material-symbols-outlined">edit_note</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center">
                <input
                  className="bg-transparent border-none focus:ring-0 text-sm font-headline font-bold text-on-surface p-0 outline-none"
                  style={{ width: `${Math.max(filename.length, 1)}ch` }}
                  spellCheck="false"
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                />
                <span className="text-sm font-headline font-bold text-on-surface text-opacity-60">.md</span>
              </div>
              <span className="text-[10px] text-outline uppercase tracking-wider font-label">Unsaved Changes</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {tags.map(tag => (
                <span
                  key={tag.id}
                  onClick={() => removeTag(tag.id)}
                  className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-[11px] font-medium rounded-full border border-outline-variant/10 cursor-pointer hover:bg-error/20 hover:text-error hover:border-error/30 transition-colors group flex items-center gap-1"
                  title="Click to remove"
                >
                  {tag.text}
                  <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 hidden group-hover:inline-block w-0 group-hover:w-auto transition-all">close</span>
                </span>
              ))}

              {isAddingTag ? (
                <input
                  type="text"
                  autoFocus
                  className="px-3 py-0.5 h-[26px] bg-surface-container-high text-on-surface text-[11px] font-medium rounded-full border border-primary/50 outline-none w-24 focus:ring-1 focus:ring-primary/50"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  onBlur={() => { setIsAddingTag(false); setNewTagInput(""); }}
                  placeholder="Type & Enter"
                />
              ) : (
                <button
                  onClick={() => setIsAddingTag(true)}
                  // Prevent the mousedown from blurring a focused Monaco editor
                  // region or triggering premature onBlur on other inputs
                  onMouseDown={(e) => e.preventDefault()}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-surface-container-low text-outline hover:text-primary hover:bg-surface-container-high transition-all"
                  title="Add Tag"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 border-l border-outline-variant/10 pl-6 ml-6">
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg shrink-0">
            <button onClick={() => handleFormat('bold')} className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-high rounded transition-all active:scale-90" title="Bold">
              <span className="material-symbols-outlined text-[20px]">format_bold</span>
            </button>
            <button onClick={() => handleFormat('italic')} className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-high rounded transition-all active:scale-90" title="Italic">
              <span className="material-symbols-outlined text-[20px]">format_italic</span>
            </button>
            <button onClick={() => handleFormat('code')} className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-high rounded transition-all active:scale-90" title="Code">
              <span className="material-symbols-outlined text-[20px]">code</span>
            </button>
            <button onClick={() => handleFormat('link')} className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-high rounded transition-all active:scale-90" title="Link">
              <span className="material-symbols-outlined text-[20px]">link</span>
            </button>
            <div className="w-px h-4 bg-outline-variant/30 mx-1"></div>
            <button onClick={() => handleFormat('list')} className="p-2 text-outline hover:text-on-surface hover:bg-surface-container-high rounded transition-all active:scale-90" title="Bulleted List">
              <span className="material-symbols-outlined text-[20px]">list</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button onClick={handleDiscard} className="px-4 py-2 text-sm font-medium text-outline hover:text-on-surface transition-colors cursor-pointer">
              Discard
            </button>
            <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-gradient-to-br from-primary-container to-primary text-on-primary font-bold text-sm shadow-[0_4px_14px_0_rgba(186,195,255,0.1)] hover:brightness-110 active:scale-95 transition-all">
              Save Prompt
            </button>
          </div>
        </div>
      </header>

      {/* Preview / Summary Bar */}
      <PreviewBar value={preview} onChange={handlePreviewChange} />

      {/* Split Screen Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Pane */}
        <section className="w-1/2 flex flex-col bg-surface-container-lowest relative border-r border-outline-variant/10">
          <div className="absolute top-4 left-4 z-10">
            <span className="px-2 py-1 bg-surface-container-highest/50 backdrop-blur-md rounded text-[10px] font-mono text-outline uppercase tracking-widest pointer-events-none">Editor</span>
          </div>
          <div className="flex-1 pt-14 pb-4">
            <EditorComponent
              height="100%"
              defaultLanguage="markdown"
              value={content}
              onChange={(value) => setContent(value || "")}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 14,
                lineHeight: 1.6,
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                renderLineHighlight: "all",
                hideCursorInOverviewRuler: true,
                overviewRulerBorder: false,
              }}
            />
          </div>
        </section>

        {/* Preview Pane */}
        <section className="w-1/2 flex flex-col bg-surface overflow-y-auto hide-scrollbar relative">
          <div className="sticky top-0 z-10 px-8 py-4 bg-surface/80 backdrop-blur-md flex justify-between items-center border-b border-surface">
            <span className="px-2 py-1 bg-primary-container/20 rounded text-[10px] font-mono text-primary uppercase font-bold tracking-widest">Live Preview</span>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-outline text-[18px]">visibility</span>
              <span className="text-xs text-outline font-medium">Standard Render</span>
            </div>
          </div>

          <div className="px-12 py-8 prose prose-invert max-w-none prose-pre:bg-surface-container-low prose-pre:border prose-pre:border-outline-variant/20 prose-headings:font-headline prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "*No content*"}
            </ReactMarkdown>


          </div>
        </section>
      </div>

      {/* Floating Quick Action Bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-2 bg-surface-container-highest/80 backdrop-blur-xl p-2 rounded-full shadow-2xl border border-outline-variant/10">
          <button className="flex items-center gap-2 px-4 py-2 hover:bg-surface-container-low rounded-full transition-all group cursor-pointer">
            <span className="material-symbols-outlined text-outline group-hover:text-primary">auto_awesome</span>
            <span className="text-xs font-semibold">Refine with AI</span>
          </button>
          <div className="w-px h-6 bg-outline-variant/20"></div>
          <button className="flex items-center gap-2 px-4 py-2 hover:bg-surface-container-low rounded-full transition-all group cursor-pointer">
            <span className="material-symbols-outlined text-outline group-hover:text-primary">history</span>
            <span className="text-xs font-semibold">Versions</span>
          </button>
          <div className="w-px h-6 bg-outline-variant/20"></div>
          <button className="flex items-center gap-2 px-4 py-2 hover:bg-surface-container-low rounded-full transition-all group cursor-pointer">
            <span className="material-symbols-outlined text-outline group-hover:text-primary">share</span>
            <span className="text-xs font-semibold">Export</span>
          </button>
        </div>
      </div>

      <SavePromptDialog
        isOpen={isSaveModalOpen}
        onClose={(savedInfo) => {
          setIsSaveModalOpen(false);
          // On successful save, update originalFile with the actual saved path+filename
          // so the next Save press navigates to the correct directory
          if (savedInfo) setOriginalFile(savedInfo);
        }}
        fileData={{
          filename: `${filename}.md`,
          tags: tags.map(t => t.text),
          preview,
          content,
        }}
        originalFile={originalFile}
      />
    </div>
  );
}
