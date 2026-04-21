import { Upload, X } from 'lucide-react'
import { useState } from 'react'
import { apiClientApi } from '../api'
import { useApiClientStore } from '../store'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
}

type ImportFormat = 'openapi' | 'postman' | 'curl'

export default function ImportDialog({ open, onClose }: ImportDialogProps) {
  const [format, setFormat] = useState<ImportFormat>('openapi')
  const [content, setContent] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadCollections = useApiClientStore(s => s.loadCollections)

  if (!open) return null

  const handleImport = async () => {
    if (!content.trim()) return
    setIsImporting(true)
    setError(null)

    try {
      if (format === 'curl') {
        await apiClientApi.importCurl(content)
      } else if (format === 'openapi') {
        const data = JSON.parse(content)
        await apiClientApi.importOpenApi(data)
      } else {
        const data = JSON.parse(content)
        await apiClientApi.importPostman(data)
      }
      await loadCollections()
      onClose()
      setContent('')
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Invalid JSON format' : 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setContent(ev.target?.result as string)
    }
    reader.readAsText(file)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      {/* Dialog */}
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] rounded-xl shadow-xl"
        style={{ background: 'var(--vos-bg-elevated)', border: '1px solid var(--vos-border-subtle)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--vos-text-primary)' }}>
            Import Collection
          </span>
          <button
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--vos-text-tertiary)' }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {/* Format selector */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
              Format:
            </span>
            {(['openapi', 'postman', 'curl'] as const).map(f => (
              <button
                key={f}
                className="px-3 py-1 rounded text-xs capitalize"
                style={{
                  background: format === f ? 'var(--vos-bg-tertiary)' : 'transparent',
                  color: format === f ? 'var(--vos-text-primary)' : 'var(--vos-text-tertiary)'
                }}
                onClick={() => setFormat(f)}
              >
                {f === 'openapi' ? 'OpenAPI' : f === 'postman' ? 'Postman' : 'cURL'}
              </button>
            ))}
          </div>

          {/* File upload */}
          <label
            className="flex items-center justify-center gap-2 py-3 mb-3 rounded-lg cursor-pointer text-xs border-dashed border-2"
            style={{
              borderColor: 'var(--vos-border-subtle)',
              color: 'var(--vos-text-tertiary)'
            }}
          >
            <Upload size={14} />
            Upload file or paste below
            <input type="file" className="hidden" accept=".json,.yaml,.yml,.txt" onChange={handleFileUpload} />
          </label>

          {/* Text input */}
          <textarea
            className="w-full h-40 p-3 rounded-lg bg-transparent outline-none resize-none text-xs font-mono"
            style={{
              color: 'var(--vos-text-primary)',
              border: '1px solid var(--vos-border-subtle)'
            }}
            value={content}
            placeholder={format === 'curl' ? 'curl -X GET https://...' : 'Paste JSON content here...'}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
          />

          {error && (
            <div className="mt-2 text-xs" style={{ color: '#ef4444' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-5 py-3"
          style={{ borderTop: '1px solid var(--vos-border-subtle)' }}
        >
          <button
            className="px-4 py-1.5 rounded text-xs"
            style={{ color: 'var(--vos-text-secondary)' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1.5 rounded text-xs font-medium text-white"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
              opacity: isImporting || !content.trim() ? 0.5 : 1
            }}
            disabled={isImporting || !content.trim()}
            onClick={handleImport}
          >
            {isImporting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </>
  )
}
