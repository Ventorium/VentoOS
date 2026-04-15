import { useState } from 'react'
import {
  Copy,
  Edit3,
  MoreHorizontal,
  Power,
  RefreshCw,
  Scale,
  Trash2,
  X,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { notificationService } from '@/services/notification'
import { k8sApi } from '../../api'
import { useKubernetesStore } from '../../stores/kubernetes-store'
import { useBottomPanelStore } from '../../stores/bottom-panel-store'
import { DataTab } from '../detail-tabs/DataTab'
import { EndpointsTab } from '../detail-tabs/EndpointsTab'
import { EventsTab } from '../detail-tabs/EventsTab'
import { PodsTab } from '../detail-tabs/PodsTab'
import { SummaryTab } from '../detail-tabs/SummaryTab'
import { YamlTab } from '../detail-tabs/YamlTab'
import { getResourceDef } from '../../utils/resource-registry'

const TAB_LABELS: Record<string, string> = {
  summary: 'Summary',
  yaml: 'YAML',
  events: 'Events',
  pods: 'Pods',
  logs: 'Logs',
  shell: 'Shell',
  data: 'Data',
  endpoints: 'Endpoints',
}

export function DetailDrawer() {
  const resource = useKubernetesStore(s => s.detailResource)
  const activeTab = useKubernetesStore(s => s.detailActiveTab)
  const setDetailActiveTab = useKubernetesStore(s => s.setDetailActiveTab)
  const closeDetailDrawer = useKubernetesStore(s => s.closeDetailDrawer)
  const openBottomPanel = useKubernetesStore(s => s.openBottomPanel)
  const activeK8sTab = useKubernetesStore(s => s.getActiveTab())
  const openYamlTab = useBottomPanelStore(s => s.openYamlTab)

  const [scaleOpen, setScaleOpen] = useState(false)
  const [replicas, setReplicas] = useState(1)
  const [drainOpen, setDrainOpen] = useState(false)
  const [forceDrain, setForceDrain] = useState(false)
  const [ignoreDaemonSets, setIgnoreDaemonSets] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  if (!resource) return null

  const clusterId = activeK8sTab?.clusterId ?? ''
  const isDeployment = resource.kind.toLowerCase() === 'deployment'
  const isNode = resource.kind.toLowerCase() === 'node'
  const nodeCordoned = (resource.raw as Record<string, unknown>)?.spec?.unschedulable === true
  const def = getResourceDef(resource.kind)
  const detailTabs = def.detailTabs

  const handleEdit = () => {
    if (!activeK8sTab || !resource.namespace) return
    openYamlTab(activeK8sTab.clusterId, resource.namespace, resource.kind, resource.name)
    openBottomPanel()
  }

  const handleScale = async () => {
    if (!clusterId || !resource.namespace) return
    setActionLoading(true)
    try {
      await k8sApi.scaleDeployment(
        clusterId,
        'deployment',
        resource.name,
        resource.namespace,
        replicas,
      )
      notificationService.success('Scale Deployment', `Scaled ${resource.name} to ${replicas} replicas`, 'kubernetes')
      setScaleOpen(false)
    } catch (e) {
      notificationService.error('Scale Deployment', String(e), 'kubernetes')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRestart = async () => {
    if (!clusterId || !resource.namespace) return
    setActionLoading(true)
    try {
      await k8sApi.restartDeployment(clusterId, 'deployment', resource.name, resource.namespace)
      notificationService.success('Restart Deployment', `Restarted ${resource.name}`, 'kubernetes')
    } catch (e) {
      notificationService.error('Restart Deployment', String(e), 'kubernetes')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCordon = async (cordon: boolean) => {
    if (!clusterId) return
    setActionLoading(true)
    try {
      await k8sApi.cordonNode(clusterId, resource.name, cordon)
      notificationService.success(
        cordon ? 'Cordon Node' : 'Uncordon Node',
        `${cordon ? 'Cordoned' : 'Uncordoned'} ${resource.name}`,
        'kubernetes',
      )
    } catch (e) {
      notificationService.error('Node Action', String(e), 'kubernetes')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDrain = async () => {
    if (!clusterId) return
    setActionLoading(true)
    try {
      await k8sApi.drainNode(clusterId, resource.name, forceDrain, ignoreDaemonSets)
      notificationService.success('Drain Node', `Drained ${resource.name}`, 'kubernetes')
      setDrainOpen(false)
    } catch (e) {
      notificationService.error('Drain Node', String(e), 'kubernetes')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-col h-full w-full overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 h-11 px-3 border-b-[0.5px] border-b-[var(--vos-border-subtle)] flex-shrink-0">
          <span className="text-xs font-medium truncate flex-1">
            {resource.kind}: {resource.name}
          </span>

          {isDeployment && (
            <>
              <button
                type="button"
                disabled={actionLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
                onClick={() => {
                  const current = ((resource.raw as Record<string, unknown>)?.spec?.replicas as number) ?? 1
                  setReplicas(current)
                  setScaleOpen(true)
                }}
                title="Scale"
              >
                <Scale size={12} />
                Scale
              </button>
              <button
                type="button"
                disabled={actionLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
                onClick={handleRestart}
                title="Restart"
              >
                <RefreshCw size={12} />
                Restart
              </button>
            </>
          )}

          {isNode && (
            <>
              <button
                type="button"
                disabled={actionLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
                onClick={() => handleCordon(!nodeCordoned)}
                title={nodeCordoned ? 'Uncordon' : 'Cordon'}
              >
                <Power size={12} />
                {nodeCordoned ? 'Uncordon' : 'Cordon'}
              </button>
              <button
                type="button"
                disabled={actionLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
                onClick={() => setDrainOpen(true)}
                title="Drain"
              >
                <Scale size={12} />
                Drain
              </button>
            </>
          )}

          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-tertiary)]"
            onClick={() => { /* copy name */ }}
            title="复制名称"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-tertiary)]"
            title="刷新"
          >
            <RefreshCw size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-tertiary)]"
            onClick={handleEdit}
            title="编辑"
          >
            <Edit3 size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-accent-danger)]"
            title="删除"
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-tertiary)]"
            title="更多"
          >
            <MoreHorizontal size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-tertiary)]"
            onClick={closeDetailDrawer}
            title="关闭"
          >
            <X size={13} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center h-8 border-b-[0.5px] border-b-[var(--vos-border-subtle)] flex-shrink-0 overflow-x-auto">
          {detailTabs.map(tabId => (
            <button
              key={tabId}
              type="button"
              className="px-3 h-full text-[11px] whitespace-nowrap border-b-[2px]"
              style={{
                color: activeTab === tabId ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
                borderBottomColor: activeTab === tabId ? 'var(--vos-accent-primary)' : 'transparent',
              }}
              onClick={() => setDetailActiveTab(tabId)}
            >
              {TAB_LABELS[tabId] ?? tabId}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3">
          {activeTab === 'summary' && <SummaryTab resource={resource} />}
          {activeTab === 'yaml' && <YamlTab resource={resource} />}
          {activeTab === 'events' && <EventsTab resource={resource} />}
          {activeTab === 'pods' && <PodsTab resource={resource} />}
          {activeTab === 'data' && <DataTab resource={resource} />}
          {activeTab === 'endpoints' && <EndpointsTab resource={resource} />}
          {['logs', 'shell'].includes(activeTab) && (
            <div className="text-xs text-[var(--vos-text-tertiary)] py-8 text-center">
              {activeTab} 视图开发中
            </div>
          )}
        </div>
      </div>

      {/* Scale Modal */}
      <Modal
        open={scaleOpen}
        onClose={() => setScaleOpen(false)}
        title={`Scale ${resource.name}`}
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs hover:bg-[var(--vos-bg-item-hover)]"
              onClick={() => setScaleOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={actionLoading}
              className="px-3 py-1.5 rounded text-xs bg-[var(--vos-accent-primary)] text-white disabled:opacity-50"
              onClick={handleScale}
            >
              Scale
            </button>
          </div>
        )}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--vos-text-secondary)]">Replicas:</span>
          <input
            type="number"
            min={0}
            className="w-24 bg-[var(--vos-bg-input)] border-[0.5px] border-[var(--vos-border-subtle)] rounded px-2 py-1 text-xs"
            value={replicas}
            onChange={e => setReplicas(Number(e.target.value))}
          />
        </div>
      </Modal>

      {/* Drain Modal */}
      <Modal
        open={drainOpen}
        onClose={() => setDrainOpen(false)}
        title={`Drain ${resource.name}`}
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs hover:bg-[var(--vos-bg-item-hover)]"
              onClick={() => setDrainOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={actionLoading}
              className="px-3 py-1.5 rounded text-xs bg-[var(--vos-accent-primary)] text-white disabled:opacity-50"
              onClick={handleDrain}
            >
              Drain
            </button>
          </div>
        )}
      >
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={forceDrain}
              onChange={e => setForceDrain(e.target.checked)}
            />
            Force (delete pods not managed by a controller)
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={ignoreDaemonSets}
              onChange={e => setIgnoreDaemonSets(e.target.checked)}
            />
            Ignore DaemonSets
          </label>
        </div>
      </Modal>
    </>
  )
}
