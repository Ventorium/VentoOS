/**
 * AppPreferences UIKit — Unified Preferences Dialog for Applications
 *
 * Opens as a sheet/dialog overlay within the app window.
 * Consistent macOS system preferences style: sidebar + content.
 *
 * Each app defines preference categories and renders them via this component.
 *
 * Usage:
 *   const [open, setOpen] = useState(false)
 *
 *   <AppPreferencesSheet open={open} onClose={() => setOpen(false)} appName="Kubernetes" categories={[...]}>
 *     (renders automatically)
 *   </AppPreferencesSheet>
 */
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FormSelect } from '@/components/ui'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PreferenceCategory {
  id: string
  label: string
  icon?: ReactNode
  content: ReactNode
}

export interface AppPreferencesProps {
  /** Display name of the app (shown in title) */
  appName: string
  /** List of preference categories */
  categories: PreferenceCategory[]
  /** Initial active category id */
  defaultCategory?: string
}

// ─── Sidebar Item ────────────────────────────────────────────────────────────

function PrefNavItem({
  category,
  isActive,
  onClick
}: {
  category: PreferenceCategory
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`vos-settings-nav-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      {category.icon && <span className="w-4 flex items-center justify-center shrink-0">{category.icon}</span>}
      <span>{category.label}</span>
    </button>
  )
}

// ─── AppPreferences ──────────────────────────────────────────────────────────

export function AppPreferences({ appName, categories, defaultCategory }: AppPreferencesProps) {
  const [activeId, setActiveId] = useState(defaultCategory ?? categories[0]?.id ?? '')
  const activeCategory = categories.find(c => c.id === activeId)
  const title = `${appName}偏好设置`

  useEffect(() => {
    const nextActiveId = categories.some(c => c.id === activeId)
      ? activeId
      : defaultCategory ?? categories[0]?.id ?? ''

    if (nextActiveId !== activeId) {
      setActiveId(nextActiveId)
    }
  }, [activeId, categories, defaultCategory])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-[180px] shrink-0 border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)] flex flex-col p-2 overflow-y-auto">
        <div className="text-[11px] font-bold text-[var(--vos-text-tertiary)] uppercase tracking-[0.06em] px-2 pt-1 pb-2">
          {title}
        </div>

        {categories.map(cat => (
          <PrefNavItem key={cat.id} category={cat} isActive={activeId === cat.id} onClick={() => setActiveId(cat.id)} />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeCategory && (
          <motion.div
            key={activeId}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
            className="h-full overflow-y-auto"
          >
            {activeCategory.content}
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ─── PreferenceSection ────────────────────────────────────────────────────────

/** Wraps a section of preference content with standard padding and title. */
export function PreferenceSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="vos-settings-content">
      {title && <h2 className="vos-settings-section-title">{title}</h2>}
      {children}
    </div>
  )
}

// ─── PreferenceGroup ─────────────────────────────────────────────────────────

/** A labeled group within a preference section. */
export function PreferenceGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="vos-settings-group">
      {label && <label className="vos-settings-label">{label}</label>}
      {children}
    </div>
  )
}

// ─── PreferenceRow ────────────────────────────────────────────────────────────

/** A single row within a preference group (label + value/control). */
export function PreferenceRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="vos-settings-toggle-row">
      <div>
        <div className="text-[14px] font-medium text-[var(--vos-text-primary)]">{label}</div>
        {description && <div className="text-xs text-[var(--vos-text-secondary)] mt-[2px]">{description}</div>}
      </div>
      {children}
    </div>
  )
}

// ─── PreferenceInput ─────────────────────────────────────────────────────────

/** Styled text input for use in preference forms. */
export function PreferenceInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`vos-input border-[0.5px] border-solid border-[var(--vos-border-subtle)] ${props.className ?? ''}`}
      style={props.style}
    />
  )
}

// ─── PreferenceSelect ─────────────────────────────────────────────────────────

/** Styled select/dropdown for use in preference forms. */
export function PreferenceSelect({
  value,
  onChange,
  options,
  placeholder,
  ...rest
}: {
  value?: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <FormSelect
      {...rest}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      variant="toolbar"
      className={rest.className}
      wrapperClassName="w-full"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </FormSelect>
  )
}

// ─── PreferenceToggle ─────────────────────────────────────────────────────────

/** ios-style toggle switch. */
export function PreferenceToggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={`vos-toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-label={label}
    >
      <div className="vos-toggle-thumb" />
    </button>
  )
}

// ─── AppPreferencesSheet ──────────────────────────────────────────────────────

export interface AppPreferencesSheetProps extends AppPreferencesProps {
  /** Whether the sheet is open */
  open: boolean
  /** Called when user requests to close */
  onClose: () => void
}

/**
 * Full overlay "popup window" style preferences sheet.
 * Renders as a draggable floating panel within the app window.
 */
export function AppPreferencesSheet({ open, onClose, ...prefsProps }: AppPreferencesSheetProps) {
  const title = `${prefsProps.appName}偏好设置`
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [initialized, setInitialized] = useState(false)
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 })

  const centerPosition = useCallback(() => {
    const parentEl = panelRef.current?.parentElement
    const parentW = parentEl?.clientWidth ?? 800
    const panelW = Math.min(760, parentW - 8)
    return { x: Math.max(0, (parentW - panelW) / 2), y: 16 }
  }, [])

  // Center panel on first open
  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true)
      setPos(centerPosition())
    }
    if (!open) setInitialized(false)
  }, [open, initialized, centerPosition])

  // Auto-restore when panel is completely out of its parent bounds
  useEffect(() => {
    if (!open) return
    const check = () => {
      const panel = panelRef.current
      const parent = panel?.parentElement
      if (!panel || !parent) return
      const pr = parent.getBoundingClientRect()
      const nr = panel.getBoundingClientRect()
      // If no part of the panel is visible within the parent
      if (nr.right <= pr.left || nr.left >= pr.right || nr.bottom <= pr.top || nr.top >= pr.bottom) {
        setPos(centerPosition())
      }
    }
    // Check on resize and after drag
    const observer = new ResizeObserver(check)
    if (panelRef.current?.parentElement) observer.observe(panelRef.current.parentElement)
    return () => observer.disconnect()
  }, [open, centerPosition])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    // Only drag from title area, not from close button
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y
    }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.dragging) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({
        x: dragRef.current.originX + dx,
        y: Math.max(0, dragRef.current.originY + dy)
      })
    }

    const onUp = () => {
      dragRef.current.dragging = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Check visibility after drag ends
      setTimeout(() => {
        const panel = panelRef.current
        const parent = panel?.parentElement
        if (!panel || !parent) return
        const pr = parent.getBoundingClientRect()
        const nr = panel.getBoundingClientRect()
        if (nr.right <= pr.left || nr.left >= pr.right || nr.bottom <= pr.top || nr.top >= pr.bottom) {
          setPos(centerPosition())
        }
      }, 0)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos.x, pos.y, centerPosition])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-[120] pointer-events-none">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[rgba(10,14,22,0.18)] backdrop-blur-[1px] pointer-events-auto"
            onClick={onClose}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="absolute rounded-xl overflow-hidden border-[0.5px] border-solid border-[var(--vos-border-subtle)] shadow-[0_24px_72px_rgba(0,0,0,.24),0_6px_20px_rgba(0,0,0,.16)] flex flex-col pointer-events-auto"
            style={{
              left: pos.x,
              top: pos.y,
              width: 'min(760px, calc(100% - 8px))',
              height: 'min(520px, calc(100% - 8px))',
              backdropFilter: 'blur(48px) saturate(200%)',
              WebkitBackdropFilter: 'blur(48px) saturate(200%)'
            }}
          >
            {/* Mini title bar — draggable */}
            <div
              className="h-[40px] flex items-center justify-between px-3 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] shrink-0 cursor-grab active:cursor-grabbing select-none"
              onMouseDown={onDragStart}
            >
              <span className="text-[13px] font-semibold text-[var(--vos-text-primary)]">
                {title}
              </span>
              <button
                type="button"
                className="vos-btn-icon w-[22px] h-[22px] rounded-[6px] text-[var(--vos-text-tertiary)]"
                onClick={onClose}
                aria-label="关闭偏好设置"
              >
                <X size={13} />
              </button>
            </div>

            {/* Preferences content */}
            <div className="flex-1 overflow-hidden min-h-0">
              <AppPreferences {...prefsProps} />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ─── useAppPreferences ────────────────────────────────────────────────────────

/**
 * Hook to manage the open/close state of an app preferences sheet.
 */
export function useAppPreferences() {
  const [open, setOpen] = useState(false)
  return {
    open,
    openPreferences: () => setOpen(true),
    closePreferences: () => setOpen(false),
    togglePreferences: () => setOpen(v => !v)
  }
}
