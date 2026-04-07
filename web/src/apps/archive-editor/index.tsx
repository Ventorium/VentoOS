/**
 * Archive Editor App
 *
 * Browse, extract, and create archive files.
 * Supports zip/7z/rar/tar.gz/tar.bz2/tar.xz/tar.zst.
 *
 * Backend: Rust ventoos-vfs archive module (enhanced with tokimo-universal-archiver approach)
 * Frontend: Lists archive contents, extract/compress UI, password support
 */

import {
  Archive,
  ArrowLeft,
  Download,
  FileText,
  Folder,
  Key,
  Loader2,
  PackageOpen
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AppComponentProps } from '@/kernel'
import { apiClient } from '@/infra/api'

interface ArchiveEntry {
  path: string
  size: number
  compressed_size?: number
  is_dir: boolean
  modified?: string
  encrypted?: boolean
}

type Phase = 'loading' | 'listing' | 'extracting' | 'error'

export default function ArchiveEditor({ initialAppState }: AppComponentProps) {
  const mountId = (initialAppState?.mountId as string) ?? ''
  const node = initialAppState?.node as { name: string; path: string } | undefined

  const [phase, setPhase] = useState<Phase>('loading')
  const [entries, setEntries] = useState<ArchiveEntry[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [currentDir, setCurrentDir] = useState('')
  const [password, setPassword] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')

  const loadArchiveContents = useCallback(async (pwd?: string) => {
    if (!mountId || !node) {
      setErrorMsg('No file specified')
      setPhase('error')
      return
    }

    try {
      setPhase('loading')
      const params = new URLSearchParams({ path: node.path })
      if (pwd) params.set('password', pwd)

      const resp = await apiClient.get(`/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/list?${params}`)
      const data = resp.data as { entries?: ArchiveEntry[]; error?: string; password_required?: boolean }

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
  }, [mountId, node])

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

      await apiClient.post(`/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/extract`, {
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
    const url = `${apiClient.defaults.baseURL ?? ''}/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node.path)}`
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
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--vos-bg-primary)' }}>
        <Archive size={48} style={{ opacity: 0.3, color: 'var(--vos-text-tertiary)' }} />
        <div style={{ fontSize: 14, color: 'var(--vos-text-secondary)' }}>无法打开压缩文件</div>
        <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>{errorMsg}</div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--vos-bg-primary)' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--vos-text-tertiary)' }} />
        <div style={{ fontSize: 13, color: 'var(--vos-text-tertiary)' }}>正在读取压缩文件…</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (phase === 'extracting') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--vos-bg-primary)' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--vos-accent-primary)' }} />
        <div style={{ fontSize: 13, color: 'var(--vos-text-secondary)' }}>{extractProgress}</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--vos-bg-primary)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid var(--vos-border-subtle)', background: 'var(--vos-bg-secondary)', flexShrink: 0
      }}>
        <Archive size={16} style={{ color: 'var(--vos-accent-warning)' }} />
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: 'var(--vos-text-primary)' }}>
          {node?.name ?? 'Archive'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--vos-text-tertiary)' }}>
          {entries.length} 项
        </span>
        <button
          type="button"
          onClick={handleExtractAll}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'var(--vos-accent-primary)', color: '#fff'
          }}
        >
          <PackageOpen size={14} />
          解压全部
        </button>
        <button
          type="button"
          onClick={handleDownload}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--vos-text-secondary)',
            border_: '1px solid var(--vos-border-subtle)'
          }}
        >
          <Download size={14} />
          下载
        </button>
      </div>

      {/* Password prompt */}
      {needsPassword && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--vos-accent-warning-bg)', borderBottom: '1px solid var(--vos-border-subtle)'
        }}>
          <Key size={14} style={{ color: 'var(--vos-accent-warning)' }} />
          <span style={{ fontSize: 12, color: 'var(--vos-text-secondary)' }}>此压缩文件需要密码</span>
          <input
            type="password"
            placeholder="输入密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              flex: 1, maxWidth: 200, padding: '4px 8px', fontSize: 12, borderRadius: 4,
              border: '1px solid var(--vos-border-subtle)', background: 'var(--vos-bg-primary)',
              color: 'var(--vos-text-primary)', outline: 'none'
            }}
            onKeyDown={e => e.key === 'Enter' && loadArchiveContents(password)}
          />
          <button
            type="button"
            onClick={() => loadArchiveContents(password)}
            style={{
              padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none',
              background: 'var(--vos-accent-primary)', color: '#fff', cursor: 'pointer'
            }}
          >
            确定
          </button>
        </div>
      )}

      {/* Breadcrumb */}
      {currentDir && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px',
          borderBottom: '1px solid var(--vos-border-subtle)', fontSize: 12
        }}>
          <button
            type="button"
            onClick={() => setCurrentDir('')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--vos-accent-primary)', display: 'flex', alignItems: 'center', gap: 2
            }}
          >
            <ArrowLeft size={12} />
            根目录
          </button>
          <span style={{ color: 'var(--vos-text-tertiary)' }}>/</span>
          <span style={{ color: 'var(--vos-text-primary)' }}>{currentDir}</span>
        </div>
      )}

      {/* File list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filteredEntries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--vos-text-tertiary)', fontSize: 13 }}>
            压缩文件为空
          </div>
        ) : (
          filteredEntries.map(entry => {
            const name = entry.path.split('/').filter(Boolean).pop() ?? entry.path
            return (
              <div
                key={entry.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                  borderBottom: '1px solid var(--vos-border-subtle)',
                  cursor: entry.is_dir ? 'pointer' : 'default',
                  fontSize: 12
                }}
                onClick={() => {
                  if (entry.is_dir) setCurrentDir(entry.path.replace(/\/$/, ''))
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && entry.is_dir) setCurrentDir(entry.path.replace(/\/$/, ''))
                }}
              >
                {entry.is_dir ? (
                  <Folder size={14} style={{ color: 'var(--vos-accent-warning)', flexShrink: 0 }} />
                ) : (
                  <FileText size={14} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, color: 'var(--vos-text-primary)' }}>{name}</span>
                {entry.encrypted && <Key size={12} style={{ color: 'var(--vos-accent-warning)' }} />}
                {!entry.is_dir && (
                  <span style={{ color: 'var(--vos-text-tertiary)', fontSize: 11 }}>
                    {formatSize(entry.size)}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
