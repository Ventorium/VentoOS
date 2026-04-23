import {
  AlertTriangle,
  Crosshair,
  RefreshCw,
  Search,
  SortAsc,
  SortDesc,
  Swords,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppLayout, ConfirmDialog, EmptyState, SectionHeader, Spinner } from '@/components'
import { FormInput } from '@/components/ui'
import type { AppComponentProps } from '@/kernel'
import { notificationService } from '@/services'
import type { PortProcessInfo, ProcessInfo } from './api'
import { processKillerApi } from './api'

// ─── Context Menu ──────────────────────────────────────────────────────────

interface CtxMenuItem {
  label: string
  danger?: boolean
  action: () => void
}

function ContextMenu({
  x,
  y,
  items,
  onDismiss
}: {
  x: number
  y: number
  items: CtxMenuItem[]
  onDismiss: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const nx = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : x
    const ny = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onDismiss])

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[var(--vos-bg-context-menu)] border border-[var(--vos-border-subtle)] rounded-[6px] py-1 min-w-[140px] select-none shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className="py-[5px] px-[14px] cursor-pointer text-xs whitespace-nowrap hover:bg-[var(--vos-bg-item-hover)] flex items-center gap-2"
          style={{ color: item.danger ? '#f14c4c' : 'var(--vos-text-primary)' }}
          onClick={() => {
            item.action()
            onDismiss()
          }}
        >
          {item.danger && <Swords size={12} />}
          {item.label}
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

type SortField = 'pid' | 'cpu' | 'mem' | 'rss'
type SortDir = 'asc' | 'desc'

// ─── Main Component ────────────────────────────────────────────────────────

export default function ProcessKillerApp({ win }: AppComponentProps) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [portQuery, setPortQuery] = useState('')
  const [portResults, setPortResults] = useState<PortProcessInfo[] | null>(null)
  const [portLoading, setPortLoading] = useState(false)
  const [sortField, setSortField] = useState<SortField>('cpu')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; process: ProcessInfo } | null>(null)
  const [confirmKill, setConfirmKill] = useState<ProcessInfo | null>(null)
  const [killing, setKilling] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const loadProcesses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await processKillerApi.getProcesses()
      setProcesses(res.data || [])
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Failed to load processes', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProcesses()
    const interval = setInterval(loadProcesses, 5000)
    return () => clearInterval(interval)
  }, [loadProcesses])

  const handlePortSearch = useCallback(async () => {
    const port = parseInt(portQuery, 10)
    if (isNaN(port) || port < 1 || port > 65535) return
    setPortLoading(true)
    try {
      const res = await processKillerApi.findByPort(port)
      setPortResults(res.data || [])
    } catch (e) {
      console.error('Failed to find by port', e)
    } finally {
      setPortLoading(false)
    }
  }, [portQuery])

  const handleKill = useCallback(async (process: ProcessInfo) => {
    setKilling(true)
    try {
      const res = await processKillerApi.killProcess(process.pid)
      if (res.data?.killed) {
        notificationService.success('进程查杀成功', `已终止 ${process.name} (PID: ${process.pid})`)
        setProcesses(prev => prev.filter(p => p.pid !== process.pid))
        setPortResults(prev => prev?.filter(p => p.pid !== process.pid) ?? null)
      } else {
        notificationService.error('进程查杀失败', res.message || `无法终止 ${process.name} (PID: ${process.pid})`)
      }
    } catch (e: any) {
      const msg = e?.message || '未知错误'
      notificationService.error('进程查杀失败', `终止 ${process.name} (PID: ${process.pid}) 时出错: ${msg}`)
      console.error('Failed to kill process', e)
    } finally {
      setKilling(false)
      setConfirmKill(null)
    }
  }, [])

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('desc')
      return field
    })
  }, [])

  const filtered = useMemo(() => {
    let list = processes.filter(p => {
      const q = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        p.args.toLowerCase().includes(q) ||
        p.pid.toString().includes(q)
      )
    })

    list.sort((a, b) => {
      let av: number, bv: number
      switch (sortField) {
        case 'pid':
          av = a.pid
          bv = b.pid
          break
        case 'cpu':
          av = a.cpu_percent
          bv = b.cpu_percent
          break
        case 'mem':
          av = a.mem_percent
          bv = b.mem_percent
          break
        case 'rss':
          av = a.rss_bytes
          bv = b.rss_bytes
          break
        default:
          av = a.cpu_percent
          bv = b.cpu_percent
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })

    return list
  }, [processes, search, sortField, sortDir])

  const totalRss = useMemo(() => processes.reduce((sum, p) => sum + p.rss_bytes, 0), [processes])

  const getCpuColor = (cpu: number) => {
    if (cpu >= 50) return '#f14c4c'
    if (cpu >= 10) return '#f59e0b'
    return 'var(--vos-text-primary)'
  }

  const getMemColor = (mem: number) => {
    if (mem >= 20) return '#f14c4c'
    if (mem >= 5) return '#f59e0b'
    return 'var(--vos-text-primary)'
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="w-3 h-3 inline-block" />
    return sortDir === 'asc' ? <SortAsc size={12} /> : <SortDesc size={12} />
  }

  return (
    <AppLayout win={win}>
      <div className="w-full h-full flex flex-col bg-[var(--vos-bg-primary)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--vos-border-subtle)] shrink-0">
          <Crosshair size={16} className="text-[var(--vos-text-primary)]" />
          <span className="text-sm font-semibold text-[var(--vos-text-primary)]">进程查杀</span>
          <div className="flex-1" />

          {/* Port search */}
          <div className="flex items-center gap-2">
            <FormInput
              value={portQuery}
              onChange={e => setPortQuery(e.target.value)}
              placeholder="端口 (如 8080)"
              className="w-[120px] text-xs"
              onKeyDown={e => {
                if (e.key === 'Enter') handlePortSearch()
              }}
            />
            <button
              className="p-1.5 rounded-md bg-[var(--vos-bg-item-hover)] hover:bg-[var(--vos-bg-item-active)] text-[var(--vos-text-primary)] transition-colors"
              onClick={handlePortSearch}
              disabled={portLoading}
            >
              <Search size={13} />
            </button>
          </div>

          <div className="w-px h-5 bg-[var(--vos-border-subtle)] mx-1" />

          {/* Text search */}
          <div className="flex items-center gap-2">
            <FormInput
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索进程..."
              className="w-[160px] text-xs"
            />
          </div>

          <div className="w-px h-5 bg-[var(--vos-border-subtle)] mx-1" />

          <button
            className="p-1.5 rounded-md bg-[var(--vos-bg-item-hover)] hover:bg-[var(--vos-bg-item-active)] text-[var(--vos-text-primary)] transition-colors"
            onClick={loadProcesses}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 px-4 py-2 text-[11px] text-[var(--vos-text-secondary)] border-b border-[var(--vos-border-subtle)] shrink-0">
          <span>总进程: {processes.length}</span>
          <span>显示: {filtered.length}</span>
          <span>总内存: {formatBytes(totalRss)}</span>
          {lastRefresh && <span>更新: {lastRefresh.toLocaleTimeString()}</span>}
        </div>

        {/* Port results */}
        {portResults !== null && (
          <div className="px-4 py-2 border-b border-[var(--vos-border-subtle)] shrink-0 bg-[var(--vos-bg-item-hover)]/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--vos-text-primary)]">
                端口 {portQuery} 查询结果
              </span>
              <button
                className="p-0.5 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
                onClick={() => setPortResults(null)}
              >
                <X size={12} />
              </button>
            </div>
            {portResults.length === 0 ? (
              <span className="text-xs text-[var(--vos-text-secondary)]">无进程占用该端口</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {portResults.map(p => (
                  <div
                    key={p.pid}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[var(--vos-bg-item-hover)] border border-[var(--vos-border-subtle)]"
                    title={p.args || p.name}
                  >
                    <span className="text-xs font-mono text-[var(--vos-text-primary)] truncate max-w-[160px]" title={p.name}>{p.name}</span>
                    <span className="text-[10px] text-[var(--vos-text-secondary)]">PID {p.pid}</span>
                    <span className="text-[10px] text-[var(--vos-text-secondary)]">{p.protocol}</span>
                    <button
                      className="ml-1 p-0.5 rounded hover:bg-[#f14c4c]/20 text-[#f14c4c]"
                      onClick={() => {
                        const proc = processes.find(x => x.pid === p.pid)
                        if (proc) {
                          setConfirmKill(proc)
                        } else {
                          // Process not in current list — kill by PID directly
                          setConfirmKill({
                            pid: p.pid,
                            name: p.name,
                            args: p.args || '',
                            cpu_percent: 0,
                            mem_percent: 0,
                            rss_bytes: 0,
                            vsz_bytes: 0
                          })
                        }
                      }}
                    >
                      <Swords size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Process table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--vos-bg-primary)]">
              <tr className="border-b border-[var(--vos-border-subtle)] text-[var(--vos-text-secondary)]">
                <th
                  className="px-4 py-2 text-left font-medium cursor-pointer hover:text-[var(--vos-text-primary)] select-none"
                  onClick={() => handleSort('pid')}
                >
                  <span className="flex items-center gap-1">
                    PID <SortIcon field="pid" />
                  </span>
                </th>
                <th className="px-4 py-2 text-left font-medium">名称</th>
                <th
                  className="px-4 py-2 text-left font-medium cursor-pointer hover:text-[var(--vos-text-primary)] select-none"
                  onClick={() => handleSort('cpu')}
                >
                  <span className="flex items-center gap-1">
                    CPU% <SortIcon field="cpu" />
                  </span>
                </th>
                <th
                  className="px-4 py-2 text-left font-medium cursor-pointer hover:text-[var(--vos-text-primary)] select-none"
                  onClick={() => handleSort('mem')}
                >
                  <span className="flex items-center gap-1">
                    内存% <SortIcon field="mem" />
                  </span>
                </th>
                <th
                  className="px-4 py-2 text-left font-medium cursor-pointer hover:text-[var(--vos-text-primary)] select-none"
                  onClick={() => handleSort('rss')}
                >
                  <span className="flex items-center gap-1">
                    RSS <SortIcon field="rss" />
                  </span>
                </th>
                <th className="px-4 py-2 text-left font-medium">参数</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr
                  key={p.pid}
                  className="border-b border-[var(--vos-border-subtle)]/50 hover:bg-[var(--vos-bg-item-hover)] cursor-context-menu transition-colors"
                  onContextMenu={e => {
                    e.preventDefault()
                    setCtxMenu({ x: e.clientX, y: e.clientY, process: p })
                  }}
                >
                  <td className="px-4 py-2 font-mono text-[var(--vos-text-primary)]">{p.pid}</td>
                  <td className="px-4 py-2">
                    <span
                      className="font-medium text-[var(--vos-text-primary)] truncate block max-w-[140px]"
                      title={p.name}
                    >
                      {p.name}
                    </span>
                  </td>
                  <td
                    className="px-4 py-2 font-mono"
                    style={{ color: getCpuColor(p.cpu_percent) }}
                  >
                    {p.cpu_percent.toFixed(1)}%
                  </td>
                  <td
                    className="px-4 py-2 font-mono"
                    style={{ color: getMemColor(p.mem_percent) }}
                  >
                    {p.mem_percent.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 font-mono text-[var(--vos-text-secondary)]">
                    {formatBytes(p.rss_bytes)}
                  </td>
                  <td
                    className="px-4 py-2 text-[var(--vos-text-secondary)] truncate max-w-[300px]"
                    title={p.args}
                  >
                    {p.args}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && (
            <div className="flex items-center justify-center h-48">
              <EmptyState
                icon={<Search size={32} />}
                title="无匹配进程"
                description={search ? '请尝试其他搜索条件' : '暂无进程数据'}
              />
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              label: '查杀进程',
              danger: true,
              action: () => setConfirmKill(ctxMenu.process)
            }
          ]}
          onDismiss={() => setCtxMenu(null)}
        />
      )}

      {/* Confirm Kill Dialog */}
      <ConfirmDialog
        open={!!confirmKill}
        onClose={() => setConfirmKill(null)}
        onConfirm={() => confirmKill && handleKill(confirmKill)}
        title="确认查杀进程"
        icon={<AlertTriangle size={18} className="text-[#f14c4c]" />}
        confirmText="确认查杀"
        danger
        loading={killing}
      >
        <p className="text-xs text-[var(--vos-text-secondary)]">
          确定要查杀进程 <strong className="text-[var(--vos-text-primary)]">{confirmKill?.name}</strong> (PID: {confirmKill?.pid}) 吗？
          <br />
          此操作不可撤销。
        </p>
      </ConfirmDialog>
    </AppLayout>
  )
}
