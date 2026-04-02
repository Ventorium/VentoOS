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
    <div style={{ position: 'relative' }}>
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
        onMouseEnter={() => {
          if (item.submenu) setShowSub(true)
        }}
        onMouseLeave={() => {
          if (item.submenu) setShowSub(false)
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
function MenuPanel({ items }: { items: ContextMenuItems }) {
  return (
    <div
      className="vos-ctx-panel"
      style={{
        minWidth: 180,
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
  const { visible, x, y, items, hide } = useContextMenuStore(
    useShallow(s => ({
      visible: s.visible,
      x: s.x,
      y: s.y,
      items: s.items,
      hide: s.hide
    }))
  )
  const menuRef = useRef<HTMLDivElement>(null)
  const [finalPos, setFinalPos] = useState({ left: x, top: y })

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!visible || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const left = Math.min(x, window.innerWidth - rect.width - 8)
    const top = Math.min(y, window.innerHeight - rect.height - 8)
    setFinalPos({ left, top })
  }, [visible, x, y])

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
              transformOrigin: 'top left'
            }}
          >
            <MenuPanel items={items} />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
