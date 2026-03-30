import { ChevronLeft, File, FolderOpen, Home, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { CreateVfsMountReq, VfsFileContent, VfsMount, VfsNode, VfsSourceKind } from '@/infra/api'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'

// ─── Mount form ────────────────────────────────────────────────────────────

function MountForm({ onClose, onCreated }: { onClose: () => void; onCreated: (m: VfsMount) => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<VfsSourceKind>('local')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)
  const fc = 'w-full text-xs px-2 py-1.5 rounded border-none outline-none'
  const fs = {
    background: 'var(--vos-bg-input)',
    color: 'var(--vos-text-primary)',
    border: '0.5px solid var(--vos-border-subtle)'
  }

  const submit = async () => {
    if (!name || !source) return
    setSaving(true)
    try {
      const body: CreateVfsMountReq = { name, kind, root: source }
      const res = await apiClient.createVfsMount(body)
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="rounded-lg p-4 flex flex-col gap-3"
        style={{ width: 380, background: 'var(--vos-bg-card)', boxShadow: '0 8px 32px rgba(0,0,0,.25)' }}
      >
        <div className="text-sm font-medium">Add Mount</div>
        <input
          className={fc}
          style={fs}
          placeholder="Mount name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <select className={fc} style={fs} value={kind} onChange={e => setKind(e.target.value as VfsSourceKind)}>
          <option value="local">Local</option>
          <option value="sftp">SFTP</option>
          <option value="ftp">FTP</option>
          <option value="smb">SMB</option>
          <option value="s3">S3</option>
        </select>
        <input
          className={fc}
          style={fs}
          placeholder={kind === 'local' ? 'Directory path (e.g. /home/user)' : 'URI'}
          value={source}
          onChange={e => setSource(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-bg-hover)', color: 'var(--vos-text-primary)' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded cursor-pointer border-none"
            style={{ background: 'var(--vos-accent-primary)', color: '#fff' }}
            onClick={submit}
            disabled={saving}
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── File size formatter ───────────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function ExplorerApp(_props: AppComponentProps) {
  const [mounts, setMounts] = useState<VfsMount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [selectedMount, setSelectedMount] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState<VfsNode[]>([])
  const [preview, setPreview] = useState<VfsFileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [pathHistory, setPathHistory] = useState<string[]>([])

  const reload = useCallback(async () => {
    try {
      const r = await apiClient.getVfsMounts()
      setMounts(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const browse = async (mountId: string, path: string) => {
    setLoading(true)
    setPreview(null)
    try {
      const r = await apiClient.listVfsDir(mountId, path)
      setEntries(r.data)
      setCurrentPath(path)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const selectMount = (id: string) => {
    setSelectedMount(id)
    setPathHistory([])
    browse(id, '/')
  }

  const navigate = (path: string) => {
    if (selectedMount) {
      setPathHistory(h => [...h, currentPath])
      browse(selectedMount, path)
    }
  }

  const goBack = () => {
    if (pathHistory.length > 0 && selectedMount) {
      const prev = pathHistory[pathHistory.length - 1]
      setPathHistory(h => h.slice(0, -1))
      browse(selectedMount, prev)
    }
  }

  const openFile = async (mountId: string, path: string) => {
    setLoading(true)
    try {
      const r = await apiClient.readVfsFile(mountId, path)
      setPreview(r.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const deleteMount = async (id: string) => {
    await apiClient.deleteVfsMount(id)
    if (selectedMount === id) {
      setSelectedMount(null)
      setEntries([])
    }
    reload()
  }

  return (
    <div className="flex h-full relative">
      {showForm && (
        <MountForm
          onClose={() => setShowForm(false)}
          onCreated={m => {
            setMounts(p => [...p, m])
            setShowForm(false)
          }}
        />
      )}

      {/* Sidebar — mount list */}
      <div
        className="flex flex-col flex-shrink-0 overflow-auto"
        style={{ width: 200, borderRight: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
      >
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--vos-text-tertiary)' }}>
            MOUNTS
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={reload}
            >
              <RefreshCw size={12} />
            </button>
            <button
              type="button"
              className="bg-transparent border-none cursor-pointer p-0"
              style={{ color: 'var(--vos-accent-primary)' }}
              onClick={() => setShowForm(true)}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        {mounts.map(m => (
          <div
            key={m.id}
            className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group"
            style={{ background: selectedMount === m.id ? 'var(--vos-bg-hover)' : 'transparent' }}
          >
            <Home
              size={12}
              style={{ color: selectedMount === m.id ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
            />
            <span className="flex-1 truncate" onClick={() => selectMount(m.id)} onKeyDown={() => {}}>
              {m.name}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--vos-text-tertiary)' }}>
              {m.kind}
            </span>
            <button
              type="button"
              className="hidden group-hover:block bg-transparent border-none p-0 cursor-pointer"
              style={{ color: 'var(--vos-text-tertiary)' }}
              onClick={() => deleteMount(m.id)}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {mounts.length === 0 && (
          <div
            className="flex-1 flex items-center justify-center text-xs"
            style={{ color: 'var(--vos-text-tertiary)' }}
          >
            No mounts
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedMount ? (
          <>
            {/* Path bar */}
            <div
              className="flex items-center gap-2 h-9 px-3 flex-shrink-0"
              style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', background: 'var(--vos-bg-surface)' }}
            >
              <button
                type="button"
                className="bg-transparent border-none cursor-pointer p-0"
                style={{ color: pathHistory.length > 0 ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)' }}
                disabled={pathHistory.length === 0}
                onClick={goBack}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--vos-text-secondary)' }}>
                {currentPath}
              </span>
              <button
                type="button"
                className="bg-transparent border-none cursor-pointer p-0"
                style={{ color: 'var(--vos-accent-primary)' }}
                onClick={() => selectedMount && browse(selectedMount, currentPath)}
              >
                <RefreshCw size={12} />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* File list */}
              <div className={`flex-1 overflow-auto ${preview ? '' : 'w-full'}`}>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={16} className="animate-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
                  </div>
                ) : (
                  <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Name', 'Size', 'Modified'].map(h => (
                          <th
                            key={h}
                            className="px-3 py-1.5 text-left font-medium sticky top-0"
                            style={{
                              background: 'var(--vos-bg-surface)',
                              borderBottom: '1px solid var(--vos-border-subtle)'
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(e => (
                        <tr
                          key={e.name}
                          className="cursor-pointer"
                          style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
                          onClick={() => {
                            if (e.is_dir) {
                              navigate(currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`)
                            } else {
                              openFile(selectedMount!, currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`)
                            }
                          }}
                          onKeyDown={() => {}}
                        >
                          <td className="px-3 py-1.5 flex items-center gap-1.5">
                            {e.is_dir ? (
                              <FolderOpen size={12} style={{ color: 'var(--vos-accent-warning)' }} />
                            ) : (
                              <File size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
                            )}
                            {e.name}
                          </td>
                          <td className="px-3 py-1.5" style={{ color: 'var(--vos-text-tertiary)' }}>
                            {e.is_dir ? '—' : fmtSize(e.size ?? 0)}
                          </td>
                          <td className="px-3 py-1.5" style={{ color: 'var(--vos-text-tertiary)' }}>
                            {e.modified ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!loading && entries.length === 0 && (
                  <div
                    className="flex items-center justify-center py-8 text-xs"
                    style={{ color: 'var(--vos-text-tertiary)' }}
                  >
                    Empty directory
                  </div>
                )}
              </div>

              {/* File preview */}
              {preview && (
                <div
                  className="flex flex-col overflow-hidden"
                  style={{ width: 360, borderLeft: '0.5px solid var(--vos-border-subtle)' }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-2 flex-shrink-0"
                    style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
                  >
                    <span className="text-xs font-mono truncate">{preview.path.split('/').pop()}</span>
                    <button
                      type="button"
                      className="bg-transparent border-none cursor-pointer text-[10px]"
                      style={{ color: 'var(--vos-text-tertiary)' }}
                      onClick={() => setPreview(null)}
                    >
                      Close
                    </button>
                  </div>
                  <div
                    className="flex-1 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap"
                    style={{ color: 'var(--vos-text-primary)' }}
                  >
                    {preview.is_binary ? (
                      <span style={{ color: 'var(--vos-text-tertiary)', fontStyle: 'italic' }}>
                        Binary file — cannot preview
                      </span>
                    ) : (
                      preview.content
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FolderOpen size={48} style={{ color: 'var(--vos-text-tertiary)', margin: '0 auto 12px' }} />
              <div className="text-sm" style={{ color: 'var(--vos-text-secondary)' }}>
                Explorer
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--vos-text-tertiary)' }}>
                Mount a filesystem to browse files
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
