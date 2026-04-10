import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Spinner } from '@/components'
import { getFileIconByName } from '@/kernel/apps/file-icons'
import type { DirEntry, NewItemState } from '../../types'

// ─── Inline input for creating a new file/folder ───────────────────────────

function NewItemInput({
  depth,
  isDir,
  value,
  onChange,
  onConfirm,
  onCancel
}: {
  depth: number
  isDir: boolean
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])
  return (
    <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: 8 + depth * 12, paddingRight: 6 }}>
      {isDir ? (
        <Folder size={12} style={{ flexShrink: 0, color: '#e8a320' }} />
      ) : (
        <File size={12} style={{ flexShrink: 0, color: 'var(--vos-text-tertiary)' }} />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 ml-1 px-1 text-xs outline-none rounded"
        style={{
          background: 'var(--vos-bg-input)',
          color: 'var(--vos-text-primary)',
          border: '1px solid var(--vos-accent-primary)',
          height: 18
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            onConfirm()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
          e.stopPropagation()
        }}
        onBlur={onCancel}
      />
    </div>
  )
}

// ─── Single File Tree Node (recursive) ─────────────────────────────────────

interface FileTreeNodeProps {
  entry: DirEntry
  depth: number
  activeFilePath: string | null
  renamingPath: string | null
  renameValue: string
  newItem: NewItemState | null
  onSelect: (entry: DirEntry) => void
  onExpand: (entry: DirEntry) => void
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void
  onRenameChange: (v: string) => void
  onRenameConfirm: (entry: DirEntry, value: string) => void
  onRenameCancel: () => void
  onNewItemChange: (v: string) => void
  onNewItemConfirm: (parentPath: string, isDir: boolean, value: string) => void
  onNewItemCancel: () => void
  /** Double-click to pin preview tab */
  onDoubleClick?: (entry: DirEntry) => void
}

export default function FileTreeNode({
  entry,
  depth,
  activeFilePath,
  renamingPath,
  renameValue,
  newItem,
  onSelect,
  onExpand,
  onContextMenu,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onNewItemChange,
  onNewItemConfirm,
  onNewItemCancel,
  onDoubleClick
}: FileTreeNodeProps) {
  const isActive = !entry.is_dir && activeFilePath === entry.path
  const isRenaming = renamingPath === entry.path
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming)
      requestAnimationFrame(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      })
  }, [isRenaming])

  // Resolve file icon
  const fileIconInfo = !entry.is_dir ? getFileIconByName(entry.name) : null
  const FileIconComp = fileIconInfo?.icon

  return (
    <>
      <div
        role="button"
        tabIndex={-1}
        className="flex items-center gap-1 cursor-pointer select-none group"
        style={{
          paddingLeft: 8 + depth * 12,
          paddingTop: 2,
          paddingBottom: 2,
          paddingRight: 6,
          background: isActive ? 'var(--vos-accent-primary)' : 'transparent',
          color: isActive ? '#fff' : 'var(--vos-text-secondary)',
          fontSize: 12.5
        }}
        onMouseEnter={e => {
          if (!isActive) e.currentTarget.style.background = 'var(--vos-bg-item-hover)'
        }}
        onMouseLeave={e => {
          if (!isActive) e.currentTarget.style.background = 'transparent'
        }}
        onClick={() => (entry.is_dir ? onExpand(entry) : onSelect(entry))}
        onDoubleClick={() => !entry.is_dir && onDoubleClick?.(entry)}
        onContextMenu={e => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e, entry)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') entry.is_dir ? onExpand(entry) : onSelect(entry)
        }}
      >
        {entry.is_dir ? (
          <>
            <ChevronRight
              size={11}
              style={{
                flexShrink: 0,
                transition: 'transform 0.1s',
                transform: entry.expanded ? 'rotate(90deg)' : 'none'
              }}
            />
            {entry.expanded ? (
              <FolderOpen size={12} style={{ flexShrink: 0, color: isActive ? '#fff' : '#e8a320' }} />
            ) : (
              <Folder size={12} style={{ flexShrink: 0, color: isActive ? '#fff' : '#e8a320' }} />
            )}
          </>
        ) : (
          <>
            <span style={{ width: 11, flexShrink: 0 }} />
            {FileIconComp ? (
              <FileIconComp size={12} style={{ flexShrink: 0, color: isActive ? '#fff' : fileIconInfo.color }} />
            ) : (
              <File size={12} style={{ flexShrink: 0, color: isActive ? '#fff' : 'var(--vos-text-tertiary)' }} />
            )}
          </>
        )}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            className="flex-1 ml-1 px-1 text-xs outline-none rounded"
            style={{
              background: 'var(--vos-bg-input)',
              color: 'var(--vos-text-primary)',
              border: '1px solid var(--vos-accent-primary)',
              height: 18
            }}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onRenameConfirm(entry, renameValue)
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onRenameCancel()
              }
              e.stopPropagation()
            }}
            onBlur={() => onRenameCancel()}
          />
        ) : (
          <span className="truncate flex-1 ml-1">{entry.name}</span>
        )}
        {entry.loading && <Spinner size={10} />}
      </div>

      {/* New item input inside this directory */}
      {entry.is_dir && entry.expanded && newItem && newItem.parentPath === entry.path && (
        <NewItemInput
          depth={depth + 1}
          isDir={newItem.isDir}
          value={newItem.value}
          onChange={onNewItemChange}
          onConfirm={() => onNewItemConfirm(newItem.parentPath, newItem.isDir, newItem.value)}
          onCancel={onNewItemCancel}
        />
      )}

      {entry.is_dir &&
        entry.expanded &&
        entry.children &&
        entry.children.map(child => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            activeFilePath={activeFilePath}
            renamingPath={renamingPath}
            renameValue={renameValue}
            newItem={newItem}
            onSelect={onSelect}
            onExpand={onExpand}
            onContextMenu={onContextMenu}
            onRenameChange={onRenameChange}
            onRenameConfirm={onRenameConfirm}
            onRenameCancel={onRenameCancel}
            onNewItemChange={onNewItemChange}
            onNewItemConfirm={onNewItemConfirm}
            onNewItemCancel={onNewItemCancel}
            onDoubleClick={onDoubleClick}
          />
        ))}
    </>
  )
}

export { NewItemInput }
