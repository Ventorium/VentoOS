import copyToClipboard from 'copy-to-clipboard'
import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from '@/components/Toast'

interface CodeBlockProps {
  children: string
  language?: string
  showLineNumbers?: boolean
}

export default function CodeBlock({ children, language, showLineNumbers = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    copyToClipboard(children)
    toast.success('已复制')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  const lines = children.replace(/\n$/, '').split('\n')

  return (
    <div className="relative rounded-lg overflow-hidden my-2 text-xs bg-[var(--vos-bg-input)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
        <span className="text-[10px] text-[var(--vos-text-tertiary)]">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 bg-transparent border-none cursor-pointer text-[10px] px-1.5 py-0.5 rounded"
          style={{ color: copied ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {/* Code content */}
      <pre className="m-0 p-3 overflow-x-auto font-mono">
        <code className={language ? `hljs language-${language}` : 'hljs'}>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              {showLineNumbers && (
                <span className="select-none text-right pr-3 mr-3 min-w-[28px] text-[var(--vos-text-tertiary)] border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)] opacity-50">
                  {i + 1}
                </span>
              )}
              <span
                className="whitespace-pre text-[var(--vos-text-primary)]"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: highlighted code from rehype-highlight
                dangerouslySetInnerHTML={{ __html: line || '\n' }}
              />
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}
