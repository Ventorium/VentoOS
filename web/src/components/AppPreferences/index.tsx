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
import { useEffect, useState } from 'react'

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
      {category.icon && (
        <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {category.icon}
        </span>
      )}
      <span>{category.label}</span>
    </button>
  )
}

// ─── AppPreferences ──────────────────────────────────────────────────────────

export function AppPreferences({ appName, categories, defaultCategory }: AppPreferencesProps) {
  const [activeId, setActiveId] = useState(defaultCategory ?? categories[0]?.id ?? '')
  const activeCategory = categories.find(c => c.id === activeId)

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--vos-bg-window)',
        overflow: 'hidden'
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: 180,
          flexShrink: 0,
          borderRight: '0.5px solid var(--vos-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          padding: '8px',
          overflowY: 'auto'
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--vos-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '4px 8px 8px'
          }}
        >
          {appName} 偏好设置
        </div>

        {categories.map(cat => (
          <PrefNavItem key={cat.id} category={cat} isActive={activeId === cat.id} onClick={() => setActiveId(cat.id)} />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="wait">
          {activeCategory && (
            <motion.div
              key={activeId}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
              style={{
                height: '100%',
                overflowY: 'auto'
              }}
            >
              {activeCategory.content}
            </motion.div>
          )}
        </AnimatePresence>
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
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--vos-text-primary)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12, color: 'var(--vos-text-secondary)', marginTop: 2 }}>{description}</div>
        )}
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
      className={`vos-input ${props.className ?? ''}`}
      style={{
        border: '0.5px solid var(--vos-border-subtle)',
        ...props.style
      }}
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
    <select
      {...rest}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`vos-select ${rest.className ?? ''}`}
      style={{ border: '0.5px solid var(--vos-border-subtle)', ...rest.style }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
 * Renders centered with a backdrop, keyboard-dismissable.
 */
export function AppPreferencesSheet({ open, onClose, ...prefsProps }: AppPreferencesSheetProps) {
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
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(4px)',
              zIndex: 100
            }}
            onClick={onClose}
          />

          {/* Preferences "window" */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 101,
              pointerEvents: 'none'
            }}
          >
            <div
              style={{
                width: 640,
                height: 460,
                maxWidth: 'calc(100% - 48px)',
                maxHeight: 'calc(100% - 64px)',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--vos-bg-surface)',
                backdropFilter: 'blur(48px) saturate(200%)',
                WebkitBackdropFilter: 'blur(48px) saturate(200%)',
                border: '0.5px solid var(--vos-border-default)',
                boxShadow: '0 24px 72px rgba(0,0,0,0.35), 0 6px 20px rgba(0,0,0,0.18)',
                display: 'flex',
                flexDirection: 'column',
                pointerEvents: 'all'
              }}
            >
              {/* Mini title bar */}
              <div
                style={{
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 12px',
                  borderBottom: '0.5px solid var(--vos-border-subtle)',
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vos-text-primary)' }}>
                  {prefsProps.appName} 偏好设置
                </span>
                <button
                  type="button"
                  className="vos-btn-icon"
                  onClick={onClose}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    color: 'var(--vos-text-tertiary)'
                  }}
                >
                  <X size={13} />
                </button>
              </div>

              {/* Preferences content */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <AppPreferences {...prefsProps} />
              </div>
            </div>
          </motion.div>
        </>
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
