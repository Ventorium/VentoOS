import { Code2, File, FolderOpen, Plus, Search } from 'lucide-react'

export default function WelcomePage() {
  const isMac = /Mac/.test(navigator.userAgent)

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6"
      style={{ background: 'var(--vos-bg-window)', color: 'var(--vos-text-tertiary)' }}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0078d4 0%, #005a9e 100%)' }}
        >
          <Code2 size={32} color="#fff" />
        </div>
        <div className="text-base font-medium" style={{ color: 'var(--vos-text-primary)' }}>
          代码编辑器
        </div>
      </div>
      <div className="flex flex-col gap-3 text-sm">
        {[
          { key: isMac ? '⌘P' : 'Ctrl+P', label: '快速打开文件', icon: <Search size={14} /> },
          { key: isMac ? '⌘O' : 'Ctrl+O', label: '打开文件', icon: <File size={14} /> },
          { key: isMac ? '⌘⇧O' : 'Ctrl+Shift+O', label: '打开文件夹', icon: <FolderOpen size={14} /> },
          { key: isMac ? '⌘N' : 'Ctrl+Alt+N', label: '新建文件', icon: <Plus size={14} /> }
        ].map(({ key, label, icon }) => (
          <div key={key} className="flex items-center gap-3">
            <span style={{ color: 'var(--vos-accent-primary)', width: 16 }}>{icon}</span>
            <span style={{ color: 'var(--vos-text-secondary)' }}>{label}</span>
            <kbd
              className="px-1.5 py-0.5 text-[10px] rounded font-mono"
              style={{
                background: 'var(--vos-bg-input)',
                color: 'var(--vos-text-tertiary)',
                border: '1px solid var(--vos-border-subtle)'
              }}
            >
              {key}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}
