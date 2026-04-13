/**
 * fileSystem.js
 * Utilities for the File System Access API (browser-native, no Node.js).
 * Used by the Settings page to let users pick a local workspace directory,
 * scan its contents, and read/write .md prompt files.
 *
 * Persistence: Directory handles are stored in IndexedDB via idb-keyval so
 * the user only has to grant permission once per browser session.
 */

import { get, set, del } from 'idb-keyval'
import matter from 'gray-matter'

const IDB_KEY = 'workspace-dir-handle'

// ---------------------------------------------------------------------------
// Permission Helpers
// ---------------------------------------------------------------------------

/**
 * Verify (and optionally request) read-write permission on a directory handle.
 * Returns true if permission is granted.
 */
async function verifyPermission(handle, readWrite = true) {
  if (!handle) return false
  const opts = { mode: readWrite ? 'readwrite' : 'read' }

  // If permission is already granted, fast-path return
  if ((await handle.queryPermission(opts)) === 'granted') return true

  // Otherwise ask the user
  if ((await handle.requestPermission(opts)) === 'granted') return true

  return false
}

// ---------------------------------------------------------------------------
// Workspace Picker
// ---------------------------------------------------------------------------

/**
 * Open a native directory picker dialog, persist the handle to IndexedDB,
 * and return the handle.
 * Returns null if the user cancels.
 */
async function pickWorkspace() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await set(IDB_KEY, handle)
    return handle
  } catch (err) {
    // AbortError = user cancelled, not a real error
    if (err.name !== 'AbortError') console.error('[fileSystem] pickWorkspace error:', err)
    return null
  }
}

/**
 * Restore the previously chosen directory handle from IndexedDB.
 * Silently returns null if none is stored or permission is denied.
 */
async function restoreWorkspace() {
  try {
    const handle = await get(IDB_KEY)
    if (!handle) return null

    const ok = await verifyPermission(handle, true)
    return ok ? handle : null
  } catch {
    return null
  }
}

/**
 * Clear the stored handle from IndexedDB (e.g., "Reset Default").
 */
async function clearWorkspace() {
  await del(IDB_KEY)
}

// ---------------------------------------------------------------------------
// Directory Scanner
// ---------------------------------------------------------------------------

/**
 * Recursively walk a FileSystemDirectoryHandle and collect stats.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<{ fileCount: number, totalBytes: number }>}
 */
async function scanDirectory(dirHandle) {
  let fileCount = 0
  let totalBytes = 0

  async function walk(handle) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        fileCount++
        try {
          const file = await entry.getFile()
          totalBytes += file.size
        } catch {
          // Skip files we can't read
        }
      } else if (entry.kind === 'directory') {
        await walk(entry)
      }
    }
  }

  await walk(dirHandle)
  return { fileCount, totalBytes }
}

/**
 * Format bytes to a human-readable string (KB / MB / GB).
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ---------------------------------------------------------------------------
// File Read / Write
// ---------------------------------------------------------------------------

/**
 * Read a file inside the workspace directory.
 * Supports nested paths — filename may be a slash-separated relative path
 * such as "subdir/nested/file.md".
 * @param {FileSystemDirectoryHandle} dirHandle  root directory handle
 * @param {string} filename  relative path, e.g. "file.md" or "cat/file.md"
 * @returns {Promise<string>} file text content
 */
async function readFile(dirHandle, filename) {
  const segments = filename.split('/')
  const name     = segments.pop()          // last segment = file name
  let   dir      = dirHandle
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg) // traverse intermediate dirs
  }
  const fileHandle = await dir.getFileHandle(name)
  const file       = await fileHandle.getFile()
  return file.text()
}

/**
 * Write (or overwrite) a file inside the workspace directory.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} filename  – e.g. "my-prompt.md"
 * @param {string} content   – text content to save
 */
async function writeFile(dirHandle, filename, content) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

// ---------------------------------------------------------------------------
// Sidecar Metadata Index (.metadata.json)
// ---------------------------------------------------------------------------

const METADATA_FILENAME = '.metadata.json'

/**
 * Read the sidecar .metadata.json from the workspace root.
 * Always returns a plain object (empty on any read/parse error).
 *
 * Entry schema (v2):
 *   { [filename]: { tags: string[], preview: string, lastModified: number } }
 *
 * Legacy entries that are plain string[] arrays are tolerated – callers
 * should normalise them via `normaliseMetaEntry()` before use.
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @returns {Promise<Record<string, object>>}
 */
async function readMetadata(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(METADATA_FILENAME, { create: false })
    const file = await fileHandle.getFile()
    const text = await file.text()
    // JSON.parse validation – throws SyntaxError on corrupt files
    const parsed = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    // File doesn't exist yet, or parse error — start fresh
    return {}
  }
}

/**
 * Normalise a raw metadata entry to the v2 schema.
 * Handles legacy entries that stored a plain string[] for tags.
 * @param {unknown} raw
 * @returns {{ tags: string[], preview: string, lastModified: number }}
 */
function normaliseMetaEntry(raw) {
  if (Array.isArray(raw)) {
    // Legacy v1 – just an array of tag strings
    return { tags: raw, preview: '', lastModified: 0 }
  }
  if (raw && typeof raw === 'object') {
    return {
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      preview: typeof raw.preview === 'string' ? raw.preview : '',
      lastModified: typeof raw.lastModified === 'number' ? raw.lastModified : 0,
    }
  }
  return { tags: [], preview: '', lastModified: 0 }
}

/**
 * Write the sidecar .metadata.json to the workspace root.
 * Uses FileSystemWritableFileStream and propagates permission / disk errors.
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {Record<string, string[]>} metadata
 */
async function writeMetadata(rootHandle, metadata) {
  const fileHandle = await rootHandle.getFileHandle(METADATA_FILENAME, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(JSON.stringify(metadata, null, 2))
    await writable.close()
  } catch (err) {
    // Ensure the stream is aborted on failure so the file isn't left open
    try { await writable.abort() } catch { /* ignore */ }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Markdown ↔ Metadata Sync  (gray-matter based, YAML Frontmatter standard)
// ---------------------------------------------------------------------------

// Legacy HTML-comment regexes – used ONLY inside parseMarkdown for the
// one-time silent upgrade path.  They are NOT exported.
const _LEGACY_TAG_RE = /^<!--\s*tags:\s*(.*?)\s*-->\n?/m
const _LEGACY_PREVIEW_RE = /^<!--\s*preview:\s*(.*?)\s*-->\n?/m

/**
 * Parse a raw .md file string into its two logical parts.
 *
 * Primary path (YAML Frontmatter):
 *   Uses `gray-matter` to split the frontmatter from the body.
 *   Returns `{ metadata: { tags, preview }, content }`.
 *
 * Legacy upgrade path (HTML-comment headers):
 *   If no valid YAML frontmatter is found but the old `<!-- tags: ... -->`
 *   / `<!-- preview: ... -->` comment lines are present, they are silently
 *   extracted and stripped from the body.  The next Save will write the file
 *   back as standard YAML Frontmatter, completing the one-time migration.
 *
 * @param {string} raw  – full file text as returned by File.text()
 * @returns {{ metadata: { tags: string[], preview: string }, content: string }}
 */

/**
 * 增强版解析器：解决 Windows 换行符、YAML 列表解析及千层饼 Bug
 */
function parseMarkdown(raw) {
  if (!raw) return { metadata: { tags: [], preview: '' }, content: '' };

  // 1. 归一化：将所有 Windows (\r\n) 换行符统一转为 (\n)，防止正则失效
  const normalizedRaw = raw.replace(/\r\n/g, '\n');

  let tags = [];
  let preview = '';
  let content = normalizedRaw;

  const parser = typeof matter === 'function' ? matter : (matter && matter.default);

  // 2. 尝试使用 gray-matter 解析
  try {
    if (parser) {
      const parsed = parser(normalizedRaw);
      // 检查是否有解析出数据
      if (parsed.data && typeof parsed.data === 'object' && Object.keys(parsed.data).length > 0) {
        const data = parsed.data;
        // 兼容处理 tags (支持数组或逗号字符串)
        tags = Array.isArray(data.tags)
          ? data.tags.map(String).filter(Boolean)
          : typeof data.tags === 'string'
            ? data.tags.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        preview = typeof data.preview === 'string' ? data.preview.trim() : '';
        content = parsed.content;

        // 解析成功，直接返回
        return { metadata: { tags, preview }, content: content.trimStart() };
      }
    }
  } catch (err) {
    console.warn('[parseMarkdown] gray-matter 解析失败，尝试手动回退:', err);
  }

  // 3. 手动回退解析 (Manual Fallback)：如果 gray-matter 罢工，手动强行提取
  // 匹配开头的 --- ... --- 块
  const yamlBlockMatch = normalizedRaw.match(/^---\n([\s\S]*?)\n---\n/);
  if (yamlBlockMatch) {
    const yamlBody = yamlBlockMatch[1];

    // 提取 tags (支持 - 列表格式或单行格式)
    const tagSection = yamlBody.match(/tags:\s*\n?((?:\s*- .*\n?)*)/);
    if (tagSection && tagSection[1]) {
      // 解析 YAML 列表形式: - tag
      tags = tagSection[1]
        .split('\n')
        .map(line => line.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
    } else {
      // 尝试解析单行形式: tags: a, b
      const singleLineTag = yamlBody.match(/tags:\s*(.*)/);
      if (singleLineTag) {
        tags = singleLineTag[1].split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    // 提取 preview (支持引号或无引号)
    const previewMatch = yamlBody.match(/preview:\s*["']?(.*?)["']?$/m);
    if (previewMatch) {
      preview = previewMatch[1].trim();
    }
  }

  // 4. 自愈清理 (Self-Healing)：循环剔除所有多余的 YAML 头部（解决千层饼问题）
  const yamlHeaderRegex = /^---\n[\s\S]*?\n---\n/;
  while (yamlHeaderRegex.test(content)) {
    content = content.replace(yamlHeaderRegex, '');
  }

  // 5. 兼容旧版 HTML 注释
  if (tags.length === 0) {
    const legacyTags = content.match(/^<!--\s*tags:\s*(.*?)\s*-->\n?/m);
    if (legacyTags) tags = legacyTags[1].split(',').map(s => s.trim()).filter(Boolean);
  }
  if (!preview) {
    const legacyPrev = content.match(/^<!--\s*preview:\s*(.*?)\s*-->\n?/m);
    if (legacyPrev) preview = legacyPrev[1].trim();
  }

  // 最终清理正文中的 HTML 注释
  const finalContent = content
    .replace(/\n?/g, '')
    .replace(/\n?/g, '')
    .trimStart();

  return { metadata: { tags, preview }, content: finalContent };
}

/**
 * Serialise pure Markdown content + metadata into a complete .md string
 * with a standard YAML Frontmatter block at the top.
 *
 * Output format (mirrors the expected result exactly):
 *   ---
 *   tags:
 *     - tag1
 *     - tag2
 *   preview: summary text
 *   ---
 *
 *   # Rest of Markdown body…
 *
 * When both tags and preview are empty, no frontmatter block is added and
 * the original content is returned as-is (keeps plain files clean).
 *
 * NOTE: This function uses manual string concatenation rather than
 * `matter.stringify` so that the save path never depends on gray-matter's
 * serializer — only the read/parse path uses the library.
 *
 * @param {string}   content   – pure Markdown body (no frontmatter)
 * @param {{ tags?: string[], preview?: string }} metadata
 * @returns {string}           – complete file text ready to write to disk
 */
function stringifyMarkdown(content, metadata) {
  const tags = Array.isArray(metadata?.tags)
    ? metadata.tags.map(String).filter(Boolean)
    : []
  const preview = typeof metadata?.preview === 'string'
    ? metadata.preview.trim()
    : ''
  const body = typeof content === 'string' ? content : ''

  if (tags.length === 0 && !preview) {
    return body // no metadata — return body unchanged, no frontmatter
  }

  // Build YAML block line-by-line (no external library needed)
  const yaml = ['---']

  if (tags.length > 0) {
    yaml.push('tags:')
    for (const tag of tags) {
      yaml.push(`  - ${tag}`)
    }
  }

  if (preview) {
    // Double-quote the value if it contains YAML-sensitive characters
    // so that colons, hashes, brackets etc. never break the parser.
    const safe = /[:#\[\]{}&*!|>'"\\%@`]/.test(preview) ||
      preview.startsWith(' ') || preview.endsWith(' ')
    yaml.push(
      safe
        ? `preview: "${preview.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        : `preview: ${preview}`
    )
  }

  yaml.push('---')
  yaml.push('')  // blank separator line (matches expected output)

  // Trim any leading newlines from body so we don't get double blank lines
  return yaml.join('\n') + '\n' + body.replace(/^\n+/, '')
}

/**
 * Synchronise the sidecar .metadata.json with the physical .md files on disk.
 * Detects externally modified files by comparing lastModified timestamps,
 * and clears out entries for deleted files.
 * @param {FileSystemDirectoryHandle} rootHandle 
 * @returns {Promise<Record<string, object>|null>} Updated metadata dict if changed, else null.
 */
async function syncMetadataIndex(rootHandle) {
  if (!rootHandle) return null;

  const currentMeta = await readMetadata(rootHandle);
  let changed = false;

  const actualFiles = new Set();

  async function walk(handle, pathPrefix = '') {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const fullPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
        actualFiles.add(fullPath);

        try {
          const file = await entry.getFile();
          const pLastModified = file.lastModified;

          const metaEntry = currentMeta[fullPath];
          const mLastModified = metaEntry ? (normaliseMetaEntry(metaEntry).lastModified || 0) : 0;

          if (!metaEntry || pLastModified > mLastModified) {
            const text = await file.text();
            const { metadata } = parseMarkdown(text);

            currentMeta[fullPath] = {
              tags: metadata.tags || [],
              preview: metadata.preview || '',
              lastModified: pLastModified,
            };
            changed = true;
          }
        } catch (err) {
          console.warn(`[syncMetadataIndex] Error reading file target ${fullPath}:`, err);
        }
      } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
        await walk(entry, pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name);
      }
    }
  }

  try {
    await walk(rootHandle);
  } catch (err) {
    console.error('[syncMetadataIndex] Error walking directory:', err);
    return null;
  }

  // Cleanup deleted files
  for (const pathKey of Object.keys(currentMeta)) {
    if (!actualFiles.has(pathKey)) {
      delete currentMeta[pathKey];
      changed = true;
    }
  }

  if (changed) {
    try {
      await writeMetadata(rootHandle, currentMeta);
      return currentMeta;
    } catch (err) {
      console.error('[syncMetadataIndex] Error saving updated metadata:', err);
    }
  }

  return null;
}

export {
  verifyPermission,
  pickWorkspace,
  restoreWorkspace,
  clearWorkspace,
  scanDirectory,
  formatBytes,
  readFile,
  writeFile,
  getSubDirectory,
  listEntries,
  readMetadata,
  writeMetadata,
  normaliseMetaEntry,
  parseMarkdown,
  stringifyMarkdown,
  syncMetadataIndex,
}

// ---------------------------------------------------------------------------
// Directory Navigation Helpers (used by SavePromptDialog)
// ---------------------------------------------------------------------------

/**
 * Given a root handle and an array of sub-folder names (path segments),
 * navigate into nested directories and return the deepest handle.
 * Creates intermediate directories if create=true.
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string[]} pathSegments  – e.g. ['archive', '2026']
 * @param {boolean}  create        – whether to create missing folders
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
async function getSubDirectory(rootHandle, pathSegments, create = false) {
  let current = rootHandle
  for (const segment of pathSegments) {
    current = await current.getDirectoryHandle(segment, { create })
  }
  return current
}

/**
 * List the immediate children (files and directories) of a directory handle.
 * Returns an array of { name, kind } objects, sorted: dirs first, then files.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<Array<{ name: string, kind: 'file'|'directory' }>>}
 */
async function listEntries(dirHandle) {
  const entries = []
  for await (const entry of dirHandle.values()) {
    entries.push({ name: entry.name, kind: entry.kind, handle: entry })
  }
  // Directories first, then alphabetical within each group
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

