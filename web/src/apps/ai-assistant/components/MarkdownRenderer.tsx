import copyToClipboard from 'copy-to-clipboard'
import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import 'highlight.js/styles/github-dark.min.css'

interface MarkdownRendererProps {
  content: string
  streaming?: boolean
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 bg-transparent border-none cursor-pointer text-[10px] px-1.5 py-0.5 rounded"
      style={{ color: copied ? 'var(--vos-accent-primary)' : 'var(--vos-text-tertiary)' }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? '已复制' : '复制'}
    </button>
  )
}

const markdownComponents: Components = {
  pre({ children }) {
    return <>{children}</>
  },
  code({ children, className, ...rest }) {
    const match = /language-(\w+)/.exec(className || '')
    const language = match?.[1]
    const codeString = String(children).replace(/\n$/, '')

    // Inline code (no language class)
    if (!className) {
      return (
        <code
          className="px-1 py-0.5 rounded text-xs bg-[var(--vos-bg-input)] text-[var(--vos-accent-primary)]"
          {...rest}
        >
          {children}
        </code>
      )
    }

    // Block code with syntax highlighting
    return (
      <div
        className="relative rounded-lg overflow-hidden my-2 text-xs bg-[var(--vos-bg-input)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]"
      >
        <div
          className="flex items-center justify-between px-3 py-1 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]"
        >
          <span className="text-[10px] text-[var(--vos-text-tertiary)]">
            {language || 'code'}
          </span>
          <CopyButton text={codeString} />
        </div>
        <pre className="m-0 p-3 overflow-x-auto font-mono">
          <code className={className} {...rest}>
            {children}
          </code>
        </pre>
      </div>
    )
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="w-full text-xs border-collapse border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
          {children}
        </table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th
        className="text-left px-2 py-1 text-xs font-medium bg-[var(--vos-bg-surface)] border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]"
      >
        {children}
      </th>
    )
  },
  td({ children }) {
    return (
      <td className="px-2 py-1 text-xs border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
        {children}
      </td>
    )
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--vos-accent-primary)]">
        {children}
      </a>
    )
  }
}

export default function MarkdownRenderer({ content, streaming }: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
      {streaming && <span className="animate-pulse">▊</span>}
    </div>
  )
}
