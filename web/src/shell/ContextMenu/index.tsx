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
function SubMenu({ items, parentRect }: { items: ContextMenuItems; parentRect: DOMRect }) {
  // Position to the right of parent, or left if not enough space
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: parentRect.right + 2, top: parentRect.top - 8 })

  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    let left = parentRect.right + 2
    const top = Math.min(parentRect.top - 8, window.innerHeight - rect.height - 8)
    if (left + rect.width > window.innerWidth) {
      left = parentRect.left - rect.width - 2
    }
    setPos({ left, top })
  }, [parentRect])

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 9999
      }}
    >
      <MenuPanel items={items} />
    </motion.div>
  )
}

/* ---- Menu Item Row ---- */
function MenuItemRow({ item, close }: { item: MenuItem; close: () => void }) {
  const [showSub, setShowSub] = useState(false)
  const rowRef = useRef<HTMLButtonElement>(null)

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => {
        if (item.submenu) setShowSub(true)
      }}
      onMouseLeave={() => {
        if (item.submenu) setShowSub(false)
      }}
    >
      <button
        ref={rowRef}
        type="button"
        disabled={item.disabled}
        className="vos-ctx-item"
        style={{
          color: item.danger
            ? 'var(--vos-accent-danger)'
            : item.disabled
              ? 'var(--vos-text-tertiary)'
              : 'var(--vos-text-primary)',
          cursor: item.disabled ? 'default' : 'pointer'
        }}
        onClick={() => {
          if (item.disabled || item.submenu) return
          item.action?.()
          close()
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
        {item.shortcut && <span className="vos-ctx-shortcut">{item.shortcut}</span>}
        {item.submenu && <ChevronRight size={12} style={{ marginLeft: 4, opacity: 0.5 }} />}
      </button>
      {showSub && item.submenu && rowRef.current && (
        <SubMenu items={item.submenu} parentRect={rowRef.current.getBoundingClientRect()} />
      )}
    </div>
  )
}

/* ---- Menu Panel ---- */
function MenuPanel({ items, compact }: { items: ContextMenuItems; compact?: boolean }) {
  return (
    <div
      className={`vos-ctx-panel ${compact ? 'vos-ctx-panel-compact' : ''}`}
      style={{
        minWidth: compact ? 140 : 180,
        padding: '4px 0',
        borderRadius: tokens.radius.contextMenu
      }}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={`sep-${i}`} className="vos-ctx-separator" />
        }
        return <MenuItemRow key={item.id} item={item} close={useContextMenuStore.getState().hide} />
      })}
    </div>
  )
}

/* ---- Root Context Menu ---- */
export default function ContextMenu() {
  const { visible, x, y, items, compact, anchor, hide } = useContextMenuStore(
    useShallow(s => ({
      visible: s.visible,
      x: s.x,
      y: s.y,
      items: s.items,
      compact: s.compact,
      anchor: s.anchor,
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
      // Menu opens upward from the point
      top = y - rect.height
    }
    if (anchor === 'top-right' || anchor === 'bottom-right') {
      // Menu opens leftward from the point
      left = x - rect.width
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))
    setFinalPos({ left, top })
  }, [visible, x, y, anchor])

  // Close on Escape
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, hide])

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop to catch outside clicks */}
          <div
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9990
            }}
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
            style={{
              position: 'fixed',
              left: finalPos.left,
              top: finalPos.top,
              zIndex: 9995,
              transformOrigin: anchor === 'bottom-left' ? 'bottom left' : anchor === 'bottom-right' ? 'bottom right' : anchor === 'top-right' ? 'top right' : 'top left'
            }}
          >
            <MenuPanel items={items} compact={compact} />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
