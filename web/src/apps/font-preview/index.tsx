/**
 * Font Preview App
 *
 * Previews font files (ttf/otf/woff/woff2) with sample text,
 * various sizes, and character grid. Supports custom preview text.
 */

import { Download, Type } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppComponentProps } from '@/kernel'
import { apiClient } from '@/infra/api'

const SAMPLE_TEXT_EN = 'The quick brown fox jumps over the lazy dog'
const SAMPLE_TEXT_CN = '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。'
const SAMPLE_TEXT_NUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789'
const SAMPLE_CHARS = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'

const PREVIEW_SIZES = [12, 14, 16, 20, 24, 32, 48, 64, 72]

export default function FontPreview({ initialAppState }: AppComponentProps) {
  const mountId = (initialAppState?.mountId as string) ?? ''
  const node = initialAppState?.node as { name: string; path: string } | undefined

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
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--vos-bg-primary)' }}>
        <Type size={48} style={{ opacity: 0.3, color: 'var(--vos-text-tertiary)' }} />
        <div style={{ fontSize: 14, color: 'var(--vos-text-secondary)' }}>无法预览字体</div>
        <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>{error}</div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--vos-bg-primary)' }}>
        <Type size={32} style={{ opacity: 0.4, color: 'var(--vos-text-tertiary)' }} />
        <div style={{ fontSize: 13, color: 'var(--vos-text-tertiary)' }}>正在加载字体…</div>
      </div>
    )
  }

  const fontStyle = { fontFamily: `"${fontFamily}"` }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--vos-bg-primary)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid var(--vos-border-subtle)', background: 'var(--vos-bg-secondary)', flexShrink: 0
      }}>
        <Type size={16} style={{ color: 'var(--vos-accent-info)' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--vos-text-primary)', flex: 1, ...fontStyle }}>
          {node?.name ?? 'Font'}
        </span>

        {/* Tabs */}
        {(['preview', 'grid'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '3px 10px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: activeTab === tab ? 'var(--vos-accent-primary)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--vos-text-secondary)'
            }}
          >
            {tab === 'preview' ? '预览' : '字符表'}
          </button>
        ))}

        <button
          type="button"
          onClick={handleDownload}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--vos-text-secondary)'
          }}
        >
          <Download size={14} />
          下载
        </button>
      </div>

      {/* Custom text input */}
      <div style={{
        padding: '6px 12px', borderBottom: '1px solid var(--vos-border-subtle)',
        flexShrink: 0
      }}>
        <input
          type="text"
          placeholder="输入自定义预览文本…"
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          style={{
            width: '100%', padding: '6px 8px', fontSize: 14, borderRadius: 6,
            border: '1px solid var(--vos-border-subtle)', background: 'var(--vos-bg-secondary)',
            color: 'var(--vos-text-primary)', outline: 'none', ...fontStyle
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'preview' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Large hero preview */}
            <div style={{ ...fontStyle, fontSize: 48, lineHeight: 1.3, color: 'var(--vos-text-primary)', wordBreak: 'break-word' }}>
              {customText || SAMPLE_TEXT_EN}
            </div>

            {/* Chinese sample */}
            <div style={{ ...fontStyle, fontSize: 32, lineHeight: 1.5, color: 'var(--vos-text-primary)', wordBreak: 'break-word' }}>
              {customText || SAMPLE_TEXT_CN}
            </div>

            {/* All sizes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>
                各尺寸预览
              </div>
              {PREVIEW_SIZES.map(size => (
                <div key={size} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--vos-text-tertiary)', minWidth: 32, textAlign: 'right' }}>
                    {size}px
                  </span>
                  <span style={{ ...fontStyle, fontSize: size, lineHeight: 1.4, color: 'var(--vos-text-primary)' }}>
                    {customText || SAMPLE_TEXT_NUM}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Character grid */
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 4
          }}>
            {SAMPLE_CHARS.split('').map((char, i) => (
              <div
                key={`${char}-${i}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: 6, borderRadius: 6, border: '1px solid var(--vos-border-subtle)',
                  background: 'var(--vos-bg-secondary)'
                }}
              >
                <span style={{ ...fontStyle, fontSize: 24, lineHeight: 1.2, color: 'var(--vos-text-primary)' }}>
                  {char}
                </span>
                <span style={{ fontSize: 9, color: 'var(--vos-text-tertiary)', marginTop: 2 }}>
                  U+{char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
