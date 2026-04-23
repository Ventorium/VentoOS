import { FileUp, Trash2 } from 'lucide-react'
import { useCallback } from 'react'
import { FormSelect } from '@/components/ui'
import type { FormDataType, KeyValueItem } from '../types'

const FORM_DATA_TYPES: { value: FormDataType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'integer', label: 'Int' },
  { value: 'boolean', label: 'Bool' },
  { value: 'number', label: 'Num' },
  { value: 'file', label: 'File' },
  { value: 'array', label: 'Arr' }
]

interface KeyValueEditorProps {
  items: KeyValueItem[]
  onChange: (items: KeyValueItem[]) => void
  showDescription?: boolean
  placeholder?: { key?: string; value?: string }
  bodyType?: string
}

export default function KeyValueEditor({
  items,
  onChange,
  showDescription = false,
  placeholder,
  bodyType
}: KeyValueEditorProps) {
  const isFormData = bodyType === 'form-data'

  const allItems = [...items, { key: '', value: '', enabled: true, description: '', dataType: 'text' as FormDataType }]

  const updateItem = useCallback(
    (index: number, field: keyof KeyValueItem, val: string | boolean | FormDataType) => {
      const isNewRow = index === items.length
      let newItems: KeyValueItem[]
      if (isNewRow) {
        newItems = [...items, { key: '', value: '', enabled: true, description: '', dataType: 'text', [field]: val }]
      } else {
        newItems = items.map((item, i) => (i === index ? { ...item, [field]: val } : item))
      }
      onChange(newItems)
    },
    [items, onChange]
  )

  const removeItem = useCallback(
    (index: number) => {
      onChange(items.filter((_, i) => i !== index))
    },
    [items, onChange]
  )

  const handleFileSelect = useCallback(
    (index: number, file: File | null) => {
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        updateItem(index, 'value', base64)
      }
      reader.readAsDataURL(file)
    },
    [updateItem]
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
        {isFormData && <div className="w-16 shrink-0">Type</div>}
        <div className="flex-1">Value</div>
        {showDescription && <div className="flex-1">Description</div>}
        <div className="w-6" />
      </div>
      {/* Rows */}
      {allItems.map((item, idx) => {
        const isNew = idx === items.length
        const dataType = item.dataType ?? 'text'
        const isFileType = isFormData && dataType === 'file'

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
                onChange={e => updateItem(idx, 'enabled', e.target.checked)}
                className="accent-orange-500"
              />
            </div>
            <input
              className="flex-1 bg-transparent outline-none py-1 placeholder:opacity-40"
              style={{ color: 'var(--vos-text-primary)' }}
              value={item.key}
              placeholder={placeholder?.key ?? 'Key'}
              onChange={e => updateItem(idx, 'key', e.target.value)}
            />
            {isFormData && (
              <FormSelect
                variant="minimal"
                className="w-full text-[10px]"
                wrapperClassName="w-16 shrink-0"
                value={dataType}
                onChange={e => updateItem(idx, 'dataType', e.target.value as FormDataType)}
              >
                {FORM_DATA_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </FormSelect>
            )}
            {isFileType ? (
              <label className="flex-1 flex items-center gap-1 cursor-pointer">
                <FileUp size={12} style={{ color: 'var(--vos-text-tertiary)' }} />
                <span className="truncate text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                  {item.value ? 'File selected' : 'Choose file'}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={e => handleFileSelect(idx, e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <input
                className="flex-1 bg-transparent outline-none py-1 placeholder:opacity-40"
                style={{ color: 'var(--vos-text-primary)' }}
                value={item.value}
                placeholder={placeholder?.value ?? 'Value'}
                onChange={e => updateItem(idx, 'value', e.target.value)}
              />
            )}
            {showDescription && (
              <input
                className="flex-1 bg-transparent outline-none py-1 placeholder:opacity-40"
                style={{ color: 'var(--vos-text-primary)' }}
                value={item.description ?? ''}
                placeholder="Description"
                onChange={e => updateItem(idx, 'description', e.target.value)}
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
