/**
 * Office Editor App
 *
 * Full OnlyOffice WASM integration for editing Word, Excel, and PowerPoint documents.
 * Uses OnlyOffice DocEditor + X2T WASM for document format conversion.
 * Save operations use the Rust backend VFS upload API.
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

declare global {
  interface Window {
    DocsAPI: {
      DocEditor: new (elementId: string, config: Record<string, unknown>) => {
        destroyEditor: () => void
        sendCommand: (cmd: { command: string; data: unknown }) => void
      }
    }
  }
}

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
  const editorRef = useRef<ReturnType<typeof window.DocsAPI.DocEditor> | null>(null)
  // Track current mountId/path for save operations
  const currentMountIdRef = useRef(mountId)
  const currentNodeRef = useRef(node)
  // Media URL map for embedded images
  const mediaRef = useRef<Record<string, string>>({})

  useEffect(() => {
    currentMountIdRef.current = mountId
  }, [mountId])

  useEffect(() => {
    currentNodeRef.current = node
  }, [node])

  const destroyEditor = useCallback(() => {
    if (editorRef.current) {
      try {
        editorRef.current.destroyEditor()
      } catch (_e) {
        // ignore
      }
      editorRef.current = null
    }
    // Revoke media object URLs
    for (const url of Object.values(mediaRef.current)) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    mediaRef.current = {}
  }, [])

  const loadEditorApi = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.DocsAPI) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = './web-apps/apps/api/documents/api.js'
      script.onload = () => resolve()
      script.onerror = (err) => reject(new Error(`Failed to load OnlyOffice API: ${err}`))
      document.head.appendChild(script)
    })
  }, [])

  const handleSaveDocument = useCallback(async (event: { data: { data: Uint8Array; option: { outputformat: number } } }) => {
    const editorInst = editorRef.current
    const mId = currentMountIdRef.current
    const nd = currentNodeRef.current

    try {
      if (!event.data?.data) return
      const { data: binData, option } = event.data
      const ext = c_oAscFileType2[option.outputformat]?.toLowerCase() ?? nd?.name.split('.').pop() ?? 'docx'
      const fileName = nd?.name ?? `document.${ext}`

      // Convert bin back to document format
      const fileData = await convertBinToDocument(binData, fileName, ext.toUpperCase())

      // Upload to VFS backend
      const formData = new FormData()
      formData.append('path', nd?.path ?? `/${fileName}`)
      formData.append('file', new Blob([fileData]), fileName)

      const resp = await fetch(`/api/vfs/mounts/${encodeURIComponent(mId)}/upload`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      })

      if (!resp.ok) {
        const errText = await resp.text()
        console.error('Save failed:', errText)
      }
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      // Notify editor save callback
      editorInst?.sendCommand({ command: 'asc_onSaveCallback', data: { err_code: 0 } })
    }
  }, [])

  const handleWriteFile = useCallback((event: { data: { data: Uint8Array; file: string } }) => {
    try {
      const { data: imageData, file: fileName } = event.data
      if (!imageData || !fileName) return
      const ext = fileName.split('.').pop()?.toLowerCase() ?? 'png'
      const mimeMap: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
      }
      const blob = new Blob([imageData], { type: mimeMap[ext] ?? 'image/png' })
      const url = URL.createObjectURL(blob)
      mediaRef.current[`media/${fileName}`] = url
      editorRef.current?.sendCommand({ command: 'asc_setImageUrls', data: { urls: mediaRef.current } })
      editorRef.current?.sendCommand({ command: 'asc_writeFileCallback', data: { path: url, imgName: fileName } })
    } catch (err) {
      console.error('handleWriteFile error:', err)
    }
  }, [])

  const openDocument = useCallback(async (mId: string, nd: { name: string; path: string }) => {
    setMode('loading')
    destroyEditor()

    try {
      // Load OnlyOffice API and X2T WASM in parallel
      await Promise.all([loadEditorApi(), initX2TScript()])
      await initX2T()

      // Fetch file from VFS
      const url = `/api/vfs/mounts/${encodeURIComponent(mId)}/raw?path=${encodeURIComponent(nd.path)}`
      const resp = await fetch(url, { headers: getAuthHeaders() })
      if (!resp.ok) throw new Error(`Failed to fetch: ${resp.statusText}`)
      const blob = await resp.blob()
      const file = new File([blob], nd.name)

      // Convert to OnlyOffice bin format
      const { bin, media } = await convertDocument(file)

      // Store media refs
      mediaRef.current = media as Record<string, string>

      const fileExt = nd.name.split('.').pop()?.toLowerCase() ?? ''
      const editorId = 'vos-office-editor-iframe'

      // Ensure container exists
      const container = document.getElementById(editorId)
      if (!container) throw new Error('Editor container not found')

      editorRef.current = new window.DocsAPI.DocEditor(editorId, {
        document: {
          title: nd.name,
          url: nd.name,
          fileType: fileExt,
          permissions: { edit: true, chat: false, protect: false },
        },
        editorConfig: {
          lang: 'zh',
          customization: {
            help: false,
            about: false,
            hideRightMenu: true,
            features: { spellcheck: { change: false } },
            anonymous: { request: false, label: 'Guest' },
          },
        },
        events: {
          onAppReady: () => {
            if (Object.keys(media).length > 0) {
              editorRef.current?.sendCommand({ command: 'asc_setImageUrls', data: { urls: media } })
            }
            editorRef.current?.sendCommand({ command: 'asc_openDocument', data: { buf: bin } })
          },
          onDocumentReady: () => console.log('Document ready:', nd.name),
          onSave: handleSaveDocument,
          writeFile: handleWriteFile,
        },
      })

      setMode('editor')
    } catch (err) {
      console.error('Office Editor error:', err)
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load document')
      setMode('error')
    }
  }, [destroyEditor, loadEditorApi, handleSaveDocument, handleWriteFile])

  // Reload editor when file changes
  useEffect(() => {
    if (mountId && node) {
      openDocument(mountId, node)
    } else {
      setMode('nofile')
    }
    return destroyEditor
  }, [mountId, node?.path]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="w-full h-full flex flex-col bg-[var(--vos-bg-primary)]">
      <div id="vos-office-editor-iframe" className="flex-1 w-full" />
      {filePicker}
    </div>
  )
}
