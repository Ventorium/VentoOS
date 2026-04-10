/**
 * Launchpad — Full-screen App Launcher
 *
 * macOS-style app grid that overlays the desktop.
 * Features: animated entrance, search filtering, keyboard navigation, smooth exit.
 * Supports folder grouping with macOS-style expand/collapse animation.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { focusWindow, openWindow, useAppStore, useWindowStore } from '@/kernel'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { tokens } from '@/theme'

interface AppInfo {
  id: string
  name: string
  icon: React.ReactNode
  description?: string
  multiWindow: boolean
  defaultSize?: { width: number; height: number }
  group?: string
}

function AppIcon({ app, index, onLaunch }: { app: AppInfo; index: number; onLaunch: () => void }) {
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

function FolderIcon({
  name,
  apps,
  index,
  onClick
}: {
  name: string
  apps: AppInfo[]
  index: number
  onClick: () => void
}) {
  const previewApps = apps.slice(0, 9)
  const miniSize = Math.floor(tokens.launchpad.iconSize / 4)

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
      onClick={onClick}
    >
      <div
        className="vos-launchpad-icon vos-launchpad-folder-icon"
        style={{
          width: tokens.launchpad.iconSize,
          height: tokens.launchpad.iconSize,
          display: 'grid',
          gridTemplateColumns: `repeat(3, ${miniSize}px)`,
          gridTemplateRows: `repeat(3, ${miniSize}px)`,
          gap: 2,
          alignContent: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(8px)'
        }}
      >
        {previewApps.map(a => (
          <div
            key={a.id}
            style={{
              width: miniSize,
              height: miniSize,
              borderRadius: '22%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8
            }}
          >
            {a.icon}
          </div>
        ))}
      </div>
      <span className="vos-launchpad-label">{name}</span>
    </motion.button>
  )
}

function FolderOverlay({
  name,
  apps,
  onClose,
  onLaunch
}: {
  name: string
  apps: AppInfo[]
  onClose: () => void
  onLaunch: () => void
}) {
  return (
    <motion.div
      className="vos-launchpad-folder-overlay"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
        style={{
          background: 'rgba(40, 40, 50, 0.85)',
          backdropFilter: 'blur(24px) saturate(160%)',
          borderRadius: 20,
          padding: '24px 28px 20px',
          minWidth: 280,
          maxWidth: 480,
          border: '0.5px solid rgba(255,255,255,0.12)'
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 15,
            fontWeight: 600,
            textAlign: 'center',
            marginBottom: 16
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            justifyItems: 'center'
          }}
        >
          <AnimatePresence mode="popLayout">
            {apps.map((app, i) => (
              <AppIcon key={app.id} app={app} index={i} onLaunch={onLaunch} />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function Launchpad() {
  const isOpen = useLaunchpadStore(s => s.isOpen)
  const searchQuery = useLaunchpadStore(s => s.searchQuery)
  const openFolderName = useLaunchpadStore(s => s.openFolderName)
  const close = useLaunchpadStore(s => s.close)
  const setSearch = useLaunchpadStore(s => s.setSearch)
  const openFolderFn = useLaunchpadStore(s => s.openFolder)
  const closeFolderFn = useLaunchpadStore(s => s.closeFolder)
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

  // Separate ungrouped apps and folder groups
  const { ungroupedApps, folders } = useMemo(() => {
    const ungrouped: AppInfo[] = []
    const groups = new Map<string, AppInfo[]>()
    for (const app of filtered) {
      if (app.group) {
        const list = groups.get(app.group) ?? []
        list.push(app)
        groups.set(app.group, list)
      } else {
        ungrouped.push(app)
      }
    }
    return { ungroupedApps: ungrouped, folders: groups }
  }, [filtered])

  // When searching, flatten everything (show all apps, no folders)
  const isSearching = searchQuery.trim().length > 0

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
      if (e.key === 'Escape') {
        if (openFolderName) {
          closeFolderFn()
        } else {
          close()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close, openFolderName, closeFolderFn])

  const handleLaunch = useCallback(() => {
    close()
  }, [close])

  const folderApps = openFolderName ? (folders.get(openFolderName) ?? []) : []

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
            if (e.target === e.currentTarget) {
              if (openFolderName) closeFolderFn()
              else close()
            }
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
              type="text"
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
              {isSearching ? (
                filtered.map((app, i) => <AppIcon key={app.id} app={app} index={i} onLaunch={handleLaunch} />)
              ) : (
                <>
                  {ungroupedApps.map((app, i) => (
                    <AppIcon key={app.id} app={app} index={i} onLaunch={handleLaunch} />
                  ))}
                  {Array.from(folders.entries()).map(([groupName, groupApps], i) => (
                    <FolderIcon
                      key={`folder-${groupName}`}
                      name={groupName}
                      apps={groupApps}
                      index={ungroupedApps.length + i}
                      onClick={() => openFolderFn(groupName)}
                    />
                  ))}
                </>
              )}
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

          {/* Folder overlay */}
          <AnimatePresence>
            {openFolderName && (
              <FolderOverlay name={openFolderName} apps={folderApps} onClose={closeFolderFn} onLaunch={handleLaunch} />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
