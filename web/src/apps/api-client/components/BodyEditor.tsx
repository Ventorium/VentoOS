import { Upload } from 'lucide-react'
import type { BodyConfig, KeyValueItem } from '../types'
import JsonBodyEditor from './JsonBodyEditor'
import KeyValueEditor from './KeyValueEditor'

const BODY_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'form-urlencoded', label: 'Form URL Encoded' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'xml', label: 'XML' },
  { value: 'binary', label: 'Binary' }
] as const

interface BodyEditorProps {
  body: BodyConfig
  onChange: (body: BodyConfig) => void
}

export default function BodyEditor({ body, onChange }: BodyEditorProps) {
  const isFormType = body.type === 'form-urlencoded' || body.type === 'form-data'
  const isTextType = body.type === 'text'
  const isEditorType = body.type === 'json' || body.type === 'xml'

  const handleFileSelect = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      onChange({
        ...body,
        type: 'binary',
        content: base64,
        contentType: file.type || 'application/octet-stream'
      })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Type selector */}
      <div
        className="flex items-center gap-1 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
      >
        {BODY_TYPES.map(bt => (
          <button
            key={bt.value}
            className="px-2.5 py-1 rounded text-xs cursor-pointer"
            style={{
              background: body.type === bt.value ? 'var(--vos-bg-tertiary)' : 'transparent',
              color: body.type === bt.value ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)'
            }}
            onClick={() =>
              onChange({
                ...body,
                type: bt.value,
                content: bt.value === 'none' ? '' : body.content
              })
            }
          >
            {bt.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {body.type === 'none' && (
          <div
            className="flex items-center justify-center h-full text-xs"
            style={{ color: 'var(--vos-text-tertiary)' }}
          >
            This request does not have a body
          </div>
        )}

        {isEditorType && (
          <JsonBodyEditor
            value={body.content ?? ''}
            onChange={v => onChange({ ...body, content: v })}
            language={body.type === 'json' ? 'json' : 'xml'}
          />
        )}

        {isTextType && (
          <textarea
            className="w-full h-full p-3 bg-transparent outline-none resize-none text-xs font-mono"
            style={{ color: 'var(--vos-text-primary)' }}
            value={body.content ?? ''}
            placeholder="Enter request body..."
            onChange={e => onChange({ ...body, content: e.target.value })}
            spellCheck={false}
          />
        )}

        {isFormType && (
          <KeyValueEditor
            items={body.params ?? []}
            onChange={(params: KeyValueItem[]) => onChange({ ...body, params })}
            showDescription
            bodyType={body.type}
          />
        )}

        {body.type === 'binary' && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            {body.content ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--vos-text-secondary)' }}>
                  File selected
                </span>
                <span className="text-xs font-mono" style={{ color: 'var(--vos-text-primary)' }}>
                  {body.contentType ?? 'application/octet-stream'}
                </span>
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs cursor-pointer"
                  style={{
                    background: 'var(--vos-bg-tertiary)',
                    color: 'var(--vos-text-primary)',
                    border: '1px solid var(--vos-border-subtle)'
                  }}
                >
                  <Upload size={12} />
                  Replace file
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            ) : (
              <label
                className="flex flex-col items-center gap-2 px-6 py-4 rounded-lg cursor-pointer"
                style={{
                  border: '1px dashed var(--vos-border-subtle)',
                  color: 'var(--vos-text-tertiary)'
                }}
              >
                <Upload size={20} />
                <span className="text-xs">Click to select a file</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
