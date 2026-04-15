/**
 * Launchpad — Full-screen App Launcher
 *
 * macOS-style app grid with:
 * - Long-press (500ms) → drag-to-reorder
 * - Drag onto another icon 3s → create folder
 * - Folder: 3×3 preview (click to expand full list)
 * - Folder: click name to rename (Enter confirm, Esc cancel)
 * - Folder: drag-sort inside
 * - Folder: right-click → dissolve
 * - Search filtering
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { focusWindow, openWindow, useAppStore, useWindowStore } from '@/kernel'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { type LaunchpadItem, useLaunchpadLayoutStore } from '@/shell/Launchpad/launchpadLayoutStore'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { tokens } from '@/theme'
import type { AppManifest } from '@/kernel'

// ─── Constants ───────────────────────────────────────────────────────────────
const LONG_PRESS_MS = 500
const FOLDER_HOVER_MS = 3000
const DRAG_MOVE_THRESHOLD = 6
const FOLDER_PREVIEW_COLS = 3
const FOLDER_PREVIEW_ROWS = 3
const FOLDER_PREVIEW_MAX = FOLDER_PREVIEW_COLS * FOLDER_PREVIEW_ROWS

// ─── SVG ring for folder-hover progress ──────────────────────────────────────
function FolderHoverRing({ progress, size }: { progress: number; size: number }) {
  const r = size / 2 - 3
  const circ = 2 * Math.PI * r
  return (
    <svg
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
      width={size}
      height={size}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

// ─── Single app icon (in grid) ───────────────────────────────────────────────
function LaunchpadAppIcon({
  app,
  index,
  isDragging,
  mergeProgress,
  onLaunch,
  onMouseDown,
  itemRef
}: {
  app: AppManifest
  index: number
  isDragging?: boolean
  mergeProgress?: number
  onLaunch: () => void
  onMouseDown?: (e: React.MouseEvent) => void
  itemRef?: (el: HTMLDivElement | null) => void
}) {
  function launch() {
    const existing = useWindowStore.getState().getWindowsByApp(app.id)
    if (existing.length > 0 && !app.multiWindow) {
      const top = existing.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
      focusWindow(top.id)
    } else {
      openWindow(app.id, { width: app.defaultSize?.width ?? 1000, height: app.defaultSize?.height ?? 680 })
    }
    onLaunch()
  }

  return (
    <motion.div
      ref={itemRef}
      className="vos-launchpad-item"
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: isDragging ? 0.25 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 10 }}
      transition={{ delay: index * 0.02, duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      onMouseDown={onMouseDown}
    >
      <div className="relative">
        {mergeProgress !== undefined && mergeProgress > 0 && (
          <FolderHoverRing progress={mergeProgress} size={tokens.launchpad.iconSize} />
        )}
        <motion.button
          type="button"
          className="vos-launchpad-icon"
          style={{ width: tokens.launchpad.iconSize, height: tokens.launchpad.iconSize }}
          whileHover={{ scale: isDragging ? 1 : 1.08 }}
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
  isDragging,
  mergeProgress,
  onClick,
  onMouseDown,
  onContextMenu,
  itemRef
}: {
  folder: { id: string; name: string; appIds: string[] }
  appsMap: Map<string, AppManifest>
  index: number
  isDragging?: boolean
  mergeProgress?: number
  onClick: () => void
  onMouseDown?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  itemRef?: (el: HTMLDivElement | null) => void
}) {
  const previewApps = folder.appIds.slice(0, FOLDER_PREVIEW_MAX)
  const miniSize = Math.floor(tokens.launchpad.iconSize / 4)

  return (
    <motion.div
      ref={itemRef}
      className="vos-launchpad-item"
      initial={{ opacity: 0, scale: 0.7, y: 20 }}
      animate={{ opacity: isDragging ? 0.25 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, y: 10 }}
      transition={{ delay: index * 0.02, duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
    >
      <div className="relative">
        {mergeProgress !== undefined && mergeProgress > 0 && (
          <FolderHoverRing progress={mergeProgress} size={tokens.launchpad.iconSize} />
        )}
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
          whileHover={{ scale: isDragging ? 1 : 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={onClick}
        >
          {previewApps.map(appId => {
            const app = appsMap.get(appId)
            return (
              <div
                key={appId}
                className="rounded-[22%] overflow-hidden"
                style={{ width: miniSize, height: miniSize }}
              >
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
  onReorderApp,
  onDissolve
}: {
  folder: { id: string; name: string; appIds: string[] }
  appsMap: Map<string, AppManifest>
  onClose: () => void
  onLaunch: () => void
  onRename: (name: string) => void
  onReorderApp: (fromIdx: number, gapIdx: number) => void
  onDissolve: () => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(folder.name)
  const nameRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Drag-sort inside folder
  const [folderDrag, setFolderDrag] = useState<{
    fromIdx: number
    ghostX: number
    ghostY: number
    offsetX: number
    offsetY: number
    dropGapIdx: number | null
  } | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

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

  function computeGap(clientX: number, clientY: number): number {
    const rects = itemRefs.current.map(el => el?.getBoundingClientRect())
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (!r) continue
      if (clientY < r.top + r.height / 2 && clientX < r.left + r.width / 2) return i
    }
    return folder.appIds.length
  }

  function handleItemMouseDown(idx: number, e: React.MouseEvent) {
    e.stopPropagation()
    const el = itemRefs.current[idx]
    if (!el) return
    const rect = el.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const startX = e.clientX
    const startY = e.clientY
    let activated = false

    const onMove = (me: MouseEvent) => {
      if (!activated) {
        if (Math.abs(me.clientX - startX) < DRAG_MOVE_THRESHOLD && Math.abs(me.clientY - startY) < DRAG_MOVE_THRESHOLD) return
        activated = true
        setFolderDrag({ fromIdx: idx, ghostX: me.clientX, ghostY: me.clientY, offsetX, offsetY, dropGapIdx: null })
      }
      setFolderDrag(prev => prev ? { ...prev, ghostX: me.clientX, ghostY: me.clientY, dropGapIdx: computeGap(me.clientX, me.clientY) } : null)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setFolderDrag(prev => {
        if (prev?.dropGapIdx !== null && prev?.dropGapIdx !== undefined) {
          onReorderApp(prev.fromIdx, prev.dropGapIdx)
        }
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const showContextMenu = useContextMenuStore(s => s.show)
  function handleFolderContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY, [
      { id: 'rename', label: '重命名文件夹', action: () => setIsRenaming(true) },
      { type: 'separator' },
      { id: 'dissolve', label: '解散文件夹', action: onDissolve }
    ], { compact: true })
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
      style={{ position: 'fixed', inset: 0, zIndex: 5001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
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
                if (e.key === 'Enter') { onRename(nameInput.trim() || folder.name); setIsRenaming(false) }
                else if (e.key === 'Escape') { setNameInput(folder.name); setIsRenaming(false) }
              }}
              onBlur={() => { onRename(nameInput.trim() || folder.name); setIsRenaming(false) }}
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
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${FOLDER_PREVIEW_COLS}, 1fr)`, gap: 12, justifyItems: 'center' }}>
          {folder.appIds.map((appId, idx) => {
            const app = appsMap.get(appId)
            const isDraggingThis = folderDrag?.fromIdx === idx
            const appIconSize = tokens.launchpad.iconSize * 0.82

            return (
              <div
                key={appId}
                ref={el => { itemRefs.current[idx] = el }}
                style={{ opacity: isDraggingThis ? 0.2 : 1, transition: 'opacity 0.15s', cursor: 'grab' }}
                onMouseDown={e => handleItemMouseDown(idx, e)}
              >
                <div className="flex flex-col items-center gap-1">
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
                    onClick={e => { e.stopPropagation(); launchApp(appId) }}
                  >
                    {app?.icon}
                  </motion.button>
                  <span className="text-[11px] text-[var(--vos-text-secondary)] text-center max-w-[70px] truncate">
                    {app?.name ?? appId}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Ghost for folder internal drag */}
      {folderDrag && (() => {
        const app = appsMap.get(folder.appIds[folderDrag.fromIdx])
        const s = tokens.launchpad.iconSize * 0.82
        return createPortal(
          <div
            style={{
              position: 'fixed',
              left: folderDrag.ghostX - folderDrag.offsetX,
              top: folderDrag.ghostY - folderDrag.offsetY,
              width: s,
              height: s,
              borderRadius: s * 0.22,
              overflow: 'hidden',
              opacity: 0.8,
              transform: 'scale(1.12)',
              pointerEvents: 'none',
              zIndex: 9999
            }}
          >
            {app?.icon}
          </div>,
          document.body
        )
      })()}
    </motion.div>
  )
}

// ─── Drag ghost overlay ───────────────────────────────────────────────────────
function DragGhost({
  item,
  appsMap,
  x,
  y,
  offX,
  offY
}: {
  item: LaunchpadItem
  appsMap: Map<string, AppManifest>
  x: number
  y: number
  offX: number
  offY: number
}) {
  const s = tokens.launchpad.iconSize
  const content = useMemo(() => {
    if (item.type === 'app') {
      const app = appsMap.get(item.appId)
      return app ? <div style={{ width: s, height: s, borderRadius: s * 0.22, overflow: 'hidden' }}>{app.icon}</div> : null
    }
    const miniSize = Math.floor(s / 4)
    return (
      <div
        style={{
          width: s,
          height: s,
          borderRadius: s * 0.22,
          background: 'rgba(100,100,100,0.35)',
          display: 'grid',
          gridTemplateColumns: `repeat(3, ${miniSize}px)`,
          gap: 2,
          placeContent: 'center'
        }}
      >
        {item.appIds.slice(0, 9).map(appId => {
          const app = appsMap.get(appId)
          return (
            <div key={appId} style={{ width: miniSize, height: miniSize, borderRadius: miniSize * 0.22, overflow: 'hidden' }}>
              {app?.icon}
            </div>
          )
        })}
      </div>
    )
  }, [item, appsMap, s])

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: x - offX,
        top: y - offY,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: 0.85,
        transform: 'scale(1.1)',
        transformOrigin: 'center center'
      }}
    >
      {content}
    </div>,
    document.body
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
  const { moveItem, createFolder, addAppToFolder, renameFolder, dissolveFolder, reorderFolderApp } =
    useLaunchpadLayoutStore.getState()

  const allVisibleApps = useMemo(() => Array.from(appsMap.values()).filter(a => !a.hidden), [appsMap])

  // Load layout on open
  useEffect(() => {
    if (!loaded && allVisibleApps.length > 0) {
      useLaunchpadLayoutStore.getState().load(allVisibleApps.map(a => a.id))
    }
  }, [loaded, allVisibleApps])

  // --- Drag state ---
  const [dragActive, setDragActive] = useState(false)
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null)
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 })
  const [ghostOffset, setGhostOffset] = useState({ x: 0, y: 0 })
  const [dropGapIndex, setDropGapIndex] = useState<number | null>(null)
  const [mergeTarget, setMergeTarget] = useState<{ index: number; progress: number } | null>(null)

  const dragActiveRef = useRef(false)
  const dragFromIndexRef = useRef<number | null>(null)
  const dropGapIndexRef = useRef<number | null>(null)
  const mergeTimerRef = useRef<{ index: number; enterTime: number; rafId: number } | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const longPressRef = useRef<{ index: number; timerId: ReturnType<typeof setTimeout> } | null>(null)
  const layoutItemsRef = useRef(layoutItems)
  useEffect(() => { layoutItemsRef.current = layoutItems }, [layoutItems])

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

  // Reset drag state on close
  useEffect(() => {
    if (!isOpen) {
      endDrag()
      setOpenFolderIndex(null)
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Search filter ---
  const isSearching = searchQuery.trim().length > 0
  const searchResults = useMemo(() => {
    if (!isSearching) return []
    const q = searchQuery.toLowerCase()
    return allVisibleApps.filter(a =>
      a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q)
    )
  }, [isSearching, searchQuery, allVisibleApps])

  // --- Drag helpers ---
  function clearMergeTimer() {
    if (mergeTimerRef.current?.rafId) cancelAnimationFrame(mergeTimerRef.current.rafId)
    mergeTimerRef.current = null
    setMergeTarget(null)
  }

  function computeDropGap(clientX: number, clientY: number): number {
    const items = layoutItemsRef.current
    const rects = itemRefs.current.slice(0, items.length).map(el => el?.getBoundingClientRect())
    // Grid layout: find the first item whose center is after cursor left-to-right, top-to-bottom
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (!r) continue
      const midX = r.left + r.width / 2
      const midY = r.top + r.height / 2
      if (clientY < midY - 10) return i
      if (Math.abs(clientY - midY) <= r.height / 2 && clientX < midX) return i
    }
    return rects.filter(Boolean).length
  }

  function getHoveredItemIndex(clientX: number, clientY: number): number | null {
    const from = dragFromIndexRef.current
    const items = itemRefs.current.slice(0, layoutItemsRef.current.length)
    for (let i = 0; i < items.length; i++) {
      if (i === from) continue
      const el = items[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      const cz = 0.65
      const cx = r.left + (r.width * (1 - cz)) / 2
      const cy = r.top + (r.height * (1 - cz)) / 2
      if (clientX >= cx && clientX <= cx + r.width * cz && clientY >= cy && clientY <= cy + r.height * cz) return i
    }
    return null
  }

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (!dragActiveRef.current) return
    setGhostPos({ x: e.clientX, y: e.clientY })
    const hoveredIdx = getHoveredItemIndex(e.clientX, e.clientY)

    if (hoveredIdx !== null) {
      setDropGapIndex(null)
      dropGapIndexRef.current = null
      if (mergeTimerRef.current?.index === hoveredIdx) return
      clearMergeTimer()
      const enterTime = Date.now()
      const animate = () => {
        const progress = Math.min((Date.now() - enterTime) / FOLDER_HOVER_MS, 1)
        setMergeTarget({ index: hoveredIdx, progress })
        if (progress < 1) {
          if (mergeTimerRef.current) mergeTimerRef.current.rafId = requestAnimationFrame(animate)
        } else {
          const from = dragFromIndexRef.current
          if (from !== null && from !== hoveredIdx) {
            const items = layoutItemsRef.current
            const fromItem = items[from]
            const ontoItem = items[hoveredIdx]
            if (fromItem?.type === 'app') {
              if (ontoItem?.type === 'folder') addAppToFolder(from, ontoItem.id)
              else createFolder(from, hoveredIdx)
            } else if (fromItem?.type === 'folder' && ontoItem?.type === 'folder') {
              const merged: LaunchpadItem = { ...fromItem, appIds: [...ontoItem.appIds, ...fromItem.appIds] }
              const newItems = items.filter((_, i) => i !== from && i !== hoveredIdx)
              newItems.splice(Math.min(from, hoveredIdx), 0, merged)
              useLaunchpadLayoutStore.getState().setItems(newItems)
            }
          }
          endDrag()
        }
      }
      mergeTimerRef.current = { index: hoveredIdx, enterTime, rafId: requestAnimationFrame(animate) }
    } else {
      clearMergeTimer()
      const gapIdx = computeDropGap(e.clientX, e.clientY)
      setDropGapIndex(gapIdx)
      dropGapIndexRef.current = gapIdx
    }
  }, [addAppToFolder, createFolder]) // eslint-disable-line react-hooks/exhaustive-deps

  function endDrag() {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    window.removeEventListener('mouseup', handleGlobalMouseUp)
    clearMergeTimer()
    dragActiveRef.current = false
    setDragActive(false)
    setDragFromIndex(null)
    dragFromIndexRef.current = null
    setDropGapIndex(null)
    dropGapIndexRef.current = null
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleGlobalMouseUp = useCallback(() => {
    const from = dragFromIndexRef.current
    const gapIdx = dropGapIndexRef.current
    if (from !== null && gapIdx !== null) moveItem(from, gapIdx)
    endDrag()
  }, [moveItem]) // eslint-disable-line react-hooks/exhaustive-deps

  function activateDrag(index: number, x: number, y: number, offX: number, offY: number) {
    dragActiveRef.current = true
    dragFromIndexRef.current = index
    setDragActive(true)
    setDragFromIndex(index)
    setGhostPos({ x, y })
    setGhostOffset({ x: offX, y: offY })
    setOpenFolderIndex(null)
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
  }

  function handleItemMouseDown(index: number, e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = itemRefs.current[index]
    const rect = el?.getBoundingClientRect()
    const offX = rect ? e.clientX - rect.left : 0
    const offY = rect ? e.clientY - rect.top : 0
    const startX = e.clientX
    const startY = e.clientY

    if (longPressRef.current) clearTimeout(longPressRef.current.timerId)
    const timerId = setTimeout(() => {
      longPressRef.current = null
      activateDrag(index, startX, startY, offX, offY)
    }, LONG_PRESS_MS)
    longPressRef.current = { index, timerId }

    const cancel = (me: MouseEvent) => {
      if (Math.abs(me.clientX - startX) > DRAG_MOVE_THRESHOLD || Math.abs(me.clientY - startY) > DRAG_MOVE_THRESHOLD) {
        if (longPressRef.current?.timerId) { clearTimeout(longPressRef.current.timerId); longPressRef.current = null }
        cleanup()
      }
    }
    const cleanup = () => {
      window.removeEventListener('mousemove', cancel)
      window.removeEventListener('mouseup', cleanup)
    }
    window.addEventListener('mousemove', cancel)
    window.addEventListener('mouseup', cleanup)
  }

  function handleFolderContextMenu(e: React.MouseEvent, folderId: string, folderName: string) {
    e.preventDefault()
    e.stopPropagation()
    if (dragActive) return
    showCtxMenu(e.clientX, e.clientY, [
      {
        id: 'dissolve',
        label: '解散文件夹',
        action: () => dissolveFolder(folderId)
      }
    ], { compact: true })
  }

  const handleLaunch = useCallback(() => {
    close()
    setOpenFolderIndex(null)
  }, [close])

  const openFolder = useLaunchpadStore(s => s.openFolder)
  const closeFolder = useLaunchpadStore(s => s.closeFolder)

  // Determine ghost item
  const ghostItem = dragFromIndex !== null ? layoutItems[dragFromIndex] : null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="vos-launchpad"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={e => { if (e.target === e.currentTarget) { if (openFolderIndex !== null) setOpenFolderIndex(null); else close() } }}
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
              {isSearching ? (
                searchResults.map((app, i) => (
                  <LaunchpadAppIcon key={app.id} app={app} index={i} onLaunch={handleLaunch} />
                ))
              ) : (
                layoutItems.map((item, index) => {
                  const isDraggingThis = dragActive && dragFromIndex === index
                  const mProgress = mergeTarget?.index === index ? mergeTarget.progress : undefined

                  if (item.type === 'app') {
                    const app = appsMap.get(item.appId)
                    if (!app) return null
                    return (
                      <LaunchpadAppIcon
                        key={item.appId}
                        app={app}
                        index={index}
                        isDragging={isDraggingThis}
                        mergeProgress={mProgress}
                        onLaunch={handleLaunch}
                        onMouseDown={e => handleItemMouseDown(index, e)}
                        itemRef={el => { itemRefs.current[index] = el }}
                      />
                    )
                  }

                  return (
                    <LaunchpadFolderIcon
                      key={item.id}
                      folder={item}
                      appsMap={appsMap}
                      index={index}
                      isDragging={isDraggingThis}
                      mergeProgress={mProgress}
                      onClick={() => { if (!dragActive) setOpenFolderIndex(openFolderIndex === index ? null : index) }}
                      onMouseDown={e => handleItemMouseDown(index, e)}
                      onContextMenu={e => handleFolderContextMenu(e, item.id, item.name)}
                      itemRef={el => { itemRefs.current[index] = el }}
                    />
                  )
                })
              )}
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
            {openFolderIndex !== null && (() => {
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
                  onReorderApp={(fromIdx, gapIdx) => reorderFolderApp(item.id, fromIdx, gapIdx)}
                  onDissolve={() => { dissolveFolder(item.id); setOpenFolderIndex(null) }}
                />
              )
            })()}
          </AnimatePresence>

          {/* Drag ghost */}
          {dragActive && ghostItem && (
            <DragGhost
              item={ghostItem}
              appsMap={appsMap}
              x={ghostPos.x}
              y={ghostPos.y}
              offX={ghostOffset.x}
              offY={ghostOffset.y}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

