/**
 * PublicAccess — External access via SSH tunneling services
 *
 * Manage tunnels through providers like Pinggy, localhost.run, Serveo,
 * or custom SSH commands. Each tunnel maps a local service to a public URL.
 */

import { CircleDot, ExternalLink, Globe, Play, Plus, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { superTerminalApi } from '@/apps/super-terminal/api'
import type { CreateServiceExposureReq, PublicAccessProvider, ServiceExposure } from '@/apps/super-terminal/types'
import { publicAccessProviders } from '@/apps/super-terminal/types'
import { FormSelect } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ── Inline style tag ───────────────────────────────────────────────────────

const hoverStyles = `
  .pa-card { transition: background 0.12s, border-color 0.12s; }
  .pa-card:hover { background: rgba(255,255,255,0.03) !important; border-color: #444 !important; }
  .pa-action-btn { opacity: 0.7; transition: opacity 0.12s; }
  .pa-action-btn:hover { opacity: 1; }
  .pa-url:hover { text-decoration: underline !important; }
`

// ── Types ──────────────────────────────────────────────────────────────────

interface TunnelFormData {
  providerId: string // provider id or 'custom'
  localAddress: string
  customCommand: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseLocalAddress(addr: string): { host: string; port: number } {
  const trimmed = addr.trim()
  const colonIdx = trimmed.lastIndexOf(':')
  if (colonIdx === -1) {
    return { host: 'localhost', port: Number(trimmed) || 3000 }
  }
  const host = trimmed.slice(0, colonIdx) || 'localhost'
  const port = Number(trimmed.slice(colonIdx + 1)) || 3000
  return { host, port }
}

function getProviderById(id: string): PublicAccessProvider | undefined {
  return publicAccessProviders.find(p => p.id === id)
}

function getProviderLabel(name: string): string {
  const provider = publicAccessProviders.find(p => p.name === name)
  return provider?.name ?? name
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'running':
      return 'var(--vos-accent-success)'
    case 'starting':
      return 'var(--vos-accent-warning)'
    case 'error':
      return 'var(--vos-accent-danger)'
    default:
      return 'var(--vos-text-tertiary)'
  }
}

// ── Tunnel card ────────────────────────────────────────────────────────────

function TunnelCard({
  exposure,
  onStart,
  onStop,
  onDelete
}: {
  exposure: ServiceExposure
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}) {
  const isRunning = exposure.status === 'active' || exposure.status === 'starting'
  const hasPublicInfo = exposure.public_url || exposure.public_port > 0
  const providerLabel = getProviderLabel(exposure.name)

  return (
    <div className="pa-card bg-[#1e1e1e] border border-[#333] rounded-[8px] p-4 flex flex-col gap-3">
      {/* Header: provider + status + actions */}
      <div className="flex items-center gap-2">
        <Globe size={18} className="shrink-0" style={{ color: statusColor(exposure.status) }} />
        <span className="text-[14px] font-medium text-[var(--vos-text-primary)] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {providerLabel}
        </span>
        <StatusBadge status={exposure.status} icon={<CircleDot size={10} />} />
      </div>

      {/* Local service address */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[var(--vos-text-tertiary)]">本地服务:</span>
        <span className="font-mono text-[var(--vos-text-secondary)]">
          {exposure.source_host}:{exposure.source_port}
        </span>
      </div>

      {/* Public URL (if tunnel provides one) */}
      {isRunning && exposure.public_url && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--vos-text-tertiary)]">公网地址:</span>
          <a
            href={exposure.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="pa-url font-mono text-[var(--vos-accent-primary)] no-underline overflow-hidden text-ellipsis whitespace-nowrap max-w-[220px]"
          >
            {exposure.public_url}
          </a>
        </div>
      )}

      {/* Public port (fallback when no URL) */}
      {isRunning && !exposure.public_url && exposure.public_port > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--vos-text-tertiary)]">公网端口:</span>
          <span className="font-mono text-[var(--vos-accent-primary)]">{exposure.public_port}</span>
        </div>
      )}

      {/* Starting indicator */}
      {isRunning && !hasPublicInfo && (
        <div className="text-xs text-[var(--vos-text-tertiary)] italic">正在建立隧道，等待公网地址…</div>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-1.5 border-t border-t-[#2a2a2a] pt-3">
        {isRunning ? (
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onStop}>
            <Square size={14} className="mr-1 text-[var(--vos-accent-warning)]" />
            停止
          </button>
        ) : (
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onStart}>
            <Play size={14} className="mr-1 text-[var(--vos-accent-success)]" />
            启动
          </button>
        )}

        {isRunning && hasPublicInfo && (
          <button
            type="button"
            className="vos-btn vos-btn-ghost vos-btn-sm pa-action-btn opacity-100"
            onClick={() => window.open(exposure.public_url ?? `http://localhost:${exposure.public_port}`, '_blank')}
          >
            <ExternalLink size={14} className="mr-1" />
            打开
          </button>
        )}

        <div className="flex-1" />

        <button
          type="button"
          className="pa-action-btn bg-transparent border-none cursor-pointer p-1 text-[var(--vos-accent-danger)] flex items-center"
          title="删除"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Tunnel form modal ──────────────────────────────────────────────────────

function TunnelFormModal({
  open,
  onClose,
  onSubmit
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateServiceExposureReq) => void
}) {
  const [form, setForm] = useState<TunnelFormData>({
    providerId: publicAccessProviders[0]?.id ?? 'pinggy',
    localAddress: 'localhost:3000',
    customCommand: ''
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({
        providerId: publicAccessProviders[0]?.id ?? 'pinggy',
        localAddress: 'localhost:3000',
        customCommand: ''
      })
      setSubmitting(false)
    }
  }, [open])

  const updateField = <K extends keyof TunnelFormData>(key: K, value: TunnelFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const isCustom = form.providerId === 'custom'
  const selectedProvider = getProviderById(form.providerId)

  const sshCommand = isCustom ? form.customCommand : selectedProvider ? selectedProvider.command(form.localAddress) : ''

  const handleSubmit = async () => {
    if (!form.localAddress.trim()) return
    if (isCustom && !form.customCommand.trim()) return
    setSubmitting(true)

    const { host, port } = parseLocalAddress(form.localAddress)
    const name = isCustom ? '自定义隧道' : (selectedProvider?.name ?? form.providerId)

    try {
      onSubmit({
        name,
        source_type: 'local',
        source_host: host,
        source_port: port,
        public_port: 0,
        basic_auth_enabled: false,
        ssh_command: sshCommand || undefined
      })
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = form.localAddress.trim() && (!isCustom || form.customCommand.trim())

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建隧道"
      width={500}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="vos-btn vos-btn-primary vos-btn-sm"
            disabled={submitting || !canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? '创建中…' : '创建'}
          </button>
        </div>
      }
    >
      <div className="mb-3">
        <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">
          服务提供商 <span className="text-[#ff453a]">*</span>
        </label>
        <FormSelect
          variant="toolbar"
          className="w-full text-[13px]"
          wrapperClassName="w-full"
          value={form.providerId}
          onChange={e => updateField('providerId', e.target.value)}
        >
          {publicAccessProviders.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.description}
            </option>
          ))}
          <option value="custom">自定义</option>
        </FormSelect>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">
          本地服务地址 <span className="text-[#ff453a]">*</span>
        </label>
        <input
          className="w-full py-1.5 px-2.5 text-[13px] bg-[#1a1a1a] border border-[#333] rounded text-[var(--vos-text-primary)] outline-none box-border"
          value={form.localAddress}
          onChange={e => updateField('localAddress', e.target.value)}
          placeholder="localhost:3000"
        />
        <span className="text-[11px] text-[var(--vos-text-tertiary)] mt-0.5 block">要暴露到公网的本地服务地址</span>
      </div>

      {isCustom && (
        <div className="mb-3">
          <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">
            自定义 SSH 命令 <span className="text-[#ff453a]">*</span>
          </label>
          <input
            className="w-full py-1.5 px-2.5 text-[13px] bg-[#1a1a1a] border border-[#333] rounded text-[var(--vos-text-primary)] outline-none box-border"
            value={form.customCommand}
            onChange={e => updateField('customCommand', e.target.value)}
            placeholder="ssh -R 80:localhost:3000 serveo.net"
          />
        </div>
      )}

      {/* SSH command preview */}
      {sshCommand && (
        <div className="mb-3">
          <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">SSH 命令预览</label>
          <div className="py-2 px-3 border border-[#333] rounded font-mono text-xs text-[var(--vos-accent-success)] leading-[1.6] break-all">
            {sshCommand}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Delete confirm modal ───────────────────────────────────────────────────

function DeleteConfirmModal({
  open,
  message,
  onClose,
  onConfirm
}: {
  open: boolean
  message: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="确认删除"
      width={380}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-danger vos-btn-sm" onClick={onConfirm}>
            删除
          </button>
        </div>
      }
    >
      <p className="text-[13px] text-[var(--vos-text-secondary)] m-0">{message}</p>
    </Modal>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PublicAccess() {
  const [exposures, setExposures] = useState<ServiceExposure[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    message: string
    onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })

  // ── Data loading ─────────────────────────────────────────────────────

  const loadData = useCallback(() => {
    superTerminalApi
      .getServiceExposures()
      .then(res => {
        if (res.data) setExposures(res.data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Poll for public_url updates while any tunnel is starting/active
  useEffect(() => {
    const hasActive = exposures.some(e => e.status === 'starting' || e.status === 'active')
    if (!hasActive) return
    const timer = setInterval(loadData, 3000)
    return () => clearInterval(timer)
  }, [exposures, loadData])

  // ── Actions ──────────────────────────────────────────────────────────

  const handleCreate = useCallback(
    async (data: CreateServiceExposureReq) => {
      try {
        await superTerminalApi.createServiceExposure(data)
        setFormOpen(false)
        loadData()
      } catch {
        // error handled silently
      }
    },
    [loadData]
  )

  const handleStart = useCallback(
    async (id: string) => {
      try {
        const res = await superTerminalApi.startServiceExposure(id)
        if (res.data) {
          setExposures(prev => prev.map(e => (e.id === id ? res.data! : e)))
        }
      } catch {
        loadData()
      }
    },
    [loadData]
  )

  const handleStop = useCallback(
    async (id: string) => {
      try {
        const res = await superTerminalApi.stopServiceExposure(id)
        if (res.data) {
          setExposures(prev => prev.map(e => (e.id === id ? res.data! : e)))
        }
      } catch {
        loadData()
      }
    },
    [loadData]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await superTerminalApi.deleteServiceExposure(id)
        setExposures(prev => prev.filter(e => e.id !== id))
      } catch {
        loadData()
      }
    },
    [loadData]
  )

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      <style>{hoverStyles}</style>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-b-[#333] shrink-0">
        <button type="button" className="vos-btn vos-btn-primary vos-btn-sm" onClick={() => setFormOpen(true)}>
          <Plus size={14} className="mr-1" />
          新建隧道
        </button>

        <div className="flex-1" />

        <span className="text-xs text-[var(--vos-text-tertiary)]">共 {exposures.length} 个</span>
      </div>

      {/* Content */}
      {exposures.length === 0 ? (
        <EmptyState
          icon={<Globe size={40} />}
          title="暂无外网访问隧道"
          description="通过 SSH 隧道服务将本地服务暴露到公网"
          action={
            <button type="button" className="vos-btn vos-btn-primary vos-btn-sm" onClick={() => setFormOpen(true)}>
              <Plus size={14} className="mr-1" />
              新建隧道
            </button>
          }
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3 content-start">
          {exposures.map(exposure => (
            <TunnelCard
              key={exposure.id}
              exposure={exposure}
              onStart={() => handleStart(exposure.id)}
              onStop={() => handleStop(exposure.id)}
              onDelete={() => {
                setDeleteConfirm({
                  open: true,
                  message: `确定删除隧道「${exposure.name}」吗？运行中的隧道将被停止。`,
                  onConfirm: () => {
                    handleDelete(exposure.id)
                    setDeleteConfirm(p => ({ ...p, open: false }))
                  }
                })
              }}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <TunnelFormModal open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleCreate} />
      <DeleteConfirmModal
        open={deleteConfirm.open}
        message={deleteConfirm.message}
        onClose={() => setDeleteConfirm(p => ({ ...p, open: false }))}
        onConfirm={deleteConfirm.onConfirm}
      />
    </div>
  )
}
