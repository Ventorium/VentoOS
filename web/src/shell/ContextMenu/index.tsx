/**
 * Global Context Menu Component
 *
 * Renders a portal-based context menu at cursor position.
 * Supports nested submenus, separators, icons, keyboard shortcuts, and danger styles.
 * Closes on outside click, escape, or item selection.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { type ContextMenuItems, type MenuItem, useContextMenuStore } from '@/shell/ContextMenu/store'
import { tokens } from '@/theme'

/* ---- Sub Menu ---- */
// NOTE: uses createPortal to escape backdrop-filter containing block on .vos-ctx-panel
function SubMenu({ items, parentRect, compact }: { items: ContextMenuItems; parentRect: DOMRect; compact?: boolean }) {
  // Position to the right of parent, or left if not enough space
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: parentRect.right + 2, top: parentRect.top - 4 })

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    let left = parentRect.right + 2
    let top = parentRect.top - 4
    if (left + rect.width > window.innerWidth - 8) {
      left = parentRect.left - rect.width - 2
    }
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))
    setPos({ left, top })
  }, [parentRect])

  return createPortal(
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed z-[10000]"
      style={{
        left: pos.left,
        top: pos.top
      }}
    >
      <MenuPanel items={items} compact={compact} />
    </motion.div>,
    document.body
  )
}

/* ---- Menu Item Row ---- */
function MenuItemRow({ item, close, compact }: { item: MenuItem; close: () => void; compact?: boolean }) {
  const [showSub, setShowSub] = useState(false)
  const rowRef = useRef<HTMLButtonElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (item.submenu) setShowSub(true)
  }

  const handleMouseLeave = () => {
    if (item.submenu) {
      hideTimerRef.current = setTimeout(() => setShowSub(false), 120)
    }
  }

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        ref={rowRef}
        type="button"
        disabled={item.disabled}
        className={`vos-ctx-item${item.danger ? ' danger' : ''}`}
        style={{
          color: item.danger ? undefined : item.disabled ? 'var(--vos-text-tertiary)' : 'var(--vos-text-primary)',
          cursor: item.disabled ? 'default' : 'pointer',
          background: showSub ? 'var(--vos-accent-primary)' : undefined,
          ...(showSub ? { color: '#fff' } : {})
        }}
        onClick={() => {
          if (item.disabled || item.submenu) return
          item.action?.()
          close()
        }}
      >
        <span className="flex-1 text-left">{item.label}</span>
        {item.shortcut && <span className="vos-ctx-shortcut">{item.shortcut}</span>}
        {item.submenu && <ChevronRight size={12} className="ml-1 opacity-50" />}
      </button>
      {showSub && item.submenu && rowRef.current && (
        <SubMenu items={item.submenu} parentRect={rowRef.current.getBoundingClientRect()} compact={compact} />
      )}
    </div>
  )
}

/* ---- Menu Panel ---- */
function MenuPanel({ items, compact }: { items: ContextMenuItems; compact?: boolean }) {
  return (
    <div
      className={`vos-ctx-panel ${compact ? 'vos-ctx-panel-compact' : ''} py-1 px-0`}
      style={{
        minWidth: compact ? 140 : 180,
        borderRadius: tokens.radius.contextMenu
      }}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={`sep-${i}`} className="vos-ctx-separator" />
        }
        return <MenuItemRow key={item.id} item={item} close={useContextMenuStore.getState().hide} compact={compact} />
      })}
    </div>
  )
}

/* ---- Root Context Menu ---- */
export default function ContextMenu() {
  const { visible, x, y, items, compact, anchor, showArrow, hide } = useContextMenuStore(
    useShallow(s => ({
      visible: s.visible,
      x: s.x,
      y: s.y,
      items: s.items,
      compact: s.compact,
      anchor: s.anchor,
      showArrow: s.showArrow,
      hide: s.hide
    }))
  )
  const menuRef = useRef<HTMLDivElement>(null)
  const [finalPos, setFinalPos] = useState({ left: x, top: y })

  // Adjust position so menu doesn't overflow viewport, respecting anchor
  useEffect(() => {
    if (!visible || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    let left = x
    let top = y

    // Anchor determines the origin point
    if (anchor === 'bottom-left' || anchor === 'bottom-right') {
      // Menu opens upward from the point — add gap for arrow
      top = y - rect.height - (showArrow ? 8 : 0)
    }
    if (anchor === 'top-right' || anchor === 'bottom-right') {
      // Menu opens leftward from the point
      left = x - rect.width
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))
    setFinalPos({ left, top })
  }, [visible, x, y, anchor, showArrow])

  // Close on Escape
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, hide])

  // Arrow (caret) position relative to x click point
  const arrowLeft =
    showArrow && (anchor === 'bottom-left' || anchor === 'top-left')
      ? Math.max(8, Math.min(x - finalPos.left, (menuRef.current?.offsetWidth ?? 180) - 24))
      : undefined

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop to catch outside clicks */}
          <div
            role="presentation"
            className="fixed inset-0 z-[9990]"
            onMouseDown={hide}
            onContextMenu={e => {
              e.preventDefault()
              hide()
            }}
          />

          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: tokens.animation.contextMenu.duration, ease: tokens.animation.contextMenu.ease }}
            className="fixed z-[9995]"
            style={{
              left: finalPos.left,
              top: finalPos.top,
              transformOrigin:
                anchor === 'bottom-left'
                  ? 'bottom left'
                  : anchor === 'bottom-right'
                    ? 'bottom right'
                    : anchor === 'top-right'
                      ? 'top right'
                      : 'top left'
            }}
          >
            <MenuPanel items={items} compact={compact} />
            {/* Arrow caret for dock menus */}
            {showArrow && (anchor === 'bottom-left' || anchor === 'bottom-right') && (
              <div
                style={{
                  position: 'absolute',
                  bottom: -7,
                  left: arrowLeft ?? '50%',
                  transform: arrowLeft !== undefined ? 'translateX(-50%)' : 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '7px solid transparent',
                  borderRight: '7px solid transparent',
                  borderTop: '7px solid var(--vos-bg-context-menu)',
                  filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.15))'
                }}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
