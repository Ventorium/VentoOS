import { File } from 'lucide-react'
import { Spinner } from '@/components'
import { useEditorStore } from '../../stores/editor-store'
import { useSearchStore } from '../../stores/search-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { flattenTree } from '../../utils/tree-helpers'

export default function SearchPanel() {
  const { contentQuery, filenameFilter, results, isSearching, setContentQuery, setFilenameFilter, doContentSearch } =
    useSearchStore()
  const fileIndex = useWorkspaceStore(s => s.fileIndex)
  const tree = useWorkspaceStore(s => s.tree)
  const workspace = useWorkspaceStore(s => s.workspace)
  const openFile = useEditorStore(s => s.openFile)

  const filteredFiles = filenameFilter.trim()
    ? flattenTree(tree).filter(e => !e.is_dir && e.name.toLowerCase().includes(filenameFilter.toLowerCase()))
    : []

  return (
    <>
      <div className="px-3 py-1.5 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[var(--vos-text-tertiary)] border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
        搜索
      </div>
      <div className="px-2 py-2 flex flex-col gap-1.5 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
        <input
          type="text"
          value={contentQuery}
          onChange={e => setContentQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') doContentSearch(fileIndex)
          }}
          placeholder="搜索内容 (Enter 确认)..."
          className="w-full px-2 py-1.5 text-xs rounded outline-none bg-[var(--vos-bg-input)] border border-[var(--vos-border-subtle)] text-[var(--vos-text-primary)]"
        />
        <input
          type="text"
          value={filenameFilter}
          onChange={e => setFilenameFilter(e.target.value)}
          placeholder="筛选文件名..."
          className="w-full px-2 py-1.5 text-xs rounded outline-none bg-[var(--vos-bg-input)] border border-[var(--vos-border-subtle)] text-[var(--vos-text-primary)]"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="flex items-center gap-2 px-3 py-2">
            <Spinner size={12} />
            <span className="text-xs text-[var(--vos-text-tertiary)]">搜索中...</span>
          </div>
        )}

        {/* Content search results */}
        {!isSearching && results.length > 0 && (
          <div>
            <div className="px-3 py-1 text-[10px] text-[var(--vos-text-tertiary)]">
              找到 {results.reduce((s, r) => s + r.matches.length, 0)} 处匹配
            </div>
            {results.map(result => (
              <div key={result.file.path}>
                <div className="px-3 py-1 flex items-center gap-1.5 text-xs font-medium text-[var(--vos-text-primary)] bg-[var(--vos-bg-input)]">
                  <File size={11} className="shrink-0" />
                  <span className="truncate">{result.file.name}</span>
                </div>
                {result.matches.map((m, i) => (
                  <button
                    key={`${result.file.path}-${m.line}-${i}`}
                    type="button"
                    className="w-full text-left px-4 py-1 text-xs bg-transparent border-none cursor-pointer text-[var(--vos-text-secondary)] block"
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--vos-bg-item-hover)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                    onClick={() =>
                      openFile(
                        result.file.mountId,
                        { name: result.file.name, path: result.file.path, is_dir: false },
                        { line: m.line, col: m.col }
                      )
                    }
                  >
                    <span className="text-[var(--vos-text-tertiary)] mr-1">{m.line}:</span>
                    <span className="font-mono">{m.preview}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Filename filter results */}
        {filenameFilter.trim() && filteredFiles.length === 0 && !isSearching && (
          <p className="text-xs px-3 py-2 text-[var(--vos-text-tertiary)]">无匹配文件</p>
        )}
        {filenameFilter.trim() &&
          filteredFiles.map(entry => (
            <button
              key={entry.path}
              type="button"
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-left bg-transparent border-none text-[var(--vos-text-secondary)] cursor-pointer"
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--vos-bg-item-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              onClick={() =>
                workspace && openFile(workspace.mountId, { name: entry.name, path: entry.path, is_dir: false })
              }
            >
              <File size={11} className="shrink-0" />
              <span className="truncate">{entry.name}</span>
            </button>
          ))}

        {!contentQuery && !filenameFilter && (
          <p className="text-xs px-3 py-3 text-[var(--vos-text-tertiary)]">在上方输入内容关键词，按 Enter 搜索</p>
        )}
      </div>
    </>
  )
}
