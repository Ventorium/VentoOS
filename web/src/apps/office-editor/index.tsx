/**
 * Office Editor App
 *
 * Full OnlyOffice WASM integration for editing Word, Excel, and PowerPoint documents.
 * Uses an iframe to isolate OnlyOffice's global JS from the main app.
 * Communication between parent and iframe via postMessage.
 *
 * Supports: DOCX, DOC, XLSX, XLS, PPTX, PPT
 */

import { AnimatePresence } from 'framer-motion'
import { FileText, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { VfsPickerResult } from '@/hooks/useFileOpenMenu'
import { useFileOpenMenu } from '@/hooks/useFileOpenMenu'
import { getAuthHeaders } from '@/infra/api'
import type { AppComponentProps } from '@/kernel'
import { useWindowActions } from '@/kernel'
import { VfsFilePickerModal } from '@/shell/FilePicker'
import { c_oAscFileType2, convertBinToDocument, convertDocument, initX2T, initX2TScript } from './x2t'

const SUPPORTED_EXTS = ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'odt', 'ods', 'odp', 'rtf', 'csv']

type AppMode = 'nofile' | 'loading' | 'editor' | 'error'

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

  const [mode, setMode] = useState<AppMode>('nofile')
  const [errorMsg, setErrorMsg] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const currentMountIdRef = useRef(mountId)
  const currentNodeRef = useRef(node)
  const mediaRef = useRef<Record<string, string>>({})
  // Token to match postMessage responses to the correct request
  const tokenRef = useRef(0)

  useEffect(() => {
    currentMountIdRef.current = mountId
  }, [mountId])

  useEffect(() => {
    currentNodeRef.current = node
  }, [node])

  // Handle messages from iframe
  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.data?.type === 'editorError') {
        console.error('Office Editor iframe error:', e.data.error)
        setErrorMsg(e.data.error)
        setMode('error')
      }

      if (e.data?.type === 'saveDocument') {
        const mId = currentMountIdRef.current
        const nd = currentNodeRef.current
        const { data: binData, option } = e.data.data
        try {
          if (!binData) return
          const ext = c_oAscFileType2[option.outputformat]?.toLowerCase() ?? nd?.name.split('.').pop() ?? 'docx'
          const fileName = nd?.name ?? `document.${ext}`
          const fileData = await convertBinToDocument(binData, fileName, ext.toUpperCase())
          const formData = new FormData()
          formData.append('path', nd?.path ?? `/${fileName}`)
          formData.append('file', new Blob([fileData]), fileName)
          const resp = await fetch(`/api/vfs/mounts/${encodeURIComponent(mId)}/upload`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData
          })
          if (!resp.ok) console.error('Save failed:', await resp.text())
        } catch (err) {
          console.error('Save error:', err)
        }
      }

      if (e.data?.type === 'writeFile') {
        try {
          const { data: imageData, file: fileName } = e.data.data
          if (!imageData || !fileName) return
          const ext = fileName.split('.').pop()?.toLowerCase() ?? 'png'
          const mimeMap: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            bmp: 'image/bmp',
            webp: 'image/webp',
            svg: 'image/svg+xml'
          }
          const blob = new Blob([imageData], { type: mimeMap[ext] ?? 'image/png' })
          const url = URL.createObjectURL(blob)
          mediaRef.current[`media/${fileName}`] = url
          // Forward updated media map back to iframe
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'updateMedia',
              media: mediaRef.current
            },
            '*'
          )
        } catch (err) {
          console.error('handleWriteFile error:', err)
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Open document: fetch, convert, send to iframe
  useEffect(() => {
    if (!mountId || !node) {
      setMode('nofile')
      return
    }

    let cancelled = false
    const token = ++tokenRef.current

    ;(async () => {
      setMode('loading')
      setErrorMsg('')

      try {
        await Promise.all([initX2TScript(), Promise.resolve()])
        await initX2T()

        // Fetch file from VFS
        const url = `/api/vfs/mounts/${encodeURIComponent(mountId)}/raw?path=${encodeURIComponent(node.path)}`
        const resp = await fetch(url, { headers: getAuthHeaders() })
        if (!resp.ok) throw new Error(`Failed to fetch: ${resp.statusText}`)
        const blob = await resp.blob()
        const file = new File([blob], node.name)

        // Convert to OnlyOffice bin format
        const { bin, media } = await convertDocument(file)
        mediaRef.current = media as Record<string, string>

        const fileExt = node.name.split('.').pop()?.toLowerCase() ?? ''

        if (cancelled) return

        // Wait for iframe to be ready, then send document data
        const sendToIframe = () => {
          const win = iframeRef.current?.contentWindow
          if (!win) return
          win.postMessage(
            {
              type: 'openDocument',
              token,
              payload: { bin, media, fileExt, fileName: node.name }
            },
            '*'
          )
        }

        setMode('editor')

        // Small delay to let iframe mount and become ready
        setTimeout(sendToIframe, 200)
      } catch (err) {
        if (cancelled) return
        console.error('Office Editor error:', err)
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load document')
        setMode('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mountId, node?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      iframeRef.current?.contentWindow?.postMessage({ type: 'destroy' }, '*')
      for (const url of Object.values(mediaRef.current)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
    }
  }, [])

  const filePicker = (
    <AnimatePresence>
      {showFilePicker && (
        <VfsFilePickerModal mode="file" onConfirm={handleFilePickerConfirm} onClose={closeFilePicker} />
      )}
    </AnimatePresence>
  )

  if (mode === 'nofile') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)] text-[var(--vos-text-tertiary)]">
        <FileText size={48} className="opacity-30" />
        <div className="text-sm">请打开一个 Office 文档</div>
        <div className="text-xs opacity-60">支持格式：{SUPPORTED_EXTS.join(', ')}</div>
        {filePicker}
      </div>
    )
  }

  if (mode === 'loading') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)] text-[var(--vos-text-tertiary)]">
        <Loader2 size={32} className="animate-spin" />
        <div className="text-[13px]">正在加载文档…</div>
        {filePicker}
      </div>
    )
  }

  if (mode === 'error') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[var(--vos-bg-primary)] text-[var(--vos-text-tertiary)]">
        <FileText size={48} className="opacity-30" />
        <div className="text-sm font-medium">无法打开文档</div>
        <div className="text-xs max-w-[400px] text-center">{errorMsg}</div>
        {filePicker}
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-[var(--vos-bg-primary)]">
      <iframe ref={iframeRef} src="/office-editor.html" className="w-full h-full border-none" title="Office Editor" />
      {filePicker}
    </div>
  )
}
