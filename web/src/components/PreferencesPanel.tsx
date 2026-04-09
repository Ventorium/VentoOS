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
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        backgroundColor: checked ? 'var(--vos-accent-primary)' : 'var(--vos-border-primary)',
        position: 'relative',
        transition: 'background-color 0.2s ease',
        flexShrink: 0
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: '#fff',
          transition: 'left 0.2s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        }}
      />
    </button>
  )
}

function PrefItemRow({ item }: { item: PreferenceItem }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 0',
        gap: 16
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--vos-text-primary)' }}>{item.label}</div>
        {item.description && (
          <div style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', marginTop: 2 }}>{item.description}</div>
        )}
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
        {item.type === 'switch' && <SwitchControl checked={Boolean(item.value)} onChange={v => item.onChange(v)} />}

        {item.type === 'select' && (
          <select
            value={String(item.value ?? '')}
            onChange={e => {
              const opt = item.options?.find(o => String(o.value) === e.target.value)
              item.onChange(opt?.value ?? e.target.value)
            }}
            style={{
              fontSize: 12,
              padding: '3px 6px',
              borderRadius: 6,
              border: '1px solid var(--vos-border-primary)',
              backgroundColor: 'var(--vos-bg-secondary)',
              color: 'var(--vos-text-primary)',
              outline: 'none'
            }}
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
              style={{
                width: 64,
                fontSize: 12,
                padding: '3px 6px',
                borderRadius: 6,
                border: '1px solid var(--vos-border-primary)',
                backgroundColor: 'var(--vos-bg-secondary)',
                color: 'var(--vos-text-primary)',
                outline: 'none',
                textAlign: 'right'
              }}
            />
            {item.suffix && <span style={{ fontSize: 11, color: 'var(--vos-text-tertiary)' }}>{item.suffix}</span>}
          </>
        )}

        {item.type === 'text' && (
          <input
            type="text"
            value={String(item.value ?? '')}
            onChange={e => item.onChange(e.target.value)}
            style={{
              width: 120,
              fontSize: 12,
              padding: '3px 6px',
              borderRadius: 6,
              border: '1px solid var(--vos-border-primary)',
              backgroundColor: 'var(--vos-bg-secondary)',
              color: 'var(--vos-text-primary)',
              outline: 'none'
            }}
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
        className="vos-modal"
        style={{ width: 440, maxHeight: '70vh', padding: 0, borderRadius: 12 }}
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid var(--vos-border-secondary)'
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--vos-text-primary)' }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vos-text-secondary)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '8px 16px 16px', overflowY: 'auto', maxHeight: 'calc(70vh - 50px)' }}>
          {groups.map(group => (
            <div key={group.id} style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--vos-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 4
                }}
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
