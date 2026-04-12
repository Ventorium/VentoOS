/**
 * Font Preview App
 *
 * Previews font files (ttf/otf/woff/woff2) with sample text,
 * various sizes, and character grid. Supports custom preview text.
 */

import { AnimatePresence } from 'framer-motion'
import { Download, Type } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import { apiClient } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { VfsFilePickerModal } from '@/shell/FilePicker'

const SAMPLE_TEXT_EN = 'The quick brown fox jumps over the lazy dog'
const SAMPLE_TEXT_CN = '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。'
const SAMPLE_TEXT_NUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789'
const SAMPLE_CHARS = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'

const PREVIEW_SIZES = [12, 14, 16, 20, 24, 32, 48, 64, 72]

export default function FontPreview({ windowId, initialAppState }: AppComponentProps) {
  const [mountId, setMountId] = useState((initialAppState?.mountId as string) ?? '')
  const [node, setNode] = useState(initialAppState?.node as { name: string; path: string } | undefined)

  const { setTitle } = useWindowActions(windowId)

  const handleOpenFile = useCallback(
    (result: VfsPickerResult) => {
      const name = result.path.split('/').filter(Boolean).pop() ?? result.path
      setMountId(result.mountId)
      setNode({ path: result.path, name })
      setTitle(name)
    },
    [setTitle]
  )

  const { showFilePicker, closeFilePicker, handleFilePickerConfirm } = useFileOpenMenu({
    windowId,
    appId: 'font-preview',
    onOpenFile: handleOpenFile
  })

  const [fontFamily, setFontFamily] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [customText, setCustomText] = useState('')
  const [activeTab, setActiveTab] = useState<'preview' | 'grid'>('preview')
  const fontFaceRef = useRef<FontFace | null>(null)

  // Load font via FontFace API
  useEffect(() => {
    if (!mountId || !node) {
      setError('No font file specified')
      return
    }

    const rawUrl = `${apiClient.defaults.baseURL ?? ''}/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node.path)}`
    const familyName = `preview-${node.name.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`

    const fontFace = new FontFace(familyName, `url(${rawUrl})`)
    fontFaceRef.current = fontFace

    fontFace
      .load()
      .then(loaded => {
        document.fonts.add(loaded)
        setFontFamily(familyName)
        setLoaded(true)
      })
      .catch(err => {
        console.error('Font load error:', err)
        setError('无法加载字体文件')
      })

    return () => {
      if (fontFaceRef.current) {
        document.fonts.delete(fontFaceRef.current)
      }
    }
  }, [mountId, node])

  const handleDownload = useCallback(() => {
    if (!mountId || !node) return
    const url = `${apiClient.defaults.baseURL ?? ''}/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node.path)}`
    const a = document.createElement('a')
    a.href = url
    a.download = node.name
    a.click()
  }, [mountId, node])

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)]">
        <Type size={48} className="opacity-30 text-[var(--vos-text-tertiary)]" />
        <div className="text-sm text-[var(--vos-text-secondary)]">无法预览字体</div>
        <div className="text-xs text-[var(--vos-text-tertiary)]">{error}</div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)]">
        <Type size={32} className="opacity-40 text-[var(--vos-text-tertiary)]" />
        <div className="text-[13px] text-[var(--vos-text-tertiary)]">正在加载字体…</div>
      </div>
    )
  }

  const fontStyle = { fontFamily: `"${fontFamily}"` }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--vos-bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-b-solid border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-secondary)] shrink-0">
        <Type size={16} className="text-[var(--vos-accent-info)]" />
        <span className="text-[13px] font-medium text-[var(--vos-text-primary)] flex-1" style={fontStyle}>
          {node?.name ?? 'Font'}
        </span>

        {/* Tabs */}
        {(['preview', 'grid'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-[10px] py-[3px] text-[11px] rounded border-none cursor-pointer ${activeTab === tab ? 'bg-[var(--vos-accent-primary)] text-white' : 'bg-transparent text-[var(--vos-text-secondary)]'}`}
          >
            {tab === 'preview' ? '预览' : '字符表'}
          </button>
        ))}

        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1 px-[10px] py-1 text-xs rounded-md border-none cursor-pointer bg-transparent text-[var(--vos-text-secondary)]"
        >
          <Download size={14} />
          下载
        </button>
      </div>

      {/* Custom text input */}
      <div className="px-3 py-1.5 border-b border-b-solid border-b-[var(--vos-border-subtle)] shrink-0">
        <input
          type="text"
          placeholder="输入自定义预览文本…"
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md border border-solid border-[var(--vos-border-subtle)] bg-[var(--vos-bg-secondary)] text-[var(--vos-text-primary)] outline-none"
          style={fontStyle}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'preview' ? (
          <div className="flex flex-col gap-6">
            {/* Large hero preview */}
            <div
              className="text-[48px] leading-[1.3] text-[var(--vos-text-primary)] break-words"
              style={fontStyle}
            >
              {customText || SAMPLE_TEXT_EN}
            </div>

            {/* Chinese sample */}
            <div
              className="text-[32px] leading-[1.5] text-[var(--vos-text-primary)] break-words"
              style={fontStyle}
            >
              {customText || SAMPLE_TEXT_CN}
            </div>

            {/* All sizes */}
            <div className="flex flex-col gap-3">
              <div className="text-[11px] text-[var(--vos-text-tertiary)] uppercase tracking-[1px]">
                各尺寸预览
              </div>
              {PREVIEW_SIZES.map(size => (
                <div key={size} className="flex items-baseline gap-3">
                  <span className="text-[11px] text-[var(--vos-text-tertiary)] min-w-[32px] text-right">
                    {size}px
                  </span>
                  <span className="leading-[1.4] text-[var(--vos-text-primary)]" style={{ ...fontStyle, fontSize: size }}>
                    {customText || SAMPLE_TEXT_NUM}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Character grid */
          <div className="grid gap-1 grid-cols-[repeat(auto-fill,minmax(48px,1fr))]">
            {SAMPLE_CHARS.split('').map((char, i) => (
              <div
                key={`${char}-${i}`}
                className="flex flex-col items-center justify-center p-[6px] rounded-md border border-solid border-[var(--vos-border-subtle)] bg-[var(--vos-bg-secondary)]"
              >
                <span className="text-[24px] leading-[1.2] text-[var(--vos-text-primary)]" style={fontStyle}>
                  {char}
                </span>
                <span className="text-[9px] text-[var(--vos-text-tertiary)] mt-[2px]">
                  U+{char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <AnimatePresence>
        {showFilePicker && (
          <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
        )}
      </AnimatePresence>
    </div>
  )
}
