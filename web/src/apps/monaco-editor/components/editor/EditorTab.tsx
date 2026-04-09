import { X } from 'lucide-react'
import type React from 'react'

import { getFileIconByName } from '@/kernel/apps/file-icons'
import type { FileTab } from '../../types'

interface Props {
  tab: FileTab
  isActive: boolean
  isDirty: boolean
  index: number
  onActivate: () => void
  onClose: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onDragStart: (index: number) => void
  onDragOver: (index: number) => void
  onDragEnd: () => void
}

export default function EditorTab({
  tab,
  isActive,
  isDirty,
  index,
  onActivate,
  onClose,
  onDoubleClick,
  onDragStart,
  onDragOver,
  onDragEnd
}: Props) {
  const iconInfo = getFileIconByName(tab.node.name)
  const IconComp = iconInfo.icon

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      className="flex items-center gap-1.5 px-3 h-full flex-shrink-0 cursor-pointer text-xs group"
      style={{
        borderRight: '0.5px solid var(--vos-border-subtle)',
        background: isActive ? 'var(--vos-bg-window)' : 'transparent',
        color: isActive ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)',
        borderBottom: isActive ? '1px solid var(--vos-accent-primary)' : '1px solid transparent',
        minWidth: 80,
        maxWidth: 200,
        userSelect: 'none',
        fontStyle: tab.isPreview ? 'italic' : 'normal'
      }}
      onClick={onActivate}
      onDoubleClick={onDoubleClick}
      onAuxClick={e => {
        if (e.button === 1) onClose(e)
      }}
      onKeyDown={e => e.key === 'Enter' && onActivate()}
      onDragStart={() => onDragStart(index)}
      onDragOver={e => {
        e.preventDefault()
        onDragOver(index)
      }}
      onDragEnd={onDragEnd}
    >
      <IconComp size={11} style={{ flexShrink: 0, color: isActive ? iconInfo.color : 'var(--vos-text-tertiary)' }} />
      <span className="truncate flex-1">
        {isDirty && <span style={{ color: 'var(--vos-accent-warning)', marginRight: 2 }}>●</span>}
        {tab.node.name}
      </span>
      <button
        type="button"
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          ...(isDirty ? { opacity: 1 } : {})
        }}
        onClick={onClose}
        title="关闭"
      >
        <X size={11} />
      </button>
    </div>
  )
}
