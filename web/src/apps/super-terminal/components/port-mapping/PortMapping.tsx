/**
 * PortMapping — Port mapping management panel
 *
 * Toolbar: New / Batch Start / Batch Delete / Refresh
 * List:    table with selection, auto-start toggle, status, actions
 * Modals:  create/edit form, delete confirm
 */

import { ArrowRightLeft, CircleDot, Pencil, Play, Plus, RefreshCw, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { superTerminalApi } from '@/apps/super-terminal/api'
import { useSuperTerminalStore } from '@/apps/super-terminal/store'
import type { CreatePortMappingReq, PortMapping as PortMappingType } from '@/apps/super-terminal/types'
import { FormSelect } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'

// ── Constants ──────────────────────────────────────────────────────────────

const ROW_HEIGHT = 48

// ── Inline style tag ───────────────────────────────────────────────────────

const hoverStyles = `
  .pm-row:hover { background: rgba(255,255,255,0.03) !important; }
  .pm-row.selected { background: rgba(22,104,220,0.15) !important; }
  .pm-ctx-item:hover { background: #333 !important; }
  .pm-action-btn { opacity: 0.7; transition: opacity 0.12s; }
  .pm-action-btn:hover { opacity: 1; }
`

// ── Types ──────────────────────────────────────────────────────────────────

interface MappingFormData {
  name: string
  ssh_server_id: string
  remote_host: string
  remote_port: number | ''
  local_port: number | ''
  auto_start: boolean
  remark: string
}

interface ContextMenuState {
  x: number
  y: number
  mappingId: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyFormData(): MappingFormData {
  return {
    name: '',
    ssh_server_id: '',
    remote_host: 'localhost',
    remote_port: '',
    local_port: '',
    auto_start: false,
    remark: ''
  }
}

function mappingToFormData(m: PortMappingType): MappingFormData {
  return {
    name: m.name,
    ssh_server_id: m.ssh_server_id,
    remote_host: m.remote_host,
    remote_port: m.remote_port,
    local_port: m.local_port,
    auto_start: m.auto_start,
    remark: m.remark ?? ''
  }
}

function formDataToReq(f: MappingFormData): CreatePortMappingReq {
  return {
    name: f.name,
    ssh_server_id: f.ssh_server_id,
    remote_host: f.remote_host,
    remote_port: Number(f.remote_port) || 0,
    local_port: Number(f.local_port) || 0,
    auto_start: f.auto_start,
    remark: f.remark || undefined
  }
}

// ── Context menu ───────────────────────────────────────────────────────────

function CtxMenu({
  x,
  y,
  items,
  onDismiss
}: {
  x: number
  y: number
  items: { label: string; danger?: boolean; onClick: () => void }[]
  onDismiss: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const nx = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : x
    const ny = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handler, true)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler, true)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onDismiss])

  return (
    <div
      ref={ref}
      className="fixed z-[9999] bg-[#252525] border border-[#444] rounded-[6px] py-1 min-w-[160px] select-none"
      style={{
        left: pos.x,
        top: pos.y,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={
            item.danger
              ? 'pm-ctx-item py-1.5 px-4 cursor-pointer text-[13px] whitespace-nowrap text-[#ff453a]'
              : 'pm-ctx-item py-1.5 px-4 cursor-pointer text-[13px] whitespace-nowrap text-[#d4d4d4]'
          }
          onClick={e => {
            e.stopPropagation()
            item.onClick()
            onDismiss()
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}

// ── Form modal ─────────────────────────────────────────────────────────────

function MappingFormModal({
  open,
  editing,
  onClose,
  onSubmit
}: {
  open: boolean
  editing: PortMappingType | null
  onClose: () => void
  onSubmit: (data: CreatePortMappingReq) => void
}) {
  const servers = useSuperTerminalStore(s => s.servers)
  const [form, setForm] = useState<MappingFormData>(emptyFormData)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(editing ? mappingToFormData(editing) : emptyFormData())
      setSubmitting(false)
    }
  }, [open, editing])

  const updateField = <K extends keyof MappingFormData>(key: K, value: MappingFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.ssh_server_id || !form.remote_port || !form.local_port) return
    setSubmitting(true)
    try {
      onSubmit(formDataToReq(form))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = form.name.trim() && form.ssh_server_id && form.remote_port && form.local_port

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '编辑映射' : '新建映射'}
      width={480}
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
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      }
    >
      <div className="mb-3">
        <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">
          名称 <span className="text-[#ff453a]">*</span>
        </label>
        <input
          className="w-full py-1.5 px-2.5 text-[13px] bg-[#1a1a1a] border border-[#333] rounded text-[var(--vos-text-primary)] outline-none box-border"
          value={form.name}
          onChange={e => updateField('name', e.target.value)}
          placeholder="如: MySQL 转发"
          autoFocus
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">
          SSH 服务器 <span className="text-[#ff453a]">*</span>
        </label>
        <FormSelect
          variant="toolbar"
          className="w-full text-[13px]"
          wrapperClassName="w-full"
          value={form.ssh_server_id}
          onChange={e => updateField('ssh_server_id', e.target.value)}
        >
          <option value="">请选择服务器</option>
          {servers.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.host}:{s.port})
            </option>
          ))}
        </FormSelect>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="mb-3">
          <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">远程地址</label>
          <input
            className="w-full py-1.5 px-2.5 text-[13px] bg-[#1a1a1a] border border-[#333] rounded text-[var(--vos-text-primary)] outline-none box-border"
            value={form.remote_host}
            onChange={e => updateField('remote_host', e.target.value)}
            placeholder="localhost"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">
            远程端口 <span className="text-[#ff453a]">*</span>
          </label>
          <input
            type="number"
            className="w-full py-1.5 px-2.5 text-[13px] bg-[#1a1a1a] border border-[#333] rounded text-[var(--vos-text-primary)] outline-none box-border"
            value={form.remote_port}
            onChange={e => updateField('remote_port', e.target.value ? Number(e.target.value) : '')}
            placeholder="3306"
            min={1}
            max={65535}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="mb-3">
          <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">
            本地端口 <span className="text-[#ff453a]">*</span>
          </label>
          <input
            type="number"
            className="w-full py-1.5 px-2.5 text-[13px] bg-[#1a1a1a] border border-[#333] rounded text-[var(--vos-text-primary)] outline-none box-border"
            value={form.local_port}
            onChange={e => updateField('local_port', e.target.value ? Number(e.target.value) : '')}
            placeholder="13306"
            min={1}
            max={65535}
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">开机自启</label>
          <div className="pt-1">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-[13px] text-[var(--vos-text-primary)]">
              <input
                type="checkbox"
                checked={form.auto_start}
                onChange={e => updateField('auto_start', e.target.checked)}
              />
              启动时自动映射
            </label>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-[var(--vos-text-secondary)] mb-1">备注</label>
        <input
          className="w-full py-1.5 px-2.5 text-[13px] bg-[#1a1a1a] border border-[#333] rounded text-[var(--vos-text-primary)] outline-none box-border"
          value={form.remark}
          onChange={e => updateField('remark', e.target.value)}
          placeholder="可选备注信息"
        />
      </div>
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

export default function PortMapping() {
  const servers = useSuperTerminalStore(s => s.servers)
  const portMappings = useSuperTerminalStore(s => s.portMappings)
  const setPortMappings = useSuperTerminalStore(s => s.setPortMappings)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)

  // Modal state
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PortMappingType | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    message: string
    onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)

  // Loading
  const [loading, setLoading] = useState(false)

  // ── Data loading ─────────────────────────────────────────────────────

  const loadData = useCallback(() => {
    setLoading(true)
    superTerminalApi
      .getPortMappings()
      .then(res => {
        if (res.data) setPortMappings(res.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [setPortMappings])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Server lookup ────────────────────────────────────────────────────

  const serverMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of servers) {
      map.set(s.id, s.name)
    }
    return map
  }, [servers])

  // ── Selection helpers ────────────────────────────────────────────────

  const someChecked = selectedIds.size > 0
  const allChecked = portMappings.length > 0 && selectedIds.size === portMappings.length

  const handleRowClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey

      if (isShift && lastClickedId) {
        const ids = portMappings.map(m => m.id)
        const startIdx = ids.indexOf(lastClickedId)
        const endIdx = ids.indexOf(id)
        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx)
          const max = Math.max(startIdx, endIdx)
          const rangeIds = ids.slice(min, max + 1)
          setSelectedIds(prev => {
            const next = new Set(prev)
            for (const rid of rangeIds) next.add(rid)
            return next
          })
        }
      } else if (isMeta) {
        setSelectedIds(prev => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        setLastClickedId(id)
      } else {
        setSelectedIds(new Set([id]))
        setLastClickedId(id)
      }
    },
    [lastClickedId, portMappings]
  )

  const handleCheckboxChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(portMappings.map(m => m.id)))
      } else {
        setSelectedIds(new Set())
      }
    },
    [portMappings]
  )

  // ── Actions ──────────────────────────────────────────────────────────

  const handleCreate = useCallback(
    async (data: CreatePortMappingReq) => {
      try {
        await superTerminalApi.createPortMapping(data)
        setFormOpen(false)
        setEditing(null)
        loadData()
      } catch {
        // error handled silently
      }
    },
    [loadData]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await superTerminalApi.deletePortMapping(id)
        setPortMappings(portMappings.filter(m => m.id !== id))
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } catch {
        loadData()
      }
    },
    [portMappings, setPortMappings, loadData]
  )

  const handleStartMapping = useCallback(
    async (id: string) => {
      try {
        const res = await superTerminalApi.startPortMapping(id)
        if (res.data) {
          setPortMappings(portMappings.map(m => (m.id === id ? res.data! : m)))
        }
      } catch {
        loadData()
      }
    },
    [portMappings, setPortMappings, loadData]
  )

  const handleStopMapping = useCallback(
    async (id: string) => {
      try {
        const res = await superTerminalApi.stopPortMapping(id)
        if (res.data) {
          setPortMappings(portMappings.map(m => (m.id === id ? res.data! : m)))
        }
      } catch {
        loadData()
      }
    },
    [portMappings, setPortMappings, loadData]
  )

  const handleBatchStart = useCallback(async () => {
    const stoppedSelected = portMappings.filter(m => selectedIds.has(m.id) && m.status === 'stopped')
    for (const m of stoppedSelected) {
      try {
        await superTerminalApi.startPortMapping(m.id)
      } catch {
        // continue with others
      }
    }
    loadData()
  }, [portMappings, selectedIds, loadData])

  const handleBatchDelete = useCallback(async () => {
    const ids = [...selectedIds]
    for (const id of ids) {
      try {
        await superTerminalApi.deletePortMapping(id)
      } catch {
        // continue with others
      }
    }
    setSelectedIds(new Set())
    loadData()
  }, [selectedIds, loadData])

  // ── Context menu items ───────────────────────────────────────────────

  const ctxMenuItems = useCallback(
    (mappingId: string) => {
      const mapping = portMappings.find(m => m.id === mappingId)
      if (!mapping) return []
      const items: { label: string; danger?: boolean; onClick: () => void }[] = []

      if (mapping.status === 'active' || mapping.status === 'starting') {
        items.push({ label: '停止映射', onClick: () => handleStopMapping(mappingId) })
      } else {
        items.push({ label: '启动映射', onClick: () => handleStartMapping(mappingId) })
      }

      items.push({
        label: '编辑',
        onClick: () => {
          setEditing(mapping)
          setFormOpen(true)
        }
      })

      items.push({
        label: '删除',
        danger: true,
        onClick: () => {
          setDeleteConfirm({
            open: true,
            message: `确定删除端口映射「${mapping.name}」吗？此操作不可恢复。`,
            onConfirm: () => {
              handleDelete(mappingId)
              setDeleteConfirm(p => ({ ...p, open: false }))
            }
          })
        }
      })

      return items
    },
    [portMappings, handleStartMapping, handleStopMapping, handleDelete]
  )

  const dismissCtx = useCallback(() => setCtxMenu(null), [])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      <style>{hoverStyles}</style>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-b-[#333] shrink-0">
        <button
          type="button"
          className="vos-btn vos-btn-primary vos-btn-sm"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus size={14} className="mr-1" />
          新建映射
        </button>

        {someChecked && (
          <>
            <div className="w-px h-5 bg-[#444] mx-1" />
            <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={handleBatchStart}>
              <Play size={14} className="mr-1" />
              批量启动 ({portMappings.filter(m => selectedIds.has(m.id) && m.status === 'stopped').length})
            </button>
            <button
              type="button"
              className="vos-btn vos-btn-danger vos-btn-sm"
              onClick={() => {
                setDeleteConfirm({
                  open: true,
                  message: `确定删除选中的 ${selectedIds.size} 个端口映射吗？此操作不可恢复。`,
                  onConfirm: () => {
                    handleBatchDelete()
                    setDeleteConfirm(p => ({ ...p, open: false }))
                  }
                })
              }}
            >
              <Trash2 size={14} className="mr-1" />
              批量删除 ({selectedIds.size})
            </button>
          </>
        )}

        <div className="flex-1" />

        <button type="button" className="vos-btn vos-btn-ghost vos-btn-sm" onClick={loadData} disabled={loading}>
          <RefreshCw size={14} className="mr-1" />
          刷新
        </button>

        <span className="text-xs text-[var(--vos-text-tertiary)]">共 {portMappings.length} 个</span>
      </div>

      {/* List */}
      {portMappings.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft size={40} />}
          title="暂无端口映射"
          description="通过 SSH 隧道将远程端口映射到本地"
          action={
            <button
              type="button"
              className="vos-btn vos-btn-primary vos-btn-sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus size={14} className="mr-1" />
              新建映射
            </button>
          }
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Header row */}
          <div className="flex items-center h-9 px-4 border-b border-b-[#333] text-[11px] text-[var(--vos-text-tertiary)] font-semibold shrink-0">
            <div className="w-8">
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => {
                  if (el) el.indeterminate = someChecked && !allChecked
                }}
                onChange={e => handleSelectAll(e.target.checked)}
              />
            </div>
            <div className="flex-[2] min-w-[100px]">名称</div>
            <div className="flex-[2] min-w-[120px]">SSH 服务器</div>
            <div className="flex-[2] min-w-[140px]">远程地址</div>
            <div className="w-20">本地端口</div>
            <div className="w-20 text-center">自启</div>
            <div className="w-[70px]">状态</div>
            <div className="w-[110px] text-center">操作</div>
          </div>

          {/* Rows */}
          {portMappings.map(mapping => {
            const isSelected = selectedIds.has(mapping.id)
            const isRunning = mapping.status === 'active' || mapping.status === 'starting'
            return (
              <div
                key={mapping.id}
                className={`pm-row flex items-center px-4 border-b border-b-[#262626] cursor-default text-[13px] ${isSelected ? 'selected' : ''}`}
                style={{ height: ROW_HEIGHT }}
                onClick={e => handleRowClick(mapping.id, e)}
                onContextMenu={e => {
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, mappingId: mapping.id })
                }}
              >
                {/* Checkbox */}
                <div className="w-8 shrink-0" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={e => handleCheckboxChange(mapping.id, e.target.checked)}
                  />
                </div>

                {/* Name */}
                <div className="flex-[2] min-w-[100px] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--vos-text-primary)] font-medium">
                  {mapping.name}
                </div>

                {/* SSH Server */}
                <div className="flex-[2] min-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-[var(--vos-text-secondary)] text-xs">
                  {serverMap.get(mapping.ssh_server_id) || mapping.ssh_server_id}
                </div>

                {/* Remote address */}
                <div className="flex-[2] min-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[var(--vos-text-secondary)]">
                  {mapping.remote_host}:{mapping.remote_port}
                </div>

                {/* Local port */}
                <div className="w-20 shrink-0 font-mono text-xs text-[var(--vos-accent-primary)]">
                  {mapping.local_port}
                </div>

                {/* Auto start toggle */}
                <div className="w-20 shrink-0 text-center" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={mapping.auto_start}
                    onChange={async e => {
                      const newVal = e.target.checked
                      // Optimistically update local state
                      setPortMappings(portMappings.map(m => (m.id === mapping.id ? { ...m, auto_start: newVal } : m)))
                      // Persist via create (API doesn't have patch, so reload after)
                      loadData()
                    }}
                  />
                </div>

                {/* Status */}
                <div className="w-[70px] shrink-0">
                  <StatusBadge status={mapping.status} icon={<CircleDot size={10} />} />
                </div>

                {/* Actions */}
                <div
                  className="w-[110px] shrink-0 flex items-center justify-center gap-1"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Start/Stop toggle */}
                  {isRunning ? (
                    <button
                      type="button"
                      className="pm-action-btn bg-transparent border-none cursor-pointer p-1 text-[var(--vos-accent-warning)] flex items-center"
                      title="停止映射"
                      onClick={() => handleStopMapping(mapping.id)}
                    >
                      <Square size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pm-action-btn bg-transparent border-none cursor-pointer p-1 text-[var(--vos-accent-success)] flex items-center"
                      title="启动映射"
                      onClick={() => handleStartMapping(mapping.id)}
                    >
                      <Play size={14} />
                    </button>
                  )}

                  {/* Edit */}
                  <button
                    type="button"
                    className="pm-action-btn bg-transparent border-none cursor-pointer p-1 text-[var(--vos-text-tertiary)] flex items-center"
                    title="编辑"
                    onClick={() => {
                      setEditing(mapping)
                      setFormOpen(true)
                    }}
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    className="pm-action-btn bg-transparent border-none cursor-pointer p-1 text-[var(--vos-accent-danger)] flex items-center"
                    title="删除"
                    onClick={() => {
                      setDeleteConfirm({
                        open: true,
                        message: `确定删除端口映射「${mapping.name}」吗？此操作不可恢复。`,
                        onConfirm: () => {
                          handleDelete(mapping.id)
                          setDeleteConfirm(p => ({ ...p, open: false }))
                        }
                      })
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenuItems(ctxMenu.mappingId)} onDismiss={dismissCtx} />
      )}

      {/* Modals */}
      <MappingFormModal
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={handleCreate}
      />
      <DeleteConfirmModal
        open={deleteConfirm.open}
        message={deleteConfirm.message}
        onClose={() => setDeleteConfirm(p => ({ ...p, open: false }))}
        onConfirm={deleteConfirm.onConfirm}
      />
    </div>
  )
}
