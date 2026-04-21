/**
 * Launchpad — Full-screen App Launcher
 *
 * macOS-style app grid with:
 * - Folder: 3×3 preview (click to expand full list)
 * - Folder: click name to rename (Enter confirm, Esc cancel)
 * - Folder: right-click → dissolve
 * - Search filtering
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppManifest } from '@/kernel'
import { focusWindow, openWindow, useAppStore, useWindowStore } from '@/kernel'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { useLaunchpadLayoutStore } from '@/shell/Launchpad/launchpadLayoutStore'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { tokens } from '@/theme'

// ─── Constants ───────────────────────────────────────────────────────────────
const FOLDER_PREVIEW_COLS = 3
const FOLDER_PREVIEW_ROWS = 3
const FOLDER_PREVIEW_MAX = FOLDER_PREVIEW_COLS * FOLDER_PREVIEW_ROWS

// ─── Single app icon (in grid) ───────────────────────────────────────────────
function LaunchpadAppIcon({ app, index, onLaunch }: { app: AppManifest; index: number; onLaunch: () => boolean }) {
  function launch() {
    if (!onLaunch()) return
    const existing = useWindowStore.getState().getWindowsByApp(app.id)
    if (existing.length > 0 && !app.multiWindow) {
      const top = existing.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
      focusWindow(top.id)
    } else {
      openWindow(app.id, { width: app.defaultSize?.width ?? 1000, height: app.defaultSize?.height ?? 680 })
    }
  }

  return (
    <motion.div
      className="vos-launchpad-item"
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 10 }}
      transition={{ delay: index * 0.02, duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="relative">
        <motion.button
          type="button"
          className="vos-launchpad-icon"
          style={{ width: tokens.launchpad.iconSize, height: tokens.launchpad.iconSize }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={launch}
        >
          {app.icon}
        </motion.button>
      </div>
      <span className="vos-launchpad-label">{app.name}</span>
    </motion.div>
  )
}

// ─── Folder icon (3×3 preview grid) ──────────────────────────────────────────
function LaunchpadFolderIcon({
  folder,
  appsMap,
  index,
  onClick,
  onContextMenu
}: {
  folder: { id: string; name: string; appIds: string[] }
  appsMap: Map<string, AppManifest>
  index: number
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const previewApps = folder.appIds.slice(0, FOLDER_PREVIEW_MAX)
  const miniSize = Math.floor(tokens.launchpad.iconSize / 4)

  return (
    <motion.div
      className="vos-launchpad-item"
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 10 }}
      transition={{ delay: index * 0.02, duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      onContextMenu={onContextMenu}
    >
      <div className="relative">
        <motion.button
          type="button"
          className="vos-launchpad-icon vos-flex-center bg-white/15 backdrop-blur-[8px]"
          style={{
            width: tokens.launchpad.iconSize,
            height: tokens.launchpad.iconSize,
            display: 'grid',
            gridTemplateColumns: `repeat(${FOLDER_PREVIEW_COLS}, ${miniSize}px)`,
            gridTemplateRows: `repeat(${FOLDER_PREVIEW_ROWS}, ${miniSize}px)`,
            gap: 2,
            placeContent: 'center'
          }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={onClick}
        >
          {previewApps.map(appId => {
            const app = appsMap.get(appId)
            return (
              <div key={appId} className="rounded-[22%] overflow-hidden" style={{ width: miniSize, height: miniSize }}>
                {app?.icon ?? null}
              </div>
            )
          })}
        </motion.button>
      </div>
      <span className="vos-launchpad-label">{folder.name}</span>
    </motion.div>
  )
}

// ─── Folder overlay (expanded folder view) ───────────────────────────────────
function FolderOverlay({
  folder,
  appsMap,
  onClose,
  onLaunch,
  onRename,
  onDissolve
}: {
  folder: { id: string; name: string; appIds: string[] }
  appsMap: Map<string, AppManifest>
  onClose: () => void
  onLaunch: () => void
  onRename: (name: string) => void
  onDissolve: () => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(folder.name)
  const nameRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isRenaming) {
      nameRef.current?.focus()
      nameRef.current?.select()
    }
  }, [isRenaming])

  // Close on outside click
  useEffect(() => {
    const timer = setTimeout(() => {
      const handler = (e: MouseEvent) => {
        if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) onClose()
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, 0)
    return () => clearTimeout(timer)
  }, [onClose])

  const showContextMenu = useContextMenuStore(s => s.show)
  function handleFolderContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    showContextMenu(
      e.clientX,
      e.clientY,
      [
        { id: 'rename', label: '重命名文件夹', action: () => setIsRenaming(true) },
        { type: 'separator' },
        { id: 'dissolve', label: '解散文件夹', action: onDissolve }
      ],
      { compact: true }
    )
  }

  function launchApp(appId: string) {
    const state = useWindowStore.getState()
    const manifest = appsMap.get(appId)
    const existing = state.getWindowsByApp(appId)
    if (existing.length > 0 && manifest && !manifest.multiWindow) {
      const top = existing.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
      focusWindow(top.id)
    } else {
      openWindow(appId, { width: manifest?.defaultSize?.width ?? 1000, height: manifest?.defaultSize?.height ?? 680 })
    }
    onLaunch()
  }

  return (
    <motion.div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.div
        ref={overlayRef}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="bg-[rgba(30,30,40,0.88)] backdrop-blur-[28px] backdrop-saturate-[180%] rounded-[20px] pt-5 px-6 pb-5 border-[0.5px] border-solid border-white/12 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        style={{ minWidth: 260, maxWidth: 420 }}
        onContextMenu={handleFolderContextMenu}
      >
        {/* Folder name */}
        <div className="text-center mb-4">
          {isRenaming ? (
            <input
              ref={nameRef}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onRename(nameInput.trim() || folder.name)
                  setIsRenaming(false)
                } else if (e.key === 'Escape') {
                  setNameInput(folder.name)
                  setIsRenaming(false)
                }
              }}
              onBlur={() => {
                onRename(nameInput.trim() || folder.name)
                setIsRenaming(false)
              }}
              className="bg-white/15 border border-white/30 rounded-[6px] text-[var(--vos-text-primary)] text-[14px] font-semibold px-3 py-1 text-center outline-none w-[70%]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsRenaming(true)}
              className="text-[var(--vos-text-primary)] text-[14px] font-semibold bg-transparent border-none cursor-pointer hover:bg-white/10 px-3 py-1 rounded-[6px] transition-colors"
              title="点击重命名"
            >
              {folder.name}
            </button>
          )}
        </div>

        {/* App grid — 3 cols max */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${FOLDER_PREVIEW_COLS}, 1fr)`,
            gap: 12,
            justifyItems: 'center'
          }}
        >
          {folder.appIds.map(appId => {
            const app = appsMap.get(appId)
            const appIconSize = tokens.launchpad.iconSize * 0.82

            return (
              <div key={appId} className="flex flex-col items-center gap-1">
                <motion.button
                  type="button"
                  style={{
                    width: appIconSize,
                    height: appIconSize,
                    borderRadius: appIconSize * 0.22,
                    overflow: 'hidden',
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => launchApp(appId)}
                >
                  {app?.icon}
                </motion.button>
                <span className="text-[11px] text-[var(--vos-text-secondary)] text-center max-w-[70px] truncate">
                  {app?.name ?? appId}
                </span>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Launchpad ───────────────────────────────────────────────────────────
export default function Launchpad() {
  const isOpen = useLaunchpadStore(s => s.isOpen)
  const searchQuery = useLaunchpadStore(s => s.searchQuery)
  const close = useLaunchpadStore(s => s.close)
  const setSearch = useLaunchpadStore(s => s.setSearch)
  const appsMap = useAppStore(s => s.apps)
  const showCtxMenu = useContextMenuStore(s => s.show)

  // Layout store
  const layoutItems = useLaunchpadLayoutStore(s => s.items)
  const loaded = useLaunchpadLayoutStore(s => s.loaded)
  const { renameFolder, dissolveFolder } = useLaunchpadLayoutStore.getState()

  // All apps including hidden ones (hidden = not in Dock, but all appear in Launchpad)
  const allVisibleApps = useMemo(() => Array.from(appsMap.values()), [appsMap])

  // Load layout on open
  useEffect(() => {
    if (!loaded && allVisibleApps.length > 0) {
      useLaunchpadLayoutStore.getState().load(allVisibleApps.map(a => a.id))
    }
  }, [loaded, allVisibleApps])

  // --- Folder overlay ---
  const [openFolderIndex, setOpenFolderIndex] = useState<number | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search on open
  useEffect(() => {
    if (isOpen) setTimeout(() => searchRef.current?.focus(), 50)
  }, [isOpen])

  // Keyboard: Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openFolderIndex !== null) setOpenFolderIndex(null)
        else close()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close, openFolderIndex])

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setOpenFolderIndex(null)
    }
  }, [isOpen])

  // --- Search filter ---
  const isSearching = searchQuery.trim().length > 0
  const searchResults = useMemo(() => {
    if (!isSearching) return []
    const q = searchQuery.toLowerCase()
    return allVisibleApps.filter(
      a => a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q)
    )
  }, [isSearching, searchQuery, allVisibleApps])

  function handleFolderContextMenu(e: React.MouseEvent, folderId: string, folderName: string) {
    e.preventDefault()
    e.stopPropagation()
    showCtxMenu(
      e.clientX,
      e.clientY,
      [
        {
          id: 'dissolve',
          label: '解散文件夹',
          action: () => dissolveFolder(folderId)
        }
      ],
      { compact: true }
    )
  }

  const handleLaunch = useCallback((): boolean => {
    close()
    return true
  }, [close])

  return (
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
              if (openFolderIndex !== null) setOpenFolderIndex(null)
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
            <Search size={16} className="opacity-50 shrink-0" />
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
              {isSearching
                ? searchResults.map((app, i) => (
                    <LaunchpadAppIcon key={app.id} app={app} index={i} onLaunch={handleLaunch} />
                  ))
                : layoutItems.map((item, index) => {
                    if (item.type === 'app') {
                      const app = appsMap.get(item.appId)
                      if (!app) return null
                      return <LaunchpadAppIcon key={item.appId} app={app} index={index} onLaunch={handleLaunch} />
                    }

                    return (
                      <LaunchpadFolderIcon
                        key={item.id}
                        folder={item}
                        appsMap={appsMap}
                        index={index}
                        onClick={() => setOpenFolderIndex(openFolderIndex === index ? null : index)}
                        onContextMenu={e => handleFolderContextMenu(e, item.id, item.name)}
                      />
                    )
                  })}
            </AnimatePresence>
            {isSearching && searchResults.length === 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full text-center text-[var(--vos-text-secondary)] text-[15px]"
              >
                未找到应用
              </motion.p>
            )}
          </div>

          {/* Dots */}
          <div className="vos-launchpad-dots">
            <div className="vos-launchpad-dot active" />
          </div>

          {/* Folder overlay */}
          <AnimatePresence>
            {openFolderIndex !== null &&
              (() => {
                const item = layoutItems[openFolderIndex]
                if (!item || item.type !== 'folder') return null
                return (
                  <FolderOverlay
                    key={item.id}
                    folder={item}
                    appsMap={appsMap}
                    onClose={() => setOpenFolderIndex(null)}
                    onLaunch={handleLaunch}
                    onRename={name => renameFolder(item.id, name)}
                    onDissolve={() => {
                      dissolveFolder(item.id)
                      setOpenFolderIndex(null)
                    }}
                  />
                )
              })()}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
