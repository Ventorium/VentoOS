import { Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import type { KeyValueItem } from '../types'

interface KeyValueEditorProps {
  items: KeyValueItem[]
  onChange: (items: KeyValueItem[]) => void
  showDescription?: boolean
  placeholder?: { key?: string; value?: string }
}

export default function KeyValueEditor({ items, onChange, showDescription = false, placeholder }: KeyValueEditorProps) {
  const allItems = [...items, { key: '', value: '', enabled: true, description: '' }]

  const updateItem = useCallback(
    (index: number, field: keyof KeyValueItem, val: string | boolean) => {
      const isNewRow = index === items.length
      let newItems: KeyValueItem[]
      if (isNewRow) {
        // Adding a new row
        newItems = [...items, { key: '', value: '', enabled: true, description: '', [field]: val }]
      } else {
        newItems = items.map((item, i) => (i === index ? { ...item, [field]: val } : item))
      }
      onChange(newItems)
    },
    [items, onChange],
  )

  const removeItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index))
    },
    [items, onChange],
  )

  return (
    <div className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-1 px-2 py-1 font-medium text-[10px] uppercase tracking-wide"
        style={{ color: 'var(--vos-text-tertiary)', borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        <div className="w-6" />
        <div className="flex-1">Key</div>
        <div className="flex-1">Value</div>
        {showDescription && <div className="flex-1">Description</div>}
        <div className="w-6" />
      </div>
      {/* Rows */}
      {allItems.map((item, idx) => {
        const isNew = idx === items.length
        return (
          <div
            key={idx}
            className="flex items-center gap-1 px-2 py-0.5 group"
            style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
          >
            <div className="w-6 flex items-center justify-center">
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => updateItem(idx, 'enabled', e.target.checked)}
                className="accent-orange-500"
              />
            </div>
            <input
              className="flex-1 bg-transparent outline-none py-1 placeholder:opacity-40"
              style={{ color: 'var(--vos-text-primary)' }}
              value={item.key}
              placeholder={placeholder?.key ?? 'Key'}
              onChange={(e) => updateItem(idx, 'key', e.target.value)}
            />
            <input
              className="flex-1 bg-transparent outline-none py-1 placeholder:opacity-40"
              style={{ color: 'var(--vos-text-primary)' }}
              value={item.value}
              placeholder={placeholder?.value ?? 'Value'}
              onChange={(e) => updateItem(idx, 'value', e.target.value)}
            />
            {showDescription && (
              <input
                className="flex-1 bg-transparent outline-none py-1 placeholder:opacity-40"
                style={{ color: 'var(--vos-text-primary)' }}
                value={item.description ?? ''}
                placeholder="Description"
                onChange={(e) => updateItem(idx, 'description', e.target.value)}
              />
            )}
            <div className="w-6 flex items-center justify-center">
              {!isNew && (
                <button
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:opacity-80"
                  style={{ color: 'var(--vos-text-tertiary)' }}
                  onClick={() => removeItem(idx)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
