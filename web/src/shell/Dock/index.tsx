/**
 * Dock — Application Launcher Bar
 *
 * Features:
 * - Spring hover magnification
 * - Running indicator dot
 * - Long-press drag to reorder (500ms hold)
 * - Drag onto another icon for 2s to create/merge folder
 * - Folder: 3×3 preview grid in dock, full popup on click
 * - Folder: rename (click name → edit → Enter/Esc)
 * - Folder: drag-sort inside popup
 * - Layout persisted to backend
 */
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Grid3X3 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { clsx } from 'clsx'
import {
  type AppManifest,
  closeWindow,
  focusWindow,
  minimizeWindow,
  openWindow,
  restoreWindow,
  useAppStore,
  useWindowStore
} from '@/kernel'
import { useSettingsStore } from '@/services/settings'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { useLaunchpadStore } from '@/shell/Launchpad/store'
import { tokens } from '@/theme'
import type { DockFolderItem, DockItem } from './dockLayoutStore'
import { useDockLayoutStore } from './dockLayoutStore'
import { useDockPositionStore } from './dockPositionStore'

const { gap } = tokens.dock
const HOVER_SCALE = 1.45
const NEIGHBOR_SCALE = 1.0
const LONG_PRESS_MS = 500
const FOLDER_HOVER_MS = 2000
const DRAG_MOVE_THRESHOLD = 5

/* ─── SVG circular progress ring for folder hover ─── */
function FolderHoverRing({ progress, size }: { progress: number; size: number }) {
  const r = size / 2 - 3
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - progress)
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
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

/* ─── DockIcon ─── */
function DockIcon({
  label,
  icon,
  isRunning,
  appId,
  onClick,
  onContextMenu,
  mouseX,
  iconSize,
  magnification,
  isHorizontal,
  isDragActive,
  onMouseDown,
  mergeProgress
}: {
  label: string
  icon: React.ReactNode
  isRunning?: boolean
  appId?: string
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  mouseX: ReturnType<typeof useMotionValue<number>>
  iconSize: number
  magnification: boolean
  isHorizontal: boolean
  isDragActive?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  mergeProgress?: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [bouncing, setBouncing] = useState(false)
  const registerIconRect = useDockPositionStore(s => s.registerIconRect)

  useEffect(() => {
    if (!appId || !ref.current) return
    const updateRect = () => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      registerIconRect(appId, { x: r.x, y: r.y, width: r.width, height: r.height })
    }
    updateRect()
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [appId, registerIconRect])

  const distance = useTransform(mouseX, val => {
    if (!ref.current) return 999
    const rect = ref.current.getBoundingClientRect()
    const center = isHorizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2
    return Math.abs(val - center)
  })

  const shouldMagnify = magnification && !isDragActive
  const scale = useSpring(
    useTransform(distance, [0, 40, 80], shouldMagnify ? [HOVER_SCALE, NEIGHBOR_SCALE, 1] : [1, 1, 1]),
    { stiffness: 350, damping: 30, mass: 0.5 }
  )
  const y = useSpring(
    useTransform(distance, [0, 40, 80], isHorizontal && shouldMagnify ? [-14, -4, 0] : [0, 0, 0]),
    { stiffness: 350, damping: 30 }
  )
  const x = useSpring(
    useTransform(distance, [0, 40, 80], !isHorizontal && shouldMagnify ? [14, 4, 0] : [0, 0, 0]),
    { stiffness: 350, damping: 30 }
  )

  function handleClick() {
    if (!isRunning) {
      setBouncing(true)
      setTimeout(() => setBouncing(false), 600)
    }
    onClick()
  }

  return (
    <div
      className={clsx('relative flex items-center', isHorizontal ? 'flex-col' : 'flex-row')}
      onMouseDown={onMouseDown}
    >
      {hovered && !isDragActive && (
        <motion.div
          initial={{ opacity: 0, y: isHorizontal ? 4 : 0, x: isHorizontal ? 0 : -4 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          className={`vos-dock-tooltip ${!isHorizontal ? 'vos-dock-tooltip-left' : ''}`}
          style={isHorizontal ? { bottom: iconSize + 14 } : { left: iconSize + 12, top: '50%' }}
        >
          {label}
        </motion.div>
      )}

      <div className="relative">
        {mergeProgress !== undefined && mergeProgress > 0 && (
          <FolderHoverRing progress={mergeProgress} size={iconSize} />
        )}
        <motion.button
          ref={ref}
          type="button"
          className="vos-dock-icon"
          style={{ scale, y, x, width: iconSize, height: iconSize }}
          onClick={handleClick}
          onContextMenu={onContextMenu}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          animate={bouncing ? { y: [0, -16, 0, -8, 0] } : {}}
          transition={bouncing ? { duration: 0.5, ease: 'easeInOut' } : {}}
        >
          <div
            className="vos-dock-icon-inner overflow-hidden"
            style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.22 }}
          >
            {icon}
          </div>
        </motion.button>
      </div>

      {isRunning && <div className={`vos-dock-dot ${!isHorizontal ? 'vos-dock-dot-left' : ''}`} />}
    </div>
  )
}

/* ─── DockFolderIcon (3×3 mini grid preview) ─── */
function DockFolderIcon({
  folder,
  appsMap,
  iconSize,
  isHorizontal,
  mouseX,
  magnification,
  isDragActive,
  onMouseDown,
  onClick,
  onContextMenu,
  mergeProgress
}: {
  folder: DockFolderItem
  appsMap: Map<string, AppManifest>
  iconSize: number
  isHorizontal: boolean
  mouseX: ReturnType<typeof useMotionValue<number>>
  magnification: boolean
  isDragActive: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  mergeProgress?: number
}) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  const distance = useTransform(mouseX, val => {
    if (!ref.current) return 999
    const rect = ref.current.getBoundingClientRect()
    const center = isHorizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2
    return Math.abs(val - center)
  })

  const shouldMagnify = magnification && !isDragActive
  const scale = useSpring(
    useTransform(distance, [0, 40, 80], shouldMagnify ? [HOVER_SCALE, NEIGHBOR_SCALE, 1] : [1, 1, 1]),
    { stiffness: 350, damping: 30, mass: 0.5 }
  )
  const y = useSpring(
    useTransform(distance, [0, 40, 80], isHorizontal && shouldMagnify ? [-14, -4, 0] : [0, 0, 0]),
    { stiffness: 350, damping: 30 }
  )
  const x = useSpring(
    useTransform(distance, [0, 40, 80], !isHorizontal && shouldMagnify ? [14, 4, 0] : [0, 0, 0]),
    { stiffness: 350, damping: 30 }
  )

  const previewAppIds = folder.appIds.slice(0, 9)
  const miniSize = iconSize * 0.28
  const miniPad = iconSize * 0.08

  return (
    <div
      className={clsx('relative flex items-center', isHorizontal ? 'flex-col' : 'flex-row')}
      onMouseDown={onMouseDown}
    >
      {hovered && !isDragActive && (
        <motion.div
          initial={{ opacity: 0, y: isHorizontal ? 4 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          className="vos-dock-tooltip"
          style={isHorizontal ? { bottom: iconSize + 14 } : { left: iconSize + 12, top: '50%' }}
        >
          {folder.name}
        </motion.div>
      )}

      <div className="relative">
        {mergeProgress !== undefined && mergeProgress > 0 && (
          <FolderHoverRing progress={mergeProgress} size={iconSize} />
        )}
        <motion.button
          ref={ref}
          type="button"
          className="vos-dock-icon"
          style={{ scale, y, x, width: iconSize, height: iconSize }}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div
            className="vos-dock-icon-inner overflow-hidden vos-flex-center"
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: iconSize * 0.22,
              background: 'rgba(100,100,100,0.35)',
              padding: miniPad
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 2,
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyItems: 'center'
              }}
            >
              {previewAppIds.map(appId => {
                const app = appsMap.get(appId)
                return (
                  <div
                    key={appId}
                    style={{
                      width: miniSize,
                      height: miniSize,
                      borderRadius: miniSize * 0.22,
                      overflow: 'hidden',
                      flexShrink: 0
                    }}
                  >
                    {app?.icon ?? null}
                  </div>
                )
              })}
            </div>
          </div>
        </motion.button>
      </div>
    </div>
  )
}

/* ─── Drop gap indicator ─── */
function DropGapIndicator({ iconSize, isHorizontal }: { iconSize: number; isHorizontal: boolean }) {
  return (
    <div
      style={{
        width: isHorizontal ? 2 : iconSize * 0.8,
        height: isHorizontal ? iconSize * 0.8 : 2,
        background: 'rgba(255,255,255,0.8)',
        borderRadius: 2,
        alignSelf: 'center',
        flexShrink: 0,
        boxShadow: '0 0 6px rgba(255,255,255,0.6)',
        zIndex: 5
      }}
    />
  )
}

/* ─── DockSeparator ─── */
function DockSeparator({ iconSize, isHorizontal }: { iconSize: number; isHorizontal: boolean }) {
  return (
    <div
      style={{
        width: isHorizontal ? 1 : iconSize * 0.6,
        height: isHorizontal ? iconSize * 0.6 : 1,
        background: 'var(--vos-border-default)',
        margin: '0 4px',
        alignSelf: 'center'
      }}
    />
  )
}

/* ─── Minimized Thumbnail ─── */
function MinimizedThumbnail({
  win,
  iconSize,
  isHorizontal
}: {
  win: { id: string; title: string; appId: string }
  iconSize: number
  isHorizontal: boolean
}) {
  const appManifest = useAppStore(s => s.apps.get(win.appId))
  return (
    <motion.button
      type="button"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      whileHover={{ scale: 1.12 }}
      onClick={() => restoreWindow(win.id)}
      title={win.title}
      className="vos-flex-center shrink-0 overflow-hidden p-0 cursor-pointer bg-[var(--vos-bg-input)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]"
      style={{ width: iconSize * 0.7, height: iconSize * 0.7, borderRadius: iconSize * 0.15 }}
    >
      <div className="opacity-70" style={{ width: iconSize * 0.35, height: iconSize * 0.35 }}>
        {appManifest?.icon ?? null}
      </div>
    </motion.button>
  )
}

/* ─── Folder Popup ─── */
function FolderPopup({
  folder,
  anchorRect,
  dockPosition,
  appsMap,
  windows,
  iconSize,
  onClose,
  onOpenApp,
  onRename,
  onReorderApp
}: {
  folder: DockFolderItem
  anchorRect: DOMRect
  dockPosition: string
  appsMap: Map<string, AppManifest>
  windows: { appId: string }[]
  iconSize: number
  onClose: () => void
  onOpenApp: (appId: string) => void
  onRename: (name: string) => void
  onReorderApp: (fromIdx: number, gapIdx: number) => void
}) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(folder.name)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const [folderDrag, setFolderDrag] = useState<{
    fromIdx: number
    ghostX: number
    ghostY: number
    offsetX: number
    offsetY: number
    dropGapIdx: number | null
  } | null>(null)
  const folderItemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (isRenaming) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [isRenaming])

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handleDown), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleDown)
    }
  }, [onClose])

  const popupWidth = 256
  const appItemSize = iconSize * 0.85
  const popupStyle: React.CSSProperties = { position: 'fixed', zIndex: 3000 }

  if (dockPosition === 'bottom') {
    const left = Math.max(
      8,
      Math.min(window.innerWidth - popupWidth - 8, anchorRect.left + anchorRect.width / 2 - popupWidth / 2)
    )
    popupStyle.left = left
    popupStyle.bottom = window.innerHeight - anchorRect.top + 12
  } else if (dockPosition === 'left') {
    popupStyle.left = anchorRect.right + 12
    popupStyle.top = Math.max(8, anchorRect.top + anchorRect.height / 2 - 150)
  } else {
    popupStyle.right = window.innerWidth - anchorRect.left + 12
    popupStyle.top = Math.max(8, anchorRect.top + anchorRect.height / 2 - 150)
  }

  function computeFolderDropGap(clientX: number, clientY: number): number {
    const rects = folderItemRefs.current.map(el => el?.getBoundingClientRect())
    let gapIdx = folder.appIds.length
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (!r) continue
      const midX = r.left + r.width / 2
      const midY = r.top + r.height / 2
      // Check if cursor is in the top-left quadrant of this item
      if (clientY < midY) {
        if (clientX < midX) {
          gapIdx = i
          break
        }
      }
    }
    return gapIdx
  }

  function handleFolderItemMouseDown(idx: number, e: React.MouseEvent) {
    e.stopPropagation()
    const el = folderItemRefs.current[idx]
    if (!el) return
    const rect = el.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const startX = e.clientX
    const startY = e.clientY
    let activated = false

    const onMove = (me: MouseEvent) => {
      if (!activated) {
        const dx = Math.abs(me.clientX - startX)
        const dy = Math.abs(me.clientY - startY)
        if (dx < DRAG_MOVE_THRESHOLD && dy < DRAG_MOVE_THRESHOLD) return
        activated = true
        setFolderDrag({ fromIdx: idx, ghostX: me.clientX, ghostY: me.clientY, offsetX, offsetY, dropGapIdx: null })
      }
      const dropGapIdx = computeFolderDropGap(me.clientX, me.clientY)
      setFolderDrag(prev => prev ? { ...prev, ghostX: me.clientX, ghostY: me.clientY, dropGapIdx } : null)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setFolderDrag(prev => {
        if (prev && prev.dropGapIdx !== null) {
          onReorderApp(prev.fromIdx, prev.dropGapIdx)
        }
        return null
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const appIds = folder.appIds

  return ReactDOM.createPortal(
    <>
      <div style={popupStyle}>
        <motion.div
          ref={popupRef}
          initial={{ opacity: 0, scale: 0.92, y: dockPosition === 'bottom' ? 10 : 0 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: dockPosition === 'bottom' ? 10 : 0 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          style={{
            width: popupWidth,
            maxHeight: 380,
            background: 'var(--vos-bg-dock)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRadius: 16,
            border: '0.5px solid var(--vos-border-default)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Folder name header */}
          <div style={{ padding: '12px 14px 6px', textAlign: 'center', flexShrink: 0 }}>
            {isRenaming ? (
              <input
                ref={nameInputRef}
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
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.35)',
                  borderRadius: 6,
                  color: 'var(--vos-text-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '3px 10px',
                  textAlign: 'center',
                  outline: 'none',
                  width: '80%'
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsRenaming(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--vos-text-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: '3px 10px',
                  borderRadius: 6
                }}
                title="点击重命名"
              >
                {folder.name}
              </button>
            )}
          </div>

          {/* App grid (scrollable, drag-sortable) */}
          <div
            style={{
              overflowY: 'auto',
              padding: '4px 14px 14px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              rowGap: 14
            }}
          >
            {appIds.map((appId, idx) => {
              const app = appsMap.get(appId)
              const isRunning = windows.some(w => w.appId === appId)
              const isDraggingThis = folderDrag?.fromIdx === idx

              return (
                <div
                  key={appId}
                  ref={el => { folderItemRefs.current[idx] = el }}
                  style={{ opacity: isDraggingThis ? 0.25 : 1, transition: 'opacity 0.15s' }}
                  onMouseDown={e => handleFolderItemMouseDown(idx, e)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'grab' }}>
                    <button
                      type="button"
                      style={{
                        width: appItemSize,
                        height: appItemSize,
                        borderRadius: appItemSize * 0.22,
                        overflow: 'hidden',
                        border: isRunning ? '2px solid var(--vos-accent-primary)' : '2px solid transparent',
                        cursor: 'pointer',
                        background: 'none',
                        padding: 0,
                        flexShrink: 0
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        onOpenApp(appId)
                        onClose()
                      }}
                    >
                      {app?.icon}
                    </button>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--vos-text-secondary)',
                        textAlign: 'center',
                        maxWidth: appItemSize,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {app?.name ?? appId}
                    </span>
                    {isRunning && (
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: 'var(--vos-accent-primary)',
                          marginTop: -6
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>

      {/* Ghost for internal folder drag */}
      {folderDrag &&
        (() => {
          const app = appsMap.get(folder.appIds[folderDrag.fromIdx])
          return ReactDOM.createPortal(
            <div
              style={{
                position: 'fixed',
                left: folderDrag.ghostX - folderDrag.offsetX,
                top: folderDrag.ghostY - folderDrag.offsetY,
                width: appItemSize,
                height: appItemSize,
                borderRadius: appItemSize * 0.22,
                overflow: 'hidden',
                opacity: 0.8,
                transform: 'scale(1.1)',
                pointerEvents: 'none',
                zIndex: 9999
              }}
            >
              {app?.icon}
            </div>,
            document.body
          )
        })()}
    </>,
    document.body
  )
}

/* ─── Dock Root ─── */
export default function Dock() {
  const appsMap = useAppStore(s => s.apps)
  const allVisibleApps = useMemo(() => Array.from(appsMap.values()).filter(a => !a.hidden), [appsMap])
  const windows = useWindowStore(s => s.windows)
  const minimizedWindows = useMemo(() => windows.filter(w => w.isMinimized), [windows])
  const toggleLaunchpad = useLaunchpadStore(s => s.toggle)
  const showCtxMenu = useContextMenuStore(s => s.show)

  const dockItems = useDockLayoutStore(s => s.items)
  const loaded = useDockLayoutStore(s => s.loaded)
  const setItems = useDockLayoutStore(s => s.setItems)
  const moveItem = useDockLayoutStore(s => s.moveItem)
  const createFolder = useDockLayoutStore(s => s.createFolder)
  const addAppToFolder = useDockLayoutStore(s => s.addAppToFolder)
  const renameFolder = useDockLayoutStore(s => s.renameFolder)
  const reorderFolderApp = useDockLayoutStore(s => s.reorderFolderApp)
  const removeFromFolder = useDockLayoutStore(s => s.removeFromFolder)
  const pinApp = useDockLayoutStore(s => s.pin)
  const unpinApp = useDockLayoutStore(s => s.unpin)

  useEffect(() => {
    if (!loaded && allVisibleApps.length > 0) {
      useDockLayoutStore.getState().load(allVisibleApps.map(a => a.id))
    }
  }, [loaded, allVisibleApps])

  const runningAppIds = useMemo(() => new Set(windows.map(w => w.appId)), [windows])
  const displayItems: DockItem[] = useMemo(() => {
    if (!loaded) return allVisibleApps.map(a => ({ type: 'app' as const, appId: a.id }))
    const pinnedAppIds = new Set(dockItems.flatMap(i => (i.type === 'app' ? [i.appId] : i.appIds)))
    const runningUnpinned = Array.from(appsMap.values())
      .filter(a => !pinnedAppIds.has(a.id) && runningAppIds.has(a.id))
      .map(a => ({ type: 'app' as const, appId: a.id }))
    return [...dockItems, ...runningUnpinned]
  }, [dockItems, loaded, allVisibleApps, appsMap, runningAppIds])

  // ─── Drag state ───
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
  const displayItemsRef = useRef(displayItems)
  useEffect(() => { displayItemsRef.current = displayItems }, [displayItems])

  // ─── Folder popup ───
  const [openFolderIndex, setOpenFolderIndex] = useState<number | null>(null)
  const [folderAnchorRect, setFolderAnchorRect] = useState<DOMRect | null>(null)

  // ─── Settings ───
  const iconSize = useSettingsStore(s => s.dockIconSize)
  const dockPosition = useSettingsStore(s => s.dockPosition)
  const magnification = useSettingsStore(s => s.dockMagnification)
  const autoHide = useSettingsStore(s => s.dockAutoHide)
  const [visible, setVisible] = useState(!autoHide)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mouseX = useMotionValue(999)
  const isHorizontal = dockPosition === 'bottom'

  useEffect(() => setVisible(!autoHide), [autoHide])
  const showDock = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(true)
  }, [])
  const schedulHide = useCallback(() => {
    if (!autoHide) return
    hideTimer.current = setTimeout(() => setVisible(false), 800)
  }, [autoHide])

  // ─── Drag helpers ───
  function clearMergeTimer() {
    if (mergeTimerRef.current?.rafId) cancelAnimationFrame(mergeTimerRef.current.rafId)
    mergeTimerRef.current = null
    setMergeTarget(null)
  }

  function computeDropGap(clientX: number, clientY: number): number {
    const rects = itemRefs.current.slice(0, displayItemsRef.current.length).map(el => el?.getBoundingClientRect())
    const coord = isHorizontal ? clientX : clientY
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (!r) continue
      const mid = isHorizontal ? r.left + r.width / 2 : r.top + r.height / 2
      if (coord < mid) return i
    }
    return rects.filter(Boolean).length
  }

  function getHoveredItemIndex(clientX: number, clientY: number): number | null {
    const from = dragFromIndexRef.current
    const items = itemRefs.current.slice(0, displayItemsRef.current.length)
    for (let i = 0; i < items.length; i++) {
      if (i === from) continue
      const el = items[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      const cz = 0.6
      const cx = r.left + (r.width * (1 - cz)) / 2
      const cy = r.top + (r.height * (1 - cz)) / 2
      if (clientX >= cx && clientX <= cx + r.width * cz && clientY >= cy && clientY <= cy + r.height * cz) {
        return i
      }
    }
    return null
  }

  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragActiveRef.current) return
      setGhostPos({ x: e.clientX, y: e.clientY })
      const hoveredIdx = getHoveredItemIndex(e.clientX, e.clientY)

      if (hoveredIdx !== null) {
        setDropGapIndex(null)
        dropGapIndexRef.current = null
        if (mergeTimerRef.current?.index === hoveredIdx) return // same target, continuing
        clearMergeTimer()
        const enterTime = Date.now()
        const currentHoveredIdx = hoveredIdx
        const animate = () => {
          const elapsed = Date.now() - enterTime
          const progress = Math.min(elapsed / FOLDER_HOVER_MS, 1)
          setMergeTarget({ index: currentHoveredIdx, progress })
          if (progress < 1) {
            if (mergeTimerRef.current) mergeTimerRef.current.rafId = requestAnimationFrame(animate)
          } else {
            const from = dragFromIndexRef.current
            if (from !== null && from !== currentHoveredIdx) {
              const items = displayItemsRef.current
              const fromItem = items[from]
              const ontoItem = items[currentHoveredIdx]
              if (fromItem?.type === 'app') {
                if (ontoItem?.type === 'folder') {
                  addAppToFolder(from, ontoItem.id)
                } else {
                  createFolder(from, currentHoveredIdx)
                }
              } else if (fromItem?.type === 'folder' && ontoItem?.type === 'folder') {
                // Merge two folders
                const merged = { ...fromItem, appIds: [...ontoItem.appIds, ...fromItem.appIds] }
                const newItems = displayItemsRef.current.filter((_, i) => i !== from && i !== currentHoveredIdx)
                const insertAt = Math.min(from, currentHoveredIdx)
                newItems.splice(insertAt, 0, merged)
                setItems(newItems)
              }
            }
            endDrag()
          }
        }
        mergeTimerRef.current = { index: currentHoveredIdx, enterTime, rafId: requestAnimationFrame(animate) }
      } else {
        clearMergeTimer()
        const gapIdx = computeDropGap(e.clientX, e.clientY)
        setDropGapIndex(gapIdx)
        dropGapIndexRef.current = gapIdx
      }
    },
    [addAppToFolder, createFolder, setItems] // eslint-disable-line react-hooks/exhaustive-deps
  )

  function endDrag() {
    window.removeEventListener('mousemove', handleGlobalMouseMove)
    window.removeEventListener('mouseup', handleGlobalMouseUp) // eslint-disable-line @typescript-eslint/no-use-before-define
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
    if (from !== null && gapIdx !== null) {
      moveItem(from, gapIdx)
    }
    endDrag()
  }, [moveItem]) // eslint-disable-line react-hooks/exhaustive-deps

  function activateDrag(index: number, x: number, y: number, offsetX: number, offsetY: number) {
    dragActiveRef.current = true
    dragFromIndexRef.current = index
    setDragActive(true)
    setDragFromIndex(index)
    setGhostPos({ x, y })
    setGhostOffset({ x: offsetX, y: offsetY })
    setOpenFolderIndex(null)
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
  }

  function handleItemMouseDown(index: number, e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()

    const el = itemRefs.current[index]
    const rect = el?.getBoundingClientRect()
    const offsetX = rect ? e.clientX - rect.left : 0
    const offsetY = rect ? e.clientY - rect.top : 0
    const startX = e.clientX
    const startY = e.clientY

    if (longPressRef.current) clearTimeout(longPressRef.current.timerId)

    const timerId = setTimeout(() => {
      longPressRef.current = null
      activateDrag(index, startX, startY, offsetX, offsetY)
    }, LONG_PRESS_MS)

    longPressRef.current = { index, timerId }

    const cancelLongPress = (me: MouseEvent) => {
      const dx = Math.abs(me.clientX - startX)
      const dy = Math.abs(me.clientY - startY)
      if (dx > DRAG_MOVE_THRESHOLD || dy > DRAG_MOVE_THRESHOLD) {
        if (longPressRef.current?.timerId) {
          clearTimeout(longPressRef.current.timerId)
          longPressRef.current = null
        }
        cleanup()
      }
    }
    const cleanup = () => {
      window.removeEventListener('mousemove', cancelLongPress)
      window.removeEventListener('mouseup', cleanup)
    }
    window.addEventListener('mousemove', cancelLongPress)
    window.addEventListener('mouseup', cleanup)
  }

  // ─── Context menus ───
  const handleAppContextMenu = useCallback(
    (e: React.MouseEvent, app: AppManifest) => {
      e.preventDefault()
      e.stopPropagation()
      if (dragActive) return
      const getWindowsByApp = useWindowStore.getState().getWindowsByApp
      const appWindows = getWindowsByApp(app.id)
      const isRunning = appWindows.length > 0
      const isPinned = useDockLayoutStore.getState().isPinned(app.id)
      const ctxItems: import('@/shell/ContextMenu/store').ContextMenuItems = []

      if (isRunning) {
        for (const w of appWindows) {
          ctxItems.push({
            id: `win-${w.id}`,
            label: w.title || app.name,
            action: () => { if (w.isMinimized) restoreWindow(w.id); else focusWindow(w.id) }
          })
        }
        ctxItems.push({ type: 'separator' })
      }
      if (app.multiWindow) {
        ctxItems.push({ id: 'new-window', label: '新建窗口', action: () => openWindow(app.id) })
        ctxItems.push({ type: 'separator' })
      } else if (!isRunning) {
        ctxItems.push({ id: 'open', label: `打开 ${app.name}`, action: () => openWindow(app.id) })
        ctxItems.push({ type: 'separator' })
      }
      const optionsSubmenu: import('@/shell/ContextMenu/store').ContextMenuItems = isPinned
        ? [{ id: 'unpin', label: '从 Dock 中移除', action: () => unpinApp(app.id) }]
        : [{ id: 'pin', label: '固定在 Dock', action: () => pinApp(app.id) }]
      ctxItems.push({ id: 'options', label: '选项', submenu: optionsSubmenu })
      if (isRunning) {
        ctxItems.push({ type: 'separator' })
        const visibleWins = appWindows.filter(w => !w.isMinimized)
        if (visibleWins.length > 0) {
          ctxItems.push({ id: 'hide', label: '隐藏', action: () => { for (const w of visibleWins) minimizeWindow(w.id) } })
        }
        ctxItems.push({ id: 'quit', label: `退出 ${app.name}`, action: () => { for (const w of appWindows) closeWindow(w.id) } })
      }

      const dockPos = useSettingsStore.getState().dockPosition
      const anchor = dockPos === 'bottom' ? ('bottom-left' as const) : dockPos === 'left' ? ('top-right' as const) : ('top-left' as const)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const menuY = dockPos === 'bottom' ? rect.top : e.clientY
      const menuX = dockPos === 'right' ? rect.left : e.clientX
      showCtxMenu(menuX, menuY, ctxItems, { compact: true, anchor, showArrow: dockPos === 'bottom' })
    },
    [dragActive, showCtxMenu, pinApp, unpinApp]
  )

  const handleFolderContextMenu = useCallback(
    (e: React.MouseEvent, folder: DockFolderItem, menuIndex: number) => {
      e.preventDefault()
      e.stopPropagation()
      if (dragActive) return
      const ctxItems: import('@/shell/ContextMenu/store').ContextMenuItems = [
        {
          id: 'open', label: '打开文件夹',
          action: () => {
            const el = itemRefs.current[menuIndex]
            setFolderAnchorRect(el?.getBoundingClientRect() ?? null)
            setOpenFolderIndex(menuIndex)
          }
        },
        { id: 'rename', label: '重命名文件夹',
          action: () => {
            const el = itemRefs.current[menuIndex]
            setFolderAnchorRect(el?.getBoundingClientRect() ?? null)
            setOpenFolderIndex(menuIndex)
            // The FolderPopup will handle renaming, we just open it
          }
        },
        {
          id: 'dissolve', label: '解散文件夹',
          action: () => {
            const newItems: DockItem[] = []
            for (const item of dockItems) {
              if (item.type === 'folder' && item.id === folder.id) {
                for (const appId of item.appIds) newItems.push({ type: 'app', appId })
              } else {
                newItems.push(item)
              }
            }
            setItems(newItems)
          }
        }
      ]
      const dockPos = useSettingsStore.getState().dockPosition
      const anchor = dockPos === 'bottom' ? ('bottom-left' as const) : ('top-right' as const)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      showCtxMenu(e.clientX, dockPos === 'bottom' ? rect.top : e.clientY, ctxItems, { compact: true, anchor, showArrow: dockPos === 'bottom' })
    },
    [dragActive, dockItems, setItems, showCtxMenu]
  )

  // ─── App click ───
  const handleAppClick = useCallback(
    (app: AppManifest) => {
      if (dragActive) return
      const getWindowsByApp = useWindowStore.getState().getWindowsByApp
      const appWindows = getWindowsByApp(app.id).filter(w => !w.isMinimized)
      const allWins = getWindowsByApp(app.id)
      if (allWins.length === 0) {
        openWindow(app.id, { width: app.defaultSize?.width, height: app.defaultSize?.height })
      } else if (appWindows.length === 0) {
        const latest = allWins.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
        restoreWindow(latest.id)
      } else if (!app.multiWindow) {
        focusWindow(appWindows[0].id)
      } else {
        const top = appWindows.reduce((a, b) => (a.zIndex > b.zIndex ? a : b))
        focusWindow(top.id)
      }
    },
    [dragActive]
  )

  // ─── Ghost content ───
  const ghostContent = useMemo(() => {
    if (dragFromIndex === null) return null
    const item = displayItems[dragFromIndex]
    if (!item) return null
    if (item.type === 'app') {
      const app = appsMap.get(item.appId)
      return app ? (
        <div className="vos-dock-icon-inner overflow-hidden" style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.22 }}>
          {app.icon}
        </div>
      ) : null
    }
    const miniSize = iconSize * 0.28
    return (
      <div
        className="vos-dock-icon-inner overflow-hidden vos-flex-center"
        style={{ width: iconSize, height: iconSize, borderRadius: iconSize * 0.22, background: 'rgba(100,100,100,0.35)', padding: iconSize * 0.08 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, width: '100%', height: '100%', alignItems: 'center', justifyItems: 'center' }}>
          {item.appIds.slice(0, 9).map(appId => {
            const app = appsMap.get(appId)
            return (
              <div key={appId} style={{ width: miniSize, height: miniSize, borderRadius: miniSize * 0.22, overflow: 'hidden' }}>
                {app?.icon ?? null}
              </div>
            )
          })}
        </div>
      </div>
    )
  }, [dragFromIndex, displayItems, appsMap, iconSize])

  // ─── Layout styles ───
  const wrapperStyle: React.CSSProperties =
    dockPosition === 'bottom'
      ? { position: 'absolute', bottom: 8, left: '50%', transform: `translateX(-50%) translateY(${!visible && autoHide ? '100%' : '0'})`, transition: 'transform 0.3s ease', zIndex: 2001 }
      : dockPosition === 'left'
        ? { position: 'absolute', left: 8, top: '50%', transform: `translateY(-50%) translateX(${!visible && autoHide ? '-100%' : '0'})`, transition: 'transform 0.3s ease', zIndex: 2001 }
        : { position: 'absolute', right: 8, top: '50%', transform: `translateY(-50%) translateX(${!visible && autoHide ? '100%' : '0'})`, transition: 'transform 0.3s ease', zIndex: 2001 }

  const dockStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: isHorizontal ? 'flex-end' : 'center',
    flexDirection: isHorizontal ? 'row' : 'column',
    gap,
    padding: '12px',
    background: 'var(--vos-bg-dock)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '0.5px solid var(--vos-border-default)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset',
    pointerEvents: 'all'
  }

  const triggerStyle: React.CSSProperties =
    dockPosition === 'bottom'
      ? { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, zIndex: 2001 }
      : dockPosition === 'left'
        ? { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, zIndex: 2001 }
        : { position: 'absolute', right: 0, top: 0, bottom: 0, width: 4, zIndex: 2001 }

  return (
    <>
      {autoHide && !visible && <div style={triggerStyle} onMouseEnter={showDock} />}
      <div
        style={{ ...wrapperStyle, pointerEvents: 'none' }}
        onMouseMove={e => mouseX.set(isHorizontal ? e.clientX : e.clientY)}
        onMouseLeave={() => { mouseX.set(999); schedulHide() }}
        onMouseEnter={showDock}
      >
        <div style={dockStyle}>
          {/* Launchpad — always first, not draggable */}
          <DockIcon
            label="启动台"
            icon={
              <div className="w-full h-full vos-flex-center text-white bg-[linear-gradient(145deg,_#6d28d9_0%,_#4c1d95_100%)]">
                <Grid3X3 size={iconSize * 0.5} className="opacity-85" />
              </div>
            }
            onClick={toggleLaunchpad}
            mouseX={mouseX}
            iconSize={iconSize}
            magnification={magnification}
            isHorizontal={isHorizontal}
            isDragActive={dragActive}
          />

          {displayItems.length > 0 && <DockSeparator isHorizontal={isHorizontal} iconSize={iconSize} />}

          {/* Dock items with drop gap indicators */}
          <div style={{ display: 'flex', alignItems: isHorizontal ? 'flex-end' : 'center', flexDirection: isHorizontal ? 'row' : 'column', gap }}>
            {displayItems.map((item, index) => {
              const isDraggingThis = dragActive && dragFromIndex === index
              const mProgress = mergeTarget?.index === index ? mergeTarget.progress : undefined
              const showGapBefore = dropGapIndex === index && dragFromIndex !== null && dragFromIndex !== index && dragFromIndex + 1 !== index

              return (
                <div
                  key={item.type === 'app' ? item.appId : item.id}
                  style={{ display: 'flex', alignItems: 'center', flexDirection: isHorizontal ? 'row' : 'column' }}
                >
                  {showGapBefore && <DropGapIndicator iconSize={iconSize} isHorizontal={isHorizontal} />}
                  <div
                    ref={el => { itemRefs.current[index] = el }}
                    style={{ opacity: isDraggingThis ? 0.3 : 1, transition: 'opacity 0.15s' }}
                  >
                    {item.type === 'app' ? (
                      (() => {
                        const app = appsMap.get(item.appId)
                        if (!app) return null
                        return (
                          <DockIcon
                            label={app.name}
                            icon={app.icon}
                            isRunning={windows.some(w => w.appId === app.id)}
                            appId={app.id}
                            onClick={() => handleAppClick(app)}
                            onContextMenu={e => handleAppContextMenu(e, app)}
                            mouseX={mouseX}
                            iconSize={iconSize}
                            magnification={magnification}
                            isHorizontal={isHorizontal}
                            isDragActive={dragActive}
                            onMouseDown={e => handleItemMouseDown(index, e)}
                            mergeProgress={mProgress}
                          />
                        )
                      })()
                    ) : (
                      <DockFolderIcon
                        folder={item}
                        appsMap={appsMap}
                        iconSize={iconSize}
                        isHorizontal={isHorizontal}
                        mouseX={mouseX}
                        magnification={magnification}
                        isDragActive={dragActive}
                        onMouseDown={e => handleItemMouseDown(index, e)}
                        onClick={() => {
                          if (dragActive) return
                          const el = itemRefs.current[index]
                          setFolderAnchorRect(el?.getBoundingClientRect() ?? null)
                          setOpenFolderIndex(openFolderIndex === index ? null : index)
                        }}
                        onContextMenu={e => handleFolderContextMenu(e, item, index)}
                        mergeProgress={mProgress}
                      />
                    )}
                  </div>
                </div>
              )
            })}
            {/* Gap after last item */}
            {dropGapIndex === displayItems.length && dragFromIndex !== null && (
              <DropGapIndicator iconSize={iconSize} isHorizontal={isHorizontal} />
            )}
          </div>

          {/* Minimized thumbnails */}
          {minimizedWindows.length > 0 && (
            <>
              <DockSeparator isHorizontal={isHorizontal} iconSize={iconSize} />
              <div className={clsx('flex items-center gap-1.5', isHorizontal ? 'flex-row' : 'flex-col')}>
                <AnimatePresence>
                  {minimizedWindows.map(w => (
                    <MinimizedThumbnail key={w.id} win={w} iconSize={iconSize} isHorizontal={isHorizontal} />
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Drag ghost via portal */}
      {dragActive && ghostContent &&
        ReactDOM.createPortal(
          <div
            style={{
              position: 'fixed',
              left: ghostPos.x - ghostOffset.x,
              top: ghostPos.y - ghostOffset.y,
              width: iconSize,
              height: iconSize,
              pointerEvents: 'none',
              zIndex: 9999,
              opacity: 0.85,
              transform: 'scale(1.15)',
              transformOrigin: 'top left',
              borderRadius: iconSize * 0.22,
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}
          >
            {ghostContent}
          </div>,
          document.body
        )}

      {/* Folder popup */}
      <AnimatePresence>
        {openFolderIndex !== null && folderAnchorRect && (() => {
          const item = displayItems[openFolderIndex]
          if (!item || item.type !== 'folder') return null
          return (
            <FolderPopup
              key={item.id}
              folder={item}
              anchorRect={folderAnchorRect}
              dockPosition={dockPosition}
              appsMap={appsMap}
              windows={windows}
              iconSize={iconSize}
              onClose={() => setOpenFolderIndex(null)}
              onOpenApp={appId => { const app = appsMap.get(appId); if (app) handleAppClick(app) }}
              onRename={name => renameFolder(item.id, name)}
              onReorderApp={(fromIdx, gapIdx) => reorderFolderApp(item.id, fromIdx, gapIdx)}
            />
          )
        })()}
      </AnimatePresence>
    </>
  )
}
