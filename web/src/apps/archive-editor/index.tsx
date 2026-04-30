/**
 * Archive Editor App
 *
 * Browse, extract, and create archive files.
 * Supports zip/7z/rar/tar.gz/tar.bz2/tar.xz/tar.zst.
 */

import { AnimatePresence } from 'framer-motion'
import { Archive, ChevronRight, Download, FileText, Folder, Image, Key, Loader2, PackageOpen, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import { request } from '@/infra/api'
import { vfsApi, type ArchiveEntry } from '@/apps/explorer/api'
import type { AppComponentProps } from '@/kernel'
import { getApp, getAppsForFile, openWindow, useFileDefaultsStore, useWindowActions } from '@/kernel'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { VfsFilePickerModal } from '@/shell/FilePicker'

const HIDDEN_FILES = new Set(['.ds_store', '.localized', 'thumbs.db'])
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])

function isHiddenFile(path: string): boolean {
  const name = path.split('/').filter(Boolean).pop()?.toLowerCase() ?? ''
  return HIDDEN_FILES.has(name) || name.startsWith('._')
}

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

type Phase = 'loading' | 'listing' | 'extracting' | 'error'

export default function ArchiveEditor({ windowId, initialAppState }: AppComponentProps) {
  const [mountId, setMountId] = useState((initialAppState?.mountId as string) ?? '')
  const [node, setNode] = useState(initialAppState?.node as { name: string; path: string } | undefined)

  const { setTitle } = useWindowActions(windowId)

  const handleOpenFile = useCallback(
    (result: VfsPickerResult) => {
      const name = result.path.split('/').filter(Boolean).pop() ?? result.path
      setMountId(result.mountId)
      setNode({ path: result.path, name })
      setTitle(name)
    },
    [setTitle]
  )

  const { showFilePicker, closeFilePicker, handleFilePickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'archive-editor',
    onOpenFile: handleOpenFile
  })

  const [phase, setPhase] = useState<Phase>('loading')
  const [entries, setEntries] = useState<ArchiveEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [currentDir, setCurrentDir] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')

  // Selection state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const lastClickedPathRef = useRef<string | null>(null)

  // Extract destination picker state
  const [showExtractPicker, setShowExtractPicker] = useState(false)

  // Context menu (system-wide store)
  const showContextMenu = useContextMenuStore(s => s.show)

  // Filter entries for current directory — only direct children
  const filteredEntries = entries.filter(e => {
    const p = e.path
    if (!currentDir) {
      // Root level: only show items whose path has exactly 1 segment
      const parts = p.split('/').filter(Boolean)
      return parts.length === 1
    }
    const prefix = currentDir.endsWith('/') ? currentDir : `${currentDir}/`
    if (!p.startsWith(prefix)) return false
    const rest = p.slice(prefix.length)
    if (!rest) return false
    const parts = rest.split('/').filter(Boolean)
    // Direct children only: 1 part, or 2 parts where last is empty (dir trailing slash)
    return parts.length === 1
  })

  const loadArchiveContents = useCallback(
    async (pwd?: string) => {
      if (!mountId || !node) {
        setErrorMsg('No file specified')
        setPhase('error')
        return
      }

      try {
        setPhase('loading')

        const result = await vfsApi.listArchiveContents(mountId, node.path, pwd)

        if (result.data.password_required) {
          setNeedsPassword(true)
          setPhase('listing')
          return
        }

        if (result.data.error) throw new Error(result.data.error)

        // Filter out hidden/system files
        setEntries((result.data.entries ?? []).filter(e => !isHiddenFile(e.path)))
        setNeedsPassword(false)
        setPhase('listing')
      } catch (err) {
        console.error('Archive list error:', err)
        setErrorMsg(err instanceof Error ? err.message : 'Failed to list archive')
        setPhase('error')
      }
    },
    [mountId, node]
  )

  useEffect(() => {
    loadArchiveContents()
  }, [loadArchiveContents])

  // Clear selection when directory changes
  useEffect(() => {
    setSelectedPaths(new Set())
    lastClickedPathRef.current = null
  }, [currentDir])

  const handleExtractAll = useCallback(async () => {
    if (!mountId || !node) return
    try {
      setPhase('extracting')
      setExtractProgress('正在解压…')

      const archiveDir = node.path.substring(0, node.path.lastIndexOf('/')) || '/'
      const archiveName = node.name.replace(/\.[^.]+$/, '')
      const destDir = `${archiveDir}/${archiveName}`

      await request('POST', `/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/extract`, {
        archive_path: node.path,
        dest_dir: destDir,
        password: password || undefined
      })

      setExtractProgress(`解压完成 → ${destDir}`)
      setTimeout(() => setPhase('listing'), 2000)
    } catch (err) {
      console.error('Extract error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Extract failed')
      setPhase('error')
    }
  }, [mountId, node, password])

  const handleDownload = useCallback(() => {
    if (!mountId || !node) return
    const url = `/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node.path)}`
    const a = document.createElement('a')
    a.href = url
    a.download = node.name
    a.click()
  }, [mountId, node])

  // --- Selection logic ---

  const handleClickEntry = useCallback(
    (entry: ArchiveEntry, e: React.MouseEvent) => {
      const path = entry.path

      if (e.shiftKey && lastClickedPathRef.current) {
        // Range select
        const paths = filteredEntries.map(en => en.path)
        const anchorIdx = paths.indexOf(lastClickedPathRef.current)
        const currentIdx = paths.indexOf(path)
        if (anchorIdx >= 0 && currentIdx >= 0) {
          const [start, end] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx]
          const rangePaths = paths.slice(start, end + 1)
          setSelectedPaths(prev => {
            const next = new Set(e.metaKey || e.ctrlKey ? prev : [])
            for (const p of rangePaths) next.add(p)
            return next
          })
        }
      } else if (e.metaKey || e.ctrlKey) {
        // Toggle individual
        setSelectedPaths(prev => {
          const next = new Set(prev)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      } else {
        // Single select (replace)
        setSelectedPaths(prev => (prev.size === 1 && prev.has(path) ? prev : new Set([path])))
      }

      lastClickedPathRef.current = path
    },
    [filteredEntries]
  )

  // Double-click: enter dir or open file in the appropriate app (read-only)
  const handleDoubleClickEntry = useCallback(
    (entry: ArchiveEntry) => {
      if (entry.is_dir) {
        setCurrentDir(entry.path.replace(/\/$/, ''))
        return
      }
      if (!mountId || !node) return

      const fileName = entry.path.split('/').filter(Boolean).pop() ?? entry.path
      const ext = getFileExt(fileName)
      const sourceUrl = `/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/read?path=${encodeURIComponent(node.path)}&entry=${encodeURIComponent(entry.path)}`
      const appState = { sourceUrl, fileName, readOnly: true }

      // 1. Check default app
      const defaultAppId = useFileDefaultsStore.getState().getDefault(ext)
      if (defaultAppId) {
        const defaultApp = getApp(defaultAppId)
        if (defaultApp) {
          openWindow(defaultApp.id, { title: fileName, appState })
          return
        }
      }

      // 2. Find associated apps (prefer open apps over preview apps)
      const associatedApps = getAppsForFile(ext)
      const openApps = associatedApps.filter(
        a => a.fileOpenAssociations?.includes(ext) || a.fileAssociations?.includes(ext)
      )
      const appsToUse = openApps.length > 0 ? openApps : associatedApps
      if (appsToUse.length >= 1) {
        openWindow(appsToUse[0].id, { title: fileName, appState })
      } else {
        // 3. Fallback to file-viewer (supports blobUrl mode)
        const blobUrl = `/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/read?path=${encodeURIComponent(node.path)}&entry=${encodeURIComponent(entry.path)}`
        openWindow('file-viewer', { title: fileName, appState: { blobUrl, fileName } })
      }
    },
    [mountId, node]
  )

  // --- Context menu ---

  const handleContextMenu = useCallback(
    (entry: ArchiveEntry, e: React.MouseEvent) => {
      e.preventDefault()
      // If right-clicked item not in selection, select it exclusively
      if (!selectedPaths.has(entry.path)) {
        setSelectedPaths(new Set([entry.path]))
        lastClickedPathRef.current = entry.path
      }
      showContextMenu(e.clientX, e.clientY, [
        {
          id: 'extract',
          label: '解压',
          action: () => setShowExtractPicker(true)
        }
      ])
    },
    [selectedPaths, showContextMenu]
  )

  // Extract selected entries to a VFS directory
  const handleExtractConfirm = useCallback(
    async (result: VfsPickerResult) => {
      setShowExtractPicker(false)
      if (!mountId || !node || selectedPaths.size === 0) return

      const selected = filteredEntries.filter(e => selectedPaths.has(e.path) && !e.is_dir)
      if (selected.length === 0) return

      const destMountId = result.mountId
      const destDir = result.path.replace(/^vfs:\/\/[^/]+/, '') || '/'

      setPhase('extracting')
      let done = 0
      for (const entry of selected) {
        setExtractProgress(`正在解压 ${done + 1}/${selected.length}: ${entry.path.split('/').filter(Boolean).pop()}`)
        try {
          const blob = await vfsApi.readArchiveEntry(mountId, node.path, entry.path)
          const fileName = entry.path.split('/').filter(Boolean).pop() ?? entry.path
          const destPath = destDir === '/' ? `/${fileName}` : `${destDir}/${fileName}`
          const file = new File([blob], fileName)
          await vfsApi.uploadVfsFile(destMountId, destPath, file)
          done++
        } catch (err) {
          console.error('Extract failed for:', entry.path, err)
        }
      }
      setExtractProgress(`解压完成: ${done} 个文件`)
      setTimeout(() => setPhase('listing'), 2000)
    },
    [mountId, node, selectedPaths, filteredEntries]
  )

  // Breadcrumb path segments
  const breadcrumbSegments = currentDir
    ? currentDir.split('/').filter(Boolean)
    : []

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  if (phase === 'error') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)]">
        <Archive size={48} className="opacity-30 text-[var(--vos-text-tertiary)]" />
        <div className="text-sm text-[var(--vos-text-secondary)]">无法打开压缩文件</div>
        <div className="text-xs text-[var(--vos-text-tertiary)]">{errorMsg}</div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)]">
        <Loader2 size={32} className="animate-spin text-[var(--vos-text-tertiary)]" />
        <div className="text-[13px] text-[var(--vos-text-tertiary)]">正在读取压缩文件…</div>
      </div>
    )
  }

  if (phase === 'extracting') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)]">
        <Loader2 size={32} className="animate-spin text-[var(--vos-accent-primary)]" />
        <div className="text-[13px] text-[var(--vos-text-secondary)]">{extractProgress}</div>
      </div>
    )
  }

  const hasSelection = selectedPaths.size > 0

  return (
    <div className="w-full h-full flex flex-col bg-[var(--vos-bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-[6px] border-b border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-secondary)] shrink-0">
        <Archive size={16} className="text-[var(--vos-accent-warning)]" />
        <span className="text-[13px] font-medium flex-1 text-[var(--vos-text-primary)]">{node?.name ?? 'Archive'}</span>
        <span className="text-[11px] text-[var(--vos-text-tertiary)]">
          {hasSelection ? `已选 ${selectedPaths.size} / ${filteredEntries.length}` : `${filteredEntries.length} 项`}
        </span>
        <button
          type="button"
          onClick={handleExtractAll}
          className="flex items-center gap-1 px-[10px] py-1 text-xs rounded-md border-none cursor-pointer bg-[var(--vos-accent-primary)] text-white"
        >
          <PackageOpen size={14} />
          解压全部
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1 px-[10px] py-1 text-xs rounded-md border-none cursor-pointer bg-transparent text-[var(--vos-text-secondary)]"
        >
          <Download size={14} />
          下载
        </button>
      </div>

      {/* Password prompt */}
      {needsPassword && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--vos-accent-warning-bg)] border-b border-b-[var(--vos-border-subtle)]">
          <Key size={14} className="text-[var(--vos-accent-warning)]" />
          <span className="text-xs text-[var(--vos-text-secondary)]">此压缩文件需要密码</span>
          <input
            type="password"
            placeholder="输入密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="flex-1 max-w-[200px] px-2 py-1 text-xs rounded border border-[var(--vos-border-subtle)] bg-[var(--vos-bg-primary)] text-[var(--vos-text-primary)] outline-none"
            onKeyDown={e => e.key === 'Enter' && loadArchiveContents(password)}
          />
          <button
            type="button"
            onClick={() => loadArchiveContents(password)}
            className="px-3 py-1 text-xs rounded border-none bg-[var(--vos-accent-primary)] text-white cursor-pointer"
          >
            确定
          </button>
        </div>
      )}

      {/* Breadcrumb — hierarchical navigation */}
      <div className="flex items-center gap-0 px-3 py-1 border-b border-b-[var(--vos-border-subtle)] text-xs overflow-x-auto shrink-0">
        <button
          type="button"
          onClick={() => setCurrentDir('')}
          className="bg-transparent border-none cursor-pointer text-[var(--vos-accent-primary)] shrink-0 hover:underline"
        >
          根目录
        </button>
        {breadcrumbSegments.map((seg, idx) => {
          const targetDir = breadcrumbSegments.slice(0, idx + 1).join('/')
          const isLast = idx === breadcrumbSegments.length - 1
          return (
            <span key={targetDir} className="flex items-center shrink-0">
              <ChevronRight size={10} className="mx-1 text-[var(--vos-text-tertiary)]" />
              {isLast ? (
                <span className="text-[var(--vos-text-primary)] font-medium">{seg}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentDir(targetDir)}
                  className="bg-transparent border-none cursor-pointer text-[var(--vos-accent-primary)] hover:underline"
                >
                  {seg}
                </button>
              )}
            </span>
          )
        })}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center text-[var(--vos-text-tertiary)] text-[13px]">压缩文件为空</div>
        ) : (
          filteredEntries.map(entry => {
            const name = entry.path.split('/').filter(Boolean).pop() ?? entry.path
            const ext = getFileExt(name)
            const isImage = IMAGE_EXTS.has(ext)
            const isSelected = selectedPaths.has(entry.path)
            return (
              <div
                key={entry.path}
                className={`flex items-center gap-2 px-3 py-[6px] border-b border-b-[var(--vos-border-subtle)] text-xs cursor-pointer select-none ${
                  isSelected
                    ? 'bg-[var(--vos-accent-primary)]/15 text-[var(--vos-text-primary)]'
                    : 'hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-primary)]'
                }`}
                onClick={e => handleClickEntry(entry, e)}
                onDoubleClick={() => handleDoubleClickEntry(entry)}
                onContextMenu={e => handleContextMenu(entry, e)}
              >
                {entry.is_dir ? (
                  <Folder size={14} className="text-[var(--vos-accent-warning)] shrink-0" />
                ) : isImage ? (
                  <Image size={14} className="text-[var(--vos-accent-primary)] shrink-0" />
                ) : (
                  <FileText size={14} className="text-[var(--vos-text-tertiary)] shrink-0" />
                )}
                <span className="flex-1 truncate">{name}</span>
                {entry.encrypted && <Key size={12} className="text-[var(--vos-accent-warning)]" />}
                {!entry.is_dir && (
                  <span className="text-[var(--vos-text-tertiary)] text-[11px]">{formatSize(entry.size)}</span>
                )}
              </div>
            )
          })
        )}
      </div>

      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
        )}
        {showExtractPicker && (
          <VfsFilePickerModal mode="directory" onConfirm={handleExtractConfirm} onClose={() => setShowExtractPicker(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
