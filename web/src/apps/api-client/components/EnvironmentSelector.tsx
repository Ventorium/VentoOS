import { ChevronDown, Globe } from 'lucide-react'
import { useState } from 'react'
import { useApiClientStore } from '../store'
import type { Environment } from '../types'

export default function EnvironmentSelector() {
  const environments = useApiClientStore(s => s.environments)
  const activeEnvironmentId = useApiClientStore(s => s.activeEnvironmentId)
  const setActiveEnvironment = useApiClientStore(s => s.setActiveEnvironment)
  const [open, setOpen] = useState(false)

  const active = environments.find(e => e.id === activeEnvironmentId)

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:opacity-80"
        style={{
          color: 'var(--vos-text-secondary)',
          background: 'var(--vos-bg-tertiary)',
          border: '1px solid var(--vos-border-subtle)'
        }}
        onClick={() => setOpen(!open)}
      >
        <Globe size={12} />
        <span className="truncate max-w-24">{active?.name ?? 'No Environment'}</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-50 min-w-40 rounded-md shadow-lg py-1"
            style={{
              background: 'var(--vos-bg-elevated)',
              border: '1px solid var(--vos-border-subtle)'
            }}
          >
            <div
              className="px-3 py-1.5 text-xs cursor-pointer hover:opacity-80"
              style={{
                color: !activeEnvironmentId ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)'
              }}
              onClick={() => {
                setActiveEnvironment(null)
                setOpen(false)
              }}
            >
              No Environment
            </div>
            {environments.map(env => (
              <div
                key={env.id}
                className="px-3 py-1.5 text-xs cursor-pointer hover:opacity-80"
                style={{
                  color: env.id === activeEnvironmentId ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)'
                }}
                onClick={() => {
                  setActiveEnvironment(env.id)
                  setOpen(false)
                }}
              >
                {env.name}
                {env.isGlobal && (
                  <span className="ml-1 text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                    (Global)
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
