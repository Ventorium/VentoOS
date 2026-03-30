import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openWindow, useAppStore } from '@/kernel'
import { tokens } from '@/theme'

interface Command {
  id: string
  label: string
  group: string
  action: () => void
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const appsMap = useAppStore(s => s.apps)
  const apps = useMemo(() => Array.from(appsMap.values()), [appsMap])
  const openWindowFn = openWindow

  // Build command list
  const commands: Command[] = [
    ...apps.map(app => ({
      id: `open-${app.id}`,
      label: `Open ${app.name}`,
      group: 'Applications',
      action: () => {
        openWindowFn(app.id, {
          width: app.defaultSize?.width,
          height: app.defaultSize?.height
        })
        setOpen(false)
      }
    }))
  ]

  const filtered = query.trim() ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase())) : commands

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
        setQuery('')
        setSelectedIndex(0)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        filtered[selectedIndex].action()
      }
    },
    [filtered, selectedIndex]
  )

  return (
    <AnimatePresence>
      {open && (
        <>
          <div
            role="presentation"
            className="fixed inset-0"
            style={{
              zIndex: 3999,
              background: 'rgba(0,0,0,0.25)'
            }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="vos-glass-heavy fixed flex flex-col"
            style={{
              top: '18%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 520,
              maxHeight: 400,
              borderRadius: tokens.radius.panel,
              background: 'var(--vos-bg-overlay)',
              border: '0.5px solid var(--vos-border-default)',
              boxShadow: tokens.shadow.overlay,
              zIndex: 4000,
              color: 'var(--vos-text-primary)',
              overflow: 'hidden'
            }}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-2 px-4"
              style={{ borderBottom: '0.5px solid var(--vos-border-subtle)', height: 48 }}
            >
              <Search size={16} style={{ color: 'var(--vos-text-tertiary)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{ color: 'var(--vos-text-primary)' }}
                placeholder="Type a command…"
                value={query}
                onChange={e => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={onKeyDown}
              />
              <kbd
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: 'var(--vos-bg-input)',
                  color: 'var(--vos-text-tertiary)',
                  border: '0.5px solid var(--vos-border-default)'
                }}
              >
                ⌘K
              </kbd>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-auto py-2">
              {filtered.length === 0 ? (
                <div
                  className="flex items-center justify-center py-8 text-xs"
                  style={{ color: 'var(--vos-text-tertiary)' }}
                >
                  No results
                </div>
              ) : (
                filtered.map((cmd, i) => (
                  <button
                    type="button"
                    key={cmd.id}
                    className="w-full flex items-center justify-between px-4 py-2 text-left text-sm border-none cursor-pointer"
                    style={{
                      background: i === selectedIndex ? 'var(--vos-accent-primary)' : 'transparent',
                      color: i === selectedIndex ? '#fff' : 'var(--vos-text-primary)'
                    }}
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span>{cmd.label}</span>
                    {i === selectedIndex && <CornerDownLeft size={12} />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
