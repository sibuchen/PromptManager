import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import TopToolbar from '../components/TopToolbar';
import { useSettings } from '../contexts/SettingsContext';
import { readMetadata, normaliseMetaEntry, readFile, syncMetadataIndex } from '../utils/fileSystem';

export default function Library() {
  const { workspaceHandle } = useSettings();
  const navigate = useNavigate();

  const [metadata, setMetadata] = useState(null);

  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('relevance');

  // 1. Data Loading Stage with Silent Sync
  useEffect(() => {
    if (!workspaceHandle) {
      setMetadata({});
      return;
    }
    let cancelled = false;

    // Quick load from JSON cache
    readMetadata(workspaceHandle)
      .then(data => {
        if (!cancelled) setMetadata(data);

        // Background silent sync
        return syncMetadataIndex(workspaceHandle);
      })
      .then(newData => {
        if (!cancelled && newData) {
          // If sync produced new data, update seamlessly
          setMetadata(newData);
        }
      })
      .catch((err) => {
        console.warn('[Library] Failed to load or sync metadata:', err);
        if (!cancelled && metadata === null) {
          setMetadata({});
        }
      });

    return () => { cancelled = true; };
  }, [workspaceHandle]);

  // 2. Cascading Computation: Popular Tags
  const popularTags = useMemo(() => {
    if (!metadata) return [];
    const counts = {};
    const originalCase = {};

    Object.values(metadata).forEach(raw => {
      const entry = normaliseMetaEntry(raw);
      entry.tags.forEach(t => {
        const lower = t.toLowerCase();
        counts[lower] = (counts[lower] || 0) + 1;
        if (!originalCase[lower]) originalCase[lower] = t;
      });
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([lower]) => originalCase[lower]);
  }, [metadata]);

  // 3. Cascading Computation: Parsed Search Terms
  const parsedSearchTerms = useMemo(() => {
    return Array.from(new Set(
      searchQuery
        .toLowerCase()
        .split(/[,\s]+/)
        .map(t => t.replace(/^#/, ''))
        .filter(Boolean)
    ));
  }, [searchQuery]);

  // 4. Cascading Computation: High-Performance Filter & Sort OR Engine
  const filteredAndSortedResults = useMemo(() => {
    if (!metadata) return [];

    const results = Object.entries(metadata).map(([filename, raw]) => {
      const entry = normaliseMetaEntry(raw);
      let score = 0;

      if (parsedSearchTerms.length === 0) {
        score = 1;
      } else {
        const tagsLower = entry.tags.map(t => t.toLowerCase());
        const previewLower = entry.preview.toLowerCase();

        parsedSearchTerms.forEach(term => {
          // 🔧 修复 1：将 t.includes 改为 t === term，强制标签必须精确匹配
          const hitTags = tagsLower.some(t => t === term);
          // 摘要内容仍然使用包含匹配
          const hitPreview = previewLower.includes(term);
          if (hitTags || hitPreview) {
            score += 1;
          }
        });
      }

      return {
        filename,
        // 【修改前】 basename: filename.replace(/\.md$/, ''),
        // 【修改后】 提取真正的最后一部分文件名，丢弃前面的路径
        basename: filename.split('/').pop().replace(/\.md$/, ''),
        ...entry,
        score
      };
    }).filter(item => item.score > 0);

    // Apply Sorting logic
    results.sort((a, b) => {
      if (sortBy === 'relevance' && b.score !== a.score) {
        return b.score - a.score;
      }
      return b.lastModified - a.lastModified;
    });

    return results;
  }, [metadata, parsedSearchTerms, sortBy]);

  // View Handlers
  const handleTagClick = (tag) => {
    setInputValue(prev => {
      const terms = prev.split(/[,\s]+/).map(t => t.replace(/^#/, '')).filter(Boolean);
      const cleanTag = tag.replace(/^#/, '');
      let newValue = prev;
      if (!terms.some(t => t.toLowerCase() === cleanTag.toLowerCase())) {
        newValue = prev ? `${prev}, ${cleanTag}` : cleanTag;
      }
      setSearchQuery(newValue);
      return newValue;
    });
  };

  const handleSearch = () => {
    setSearchQuery(inputValue);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClear = () => {
    setInputValue('');
    setSearchQuery('');
  };

  const handleCardClick = async (filename, basename) => {
    if (!workspaceHandle) return;
    try {
      const content = await readFile(workspaceHandle, filename);
      // Derive path segments from the metadata key (e.g. "subdir/file.md" => ["subdir"])
      const segments = filename.split('/');
      const importedPath = segments.length > 1 ? segments.slice(0, -1) : [];
      navigate('/', { state: { importedContent: content, importedFilename: basename, importedPath } });
    } catch (err) {
      console.error('[Library] Failed to read file:', err);
    }
  };

  const handleSortToggle = () => setSortBy(prev => prev === 'relevance' ? 'recent' : 'relevance');

  const colors = [
    { text: 'text-primary', class: 'bg-primary/5' },
    { text: 'text-tertiary', class: 'border-transparent hover:border-outline-variant/10' },
    { text: 'text-secondary', class: 'bg-secondary/5' },
    { text: 'text-primary', class: 'bg-primary/5' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
      <TopToolbar title="Explore the Logic" />

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="max-w-7xl mx-auto w-full px-6 py-12">

          <section className="mb-16">
            <h2 className="text-4xl md:text-5xl font-headline font-bold text-on-surface mb-8 tracking-tight">Explore the Logic.</h2>
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/10 blur-xl group-focus-within:bg-primary/20 transition-all"></div>
              <div className="relative flex items-center bg-surface-container-lowest border-none rounded-2xl p-2">
                <span className="material-symbols-outlined ml-4 text-on-surface-variant">search</span>
                <input
                  className="w-full bg-transparent outline-none border-none focus:ring-0 text-lg px-4 py-3 text-on-surface placeholder:text-on-surface-variant/40"
                  placeholder="Search prompts, logic flows, or variables..."
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {inputValue && (
                  <button
                    onClick={handleClear}
                    className="material-symbols-outlined mr-2 p-2 text-on-surface-variant hover:text-on-surface cursor-pointer rounded-full hover:bg-surface-container-high transition-colors"
                  >
                    close
                  </button>
                )}
                <button
                  onClick={handleSearch}
                  className="bg-primary-container text-on-primary-container px-6 py-2.5 rounded-xl font-medium hover:opacity-90 transition-all flex items-center gap-2"
                >
                  Search
                </button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
            <div className="lg:col-span-4 bg-surface-container-low p-8 rounded-2xl h-fit">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-primary">sell</span>
                <h3 className="font-headline font-bold text-xl">Popular Tags</h3>
              </div>

              {/* 🔧 修复 2：增加 items-start content-start 阻止 Flex 垂直拉伸 */}
              <div className="flex flex-wrap items-start content-start gap-2 min-h-[100px]">
                {metadata === null ? (
                  <div className="flex items-center mb-auto gap-2 text-sm text-on-surface-variant italic">
                    <span className="material-symbols-outlined text-[16px] animate-spin">data_usage</span>
                    Analyzing Tags...
                  </div>
                ) : popularTags.length > 0 ? (
                  popularTags.map((tag, i) => (
                    <span
                      key={tag}
                      onClick={() => handleTagClick(tag)}
                      /* 🔧 修复 2：px-3 py-1.5 rounded-xl 还原原型图的圆角长方形比例 */
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${i === 1
                        ? 'bg-secondary-container text-primary'
                        : 'bg-surface-container-high text-on-surface-variant hover:bg-primary/20 hover:text-primary'
                        }`}
                    >
                      #{tag}
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-on-surface-variant italic mt-2">No tags discovered yet.</div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-outline-variant/10">
                <p className="text-sm text-on-surface-variant mb-4 font-medium">Search Tips</p>
                <ul className="space-y-4">
                  <li className="flex gap-3 text-sm text-on-surface">
                    <div className="w-2 h-2 rounded-full bg-tertiary mt-1.5 shrink-0"></div>
                    <span className="text-on-surface-variant">Separate terms with spaces or commas to match items containing <b>ANY</b> term.</span>
                  </li>
                  <li className="flex gap-3 text-sm text-on-surface">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0"></div>
                    <span className="text-on-surface-variant">Scores rank higher for items hitting multiple search concepts.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <p className="text-on-surface-variant text-sm">
                  Showing {metadata === null ? '...' : <><span className="text-on-surface font-semibold">{filteredAndSortedResults.length}</span> results</>}
                  {searchQuery && <span> for <span className="text-on-surface font-semibold">"{searchQuery}"</span></span>}
                </p>

                <div
                  onClick={handleSortToggle}
                  className="flex items-center gap-2 bg-surface-container-lowest px-4 py-2 rounded-lg cursor-pointer hover:bg-surface-container-high transition-colors select-none"
                >
                  <span className="text-xs font-medium gap-2 flex items-center">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      {sortBy === 'relevance' ? 'sort_by_alpha' : 'schedule'}
                    </span>
                    {sortBy === 'relevance' ? 'Relevance' : 'Recent'}
                  </span>
                  <span className="material-symbols-outlined text-sm text-on-surface-variant ml-2">swap_vert</span>
                </div>
              </div>

              {metadata === null ? (
                <div className="flex flex-col items-center justify-center py-24 bg-surface-container-lowest rounded-3xl border border-dashed border-outline-variant/20">
                  <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
                  <h3 className="text-lg font-headline font-semibold text-on-surface mb-1">Indexing Library</h3>
                  <p className="text-sm text-on-surface-variant">Constructing local cache graph...</p>
                </div>
              ) : filteredAndSortedResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center bg-surface-container-lowest border border-dashed border-outline-variant/30 rounded-3xl relative overflow-hidden">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/5 blur-3xl rounded-full"></div>
                  <span className="material-symbols-outlined text-outline text-[64px] mb-6 relative z-10">search_off</span>
                  <h3 className="text-xl font-headline font-bold mb-2 relative z-10 text-on-surface">未找到匹配的 Prompt</h3>
                  <p className="text-sm text-on-surface-variant max-w-sm relative z-10">No items matched your current search filters. Try using different keywords or removing some conditions.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredAndSortedResults.map((item, idx) => {
                    const styling = colors[idx % colors.length];
                    return (
                      <div
                        key={item.filename}
                        onClick={() => handleCardClick(item.filename, item.basename)}
                        className={`group bg-surface-container rounded-2xl p-6 hover:bg-surface-container-high transition-all cursor-pointer relative overflow-hidden flex flex-col min-h-[200px] border border-transparent hover:border-outline-variant/10`}
                      >
                        {idx % 2 === 0 && (
                          <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-150 ${styling.class}`}></div>
                        )}

                        <div className="flex flex-col h-full relative z-10 flex-1">
                          <div className="flex items-center justify-between mb-4">
                            <span className={`text-[10px] uppercase tracking-widest font-bold ${styling.text}`}>
                              Template
                            </span>
                            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-lg">arrow_forward</span>
                          </div>

                          <h3 className="font-headline text-xl font-bold mb-2 group-hover:text-primary transition-colors line-clamp-1" title={item.basename}>
                            {item.basename}
                          </h3>

                          <p className="text-sm text-on-surface-variant mb-6 line-clamp-2 min-h-[40px] break-words">
                            {item.preview || <span className="italic opacity-60">No preview summary provided.</span>}
                          </p>

                          <div className="mt-auto flex flex-wrap gap-2 pt-2 border-t border-outline-variant/10">
                            {item.tags.length > 0 ? (
                              item.tags.map(tag => (
                                <span key={tag} className="text-[10px] px-2 py-1 bg-surface-container-lowest rounded text-on-surface-variant truncate max-w-[120px]">
                                  #{tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] px-2 py-1 bg-surface-container-lowest rounded text-outline italic">
                                uncategorized
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}