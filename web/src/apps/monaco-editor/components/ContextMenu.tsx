import { Copy, FilePlus, FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import type { ContextMenuInfo, DirEntry } from '../types'

type MenuItem = { label: string; icon: React.ReactNode; action: () => void } | { separator: true }

interface Props {
  info: ContextMenuInfo
  hasWorkspace: boolean
  onNewFile: (parentPath: string) => void
  onNewFolder: (parentPath: string) => void
  onRename: (entry: DirEntry) => void
  onDelete: (entry: DirEntry) => void
  onCopyPath: (path: string) => void
  onRefresh: () => void
  onClose: () => void
}

export default function ContextMenu({
  info,
  hasWorkspace,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopyPath,
  onRefresh,
  onClose
}: Props) {
  const entry = info.entry
  const targetPath = entry?.path ?? ''

  const items: MenuItem[] = [
    ...(!entry || entry.is_dir
      ? [
          {
            label: '新建文件',
            icon: <FilePlus size={13} />,
            action: () => {
              onNewFile(targetPath)
              onClose()
            }
          },
          {
            label: '新建文件夹',
            icon: <FolderPlus size={13} />,
            action: () => {
              onNewFolder(targetPath)
              onClose()
            }
          },
          { separator: true as const }
        ]
      : []),
    ...(entry
      ? [
          {
            label: '重命名',
            icon: <span className="w-[13px] inline-block" />,
            action: () => {
              onRename(entry)
              onClose()
            }
          },
          {
            label: '删除',
            icon: <Trash2 size={13} />,
            action: () => {
              onDelete(entry)
              onClose()
            }
          },
          { separator: true as const },
          {
            label: '复制路径',
            icon: <Copy size={13} />,
            action: () => {
              onCopyPath(entry.path)
              onClose()
            }
          }
        ]
      : []),
    ...(hasWorkspace
      ? [
          {
            label: '刷新',
            icon: <RefreshCw size={13} />,
            action: () => {
              onRefresh()
              onClose()
            }
          }
        ]
      : [])
  ]

  return (
    <div className="fixed inset-0 z-50 bg-transparent" onMouseDown={onClose}>
      <div
        className="absolute flex flex-col py-1 rounded shadow-2xl min-w-[160px] bg-[var(--vos-bg-context-menu)] border border-[var(--vos-border-subtle)] z-[1000]"
        style={{
          left: info.x,
          top: info.y
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {items.map((item, i) =>
          'separator' in item ? (
            <div key={`sep-${i}`} className="h-px bg-[var(--vos-border-subtle)] my-[3px]" />
          ) : (
            <button
              key={`item-${i}`}
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-left w-full bg-transparent border-none cursor-pointer text-[var(--vos-text-primary)]"
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--vos-bg-item-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={item.action}
            >
              <span className="text-[var(--vos-text-tertiary)] w-4 flex items-center">
                {item.icon}
              </span>
              {item.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
