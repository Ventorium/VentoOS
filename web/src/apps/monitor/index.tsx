/**
 * Monitor App — System Resource Monitor
 *
 * Tabs: 系统 (host metrics), VentoOS (process metrics), 网页 (browser perf APIs).
 * Periodic polling with configurable intervals. Tray badge for CPU usage.
 */

import { Activity, Cpu, Globe, HardDrive, MemoryStick, Server } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChartSeries } from '@/components/charts'
import { BarChart, GaugeChart, LineChart } from '@/components/charts'
import type { PreferenceGroup } from '@/components/PreferencesPanel'
import PreferencesPanel from '@/components/PreferencesPanel'
import type { AppComponentProps } from '@/kernel'
import {
  openWindow,
  registerAppMenus,
  registerAppTray,
  unregisterAppMenus,
  unregisterAppTray,
  useAppStorage
} from '@/kernel'
import type { ProcessMetrics, SystemMetrics } from './api'
import { monitorApi } from './api'

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
  trayInterval: 5
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

// ─── CSS class constants ───────────────────────────────────────────────────

const monCard = 'bg-[var(--vos-bg-secondary)] rounded-lg p-3 border border-[var(--vos-border-primary)]'

// ─── Tab Content Components ────────────────────────────────────────────────

function SystemTab({
  metrics,
  cpuHistory,
  memHistory
}: {
  metrics: SystemMetrics | null
  cpuHistory: number[]
  memHistory: number[]
}) {
  if (!metrics) {
    return (
      <div className="vos-flex-col items-center justify-center gap-2 p-10 text-[var(--vos-text-tertiary)] text-[13px]">
        <Cpu size={32} />
        <span>正在获取系统指标…</span>
      </div>
    )
  }

  const cpuSeries: ChartSeries[] = [{ id: 'cpu', label: 'CPU', color: 'var(--vos-accent-primary)', data: cpuHistory }]
  const memSeries: ChartSeries[] = [
    { id: 'mem', label: '内存', color: 'var(--vos-accent-secondary, #a78bfa)', data: memHistory }
  ]

  // Deduplicate disks: keep only one entry per physical device prefix,
  // preferring the root mount '/' or the one with the largest total size.
  const uniqueDisks = (() => {
    const grouped = new Map<string, (typeof metrics.disks)[0]>()
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
      <div className="mb-6">
        <div className="vos-flex-row gap-1.5 text-sm font-semibold mb-3 text-[var(--vos-text-primary)]">
          <Cpu size={15} /> CPU — {metrics.cpu.model_name}
        </div>
        <div className="flex gap-4 flex-wrap items-start">
          <div className={monCard}>
            <GaugeChart
              value={metrics.cpu.total_usage_percent}
              color={usageColor(metrics.cpu.total_usage_percent)}
              label="总使用率"
              formatValue={formatPercent}
            />
          </div>
          <div className={`${monCard} flex-1 min-w-[260px]`}>
            <LineChart data={cpuSeries} width={400} height={120} formatValue={formatPercent} />
          </div>
        </div>
        {metrics.cpu.cores.length > 0 && (
          <div className={`${monCard} mt-3`}>
            <div className="text-xs text-[var(--vos-text-secondary)] mb-2">
              核心使用率 ({metrics.cpu.core_count} 核)
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
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
      <div className="mb-6">
        <div className="vos-flex-row gap-1.5 text-sm font-semibold mb-3 text-[var(--vos-text-primary)]">
          <MemoryStick size={15} /> 内存
        </div>
        <div className="flex gap-4 flex-wrap items-start">
          <div className={monCard}>
            <GaugeChart
              value={metrics.memory.usage_percent}
              color={usageColor(metrics.memory.usage_percent)}
              label="使用率"
              formatValue={formatPercent}
            />
            <div
              className="text-[11px] text-[var(--vos-text-secondary)] mt-1.5 text-center"
            >
              {formatBytes(metrics.memory.used_bytes)} / {formatBytes(metrics.memory.total_bytes)}
            </div>
          </div>
          <div className={`${monCard} flex-1 min-w-[260px]`}>
            <LineChart data={memSeries} width={400} height={120} formatValue={formatPercent} />
          </div>
        </div>
        {metrics.memory.swap_total_bytes > 0 &&
          (() => {
            const swapPct = (metrics.memory.swap_used_bytes / metrics.memory.swap_total_bytes) * 100
            return (
              <div className={`${monCard} mt-3`}>
                <div
                  className="flex justify-between text-xs text-[var(--vos-text-secondary)] mb-1.5"
                >
                  <span>Swap</span>
                  <span>
                    {formatBytes(metrics.memory.swap_used_bytes)} / {formatBytes(metrics.memory.swap_total_bytes)}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-[3px] bg-[var(--vos-border-secondary)] overflow-hidden"
                >
                  <div
                    className="h-full rounded-[3px]"
                    style={{
                      width: `${Math.min(swapPct, 100)}%`,
                      background: usageColor(swapPct),
                      transition: 'width 0.6s ease'
                    }}
                  />
                </div>
              </div>
            )
          })()}
      </div>

      {/* Disk Section */}
      {uniqueDisks.length > 0 && (
        <div className="mb-6">
          <div className="vos-flex-row gap-1.5 text-sm font-semibold mb-3 text-[var(--vos-text-primary)]">
            <HardDrive size={15} /> 磁盘
          </div>
          {uniqueDisks.map(d => {
            const pct = d.total_bytes > 0 ? (d.used_bytes / d.total_bytes) * 100 : 0
            return (
              <div key={d.device + d.mount_point} className={`${monCard} mb-2`}>
                <div
                  className="flex justify-between text-xs text-[var(--vos-text-secondary)] mb-1.5"
                >
                  <span>
                    {d.mount_point} ({d.device})
                  </span>
                  <span>
                    {formatBytes(d.used_bytes)} / {formatBytes(d.total_bytes)}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-[3px] bg-[var(--vos-border-secondary)] overflow-hidden"
                >
                  <div
                    className="h-full rounded-[3px]"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: usageColor(pct),
                      transition: 'width 0.6s ease'
                    }}
                  />
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
  totalMemoryBytes
}: {
  process: ProcessMetrics | null
  cpuHistory: number[]
  memHistory: number[]
  totalMemoryBytes: number
}) {
  if (!proc) {
    return (
      <div className="vos-flex-col items-center justify-center gap-2 p-10 text-[var(--vos-text-tertiary)] text-[13px]">
        <Server size={32} />
        <span>正在获取进程指标…</span>
      </div>
    )
  }

  const cpuSeries: ChartSeries[] = [{ id: 'pcpu', label: 'CPU', color: 'var(--vos-accent-primary)', data: cpuHistory }]
  const memSeries: ChartSeries[] = [
    { id: 'pmem', label: '内存', color: 'var(--vos-accent-secondary, #a78bfa)', data: memHistory }
  ]

  return (
    <>
      <div className="mb-6">
        <div className="vos-flex-row gap-1.5 text-sm font-semibold mb-3 text-[var(--vos-text-primary)]">
          <Server size={15} /> VentoOS 进程
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          <div className="flex justify-between py-1.5 text-xs border-b border-[var(--vos-border-secondary)]">
            <span className="text-[var(--vos-text-secondary)]">PID</span>
            <span className="font-medium tabular-nums">{proc.pid}</span>
          </div>
          <div className="flex justify-between py-1.5 text-xs border-b border-[var(--vos-border-secondary)]">
            <span className="text-[var(--vos-text-secondary)]">运行时间</span>
            <span className="font-medium tabular-nums">{formatUptime(proc.uptime_seconds)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-xs border-b border-[var(--vos-border-secondary)]">
            <span className="text-[var(--vos-text-secondary)]">线程数</span>
            <span className="font-medium tabular-nums">{proc.thread_count}</span>
          </div>
          <div className="flex justify-between py-1.5 text-xs border-b border-[var(--vos-border-secondary)]">
            <span className="text-[var(--vos-text-secondary)]">内存</span>
            <span className="font-medium tabular-nums">{formatBytes(proc.memory_bytes)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-xs border-b border-[var(--vos-border-secondary)]">
            <span className="text-[var(--vos-text-secondary)]">虚拟内存</span>
            <span className="font-medium tabular-nums">{formatBytes(proc.virtual_memory_bytes)}</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="vos-flex-row gap-1.5 text-sm font-semibold mb-3 text-[var(--vos-text-primary)]">
          <Cpu size={15} /> CPU 使用率
        </div>
        <div className="flex gap-4 flex-wrap items-start">
          <div className={monCard}>
            <GaugeChart
              value={proc.cpu_usage_percent}
              color={usageColor(proc.cpu_usage_percent)}
              label="CPU"
              formatValue={formatPercent}
            />
          </div>
          <div className={`${monCard} flex-1 min-w-[260px]`}>
            <LineChart data={cpuSeries} width={400} height={120} formatValue={formatPercent} />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="vos-flex-row gap-1.5 text-sm font-semibold mb-3 text-[var(--vos-text-primary)]">
          <MemoryStick size={15} /> 内存使用
        </div>
        <div className="flex gap-4 flex-wrap items-start">
          <div className={monCard}>
            <GaugeChart
              value={proc.memory_bytes}
              max={totalMemoryBytes || proc.memory_bytes * 2}
              color="var(--vos-accent-secondary, #a78bfa)"
              label="物理内存"
              formatValue={formatBytes}
            />
          </div>
          <div className={`${monCard} flex-1 min-w-[260px]`}>
            <LineChart data={memSeries} width={400} height={120} formatValue={v => formatBytes(v)} />
          </div>
        </div>
      </div>
    </>
  )
}

function WebTab() {
  const [memInfo, setMemInfo] = useState<{
    used: number
    total: number
    limit: number
    breakdown?: { name: string; bytes: number }[]
  } | null>(null)
  const [cpuPressure, setCpuPressure] = useState<string | null>(null)

  const hasPreciseMem = typeof performance !== 'undefined' && 'measureUserAgentSpecificMemory' in performance
  const hasLegacyMem = typeof performance !== 'undefined' && 'memory' in performance
  const hasPressure = 'PressureObserver' in globalThis

  // Device memory (static)
  const deviceMemory =
    typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: number }).deviceMemory : undefined

  // Memory measurement — prefer precise API, fall back to performance.memory
  useEffect(() => {
    let cancelled = false

    const measure = async () => {
      if (cancelled) return
      try {
        if (hasPreciseMem) {
          // @ts-expect-error Experimental API
          const result = await performance.measureUserAgentSpecificMemory()
          if (cancelled) return
          const breakdown = (result.breakdown ?? [])
            .filter((b: { bytes: number }) => b.bytes > 0)
            .map((b: { types: string[]; bytes: number }) => ({
              name: b.types?.join(', ') || 'unknown',
              bytes: b.bytes
            }))
          setMemInfo({
            used: result.bytes,
            total: result.bytes,
            limit: result.bytes,
            breakdown
          })
        } else if (hasLegacyMem) {
          // @ts-expect-error Chrome-only API
          const m = performance.memory as { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
          setMemInfo({
            used: m.usedJSHeapSize,
            total: m.totalJSHeapSize,
            limit: m.jsHeapSizeLimit
          })
        }
      } catch {
        // API not available in this context
      }
    }

    measure()
    const id = setInterval(measure, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [hasPreciseMem, hasLegacyMem])

  // CPU Pressure observer
  useEffect(() => {
    if (!hasPressure) return
    let observer: unknown
    try {
      // @ts-expect-error Experimental API
      observer = new PressureObserver((records: { state: string }[]) => {
        if (records.length > 0) {
          setCpuPressure(records[records.length - 1].state)
        }
      })
      // @ts-expect-error Experimental API
      observer.observe('cpu', { sampleInterval: 2000 })
    } catch {
      // Not available
    }
    return () => {
      // @ts-expect-error Experimental API
      if (observer?.disconnect) observer.disconnect()
    }
  }, [hasPressure])

  const pressureLabel: Record<string, string> = {
    nominal: '正常',
    fair: '较低',
    serious: '较高',
    critical: '严重'
  }

  const hasAnyMem = hasPreciseMem || hasLegacyMem

  return (
    <>
      <div className="mb-6">
        <div className="vos-flex-row gap-1.5 text-sm font-semibold mb-3 text-[var(--vos-text-primary)]">
          <Globe size={15} /> 网页性能
        </div>

        {/* CPU Pressure */}
        <div className={`${monCard} mb-3`}>
          <div className="text-xs text-[var(--vos-text-secondary)] mb-1.5">
            CPU 压力 (Compute Pressure API)
          </div>
          {hasPressure ? (
            <div className="text-sm font-medium">
              {cpuPressure ? (pressureLabel[cpuPressure] ?? cpuPressure) : '等待采样…'}
            </div>
          ) : (
            <div className="text-xs text-[var(--vos-text-tertiary)]">当前浏览器不支持 Compute Pressure API</div>
          )}
        </div>

        {/* Device Memory */}
        {deviceMemory != null && (
          <div className={`${monCard} mb-3`}>
            <div className="text-xs text-[var(--vos-text-secondary)] mb-1.5">
              设备内存 (navigator.deviceMemory)
            </div>
            <div className="text-sm font-medium">约 {deviceMemory} GB</div>
          </div>
        )}

        {/* JS Heap Memory */}
        <div className={monCard}>
          <div className="text-xs text-[var(--vos-text-secondary)] mb-1.5">
            JS 堆内存
            {hasPreciseMem && ' (measureUserAgentSpecificMemory)'}
            {!hasPreciseMem && hasLegacyMem && ' (performance.memory)'}
          </div>
          {hasAnyMem ? (
            memInfo ? (
              <>
                <div className="flex gap-4 mb-2 flex-wrap">
                  <div>
                    <div className="text-[11px] text-[var(--vos-text-tertiary)]">已使用</div>
                    <div className="text-sm font-semibold">{formatBytes(memInfo.used)}</div>
                  </div>
                  {memInfo.total !== memInfo.used && (
                    <div>
                      <div className="text-[11px] text-[var(--vos-text-tertiary)]">已分配</div>
                      <div className="text-sm font-semibold">{formatBytes(memInfo.total)}</div>
                    </div>
                  )}
                  {memInfo.limit > 0 && memInfo.limit !== memInfo.used && (
                    <div>
                      <div className="text-[11px] text-[var(--vos-text-tertiary)]">上限</div>
                      <div className="text-sm font-semibold">{formatBytes(memInfo.limit)}</div>
                    </div>
                  )}
                </div>
                {/* Usage bar */}
                {memInfo.limit > 0 && (
                  <div className={memInfo.breakdown?.length ? 'mb-3' : ''}>
                    <div
                      className="h-2 rounded-[4px] bg-[var(--vos-border-secondary)] overflow-hidden"
                    >
                      <div
                        className="h-full rounded-[4px]"
                        style={{
                          width: `${Math.min((memInfo.used / memInfo.limit) * 100, 100)}%`,
                          background: usageColor((memInfo.used / memInfo.limit) * 100),
                          transition: 'width 0.6s ease'
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-[var(--vos-text-tertiary)] mt-1">
                      {((memInfo.used / memInfo.limit) * 100).toFixed(1)}% 已使用
                    </div>
                  </div>
                )}
                {/* Breakdown (only from precise API) */}
                {memInfo.breakdown && memInfo.breakdown.length > 0 && (
                  <div>
                    <div className="text-[11px] text-[var(--vos-text-secondary)] mb-1">内存分布</div>
                    <BarChart
                      items={memInfo.breakdown.map(b => ({
                        label: b.name,
                        value: b.bytes,
                        max: memInfo.used
                      }))}
                      formatValue={formatBytes}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-[var(--vos-text-tertiary)]">正在测量…</div>
            )
          ) : (
            <div className="text-xs text-[var(--vos-text-tertiary)]">当前浏览器不支持内存测量 API</div>
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

  // Latest CPU/Memory for tray
  const latestCpuRef = useRef(0)
  const latestMemRef = useRef({ used_bytes: 0, total_bytes: 0 })

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
    [storage]
  )

  // ── Fetch functions ────────────────────────────────────────────────────

  const fetchSystem = useCallback(async () => {
    try {
      const res = await monitorApi.getSystemMetrics()
      if (res.data) {
        setSystemMetrics(res.data)
        latestCpuRef.current = res.data.cpu.total_usage_percent
        latestMemRef.current = { used_bytes: res.data.memory.used_bytes, total_bytes: res.data.memory.total_bytes }
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
      const mem = latestMemRef.current
      const memUsedGB = (mem.used_bytes / (1024 * 1024 * 1024)).toFixed(0)
      const memTotalGB = (mem.total_bytes / (1024 * 1024 * 1024)).toFixed(0)
      registerAppTray('monitor', {
        tooltip: `CPU: ${cpu.toFixed(1)}% | 内存: ${memUsedGB}/${memTotalGB}GB`,
        visible: true,
        priority: 5,
        onClick: () => openWindow('monitor'),
        render: () => (
          <div
            className="vos-flex-col items-center justify-center leading-[1.2] text-[9px] font-[var(--vos-font-mono,ui-monospace,monospace)] font-semibold text-[var(--vos-text-primary)] min-w-[42px] px-0.5"
          >
            <span style={{ color: usageColor(cpu) }}>{cpu.toFixed(1)}%</span>
            <span className="text-[8px] text-[var(--vos-text-secondary)]">
              {memUsedGB}/{memTotalGB}GB
            </span>
          </div>
        )
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
            action: () => setShowPreferences(true)
          }
        ]
      }
    ])
    return () => unregisterAppMenus('monitor')
  }, [])

  // ── Preferences panel ──────────────────────────────────────────────────

  const intervalOptions = [
    { label: '5 秒', value: 5 },
    { label: '10 秒', value: 10 },
    { label: '15 秒', value: 15 },
    { label: '30 秒', value: 30 },
    { label: '60 秒', value: 60 }
  ]
  const webIntervalOptions = [
    { label: '5 秒', value: 5 },
    { label: '10 秒', value: 10 },
    { label: '15 秒', value: 15 },
    { label: '30 秒', value: 30 }
  ]
  const diskIntervalOptions = [
    { label: '30 秒', value: 30 },
    { label: '60 秒', value: 60 },
    { label: '120 秒', value: 120 },
    { label: '300 秒', value: 300 }
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
          options: intervalOptions
        },
        {
          id: 'ventosInterval',
          label: 'VentoOS 进程',
          description: '进程 CPU/内存刷新频率',
          type: 'select',
          value: settings.ventosInterval,
          onChange: v => updateSettings({ ventosInterval: v as number }),
          options: intervalOptions
        },
        {
          id: 'webInterval',
          label: '网页指标',
          description: '浏览器性能刷新频率',
          type: 'select',
          value: settings.webInterval,
          onChange: v => updateSettings({ webInterval: v as number }),
          options: webIntervalOptions
        },
        {
          id: 'diskInterval',
          label: '磁盘',
          description: '磁盘使用率刷新频率',
          type: 'select',
          value: settings.diskInterval,
          onChange: v => updateSettings({ diskInterval: v as number }),
          options: diskIntervalOptions
        }
      ]
    },
    {
      id: 'tray',
      title: '托盘',
      items: [
        {
          id: 'trayEnabled',
          label: '在托盘显示',
          description: '在系统托盘显示 CPU 和内存使用率',
          type: 'switch',
          value: settings.trayEnabled,
          onChange: v => updateSettings({ trayEnabled: v as boolean })
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
                  { label: '30 秒', value: 30 }
                ]
              }
            ]
          : [])
      ]
    }
  ]

  // ── Tabs config ────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: typeof Cpu }[] = [
    { id: 'system', label: '系统', icon: Cpu },
    { id: 'ventos', label: 'VentoOS', icon: Server },
    { id: 'web', label: '网页', icon: Globe }
  ]

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="vos-flex-col h-full bg-[var(--vos-bg-primary)] text-[var(--vos-text-primary)] overflow-hidden">
      {/* Header */}
      <div className="vos-flex-row gap-2 px-4 py-2 border-b border-[var(--vos-border-primary)] text-xs text-[var(--vos-text-secondary)] shrink-0">
        <Activity size={14} />
        {systemMetrics ? (
          <>
            <span>{systemMetrics.hostname}</span>
            <span className="opacity-50">|</span>
            <span>{systemMetrics.os_type}</span>
            <span className="opacity-50">|</span>
            <span>{systemMetrics.cpu.core_count} 核</span>
            <span className="opacity-50">|</span>
            <span>{formatBytes(systemMetrics.memory.total_bytes)} 内存</span>
          </>
        ) : (
          <span>正在连接…</span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[120px] shrink-0 border-r border-[var(--vos-border-primary)] vos-flex-col py-2 gap-[2px]">
          {tabs.map(t => (
            <button key={t.id} type="button" className={`vos-flex-row gap-2 px-4 py-2 border-none cursor-pointer text-[13px] rounded-[6px] mx-2 transition-[background] duration-150 ${tab === t.id ? 'bg-[var(--vos-accent-primary)] text-white' : 'bg-transparent text-[var(--vos-text-primary)]'}`} onClick={() => setTab(t.id)}>
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {tab === 'system' && <SystemTab metrics={systemMetrics} cpuHistory={cpuHistory} memHistory={memHistory} />}
          {tab === 'ventos' && (
            <VentosTab
              process={processMetrics}
              cpuHistory={procCpuHistory}
              memHistory={procMemHistory}
              totalMemoryBytes={systemMetrics?.memory.total_bytes ?? 0}
            />
          )}
          {tab === 'web' && <WebTab />}
        </div>
      </div>

      {/* Preferences */}
      {showPreferences && (
        <PreferencesPanel title="监控面板偏好设置" groups={prefGroups} onClose={() => setShowPreferences(false)} />
      )}
    </div>
  )
}
