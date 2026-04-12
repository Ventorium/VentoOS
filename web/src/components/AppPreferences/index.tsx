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
        <span className="w-4 flex items-center justify-center shrink-0">
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
      className="flex h-full bg-[var(--vos-bg-window)] overflow-hidden"
    >
      {/* Sidebar */}
      <div
        className="w-[180px] shrink-0 border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)] flex flex-col p-2 overflow-y-auto"
      >
        <div
          className="text-[11px] font-bold text-[var(--vos-text-tertiary)] uppercase tracking-[0.06em] px-2 pt-1 pb-2"
        >
          {appName} 偏好设置
        </div>

        {categories.map(cat => (
          <PrefNavItem key={cat.id} category={cat} isActive={activeId === cat.id} onClick={() => setActiveId(cat.id)} />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeCategory && (
            <motion.div
              key={activeId}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
              className="h-full overflow-y-auto"
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
          <div className="text-[14px] font-medium text-[var(--vos-text-primary)]">{label}</div>
        {description && (
          <div className="text-xs text-[var(--vos-text-secondary)] mt-[2px]">{description}</div>
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
    <select
      {...rest}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className={`vos-select border-[0.5px] border-[var(--vos-border-subtle)] ${rest.className ?? ''}`}
      style={rest.style}
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
            className="absolute inset-0 bg-[rgba(0,0,0,0.35)] backdrop-blur-[4px] z-[100]"
            onClick={onClose}
          />

          {/* Preferences "window" */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 flex items-center justify-center z-[101] pointer-events-none"
          >
            <div
              className="w-[640px] h-[460px] max-w-[calc(100%-48px)] max-h-[calc(100%-64px)] rounded-xl overflow-hidden bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-default)] shadow-[0_24px_72px_rgba(0,0,0,.35),0_6px_20px_rgba(0,0,0,.18)] flex flex-col pointer-events-auto"
              style={{
                backdropFilter: 'blur(48px) saturate(200%)',
                WebkitBackdropFilter: 'blur(48px) saturate(200%)'
              }}
            >
              {/* Mini title bar */}
              <div
                className="h-[38px] flex items-center justify-between px-3 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] shrink-0"
              >
                <span className="text-[13px] font-semibold text-[var(--vos-text-primary)]">
                  {prefsProps.appName} 偏好设置
                </span>
                <button
                  type="button"
                  className="vos-btn-icon w-[22px] h-[22px] rounded-[6px] text-[var(--vos-text-tertiary)]"
                  onClick={onClose}
                >
                  <X size={13} />
                </button>
              </div>

              {/* Preferences content */}
              <div className="flex-1 overflow-hidden">
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
