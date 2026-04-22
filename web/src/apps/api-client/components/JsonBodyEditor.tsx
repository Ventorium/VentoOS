import Editor from '@monaco-editor/react'
import { useCallback, useRef } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  language?: 'json' | 'xml'
}

export default function JsonBodyEditor({ value, onChange, language = 'json' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleChange = useCallback(
    (v: string | undefined) => {
      onChange(v ?? '')
    },
    [onChange]
  )

  return (
    <div ref={containerRef} className="flex-1 min-h-0 relative">
      <Editor
        height="100%"
        language={language}
        value={value}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          automaticLayout: true,
          fontSize: 12,
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          scrollBeyondLastLine: false,
          lineNumbers: 'off',
          folding: false,
          renderLineHighlight: 'none',
          padding: { top: 8, bottom: 8 },
          wordWrap: 'on',
          tabSize: 2,
          insertSpaces: true,
          formatOnPaste: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          guides: { indentation: false }
        }}
        onChange={handleChange}
      />
    </div>
  )
}
