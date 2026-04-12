import { motion } from 'framer-motion'
import { X } from 'lucide-react'

interface PreferenceItem {
  id: string
  label: string
  description?: string
  type: 'switch' | 'select' | 'number' | 'text'
  value: unknown
  onChange: (value: unknown) => void
  options?: { label: string; value: string | number }[]
  min?: number
  max?: number
  step?: number
  suffix?: string
}

interface PreferenceGroup {
  id: string
  title: string
  items: PreferenceItem[]
}

interface PreferencesPanelProps {
  title: string
  groups: PreferenceGroup[]
  onClose: () => void
}

function SwitchControl({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-[36px] h-5 rounded-[10px] border-none cursor-pointer relative transition-[background-color] duration-200 shrink-0"
      style={{ backgroundColor: checked ? 'var(--vos-accent-primary)' : 'var(--vos-border-primary)' }}
    >
      <span
        className="absolute top-[2px] w-4 h-4 rounded-full bg-white transition-[left] duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
        style={{ left: checked ? 18 : 2 }}
      />
    </button>
  )
}

function PrefItemRow({ item }: { item: PreferenceItem }) {
  return (
    <div
      className="flex justify-between items-center py-2 gap-4"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[var(--vos-text-primary)]">{item.label}</div>
        {item.description && (
          <div className="text-[11px] text-[var(--vos-text-tertiary)] mt-[2px]">{item.description}</div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1">
        {item.type === 'switch' && <SwitchControl checked={Boolean(item.value)} onChange={v => item.onChange(v)} />}

        {item.type === 'select' && (
          <select
            value={String(item.value ?? '')}
            onChange={e => {
              const opt = item.options?.find(o => String(o.value) === e.target.value)
              item.onChange(opt?.value ?? e.target.value)
            }}
            className="text-xs px-[6px] py-[3px] rounded-[6px] border border-[var(--vos-border-primary)] bg-[var(--vos-bg-secondary)] text-[var(--vos-text-primary)] outline-none"
          >
            {item.options?.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {item.type === 'number' && (
          <>
            <input
              type="number"
              value={Number(item.value ?? 0)}
              min={item.min}
              max={item.max}
              step={item.step ?? 1}
              onChange={e => item.onChange(Number(e.target.value))}
              className="w-16 text-xs px-[6px] py-[3px] rounded-[6px] border border-[var(--vos-border-primary)] bg-[var(--vos-bg-secondary)] text-[var(--vos-text-primary)] outline-none text-right"
            />
            {item.suffix && <span className="text-[11px] text-[var(--vos-text-tertiary)]">{item.suffix}</span>}
          </>
        )}

        {item.type === 'text' && (
          <input
            type="text"
            value={String(item.value ?? '')}
            onChange={e => item.onChange(e.target.value)}
            className="w-[120px] text-xs px-[6px] py-[3px] rounded-[6px] border border-[var(--vos-border-primary)] bg-[var(--vos-bg-secondary)] text-[var(--vos-text-primary)] outline-none"
          />
        )}
      </div>
    </div>
  )
}

export type { PreferenceGroup, PreferenceItem, PreferencesPanelProps }

export default function PreferencesPanel({ title, groups, onClose }: PreferencesPanelProps) {
  return (
    <div className="vos-modal-overlay" onClick={onClose}>
      <motion.div
        className="vos-modal w-[440px] max-h-[70vh] p-0 rounded-xl"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pt-[14px] pb-3 border-b border-b-[var(--vos-border-secondary)]"
        >
          <span className="text-[15px] font-semibold text-[var(--vos-text-primary)]">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer text-[var(--vos-text-secondary)] p-1 rounded-[6px] flex items-center"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pt-2 pb-4 overflow-y-auto max-h-[calc(70vh-50px)]">
          {groups.map(group => (
            <div key={group.id} className="mt-3">
              <div
                className="text-[11px] font-semibold text-[var(--vos-text-tertiary)] uppercase tracking-[0.04em] mb-1"
              >
                {group.title}
              </div>
              {group.items.map(item => (
                <PrefItemRow key={item.id} item={item} />
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
