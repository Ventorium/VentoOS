/**
 * SSH Resource Monitor Panel
 * Side panel showing CPU, Memory, Disk metrics for a connected SSH server.
 */
import { motion } from 'framer-motion'
import { AlertCircle, ChevronDown, ChevronRight, Cpu, HardDrive, Loader2, MemoryStick, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart, GaugeChart, LineChart } from '@/components/charts'
import type { BarItem, ChartSeries } from '@/components/charts'
import { sshApi } from './api'

interface ResourceMonitorPanelProps {
  serverId: string
  onClose: () => void
}

interface ServerMetrics {
  cpu_usage: number
  memory_used: number
  memory_total: number
  disks: { name: string; used: number; total: number }[]
}

const MAX_HISTORY = 30

export default function ResourceMonitorPanel({ serverId, onClose }: ResourceMonitorPanelProps) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const cpuHistory = useRef<number[]>([])
  const memHistory = useRef<number[]>([])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await sshApi.getServerMetrics(serverId)
      if (res.data && 'cpu_usage' in res.data) {
        const m = res.data as ServerMetrics
        setMetrics(m)
        setError(null)

        cpuHistory.current = [...cpuHistory.current.slice(-(MAX_HISTORY - 1)), m.cpu_usage]
        const memPct = m.memory_total > 0 ? (m.memory_used / m.memory_total) * 100 : 0
        memHistory.current = [...memHistory.current.slice(-(MAX_HISTORY - 1)), memPct]
      } else {
        setError('服务器未连接或暂无数据')
        setMetrics(null)
      }
    } catch {
      setError('服务器未连接或暂无数据')
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    fetchMetrics()
    const timer = setInterval(fetchMetrics, 5000)
    return () => clearInterval(timer)
  }, [fetchMetrics])

  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const cpuSeries: ChartSeries[] = [
    { id: 'cpu', label: 'CPU', color: 'var(--vos-accent-primary)', data: cpuHistory.current },
  ]
  const memSeries: ChartSeries[] = [
    { id: 'mem', label: 'Memory', color: 'var(--vos-accent-warning)', data: memHistory.current },
  ]

  const diskItems: BarItem[] = metrics
    ? metrics.disks.map(d => ({
        label: d.name,
        value: d.used,
        max: d.total,
        color: d.total > 0 && d.used / d.total > 0.9 ? 'var(--vos-accent-danger)' : 'var(--vos-accent-primary)',
      }))
    : []

  const memPct = metrics && metrics.memory_total > 0 ? (metrics.memory_used / metrics.memory_total) * 100 : 0

  const formatBytes = (bytes: number) => {
    if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${(bytes / 1e3).toFixed(1)} KB`
  }

  return (
    <motion.div
      className="ssh-monitor-panel"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        width: 280,
        minWidth: 280,
        height: '100%',
        borderLeft: '1px solid var(--vos-border)',
        background: 'var(--vos-bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--vos-border)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vos-text-primary)' }}>资源监控</span>
        <button type="button" className="vos-icon-btn" onClick={onClose} title="关闭监控">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
            <Loader2 size={20} className="vos-spin" style={{ color: 'var(--vos-text-tertiary)' }} />
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: '40px 12px',
              color: 'var(--vos-text-tertiary)',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            <AlertCircle size={24} style={{ opacity: 0.4 }} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && metrics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* CPU Section */}
            <Section title="CPU" icon={<Cpu size={13} />} collapsed={!!collapsed.cpu} onToggle={() => toggle('cpu')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <GaugeChart
                  value={metrics.cpu_usage}
                  max={100}
                  size={64}
                  thickness={6}
                  color={metrics.cpu_usage > 80 ? 'var(--vos-accent-danger)' : 'var(--vos-accent-primary)'}
                  label={`${metrics.cpu_usage.toFixed(1)}%`}
                />
                <div style={{ flex: 1, fontSize: 11, color: 'var(--vos-text-secondary)' }}>
                  使用率 {metrics.cpu_usage.toFixed(1)}%
                </div>
              </div>
              {cpuHistory.current.length > 1 && (
                <LineChart
                  data={cpuSeries}
                  width={250}
                  height={80}
                  maxPoints={MAX_HISTORY}
                  showLabels={false}
                  formatValue={v => `${v.toFixed(1)}%`}
                />
              )}
            </Section>

            {/* Memory Section */}
            <Section
              title="内存"
              icon={<MemoryStick size={13} />}
              collapsed={!!collapsed.mem}
              onToggle={() => toggle('mem')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <GaugeChart
                  value={memPct}
                  max={100}
                  size={64}
                  thickness={6}
                  color={memPct > 80 ? 'var(--vos-accent-danger)' : 'var(--vos-accent-warning)'}
                  label={`${memPct.toFixed(1)}%`}
                />
                <div style={{ flex: 1, fontSize: 11, color: 'var(--vos-text-secondary)', lineHeight: 1.6 }}>
                  <div>
                    {formatBytes(metrics.memory_used)} / {formatBytes(metrics.memory_total)}
                  </div>
                  <div>{memPct.toFixed(1)}% 已使用</div>
                </div>
              </div>
              {memHistory.current.length > 1 && (
                <LineChart
                  data={memSeries}
                  width={250}
                  height={80}
                  maxPoints={MAX_HISTORY}
                  showLabels={false}
                  formatValue={v => `${v.toFixed(1)}%`}
                />
              )}
            </Section>

            {/* Disk Section */}
            <Section
              title="磁盘"
              icon={<HardDrive size={13} />}
              collapsed={!!collapsed.disk}
              onToggle={() => toggle('disk')}
            >
              {diskItems.length > 0 ? (
                <BarChart items={diskItems} formatValue={formatBytes} />
              ) : (
                <div style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', padding: '4px 0' }}>暂无磁盘数据</div>
              )}
            </Section>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ─── Collapsible Section ──────────────────────────────────── */
function Section({
  title,
  icon,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  icon: React.ReactNode
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--vos-text-primary)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        {icon}
        {title}
      </button>
      {!collapsed && <div style={{ paddingLeft: 4, paddingBottom: 4 }}>{children}</div>}
    </div>
  )
}
