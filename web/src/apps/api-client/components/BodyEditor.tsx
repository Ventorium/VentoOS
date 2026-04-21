import type { BodyConfig, KeyValueItem } from '../types'
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
  const isTextType = body.type === 'json' || body.type === 'text' || body.type === 'xml'

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
            className="px-2.5 py-1 rounded text-xs"
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
      <div className="flex-1 overflow-auto">
        {body.type === 'none' && (
          <div
            className="flex items-center justify-center h-full text-xs"
            style={{ color: 'var(--vos-text-tertiary)' }}
          >
            This request does not have a body
          </div>
        )}

        {isTextType && (
          <textarea
            className="w-full h-full p-3 bg-transparent outline-none resize-none text-xs font-mono"
            style={{ color: 'var(--vos-text-primary)' }}
            value={body.content ?? ''}
            placeholder={body.type === 'json' ? '{\n  \n}' : 'Enter request body...'}
            onChange={e => onChange({ ...body, content: e.target.value })}
            spellCheck={false}
          />
        )}

        {isFormType && (
          <KeyValueEditor
            items={body.params ?? []}
            onChange={(params: KeyValueItem[]) => onChange({ ...body, params })}
            showDescription
          />
        )}

        {body.type === 'binary' && (
          <div
            className="flex items-center justify-center h-full text-xs"
            style={{ color: 'var(--vos-text-tertiary)' }}
          >
            Binary file upload not yet supported
          </div>
        )}
      </div>
    </div>
  )
}
