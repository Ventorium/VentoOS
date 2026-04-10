/**
 * Office Editor App
 *
 * Document viewer/editor following the .repos/document approach.
 * Uses docx-preview for DOCX rendering, simple table for XLSX/CSV.
 *
 * Supports: DOCX, DOC, XLSX, XLS, PPTX, PPT, CSV
 *
 * Architecture note:
 * Full OnlyOffice WASM integration (270MB assets from .repos/document)
 * can be enabled via `make office-editor` build target.
 * This MVP provides direct rendering for common formats.
 */

import { AnimatePresence } from 'framer-motion'
import { Download, FileText, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import { getAuthHeaders } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { VfsFilePickerModal } from '@/shell/FilePicker'

type ViewMode = 'loading' | 'docx' | 'xlsx' | 'csv' | 'unsupported' | 'error'

interface SheetData {
  headers: string[]
  rows: string[][]
  sheetName: string
}

export default function OfficeEditor({ windowId, initialAppState }: AppComponentProps) {
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
    appId: 'office-editor',
    onOpenFile: handleOpenFile
  })

  const docxContainerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<ViewMode>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [sheetData, setSheetData] = useState<SheetData | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  // Store blob for deferred DOCX rendering after container mounts
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)

  const getFileExt = (name: string) => {
    const dot = name.lastIndexOf('.')
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  }

  const fetchFileBlob = useCallback(async (): Promise<Blob> => {
    const url = `/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node!.path)}`
    const resp = await fetch(url, { headers: getAuthHeaders() })
    if (!resp.ok) throw new Error(`Failed to fetch: ${resp.statusText}`)
    return resp.blob()
  }, [mountId, node])

  // Render DOCX after container is mounted via mode change
  useEffect(() => {
    if (mode !== 'docx' || !docxBlob) return
    let cancelled = false
    ;(async () => {
      // Wait for next frame to ensure ref is populated
      await new Promise(r => requestAnimationFrame(r))
      if (cancelled || !docxContainerRef.current) return
      try {
        const { renderAsync } = await import('docx-preview')
        if (!cancelled && docxContainerRef.current) {
          await renderAsync(docxBlob, docxContainerRef.current, undefined, {
            className: 'vos-docx-viewer',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: false,
            trimXmlDeclaration: true,
            useBase64URL: true
          })
        }
      } catch (err) {
        console.error('DOCX render error:', err)
      }
    })()
    return () => { cancelled = true }
  }, [mode, docxBlob])

  const loadDocument = useCallback(async () => {
    if (!mountId || !node) {
      setErrorMsg('No file specified')
      setMode('error')
      return
    }

    try {
      const ext = getFileExt(node.name)
      const blob = await fetchFileBlob()
      const url = URL.createObjectURL(blob)
      setBlobUrl(url)

      if (ext === 'docx' || ext === 'doc') {
        // Store blob and set mode; rendering deferred to useEffect
        setDocxBlob(blob)
        setMode('docx')
      } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        // Parse spreadsheet
        const text = ext === 'csv' ? await blob.text() : null
        if (text) {
          // CSV parsing
          const lines = text.split('\n').filter(l => l.trim())
          const headers = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, '')) ?? []
          const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
          setSheetData({ headers, rows, sheetName: 'Sheet1' })
          setMode('csv')
        } else {
          // XLSX binary parsing via ArrayBuffer
          const buffer = await blob.arrayBuffer()
          try {
            const { parseXlsx } = await import('./xlsx-parser')
            const data = parseXlsx(buffer)
            setSheetData(data)
            setMode('xlsx')
          } catch {
            setMode('xlsx')
            setSheetData({ headers: [], rows: [], sheetName: 'Sheet1' })
          }
        }
      } else if (ext === 'pptx' || ext === 'ppt') {
        setMode('unsupported')
      } else {
        setMode('unsupported')
      }
    } catch (err) {
      console.error('Office Editor error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load document')
      setMode('error')
    }
  }, [mountId, node, fetchFileBlob])

  useEffect(() => {
    loadDocument()
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [loadDocument]) // blobUrl intentionally excluded to avoid infinite loop

  const handleDownload = useCallback(() => {
    if (!blobUrl || !node) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = node.name
    a.click()
  }, [blobUrl, node])

  // Shared toolbar
  const Toolbar = () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderBottom: '1px solid var(--vos-border-subtle)',
        background: 'var(--vos-bg-secondary)',
        flexShrink: 0
      }}
    >
      <FileText size={16} style={{ color: 'var(--vos-text-tertiary)' }} />
      <span style={{ fontSize: 13, color: 'var(--vos-text-primary)', fontWeight: 500, flex: 1 }}>
        {node?.name ?? 'Untitled'}
      </span>
      <button
        type="button"
        onClick={handleDownload}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          borderRadius: 6,
          border: 'none',
          cursor: 'pointer',
          background: 'var(--vos-accent-primary)',
          color: '#fff'
        }}
      >
        <Download size={14} />
        下载
      </button>
    </div>
  )

  const filePicker = (
    <AnimatePresence>
      {showFilePicker && (
        <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
      )}
    </AnimatePresence>
  )

  if (mode === 'loading') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'var(--vos-bg-primary)',
          color: 'var(--vos-text-tertiary)'
        }}
      >
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13 }}>正在加载文档…</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        {filePicker}
      </div>
    )
  }

  if (mode === 'error') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'var(--vos-bg-primary)',
          color: 'var(--vos-text-tertiary)'
        }}
      >
        <FileText size={48} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>无法打开文档</div>
        <div style={{ fontSize: 12, maxWidth: 400, textAlign: 'center' }}>{errorMsg}</div>
        {filePicker}
      </div>
    )
  }

  if (mode === 'unsupported') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vos-bg-primary)'
        }}
      >
        <Toolbar />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}
        >
          <FileText size={48} style={{ opacity: 0.3, color: 'var(--vos-text-tertiary)' }} />
          <div style={{ fontSize: 14, color: 'var(--vos-text-secondary)' }}>暂不支持在线预览此格式</div>
          <div style={{ fontSize: 12, color: 'var(--vos-text-tertiary)' }}>请下载后使用本地应用打开</div>
        </div>
        {filePicker}
      </div>
    )
  }

  // DOCX view
  if (mode === 'docx') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vos-bg-primary)'
        }}
      >
        <Toolbar />
        <div
          ref={docxContainerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            background: '#f5f5f5'
          }}
        />
        <style>{`
          .vos-docx-viewer { background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.1); margin: 0 auto; }
          .vos-docx-viewer section.docx { padding: 40px 60px; min-height: 100%; }
        `}</style>
        {filePicker}
      </div>
    )
  }

  // XLSX / CSV table view
  if ((mode === 'xlsx' || mode === 'csv') && sheetData) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vos-bg-primary)'
        }}
      >
        <Toolbar />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              fontSize: 12,
              color: 'var(--vos-text-primary)'
            }}
          >
            {sheetData.headers.length > 0 && (
              <thead>
                <tr>
                  <th
                    style={{
                      padding: '6px 10px',
                      borderBottom: '2px solid var(--vos-border-subtle)',
                      background: 'var(--vos-bg-secondary)',
                      textAlign: 'left',
                      fontWeight: 600,
                      position: 'sticky',
                      top: 0,
                      width: 40,
                      color: 'var(--vos-text-tertiary)'
                    }}
                  >
                    #
                  </th>
                  {sheetData.headers.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '6px 10px',
                        borderBottom: '2px solid var(--vos-border-subtle)',
                        background: 'var(--vos-bg-secondary)',
                        textAlign: 'left',
                        fontWeight: 600,
                        position: 'sticky',
                        top: 0,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {h || `Column ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {sheetData.rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--vos-bg-secondary)' }}>
                  <td
                    style={{
                      padding: '4px 10px',
                      borderBottom: '1px solid var(--vos-border-subtle)',
                      color: 'var(--vos-text-tertiary)',
                      fontSize: 11
                    }}
                  >
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '4px 10px',
                        borderBottom: '1px solid var(--vos-border-subtle)',
                        whiteSpace: 'nowrap',
                        maxWidth: 300,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sheetData.rows.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--vos-text-tertiary)', fontSize: 13 }}>
              空表格
            </div>
          )}
        </div>
        {filePicker}
      </div>
    )
  }

  return filePicker
}
