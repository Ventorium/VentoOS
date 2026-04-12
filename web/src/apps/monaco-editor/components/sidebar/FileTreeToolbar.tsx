import { FilePlus, FolderPlus, RefreshCw } from 'lucide-react'

interface Props {
  workspaceName: string
  onNewFile: () => void
  onNewFolder: () => void
  onRefresh: () => void
}

export default function FileTreeToolbar({ workspaceName, onNewFile, onNewFolder, onRefresh }: Props) {
  return (
    <>
      <div
        className="px-3 py-1.5 flex items-center justify-between flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]"
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest truncate text-[var(--vos-text-tertiary)]"
        >
          资源管理器
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {[
            { title: '新建文件', icon: <FilePlus size={13} />, onClick: onNewFile },
            { title: '新建文件夹', icon: <FolderPlus size={13} />, onClick: onNewFolder },
            { title: '刷新', icon: <RefreshCw size={13} />, onClick: onRefresh }
          ].map(btn => (
            <button
              key={btn.title}
              type="button"
              title={btn.title}
              onClick={btn.onClick}
              className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-[var(--vos-text-tertiary)]"
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--vos-text-primary)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--vos-text-tertiary)'
              }}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      </div>
      <div
        className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider truncate flex-shrink-0 text-[var(--vos-text-tertiary)] border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]"
      >
        {workspaceName}
      </div>
    </>
  )
}
