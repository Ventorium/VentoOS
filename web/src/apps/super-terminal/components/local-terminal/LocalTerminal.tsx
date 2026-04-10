/**
 * LocalTerminal — Multi-pane split terminal
 *
 * Implements a tree-based split layout where each leaf is an independent
 * WebShell (xterm.js) instance. Supports horizontal/vertical splitting,
 * drag-to-resize dividers, and a right-click context menu with clipboard
 * and pane management actions.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

const WebShell = lazy(() => import('@/shell/WebShell'))

// ---------------------------------------------------------------------------
// Split tree types
// ---------------------------------------------------------------------------

type LeafNode = { type: 'leaf'; id: string }
type SplitNodeBranch = {
  type: 'split'
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

// ---------------------------------------------------------------------------
// MIN_SIZE constant
// ---------------------------------------------------------------------------

const MIN_PANE_SIZE = 100
const DIVIDER_SIZE = 4

// ---------------------------------------------------------------------------
// Context menu component
// ---------------------------------------------------------------------------

function ContextMenu({
  x,
  y,
  canClose,
  onCopy,
  onPaste,
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
  onCopy: () => void
  onPaste: () => void
  onClear: () => void
  onScrollToBottom: () => void
  onSplitH: () => void
  onSplitV: () => void
  onClosePane: () => void
  onDismiss: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

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

  const itemStyle: React.CSSProperties = {
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: 13,
    color: '#d4d4d4',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 8
  }

  const handleClick = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
    onDismiss()
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        background: '#252525',
        border: '1px solid #444',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 180,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        userSelect: 'none'
      }}
    >
      <div style={itemStyle} className="ctx-item" onClick={handleClick(onCopy)}>
        复制
      </div>
      <div style={itemStyle} className="ctx-item" onClick={handleClick(onPaste)}>
        粘贴
      </div>
      <div style={itemStyle} className="ctx-item" onClick={handleClick(onClear)}>
        清屏
      </div>
      <div style={itemStyle} className="ctx-item" onClick={handleClick(onScrollToBottom)}>
        滚动至底
      </div>
      <div style={{ height: 1, background: '#444', margin: '4px 8px' }} />
      <div style={itemStyle} className="ctx-item" onClick={handleClick(onSplitH)}>
        水平切分
      </div>
      <div style={itemStyle} className="ctx-item" onClick={handleClick(onSplitV)}>
        垂直切分
      </div>
      {canClose && (
        <>
          <div style={{ height: 1, background: '#444', margin: '4px 8px' }} />
          <div style={{ ...itemStyle, color: '#f14c4c' }} className="ctx-item" onClick={handleClick(onClosePane)}>
            关闭面板
          </div>
        </>
      )}

      {/* Hover styles injected inline via a tiny style tag */}
      <style>{`
        .ctx-item:hover { background: #333 !important; }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resize divider component
// ---------------------------------------------------------------------------

function ResizeDivider({
  direction,
  onDrag
}: {
  direction: 'horizontal' | 'vertical'
  onDrag: (delta: number) => void
}) {
  const dragging = useRef(false)
  const lastPos = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY

      const handleMouseMove = (me: MouseEvent) => {
        if (!dragging.current) return
        const current = direction === 'horizontal' ? me.clientX : me.clientY
        const delta = current - lastPos.current
        if (delta !== 0) {
          onDrag(delta)
          lastPos.current = current
        }
      }

      const handleMouseUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [direction, onDrag]
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        flexShrink: 0,
        width: direction === 'horizontal' ? DIVIDER_SIZE : '100%',
        height: direction === 'horizontal' ? '100%' : DIVIDER_SIZE,
        background: '#333',
        cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
        zIndex: 1,
        transition: 'background 0.15s'
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.background = '#555'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.background = '#333'
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LocalTerminal() {
  const [tree, setTree] = useState<SplitNode>(() => {
    const id = nextPaneId()
    return { type: 'leaf', id }
  })
  const [activePaneId, setActivePaneId] = useState(() => (tree.type === 'leaf' ? tree.id : ''))
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ------- Context menu handlers -------

  const handleContextMenu = useCallback((e: React.MouseEvent, paneId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, paneId })
    setActivePaneId(paneId)
  }, [])

  const dismissContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleCopy = useCallback(() => {
    const selection = window.getSelection()?.toString() || ''
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {
        // Fallback: execCommand is deprecated but works in some contexts
        document.execCommand('copy')
      })
    }
  }, [])

  const handlePaste = useCallback(() => {
    // Read from clipboard and dispatch as keyboard events to the active terminal.
    // WebShell's xterm instance listens on the focused terminal element.
    navigator.clipboard
      .readText()
      .then(text => {
        if (!text) return
        // Find the active terminal's textarea (xterm renders a hidden textarea for input)
        const activeEl = document.activeElement
        if (activeEl && activeEl.classList.contains('xterm-helper-textarea')) {
          // Dispatch via InputEvent so xterm picks it up
          const inputEvent = new InputEvent('input', {
            data: text,
            inputType: 'insertText',
            bubbles: true,
            cancelable: true
          })
          activeEl.dispatchEvent(inputEvent)
        } else {
          // Fallback: find the xterm textarea in the currently active pane
          const paneEl = document.querySelector(`[data-pane-id="${contextMenu?.paneId}"]`)
          const textarea = paneEl?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
          if (textarea) {
            textarea.focus()
            // Use execCommand as a reliable fallback for pasting
            document.execCommand('insertText', false, text)
          }
        }
      })
      .catch(() => {
        // Clipboard read may fail if not in a secure context or permission denied
      })
  }, [contextMenu?.paneId])

  const handleClear = useCallback(() => {
    // Find the xterm textarea in the active pane and send clear escape sequence
    const paneId = contextMenu?.paneId || activePaneId
    const paneEl = document.querySelector(`[data-pane-id="${paneId}"]`)
    const textarea = paneEl?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    if (textarea) {
      textarea.focus()
      // Send 'clear' command followed by enter
      const event = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true })
      textarea.dispatchEvent(event)
    }
  }, [contextMenu?.paneId, activePaneId])

  const handleScrollToBottom = useCallback(() => {
    // Find the xterm viewport in the active pane and scroll to bottom
    const paneId = contextMenu?.paneId || activePaneId
    const paneEl = document.querySelector(`[data-pane-id="${paneId}"]`)
    const viewport = paneEl?.querySelector('.xterm-viewport') as HTMLElement | null
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [contextMenu?.paneId, activePaneId])

  // ------- Split / close handlers -------

  const handleSplit = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      const targetId = contextMenu?.paneId || activePaneId
      if (!targetId) return

      const newPaneId = nextPaneId()
      const splitNode: SplitNodeBranch = {
        type: 'split',
        direction,
        children: [
          { type: 'leaf', id: targetId },
          { type: 'leaf', id: newPaneId }
        ],
        ratio: 0.5
      }

      setTree(prev => replaceLeaf(prev, targetId, splitNode))
      // Focus the new pane
      setTimeout(() => setActivePaneId(newPaneId), 50)
    },
    [contextMenu?.paneId, activePaneId]
  )

  const handleClosePane = useCallback(() => {
    const targetId = contextMenu?.paneId || activePaneId
    if (!targetId) return

    setTree(prev => {
      const result = removeLeaf(prev, targetId)
      if (!result) {
        // Should not happen since we disable close when only 1 pane
        return prev
      }
      return result
    })

    // Set focus to a remaining pane
    setTree(prev => {
      // Find first leaf to focus
      const findFirstLeaf = (n: SplitNode): string => {
        if (n.type === 'leaf') return n.id
        return findFirstLeaf(n.children[0])
      }
      setActivePaneId(findFirstLeaf(prev))
      return prev
    })
  }, [contextMenu?.paneId, activePaneId])

  // ------- Ratio change handler -------

  const handleRatioChange = useCallback((targetNode: SplitNodeBranch, newRatio: number) => {
    setTree(prev => {
      // Deep update: find the matching split node and update its ratio
      const update = (node: SplitNode): SplitNode => {
        if (node.type === 'leaf') return node
        if (node === targetNode) {
          return { ...node, ratio: newRatio }
        }
        return {
          ...node,
          children: [update(node.children[0]), update(node.children[1])]
        }
      }
      return update(prev)
    })
  }, [])

  // ------- Focus handler -------

  const handleFocus = useCallback((paneId: string) => {
    setActivePaneId(paneId)
  }, [])

  // ------- Keyboard shortcut to dismiss context menu -------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const totalLeaves = countLeaves(tree)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#1a1a1a',
        display: 'flex',
        overflow: 'hidden'
      }}
    >
      {/* Wrap tree to inject data-pane-id attributes */}
      <SplitTreeRendererWithPaneIds
        node={tree}
        activePaneId={activePaneId}
        onContextMenu={handleContextMenu}
        onFocus={handleFocus}
        onRatioChange={handleRatioChange}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canClose={totalLeaves > 1}
          onCopy={handleCopy}
          onPaste={handlePaste}
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

// ---------------------------------------------------------------------------
// Extended renderer that injects data-pane-id on leaf containers
// ---------------------------------------------------------------------------

function PaneLeafWithId({
  paneId,
  isActive,
  onContextMenu,
  onFocus
}: {
  paneId: string
  isActive: boolean
  onContextMenu: (e: React.MouseEvent, paneId: string) => void
  onFocus: (paneId: string) => void
}) {
  return (
    <div
      data-pane-id={paneId}
      style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        outline: isActive ? '1px solid #444' : '1px solid transparent',
        transition: 'outline-color 0.15s'
      }}
      onContextMenu={e => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, paneId)
      }}
      onMouseDown={() => onFocus(paneId)}
    >
      <Suspense
        fallback={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#666',
              background: '#0d0d0d'
            }}
          >
            加载中…
          </div>
        }
      >
        <WebShell target="local" />
      </Suspense>
    </div>
  )
}

function SplitTreeRendererWithPaneIds({
  node,
  activePaneId,
  onContextMenu,
  onFocus,
  onRatioChange
}: {
  node: SplitNode
  activePaneId: string
  onContextMenu: (e: React.MouseEvent, paneId: string) => void
  onFocus: (paneId: string) => void
  onRatioChange: (node: SplitNodeBranch, newRatio: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Extract split-specific values (safe defaults for leaf case — hooks must be unconditional)
  const direction = node.type === 'split' ? node.direction : 'horizontal'
  const ratio = node.type === 'split' ? node.ratio : 0.5
  const isHorizontal = direction === 'horizontal'

  const handleDrag = useCallback(
    (delta: number) => {
      if (node.type !== 'split' || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const totalSize = isHorizontal ? containerRect.width : containerRect.height
      const usableSize = totalSize - DIVIDER_SIZE
      if (usableSize <= 0) return

      const currentFirst = usableSize * ratio
      const newFirst = currentFirst + delta
      const clampedFirst = Math.max(MIN_PANE_SIZE, Math.min(usableSize - MIN_PANE_SIZE, newFirst))
      const newRatio = clampedFirst / usableSize

      onRatioChange(node, newRatio)
    },
    [isHorizontal, ratio, node, onRatioChange]
  )

  if (node.type === 'leaf') {
    return (
      <PaneLeafWithId
        paneId={node.id}
        isActive={node.id === activePaneId}
        onContextMenu={onContextMenu}
        onFocus={onFocus}
      />
    )
  }

  const { children } = node
  const firstSize = `calc(${ratio * 100}% - ${DIVIDER_SIZE / 2}px)`
  const secondSize = `calc(${(1 - ratio) * 100}% - ${DIVIDER_SIZE / 2}px)`

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        flex: 1,
        overflow: 'hidden',
        width: '100%',
        height: '100%'
      }}
    >
      <div
        style={{
          width: isHorizontal ? firstSize : '100%',
          height: isHorizontal ? '100%' : firstSize,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column'
        }}
      >
        <SplitTreeRendererWithPaneIds
          node={children[0]}
          activePaneId={activePaneId}
          onContextMenu={onContextMenu}
          onFocus={onFocus}
          onRatioChange={onRatioChange}
        />
      </div>

      <ResizeDivider direction={direction} onDrag={handleDrag} />

      <div
        style={{
          width: isHorizontal ? secondSize : '100%',
          height: isHorizontal ? '100%' : secondSize,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column'
        }}
      >
        <SplitTreeRendererWithPaneIds
          node={children[1]}
          activePaneId={activePaneId}
          onContextMenu={onContextMenu}
          onFocus={onFocus}
          onRatioChange={onRatioChange}
        />
      </div>
    </div>
  )
}
