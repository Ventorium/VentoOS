/**
 * Monitor App — System Resource Monitor
 *
 * Tabs: 系统 (host metrics), VentoOS (process metrics), 网页 (browser perf APIs).
 * Periodic polling with configurable intervals. Tray badge for CPU usage.
 */

import { Activity, Cpu, Globe, HardDrive, MemoryStick, Server } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProcessMetrics, SystemMetrics } from './api'
import { monitorApi } from './api'
import { BarChart, GaugeChart, LineChart } from '@/components/charts'
import type { ChartSeries } from '@/components/charts'
import PreferencesPanel from '@/components/PreferencesPanel'
import type { PreferenceGroup } from '@/components/PreferencesPanel'
import {
  openWindow,
  registerAppMenus,
  registerAppTray,
  unregisterAppMenus,
  unregisterAppTray,
  useAppStorage,
} from '@/kernel'
import type { AppComponentProps } from '@/kernel'

// ─── Settings Types ────────────────────────────────────────────────────────

interface MonitorSettings {
  systemInterval: number
  ventosInterval: number
  webInterval: number
  diskInterval: number
  trayEnabled: boolean
  trayInterval: number
}

const DEFAULT_SETTINGS: MonitorSettings = {
  systemInterval: 5,
  ventosInterval: 5,
  webInterval: 5,
  diskInterval: 60,
  trayEnabled: false,
  trayInterval: 5,
}

const MAX_HISTORY = 60

type Tab = 'system' | 'ventos' | 'web'

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}天`)
  if (h > 0) parts.push(`${h}时`)
  if (m > 0) parts.push(`${m}分`)
  parts.push(`${s}秒`)
  return parts.join('')
}

function formatPercent(v: number): string {
  return `${v.toFixed(1)}%`
}

function pushHistory(arr: number[], value: number): number[] {
  const next = [...arr, value]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

// Color helpers for usage-based coloring
function usageColor(pct: number): string {
  if (pct > 80) return 'var(--vos-accent-danger)'
  if (pct > 50) return 'var(--vos-accent-warning)'
  return 'var(--vos-accent-success)'
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--vos-bg-primary)',
    color: 'var(--vos-text-primary)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderBottom: '1px solid var(--vos-border-primary)',
    fontSize: 12,
    color: 'var(--vos-text-secondary)',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: 120,
    flexShrink: 0,
    borderRight: '1px solid var(--vos-border-primary)',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '8px 0',
    gap: 2,
  },
  tabButton: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    border: 'none',
    background: active ? 'var(--vos-accent-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--vos-text-primary)',
    cursor: 'pointer',
    fontSize: 13,
    borderRadius: 6,
    margin: '0 8px',
    transition: 'background 0.15s',
  }),
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 12,
    color: 'var(--vos-text-primary)',
  },
  row: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-start',
  },
  card: {
    background: 'var(--vos-bg-secondary)',
    borderRadius: 8,
    padding: 12,
    border: '1px solid var(--vos-border-primary)',
  },
  coreGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
    gap: 8,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 12,
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: 12,
    borderBottom: '1px solid var(--vos-border-secondary)',
  },
  infoLabel: {
    color: 'var(--vos-text-secondary)',
  },
  infoValue: {
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 40,
    color: 'var(--vos-text-tertiary)',
    fontSize: 13,
  },
}

// ─── Tab Content Components ────────────────────────────────────────────────

function SystemTab({
  metrics,
  cpuHistory,
  memHistory,
}: {
  metrics: SystemMetrics | null
  cpuHistory: number[]
  memHistory: number[]
}) {
  if (!metrics) {
    return (
      <div style={styles.emptyState}>
        <Cpu size={32} />
        <span>正在获取系统指标…</span>
      </div>
    )
  }

  const cpuSeries: ChartSeries[] = [
    { id: 'cpu', label: 'CPU', color: 'var(--vos-accent-primary)', data: cpuHistory },
  ]
  const memSeries: ChartSeries[] = [
    { id: 'mem', label: '内存', color: 'var(--vos-accent-secondary, #a78bfa)', data: memHistory },
  ]

  // Deduplicate disks: keep only one entry per physical device prefix,
  // preferring the root mount '/' or the one with the largest total size.
  const uniqueDisks = (() => {
    const grouped = new Map<string, typeof metrics.disks[0]>()
    for (const d of metrics.disks) {
      const devKey = d.device.replace(/s\d+$/, '')
      const existing = grouped.get(devKey)
      if (!existing || d.mount_point === '/' || d.total_bytes > existing.total_bytes) {
        grouped.set(devKey, d)
      }
    }
    return Array.from(grouped.values())
  })()

  return (
    <>
      {/* CPU Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <Cpu size={15} /> CPU — {metrics.cpu.model_name}
        </div>
        <div style={styles.row}>
          <div style={styles.card}>
            <GaugeChart
              value={metrics.cpu.total_usage_percent}
              color={usageColor(metrics.cpu.total_usage_percent)}
              label="总使用率"
              formatValue={formatPercent}
            />
          </div>
          <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
            <LineChart
              data={cpuSeries}
              width={400}
              height={120}
              formatValue={formatPercent}
            />
          </div>
        </div>
        {metrics.cpu.cores.length > 0 && (
          <div style={{ ...styles.card, marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginBottom: 8 }}>
              核心使用率 ({metrics.cpu.core_count} 核)
            </div>
            <div style={styles.coreGrid}>
              {metrics.cpu.cores.map(c => (
                <GaugeChart
                  key={c.core_id}
                  value={c.usage_percent}
                  size={64}
                  thickness={5}
                  color={usageColor(c.usage_percent)}
                  label={`#${c.core_id}`}
                  formatValue={formatPercent}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Memory Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <MemoryStick size={15} /> 内存
        </div>
        <div style={styles.row}>
          <div style={styles.card}>
            <GaugeChart
              value={metrics.memory.usage_percent}
              color={usageColor(metrics.memory.usage_percent)}
              label="使用率"
              formatValue={formatPercent}
            />
            <div style={{ fontSize: 11, color: 'var(--vos-text-secondary)', marginTop: 6, textAlign: 'center' as const }}>
              {formatBytes(metrics.memory.used_bytes)} / {formatBytes(metrics.memory.total_bytes)}
            </div>
          </div>
          <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
            <LineChart
              data={memSeries}
              width={400}
              height={120}
              formatValue={formatPercent}
            />
          </div>
        </div>
        {metrics.memory.swap_total_bytes > 0 && (() => {
          const swapPct = (metrics.memory.swap_used_bytes / metrics.memory.swap_total_bytes) * 100
          return (
            <div style={{ ...styles.card, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--vos-text-secondary)', marginBottom: 6 }}>
                <span>Swap</span>
                <span>{formatBytes(metrics.memory.swap_used_bytes)} / {formatBytes(metrics.memory.swap_total_bytes)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--vos-border-secondary)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  borderRadius: 3,
                  width: `${Math.min(swapPct, 100)}%`,
                  background: usageColor(swapPct),
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>
          )
        })()}
      </div>

      {/* Disk Section */}
      {uniqueDisks.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            <HardDrive size={15} /> 磁盘
          </div>
          {uniqueDisks.map(d => {
            const pct = d.total_bytes > 0 ? (d.used_bytes / d.total_bytes) * 100 : 0
            return (
              <div key={d.device + d.mount_point} style={{ ...styles.card, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--vos-text-secondary)', marginBottom: 6 }}>
                  <span>{d.mount_point} ({d.device})</span>
                  <span>{formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--vos-border-secondary)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 3,
                    width: `${Math.min(pct, 100)}%`,
                    background: usageColor(pct),
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function VentosTab({
  process: proc,
  cpuHistory,
  memHistory,
  totalMemoryBytes,
}: {
  process: ProcessMetrics | null
  cpuHistory: number[]
  memHistory: number[]
  totalMemoryBytes: number
}) {
  if (!proc) {
    return (
      <div style={styles.emptyState}>
        <Server size={32} />
        <span>正在获取进程指标…</span>
      </div>
    )
  }

  const cpuSeries: ChartSeries[] = [
    { id: 'pcpu', label: 'CPU', color: 'var(--vos-accent-primary)', data: cpuHistory },
  ]
  const memSeries: ChartSeries[] = [
    { id: 'pmem', label: '内存', color: 'var(--vos-accent-secondary, #a78bfa)', data: memHistory },
  ]

  return (
    <>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <Server size={15} /> VentoOS 进程
        </div>
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>PID</span>
            <span style={styles.infoValue}>{proc.pid}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>运行时间</span>
            <span style={styles.infoValue}>{formatUptime(proc.uptime_seconds)}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>线程数</span>
            <span style={styles.infoValue}>{proc.thread_count}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>内存</span>
            <span style={styles.infoValue}>{formatBytes(proc.memory_bytes)}</span>
          </div>
          <div style={styles.infoItem}>
            <span style={styles.infoLabel}>虚拟内存</span>
            <span style={styles.infoValue}>{formatBytes(proc.virtual_memory_bytes)}</span>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <Cpu size={15} /> CPU 使用率
        </div>
        <div style={styles.row}>
          <div style={styles.card}>
            <GaugeChart
              value={proc.cpu_usage_percent}
              color={usageColor(proc.cpu_usage_percent)}
              label="CPU"
              formatValue={formatPercent}
            />
          </div>
          <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
            <LineChart data={cpuSeries} width={400} height={120} formatValue={formatPercent} />
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <MemoryStick size={15} /> 内存使用
        </div>
        <div style={styles.row}>
          <div style={styles.card}>
            <GaugeChart
              value={proc.memory_bytes}
              max={totalMemoryBytes || proc.memory_bytes * 2}
              color="var(--vos-accent-secondary, #a78bfa)"
              label="物理内存"
              formatValue={formatBytes}
            />
          </div>
          <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
            <LineChart
              data={memSeries}
              width={400}
              height={120}
              formatValue={v => formatBytes(v)}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function WebTab() {
  const [memInfo, setMemInfo] = useState<{ jsHeap: number; total: number; breakdown: { name: string; bytes: number }[] } | null>(null)
  const [cpuPressure, setCpuPressure] = useState<string | null>(null)
  const [memSupported] = useState(() => 'measureUserAgentSpecificMemory' in performance)
  const [pressureSupported] = useState(() => 'PressureObserver' in globalThis)

  useEffect(() => {
    if (!memSupported) return

    let cancelled = false
    const measure = async () => {
      try {
        // @ts-expect-error - Experimental API
        const result = await performance.measureUserAgentSpecificMemory()
        if (cancelled) return
        const breakdown = (result.breakdown ?? [])
          .filter((b: { bytes: number }) => b.bytes > 0)
          .map((b: { types: string[]; bytes: number }) => ({
            name: b.types?.join(', ') || 'unknown',
            bytes: b.bytes,
          }))
        setMemInfo({
          jsHeap: result.bytes,
          total: result.bytes,
          breakdown,
        })
      } catch {
        // API may not be available in all contexts
      }
    }
    measure()
    const id = setInterval(measure, 10000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [memSupported])

  useEffect(() => {
    if (!pressureSupported) return

    let observer: unknown
    try {
      // @ts-expect-error - Experimental API
      observer = new PressureObserver((records: { state: string }[]) => {
        if (records.length > 0) {
          setCpuPressure(records[records.length - 1].state)
        }
      })
      // @ts-expect-error - Experimental API
      observer.observe('cpu', { sampleInterval: 2000 })
    } catch {
      // Not available
    }

    return () => {
      // @ts-expect-error - Experimental API
      if (observer?.disconnect) observer.disconnect()
    }
  }, [pressureSupported])

  const pressureLabel: Record<string, string> = {
    nominal: '正常',
    fair: '较低',
    serious: '较高',
    critical: '严重',
  }

  return (
    <>
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <Globe size={15} /> 网页性能
        </div>

        {/* CPU Pressure */}
        <div style={{ ...styles.card, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginBottom: 6 }}>
            CPU 压力 (Compute Pressure API)
          </div>
          {pressureSupported ? (
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {cpuPressure ? pressureLabel[cpuPressure] ?? cpuPressure : '等待采样…'}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>
              当前浏览器不支持 Compute Pressure API
            </div>
          )}
        </div>

        {/* Memory */}
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginBottom: 6 }}>
            内存使用 (performance.measureUserAgentSpecificMemory)
          </div>
          {memSupported ? (
            memInfo ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                  总计: {formatBytes(memInfo.total)}
                </div>
                {memInfo.breakdown.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--vos-text-secondary)', marginBottom: 4 }}>
                      内存分布
                    </div>
                    <BarChart
                      items={memInfo.breakdown.map(b => ({
                        label: b.name,
                        value: b.bytes,
                        max: memInfo.total,
                      }))}
                      formatValue={formatBytes}
                    />
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>
                正在测量…
              </div>
            )
          ) : (
            <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>
              当前浏览器不支持 measureUserAgentSpecificMemory API。
              <br />
              需要启用 Cross-Origin-Isolated 头。
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function MonitorApp({ windowId }: AppComponentProps) {
  const storage = useAppStorage('monitor')

  // State
  const [tab, setTab] = useState<Tab>('system')
  const [settings, setSettings] = useState<MonitorSettings>(DEFAULT_SETTINGS)
  const [showPreferences, setShowPreferences] = useState(false)

  // System metrics
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>([])
  const [memHistory, setMemHistory] = useState<number[]>([])

  // Process metrics
  const [processMetrics, setProcessMetrics] = useState<ProcessMetrics | null>(null)
  const [procCpuHistory, setProcCpuHistory] = useState<number[]>([])
  const [procMemHistory, setProcMemHistory] = useState<number[]>([])

  // Interval refs
  const systemIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const diskIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const ventosIntervalRef = useRef<ReturnType<typeof setInterval>>()
  const trayIntervalRef = useRef<ReturnType<typeof setInterval>>()

  // Latest CPU for tray
  const latestCpuRef = useRef(0)

  // ── Load settings ──────────────────────────────────────────────────────

  useEffect(() => {
    storage.getJSON<MonitorSettings>('settings').then(saved => {
      if (saved) setSettings(s => ({ ...s, ...saved }))
    })
  }, [storage])

  const updateSettings = useCallback(
    (patch: Partial<MonitorSettings>) => {
      setSettings(prev => {
        const next = { ...prev, ...patch }
        storage.setJSON('settings', next)
        return next
      })
    },
    [storage],
  )

  // ── Fetch functions ────────────────────────────────────────────────────

  const fetchSystem = useCallback(async () => {
    try {
      const res = await monitorApi.getSystemMetrics()
      if (res.data) {
        setSystemMetrics(res.data)
        latestCpuRef.current = res.data.cpu.total_usage_percent
        setCpuHistory(h => pushHistory(h, res.data.cpu.total_usage_percent))
        setMemHistory(h => pushHistory(h, res.data.memory.usage_percent))
      }
    } catch {
      // Silently ignore network errors
    }
  }, [])

  const fetchProcess = useCallback(async () => {
    try {
      const res = await monitorApi.getProcessMetrics()
      if (res.data) {
        setProcessMetrics(res.data)
        setProcCpuHistory(h => pushHistory(h, res.data.cpu_usage_percent))
        setProcMemHistory(h => pushHistory(h, res.data.memory_bytes))
      }
    } catch {
      // Silently ignore
    }
  }, [])

  // ── System polling ─────────────────────────────────────────────────────

  useEffect(() => {
    fetchSystem()
    systemIntervalRef.current = setInterval(fetchSystem, settings.systemInterval * 1000)
    return () => clearInterval(systemIntervalRef.current)
  }, [fetchSystem, settings.systemInterval])

  // Disk polling (less frequent, but reuses the same fetch)
  useEffect(() => {
    diskIntervalRef.current = setInterval(fetchSystem, settings.diskInterval * 1000)
    return () => clearInterval(diskIntervalRef.current)
  }, [fetchSystem, settings.diskInterval])

  // ── VentoOS process polling ────────────────────────────────────────────

  useEffect(() => {
    fetchProcess()
    ventosIntervalRef.current = setInterval(fetchProcess, settings.ventosInterval * 1000)
    return () => clearInterval(ventosIntervalRef.current)
  }, [fetchProcess, settings.ventosInterval])

  // ── Tray ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!settings.trayEnabled) {
      unregisterAppTray('monitor')
      clearInterval(trayIntervalRef.current)
      return
    }

    const updateTray = () => {
      const cpu = latestCpuRef.current
      registerAppTray('monitor', {
        icon: <Activity size={13} />,
        tooltip: `CPU: ${cpu.toFixed(1)}%`,
        badge: `${Math.round(cpu)}%`,
        badgeColor: usageColor(cpu),
        visible: true,
        priority: 5,
        onClick: () => openWindow('monitor'),
      })
    }

    updateTray()
    trayIntervalRef.current = setInterval(updateTray, settings.trayInterval * 1000)

    return () => {
      clearInterval(trayIntervalRef.current)
      unregisterAppTray('monitor')
    }
  }, [settings.trayEnabled, settings.trayInterval])

  // ── Menu registration ──────────────────────────────────────────────────

  useEffect(() => {
    registerAppMenus('monitor', [
      {
        id: 'monitor',
        label: '监控面板',
        items: [
          {
            id: 'preferences',
            label: '偏好设置',
            shortcut: '⌘,',
            action: () => setShowPreferences(true),
          },
        ],
      },
    ])
    return () => unregisterAppMenus('monitor')
  }, [])

  // ── Preferences panel ──────────────────────────────────────────────────

  const intervalOptions = [
    { label: '5 秒', value: 5 },
    { label: '10 秒', value: 10 },
    { label: '15 秒', value: 15 },
    { label: '30 秒', value: 30 },
    { label: '60 秒', value: 60 },
  ]
  const webIntervalOptions = [
    { label: '5 秒', value: 5 },
    { label: '10 秒', value: 10 },
    { label: '15 秒', value: 15 },
    { label: '30 秒', value: 30 },
  ]
  const diskIntervalOptions = [
    { label: '30 秒', value: 30 },
    { label: '60 秒', value: 60 },
    { label: '120 秒', value: 120 },
    { label: '300 秒', value: 300 },
  ]

  const prefGroups: PreferenceGroup[] = [
    {
      id: 'intervals',
      title: '刷新间隔',
      items: [
        {
          id: 'systemInterval',
          label: '系统指标',
          description: 'CPU、内存刷新频率',
          type: 'select',
          value: settings.systemInterval,
          onChange: v => updateSettings({ systemInterval: v as number }),
          options: intervalOptions,
        },
        {
          id: 'ventosInterval',
          label: 'VentoOS 进程',
          description: '进程 CPU/内存刷新频率',
          type: 'select',
          value: settings.ventosInterval,
          onChange: v => updateSettings({ ventosInterval: v as number }),
          options: intervalOptions,
        },
        {
          id: 'webInterval',
          label: '网页指标',
          description: '浏览器性能刷新频率',
          type: 'select',
          value: settings.webInterval,
          onChange: v => updateSettings({ webInterval: v as number }),
          options: webIntervalOptions,
        },
        {
          id: 'diskInterval',
          label: '磁盘',
          description: '磁盘使用率刷新频率',
          type: 'select',
          value: settings.diskInterval,
          onChange: v => updateSettings({ diskInterval: v as number }),
          options: diskIntervalOptions,
        },
      ],
    },
    {
      id: 'tray',
      title: '托盘',
      items: [
        {
          id: 'trayEnabled',
          label: '在托盘显示',
          description: '在系统托盘显示 CPU 使用率',
          type: 'switch',
          value: settings.trayEnabled,
          onChange: v => updateSettings({ trayEnabled: v as boolean }),
        },
        ...(settings.trayEnabled
          ? [
              {
                id: 'trayInterval',
                label: '托盘刷新间隔',
                type: 'select' as const,
                value: settings.trayInterval,
                onChange: (v: unknown) => updateSettings({ trayInterval: v as number }),
                options: [
                  { label: '5 秒', value: 5 },
                  { label: '10 秒', value: 10 },
                  { label: '15 秒', value: 15 },
                  { label: '30 秒', value: 30 },
                ],
              },
            ]
          : []),
      ],
    },
  ]

  // ── Tabs config ────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: typeof Cpu }[] = [
    { id: 'system', label: '系统', icon: Cpu },
    { id: 'ventos', label: 'VentoOS', icon: Server },
    { id: 'web', label: '网页', icon: Globe },
  ]

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <Activity size={14} />
        {systemMetrics ? (
          <>
            <span>{systemMetrics.hostname}</span>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>{systemMetrics.os_type}</span>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>{systemMetrics.cpu.core_count} 核</span>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>{formatBytes(systemMetrics.memory.total_bytes)} 内存</span>
          </>
        ) : (
          <span>正在连接…</span>
        )}
      </div>

      <div style={styles.body}>
        {/* Sidebar */}
        <div style={styles.sidebar}>
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              style={styles.tabButton(tab === t.id)}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {tab === 'system' && (
            <SystemTab metrics={systemMetrics} cpuHistory={cpuHistory} memHistory={memHistory} />
          )}
          {tab === 'ventos' && (
            <VentosTab process={processMetrics} cpuHistory={procCpuHistory} memHistory={procMemHistory} totalMemoryBytes={systemMetrics?.memory.total_bytes ?? 0} />
          )}
          {tab === 'web' && <WebTab />}
        </div>
      </div>

      {/* Preferences */}
      {showPreferences && (
        <PreferencesPanel
          title="监控面板偏好设置"
          groups={prefGroups}
          onClose={() => setShowPreferences(false)}
        />
      )}
    </div>
  )
}
