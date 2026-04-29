import {
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  Key,
  Plus,
  RefreshCw,
  Search,
  Send,
  Terminal,
  X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VList } from 'virtua'
import { AppLayout, AppSidebar, EmptyState, Modal, SectionHeader, Spinner } from '@/components'
import { FormInput, FormSelect } from '@/components/ui'
import { PathPickerInput } from '@/shell/FilePicker'
import type { AppComponentProps } from '@/kernel'
import { useAppStateSync, useAppStorage, useEventHandler } from '@/kernel'
import type { OpenRedisPayload } from '@/kernel'
import { createLogger } from '@/infra/logger'
import type { CreateRedisConnectionReq, RedisConnectionConfig, RedisKeyInfo, RedisKeyValue } from './api'
import { redisApi } from './api'

const logger = createLogger('redis/ipc')

// ─── Local Context Menu ────────────────────────────────────────────────────

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
          className="py-[5px] px-[14px] cursor-pointer text-xs whitespace-nowrap hover:bg-[var(--vos-bg-item-hover)]"
          style={{ color: item.danger ? '#f14c4c' : 'var(--vos-text-primary)' }}
          onClick={() => {
            item.action()
            onDismiss()
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}

// ─── Trie Tree for key grouping ────────────────────────────────────────────

interface TrieNode {
  name: string // segment name (e.g. "user")
  fullKey: string // full path joined by delimiter (e.g. "auth:user")
  children: Map<string, TrieNode>
  isLeaf: boolean // true if this is an actual key
  leafCount: number // total key count under this node
  keyInfo?: RedisKeyInfo
}

function buildTrie(keys: RedisKeyInfo[], delimiter = ':'): TrieNode {
  const root: TrieNode = { name: '', fullKey: '', children: new Map(), isLeaf: false, leafCount: 0 }

  for (const ki of keys) {
    const parts = ki.key.split(delimiter)
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const fullKey = parts.slice(0, i + 1).join(delimiter)
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullKey,
          children: new Map(),
          isLeaf: false,
          leafCount: 0
        })
      }
      current = current.children.get(part)!
    }
    current.isLeaf = true
    current.keyInfo = ki
  }

  // Count leaves
  function countLeaves(node: TrieNode): number {
    if (node.isLeaf && node.children.size === 0) {
      node.leafCount = 1
      return 1
    }
    let count = node.isLeaf ? 1 : 0
    for (const child of node.children.values()) {
      count += countLeaves(child)
    }
    node.leafCount = count
    return count
  }
  countLeaves(root)

  return root
}

// ─── Trie Tree Renderer ───────────────────────────────────────────────────

function TrieTreeView({
  node,
  depth,
  selectedKey,
  onSelect,
  expandedPaths,
  onToggle,
  onKeyContextMenu
}: {
  node: TrieNode
  depth: number
  selectedKey: string | null
  onSelect: (key: string) => void
  expandedPaths: Set<string>
  onToggle: (path: string) => void
  onKeyContextMenu?: (key: string, e: React.MouseEvent) => void
}) {
  const sorted = useMemo(
    () =>
      Array.from(node.children.values()).sort((a, b) => {
        // Folders first
        if (a.children.size > 0 && b.children.size === 0) return -1
        if (a.children.size === 0 && b.children.size > 0) return 1
        return a.name.localeCompare(b.name)
      }),
    [node.children]
  )

  return (
    <>
      {sorted.map(child => {
        const isFolder = child.children.size > 0 && !child.isLeaf
        const isFolderWithLeaf = child.children.size > 0 && child.isLeaf
        const isExpanded = expandedPaths.has(child.fullKey)
        const isSelected = selectedKey === child.fullKey

        return (
          <div key={child.fullKey}>
            <div
              className="flex items-center gap-1 px-2 cursor-pointer rounded-[3px] mx-1 text-xs py-[2px]"
              style={{
                paddingLeft: 8 + depth * 14,
                background: isSelected ? 'var(--vos-accent-primary)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--vos-text-primary)'
              }}
              onClick={() => {
                if (isFolder || isFolderWithLeaf) {
                  onToggle(child.fullKey)
                }
                if (child.isLeaf) {
                  onSelect(child.fullKey)
                } else if (isFolder) {
                  // If folder, don't select — just expand/collapse
                }
              }}
              onContextMenu={e => {
                if (child.isLeaf && onKeyContextMenu) {
                  e.preventDefault()
                  onKeyContextMenu(child.fullKey, e)
                }
              }}
            >
              {isFolder || isFolderWithLeaf ? (
                <>
                  {isExpanded ? (
                    <ChevronDown size={11} className="shrink-0" />
                  ) : (
                    <ChevronRight size={11} className="shrink-0" />
                  )}
                  <Folder
                    size={12}
                    className="shrink-0"
                    style={{ color: isSelected ? '#fff' : 'var(--vos-accent-warning)' }}
                  />
                </>
              ) : (
                <>
                  <span className="w-[11px] shrink-0" />
                  <Key
                    size={12}
                    className="shrink-0"
                    style={{ color: isSelected ? '#fff' : 'var(--vos-text-tertiary)' }}
                  />
                </>
              )}
              <span className="flex-1 truncate font-mono">{child.name}</span>
              {(isFolder || isFolderWithLeaf) && <span className="text-[9px] opacity-60">{child.leafCount}</span>}
              {child.keyInfo && (
                <span className="font-mono text-[9px] opacity-50 shrink-0">{child.keyInfo.key_type}</span>
              )}
            </div>
            {isExpanded && (isFolder || isFolderWithLeaf) && (
              <TrieTreeView
                node={child}
                depth={depth + 1}
                selectedKey={selectedKey}
                onSelect={onSelect}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onKeyContextMenu={onKeyContextMenu}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// ─── Connection form ───────────────────────────────────────────────────────

function ConnForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: RedisConnectionConfig) => void }) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('6379')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const [useSsh, setUseSsh] = useState(false)
  const [sshHost, setSshHost] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [sshUsername, setSshUsername] = useState('')
  const [sshAuthMethod, setSshAuthMethod] = useState<'password' | 'publickey'>('password')
  const [sshPassword, setSshPassword] = useState('')
  const [sshIdentityFile, setSshIdentityFile] = useState('')
  const [sshPassphrase, setSshPassphrase] = useState('')

  const submit = async () => {
    if (!name) return
    setSaving(true)
    try {
      const body: CreateRedisConnectionReq = {
        name,
        host,
        port: Number(port),
        password: password || undefined
      }
      if (useSsh) {
        body.ssh = {
          enabled: true,
          host: sshHost,
          port: Number(sshPort),
          username: sshUsername,
          authMethod: sshAuthMethod,
          password: sshAuthMethod === 'password' ? sshPassword || undefined : undefined,
          identityFilePath: sshAuthMethod === 'publickey' ? sshIdentityFile || undefined : undefined,
          passphrase: sshAuthMethod === 'publickey' ? sshPassphrase || undefined : undefined,
          savePassword: false
        }
      }
      const res = await redisApi.createRedisConnection(body)
      onCreated(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="新建 Redis 连接"
      width={420}
      footer={
        <>
          <button type="button" className="vos-btn vos-btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-sm vos-btn-primary" onClick={submit} disabled={saving}>
            {saving ? '创建中…' : '创建'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormInput placeholder="连接名称" value={name} onChange={e => setName(e.target.value)} />
        <div className="flex gap-2">
          <div className="flex-[3]">
            <FormInput placeholder="Host" value={host} onChange={e => setHost(e.target.value)} />
          </div>
          <div className="w-[60px]">
            <FormInput placeholder="Port" value={port} onChange={e => setPort(e.target.value)} />
          </div>
        </div>
        <FormInput
          placeholder="密码（可选）"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--vos-text-primary)' }}>
          <input type="checkbox" checked={useSsh} onChange={e => setUseSsh(e.target.checked)} />
          使用 SSH 隧道
        </label>

        {useSsh && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="flex-[3]">
                <FormInput placeholder="SSH 主机" value={sshHost} onChange={e => setSshHost(e.target.value)} />
              </div>
              <div className="w-[60px]">
                <FormInput placeholder="端口" value={sshPort} onChange={e => setSshPort(e.target.value)} />
              </div>
            </div>
            <FormInput placeholder="SSH 用户名" value={sshUsername} onChange={e => setSshUsername(e.target.value)} />
            <FormSelect value={sshAuthMethod} onChange={e => setSshAuthMethod(e.target.value as 'password' | 'publickey')}>
              <option value="password">密码</option>
              <option value="publickey">公钥</option>
            </FormSelect>
            {sshAuthMethod === 'password' ? (
              <FormInput
                type="password"
                placeholder="SSH 密码"
                value={sshPassword}
                onChange={e => setSshPassword(e.target.value)}
              />
            ) : (
              <>
                <PathPickerInput
                  mode="file"
                  placeholder="选择私钥文件"
                  value={sshIdentityFile}
                  onChange={setSshIdentityFile}
                />
                <FormInput
                  type="password"
                  placeholder="私钥口令（可选）"
                  value={sshPassphrase}
                  onChange={e => setSshPassphrase(e.target.value)}
                />
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Add Key Modal ─────────────────────────────────────────────────────────

function AddKeyModal({
  connId,
  onClose,
  onAdded
}: {
  connId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [keyName, setKeyName] = useState('')
  const [keyType, setKeyType] = useState('string')
  const [value, setValue] = useState('')
  const [field, setField] = useState('')
  const [score, setScore] = useState('0')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!keyName) return
    setSaving(true)
    try {
      let cmd = ''
      switch (keyType) {
        case 'string':
          cmd = `SET ${keyName} ${value}`
          break
        case 'hash':
          cmd = `HSET ${keyName} ${field} ${value}`
          break
        case 'list':
          cmd = `LPUSH ${keyName} ${value}`
          break
        case 'set':
          cmd = `SADD ${keyName} ${value}`
          break
        case 'zset':
          cmd = `ZADD ${keyName} ${score} ${value}`
          break
        case 'stream':
          cmd = `XADD ${keyName} * ${field} ${value}`
          break
        default:
          cmd = `SET ${keyName} ${value}`
      }
      await redisApi.executeRedisCommand(connId, cmd)
      onAdded()
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const typeNeedsField = keyType === 'hash' || keyType === 'stream'
  const typeNeedsScore = keyType === 'zset'
  const valueLabel =
    keyType === 'zset'
      ? 'Member'
      : keyType === 'hash' || keyType === 'stream'
        ? 'Value'
        : 'Value'

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="新建 Key"
      width={380}
      footer={
        <>
          <button type="button" className="vos-btn vos-btn-sm" onClick={onClose}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-sm vos-btn-primary" onClick={submit} disabled={saving || !keyName}>
            {saving ? '创建中…' : '创建'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormInput placeholder="Key 名称" value={keyName} onChange={e => setKeyName(e.target.value)} />
        <FormSelect value={keyType} onChange={e => setKeyType(e.target.value)}>
          <option value="string">String</option>
          <option value="hash">Hash</option>
          <option value="list">List</option>
          <option value="set">Set</option>
          <option value="zset">ZSet</option>
          <option value="stream">Stream</option>
        </FormSelect>
        {typeNeedsField && (
          <FormInput placeholder="Field" value={field} onChange={e => setField(e.target.value)} />
        )}
        {typeNeedsScore && (
          <FormInput
            placeholder="Score"
            type="number"
            value={score}
            onChange={e => setScore(e.target.value)}
          />
        )}
        <FormInput placeholder={valueLabel} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      </div>
    </Modal>
  )
}

// ─── Value Viewer ──────────────────────────────────────────────────────────

function StringViewer({ kv, connId, onRefresh }: { kv: RedisKeyValue; connId: string; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(typeof kv.value === 'string' ? kv.value : '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await redisApi.executeRedisCommand(connId, `SET ${kv.key} ${draft}`)
      setEditing(false)
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }
  if (editing) {
    return (
      <div className="flex-1 flex flex-col p-3 gap-2">
        <textarea
          className="vos-input vos-input-sm font-mono flex-1 resize-none"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <div className="flex gap-2 justify-end flex-shrink-0">
          <button type="button" className="vos-btn vos-btn-sm" onClick={() => setEditing(false)}>
            取消
          </button>
          <button type="button" className="vos-btn vos-btn-sm vos-btn-primary" disabled={saving} onClick={save}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap text-[var(--vos-text-primary)]">
        {typeof kv.value === 'string' ? kv.value : JSON.stringify(kv.value, null, 2)}
      </div>
      <div className="flex-shrink-0 flex justify-end px-3 pb-3">
        <button
          type="button"
          className="vos-btn vos-btn-sm"
          onClick={() => {
            setDraft(typeof kv.value === 'string' ? kv.value : '')
            setEditing(true)
          }}
        >
          编辑
        </button>
      </div>
    </div>
  )
}

function HashViewer({ kv, connId, onRefresh }: { kv: RedisKeyValue; connId: string; onRefresh: () => void }) {
  const entries = useMemo(() => Object.entries((kv.value as Record<string, string>) ?? {}), [kv.value])
  const [newField, setNewField] = useState('')
  const [newVal, setNewVal] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; field: string; value: string } | null>(null)

  const delField = async (field: string) => {
    await redisApi.executeRedisCommand(connId, `HDEL ${kv.key} ${field}`)
    onRefresh()
  }
  const addField = async () => {
    if (!newField) return
    setAdding(true)
    try {
      await redisApi.executeRedisCommand(connId, `HSET ${kv.key} ${newField} ${newVal}`)
      setNewField('')
      setNewVal('')
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }
  const startEdit = (field: string, value: string) => {
    setEditingField(field)
    setEditValue(value)
  }
  const saveEdit = async (field: string) => {
    setSavingField(field)
    try {
      await redisApi.executeRedisCommand(connId, `HSET ${kv.key} ${field} ${editValue}`)
      setEditingField(null)
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingField(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 text-xs bg-[var(--vos-bg-surface)]">
        <div className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)]">
          <div className="px-3 py-1.5 text-left font-medium w-[30%]">Field</div>
          <div className="px-3 py-1.5 text-left font-medium flex-1">Value</div>
        </div>
      </div>
      {/* Virtualized body */}
      <VList className="text-xs flex-1">
        {entries.map(([f, v]) => (
          <div key={f} className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)] items-center">
            <div className="px-3 py-1.5 font-mono text-[var(--vos-accent-primary)] w-[30%]">{f}</div>
            {editingField === f ? (
              <>
                <FormInput
                  className="font-mono flex-1 text-[11px] mx-1"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveEdit(f)}
                  autoFocus
                />
                <div className="px-1 w-12 flex gap-1 justify-end">
                  <button
                    type="button"
                    className="vos-btn-reset text-[var(--vos-text-tertiary)]"
                    onClick={() => setEditingField(null)}
                  >
                    <X size={11} />
                  </button>
                  <button
                    type="button"
                    className="vos-btn-reset text-[var(--vos-accent-primary)]"
                    disabled={savingField === f}
                    onClick={() => saveEdit(f)}
                  >
                    {savingField === f ? <Spinner size={10} /> : <Check size={11} />}
                  </button>
                </div>
              </>
            ) : (
              <div
                className="px-3 py-1.5 font-mono flex-1 break-all cursor-context-menu"
                onContextMenu={e => {
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, field: f, value: v })
                }}
              >
                {v}
              </div>
            )}
          </div>
        ))}
      </VList>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            { label: '编辑', action: () => startEdit(ctxMenu.field, ctxMenu.value) },
            { label: '删除', danger: true, action: () => delField(ctxMenu.field) }
          ]}
          onDismiss={() => setCtxMenu(null)}
        />
      )}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 [border-top:0.5px_solid_var(--vos-border-subtle)]">
        <FormInput
          className="font-mono text-[11px] flex-[0_0_120px]"
          placeholder="Field"
          value={newField}
          onChange={e => setNewField(e.target.value)}
        />
        <FormInput
          className="font-mono flex-1 text-[11px]"
          placeholder="Value"
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addField()}
        />
        <button
          type="button"
          className="vos-btn vos-btn-sm vos-btn-primary"
          disabled={adding || !newField}
          onClick={addField}
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}

function ListViewer({ kv, connId, onRefresh }: { kv: RedisKeyValue; connId: string; onRefresh: () => void }) {
  const items = useMemo(() => (kv.value as string[]) ?? [], [kv.value])
  const [newItem, setNewItem] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; index: number; value: string } | null>(null)

  const delItem = async (val: string) => {
    await redisApi.executeRedisCommand(connId, `LREM ${kv.key} 1 ${val}`)
    onRefresh()
  }
  const addItem = async () => {
    if (!newItem) return
    setAdding(true)
    try {
      await redisApi.executeRedisCommand(connId, `RPUSH ${kv.key} ${newItem}`)
      setNewItem('')
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }
  const startEdit = (index: number, value: string) => {
    setEditingIndex(index)
    setEditValue(value)
  }
  const saveEdit = async (index: number) => {
    setSavingIndex(index)
    try {
      await redisApi.executeRedisCommand(connId, `LSET ${kv.key} ${index} ${editValue}`)
      setEditingIndex(null)
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingIndex(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 text-xs bg-[var(--vos-bg-surface)]">
        <div className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)]">
          <div className="px-3 py-1.5 text-left font-medium w-12">#</div>
          <div className="px-3 py-1.5 text-left font-medium flex-1">Value</div>
        </div>
      </div>
      {/* Virtualized body */}
      <VList className="text-xs flex-1">
        {items.map((v, i) => (
          <div key={`${i}-${v}`} className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)] items-center">
            <div className="px-3 py-1.5 font-mono text-[var(--vos-text-tertiary)] w-12">{i}</div>
            {editingIndex === i ? (
              <>
                <FormInput
                  className="font-mono flex-1 text-[11px] mx-1"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveEdit(i)}
                  autoFocus
                />
                <div className="px-1 w-12 flex gap-1 justify-end">
                  <button
                    type="button"
                    className="vos-btn-reset text-[var(--vos-text-tertiary)]"
                    onClick={() => setEditingIndex(null)}
                  >
                    <X size={11} />
                  </button>
                  <button
                    type="button"
                    className="vos-btn-reset text-[var(--vos-accent-primary)]"
                    disabled={savingIndex === i}
                    onClick={() => saveEdit(i)}
                  >
                    {savingIndex === i ? <Spinner size={10} /> : <Check size={11} />}
                  </button>
                </div>
              </>
            ) : (
              <div
                className="px-3 py-1.5 font-mono flex-1 break-all cursor-context-menu"
                onContextMenu={e => {
                  e.preventDefault()
                  setCtxMenu({ x: e.clientX, y: e.clientY, index: i, value: v })
                }}
              >
                {v}
              </div>
            )}
          </div>
        ))}
      </VList>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            { label: '编辑', action: () => startEdit(ctxMenu.index, ctxMenu.value) },
            { label: '删除', danger: true, action: () => delItem(ctxMenu.value) }
          ]}
          onDismiss={() => setCtxMenu(null)}
        />
      )}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 [border-top:0.5px_solid_var(--vos-border-subtle)]">
        <FormInput
          className="font-mono flex-1 text-[11px]"
          placeholder="新元素 (追加到末尾)"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
        />
        <button
          type="button"
          className="vos-btn vos-btn-sm vos-btn-primary"
          disabled={adding || !newItem}
          onClick={addItem}
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}

function SetViewer({ kv, connId, onRefresh }: { kv: RedisKeyValue; connId: string; onRefresh: () => void }) {
  const members = useMemo(() => (kv.value as string[]) ?? [], [kv.value])
  const [newMember, setNewMember] = useState('')
  const [adding, setAdding] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; member: string } | null>(null)

  const delMember = async (m: string) => {
    await redisApi.executeRedisCommand(connId, `SREM ${kv.key} ${m}`)
    onRefresh()
  }
  const addMember = async () => {
    if (!newMember) return
    setAdding(true)
    try {
      await redisApi.executeRedisCommand(connId, `SADD ${kv.key} ${newMember}`)
      setNewMember('')
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-3 flex flex-wrap gap-1.5 content-start">
        {members.map(m => (
          <div
            key={m}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-primary)] cursor-context-menu"
            onContextMenu={e => {
              e.preventDefault()
              setCtxMenu({ x: e.clientX, y: e.clientY, member: m })
            }}
          >
            {m}
          </div>
        ))}
        {members.length === 0 && <span className="text-xs text-[var(--vos-text-tertiary)]">空 Set</span>}
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            { label: '删除', danger: true, action: () => delMember(ctxMenu.member) }
          ]}
          onDismiss={() => setCtxMenu(null)}
        />
      )}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 [border-top:0.5px_solid_var(--vos-border-subtle)]">
        <FormInput
          className="font-mono flex-1 text-[11px]"
          placeholder="新成员"
          value={newMember}
          onChange={e => setNewMember(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addMember()}
        />
        <button
          type="button"
          className="vos-btn vos-btn-sm vos-btn-primary"
          disabled={adding || !newMember}
          onClick={addMember}
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}

function ZSetViewer({ kv, connId, onRefresh }: { kv: RedisKeyValue; connId: string; onRefresh: () => void }) {
  type ZEntry = { member: string; score: number }
  const entries = useMemo(() => {
    const v = kv.value
    if (Array.isArray(v)) {
      if (v.length === 0) return []
      // Case 1: Array of objects [{member, score}, ...]
      if (typeof v[0] === 'object' && v[0] !== null && 'member' in v[0]) {
        return v as ZEntry[]
      }
      // Case 2: Array of arrays [[member, score], ...] (Redis 8.x RESP3-like nested array)
      if (Array.isArray(v[0])) {
        return (v as unknown[][]).map(item => ({
          member: String(item[0] ?? ''),
          score: Number(item[1] ?? 0)
        }))
      }
      // Case 3: Flat array alternating [member, score, member, score]
      const r: ZEntry[] = []
      for (let i = 0; i < v.length - 1; i += 2) {
        r.push({ member: String(v[i]), score: Number(v[i + 1]) })
      }
      return r
    }
    // Case 4: Object/map format { "member1": score1, ... }
    if (typeof v === 'object' && v !== null) {
      return Object.entries(v as Record<string, unknown>).map(([member, score]) => ({
        member,
        score: Number(score)
      }))
    }
    return []
  }, [kv.value])
  const [newMember, setNewMember] = useState('')
  const [newScore, setNewScore] = useState('0')
  const [adding, setAdding] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; member: string } | null>(null)

  const delMember = async (m: string) => {
    await redisApi.executeRedisCommand(connId, `ZREM ${kv.key} ${m}`)
    onRefresh()
  }
  const addMember = async () => {
    if (!newMember) return
    setAdding(true)
    try {
      await redisApi.executeRedisCommand(connId, `ZADD ${kv.key} ${newScore} ${newMember}`)
      setNewMember('')
      setNewScore('0')
      onRefresh()
    } catch (e) {
      console.error(e)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 text-xs bg-[var(--vos-bg-surface)]">
        <div className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)]">
          <div className="px-3 py-1.5 text-left font-medium w-14">Score</div>
          <div className="px-3 py-1.5 text-left font-medium flex-1">Member</div>
        </div>
      </div>
      {/* Virtualized body */}
      <VList className="text-xs flex-1">
        {entries.map(e => (
          <div
            key={e.member}
            className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)] cursor-context-menu"
            onContextMenu={evt => {
              evt.preventDefault()
              setCtxMenu({ x: evt.clientX, y: evt.clientY, member: e.member })
            }}
          >
            <div className="px-3 py-1.5 font-mono text-[var(--vos-accent-primary)] w-14">{e.score}</div>
            <div className="px-3 py-1.5 font-mono flex-1 break-all">{e.member}</div>
          </div>
        ))}
      </VList>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            { label: '删除', danger: true, action: () => delMember(ctxMenu.member) }
          ]}
          onDismiss={() => setCtxMenu(null)}
        />
      )}
      <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 [border-top:0.5px_solid_var(--vos-border-subtle)]">
        <div className="w-14 shrink-0">
          <FormInput
            className="font-mono text-[11px] w-full"
            placeholder="Score"
            value={newScore}
            onChange={e => setNewScore(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMember()}
          />
        </div>
        <FormInput
          className="font-mono flex-1 text-[11px]"
          placeholder="Member"
          value={newMember}
          onChange={e => setNewMember(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addMember()}
        />
        <button
          type="button"
          className="vos-btn vos-btn-sm vos-btn-primary"
          disabled={adding || !newMember}
          onClick={addMember}
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}

function StreamViewer({ kv }: { kv: RedisKeyValue; connId: string; onRefresh: () => void }) {
  type StreamEntry = { id: string; fields: Record<string, string> }
  const entries = useMemo(() => {
    const v = kv.value
    if (!Array.isArray(v)) return []
    const result: StreamEntry[] = []
    for (const item of v) {
      if (!Array.isArray(item) || item.length < 2) continue
      const id = String(item[0])
      const rawFields = item[1]
      const fields: Record<string, string> = {}
      if (Array.isArray(rawFields)) {
        for (let i = 0; i + 1 < rawFields.length; i += 2) {
          fields[String(rawFields[i])] = String(rawFields[i + 1])
        }
      }
      result.push({ id, fields })
    }
    return result
  }, [kv.value])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 text-xs bg-[var(--vos-bg-surface)]">
        <div className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)]">
          <div className="px-3 py-1.5 text-left font-medium w-48">ID</div>
          <div className="px-3 py-1.5 text-left font-medium flex-1">Fields</div>
        </div>
      </div>
      <VList className="text-xs flex-1">
        {entries.map(e => (
          <div key={e.id} className="flex [border-bottom:0.5px_solid_var(--vos-border-subtle)]">
            <div className="px-3 py-1.5 font-mono text-[var(--vos-accent-primary)] w-48 shrink-0 truncate">{e.id}</div>
            <div className="px-3 py-1.5 flex-1">
              {Object.entries(e.fields).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="font-mono text-[var(--vos-text-tertiary)]">{k}</span>
                  <span className="font-mono text-[var(--vos-text-secondary)]">=</span>
                  <span className="font-mono break-all">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </VList>
      {entries.length === 0 && (
        <div className="flex items-center justify-center py-8 text-xs text-[var(--vos-text-tertiary)]">
          空 Stream
        </div>
      )}
    </div>
  )
}

function ValueViewer({
  kv,
  connId,
  onRefresh
}: {
  kv: RedisKeyValue
  connId: string
  onRefresh: () => void
}) {
  const TYPE_COLOR: Record<string, string> = {
    string: '#3b82f6',
    hash: '#f59e0b',
    list: '#10b981',
    set: '#8b5cf6',
    zset: '#ec4899',
    stream: '#06b6d4'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 bg-[var(--vos-bg-surface)] [border-bottom:0.5px_solid_var(--vos-border-subtle)]">
        <span className="text-xs font-mono font-medium flex-1 truncate">{kv.key}</span>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold"
          style={{
            background: `${TYPE_COLOR[kv.key_type] ?? '#6b7380'}22`,
            color: TYPE_COLOR[kv.key_type] ?? 'var(--vos-text-secondary)'
          }}
        >
          {kv.key_type.toUpperCase()}
        </span>
        {kv.encoding && <span className="text-[9px] text-[var(--vos-text-tertiary)]">{kv.encoding}</span>}
        {kv.ttl >= 0 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--vos-bg-item-hover)] text-[var(--vos-accent-warning)]">
            TTL: {kv.ttl}s
          </span>
        )}
        {kv.ttl === -1 && <span className="text-[10px] text-[var(--vos-text-tertiary)]">永久</span>}
      </div>
      {/* Type-specific content */}
      {kv.key_type === 'string' && <StringViewer kv={kv} connId={connId} onRefresh={onRefresh} />}
      {kv.key_type === 'hash' && <HashViewer kv={kv} connId={connId} onRefresh={onRefresh} />}
      {kv.key_type === 'list' && <ListViewer kv={kv} connId={connId} onRefresh={onRefresh} />}
      {kv.key_type === 'set' && <SetViewer kv={kv} connId={connId} onRefresh={onRefresh} />}
      {kv.key_type === 'zset' && <ZSetViewer kv={kv} connId={connId} onRefresh={onRefresh} />}
      {kv.key_type === 'stream' && <StreamViewer kv={kv} connId={connId} onRefresh={onRefresh} />}
      {!['string', 'hash', 'list', 'set', 'zset', 'stream'].includes(kv.key_type) && (
        <div className="flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap text-[var(--vos-text-primary)]">
          {typeof kv.value === 'string' ? kv.value : JSON.stringify(kv.value, null, 2)}
        </div>
      )}
    </div>
  )
}

// ─── IPC: Open Redis Handler ───────────────────────────────────────────────

/**
 * Handle open:redis events from other apps (e.g. K8s).
 * Creates or finds a connection, then auto-connects.
 */
function useOpenRedisHandler(opts: {
  connections: RedisConnectionConfig[]
  setConnections: React.Dispatch<React.SetStateAction<RedisConnectionConfig[]>>
  connectTo: (id: string) => Promise<void>
}) {
  const { connections, setConnections, connectTo } = opts

  const handleOpenRedis = useCallback(
    async (payload: OpenRedisPayload) => {
      logger.info('Received open:redis event', { host: payload.host, port: payload.port, connectionId: payload.connectionId })

      try {
        let connId = payload.connectionId

        if (!connId) {
          // Check if a connection with same host/port already exists
          const existing = connections.find(c => c.host === payload.host && c.port === payload.port)
          if (existing) {
            connId = existing.id
          } else {
            // Create new connection
            const body: CreateRedisConnectionReq = {
              name: payload.name ?? `Redis @ ${payload.host}:${payload.port}`,
              host: payload.host,
              port: payload.port,
              password: payload.password || undefined,
            }
            const res = await redisApi.createRedisConnection(body)
            connId = res.data.id
            setConnections(prev => [...prev, res.data])
          }
        }

        // Auto-connect if requested
        if (connId && payload.autoConnect !== false) {
          await connectTo(connId)
          logger.info('Auto-connected to Redis', { connId })
        }
      } catch (err) {
        logger.error('Failed to handle open:redis event', err)
      }
    },
    [connections, setConnections, connectTo]
  )

  useEventHandler('redis', 'open:redis', handleOpenRedis)
}

// ─── Main app ──────────────────────────────────────────────────────────────

export default function RedisApp({ windowId, initialAppState }: AppComponentProps) {
  const storage = useAppStorage('redis')
  const [connections, setConnections] = useState<RedisConnectionConfig[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showAddKey, setShowAddKey] = useState(false)
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set())
  const [selectedConn, setSelectedConn] = useState<string | null>(
    () => (initialAppState?.selectedConnId as string) ?? null
  )
  const [pattern, setPattern] = useState((initialAppState?.pattern as string) ?? '*')
  const [keys, setKeys] = useState<RedisKeyInfo[]>([])
  const [selectedKey, setSelectedKey] = useState<RedisKeyValue | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set((initialAppState?.expandedPaths as string[]) ?? [])
  )
  const [currentDb, setCurrentDb] = useState(0)
  const [dbKeyCounts, setDbKeyCounts] = useState<Record<number, number>>({})
  const [connCtxMenu, setConnCtxMenu] = useState<{ x: number; y: number; connId: string } | null>(null)
  const [keyCtxMenu, setKeyCtxMenu] = useState<{ x: number; y: number; key: string } | null>(null)
  // CLI state
  const [cliMode, setCliMode] = useState((initialAppState?.cliMode as boolean) ?? false)
  const [cliInput, setCliInput] = useState('')
  const [cliHistory, setCliHistory] = useState<{ cmd: string; result: string }[]>([])
  const cliRef = useRef<HTMLDivElement>(null)

  // Load persisted CLI history
  useEffect(() => {
    storage.getJSON<{ cliHistory?: { cmd: string; result: string }[] }>('preferences').then(prefs => {
      if (prefs?.cliHistory) setCliHistory(prefs.cliHistory)
    })
  }, [storage])

  // Sync app state to window manager
  useAppStateSync(
    windowId,
    {
      selectedConnId: selectedConn,
      pattern,
      expandedPaths: [...expandedPaths],
      cliMode
    },
    [selectedConn, pattern, expandedPaths, cliMode]
  )

  // Build trie from flat key list
  const trie = useMemo(() => buildTrie(keys, ':'), [keys])

  const reload = useCallback(async () => {
    try {
      const r = await redisApi.getRedisConnections()
      setConnections(r.data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const parseDbKeyCounts = (infoStr: string): Record<number, number> => {
    const counts: Record<number, number> = {}
    for (const line of infoStr.split('\n')) {
      const match = line.match(/^db(\d+):keys=(\d+)/)
      if (match) {
        counts[Number(match[1])] = Number(match[2])
      }
    }
    return counts
  }

  const fetchDbKeyCounts = async (connId: string) => {
    try {
      const r = await redisApi.executeRedisCommand(connId, 'INFO keyspace')
      const infoStr = typeof r.data.result === 'string' ? r.data.result : ''
      setDbKeyCounts(parseDbKeyCounts(infoStr))
    } catch (e) {
      console.error(e)
    }
  }

  const connectTo = async (id: string) => {
    setConnectingIds(s => new Set(s).add(id))
    try {
      await redisApi.connectRedis(id)
      setConnectedIds(s => new Set(s).add(id))
      setSelectedConn(id)
      await fetchDbKeyCounts(id)
      scanKeys(id, '*')
    } catch (e) {
      console.error(e)
    } finally {
      setConnectingIds(s => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }
  }

  // Register IPC event handler for cross-app Redis opening
  useOpenRedisHandler({ connections, setConnections, connectTo })

  const switchDb = async (db: number) => {
    if (!selectedConn) return
    try {
      await redisApi.executeRedisCommand(selectedConn, `SELECT ${db}`)
      setCurrentDb(db)
      scanKeys(selectedConn, pattern)
    } catch (e) {
      console.error(e)
    }
  }

  const disconnectFrom = async (id: string) => {
    await redisApi.disconnectRedis(id)
    setConnectedIds(s => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
    if (selectedConn === id) {
      setSelectedConn(null)
      setKeys([])
      setSelectedKey(null)
      setCurrentDb(0)
      setDbKeyCounts({})
    }
  }

  const deleteConn = async (id: string) => {
    await redisApi.deleteRedisConnection(id)
    reload()
  }

  const scanKeys = async (connId: string, pat: string) => {
    setLoading(true)
    setExpandedPaths(new Set())
    try {
      // Use SCAN with cursor-based iteration to load up to 1000 keys
      let cursor = '0'
      let allKeys: RedisKeyInfo[] = []
      let finished = false
      while (!finished && allKeys.length < 1000) {
        const r = await redisApi.scanRedisKeys(connId, cursor, pat, 200)
        allKeys = [...allKeys, ...r.data.keys]
        cursor = r.data.cursor
        finished = r.data.finished || cursor === '0'
      }
      setKeys(allKeys)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const selectKey = async (connId: string, key: string) => {
    setLoading(true)
    try {
      const r = await redisApi.getRedisKey(connId, key)
      setSelectedKey(r.data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const toggleTriePath = (path: string) => {
    setExpandedPaths(s => {
      const n = new Set(s)
      n.has(path) ? n.delete(path) : n.add(path)
      return n
    })
  }

  const runCmd = async () => {
    if (!selectedConn || !cliInput.trim()) return
    try {
      const r = await redisApi.executeRedisCommand(selectedConn, cliInput)
      const result = typeof r.data.result === 'string' ? r.data.result : JSON.stringify(r.data.result, null, 2)
      setCliHistory(h => {
        const next = [...h, { cmd: cliInput, result }]
        // Keep last 100 commands
        const trimmed = next.slice(-100)
        storage.setJSON('preferences', { cliHistory: trimmed })
        return trimmed
      })
      setCliInput('')
      setTimeout(() => cliRef.current?.scrollTo(0, cliRef.current.scrollHeight), 50)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <AppLayout
      sidebar={
        <AppSidebar width={180}>
          <SectionHeader
            title="连接"
            actions={
              <>
                <button type="button" className="vos-btn-reset text-[var(--vos-text-tertiary)]" onClick={reload}>
                  <RefreshCw size={11} />
                </button>
                <button
                  type="button"
                  className="vos-btn-reset text-[var(--vos-accent-primary)]"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={13} />
                </button>
              </>
            }
          />

          {connections.map(conn => {
            const connected = connectedIds.has(conn.id)
            const isConnecting = connectingIds.has(conn.id)
            const isActive = selectedConn === conn.id
            return (
              <div
                key={conn.id}
                className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-xs rounded my-px mx-1"
                style={{
                  background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--vos-text-primary)'
                }}
                onClick={() =>
                  connected ? (setSelectedConn(conn.id), scanKeys(conn.id, pattern)) : connectTo(conn.id)
                }
                onContextMenu={e => {
                  e.preventDefault()
                  setConnCtxMenu({ x: e.clientX, y: e.clientY, connId: conn.id })
                }}
              >
                {isConnecting ? (
                  <Spinner size={10} className="shrink-0" />
                ) : (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: connected
                        ? 'var(--vos-success)'
                        : isActive
                          ? 'rgba(255,255,255,0.6)'
                          : 'var(--vos-text-tertiary)'
                    }}
                  />
                )}
                <Database
                  size={12}
                  className="shrink-0"
                  style={{
                    color: isActive ? '#fff' : connected ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)'
                  }}
                />
                <span className="flex-1 truncate">{conn.name}</span>
                {connected && (
                  <span
                    className="text-[9px] opacity-60 shrink-0"
                    style={{ color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--vos-text-tertiary)' }}
                  >
                    已连接
                  </span>
                )}
              </div>
            )
          })}
          {connCtxMenu && (
            <ContextMenu
              x={connCtxMenu.x}
              y={connCtxMenu.y}
              items={[
                ...(connectedIds.has(connCtxMenu.connId)
                  ? [{ label: '断开连接', action: () => disconnectFrom(connCtxMenu.connId) }]
                  : [{ label: '连接', action: () => connectTo(connCtxMenu.connId) }]),
                { label: '删除连接', danger: true, action: () => deleteConn(connCtxMenu.connId) }
              ]}
              onDismiss={() => setConnCtxMenu(null)}
            />
          )}

          {connections.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--vos-text-tertiary)]">
              无连接
            </div>
          )}
        </AppSidebar>
      }
      overlay={
        <>
          {showForm && (
            <ConnForm
              onClose={() => setShowForm(false)}
              onCreated={c => {
                setConnections(p => [...p, c])
                setShowForm(false)
              }}
            />
          )}
          {showAddKey && selectedConn && (
            <AddKeyModal
              connId={selectedConn}
              onClose={() => setShowAddKey(false)}
              onAdded={() => {
                scanKeys(selectedConn, pattern)
              }}
            />
          )}
        </>
      }
    >
      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedConn && connectedIds.has(selectedConn) ? (
          <>
            {/* Key filter + mode toggle */}
            <div className="flex items-center gap-2 h-8 px-3 flex-shrink-0 bg-[var(--vos-bg-surface)] [border-bottom:0.5px_solid_var(--vos-border-subtle)]">
              <Search size={12} className="text-[var(--vos-text-tertiary)]" />
              <input
                className="flex-1 bg-transparent border-none outline-none text-xs text-[var(--vos-text-primary)]"
                placeholder="过滤模式 (如 user:*)"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && selectedConn) scanKeys(selectedConn, pattern)
                }}
              />
              <span className="text-[10px] text-[var(--vos-text-tertiary)]">{keys.length} keys</span>
              <button
                type="button"
                className="vos-btn-reset text-[var(--vos-text-tertiary)]"
                onClick={() => selectedConn && scanKeys(selectedConn, pattern)}
              >
                <RefreshCw size={11} />
              </button>
              <button
                type="button"
                className="vos-btn-reset text-[var(--vos-accent-primary)]"
                onClick={() => setShowAddKey(true)}
                title="新建 Key"
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded cursor-pointer border-none"
                style={{
                  background: cliMode ? 'var(--vos-accent-primary)' : 'var(--vos-bg-item-hover)',
                  color: cliMode ? '#fff' : 'var(--vos-text-secondary)'
                }}
                onClick={() => setCliMode(!cliMode)}
              >
                <Terminal size={12} />
              </button>
            </div>

            {cliMode ? (
              /* CLI */
              <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1a2e]">
                <div ref={cliRef} className="flex-1 overflow-auto p-3 font-mono text-xs text-[#e0e0e0]">
                  {cliHistory.map((h, i) => (
                    <div key={i} className="mb-2">
                      <div className="text-[#6ee7b7]">&gt; {h.cmd}</div>
                      <div className="whitespace-pre-wrap text-[#d1d5db]">{h.result}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-2 [border-top:1px_solid_#333]">
                  <span className="text-[#6ee7b7]">&gt;</span>
                  <input
                    className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-[#e0e0e0]"
                    value={cliInput}
                    onChange={e => setCliInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') runCmd()
                    }}
                    placeholder="输入 Redis 命令..."
                  />
                  <button type="button" className="vos-btn-reset text-[#6ee7b7]" onClick={runCmd}>
                    <Send size={12} />
                  </button>
                </div>
              </div>
            ) : (
              /* Key browser with trie tree */
              <div className="flex-1 flex overflow-hidden">
                {/* Key tree + DB selector */}
                <div className="flex flex-col w-[260px] [border-right:0.5px_solid_var(--vos-border-subtle)]">
                  <div className="flex-1 overflow-auto py-1">
                    {loading && keys.length === 0 && (
                      <div className="flex items-center justify-center py-4">
                        <Spinner size={16} />
                      </div>
                    )}
                    <TrieTreeView
                      node={trie}
                      depth={0}
                      selectedKey={selectedKey?.key ?? null}
                      onSelect={key => selectKey(selectedConn, key)}
                      expandedPaths={expandedPaths}
                      onToggle={toggleTriePath}
                      onKeyContextMenu={(key, e) => {
                        e.preventDefault()
                        setKeyCtxMenu({ x: e.clientX, y: e.clientY, key })
                      }}
                    />
                    {keyCtxMenu && (
                      <ContextMenu
                        x={keyCtxMenu.x}
                        y={keyCtxMenu.y}
                        items={[
                          { label: '删除 Key', danger: true, action: async () => {
                            await redisApi.deleteRedisKey(selectedConn, keyCtxMenu.key)
                            setSelectedKey(null)
                            scanKeys(selectedConn, pattern)
                          } }
                        ]}
                        onDismiss={() => setKeyCtxMenu(null)}
                      />
                    )}
                    {!loading && keys.length === 0 && (
                      <div className="flex items-center justify-center py-8 text-xs text-[var(--vos-text-tertiary)]">
                        无 Key
                      </div>
                    )}
                  </div>
                  {/* DB selector */}
                  <div className="flex-shrink-0 flex items-center gap-2 px-2 py-1.5 [border-top:0.5px_solid_var(--vos-border-subtle)]">
                    <span className="text-[10px] text-[var(--vos-text-secondary)] shrink-0">DB</span>
                    <select
                      className="vos-input vos-input-sm flex-1 text-[11px] h-6 min-h-0 py-0 px-1.5"
                      value={currentDb}
                      onChange={e => {
                        const db = Number(e.target.value)
                        switchDb(db)
                      }}
                    >
                      {Array.from({ length: 16 }, (_, i) => {
                        const count = dbKeyCounts[i] ?? 0
                        return (
                          <option key={i} value={i}>
                            db{i} ({count} keys)
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>

                {/* Value viewer */}
                {selectedKey ? (
                  <ValueViewer
                    kv={selectedKey}
                    connId={selectedConn}
                    onRefresh={() => selectKey(selectedConn, selectedKey.key)}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-[var(--vos-text-tertiary)]">
                    选择一个 Key 查看值
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <EmptyState icon={<Database size={48} />} title="Redis 管理" description="选择左侧连接或创建新连接" />
        )}
      </div>
    </AppLayout>
  )
}
