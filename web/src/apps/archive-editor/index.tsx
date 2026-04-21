/**
 * Archive Editor App
 *
 * Browse, extract, and create archive files.
 * Supports zip/7z/rar/tar.gz/tar.bz2/tar.xz/tar.zst.
 *
 * Backend: Rust ventoos-vfs archive module (enhanced with tokimo-universal-archiver approach)
 * Frontend: Lists archive contents, extract/compress UI, password support
 */

import { AnimatePresence } from 'framer-motion'
import { Archive, ArrowLeft, Download, FileText, Folder, Key, Loader2, PackageOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import { request } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { VfsFilePickerModal } from '@/shell/FilePicker'

interface ArchiveEntry {
  path: string
  size: number
  compressed_size?: number
  is_dir: boolean
  modified?: string
  encrypted?: boolean
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

  const loadArchiveContents = useCallback(
    async (pwd?: string) => {
      if (!mountId || !node) {
        setErrorMsg('No file specified')
        setPhase('error')
        return
      }

      try {
        setPhase('loading')
        const params = new URLSearchParams({ path: node.path })
        if (pwd) params.set('password', pwd)

        const data = await request<{ entries?: ArchiveEntry[]; error?: string; password_required?: boolean }>(
          'GET',
          `/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/list?${params}`
        )

        if (data.password_required) {
          setNeedsPassword(true)
          setPhase('listing')
          return
        }

        if (data.error) throw new Error(data.error)

        setEntries(data.entries ?? [])
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

  const handleExtractAll = useCallback(async () => {
    if (!mountId || !node) return
    try {
      setPhase('extracting')
      setExtractProgress('正在解压…')

      // Extract to same directory as the archive
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

  // Filter entries for current directory
  const filteredEntries = entries.filter(e => {
    if (!currentDir) {
      // Root level: show only top-level items
      const parts = e.path.split('/').filter(Boolean)
      return parts.length === 1 || (parts.length === 2 && e.is_dir && e.path.endsWith('/'))
    }
    const prefix = currentDir.endsWith('/') ? currentDir : `${currentDir}/`
    if (!e.path.startsWith(prefix)) return false
    const rest = e.path.slice(prefix.length)
    const parts = rest.split('/').filter(Boolean)
    return parts.length === 1 || (parts.length === 2 && e.is_dir)
  })

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

  return (
    <div className="w-full h-full flex flex-col bg-[var(--vos-bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-[6px] border-b border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-secondary)] shrink-0">
        <Archive size={16} className="text-[var(--vos-accent-warning)]" />
        <span className="text-[13px] font-medium flex-1 text-[var(--vos-text-primary)]">{node?.name ?? 'Archive'}</span>
        <span className="text-[11px] text-[var(--vos-text-tertiary)]">{entries.length} 项</span>
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

      {/* Breadcrumb */}
      {currentDir && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-b-[var(--vos-border-subtle)] text-xs">
          <button
            type="button"
            onClick={() => setCurrentDir('')}
            className="bg-transparent border-none cursor-pointer text-[var(--vos-accent-primary)] flex items-center gap-[2px]"
          >
            <ArrowLeft size={12} />
            根目录
          </button>
          <span className="text-[var(--vos-text-tertiary)]">/</span>
          <span className="text-[var(--vos-text-primary)]">{currentDir}</span>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center text-[var(--vos-text-tertiary)] text-[13px]">压缩文件为空</div>
        ) : (
          filteredEntries.map(entry => {
            const name = entry.path.split('/').filter(Boolean).pop() ?? entry.path
            return (
              <div
                key={entry.path}
                className={`flex items-center gap-2 px-3 py-[6px] border-b border-b-[var(--vos-border-subtle)] text-xs ${entry.is_dir ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={() => {
                  if (entry.is_dir) setCurrentDir(entry.path.replace(/\/$/, ''))
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && entry.is_dir) setCurrentDir(entry.path.replace(/\/$/, ''))
                }}
              >
                {entry.is_dir ? (
                  <Folder size={14} className="text-[var(--vos-accent-warning)] shrink-0" />
                ) : (
                  <FileText size={14} className="text-[var(--vos-text-tertiary)] shrink-0" />
                )}
                <span className="flex-1 text-[var(--vos-text-primary)]">{name}</span>
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
      </AnimatePresence>
    </div>
  )
}
