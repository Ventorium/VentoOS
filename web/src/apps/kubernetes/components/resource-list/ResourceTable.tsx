import { useCallback, useEffect, useRef, useState } from 'react'
import { eventBus } from '@/kernel'
import type { EventTopic } from '@/kernel'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { toast } from '@/components/Toast'
import { notificationService } from '@/services/notification'
import { useBottomPanelStore } from '../../stores/bottom-panel-store'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sResource, K8sResourceKind } from '../../types'
import { getResourceDef, getResourceColumns } from '../../utils/resource-registry'

interface Props {
  resources: K8sResource[]
  kind: K8sResourceKind
  selected: Set<string>
  onSelectChange: (selected: Set<string>) => void
}

function getRaw(resource: K8sResource): Record<string, unknown> | undefined {
  return resource.raw as Record<string, unknown> | undefined
}

const COL_MIN = 60
const COL_MAX = 600
const STORAGE_KEY_PREFIX = 'vos:k8s:col-widths:'

/** Well-known ports → IPC event topic mapping */
const PORT_EVENT_MAP: Record<number, { topic: EventTopic; label: string; dbType?: string }> = {
  5432: { topic: 'open:postgres', label: '在数据库中打开 (PostgreSQL)', dbType: 'postgresql' },
  3306: { topic: 'open:mysql', label: '在数据库中打开 (MySQL)', dbType: 'mysql' },
  6379: { topic: 'open:redis', label: '在 Redis 中打开' },
}

function loadWidths(kind: string): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + kind)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveWidths(kind: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + kind, JSON.stringify(widths))
  } catch { /* ignore */ }
}

export function ResourceTable({ resources, kind, selected, onSelectChange }: Props) {
  const openDetailDrawer = useKubernetesStore(s => s.openDetailDrawer)
  const activeK8sTab = useKubernetesStore(s => s.getActiveTab())
  const openYamlTab = useBottomPanelStore(s => s.openYamlTab)
  const openLogsTab = useBottomPanelStore(s => s.openLogsTab)
  const openShellTab = useBottomPanelStore(s => s.openShellTab)
  const openBottomPanel = useKubernetesStore(s => s.openBottomPanel)
  const def = getResourceDef(kind)
  const columns = getResourceColumns(kind, openDetailDrawer)
  const show = useContextMenuStore(s => s.show)

  // Column widths state: initialized from saved or column defaults
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const saved = loadWidths(kind)
    if (saved) return saved
    const widths: Record<string, number> = {}
    for (const col of columns) {
      const w = col.width
      widths[col.key] = typeof w === 'number' ? w : 150
    }
    return widths
  })

  // Resize drag state
  const resizeRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null)

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, colKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = {
      colKey,
      startX: e.clientX,
      startWidth: colWidths[colKey] ?? 150,
    }
  }, [colWidths])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return
      const { colKey, startX, startWidth } = resizeRef.current
      const delta = e.clientX - startX
      const newWidth = Math.max(COL_MIN, Math.min(COL_MAX, startWidth + delta))
      setColWidths(prev => ({ ...prev, [colKey]: newWidth }))
    }

    const handleMouseUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null
        // Save to localStorage on drag end
        setColWidths(prev => {
          saveWidths(kind, prev)
          return prev
        })
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [kind])

  const allSelected = resources.length > 0 && resources.every(r => selected.has(r.name))
  const someSelected = resources.some(r => selected.has(r.name)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected)
      resources.forEach(r => next.delete(r.name))
      onSelectChange(next)
    } else {
      const next = new Set(selected)
      resources.forEach(r => next.add(r.name))
      onSelectChange(next)
    }
  }

  const toggleRow = (name: string) => {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onSelectChange(next)
  }

  const clusterId = activeK8sTab?.clusterId

  const handleRestartDeployment = async (resource: K8sResource) => {
    if (!clusterId || !resource.namespace) return
    try {
      await k8sApi.restartDeployment(clusterId, 'deployment', resource.name, resource.namespace)
      notificationService.success('Restart Deployment', `Restarted ${resource.name}`, 'kubernetes')
    } catch (e) {
      notificationService.error('Restart Deployment', String(e), 'kubernetes')
    }
  }

  const handleCordonNode = async (resource: K8sResource, cordon: boolean) => {
    if (!clusterId) return
    try {
      await k8sApi.cordonNode(clusterId, resource.name, cordon)
      notificationService.success(
        cordon ? 'Cordon Node' : 'Uncordon Node',
        `${cordon ? 'Cordoned' : 'Uncordoned'} ${resource.name}`,
        'kubernetes'
      )
    } catch (e) {
      notificationService.error('Node Action', String(e), 'kubernetes')
    }
  }

  const handleOpenLogs = (resource: K8sResource) => {
    if (!clusterId || !resource.namespace) return
    openBottomPanel()
    openLogsTab(clusterId, resource.namespace, resource.name)
  }

  const handleOpenShell = (resource: K8sResource) => {
    if (!clusterId || !resource.namespace) return
    openBottomPanel()
    openShellTab(clusterId, resource.namespace, resource.name)
  }

  const handleOpenYamlEditor = (resource: K8sResource) => {
    if (!clusterId || !resource.namespace) return
    openBottomPanel()
    openYamlTab(clusterId, resource.namespace, kind, resource.name)
  }

  const handleOpenDatabase = (
    resource: K8sResource,
    portEntry: { topic: EventTopic; label: string; dbType?: string },
    matchedPort: number
  ) => {
    if (!clusterId || !resource.namespace) return

    // Extract targetPort from service spec for the matched port
    const raw = getRaw(resource)
    const spec = raw?.spec as Record<string, unknown> | undefined
    const svcPorts = (spec?.ports as Array<Record<string, unknown>> | undefined) ?? []
    const portInfo = svcPorts.find(p => Number(p.port) === matchedPort)
    const targetPort = portInfo ? Number(portInfo.targetPort ?? portInfo.port) : matchedPort

    const payload = {
      name: `${resource.name} (${portEntry.dbType ?? 'redis'})`,
      host: 'localhost',
      port: targetPort,
      autoConnect: true,
      k8sContext: {
        cluster: clusterId,
        namespace: resource.namespace,
        service: resource.name,
      },
    }

    if (portEntry.topic === 'open:postgres' || portEntry.topic === 'open:mysql') {
      eventBus.emit('kubernetes', portEntry.topic, {
        ...payload,
        dbType: portEntry.dbType as 'postgresql' | 'mysql',
      })
    } else if (portEntry.topic === 'open:redis') {
      eventBus.emit('kubernetes', 'open:redis', payload)
    }
    toast.success(`正在打开 ${portEntry.label}...`)
  }

  const handleDeleteResource = async (resource: K8sResource) => {
    if (!clusterId) return
    try {
      await k8sApi.deleteK8sResource(clusterId, kind, resource.name, resource.namespace)
      notificationService.success('Delete', `Deleted ${resource.name}`, 'kubernetes')
    } catch (e) {
      notificationService.error('Delete', String(e), 'kubernetes')
    }
  }

  const buildContextMenu = (e: React.MouseEvent, resource: K8sResource) => {
    e.preventDefault()
    const resourceKind = resource.kind.toLowerCase()
    const isDeployment = resourceKind === 'deployment'
    const isPod = resourceKind === 'pod'
    const isNode = resourceKind === 'node'
    const isService = resourceKind === 'service'
    const nodeCordoned = getRaw(resource)?.spec != null
      && (getRaw(resource)!.spec as Record<string, unknown>)?.unschedulable === true
    const podIP = isPod
      ? String((getRaw(resource)?.status as Record<string, unknown>)?.podIP ?? '')
      : ''

    const items: Array<
      | { id: string; label: string; action: () => void; danger?: boolean; disabled?: boolean }
      | { type: 'separator' }
    > = [
      { id: 'detail', label: '查看详情', action: () => openDetailDrawer(resource) },
      { id: 'yaml', label: '编辑 YAML', action: () => handleOpenYamlEditor(resource) },
    ]

    if (isDeployment) {
      items.push(
        { type: 'separator' },
        { id: 'scale', label: 'Scale...', action: () => openDetailDrawer(resource, 'summary') },
        { id: 'restart', label: 'Restart', action: () => handleRestartDeployment(resource) },
      )
    }

    if (isPod) {
      items.push(
        { type: 'separator' },
        { id: 'logs', label: 'Logs', action: () => handleOpenLogs(resource) },
        { id: 'shell', label: 'Shell', action: () => handleOpenShell(resource) },
        ...(podIP ? [
          { id: 'copy-ip', label: `Copy Pod IP (${podIP})`, action: () => navigator.clipboard.writeText(podIP).then(() => toast.success('已复制')) },
        ] : []),
      )
    }

    if (isNode) {
      items.push(
        { type: 'separator' },
        {
          id: 'cordon',
          label: nodeCordoned ? 'Uncordon' : 'Cordon',
          action: () => handleCordonNode(resource, !nodeCordoned)
        },
        { id: 'drain', label: 'Drain', action: () => openDetailDrawer(resource) }
      )
    }

    if (isService) {
      const raw = getRaw(resource)
      const spec = raw?.spec as Record<string, unknown> | undefined
      const svcPorts = (spec?.ports as Array<Record<string, unknown>> | undefined) ?? []

      // Detect well-known database/redis ports
      const detectedActions: Array<{ port: number; topic: EventTopic; label: string; dbType?: string }> = []
      for (const p of svcPorts) {
        const portNum = Number(p.port)
        const mapping = PORT_EVENT_MAP[portNum]
        if (mapping && !detectedActions.some(a => a.topic === mapping.topic)) {
          detectedActions.push({ port: portNum, ...mapping })
        }
      }

      if (detectedActions.length > 0) {
        items.push({ type: 'separator' })
        for (const action of detectedActions) {
          items.push({
            id: `ipc-${action.topic}`,
            label: action.label,
            action: () => handleOpenDatabase(resource, action, action.port),
          })
        }
      }

      items.push(
        { type: 'separator' },
        { id: 'port-forward', label: 'Port Forward...', action: () => {}, disabled: true },
      )
    }

    items.push(
      { type: 'separator' },
      { id: 'copy-name', label: '复制名称', action: () => navigator.clipboard.writeText(resource.name).then(() => toast.success('已复制')) },
      { id: 'copy-yaml', label: '复制 YAML', action: () => navigator.clipboard.writeText(JSON.stringify(resource.raw, null, 2)).then(() => toast.success('已复制')) },
      { type: 'separator' },
      { id: 'delete', label: '删除', danger: true, action: () => handleDeleteResource(resource) },
    )

    show(e.clientX, e.clientY, items)
  }

  return (
    <div className="flex-1 overflow-auto text-xs">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 32 }} />
          {columns.map(col => (
            <col key={col.key} style={{ width: colWidths[col.key] ?? 150 }} />
          ))}
        </colgroup>
        <thead>
          <tr className="sticky top-0 bg-[var(--vos-bg-surface)] border-b-[0.5px] border-b-[var(--vos-border-subtle)]">
            <th className="px-2 py-1.5 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={toggleAll}
              />
            </th>
            {columns.map((col, ci) => (
              <th
                key={col.key}
                className="px-2 py-1.5 text-left font-medium text-[var(--vos-text-tertiary)] relative select-none"
              >
                <span>{col.header}</span>
                {ci < columns.length - 1 && (
                  <div
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[var(--vos-accent-primary)] opacity-30 hover:opacity-80 transition-opacity"
                    onMouseDown={e => handleResizeMouseDown(e, col.key)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map(r => (
            <tr
              key={r.name}
              className="border-b-[0.5px] border-b-[var(--vos-border-subtle)] hover:bg-[var(--vos-bg-item-hover)] cursor-default"
              onContextMenu={e => buildContextMenu(e, r)}
            >
              <td
                className="px-2 py-1.5"
                onClick={e => {
                  e.stopPropagation()
                  toggleRow(r.name)
                }}
              >
                <input type="checkbox" checked={selected.has(r.name)} onChange={() => toggleRow(r.name)} />
              </td>
              {columns.map(col => (
                <td key={col.key} className="px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                  {col.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {resources.length === 0 && (
        <div className="flex items-center justify-center py-8 text-[var(--vos-text-tertiary)]">无资源</div>
      )}
    </div>
  )
}
