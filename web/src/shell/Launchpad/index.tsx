/**
 * Launchpad — Full-screen App Launcher
 *
 * macOS-style app grid that overlays the desktop.
 * Features: animated entrance, search filtering, keyboard navigation, smooth exit.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { focusWindow, openWindow, useAppStore, useWindowStore } from '@/kernel'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { tokens } from '@/theme'

function AppIcon({
  app,
  index,
  onLaunch
}: {
  app: {
    id: string
    name: string
    icon: React.ReactNode
    description?: string
    multiWindow: boolean
    defaultSize?: { width: number; height: number }
  }
  index: number
  onLaunch: () => void
}) {
  const openWindowFn = openWindow
  const focusWindowFn = focusWindow

  function launch() {
    const existing = useWindowStore.getState().getWindowsByApp(app.id)
    if (existing.length > 0 && !app.multiWindow) {
      const top = existing.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
      focusWindowFn(top.id)
    } else {
      openWindowFn(app.id, {
        width: app.defaultSize?.width ?? 1000,
        height: app.defaultSize?.height ?? 680
      })
    }
    onLaunch()
  }

  return (
    <motion.button
      type="button"
      className="vos-launchpad-item"
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 10 }}
      transition={{
        delay: index * 0.03,
        duration: 0.3,
        ease: [0.32, 0.72, 0, 1]
      }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      onClick={launch}
    >
      <div
        className="vos-launchpad-icon"
        style={{ width: tokens.launchpad.iconSize, height: tokens.launchpad.iconSize }}
      >
        {app.icon}
      </div>
      <span className="vos-launchpad-label">{app.name}</span>
    </motion.button>
  )
}

export default function Launchpad() {
  const isOpen = useLaunchpadStore(s => s.isOpen)
  const searchQuery = useLaunchpadStore(s => s.searchQuery)
  const close = useLaunchpadStore(s => s.close)
  const setSearch = useLaunchpadStore(s => s.setSearch)
  const appsMap = useAppStore(s => s.apps)
  const allApps = useMemo(() => Array.from(appsMap.values()), [appsMap])
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = searchQuery.trim()
    ? allApps.filter(
        a =>
          a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (a.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allApps

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close])

  const handleLaunch = () => {
    close()
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="vos-launchpad"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={e => {
            if (e.target === e.currentTarget) close()
          }}
        >
          {/* Search bar */}
          <motion.div
            className="vos-launchpad-search"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.05, duration: 0.25 }}
          >
            <Search size={16} style={{ opacity: 0.5, flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="search"
              placeholder="搜索"
              value={searchQuery}
              onChange={e => setSearch(e.target.value)}
              className="vos-launchpad-input"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearch('')} className="vos-launchpad-clear">
                <X size={14} />
              </button>
            )}
          </motion.div>

          {/* App grid */}
          <div className="vos-launchpad-grid">
            <AnimatePresence mode="popLayout">
              {filtered.map((app, i) => (
                <AppIcon key={app.id} app={app} index={i} onLaunch={handleLaunch} />
              ))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  color: 'var(--vos-text-secondary)',
                  fontSize: 15
                }}
              >
                未找到应用
              </motion.p>
            )}
          </div>

          {/* Dots indicator (page 1 of 1) */}
          <div className="vos-launchpad-dots">
            <div className="vos-launchpad-dot active" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
