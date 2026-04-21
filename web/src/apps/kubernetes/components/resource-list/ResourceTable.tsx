import { notificationService } from '@/services/notification'
import { useContextMenu } from '@/shell/ContextMenu/store'
import { k8sApi } from '../../api'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import type { K8sResource, K8sResourceKind } from '../../types'
import { getResourceDef } from '../../utils/resource-registry'

interface Props {
  resources: K8sResource[]
  kind: K8sResourceKind
  selected: Set<string>
  onSelectChange: (selected: Set<string>) => void
}

export function ResourceTable({ resources, kind, selected, onSelectChange }: Props) {
  const openDetailDrawer = useKubernetesStore(s => s.openDetailDrawer)
  const activeK8sTab = useKubernetesStore(s => s.getActiveTab())
  const def = getResourceDef(kind)
  const columns = def.columns

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

  const handleRestartDeployment = async (resource: K8sResource) => {
    const clusterId = activeK8sTab?.clusterId
    if (!clusterId || !resource.namespace) return
    try {
      await k8sApi.restartDeployment(clusterId, 'deployment', resource.name, resource.namespace)
      notificationService.success('Restart Deployment', `Restarted ${resource.name}`, 'kubernetes')
    } catch (e) {
      notificationService.error('Restart Deployment', String(e), 'kubernetes')
    }
  }

  const handleCordonNode = async (resource: K8sResource, cordon: boolean) => {
    const clusterId = activeK8sTab?.clusterId
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

  const onRowContextMenu = useContextMenu((e, resource: K8sResource) => {
    e.preventDefault()
    const isDeployment = resource.kind.toLowerCase() === 'deployment'
    const isNode = resource.kind.toLowerCase() === 'node'
    const nodeCordoned = (resource.raw as Record<string, unknown>)?.spec?.unschedulable === true

    const items: Array<{ id: string; label: string; action: () => void; danger?: boolean } | { type: 'separator' }> = [
      { id: 'detail', label: '查看详情', action: () => openDetailDrawer(resource) },
      { id: 'yaml', label: '编辑 YAML', action: () => openDetailDrawer(resource, 'yaml') }
    ]

    if (isDeployment) {
      items.push(
        { type: 'separator' },
        { id: 'restart', label: 'Restart', action: () => handleRestartDeployment(resource) }
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

    items.push(
      { type: 'separator' },
      { id: 'copy', label: '复制名称', action: () => navigator.clipboard.writeText(resource.name) },
      { type: 'separator' },
      { id: 'delete', label: '删除', danger: true, action: () => {} }
    )

    return items
  })

  return (
    <div className="flex-1 overflow-auto text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-[var(--vos-bg-surface)] border-b-[0.5px] border-b-[var(--vos-border-subtle)]">
            <th className="px-2 py-1.5 text-left w-8">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={toggleAll}
              />
            </th>
            {columns.map(col => (
              <th
                key={col.key}
                className="px-2 py-1.5 text-left font-medium text-[var(--vos-text-tertiary)]"
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map(r => (
            <tr
              key={r.name}
              className="border-b-[0.5px] border-b-[var(--vos-border-subtle)] hover:bg-[var(--vos-bg-item-hover)] cursor-pointer"
              onClick={() => openDetailDrawer(r)}
              onContextMenu={e => onRowContextMenu(e as unknown as React.MouseEvent, r)}
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
                <td key={col.key} className="px-2 py-1.5">
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
