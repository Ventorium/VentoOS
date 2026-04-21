import { Database, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui'
import { useDatabaseStore } from '../stores'
import type { DbEngine } from '../types'

const DB_TYPES: { engine: DbEngine; label: string }[] = [
  { engine: 'mysql', label: 'MySQL' },
  { engine: 'postgresql', label: 'PostgreSQL' },
  { engine: 'sqlite', label: 'SQLite' }
]

const RECENT_KEY = 'ventoos-db-recent-engines'

function getRecentEngines(): DbEngine[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as DbEngine[]
    return arr.filter(e => DB_TYPES.some(d => d.engine === e))
  } catch {
    return []
  }
}

function saveRecentEngine(engine: DbEngine) {
  const recent = getRecentEngines().filter(e => e !== engine)
  recent.unshift(engine)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 6)))
}

export function NewConnectionDialog() {
  const { showNewConnectionTypeDialog, setShowNewConnectionTypeDialog, openConnectionConfig } = useDatabaseStore()
  const [search, setSearch] = useState('')
  const recentEngines = useMemo(() => getRecentEngines(), [])

  const filteredTypes = useMemo(
    () => DB_TYPES.filter(d => d.label.toLowerCase().includes(search.toLowerCase())),
    [search]
  )

  const filteredRecent = useMemo(
    () =>
      recentEngines.filter(e => {
        const info = DB_TYPES.find(d => d.engine === e)
        return info && info.label.toLowerCase().includes(search.toLowerCase())
      }),
    [recentEngines, search]
  )

  const handleSelect = (engine: DbEngine) => {
    saveRecentEngine(engine)
    setShowNewConnectionTypeDialog(false)
    openConnectionConfig(engine)
  }

  return (
    <Modal
      open={showNewConnectionTypeDialog}
      onClose={() => setShowNewConnectionTypeDialog(false)}
      title="新建连接"
      width={520}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--vos-text-tertiary)' }}
          />
          <input
            className="vos-input vos-input-sm w-full pl-7"
            placeholder="搜索数据库类型..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {filteredRecent.length > 0 && (
          <div>
            <div className="text-xs mb-2 font-medium" style={{ color: 'var(--vos-text-secondary)' }}>
              最近使用过的
            </div>
            <div className="flex gap-3 flex-wrap">
              {filteredRecent.map(engine => {
                const info = DB_TYPES.find(d => d.engine === engine)!
                return (
                  <button
                    key={engine}
                    type="button"
                    className="flex flex-col items-center justify-center gap-1.5 rounded-lg cursor-pointer border border-solid transition-colors"
                    style={{
                      width: 72,
                      height: 72,
                      borderColor: 'var(--vos-border-subtle)',
                      background: 'var(--vos-bg-surface)',
                      color: 'var(--vos-text-primary)'
                    }}
                    onClick={() => handleSelect(engine)}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--vos-accent-primary)'
                      e.currentTarget.style.background = 'var(--vos-bg-hover)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--vos-border-subtle)'
                      e.currentTarget.style.background = 'var(--vos-bg-surface)'
                    }}
                  >
                    <Database size={24} style={{ color: 'var(--vos-accent-primary)' }} />
                    <span className="text-xs">{info.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs mb-2 font-medium" style={{ color: 'var(--vos-text-secondary)' }}>
            全部
          </div>
          <div className="flex gap-3 flex-wrap">
            {filteredTypes.map(({ engine, label }) => (
              <button
                key={engine}
                type="button"
                className="flex flex-col items-center justify-center gap-1 rounded-lg cursor-pointer border border-solid transition-colors"
                style={{
                  width: 56,
                  height: 56,
                  borderColor: 'var(--vos-border-subtle)',
                  background: 'var(--vos-bg-surface)',
                  color: 'var(--vos-text-primary)'
                }}
                onClick={() => handleSelect(engine)}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--vos-accent-primary)'
                  e.currentTarget.style.background = 'var(--vos-bg-hover)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--vos-border-subtle)'
                  e.currentTarget.style.background = 'var(--vos-bg-surface)'
                }}
              >
                <Database size={20} style={{ color: 'var(--vos-accent-primary)' }} />
                <span className="text-[10px]">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
