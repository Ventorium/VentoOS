/**
 * LocalTerminal — Multi-pane split terminal
 *
 * Implements a tree-based split layout where each leaf is an independent
 * WebShell (xterm.js) instance. Supports horizontal/vertical splitting,
 * drag-to-resize dividers, and a right-click context menu with clipboard
 * and pane management actions.
 *
 * KEY DESIGN: all WebShell panes are rendered in a flat absolutely-positioned
 * layer so that splitting/closing never unmounts existing terminal instances.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSuperTerminalStore } from '@/apps/super-terminal/store'
import { terminalRegistry } from '@/apps/super-terminal/terminalRegistry'

const WebShell = lazy(() => import('@/shell/WebShell'))

// ---------------------------------------------------------------------------
// Split tree types
// ---------------------------------------------------------------------------

type LeafNode = { type: 'leaf'; id: string }
type SplitNodeBranch = {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: [SplitNode, SplitNode]
  ratio: number
}
type SplitNode = LeafNode | SplitNodeBranch

// ---------------------------------------------------------------------------
// Context menu types
// ---------------------------------------------------------------------------

interface ContextMenuState {
  x: number
  y: number
  paneId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let paneCounter = 0
function nextPaneId(): string {
  return `pane-${++paneCounter}`
}

/** Count total leaf nodes in the tree */
function countLeaves(node: SplitNode): number {
  if (node.type === 'leaf') return 1
  return countLeaves(node.children[0]) + countLeaves(node.children[1])
}

/** Find and replace a leaf node by id, returning a new tree */
function replaceLeaf(node: SplitNode, leafId: string, replacement: SplitNode): SplitNode {
  if (node.type === 'leaf') {
    return node.id === leafId ? replacement : node
  }
  return {
    ...node,
    children: [replaceLeaf(node.children[0], leafId, replacement), replaceLeaf(node.children[1], leafId, replacement)]
  }
}

/** Remove a leaf and collapse its parent split */
function removeLeaf(node: SplitNode, leafId: string): SplitNode | null {
  if (node.type === 'leaf') {
    return node.id === leafId ? null : node
  }

  const [left, right] = node.children
  if (left.type === 'leaf' && left.id === leafId) return right
  if (right.type === 'leaf' && right.id === leafId) return left

  const newLeft = removeLeaf(left, leafId)
  const newRight = removeLeaf(right, leafId)

  if (!newLeft) return newRight
  if (!newRight) return newLeft

  return { ...node, children: [newLeft, newRight] }
}

/** Collect all leaf IDs in the tree */
function collectLeafIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return [node.id]
  return [...collectLeafIds(node.children[0]), ...collectLeafIds(node.children[1])]
}

// ---------------------------------------------------------------------------
// Layout computation (absolute positions as CSS calc expressions)
// ---------------------------------------------------------------------------

const DIVIDER_SIZE = 4

interface CssRect {
  left: string
  top: string
  width: string
  height: string
}

type LayoutMap = Map<string, CssRect>

function fmt(pct: number, px: number): string {
  const pctStr = `${(pct * 100).toFixed(6)}%`
  if (px === 0) return pctStr
  return `calc(${pctStr} ${px > 0 ? '+' : '-'} ${Math.abs(px).toFixed(2)}px)`
}

function computeLayout(
  node: SplitNode,
  lPct = 0,
  lPx = 0,
  tPct = 0,
  tPx = 0,
  wPct = 1,
  wPx = 0,
  hPct = 1,
  hPx = 0,
  map: LayoutMap = new Map()
): LayoutMap {
  if (node.type === 'leaf') {
    map.set(node.id, {
      left: fmt(lPct, lPx),
      top: fmt(tPct, tPx),
      width: fmt(wPct, wPx),
      height: fmt(hPct, hPx)
    })
    return map
  }
  const r = node.ratio
  const D = DIVIDER_SIZE
  if (node.direction === 'horizontal') {
    computeLayout(node.children[0], lPct, lPx, tPct, tPx, wPct * r, wPx * r - D / 2, hPct, hPx, map)
    computeLayout(
      node.children[1],
      lPct + wPct * r,
      lPx + wPx * r + D / 2,
      tPct,
      tPx,
      wPct * (1 - r),
      wPx * (1 - r) - D / 2,
      hPct,
      hPx,
      map
    )
  } else {
    computeLayout(node.children[0], lPct, lPx, tPct, tPx, wPct, wPx, hPct * r, hPx * r - D / 2, map)
    computeLayout(
      node.children[1],
      lPct,
      lPx,
      tPct + hPct * r,
      tPx + hPx * r + D / 2,
      wPct,
      wPx,
      hPct * (1 - r),
      hPx * (1 - r) - D / 2,
      map
    )
  }
  return map
}

// ---------------------------------------------------------------------------
// Divider info
// ---------------------------------------------------------------------------

interface DividerInfo {
  key: string
  direction: 'horizontal' | 'vertical'
  left: string
  top: string
  width: string
  height: string
  node: SplitNodeBranch
  // effective parent size for ratio calculation (px)
  parentEffectivePct: number
  parentEffectivePx: number
  parentIsHorizontal: boolean
}

function computeDividers(
  node: SplitNode,
  lPct = 0,
  lPx = 0,
  tPct = 0,
  tPx = 0,
  wPct = 1,
  wPx = 0,
  hPct = 1,
  hPx = 0,
  acc: DividerInfo[] = []
): DividerInfo[] {
  if (node.type === 'leaf') return acc
  const r = node.ratio
  const D = DIVIDER_SIZE
  if (node.direction === 'horizontal') {
    const divLeft = fmt(lPct + wPct * r, lPx + wPx * r - D / 2)
    const divTop = fmt(tPct, tPx)
    acc.push({
      key: `h-${node.id}`,
      direction: 'horizontal',
      left: divLeft,
      top: divTop,
      width: `${D}px`,
      height: fmt(hPct, hPx),
      node,
      parentEffectivePct: wPct,
      parentEffectivePx: wPx,
      parentIsHorizontal: true
    })
    computeDividers(node.children[0], lPct, lPx, tPct, tPx, wPct * r, wPx * r - D / 2, hPct, hPx, acc)
    computeDividers(
      node.children[1],
      lPct + wPct * r,
      lPx + wPx * r + D / 2,
      tPct,
      tPx,
      wPct * (1 - r),
      wPx * (1 - r) - D / 2,
      hPct,
      hPx,
      acc
    )
  } else {
    const divTop = fmt(tPct + hPct * r, tPx + hPx * r - D / 2)
    acc.push({
      key: `v-${node.id}`,
      direction: 'vertical',
      left: fmt(lPct, lPx),
      top: divTop,
      width: fmt(wPct, wPx),
      height: `${D}px`,
      node,
      parentEffectivePct: hPct,
      parentEffectivePx: hPx,
      parentIsHorizontal: false
    })
    computeDividers(node.children[0], lPct, lPx, tPct, tPx, wPct, wPx, hPct * r, hPx * r - D / 2, acc)
    computeDividers(
      node.children[1],
      lPct,
      lPx,
      tPct + hPct * r,
      tPx + hPx * r + D / 2,
      wPct,
      wPx,
      hPct * (1 - r),
      hPx * (1 - r) - D / 2,
      acc
    )
  }
  return acc
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_PANE_SIZE = 80

// ---------------------------------------------------------------------------
// Context menu component
// ---------------------------------------------------------------------------

function ContextMenu({
  x,
  y,
  canClose,
  commands,
  onCopy,
  onPaste,
  onPasteCommand,
  onClear,
  onScrollToBottom,
  onSplitH,
  onSplitV,
  onClosePane,
  onDismiss
}: {
  x: number
  y: number
  canClose: boolean
  commands: { id: string; name: string; command: string }[]
  onCopy: () => void
  onPaste: () => void
  onPasteCommand: (cmd: string) => void
  onClear: () => void
  onScrollToBottom: () => void
  onSplitH: () => void
  onSplitV: () => void
  onClosePane: () => void
  onDismiss: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [showCmdSub, setShowCmdSub] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onDismiss])

  // Adjust position so menu doesn't overflow viewport
  const [pos, setPos] = useState({ x, y })
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const nx = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : x
    const ny = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  const itemClassName = "flex items-center gap-2 py-1.5 px-4 cursor-pointer text-[13px] text-[#d4d4d4] whitespace-nowrap relative"

  const handleClick = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
    onDismiss()
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-[#252525] border border-[#444] rounded-[6px] py-1 min-w-[185px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] select-none"
      style={{
        left: pos.x,
        top: pos.y
      }}
    >
      <div className={`${itemClassName} ctx-item`} onClick={handleClick(onCopy)}>
        复制
      </div>
      <div className={`${itemClassName} ctx-item`} onClick={handleClick(onPaste)}>
        粘贴
      </div>
      {commands.length > 0 && (
        <div
          className={`${itemClassName} ctx-item justify-between`}
          onMouseEnter={() => setShowCmdSub(true)}
          onMouseLeave={() => setShowCmdSub(false)}
        >
          <span>粘贴常用命令</span>
          <span className="text-[10px] text-[#888]">▶</span>
          {showCmdSub && (
            <div
              className="absolute left-full top-0 bg-[#252525] border border-[#444] rounded-[6px] py-1 min-w-[180px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] z-[10000]"
            >
              {commands.map(cmd => (
                <div
                  key={cmd.id}
                  className={`${itemClassName} ctx-item`}
                  onClick={e => {
                    e.stopPropagation()
                    onPasteCommand(cmd.command)
                    onDismiss()
                  }}
                >
                  {cmd.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={`${itemClassName} ctx-item`} onClick={handleClick(onClear)}>
        清屏
      </div>
      <div className={`${itemClassName} ctx-item`} onClick={handleClick(onScrollToBottom)}>
        滚动至底
      </div>
      <div className="h-px bg-[#444] mx-2 my-1" />
      <div className={`${itemClassName} ctx-item`} onClick={handleClick(onSplitH)}>
        水平切分
      </div>
      <div className={`${itemClassName} ctx-item`} onClick={handleClick(onSplitV)}>
        垂直切分
      </div>
      {canClose && (
        <>
          <div className="h-px bg-[#444] mx-2 my-1" />
          <div className={`${itemClassName} ctx-item text-[#f14c4c]`} onClick={handleClick(onClosePane)}>
            关闭面板
          </div>
        </>
      )}
      {/* Hover styles */}
      <style>{`
        .ctx-item:hover { background: #333 !important; }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drag divider component
// ---------------------------------------------------------------------------

function DragDivider({
  divider,
  onDrag
}: {
  divider: DividerInfo
  onDrag: (node: SplitNodeBranch, delta: number) => void
}) {
  const isHoriz = divider.direction === 'horizontal'
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      lastPos.current = isHoriz ? e.clientX : e.clientY
      document.body.style.cursor = isHoriz ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'

      const handleMove = (me: MouseEvent) => {
        if (!dragging.current) return
        const cur = isHoriz ? me.clientX : me.clientY
        const delta = cur - lastPos.current
        if (delta !== 0) {
          onDrag(divider.node, delta)
          lastPos.current = cur
        }
      }
      const handleUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [isHoriz, divider.node, onDrag]
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute bg-[#2a2a2a] z-10 transition-[background] duration-[120ms]"
      style={{
        left: divider.left,
        top: divider.top,
        width: divider.width,
        height: divider.height,
        cursor: isHoriz ? 'col-resize' : 'row-resize'
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.background = '#444'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.background = '#2a2a2a'
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LocalTerminal() {
  const commands = useSuperTerminalStore(s => s.commands)
  const terminalSettings = useSuperTerminalStore(s => s.terminalSettings)

  const initialId = useRef(nextPaneId()).current
  const [paneIds, setPaneIds] = useState<string[]>([initialId])
  const [tree, setTree] = useState<SplitNode>(() => ({ type: 'leaf', id: initialId }))
  const [activePaneId, setActivePaneId] = useState(initialId)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  // Track container size for ratio calculation
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Compute layout from tree
  const layout = useMemo(() => computeLayout(tree), [tree])
  const dividers = useMemo(() => computeDividers(tree), [tree])
  const totalLeaves = useMemo(() => countLeaves(tree), [tree])

  // ------- Context menu -------

  const handleContextMenu = useCallback((e: React.MouseEvent, paneId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, paneId })
    setActivePaneId(paneId)
  }, [])

  const dismissContextMenu = useCallback(() => setContextMenu(null), [])

  const handleCopy = useCallback(() => {
    const sel = window.getSelection()?.toString() || ''
    if (sel) navigator.clipboard.writeText(sel).catch(() => {})
  }, [])

  const handlePaste = useCallback(() => {
    const paneId = contextMenu?.paneId || activePaneId
    navigator.clipboard.readText().then(text => {
      if (!text) return
      terminalRegistry.get(paneId)?.write(text)
      terminalRegistry.get(paneId)?.focus()
    }).catch(() => {})
  }, [contextMenu?.paneId, activePaneId])

  const handlePasteCommand = useCallback(
    (cmd: string) => {
      const paneId = contextMenu?.paneId || activePaneId
      terminalRegistry.get(paneId)?.write(cmd)
      terminalRegistry.get(paneId)?.focus()
    },
    [contextMenu?.paneId, activePaneId]
  )

  const handleClear = useCallback(() => {
    const paneId = contextMenu?.paneId || activePaneId
    terminalRegistry.get(paneId)?.clear()
  }, [contextMenu?.paneId, activePaneId])

  const handleScrollToBottom = useCallback(() => {
    const paneId = contextMenu?.paneId || activePaneId
    const paneEl = containerRef.current?.querySelector(`[data-pane-id="${paneId}"]`)
    const viewport = paneEl?.querySelector('.xterm-viewport') as HTMLElement | null
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [contextMenu?.paneId, activePaneId])

  // ------- Split -------

  const handleSplit = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      const targetId = contextMenu?.paneId || activePaneId
      if (!targetId) return
      const newPaneId = nextPaneId()
      const splitNode: SplitNodeBranch = {
        type: 'split',
        id: crypto.randomUUID(),
        direction,
        children: [{ type: 'leaf', id: targetId }, { type: 'leaf', id: newPaneId }],
        ratio: 0.5
      }
      setPaneIds(prev => [...prev, newPaneId])
      setTree(prev => replaceLeaf(prev, targetId, splitNode))
      setTimeout(() => setActivePaneId(newPaneId), 50)
    },
    [contextMenu?.paneId, activePaneId]
  )

  // ------- Close pane -------

  const handleClosePane = useCallback(() => {
    const targetId = contextMenu?.paneId || activePaneId
    if (!targetId || totalLeaves <= 1) return

    setTree(prev => {
      const result = removeLeaf(prev, targetId)
      return result ?? prev
    })

    // Remove from flat pane list (cleanup the terminal registry)
    setPaneIds(prev => prev.filter(id => id !== targetId))

    // Focus first remaining leaf
    setTree(prev => {
      const remaining = collectLeafIds(prev).filter(id => id !== targetId)
      if (remaining.length > 0) setActivePaneId(remaining[0])
      return prev
    })
  }, [contextMenu?.paneId, activePaneId, totalLeaves])

  // ------- Ratio change via drag -------

  const handleDrag = useCallback(
    (node: SplitNodeBranch, delta: number) => {
      const containerPixels =
        node.direction === 'horizontal' ? containerSize.w : containerSize.h
      if (containerPixels <= 0) return

      const updateRatio = (n: SplitNode): SplitNode => {
        if (n.type === 'leaf') return n
        if (n.id === node.id) {
          const usableSize = containerPixels - DIVIDER_SIZE
          const currentFirst = usableSize * n.ratio
          const newFirst = currentFirst + delta
          const clamped = Math.max(MIN_PANE_SIZE, Math.min(usableSize - MIN_PANE_SIZE, newFirst))
          return { ...n, ratio: clamped / usableSize }
        }
        return { ...n, children: [updateRatio(n.children[0]), updateRatio(n.children[1])] }
      }
      setTree(prev => updateRatio(prev) as SplitNode)
    },
    [containerSize]
  )

  // ------- Keyboard shortcut to dismiss -------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Active pane IDs (in the current tree)
  const activeTreePaneIds = useMemo(() => collectLeafIds(tree), [tree])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: terminalSettings.backgroundColor }}
    >
      {/* xterm scrollbar visibility fix */}
      <style>{`
        .xterm-viewport::-webkit-scrollbar { width: 6px; }
        .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
        .xterm-viewport::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
        .xterm-viewport::-webkit-scrollbar-thumb:hover { background: #777; }
        .xterm .xterm-viewport { scrollbar-width: thin; scrollbar-color: #555 transparent; }
      `}</style>

      {/* Flat pane layer — terminals are always mounted here, only hidden when removed from tree */}
      {paneIds
        .filter(id => activeTreePaneIds.includes(id))
        .map(paneId => {
          const rect = layout.get(paneId)
          if (!rect) return null
          return (
            <div
              key={paneId}
              data-pane-id={paneId}
              className="absolute overflow-hidden transition-[outline-color] duration-100"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                outline: paneId === activePaneId ? '1px solid #444' : '1px solid transparent'
              }}
              onContextMenu={e => handleContextMenu(e, paneId)}
              onMouseDown={() => setActivePaneId(paneId)}
            >
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full text-[#666] bg-[#0d0d0d]">
                    加载中…
                  </div>
                }
              >
                <WebShell target="local" paneId={paneId} shell={terminalSettings.shell || undefined} />
              </Suspense>
            </div>
          )
        })}

      {/* Divider drag handles */}
      {dividers.map(divider => (
        <DragDivider key={divider.key} divider={divider} onDrag={handleDrag} />
      ))}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canClose={totalLeaves > 1}
          commands={commands}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onPasteCommand={handlePasteCommand}
          onClear={handleClear}
          onScrollToBottom={handleScrollToBottom}
          onSplitH={() => handleSplit('horizontal')}
          onSplitV={() => handleSplit('vertical')}
          onClosePane={handleClosePane}
          onDismiss={dismissContextMenu}
        />
      )}
    </div>
  )
}

