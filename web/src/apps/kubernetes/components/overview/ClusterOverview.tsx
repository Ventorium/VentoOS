/**
 * Kubernetes App — Cluster Overview Dashboard
 * PRD §11.1: Dashboard 网格卡片
 */

import { AlertTriangle, Box, CheckCircle, Globe, HardDrive, Layers, RefreshCw, Server } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { k8sApi } from '../../api'
import { useClusterStore } from '../../stores/cluster-store'

interface ClusterStats {
  version: string
  nodeCount: number
  namespaceCount: number
  podCount: number
  serverUrl: string
  nodesReady: number
  nodesNotReady: number
  deploymentCount: number
  statefulSetCount: number
  daemonSetCount: number
  jobCount: number
  serviceCount: number
  ingressCount: number
  pvcCount: number
  pvCount: number
  warningEvents: EventItem[]
}

interface EventItem {
  name: string
  reason: string
  message: string
  type: string
  count: number
}

interface Props {
  clusterId: string
}

// Module-level cache: avoid re-fetching cluster overview on every tab switch
const statsCache = new Map<string, { stats: ClusterStats; loadedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const EMPTY_STATS: ClusterStats = {
  version: '—',
  nodeCount: 0,
  namespaceCount: 0,
  podCount: 0,
  serverUrl: '—',
  nodesReady: 0,
  nodesNotReady: 0,
  deploymentCount: 0,
  statefulSetCount: 0,
  daemonSetCount: 0,
  jobCount: 0,
  serviceCount: 0,
  ingressCount: 0,
  pvcCount: 0,
  pvCount: 0,
  warningEvents: []
}

function getNodeStatus(raw: unknown): 'Ready' | 'NotReady' {
  const conditions = (raw as Record<string, unknown>)?.status?.conditions as unknown[] | undefined
  if (!Array.isArray(conditions)) return 'NotReady'
  const ready = conditions.find(c => (c as Record<string, unknown>).type === 'Ready')
  return (ready as Record<string, unknown>)?.status === 'True' ? 'Ready' : 'NotReady'
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatValue({ value, label }: { value: string | number; label?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
        {value}
      </span>
      {label && (
        <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          {label}
        </span>
      )}
    </div>
  )
}

function OverviewCard({
  title,
  icon: Icon,
  children
}: {
  title: string
  icon: typeof Server
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{ background: 'var(--vos-bg-surface)', border: '1px solid var(--vos-border-subtle)' }}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color: 'var(--vos-accent-primary)' }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--vos-text-tertiary)' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

// ── Donut chart (pure CSS) ─────────────────────────────────────────────────

function DonutChart({ ready, notReady, total }: { ready: number; notReady: number; total: number }) {
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center w-20 h-20 rounded-full"
        style={{ border: '4px solid var(--vos-border-subtle)' }}
      >
        <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          —
        </span>
      </div>
    )
  }
  const readyPct = (ready / total) * 100
  const notReadyPct = (notReady / total) * 100

  // We use a conic-gradient to draw the donut
  const gradient = `conic-gradient(
    var(--vos-accent-success, #22c55e) 0% ${readyPct}%,
    var(--vos-accent-danger, #ef4444) ${readyPct}% ${readyPct + notReadyPct}%,
    var(--vos-border-subtle) ${readyPct + notReadyPct}% 100%
  )`

  return (
    <div className="relative flex items-center justify-center w-20 h-20 rounded-full" style={{ background: gradient }}>
      <div
        className="absolute w-14 h-14 rounded-full flex items-center justify-center"
        style={{ background: 'var(--vos-bg-surface)' }}
      >
        <span className="text-sm font-bold" style={{ color: 'var(--vos-text-primary)' }}>
          {total}
        </span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ClusterOverview({ clusterId }: Props) {
  const cached = statsCache.get(clusterId)
  const [stats, setStats] = useState<ClusterStats>(cached?.stats ?? EMPTY_STATS)
  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  const clusters = useClusterStore(s => s.clusters)
  const cluster = clusters.find(c => c.id === clusterId)

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      // Fire all resource list calls in parallel
      const [testRes, namespacesRes, nodesRes, podsRes, eventsRes] = await Promise.allSettled([
        k8sApi.testK8sCluster(clusterId),
        k8sApi.getK8sNamespaces(clusterId),
        k8sApi.getK8sResources(clusterId, 'node', undefined),
        k8sApi.getK8sResources(clusterId, 'pod', ''),
        k8sApi.getK8sResources(clusterId, 'event', '')
      ])

      if (!mountedRef.current) return

      const nodes = nodesRes.status === 'fulfilled' ? (nodesRes.value.data ?? []) : []
      const nodesReady = nodes.filter(n => getNodeStatus(n.raw) === 'Ready').length
      const nodesNotReady = nodes.length - nodesReady

      const warningEvents: EventItem[] = []
      if (eventsRes.status === 'fulfilled') {
        const evList = eventsRes.value.data ?? []
        for (const ev of evList) {
          const r = ev.raw as Record<string, unknown> | undefined
          const type = (r?.type as string) ?? ev.status ?? ''
          if (type === 'Warning') {
            warningEvents.push({
              name: ev.name,
              reason: (r?.reason as string) ?? '',
              message: ((r?.message as string) ?? '').slice(0, 120),
              type,
              count: (r?.count as number) ?? 1
            })
            if (warningEvents.length >= 10) break
          }
        }
      }

      const newStats: ClusterStats = {
        version: testRes.status === 'fulfilled' ? (testRes.value.data?.server_version ?? '—') : '—',
        serverUrl: cluster?.server_url ?? '—',
        nodeCount: nodes.length,
        namespaceCount: namespacesRes.status === 'fulfilled' ? (namespacesRes.value.data?.length ?? 0) : 0,
        podCount: podsRes.status === 'fulfilled' ? (podsRes.value.data?.length ?? 0) : 0,
        nodesReady,
        nodesNotReady,
        deploymentCount: 0,
        statefulSetCount: 0,
        daemonSetCount: 0,
        jobCount: 0,
        serviceCount: 0,
        ingressCount: 0,
        pvcCount: 0,
        pvCount: 0,
        warningEvents
      }
      if (mountedRef.current) {
        statsCache.set(clusterId, { stats: newStats, loadedAt: Date.now() })
        setStats(newStats)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [clusterId, cluster?.server_url])

  useEffect(() => {
    mountedRef.current = true
    // Only auto-load if no cached data or cache is stale (>5min)
    const entry = statsCache.get(clusterId)
    if (!entry || Date.now() - entry.loadedAt > CACHE_TTL) {
      loadStats()
    }
    return () => {
      mountedRef.current = false
    }
  }, [clusterId, loadStats])

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: 'var(--vos-bg-app)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
          {cluster?.name ?? clusterId}
        </h2>
        <button
          type="button"
          className="p-1.5 rounded hover:bg-(--vos-bg-hover)"
          onClick={loadStats}
          disabled={loading}
          title="刷新"
        >
          <RefreshCw
            size={14}
            className={loading ? 'animate-spin' : ''}
            style={{ color: 'var(--vos-text-secondary)' }}
          />
        </button>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Cluster card */}
        <OverviewCard title="Cluster" icon={Server}>
          <div className="grid grid-cols-2 gap-y-2 text-xs">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Version</span>
            <span style={{ color: 'var(--vos-text-primary)' }}>{stats.version}</span>
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Nodes</span>
            <span style={{ color: 'var(--vos-text-primary)' }}>{stats.nodeCount}</span>
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Namespaces</span>
            <span style={{ color: 'var(--vos-text-primary)' }}>{stats.namespaceCount}</span>
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Pods</span>
            <span style={{ color: 'var(--vos-text-primary)' }}>{stats.podCount}</span>
          </div>
        </OverviewCard>

        {/* Nodes card */}
        <OverviewCard title="Nodes" icon={CheckCircle}>
          <div className="flex items-center gap-4">
            <DonutChart ready={stats.nodesReady} notReady={stats.nodesNotReady} total={stats.nodeCount} />
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ background: 'var(--vos-accent-success, #22c55e)' }}
                />
                <span style={{ color: 'var(--vos-text-secondary)' }}>Ready</span>
                <span className="ml-auto font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                  {stats.nodesReady}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ background: 'var(--vos-accent-danger, #ef4444)' }}
                />
                <span style={{ color: 'var(--vos-text-secondary)' }}>Not Ready</span>
                <span className="ml-auto font-medium" style={{ color: 'var(--vos-text-primary)' }}>
                  {stats.nodesNotReady}
                </span>
              </div>
            </div>
          </div>
        </OverviewCard>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {/* Workloads card */}
        <OverviewCard title="Workloads" icon={Box}>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Deployments</span>
            <StatValue value={stats.deploymentCount} />
            <span style={{ color: 'var(--vos-text-tertiary)' }}>StatefulSets</span>
            <StatValue value={stats.statefulSetCount} />
            <span style={{ color: 'var(--vos-text-tertiary)' }}>DaemonSets</span>
            <StatValue value={stats.daemonSetCount} />
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Jobs</span>
            <StatValue value={stats.jobCount} />
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Pods</span>
            <StatValue value={stats.podCount} />
          </div>
        </OverviewCard>

        {/* Network card */}
        <OverviewCard title="Network" icon={Globe}>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Services</span>
            <StatValue value={stats.serviceCount} />
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Ingresses</span>
            <StatValue value={stats.ingressCount} />
          </div>
        </OverviewCard>

        {/* Storage card */}
        <OverviewCard title="Storage" icon={HardDrive}>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>PVCs</span>
            <StatValue value={stats.pvcCount} />
            <span style={{ color: 'var(--vos-text-tertiary)' }}>PVs</span>
            <StatValue value={stats.pvCount} />
          </div>
        </OverviewCard>
      </div>

      {/* Row 3 — Events */}
      <OverviewCard title="Recent Warning Events" icon={AlertTriangle}>
        {stats.warningEvents.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
            <Layers size={14} />
            <span>No warning events</span>
          </div>
        ) : (
          <div className="flex flex-col divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
            {stats.warningEvents.map((ev, i) => (
              <div
                key={`${ev.name}-${i}`}
                className="py-1.5 text-xs"
                style={{ borderColor: 'var(--vos-border-subtle)' }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <AlertTriangle size={11} style={{ color: 'var(--vos-accent-warning, #ca8a04)', flexShrink: 0 }} />
                  <span className="font-medium truncate" style={{ color: 'var(--vos-text-primary)' }}>
                    {ev.reason}
                  </span>
                  <span className="ml-auto shrink-0" style={{ color: 'var(--vos-text-tertiary)' }}>
                    ×{ev.count}
                  </span>
                </div>
                <div className="truncate pl-4" style={{ color: 'var(--vos-text-secondary)' }}>
                  {ev.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </OverviewCard>
    </div>
  )
}
