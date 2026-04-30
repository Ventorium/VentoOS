import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  File as FileIcon,
  FlipHorizontal2,
  FlipVertical2,
  Folder,
  FolderOpen,
  Globe,
  HardDrive,
  Key,
  Link,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Unlink,
  X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppLayout,
  AppSidebar,
  FormSelect,
  SectionHeader,
  ConfirmDialog as SharedConfirmDialog,
  Spinner
} from '@/components'
import {
  AppPreferencesSheet,
  PreferenceGroup as AppPreferenceGroup,
  PreferenceRow,
  PreferenceSection,
  PreferenceToggle
} from '@/components/AppPreferences'
import { toast } from '@/components/Toast/store'
import { type ApiResponse, request } from '@/infra/api'
import type { AppComponentProps, AppManifest, AppMenuGroup } from '@/kernel'
import {
  getAllAppsForFile,
  getAlwaysOpenWithApps,
  getApp,
  getAppsForFile,
  getFileIconByName,
  openWindow,
  registerAppMenus,
  unregisterAppMenus,
  useAppStateSync,
  useAppStorage,
  useFileDefaultsStore
} from '@/kernel'
import { taskService } from '@/services/task'
import { useVfsClipboardStore } from '@/services/vfs'
import { useContextMenuStore } from '@/shell/ContextMenu/store'
import { PathPickerInput } from '@/shell/FilePicker'
import type { SshConfigHost, SshKeyFile } from '../ssh/api'
import { sshApi } from '../ssh/api'
import type {
  CreateVfsMountReq,
  FileProviderDiagnostics,
  MountBackend,
  VfsFileContent,
  VfsMount,
  VfsNode,
  VfsSourceKind,
  WebDavServerSettings
} from './api'
import { vfsApi } from './api'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

// Archive file extensions (recognized for right-click extract)
const ARCHIVE_EXTS = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz', 'zst', 'tgz', 'tbz2', 'txz', 'tzst'])

// ─── Mount form ────────────────────────────────────────────────────────────

function parseMountFields(mount: { kind: VfsSourceKind; root: string }) {
  const result = {
    localPath: '',
    host: '',
    port: '',
    username: '',
    password: '',
    basePath: '/',
    share: '',
    bucket: '',
    region: '',
    accessKey: '',
    secretKey: '',
    endpoint: ''
  }
  try {
    if (mount.kind === 'local') {
      result.localPath = mount.root
    } else if (mount.kind === 'sftp' || mount.kind === 'ftp') {
      const url = new URL(mount.root)
      result.host = url.hostname
      result.port = url.port
      result.username = decodeURIComponent(url.username)
      result.password = decodeURIComponent(url.password)
      result.basePath = url.pathname || '/'
    } else if (mount.kind === 'smb') {
      const url = new URL(mount.root)
      result.host = url.hostname
      result.username = decodeURIComponent(url.username)
      result.password = decodeURIComponent(url.password)
      // pathname is /shareName or /
      result.share = url.pathname.replace(/^\//, '')
    } else if (mount.kind === 's3') {
      const url = new URL(mount.root)
      result.bucket = url.hostname
      result.accessKey = decodeURIComponent(url.username)
      result.secretKey = decodeURIComponent(url.password)
      result.region = url.searchParams.get('region') ?? ''
      result.endpoint = url.searchParams.get('endpoint') ?? ''
    } else if (mount.kind === 'webdav') {
      // webdav://user:pass@host:port/basePath  or  webdavs://...
      const normalized = mount.root.replace(/^webdavs:\/\//, 'https://').replace(/^webdav:\/\//, 'http://')
      const url = new URL(normalized)
      result.host = url.hostname
      result.port = url.port
      result.username = decodeURIComponent(url.username)
      result.password = decodeURIComponent(url.password)
      result.basePath = url.pathname || '/'
    }
  } catch {
    /* ignore parse errors */
  }
  return result
}

function MountForm({
  onClose,
  onCreated,
  onUpdated,
  mountToEdit
}: {
  onClose: () => void
  onCreated?: (m: VfsMount) => void
  onUpdated?: (m: VfsMount) => void
  mountToEdit?: VfsMount
}) {
  const isEditing = !!mountToEdit
  const initial = mountToEdit ? parseMountFields(mountToEdit) : null

  const [name, setName] = useState(mountToEdit?.name ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [kind, setKind] = useState<VfsSourceKind>(mountToEdit?.kind ?? 'local')
  // local
  const [localPath, setLocalPath] = useState(initial?.localPath ?? '')
  // sftp / ftp / webdav
  const [host, setHost] = useState(initial?.host ?? '')
  const [port, setPort] = useState(initial?.port ?? '')
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState(initial?.password ?? '')
  const [basePath, setBasePath] = useState(initial?.basePath ?? '/')
  // webdav
  const [useHttps, setUseHttps] = useState(() => {
    if (mountToEdit?.kind === 'webdav') return mountToEdit.root.startsWith('webdavs://')
    return false
  })
  const [authMethod, setAuthMethod] = useState<'password' | 'private_key'>('password')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [privateKeyPassphrase, setPrivateKeyPassphrase] = useState('')
  // SSH config import
  const [sshConfigHosts, setSshConfigHosts] = useState<SshConfigHost[] | null>(null)
  const [importingConfig, setImportingConfig] = useState(false)
  // SSH key file browser
  const [sshKeyFiles, setSshKeyFiles] = useState<SshKeyFile[] | null>(null)
  // smb
  const [share, setShare] = useState(initial?.share ?? '')
  const [smbPort, setSmbPort] = useState('445')
  // s3
  const [bucket, setBucket] = useState(initial?.bucket ?? '')
  const [region, setRegion] = useState(initial?.region ?? '')
  const [accessKey, setAccessKey] = useState(initial?.accessKey ?? '')
  const [secretKey, setSecretKey] = useState(initial?.secretKey ?? '')
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? '')

  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  // local mount config
  const [localMountEnabled, setLocalMountEnabled] = useState(mountToEdit?.local_mount?.enabled ?? false)
  const [localMountPath, setLocalMountPath] = useState(mountToEdit?.local_mount?.mount_point ?? '')
  const [localMountPathError, setLocalMountPathError] = useState<string | null>(null)
  const [mountBackend, setMountBackend] = useState<MountBackend>(mountToEdit?.local_mount?.backend ?? 'fuse')
  const [fuseAvailable, setFuseAvailable] = useState<boolean | null>(null)
  const [fuseChecking, setFuseChecking] = useState(false)
  const [fileProviderStatus, setFileProviderStatus] = useState<FileProviderDiagnostics | null>(null)
  const [installingFileProvider, setInstallingFileProvider] = useState(false)
  const [installFileProviderError, setInstallFileProviderError] = useState<string | null>(null)

  // Check FUSE dependency when local mount is enabled
  const checkFuseDep = useCallback(async () => {
    setFuseChecking(true)
    try {
      const [fuseRes, fpRes] = await Promise.all([
        request<ApiResponse<{ available: boolean }>>('GET', '/api/dependencies/check-fuse'),
        vfsApi.checkFileProvider()
      ])
      setFuseAvailable(fuseRes.data?.available ?? false)
      setFileProviderStatus(fpRes.data ?? null)
    } catch {
      setFuseAvailable(false)
      setFileProviderStatus(null)
    } finally {
      setFuseChecking(false)
    }
  }, [])

  // Auto-parse a pasted WebDAV URL and populate https/host/port/basePath fields
  const handleWebDavHostChange = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      try {
        const parsed = new URL(trimmed)
        setUseHttps(parsed.protocol === 'https:')
        setHost(parsed.hostname)
        setPort(parsed.port || '')
        const pathname = parsed.pathname || '/'
        setBasePath(pathname.endsWith('/') ? pathname : `${pathname}/`)
      } catch {
        setHost(trimmed)
      }
    } else {
      setHost(trimmed)
    }
  }

  const validateName = (v: string): string | null => {
    if (!v) return '名称不能为空'
    if (v.length > 100) return '名称不能超过 100 个字符'
    if (v !== v.trim()) return '名称不能以空格开头或结尾'
    if (/[/\\:*?"<>|]/.test(v)) return '名称不能包含 / \\ : * ? " < > | 等字符'
    return null
  }

  const validateMountPath = (v: string): string | null => {
    if (!v.trim()) return '挂载路径不能为空'
    if (v.length > 512) return '路径长度不能超过 512 字符'
    const segments = v.replace(/^~\//, '').split('/')
    for (const seg of segments) {
      if (seg === '.' || seg === '..') return '路径段不能为 . 或 ..'
      if (seg.length > 255) return `路径段 "${seg.slice(0, 20)}…" 超过 255 字符`
      if (/[\0*?"<>|]/.test(seg)) return '路径段含有非法字符（* ? " < > | 或空字节）'
    }
    return null
  }

  const handleLocalMountPathChange = (v: string) => {
    setLocalMountPath(v)
    setLocalMountPathError(validateMountPath(v))
  }

  // When name changes, auto-update default mount path if user hasn't customized it
  const handleNameChange = (v: string) => {
    setName(v)
    setNameError(validateName(v))
    if (!localMountEnabled) {
      setLocalMountPath(`~/mnt/${v || 'source'}`)
    }
  }

  const buildRoot = (): string => {
    switch (kind) {
      case 'local':
        return localPath
      case 'sftp': {
        const p = port || '22'
        if (authMethod === 'private_key' && privateKeyPath) {
          // For private key auth, embed a special marker in the URL
          const auth = username ? `${encodeURIComponent(username)}:@` : ':@'
          return `sftp://${auth}${host}:${p}${basePath || '/'}?key_path=${encodeURIComponent(privateKeyPath)}&key_pass=${encodeURIComponent(privateKeyPassphrase)}`
        }
        const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
        return `sftp://${auth}${host}:${p}${basePath || '/'}`
      }
      case 'ftp': {
        const p = port || '21'
        const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
        return `ftp://${auth}${host}:${p}${basePath || '/'}`
      }
      case 'smb': {
        const p = smbPort && smbPort !== '445' ? `:${smbPort}` : ''
        const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
        return `smb://${auth}${host}${p}${share ? `/${share}` : ''}`
      }
      case 's3': {
        const params = new URLSearchParams()
        if (region) params.set('region', region)
        if (endpoint) params.set('endpoint', endpoint)
        const qs = params.toString() ? `?${params.toString()}` : ''
        const auth = accessKey ? `${encodeURIComponent(accessKey)}:${encodeURIComponent(secretKey)}@` : ''
        return `s3://${auth}${bucket}${qs}`
      }
      case 'webdav': {
        const scheme = useHttps ? 'webdavs' : 'webdav'
        const p = port || (useHttps ? '443' : '80')
        const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : ''
        return `${scheme}://${auth}${host}:${p}${basePath || '/'}`
      }
      default:
        return ''
    }
  }

  const isValid = (): boolean => {
    if (!name || nameError) return false
    if (
      localMountEnabled &&
      (mountBackend === 'fuse' || mountBackend === 'webdav') &&
      (!!localMountPathError || !localMountPath)
    )
      return false
    switch (kind) {
      case 'local':
        return !!localPath
      case 'sftp':
      case 'ftp':
        return !!host
      case 'smb':
        return !!host
      case 's3':
        return !!bucket
      case 'webdav':
        return !!host
      default:
        return false
    }
  }

  const handleImportSshConfig = async () => {
    setImportingConfig(true)
    try {
      const res = await sshApi.getSshConfigHosts()
      setSshConfigHosts(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setImportingConfig(false)
    }
  }

  const handleImportSshHost = (h: SshConfigHost) => {
    setName(h.alias)
    setHost(h.hostname ?? h.alias)
    setPort(h.port?.toString() ?? '22')
    setUsername(h.user ?? 'root')
    if (h.identity_file) {
      setAuthMethod('private_key')
      setPrivateKeyPath(h.identity_file)
    }
    setSshConfigHosts(null)
  }

  const handleBrowseSshKeys = async () => {
    try {
      const res = await sshApi.getSshKeyFiles()
      setSshKeyFiles(res.data)
    } catch (e) {
      console.error(e)
    }
  }

  const handleTest = async () => {
    if (!isValid()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await vfsApi.testVfsMountConnection({ name: name || 'test', kind, root: buildRoot() })
      setTestResult(res.data)
    } catch (e) {
      setTestResult({ success: false, message: e instanceof Error ? e.message : '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  const submit = async () => {
    if (!isValid()) return
    setSaving(true)
    try {
      const localMount =
        kind !== 'local' && localMountEnabled
          ? { enabled: true, mount_point: localMountPath, backend: mountBackend }
          : undefined
      const body: CreateVfsMountReq = { name, kind, root: buildRoot(), local_mount: localMount }
      if (isEditing && mountToEdit) {
        const res = await vfsApi.updateVfsMount(mountToEdit.id, body)
        onUpdated?.(res.data)
      } else {
        const res = await vfsApi.createVfsMount(body)
        onCreated?.(res.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="vos-modal-overlay">
      <div className="vos-modal-panel w-[400px]">
        <div className="text-sm font-medium">{isEditing ? '编辑数据源' : '添加数据源'}</div>
        <div>
          <input
            className="vos-input vos-input-sm"
            placeholder="名称"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
          />
          {nameError && <div className="text-xs mt-0.5 text-[var(--vos-accent-danger)]">{nameError}</div>}
        </div>
        <FormSelect
          className="vos-input-sm"
          wrapperClassName="w-full"
          value={kind}
          onChange={e => setKind(e.target.value as VfsSourceKind)}
        >
          <option value="local">本地磁盘</option>
          <option value="sftp">SFTP</option>
          <option value="ftp">FTP</option>
          <option value="smb">SMB 共享</option>
          <option value="s3">S3 对象存储</option>
          <option value="webdav">WebDAV</option>
        </FormSelect>

        {/* ── Local disk ── */}
        {kind === 'local' && (
          <PathPickerInput
            mode="directory"
            value={localPath}
            onChange={setLocalPath}
            placeholder="选择目录"
            className="vos-input vos-input-sm"
          />
        )}

        {/* ── SFTP / FTP ── */}
        {(kind === 'sftp' || kind === 'ftp') && (
          <>
            {kind === 'sftp' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded cursor-pointer border-none bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)] disabled:opacity-50"
                  onClick={handleImportSshConfig}
                  disabled={importingConfig}
                >
                  {importingConfig ? <Spinner size={11} /> : <Download size={11} className="inline-block mr-1" />}从
                  ~/.ssh/config 导入
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="主机地址"
                value={host}
                onChange={e => setHost(e.target.value)}
              />
              <input
                className="vos-input vos-input-sm w-[72px]"
                placeholder={kind === 'sftp' ? '22' : '21'}
                value={port}
                onChange={e => setPort(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="用户名（可选）"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              {kind === 'sftp' ? (
                <div className="flex gap-1 flex-1">
                  <button
                    type="button"
                    className="text-xs px-2 py-1.5 rounded cursor-pointer border-none flex-1"
                    style={{
                      background: authMethod === 'password' ? 'var(--vos-accent-primary)' : 'var(--vos-bg-item-hover)',
                      color: authMethod === 'password' ? '#fff' : 'var(--vos-text-secondary)'
                    }}
                    onClick={() => setAuthMethod('password')}
                  >
                    密码
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1.5 rounded cursor-pointer border-none flex-1"
                    style={{
                      background:
                        authMethod === 'private_key' ? 'var(--vos-accent-primary)' : 'var(--vos-bg-item-hover)',
                      color: authMethod === 'private_key' ? '#fff' : 'var(--vos-text-secondary)'
                    }}
                    onClick={() => setAuthMethod('private_key')}
                  >
                    私钥
                  </button>
                </div>
              ) : (
                <input
                  className="vos-input vos-input-sm flex-1"
                  type="password"
                  placeholder="密码（可选）"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              )}
            </div>
            {kind === 'sftp' && authMethod === 'password' && (
              <input
                className="vos-input vos-input-sm"
                type="password"
                placeholder="密码"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            )}
            {kind === 'sftp' && authMethod === 'private_key' && (
              <>
                <div className="flex gap-2">
                  <input
                    className="vos-input vos-input-sm flex-1"
                    placeholder="私钥路径（如 ~/.ssh/id_rsa）"
                    value={privateKeyPath}
                    onChange={e => setPrivateKeyPath(e.target.value)}
                  />
                  <button
                    type="button"
                    className="text-xs px-2 py-1.5 rounded cursor-pointer border-none flex-shrink-0 bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
                    onClick={handleBrowseSshKeys}
                  >
                    <Key size={12} />
                  </button>
                </div>
                {sshKeyFiles && (
                  <div className="rounded overflow-auto max-h-[120px] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
                    {sshKeyFiles.filter(f => !f.is_public).length === 0 && (
                      <div className="text-xs px-2 py-1.5 text-[var(--vos-text-tertiary)]">未发现私钥文件</div>
                    )}
                    {sshKeyFiles
                      .filter(f => !f.is_public)
                      .map(f => (
                        <button
                          key={f.path}
                          type="button"
                          className="w-full text-left text-xs px-2 py-1 cursor-pointer border-none bg-transparent text-[var(--vos-text-primary)]"
                          onMouseOver={e => {
                            ;(e.target as HTMLElement).style.background = 'var(--vos-bg-item-hover)'
                          }}
                          onMouseOut={e => {
                            ;(e.target as HTMLElement).style.background = 'transparent'
                          }}
                          onClick={() => {
                            setPrivateKeyPath(f.path)
                            setSshKeyFiles(null)
                          }}
                        >
                          {f.name}
                        </button>
                      ))}
                  </div>
                )}
                <input
                  className="vos-input vos-input-sm"
                  placeholder="私钥密码（如有）"
                  type="password"
                  value={privateKeyPassphrase}
                  onChange={e => setPrivateKeyPassphrase(e.target.value)}
                />
              </>
            )}
            <input
              className="vos-input vos-input-sm"
              placeholder="基础路径（如 /home/user）"
              value={basePath}
              onChange={e => setBasePath(e.target.value)}
            />
          </>
        )}

        {/* ── SMB ── */}
        {kind === 'smb' && (
          <>
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="主机地址"
                value={host}
                onChange={e => setHost(e.target.value)}
              />
              <input
                className="vos-input vos-input-sm w-[72px]"
                placeholder="445"
                value={smbPort}
                onChange={e => setSmbPort(e.target.value)}
              />
            </div>
            <input
              className="vos-input vos-input-sm"
              placeholder="共享名称（可选，留空则列出所有共享）"
              value={share}
              onChange={e => setShare(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="用户名（可选）"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <input
                className="vos-input vos-input-sm flex-1"
                type="password"
                placeholder="密码（可选）"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </>
        )}

        {/* ── S3 ── */}
        {kind === 's3' && (
          <>
            <input
              className="vos-input vos-input-sm"
              placeholder="Bucket 名称"
              value={bucket}
              onChange={e => setBucket(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="Region（如 us-east-1）"
                value={region}
                onChange={e => setRegion(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="Access Key"
                value={accessKey}
                onChange={e => setAccessKey(e.target.value)}
              />
              <input
                className="vos-input vos-input-sm flex-1"
                type="password"
                placeholder="Secret Key"
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
              />
            </div>
            <input
              className="vos-input vos-input-sm"
              placeholder="自定义 Endpoint（可选，兼容 MinIO 等）"
              value={endpoint}
              onChange={e => setEndpoint(e.target.value)}
            />
          </>
        )}

        {/* ── WebDAV ── */}
        {kind === 'webdav' && (
          <>
            <label className="flex items-center gap-2 text-xs text-[var(--vos-text-primary)]">
              <input type="checkbox" checked={useHttps} onChange={e => setUseHttps(e.target.checked)} />
              使用 HTTPS（webdavs://）
            </label>
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="主机地址或完整 URL（如 https://example.com/dav/）"
                value={host}
                onChange={e => handleWebDavHostChange(e.target.value)}
              />
              <input
                className="vos-input vos-input-sm w-[72px]"
                placeholder={useHttps ? '443' : '80'}
                value={port}
                onChange={e => setPort(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="vos-input vos-input-sm flex-1"
                placeholder="用户名（可选）"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <input
                className="vos-input vos-input-sm flex-1"
                type="password"
                placeholder="密码（可选）"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <input
              className="vos-input vos-input-sm"
              placeholder="基础路径（如 /remote.php/dav/files/admin/）"
              value={basePath}
              onChange={e => setBasePath(e.target.value)}
            />
          </>
        )}

        {/* ── Local Mount Config (non-local sources only) ── */}
        {kind !== 'local' && (
          <div
            className="flex flex-col gap-1.5 rounded px-2 py-2 mt-1"
            style={{ background: 'var(--vos-bg-item)', border: '0.5px solid var(--vos-border-subtle)' }}
          >
            <label className="flex items-center justify-between gap-2 cursor-pointer" htmlFor="local-mount-toggle">
              <span className="text-xs" style={{ color: 'var(--vos-text-primary)' }}>
                启用本地挂载
              </span>
              <input
                id="local-mount-toggle"
                type="checkbox"
                checked={localMountEnabled}
                onChange={e => {
                  const enabled = e.target.checked
                  setLocalMountEnabled(enabled)
                  if (enabled) {
                    checkFuseDep()
                    if (!localMountPath) {
                      const defaultPath = `~/mnt/${name || 'source'}`
                      setLocalMountPath(defaultPath)
                      setLocalMountPathError(null)
                    }
                  }
                }}
              />
            </label>
            {localMountEnabled && (
              <div>
                {/* Backend selection */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--vos-text-secondary)' }}>
                    挂载方式
                  </span>
                  <FormSelect
                    className="vos-input-sm"
                    wrapperClassName="flex-1"
                    style={{ fontSize: 11, padding: '1px 4px' }}
                    value={mountBackend}
                    onChange={e => setMountBackend(e.target.value as MountBackend)}
                  >
                    <option value="fuse">FUSE（macFUSE / libfuse3）</option>
                    <option value="webdav">WebDAV（内置，无需额外依赖）</option>
                    <option value="fileprovider">FileProvider（macOS 原生）</option>
                  </FormSelect>
                </div>
                {fuseChecking && (
                  <div className="text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--vos-text-secondary)' }}>
                    <Spinner style={{ width: 12, height: 12 }} /> 正在检测依赖…
                  </div>
                )}
                {!fuseChecking && mountBackend === 'fuse' && fuseAvailable === false && (
                  <div
                    className="text-xs mb-1 px-2 py-1.5 rounded flex items-center justify-between"
                    style={{ background: 'rgba(255, 59, 48, 0.1)', color: 'var(--vos-accent-danger)' }}
                  >
                    <span>未检测到 FUSE 依赖，挂载可能失败</span>
                    <button
                      type="button"
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{
                        background: 'var(--vos-accent-primary)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => openWindow('dependency-manager')}
                    >
                      安装依赖
                    </button>
                  </div>
                )}
                {!fuseChecking && mountBackend === 'fuse' && fuseAvailable === true && (
                  <div
                    className="text-xs mb-1 px-2 py-1.5 rounded"
                    style={{ background: 'rgba(52, 199, 89, 0.1)', color: 'var(--vos-accent-success)' }}
                  >
                    FUSE 依赖已安装
                  </div>
                )}
                {!fuseChecking && mountBackend === 'fileprovider' && fileProviderStatus?.available === false && (
                  <div
                    className="text-xs mb-1 px-2 py-1.5 rounded"
                    style={{ background: 'rgba(255, 149, 0, 0.1)', color: 'var(--vos-accent-warning, #ff9500)' }}
                  >
                    <div className="mb-1">
                      {fileProviderStatus.reason ?? 'FileProvider 当前不可用，请安装或重新检测 VentoFS 扩展'}
                    </div>
                    {fileProviderStatus.details.length > 0 && (
                      <div className="mb-1.5 text-[10px]" style={{ color: 'var(--vos-text-secondary)' }}>
                        {fileProviderStatus.details.join('；')}
                      </div>
                    )}
                    {installFileProviderError && (
                      <div className="mb-1.5" style={{ color: 'var(--vos-accent-danger)' }}>
                        {installFileProviderError}
                      </div>
                    )}
                    <button
                      className="vos-btn vos-btn-primary vos-btn-sm"
                      disabled={installingFileProvider}
                      onClick={async () => {
                        setInstallingFileProvider(true)
                        setInstallFileProviderError(null)
                        try {
                          const installResult = await vfsApi.installFileProvider()
                          const diagnostics =
                            installResult.data?.diagnostics ?? (await vfsApi.checkFileProvider()).data ?? null
                          setFileProviderStatus(diagnostics)
                          if (!installResult.data?.success) {
                            setInstallFileProviderError(
                              installResult.data?.message ?? diagnostics?.reason ?? '安装后 FileProvider 仍不可用'
                            )
                          }
                        } catch (e) {
                          setInstallFileProviderError(
                            e instanceof Error ? e.message : '安装失败，请手动安装 VentoFS.app'
                          )
                        } finally {
                          setInstallingFileProvider(false)
                        }
                      }}
                    >
                      {installingFileProvider
                        ? '正在安装...'
                        : fileProviderStatus.app_installed
                          ? '重新安装并检测 VentoFS 扩展'
                          : '安装 VentoFS 扩展'}
                    </button>
                  </div>
                )}
                {!fuseChecking && mountBackend === 'fileprovider' && fileProviderStatus?.available === true && (
                  <div
                    className="text-xs mb-1 px-2 py-1.5 rounded"
                    style={{ background: 'rgba(52, 199, 89, 0.1)', color: 'var(--vos-accent-success)' }}
                  >
                    FileProvider 扩展已就绪
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--vos-text-secondary)' }}>
                      {fileProviderStatus.app_path}
                    </div>
                  </div>
                )}
                {mountBackend === 'webdav' && (
                  <div
                    className="text-xs mb-1 px-2 py-1.5 rounded"
                    style={{ background: 'rgba(52, 199, 89, 0.1)', color: 'var(--vos-accent-success)' }}
                  >
                    内置 WebDAV 服务，无需安装任何依赖
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--vos-text-secondary)' }}>
                      macOS 原生 mount_webdav 挂载，Finder 可直接访问
                    </div>
                  </div>
                )}
                {(mountBackend === 'fuse' || mountBackend === 'webdav') && (
                  <>
                    <input
                      className="vos-input vos-input-sm"
                      placeholder={`~/mnt/${name || 'source'}`}
                      value={localMountPath}
                      onChange={e => handleLocalMountPathChange(e.target.value)}
                    />
                    {localMountPathError && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--vos-accent-danger)' }}>
                        {localMountPathError}
                      </div>
                    )}
                  </>
                )}
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--vos-text-tertiary)' }}>
                  {mountBackend === 'fuse'
                    ? '将远程文件系统挂载到本机目录，需安装 macFUSE / FUSE-T（macOS）或 libfuse3（Linux）'
                    : mountBackend === 'webdav'
                      ? '通过内置 WebDAV 服务挂载到本机目录，使用 macOS 原生 mount_webdav，无需额外依赖'
                      : '使用 macOS 原生 FileProvider 框架，在 Finder 侧栏显示远程文件系统，无需第三方依赖（macOS 12+）'}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-1">
          {testResult && (
            <div
              className={`text-xs px-2 py-1.5 rounded break-all max-h-[80px] overflow-auto ${testResult.success ? 'bg-[rgba(52,199,89,0.1)] text-[var(--vos-accent-success)]' : 'bg-[rgba(255,59,48,0.1)] text-[var(--vos-accent-danger)]'}`}
            >
              {testResult.message}
              {!testResult.success && (
                <button
                  type="button"
                  className="vos-btn-reset ml-2 text-[var(--vos-text-tertiary)]"
                  title="复制错误信息"
                  onClick={e => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(testResult.message).then(() => toast.success('已复制')).catch(() => {})
                  }}
                >
                  <Copy size={11} />
                </button>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="vos-btn vos-btn-sm vos-btn-ghost disabled:opacity-50"
              onClick={handleTest}
              disabled={testing || !isValid()}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button type="button" className="vos-btn vos-btn-sm vos-btn-ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="vos-btn vos-btn-sm vos-btn-primary disabled:opacity-50"
              onClick={submit}
              disabled={saving || !isValid()}
            >
              {saving ? (isEditing ? '保存中…' : '添加中…') : isEditing ? '保存' : '添加'}
            </button>
          </div>
        </div>
        {/* SSH Config Import Modal */}
        {sshConfigHosts && (
          <div className="vos-modal-overlay">
            <div className="vos-modal-panel w-[420px] max-h-[400px]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">~/.ssh/config 可用主机</span>
                <button
                  type="button"
                  className="vos-btn-reset text-[var(--vos-text-tertiary)]"
                  onClick={() => setSshConfigHosts(null)}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="overflow-auto flex-1 flex flex-col gap-[4px]">
                {sshConfigHosts.length === 0 && (
                  <div className="text-xs text-[var(--vos-text-tertiary)]">未发现 SSH Host 配置</div>
                )}
                {sshConfigHosts.map(h => (
                  <div
                    key={h.alias}
                    className="rounded px-2 py-1.5 cursor-pointer bg-[var(--vos-bg-input)]"
                    onClick={() => handleImportSshHost(h)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--vos-text-primary)]">{h.alias}</span>
                      <span className="text-[10px] text-[var(--vos-text-tertiary)]">
                        {h.hostname ?? ''} {h.user ? `(${h.user})` : ''}
                      </span>
                    </div>
                    {h.identity_file && (
                      <div className="text-[10px] mt-0.5 text-[var(--vos-text-tertiary)]">
                        <Key size={9} className="inline mr-0.5" />
                        {h.identity_file}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── WebDAV Server Settings Panel ──────────────────────────────────────────

function settingsEqual(a: WebDavServerSettings, b: WebDavServerSettings): boolean {
  return (
    a.enabled === b.enabled &&
    a.username === b.username &&
    a.password === b.password &&
    a.exposed_mounts.length === b.exposed_mounts.length &&
    a.exposed_mounts.every(id => b.exposed_mounts.includes(id))
  )
}

function WebDavServerPanel({
  mounts,
  onClose,
  embedded = false
}: {
  mounts: { id: string; name: string }[]
  onClose: () => void
  embedded?: boolean
}) {
  const [original, setOriginal] = useState<WebDavServerSettings>({
    enabled: false,
    username: '',
    password: '',
    exposed_mounts: []
  })
  const [settings, setSettings] = useState<WebDavServerSettings>({
    enabled: false,
    username: '',
    password: '',
    exposed_mounts: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const hasChanges = !settingsEqual(original, settings)

  const applySettings = (next: WebDavServerSettings) => {
    setSettings(next)
  }

  const handleSave = () => {
    setSaving(true)
    vfsApi
      .updateWebDavServerSettings(settings)
      .then(r => {
        setOriginal(r.data)
        setSettings(r.data)
        toast.success('WebDAV 服务器设置已保存')
      })
      .catch(err => {
        console.error('保存 WebDAV 设置失败:', err)
      })
      .finally(() => setSaving(false))
  }

  useEffect(() => {
    vfsApi
      .getWebDavServerSettings()
      .then(r => {
        setOriginal(r.data)
        setSettings(r.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleMount = (id: string) => {
    applySettings({
      ...settings,
      exposed_mounts: settings.exposed_mounts.includes(id)
        ? settings.exposed_mounts.filter((m: string) => m !== id)
        : [...settings.exposed_mounts, id]
    })
  }

  const content = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size={16} />
        </div>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-[var(--vos-text-primary)]">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={e => applySettings({ ...settings, enabled: e.target.checked })}
            />
            启用 WebDAV 服务器（通过 /webdav 路径访问）
          </label>

          {settings.enabled && (
            <>
              <div className="flex gap-2 my-2">
                <input
                  className="vos-input vos-input-sm flex-1"
                  placeholder="访问用户名（留空则无需认证）"
                  value={settings.username}
                  onChange={e => applySettings({ ...settings, username: e.target.value })}
                />
                <input
                  className="vos-input vos-input-sm flex-1"
                  type="password"
                  placeholder="访问密码"
                  value={settings.password}
                  onChange={e => applySettings({ ...settings, password: e.target.value })}
                />
              </div>

              <div>
                <div className="text-xs mb-1.5 text-[var(--vos-text-secondary)]">
                  暴露的存储源（勾选后可通过 WebDAV 访问）：
                </div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {mounts.length === 0 && <div className="text-xs text-[var(--vos-text-tertiary)]">暂无存储源</div>}
                  {mounts.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-xs text-[var(--vos-text-primary)]">
                      <input
                        type="checkbox"
                        checked={settings.exposed_mounts.includes(m.id)}
                        onChange={() => toggleMount(m.id)}
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 mt-1">
            <button
              type="button"
              className="vos-btn vos-btn-primary vos-btn-sm"
              disabled={!hasChanges || saving}
              onClick={handleSave}
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </>
      )}
    </>
  )

  if (embedded) {
    return <>{content}</>
  }

  return (
    <div className="vos-modal-overlay">
      <div className="vos-modal-panel w-[420px]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">WebDAV 服务器设置</div>
          <button type="button" className="vos-btn-reset text-[var(--vos-text-tertiary)]" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        {content}
      </div>
    </div>
  )
}

// ─── File size formatter ───────────────────────────────────────────────────

function fmtSize(bytes?: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** Shell-escape a string so it can be safely pasted into a terminal.
 *  Pure alphanumeric / `_.-` / `/` → as-is; otherwise wrap in single quotes,
 *  escaping any embedded `'` with the POSIX `'\''` idiom. */
function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_.\-/]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

// ─── Source kind icon/label mapping ────────────────────────────────────────

const kindMeta: Record<VfsSourceKind, { icon: typeof Monitor; label: string }> = {
  local: { icon: Monitor, label: '本机' },
  sftp: { icon: HardDrive, label: 'SFTP' },
  ftp: { icon: HardDrive, label: 'FTP' },
  smb: { icon: Globe, label: 'SMB' },
  s3: { icon: HardDrive, label: 'S3' },
  webdav: { icon: Globe, label: 'WebDAV' }
}

// ─── Column item ───────────────────────────────────────────────────────────

interface ColumnData {
  path: string
  entries: VfsNode[]
  loading: boolean
  selected?: string // selected item name in this column
}

// ─── Column View Component ─────────────────────────────────────────────────

function ColumnView({
  mountId,
  columns,
  multiSelect,
  activeColumn,
  renamingPath,
  renameValue,
  scrollTrigger,
  onMoveFile,
  onExternalFileDrop,
  onItemClick,
  onItemDoubleClick,
  onItemContextMenu,
  onColumnContextMenu,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onRubberBandSelect
}: {
  mountId: string
  columns: ColumnData[]
  multiSelect: Map<number, Set<string>>
  activeColumn: number
  renamingPath: string | null
  renameValue: string
  scrollTrigger: number
  onMoveFile: (srcPath: string, destDir: string, srcMountId?: string) => void
  onExternalFileDrop: (files: FileList, targetPath: string) => void
  onItemClick: (colIndex: number, entry: VfsNode, e: React.MouseEvent) => void
  onItemDoubleClick: (colIndex: number, entry: VfsNode) => void
  onItemContextMenu: (colIndex: number, entry: VfsNode, e: React.MouseEvent) => void
  onColumnContextMenu: (colIndex: number, path: string, e: React.MouseEvent) => void
  onRenameChange: (val: string) => void
  onRenameConfirm: () => void
  onRenameCancel: () => void
  onRubberBandSelect: (colIndex: number, entryNames: Set<string>) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const colScrollRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Auto scroll to the right when new columns are added
  // biome-ignore lint/correctness/useExhaustiveDependencies: columns.length triggers scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Defer to allow layout to settle (including preview panel transitions)
    const timer = setTimeout(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: 'instant' })
    }, 50)
    return () => clearTimeout(timer)
  }, [columns.length])

  // Scroll active column to keep selected item visible
  useEffect(() => {
    const colEl = colScrollRefs.current.get(activeColumn)
    if (!colEl) return
    const selected = colEl.querySelector('[aria-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    }
  }, [activeColumn, scrollTrigger, columns])

  const handleDragStart = (e: React.DragEvent, entry: VfsNode) => {
    e.dataTransfer.setData('application/x-vfs-path', entry.path)
    e.dataTransfer.setData('application/x-vfs-mount-id', mountId)
    e.dataTransfer.setData('text/plain', entry.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, entry: VfsNode) => {
    if (!entry.is_dir) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(entry.path)
  }

  const handleDragLeave = () => {
    setDropTarget(null)
  }

  const handleDrop = (e: React.DragEvent, targetDir: VfsNode) => {
    e.preventDefault()
    setDropTarget(null)
    if (!targetDir.is_dir) return
    // External files from OS
    if (e.dataTransfer.files.length > 0) {
      onExternalFileDrop(e.dataTransfer.files, targetDir.path)
      return
    }
    const srcPath = e.dataTransfer.getData('application/x-vfs-path')
    const srcMountId = e.dataTransfer.getData('application/x-vfs-mount-id') || undefined
    if (!srcPath || srcPath === targetDir.path) return
    if (targetDir.path.startsWith(`${srcPath}/`)) return
    onMoveFile(srcPath, targetDir.path, srcMountId)
  }

  const handleColumnDrop = (e: React.DragEvent, colPath: string) => {
    e.preventDefault()
    setDropTarget(null)
    // External files from OS
    if (e.dataTransfer.files.length > 0) {
      onExternalFileDrop(e.dataTransfer.files, colPath)
      return
    }
    const srcPath = e.dataTransfer.getData('application/x-vfs-path')
    const srcMountId = e.dataTransfer.getData('application/x-vfs-mount-id') || undefined
    if (!srcPath) return
    const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
    if (srcParent === colPath && srcMountId === mountId) return
    onMoveFile(srcPath, colPath, srcMountId)
  }

  // ── Rubber-band (marquee) selection ─────────────────────────────────

  const [rubberBand, setRubberBand] = useState<{
    active: boolean
    colIndex: number
    startY: number
    currentY: number
    scrollEl: HTMLDivElement | null
  }>({ active: false, colIndex: -1, startY: 0, currentY: 0, scrollEl: null })

  const rubberBandRef = useRef(rubberBand)
  rubberBandRef.current = rubberBand

  const handleRubberBandMouseDown = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      // Only start on left click on empty area (not on items)
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest('[data-vfs-entry]')) return

      const colEl = colScrollRefs.current.get(colIndex)
      if (!colEl) return

      const rect = colEl.getBoundingClientRect()
      const startY = e.clientY - rect.top + colEl.scrollTop

      setRubberBand({ active: true, colIndex, startY, currentY: startY, scrollEl: colEl })
    },
    []
  )

  useEffect(() => {
    if (!rubberBand.active) return

    const handleMouseMove = (e: MouseEvent) => {
      const rb = rubberBandRef.current
      if (!rb.active || !rb.scrollEl) return
      const rect = rb.scrollEl.getBoundingClientRect()
      const currentY = e.clientY - rect.top + rb.scrollEl.scrollTop
      setRubberBand(prev => ({ ...prev, currentY }))
    }

    const handleMouseUp = () => {
      const rb = rubberBandRef.current
      if (!rb.active) return

      // Collect entries within the rubber band rectangle
      const colEl = rb.scrollEl
      if (colEl) {
        const rect = colEl.getBoundingClientRect()
        const top = Math.min(rb.startY, rb.currentY)
        const bottom = Math.max(rb.startY, rb.currentY)
        const colRectTop = colEl.scrollTop

        const selected = new Set<string>()
        const items = colEl.querySelectorAll('[data-vfs-entry]')
        for (const item of items) {
          const itemRect = item.getBoundingClientRect()
          const itemTop = itemRect.top - rect.top + colRectTop
          const itemBottom = itemTop + itemRect.height
          if (itemBottom >= top && itemTop <= bottom) {
            const name = (item as HTMLElement).dataset.vfsEntry
            if (name) selected.add(name)
          }
        }

        if (selected.size > 0) {
          onRubberBandSelect(rb.colIndex, selected)
        }
      }

      setRubberBand({ active: false, colIndex: -1, startY: 0, currentY: 0, scrollEl: null })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [rubberBand.active, onRubberBandSelect])

  return (
    <div ref={scrollRef} className="flex-1 flex overflow-x-auto overflow-y-hidden min-w-0 scroll-smooth">
      {columns.map((col, colIdx) => {
        const colSelected = multiSelect.get(colIdx)
        return (
          <div
            key={col.path}
            role="listbox"
            className="flex flex-col flex-shrink-0 overflow-hidden w-[220px] border-r-[0.5px] border-r-solid border-r-[var(--vos-border-subtle)]"
            onDragOver={e => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={e => handleColumnDrop(e, col.path)}
            onContextMenu={e => {
              // Only fire for empty area (not when right-clicking on an item)
              if ((e.target as HTMLElement).closest('[data-vfs-entry]')) return
              onColumnContextMenu(colIdx, col.path, e)
            }}
          >
            {col.loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Spinner size={14} />
              </div>
            ) : col.entries.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[var(--vos-text-tertiary)]">
                空目录
              </div>
            ) : (
              <div
                className="flex-1 overflow-auto"
                ref={el => {
                  if (el) colScrollRefs.current.set(colIdx, el)
                  else colScrollRefs.current.delete(colIdx)
                }}
                onMouseDown={e => handleRubberBandMouseDown(colIdx, e)}
                style={{ position: 'relative' }}
              >
                {/* Rubber-band selection overlay */}
                {rubberBand.active && rubberBand.colIndex === colIdx && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: Math.min(rubberBand.startY, rubberBand.currentY),
                      height: Math.abs(rubberBand.currentY - rubberBand.startY),
                      background: 'rgba(59,130,246,0.15)',
                      border: '1px solid rgba(59,130,246,0.5)',
                      borderRadius: 2,
                      pointerEvents: 'none',
                      zIndex: 10
                    }}
                  />
                )}
                {col.entries.map(entry => {
                  const isPrimary = col.selected === entry.name
                  const isLastCol = colIdx === columns.length - 1
                  // Ancestor: selected in a non-last column (part of the navigation path)
                  const isAncestorSel = isPrimary && !isLastCol
                  // Current selection: selected in the last column
                  const isCurrentSel = isPrimary && isLastCol
                  const isMulti = colSelected?.has(entry.name) ?? false
                  const isHighlighted = isPrimary || isMulti
                  const isDragTarget = entry.is_dir && dropTarget === entry.path
                  const isRenaming = renamingPath === entry.path
                  return (
                    <div
                      key={entry.name}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isHighlighted}
                      data-vfs-entry={entry.name}
                      draggable={!isRenaming}
                      onDragStart={e => handleDragStart(e, entry)}
                      onDragOver={e => handleDragOver(e, entry)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, entry)}
                      className="flex items-center gap-1.5 px-2 py-[3px] text-xs cursor-pointer"
                      style={{
                        background: isDragTarget
                          ? 'var(--vos-accent-primary-hover, rgba(59,130,246,0.2))'
                          : isCurrentSel
                            ? 'var(--vos-accent-primary)'
                            : isAncestorSel
                              ? 'rgba(59,130,246,0.12)'
                              : isMulti
                                ? 'var(--vos-accent-primary-muted, rgba(59,130,246,0.25))'
                                : 'transparent',
                        color: isCurrentSel
                          ? '#fff'
                          : isAncestorSel
                            ? 'var(--vos-accent-primary)'
                            : isMulti && colIdx === activeColumn
                              ? '#fff'
                              : 'var(--vos-text-primary)',
                        borderRadius: 3,
                        margin: '1px 4px',
                        outline: isDragTarget ? '1.5px dashed var(--vos-accent-primary)' : 'none'
                      }}
                      onClick={e => onItemClick(colIdx, entry, e)}
                      onDoubleClick={() => onItemDoubleClick(colIdx, entry)}
                      onContextMenu={e => onItemContextMenu(colIdx, entry, e)}
                    >
                      {entry.is_dir ? (
                        <Folder
                          size={13}
                          className="shrink-0"
                          style={{
                            color: isCurrentSel
                              ? '#fff'
                              : isAncestorSel
                                ? 'var(--vos-accent-primary)'
                                : isMulti && colIdx === activeColumn
                                  ? '#fff'
                                  : 'var(--vos-accent-warning)'
                          }}
                        />
                      ) : (
                        (() => {
                          const iconInfo = getFileIconByName(entry.name)
                          const IconComp = iconInfo.icon
                          return (
                            <IconComp
                              size={13}
                              className="shrink-0"
                              style={{
                                color:
                                  isCurrentSel || (isMulti && colIdx === activeColumn)
                                    ? '#fff'
                                    : isAncestorSel
                                      ? 'var(--vos-accent-primary)'
                                      : iconInfo.color
                              }}
                            />
                          )
                        })()
                      )}
                      {isRenaming ? (
                        <input
                          ref={el => {
                            if (el) {
                              const dot = renameValue.lastIndexOf('.')
                              if (dot > 0) {
                                el.setSelectionRange(0, dot)
                              } else {
                                el.select()
                              }
                            }
                          }}
                          autoFocus
                          className="flex-1 text-xs px-1 py-0 rounded border-none outline-none bg-white text-black min-w-0"
                          value={renameValue}
                          onChange={e => onRenameChange(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') onRenameConfirm()
                            if (e.key === 'Escape') onRenameCancel()
                            e.stopPropagation()
                          }}
                          onBlur={onRenameCancel}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="flex-1 truncate">{entry.name}</span>
                      )}
                      {entry.is_dir && !isRenaming && <ChevronRight size={11} className="opacity-50 shrink-0" />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── File Info Panel ───────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const CODE_EXTS = new Set([
  'js',
  'ts',
  'jsx',
  'tsx',
  'json',
  'yaml',
  'yml',
  'toml',
  'rs',
  'go',
  'py',
  'sh',
  'bash',
  'zsh',
  'css',
  'html',
  'xml',
  'md',
  'sql',
  'env'
])

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function tryFormatJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    return content
  }
}

// ─── Explorer Settings Sheet ────────────────────────────────────────────────

function ExplorerSettingsSheet({
  mounts,
  showHidden,
  onShowHiddenChange,
  onClose
}: {
  mounts: { id: string; name: string }[]
  showHidden: boolean
  onShowHiddenChange: (value: boolean) => void
  onClose: () => void
}) {
  const categories = [
    {
      id: 'general',
      label: '通用',
      icon: <Eye size={14} />,
      content: (
        <PreferenceSection title="通用">
          <AppPreferenceGroup label="文件显示">
            <PreferenceRow label="显示隐藏文件" description="控制文件列表是否显示隐藏项。">
              <PreferenceToggle
                checked={showHidden}
                onChange={value => onShowHiddenChange(value)}
                label="显示隐藏文件"
              />
            </PreferenceRow>
          </AppPreferenceGroup>
        </PreferenceSection>
      )
    },
    {
      id: 'webdav',
      label: 'WebDAV',
      icon: <Globe size={14} />,
      content: (
        <PreferenceSection title="WebDAV 服务器">
          <AppPreferenceGroup label="共享设置">
            <div className="rounded-xl border-[0.5px] border-solid border-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] px-3 py-3">
              <WebDavServerPanel mounts={mounts} onClose={onClose} embedded />
            </div>
          </AppPreferenceGroup>
        </PreferenceSection>
      )
    }
  ]

  return (
    <AppPreferencesSheet open={true} onClose={onClose} appName="Explorer" categories={categories} />
  )
}

function FileInfoPanel({
  mountId,
  preview,
  node,
  onClose
}: {
  mountId: string
  preview: VfsFileContent | null
  node: VfsNode | null
  onClose: () => void
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(false)

  useEffect(() => {
    if (!node || node.is_dir) {
      setImgSrc(null)
      setImgLoading(false)
      return
    }
    const ext = getFileExt(node.name)
    if (!IMAGE_EXTS.has(ext)) {
      setImgSrc(null)
      setImgLoading(false)
      return
    }
    // Clear stale image immediately so user sees loading state, not the previous image
    setImgSrc(null)
    setImgLoading(true)
    const abortController = new AbortController()
    let url: string | null = null
    vfsApi
      .readVfsFileRaw(mountId, node.path, abortController.signal)
      .then(blob => {
        if (abortController.signal.aborted) return
        url = URL.createObjectURL(blob)
        setImgSrc(url)
        setImgLoading(false)
      })
      .catch(e => {
        if ((e as Error)?.name === 'AbortError') return
        setImgSrc(null)
        setImgLoading(false)
      })
    return () => {
      abortController.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [mountId, node])

  if (!node) return null

  const ext = node.is_dir ? '' : getFileExt(node.name)
  const isImage = !node.is_dir && IMAGE_EXTS.has(ext)
  const isCode = !node.is_dir && (CODE_EXTS.has(ext) || ext === 'json')
  const displayContent =
    preview && !node.is_dir && !preview.is_binary
      ? ext === 'json'
        ? tryFormatJson(preview.content)
        : preview.content
      : null

  return (
    <div className="flex flex-col overflow-hidden flex-shrink-0 w-[280px] border-l-[0.5px] border-l-solid border-l-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)]">
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
        <span className="text-xs font-medium truncate">{node.name}</span>
        <button type="button" className="vos-btn-reset text-[var(--vos-text-tertiary)]" onClick={onClose}>
          <X size={12} />
        </button>
      </div>

      {/* File metadata */}
      <div className="px-3 py-2 text-xs flex flex-col gap-1 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
        <div className="flex justify-between">
          <span className="text-[var(--vos-text-tertiary)]">类型</span>
          <span>{node.is_dir ? '目录' : ext ? ext.toUpperCase() : '文件'}</span>
        </div>
        {!node.is_dir && node.size != null && (
          <div className="flex justify-between">
            <span className="text-[var(--vos-text-tertiary)]">大小</span>
            <span>{fmtSize(node.size)}</span>
          </div>
        )}
        {node.modified && (
          <div className="flex justify-between">
            <span className="text-[var(--vos-text-tertiary)]">修改时间</span>
            <span>{new Date(node.modified).toLocaleString()}</span>
          </div>
        )}
        {preview?.truncated && <div className="text-[10px] text-[var(--vos-accent-warning)]">仅预览前 1MB</div>}
      </div>

      {/* Image preview */}
      {isImage && (
        <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
          {imgLoading ? (
            <Spinner size={14} />
          ) : imgSrc ? (
            <img src={imgSrc} alt={node.name} className="max-w-full max-h-full object-contain rounded" />
          ) : null}
        </div>
      )}

      {/* Text / code preview — show spinner while loading, content when ready */}
      {!isImage && !node.is_dir && (
        <div className="flex-1 overflow-auto">
          {!preview ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <Spinner size={14} />
            </div>
          ) : preview.is_binary ? (
            <div className="flex-1 flex items-center justify-center p-4 text-xs text-[var(--vos-text-tertiary)] italic">
              二进制文件，无法预览
            </div>
          ) : (
            <pre
              className={`p-3 text-xs m-0 ${isCode ? 'font-mono' : ''} whitespace-pre-wrap break-words leading-[1.6] text-[var(--vos-text-primary)] bg-transparent`}
            >
              {displayContent}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─── File viewer modal ────────────────────────────────────────────────────

const PDF_EXTS = new Set(['pdf'])
const TEXT_EXTS = new Set([
  'txt',
  'md',
  'markdown',
  'log',
  'csv',
  'tsv',
  'ini',
  'env',
  'conf',
  'cfg',
  'toml',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'css',
  'less',
  'scss',
  'js',
  'jsx',
  'ts',
  'tsx',
  'json',
  'jsonc',
  'rs',
  'py',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'rb',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'sql',
  'graphql',
  'proto',
  'diff',
  'patch',
  'gitignore',
  'dockerfile',
  'makefile',
  'license',
  'readme'
])

function isTextFile(name: string): boolean {
  const ext = getFileExt(name)
  if (TEXT_EXTS.has(ext)) return true
  // No extension — treat as text (like Makefile, Dockerfile)
  if (!ext || ext === name.toLowerCase()) return true
  return false
}

function FileViewerModal({ mountId, node, onClose }: { mountId: string; node: VfsNode; onClose: () => void }) {
  const [content, setContent] = useState<VfsFileContent | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  // Image transform state
  const [imgRotation, setImgRotation] = useState(0)
  const [imgFlipH, setImgFlipH] = useState(false)
  const [imgFlipV, setImgFlipV] = useState(false)

  const ext = getFileExt(node.name)
  const isImage = IMAGE_EXTS.has(ext)
  const isPdf = PDF_EXTS.has(ext)
  const isText = isTextFile(node.name)
  const isCode = CODE_EXTS.has(ext) || ext === 'json' || ext === 'yaml' || ext === 'yml'
  const canSaveImage = isImage && new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp']).has(ext)

  // biome-ignore lint/correctness/useExhaustiveDependencies: node.path+mountId are the real deps
  useEffect(() => {
    setLoading(true)
    setError(null)
    setContent(null)
    setBlobUrl(null)
    setEditing(false)
    setImgRotation(0)
    setImgFlipH(false)
    setImgFlipV(false)
    let revoke: string | null = null

    if (isImage || isPdf) {
      vfsApi
        .readVfsFileRaw(mountId, node.path)
        .then(blob => {
          const url = URL.createObjectURL(blob)
          revoke = url
          setBlobUrl(url)
        })
        .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
        .finally(() => setLoading(false))
    } else {
      vfsApi
        .readVfsFile(mountId, node.path, 4 * 1024 * 1024)
        .then(r => {
          setContent(r.data)
          setEditContent(r.data.content)
        })
        .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
        .finally(() => setLoading(false))
    }
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [mountId, node.path])

  const handleSave = async () => {
    setSaving(true)
    try {
      await vfsApi.writeVfsFile(mountId, node.path, editContent)
      setEditing(false)
      setContent(prev => (prev ? { ...prev, content: editContent } : prev))
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveImageTransform = async (rot: number, fH: boolean, fV: boolean) => {
    if (!canSaveImage || !blobUrl) return
    setSaving(true)
    try {
      const img = new Image()
      img.src = blobUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image load failed'))
      })
      const r = ((rot % 360) + 360) % 360
      const isRotated90 = r === 90 || r === 270
      const canvas = document.createElement('canvas')
      canvas.width = isRotated90 ? img.naturalHeight : img.naturalWidth
      canvas.height = isRotated90 ? img.naturalWidth : img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate((r * Math.PI) / 180)
      if (fH) ctx.scale(-1, 1)
      if (fV) ctx.scale(1, -1)
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
      const newBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), mimeType, 0.95)
      })
      const file = new File([newBlob], node.name, { type: mimeType })
      await vfsApi.uploadVfsFile(mountId, node.path, file)
      const newUrl = URL.createObjectURL(newBlob)
      setBlobUrl(prev => {
        if (prev) URL.revokeObjectURL(prev)
        return newUrl
      })
      setImgRotation(0)
      setImgFlipH(false)
      setImgFlipV(false)
    } catch (e) {
      console.error('Save image transform failed:', e)
    } finally {
      setSaving(false)
    }
  }

  // Keyboard: Escape closes, Ctrl/Cmd+S saves
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSave is stable within the effect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && editing) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editing, editContent, onClose])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click to close
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.55)]" onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: modal panel */}
      <div
        className="flex flex-col overflow-hidden rounded-lg bg-[var(--vos-bg-surface)] shadow-[0_24px_80px_rgba(0,0,0,.6)] w-[82%] h-[82%]"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center px-3 py-2 gap-2 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
          <FileIcon size={13} className="text-[var(--vos-text-tertiary)] shrink-0" />
          <span className="text-xs font-medium flex-1 truncate">{node.name}</span>
          {/* Image transform toolbar */}
          {isImage && blobUrl && canSaveImage && (
            <>
              <button
                type="button"
                className="vos-btn text-[11px] px-1.5 py-0.5"
                title="向左旋转"
                onClick={() => {
                  const r = imgRotation - 90
                  setImgRotation(r)
                  handleSaveImageTransform(r, imgFlipH, imgFlipV)
                }}
              >
                <RotateCcw size={12} />
              </button>
              <button
                type="button"
                className="vos-btn text-[11px] px-1.5 py-0.5"
                title="向右旋转"
                onClick={() => {
                  const r = imgRotation + 90
                  setImgRotation(r)
                  handleSaveImageTransform(r, imgFlipH, imgFlipV)
                }}
              >
                <RotateCw size={12} />
              </button>
              <button
                type="button"
                className="vos-btn text-[11px] px-1.5 py-0.5"
                title="水平翻转"
                onClick={() => {
                  const fH = !imgFlipH
                  setImgFlipH(fH)
                  handleSaveImageTransform(imgRotation, fH, imgFlipV)
                }}
              >
                <FlipHorizontal2 size={12} />
              </button>
              <button
                type="button"
                className="vos-btn text-[11px] px-1.5 py-0.5"
                title="垂直翻转"
                onClick={() => {
                  const fV = !imgFlipV
                  setImgFlipV(fV)
                  handleSaveImageTransform(imgRotation, imgFlipH, fV)
                }}
              >
                <FlipVertical2 size={12} />
              </button>
              {saving && <Spinner size={12} />}
            </>
          )}
          {!node.is_dir &&
            isText &&
            content &&
            !content.is_binary &&
            (editing ? (
              <>
                <button
                  type="button"
                  className="vos-btn vos-btn-primary text-[11px] px-2 py-0.5"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  type="button"
                  className="vos-btn text-[11px] px-2 py-0.5"
                  onClick={() => {
                    setEditing(false)
                    setEditContent(content.content)
                  }}
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                className="vos-btn text-[11px] px-2 py-0.5 flex items-center gap-[4px]"
                onClick={() => setEditing(true)}
              >
                <Pencil size={11} />
                编辑
              </button>
            ))}
          <button type="button" className="vos-btn text-[11px] px-1.5 py-0.5" onClick={onClose}>
            <X size={12} />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner size={20} />
            </div>
          )}

          {!loading && error && (
            <div className="p-6 flex flex-col gap-2">
              <div className="text-xs select-text break-all text-[var(--vos-accent-danger)]">加载失败：{error}</div>
              <button
                type="button"
                className="vos-btn text-xs self-start flex items-center gap-1 px-2 py-0.5"
                onClick={() => navigator.clipboard.writeText(error).then(() => toast.success('已复制'))}
              >
                <Copy size={11} />
                复制错误
              </button>
            </div>
          )}

          {!loading && !error && isImage && blobUrl && (
            <div className="flex items-center justify-center w-full h-full p-4 overflow-auto">
              <img
                src={blobUrl}
                alt={node.name}
                className="max-w-full max-h-full object-contain rounded"
                style={{
                  transform: `rotate(${imgRotation}deg) scaleX(${imgFlipH ? -1 : 1}) scaleY(${imgFlipV ? -1 : 1})`
                }}
              />
            </div>
          )}

          {!loading && !error && isPdf && blobUrl && (
            <embed src={`${blobUrl}#toolbar=1&navpanes=0`} type="application/pdf" className="w-full h-full" />
          )}

          {!loading && !error && content?.is_binary && (
            <div className="p-6 text-xs font-mono text-[var(--vos-text-tertiary)]">
              <div className="mb-2 text-[var(--vos-text-secondary)]">二进制文件</div>
              <div>大小：{fmtSize(content.size)}</div>
              <div>类型：{ext?.toUpperCase() ?? '未知'}</div>
            </div>
          )}

          {!loading &&
            !error &&
            content &&
            !content.is_binary &&
            (editing ? (
              <textarea
                autoFocus
                className={`w-full h-full p-3 text-xs resize-none border-none outline-none leading-[1.7] tab-[2] bg-[var(--vos-bg-editor,var(--vos-bg-base))] text-[var(--vos-text-primary)] ${isCode ? 'font-mono' : ''}`}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <div className="w-full h-full overflow-auto">
                {content.truncated && (
                  <div className="px-3 py-1 text-[11px] flex-shrink-0 bg-[var(--vos-accent-warning-subtle,rgba(234,179,8,0.1))] text-[var(--vos-accent-warning,#ca8a04)] border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
                    文件过大，仅预览前 4MB
                  </div>
                )}
                <pre
                  className={`p-3 text-xs m-0 whitespace-pre-wrap break-words leading-[1.7] text-[var(--vos-text-primary)] bg-transparent ${isCode ? 'font-mono' : ''}`}
                >
                  {content.content}
                </pre>
              </div>
            ))}
        </div>

        {/* Footer: file info */}
        {content && (
          <div className="flex items-center gap-4 px-3 py-1.5 text-[11px] flex-shrink-0 border-t-[0.5px] border-t-solid border-t-[var(--vos-border-subtle)] text-[var(--vos-text-tertiary)]">
            <span>{fmtSize(content.size)}</span>
            {node.modified && <span>{new Date(node.modified).toLocaleString()}</span>}
            {node.permissions && <span>{node.permissions}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

void FileViewerModal

// ─── Main app ──────────────────────────────────────────────────────────────

export default function ExplorerApp({ windowId, initialAppState }: AppComponentProps) {
  const storage = useAppStorage('explorer')
  // Capture initial state once — avoid re-triggering reload when appState is synced back
  const initialAppStateRef = useRef(initialAppState)
  const [mounts, setMounts] = useState<VfsMount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingMount, setEditingMount] = useState<VfsMount | null>(null)
  const [showExplorerSettings, setShowExplorerSettings] = useState(false)
  const [selectedMount, setSelectedMount] = useState<string | null>(
    (initialAppStateRef.current?.selectedMount as string) ?? null
  )
  // local mount statuses: id -> { mounted, mount_point, error }
  const [localMountStatuses, setLocalMountStatuses] = useState<
    Record<string, { mounted: boolean; mount_point: string | null; error: string | null }>
  >({})
  // Track mount/unmount operation loading state per mount id
  const [mountOpLoading, setMountOpLoading] = useState<Record<string, boolean>>({})
  const [columns, setColumns] = useState<ColumnData[]>([])
  const [preview, setPreview] = useState<VfsFileContent | null>(null)
  const [selectedNode, setSelectedNode] = useState<VfsNode | null>(null)
  const [scrollTrigger] = useState(0)
  const [showHidden, setShowHidden] = useState(false)
  const showHiddenRef = useRef(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // Load persisted preferences from storage SDK BEFORE initial data load
  useEffect(() => {
    storage.getJSON<{ showHidden?: boolean }>('preferences').then(prefs => {
      if (prefs?.showHidden !== undefined) {
        setShowHidden(prefs.showHidden)
        showHiddenRef.current = prefs.showHidden
      }
      setPrefsLoaded(true)
    })
  }, [storage])

  // Multi-select: colIdx -> Set of item names
  const [multiSelect, setMultiSelect] = useState<Map<number, Set<string>>>(new Map())
  const [activeColumn, setActiveColumn] = useState(0)
  const [selectAnchor, setSelectAnchor] = useState<{ col: number; name: string } | null>(null)

  // Rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // New folder overlay
  const [newFolderState, setNewFolderState] = useState<{ visible: boolean; colPath: string; name: string }>({
    visible: false,
    colPath: '',
    name: ''
  })

  // New file overlay
  const [newFileState, setNewFileState] = useState<{ visible: boolean; dirPath: string; name: string }>({
    visible: false,
    dirPath: '',
    name: ''
  })

  // Confirm dialog
  const [confirmState, setConfirmState] = useState<{
    visible: boolean
    message: string
    onConfirm: () => void
  }>({ visible: false, message: '', onConfirm: () => {} })

  // Open-with dialog
  const [openWithState, setOpenWithState] = useState<{
    visible: boolean
    node: VfsNode | null
    apps: AppManifest[]
    showAll: boolean // Show all registered apps
  }>({ visible: false, node: null, apps: [], showAll: false })

  // Set-default-open-with dialog
  const [defaultOpenState, setDefaultOpenState] = useState<{
    visible: boolean
    node: VfsNode | null
    ext: string
    apps: Array<AppManifest & { associationType: 'open' | 'preview' }>
    alsoOpenFile: boolean
  }>({ visible: false, node: null, ext: '', apps: [], alsoOpenFile: true })

  // Compress dialog
  const [compressState, setCompressState] = useState<{
    visible: boolean
    items: Array<{ mountId: string; node: VfsNode }>
    format: string
    encrypt: boolean
    password: string
    confirmPassword: string
    archiveName: string
  }>({ visible: false, items: [], format: 'zip', encrypt: false, password: '', confirmPassword: '', archiveName: '' })

  // Extract password dialog
  const [extractPasswordState, setExtractPasswordState] = useState<{
    visible: boolean
    mountId: string
    archivePath: string
    destDir: string
    colIdx: number
    password: string
  }>({ visible: false, mountId: '', archivePath: '', destDir: '', colIdx: 0, password: '' })

  // Properties dialog
  const [propertiesState, setPropertiesState] = useState<{
    visible: boolean
    node: VfsNode | null
  }>({ visible: false, node: null })

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetRef = useRef<string>('/')

  // Container ref for keyboard events
  const containerRef = useRef<HTMLDivElement>(null)

  // Clipboard store
  const clipboard = useVfsClipboardStore(s => s.clipboard)
  const setClipboard = useVfsClipboardStore(s => s.setClipboard)
  const clearClipboard = useVfsClipboardStore(s => s.clearClipboard)

  // Cancel in-flight preview requests when switching files
  const previewAbortRef = useRef<AbortController | null>(null)

  // Context menu
  const showContextMenu = useContextMenuStore(s => s.show)

  // Persist app state
  useAppStateSync(
    windowId,
    {
      selectedMount,
      columnPaths: columns.map(c => c.path),
      selectedNodeName: selectedNode?.name ?? null
    },
    [selectedMount, columns, selectedNode]
  )

  // Register app menus via kernel menu system
  useEffect(() => {
    const menus: AppMenuGroup[] = [
      {
        id: 'explorer',
        label: 'Explorer',
        items: [
          { id: 'preferences', label: '偏好设置', action: () => setShowExplorerSettings(true) },
          { type: 'separator' },
          { id: 'new-window', label: '新建窗口', action: () => openWindow('explorer') }
        ]
      }
    ]
    registerAppMenus('explorer', menus)
    return () => unregisterAppMenus('explorer')
  }, [windowId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-once
  const reload = useCallback(async () => {
    try {
      const r = await vfsApi.getVfsMounts()
      let mountList = r.data
      // Auto-create "本机" mount at home dir if no local mounts exist
      if (!mountList.some(m => m.kind === 'local')) {
        try {
          const res = await vfsApi.createVfsMount({ name: '本机', kind: 'local', root: '~' })
          mountList = [...mountList, res.data]
        } catch (_e) {
          /* ignore if creation fails */
        }
      }
      setMounts(mountList)

      // Restore state from initialAppState or auto-select first mount
      const savedMountId = initialAppStateRef.current?.selectedMount as string | undefined
      const savedColumnPaths = initialAppStateRef.current?.columnPaths as string[] | undefined

      if (savedMountId && mountList.some(m => m.id === savedMountId)) {
        // Restore saved mount and columns
        setSelectedMount(savedMountId)
        setPreview(null)
        setSelectedNode(null)
        setMultiSelect(new Map())
        setActiveColumn(0)

        if (savedColumnPaths && savedColumnPaths.length > 0) {
          // Restore saved columns
          const restoredColumns = await Promise.all(
            savedColumnPaths.map(async path => {
              const entries = await loadColumn(savedMountId, path)
              return { path, entries, loading: false }
            })
          )
          setColumns(restoredColumns)
        } else {
          // No saved columns, load root
          setColumns([{ path: '/', entries: [], loading: true }])
          const entries = await loadColumn(savedMountId, '/')
          setColumns([{ path: '/', entries, loading: false }])
        }
      } else if (!selectedMount && mountList.length > 0) {
        // Auto-select first mount if nothing selected
        selectMount(mountList[0].id)
      }

      // Fetch local mount statuses for enabled mounts
      const enabledMounts = mountList.filter(m => m.local_mount?.enabled)
      if (enabledMounts.length > 0) {
        const statuses = await Promise.allSettled(
          enabledMounts.map(m => vfsApi.localMountStatus(m.id).then(res => ({ id: m.id, ...res.data })))
        )
        const statusMap: Record<string, { mounted: boolean; mount_point: string | null; error: string | null }> = {}
        for (const s of statuses) {
          if (s.status === 'fulfilled') {
            statusMap[s.value.id] = { mounted: s.value.mounted, mount_point: s.value.mount_point, error: s.value.error }
          }
        }
        setLocalMountStatuses(statusMap)
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (prefsLoaded) reload()
  }, [reload, prefsLoaded])

  // Re-load all visible columns when hidden files setting changes
  useEffect(() => {
    if (!prefsLoaded || !selectedMount || columns.length === 0) return
    ;(async () => {
      const updated = await Promise.all(
        columns.map(async col => {
          const entries = await loadColumn(selectedMount, col.path)
          return { ...col, entries, loading: false }
        })
      )
      setColumns(updated)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden])

  const loadColumn = async (mountId: string, path: string): Promise<VfsNode[]> => {
    try {
      const r = await vfsApi.listVfsDir(mountId, path, showHiddenRef.current)
      return r.data
    } catch (e) {
      console.error(e)
      return []
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadColumn is stable
  const refreshColumn = useCallback(
    async (colIdx: number) => {
      if (!selectedMount || colIdx < 0 || colIdx >= columns.length) return
      const col = columns[colIdx]
      const entries = await loadColumn(selectedMount, col.path)
      setColumns(prev => {
        const updated = [...prev]
        if (colIdx < updated.length) {
          updated[colIdx] = { ...prev[colIdx], entries, loading: false }
        }
        return updated
      })
    },
    [selectedMount, columns]
  )

  const selectMount = async (id: string) => {
    setSelectedMount(id)
    setPreview(null)
    setSelectedNode(null)
    setMultiSelect(new Map())
    setActiveColumn(0)
    // Load root column
    setColumns([{ path: '/', entries: [], loading: true }])
    const entries = await loadColumn(id, '/')
    setColumns([{ path: '/', entries, loading: false }])
  }

  const handleMoveFile = async (srcPath: string, destDir: string, srcMountId?: string) => {
    if (!selectedMount) return
    const fileName = srcPath.split('/').pop() || ''
    const dest = destDir === '/' ? `/${fileName}` : `${destDir}/${fileName}`
    try {
      if (srcMountId && srcMountId !== selectedMount) {
        // Cross-mount: read from source, upload to destination
        const blob = await vfsApi.readVfsFileRaw(srcMountId, srcPath)
        const file = new File([blob], fileName)
        await vfsApi.uploadVfsFile(selectedMount, dest, file)
      } else {
        await vfsApi.moveVfsFile(selectedMount, srcPath, dest)
      }
      // Refresh affected columns
      setColumns(prev =>
        prev.map(col => {
          const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
          if (col.path === srcParent || col.path === destDir) {
            return { ...col, loading: true }
          }
          return col
        })
      )
      const updated = await Promise.all(
        columns.map(async col => {
          const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '/'
          if (col.path === srcParent || col.path === destDir) {
            const entries = await loadColumn(selectedMount, col.path)
            return { ...col, entries, loading: false }
          }
          return col
        })
      )
      setColumns(updated)
    } catch (e) {
      console.error('Move failed:', e)
    }
  }

  const handleNavigate = async (colIndex: number, entry: VfsNode) => {
    if (!selectedMount) return

    // Update selected item in this column
    setColumns(prev => {
      const updated = prev.slice(0, colIndex + 1)
      updated[colIndex] = { ...updated[colIndex], selected: entry.name }
      return updated
    })

    if (entry.is_dir) {
      const newPath = entry.path
      setColumns(prev => {
        const updated = prev.slice(0, colIndex + 1)
        updated[colIndex] = { ...updated[colIndex], selected: entry.name }
        return [...updated, { path: newPath, entries: [], loading: true }]
      })
      const entries = await loadColumn(selectedMount, newPath)
      setColumns(prev => {
        const updated = [...prev]
        const targetIdx = colIndex + 1
        if (targetIdx < updated.length) {
          updated[targetIdx] = { path: newPath, entries, loading: false }
        }
        return updated
      })
      setSelectedNode(entry)
      // Cancel any in-flight preview request when navigating into a directory
      previewAbortRef.current?.abort()
      previewAbortRef.current = null
      setPreview(null)
      setActiveColumn(colIndex + 1)
    } else {
      setSelectedNode(entry)
      // Images are previewed via /raw in FileInfoPanel — skip /read to avoid duplicate requests
      const ext = getFileExt(entry.name)
      if (IMAGE_EXTS.has(ext)) {
        previewAbortRef.current?.abort()
        previewAbortRef.current = null
        setPreview(null)
        return
      }
      // Clear previous preview immediately so panel shows loading spinner, not stale content
      setPreview(null)
      // Cancel previous preview request
      previewAbortRef.current?.abort()
      const abortController = new AbortController()
      previewAbortRef.current = abortController
      try {
        const r = await vfsApi.readVfsFile(selectedMount, entry.path, undefined, abortController.signal)
        if (!abortController.signal.aborted) {
          setPreview(r.data)
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        console.error(e)
      }
    }
  }

  const deleteMount = async (id: string) => {
    await vfsApi.deleteVfsMount(id)
    if (selectedMount === id) {
      setSelectedMount(null)
      setColumns([])
      setPreview(null)
      setSelectedNode(null)
    }
    reload()
  }

  // ── Multi-select helpers ───────────────────────────────────────────

  const clearMultiSelect = () => setMultiSelect(new Map())

  const handleRubberBandSelect = useCallback(
    (colIdx: number, entryNames: Set<string>) => {
      setActiveColumn(colIdx)
      setMultiSelect(prev => {
        const next = new Map(prev)
        next.set(colIdx, entryNames)
        return next
      })
      // Update the primary selection to the last item in the set
      const lastName = Array.from(entryNames).pop()
      if (lastName) {
        setSelectAnchor({ col: colIdx, name: lastName })
        setColumns(prev => {
          const updated = [...prev]
          updated[colIdx] = { ...updated[colIdx], selected: lastName }
          return updated
        })
      }
    },
    []
  )

  const getSelectedEntries = (colIdx: number): VfsNode[] => {
    const names = multiSelect.get(colIdx)
    if (!names || names.size === 0) {
      // Fall back to single selected
      const col = columns[colIdx]
      if (col?.selected) {
        const entry = col.entries.find(e => e.name === col.selected)
        return entry ? [entry] : []
      }
      return []
    }
    const col = columns[colIdx]
    return col ? col.entries.filter(e => names.has(e.name)) : []
  }

  const handleItemClick = (colIdx: number, entry: VfsNode, e: React.MouseEvent) => {
    const modKey = isMac ? e.metaKey : e.ctrlKey
    setActiveColumn(colIdx)

    if (modKey) {
      // Toggle multi-select
      setMultiSelect(prev => {
        const next = new Map(prev)
        const set = new Set(next.get(colIdx) ?? [])
        if (set.has(entry.name)) {
          set.delete(entry.name)
        } else {
          set.add(entry.name)
        }
        // Always include primary selection
        const col = columns[colIdx]
        if (col?.selected) set.add(col.selected)
        next.set(colIdx, set)
        return next
      })
      setSelectAnchor({ col: colIdx, name: entry.name })
    } else if (e.shiftKey && selectAnchor?.col === colIdx) {
      // Range select
      const col = columns[colIdx]
      if (col) {
        const names = col.entries.map(n => n.name)
        const anchorIdx = names.indexOf(selectAnchor.name)
        const currentIdx = names.indexOf(entry.name)
        if (anchorIdx >= 0 && currentIdx >= 0) {
          const start = Math.min(anchorIdx, currentIdx)
          const end = Math.max(anchorIdx, currentIdx)
          const selected = new Set(names.slice(start, end + 1))
          setMultiSelect(prev => {
            const next = new Map(prev)
            next.set(colIdx, selected)
            return next
          })
        }
      }
    } else {
      // Normal click — clear multi-select and navigate
      clearMultiSelect()
      setSelectAnchor({ col: colIdx, name: entry.name })
      if (entry.is_dir) {
        handleNavigate(colIdx, entry)
      } else {
        handleNavigate(colIdx, entry)
      }
    }
  }

  // ── File operations ────────────────────────────────────────────────

  const handleCopy = () => {
    if (!selectedMount) return
    const entries = getSelectedEntries(activeColumn)
    if (entries.length === 0) return
    setClipboard({
      items: entries.map(n => ({ mountId: selectedMount, node: n })),
      operation: 'copy'
    })
  }

  const handleCut = () => {
    if (!selectedMount) return
    const entries = getSelectedEntries(activeColumn)
    if (entries.length === 0) return
    setClipboard({
      items: entries.map(n => ({ mountId: selectedMount, node: n })),
      operation: 'cut'
    })
  }

  const handlePaste = async (targetPath: string) => {
    if (!selectedMount || !clipboard || clipboard.items.length === 0) return
    try {
      for (const item of clipboard.items) {
        const fileName = item.node.name
        const dest = targetPath === '/' ? `/${fileName}` : `${targetPath}/${fileName}`
        if (item.mountId !== selectedMount) {
          // Cross-mount: read from source, upload to destination
          const blob = await vfsApi.readVfsFileRaw(item.mountId, item.node.path)
          const file = new File([blob], fileName)
          await vfsApi.uploadVfsFile(selectedMount, dest, file)
          if (clipboard.operation === 'cut') {
            await vfsApi.deleteVfs(item.mountId, item.node.path)
          }
        } else if (clipboard.operation === 'copy') {
          await vfsApi.copyVfsFile(item.mountId, item.node.path, dest)
        } else {
          await vfsApi.moveVfsFile(item.mountId, item.node.path, dest)
        }
      }
      if (clipboard.operation === 'cut') {
        clearClipboard()
      }
      // Refresh the target column
      const targetColIdx = columns.findIndex(c => c.path === targetPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      console.error('Paste failed:', e)
    }
  }

  const handleDelete = async () => {
    if (!selectedMount) return
    const entries = getSelectedEntries(activeColumn)
    if (entries.length === 0) return
    const names = entries.map(e => e.name).join(', ')
    const colIdxAtDelete = activeColumn
    setConfirmState({
      visible: true,
      message: `确认删除 ${entries.length} 项？\n${names}`,
      onConfirm: async () => {
        setConfirmState(s => ({ ...s, visible: false }))
        try {
          for (const entry of entries) {
            await vfsApi.deleteVfs(selectedMount, entry.path)
          }
          // Clear selectedNode/preview if the node is among deleted or inside deleted dir
          if (selectedNode) {
            const affected = entries.some(
              e => selectedNode.path === e.path || selectedNode.path.startsWith(`${e.path}/`)
            )
            if (affected) {
              setSelectedNode(null)
              setPreview(null)
            }
          }
          // Truncate child columns for deleted directories
          const hasDeletedDir = entries.some(e => e.is_dir)
          if (hasDeletedDir) {
            setColumns(prev => prev.slice(0, colIdxAtDelete + 1))
          }
          clearMultiSelect()
          await refreshColumn(colIdxAtDelete)
        } catch (e) {
          console.error('Delete failed:', e)
        }
      }
    })
  }

  const handleRenameStart = () => {
    const entries = getSelectedEntries(activeColumn)
    if (entries.length !== 1) return
    setRenamingPath(entries[0].path)
    setRenameValue(entries[0].name)
  }

  const handleRenameConfirm = async () => {
    if (!selectedMount || !renamingPath || !renameValue.trim()) {
      setRenamingPath(null)
      return
    }
    const parentDir = renamingPath.substring(0, renamingPath.lastIndexOf('/')) || '/'
    const newPath = parentDir === '/' ? `/${renameValue}` : `${parentDir}/${renameValue}`
    if (newPath === renamingPath) {
      setRenamingPath(null)
      return
    }
    try {
      await vfsApi.moveVfsFile(selectedMount, renamingPath, newPath)
      setRenamingPath(null)
      await refreshColumn(activeColumn)
    } catch (e) {
      console.error('Rename failed:', e)
      setRenamingPath(null)
    }
  }

  const handleNewFolder = async () => {
    if (!selectedMount || !newFolderState.name.trim()) return
    const dirPath =
      newFolderState.colPath === '/' ? `/${newFolderState.name}` : `${newFolderState.colPath}/${newFolderState.name}`
    try {
      await vfsApi.mkdirVfs(selectedMount, dirPath)
      setNewFolderState({ visible: false, colPath: '', name: '' })
      const targetColIdx = columns.findIndex(c => c.path === newFolderState.colPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      console.error('New folder failed:', e)
    }
  }

  const handleNewFile = async () => {
    if (!selectedMount || !newFileState.name.trim()) return
    const filePath =
      newFileState.dirPath === '/' ? `/${newFileState.name}` : `${newFileState.dirPath}/${newFileState.name}`
    try {
      await vfsApi.writeVfsFile(selectedMount, filePath, '')
      setNewFileState({ visible: false, dirPath: '', name: '' })
      const targetColIdx = columns.findIndex(c => c.path === newFileState.dirPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      console.error('New file failed:', e)
    }
  }

  const handleUpload = async (files: FileList, targetPath?: string) => {
    if (!selectedMount || files.length === 0) return
    const tPath = targetPath ?? uploadTargetRef.current
    const taskId = taskService.createTask(
      {
        name: files.length > 1 ? `上传 ${files.length} 个文件` : `上传 ${files[0].name}`,
        source: 'explorer'
      },
      { runImmediately: true }
    )
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const filePath = tPath === '/' ? `/${file.name}` : `${tPath}/${file.name}`
        taskService.updateTask(taskId, 'running', Math.round((i / files.length) * 100))
        await vfsApi.uploadVfsFile(selectedMount, filePath, file)
      }
      taskService.updateTask(taskId, 'success', 100)
      const targetColIdx = columns.findIndex(c => c.path === tPath)
      if (targetColIdx >= 0) {
        await refreshColumn(targetColIdx)
      }
    } catch (e) {
      taskService.updateTask(taskId, 'failed')
      console.error('Upload failed:', e)
    }
  }

  const handleOpenViewer = (mountId: string, node: VfsNode) => {
    openWindow('file-viewer', {
      title: node.name,
      appState: { mountId, node }
    })
  }

  const handleOpenInShell = (entry: VfsNode) => {
    if (!selectedMount) return
    const mount = mounts.find(m => m.id === selectedMount)
    if (!mount) return
    const dirPath = entry.is_dir ? entry.path : entry.path.substring(0, entry.path.lastIndexOf('/')) || '/'

    // Determine absolute path for terminal cwd
    let absPath: string | undefined
    if (mount.kind === 'local') {
      // For local mounts, compute absolute path from mount root
      const root = mount.root.replace(/\/+$/, '')
      absPath = root === '~' ? `~${dirPath}` : `${root}${dirPath}`
    } else {
      // For remote mounts, use the FUSE mount point if mounted
      const fuseStatus = localMountStatuses[mount.id]
      if (fuseStatus?.mounted && fuseStatus.mount_point) {
        absPath = `${fuseStatus.mount_point.replace(/\/+$/, '')}${dirPath}`
      }
    }

    if (!absPath) return

    openWindow('terminal', {
      title: `终端 — ${entry.name}`,
      appState: { cwd: absPath }
    })
  }

  const handleItemDoubleClick = (colIdx: number, entry: VfsNode) => {
    void colIdx
    if (!selectedMount) return
    if (entry.is_dir) return
    const ext = getFileExt(entry.name)

    // 1. Check if a default app is set for this extension
    const defaultAppId = useFileDefaultsStore.getState().getDefault(ext)
    if (defaultAppId) {
      const defaultApp = getApp(defaultAppId)
      if (defaultApp) {
        openWindow(defaultApp.id, { appState: { mountId: selectedMount, node: entry } })
        return
      }
    }

    // 2. If no default, check all associated apps
    const associatedApps = getAppsForFile(ext)
    // Prefer apps with fileOpenAssociations / fileAssociations over filePreviewAssociations
    const openApps = associatedApps.filter(
      a => a.fileOpenAssociations?.includes(ext.toLowerCase()) || a.fileAssociations?.includes(ext.toLowerCase())
    )
    const appsToUse = openApps.length > 0 ? openApps : associatedApps
    if (appsToUse.length === 1) {
      // Single app — open directly AND auto-register as default for this ext
      if (ext) {
        useFileDefaultsStore.getState().setDefault(ext, appsToUse[0].id)
      }
      openWindow(appsToUse[0].id, { appState: { mountId: selectedMount, node: entry } })
    } else if (appsToUse.length > 1) {
      // Multiple apps — show "Open With" dialog
      setOpenWithState({ visible: true, node: entry, apps: appsToUse, showAll: false })
    } else {
      // 3. Fallback to file viewer
      handleOpenViewer(selectedMount, entry)
    }
  }

  // ── Context menus ──────────────────────────────────────────────────

  const handleItemContextMenu = (colIdx: number, entry: VfsNode, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveColumn(colIdx)
    // If not in multi-select, select this item
    if (!multiSelect.get(colIdx)?.has(entry.name)) {
      clearMultiSelect()
      setColumns(prev => {
        const updated = [...prev]
        if (colIdx < updated.length) {
          updated[colIdx] = { ...updated[colIdx], selected: entry.name }
        }
        return updated
      })
    }
    const modSymbol = isMac ? '⌘' : 'Ctrl+'
    const currentColPath = columns[colIdx]?.path ?? '/'
    showContextMenu(e.clientX, e.clientY, [
      {
        id: 'open',
        label: '打开',
        action: () => handleNavigate(colIdx, entry)
      },
      ...(entry.is_dir
        ? [
            ...(() => {
              // Only show "Open in Terminal" for local or FUSE-mounted sources
              const mount = mounts.find(m => m.id === selectedMount)
              const canOpenTerminal =
                mount &&
                (mount.kind === 'local' || (mount.local_mount?.enabled && localMountStatuses[mount.id]?.mounted))
              return canOpenTerminal
                ? [
                    {
                      id: 'open-shell',
                      label: '在终端中打开',
                      action: () => handleOpenInShell(entry)
                    }
                  ]
                : []
            })(),
            { type: 'separator' as const },
            {
              id: 'new-folder',
              label: '新建文件夹',
              action: () => setNewFolderState({ visible: true, colPath: entry.path, name: '' })
            },
            {
              id: 'new-file',
              label: '新建文件',
              action: () => setNewFileState({ visible: true, dirPath: entry.path, name: '' })
            }
          ]
        : (() => {
            const fileExt = getFileExt(entry.name)
            const allApps = getAllAppsForFile(fileExt)
            const alwaysApps = getAlwaysOpenWithApps()
            const hasExt = fileExt.length > 0

            // Determine default app
            const defaultAppId = useFileDefaultsStore.getState().getDefault(fileExt)
            const defaultApp = defaultAppId ? getApp(defaultAppId) : null

            // Build open-with submenu: default app first, divider, then rest
            const openWithItems: import('@/shell/ContextMenu/store').ContextMenuItems = []

            // Default app at the top
            if (defaultApp) {
              openWithItems.push({
                id: `ow-${defaultApp.id}`,
                label: `${defaultApp.name}（默认）`,
                action: () =>
                  selectedMount && openWindow(defaultApp.id, { appState: { mountId: selectedMount, node: entry } })
              })
              openWithItems.push({ type: 'separator' as const })
            }

            // All registered apps (skip default if already shown)
            for (const app of allApps) {
              if (app.id === defaultAppId) continue
              openWithItems.push({
                id: `ow-${app.id}`,
                label: app.name,
                action: () => selectedMount && openWindow(app.id, { appState: { mountId: selectedMount, node: entry } })
              })
            }

            // Always-show apps (skip if already listed)
            const listedIds = new Set([defaultAppId, ...allApps.map(a => a.id)])
            for (const app of alwaysApps) {
              if (listedIds.has(app.id)) continue
              openWithItems.push({
                id: `ow-${app.id}`,
                label: app.name,
                action: () => selectedMount && openWindow(app.id, { appState: { mountId: selectedMount, node: entry } })
              })
            }

            // File viewer is always available
            if (!listedIds.has('file-viewer')) {
              openWithItems.push({
                id: 'ow-file-viewer',
                label: '文件查看器',
                action: () => selectedMount && handleOpenViewer(selectedMount, entry)
              })
            }

            // Set default option (only for files with extension)
            if (hasExt) {
              openWithItems.push({ type: 'separator' as const })
              openWithItems.push({
                id: 'ow-set-default',
                label: '设置默认打开方式…',
                action: () => {
                  setDefaultOpenState({
                    visible: true,
                    node: entry,
                    ext: fileExt,
                    apps: getAllAppsForFile(fileExt),
                    alsoOpenFile: true
                  })
                }
              })
            }

            return [
              {
                id: 'open-with',
                label: '打开方式',
                submenu: openWithItems
              }
            ]
          })()),
      { type: 'separator' as const },
      ...(entry.is_dir || !ARCHIVE_EXTS.has(getFileExt(entry.name))
        ? [
            {
              id: 'compress',
              label: '压缩',
              action: () => {
                if (!selectedMount) return
                const entries = getSelectedEntries(colIdx)
                const items =
                  entries.length > 0
                    ? entries.map(e => ({ mountId: selectedMount!, node: e }))
                    : [{ mountId: selectedMount!, node: entry }]
                const defaultName = items.length === 1 ? items[0].node.name.replace(/\.[^.]+$/, '') : 'archive'
                setCompressState({
                  visible: true,
                  items,
                  format: 'zip',
                  encrypt: false,
                  password: '',
                  confirmPassword: '',
                  archiveName: defaultName
                })
              }
            }
          ]
        : [
            {
              id: 'extract',
              label: '解压',
              action: async () => {
                if (!selectedMount) return
                const parentDir = entry.path.substring(0, entry.path.lastIndexOf('/')) || '/'
                const baseName = entry.name.replace(
                  /\.(zip|7z|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz|tar\.zst|tzst|tar|gz|bz2|xz|zst|rar)$/i,
                  ''
                )
                const destPath = `${parentDir}/${baseName}`
                try {
                  // Check if archive is password-protected
                  const listResult = await vfsApi.listArchiveContents(selectedMount, entry.path)
                  if (listResult.data.password_required) {
                    setExtractPasswordState({
                      visible: true,
                      mountId: selectedMount,
                      archivePath: entry.path,
                      destDir: destPath,
                      colIdx,
                      password: ''
                    })
                    return
                  }
                  await request('POST', `/api/vfs/mounts/${encodeURIComponent(selectedMount)}/archive/extract`, {
                    archive_path: entry.path,
                    dest_dir: destPath
                  })
                  refreshColumn(colIdx)
                } catch (err) {
                  console.error('Extract failed:', err)
                }
              }
            }
          ]),
      { type: 'separator' as const },
      {
        id: 'copy',
        label: '复制',
        shortcut: `${modSymbol}C`,
        action: () => {
          if (!selectedMount) return
          const entries = getSelectedEntries(colIdx)
          if (entries.length === 0) {
            setClipboard({ items: [{ mountId: selectedMount, node: entry }], operation: 'copy' })
          } else {
            handleCopy()
          }
        }
      },
      {
        id: 'cut',
        label: '剪切',
        shortcut: `${modSymbol}X`,
        action: () => {
          if (!selectedMount) return
          const entries = getSelectedEntries(colIdx)
          if (entries.length === 0) {
            setClipboard({ items: [{ mountId: selectedMount, node: entry }], operation: 'cut' })
          } else {
            handleCut()
          }
        }
      },
      ...(clipboard && clipboard.items.length > 0
        ? [
            {
              id: 'paste',
              label: '粘贴',
              shortcut: `${modSymbol}V`,
              action: () => handlePaste(entry.is_dir ? entry.path : currentColPath)
            }
          ]
        : []),
      {
        id: 'copy-path',
        label: '复制路径',
        submenu: [
          {
            id: 'copy-relative-path',
            label: '复制相对路径',
            action: () => {
              navigator.clipboard.writeText(shellEscape(entry.path)).then(() => toast.success('已复制'))
            }
          },
          ...(mounts.find(m => m.id === selectedMount)?.kind === 'local'
            ? [
                {
                  id: 'copy-absolute-path',
                  label: '复制绝对路径',
                  action: () => {
                    const mount = mounts.find(m => m.id === selectedMount)
                    if (mount) {
                      const absPath = mount.root.replace(/\/+$/, '') + entry.path
                      navigator.clipboard.writeText(shellEscape(absPath)).then(() => toast.success('已复制'))
                    }
                  }
                }
              ]
            : []),
          {
            id: 'copy-vfs-path',
            label: '复制 VFS 路径',
            action: () => {
              const mount = mounts.find(m => m.id === selectedMount)
              const vfsPath = mount ? `${mount.kind}:${mount.name}${entry.path}` : entry.path
              navigator.clipboard.writeText(shellEscape(vfsPath)).then(() => toast.success('已复制'))
            }
          }
        ]
      },
      { type: 'separator' as const },
      {
        id: 'rename',
        label: '重命名',
        shortcut: 'F2',
        action: () => {
          setRenamingPath(entry.path)
          setRenameValue(entry.name)
        }
      },
      {
        id: 'delete',
        label: '删除',
        danger: true,
        action: () => {
          if (!selectedMount) return
          setConfirmState({
            visible: true,
            message: `确认删除「${entry.name}」？`,
            onConfirm: async () => {
              setConfirmState(s => ({ ...s, visible: false }))
              try {
                await vfsApi.deleteVfs(selectedMount, entry.path)
                // Clear selectedNode/preview if affected
                if (selectedNode && (selectedNode.path === entry.path || selectedNode.path.startsWith(`${entry.path}/`))) {
                  setSelectedNode(null)
                  setPreview(null)
                }
                // Truncate child columns when deleting a directory
                if (entry.is_dir) {
                  setColumns(prev => prev.slice(0, colIdx + 1))
                }
                clearMultiSelect()
                await refreshColumn(colIdx)
              } catch (err) {
                console.error('Delete failed:', err)
              }
            }
          })
        }
      },
      { type: 'separator' as const },
      {
        id: 'properties',
        label: '属性',
        action: () => {
          setPropertiesState({ visible: true, node: entry })
        }
      }
    ])
  }

  const handleColumnContextMenu = (colIdx: number, colPath: string, e: React.MouseEvent) => {
    e.preventDefault()
    setActiveColumn(colIdx)
    showContextMenu(e.clientX, e.clientY, [
      {
        id: 'new-folder',
        label: '新建文件夹',
        action: () => setNewFolderState({ visible: true, colPath, name: '' })
      },
      {
        id: 'new-file',
        label: '新建文件',
        action: () => setNewFileState({ visible: true, dirPath: colPath, name: '' })
      },
      ...(clipboard && clipboard.items.length > 0
        ? [
            {
              id: 'paste',
              label: '粘贴',
              action: () => handlePaste(colPath)
            }
          ]
        : []),
      {
        id: 'upload',
        label: '上传文件',
        action: () => {
          uploadTargetRef.current = colPath
          fileInputRef.current?.click()
        }
      },
      { type: 'separator' as const },
      {
        id: 'refresh',
        label: '刷新',
        action: () => refreshColumn(colIdx)
      }
    ])
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────

  // Use ref to avoid stale closures in the keydown handler
  const kbStateRef = useRef({
    selectedMount,
    columns,
    activeColumn,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleRenameStart,
    handleNavigate,
    getSelectedEntries,
    clearMultiSelect
  })
  kbStateRef.current = {
    selectedMount,
    columns,
    activeColumn,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleRenameStart,
    handleNavigate,
    getSelectedEntries,
    clearMultiSelect
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: KeyboardEvent) => {
      // Don't intercept if inside an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      const s = kbStateRef.current
      if (!s.selectedMount) return

      const modKey = isMac ? e.metaKey : e.ctrlKey
      const col = s.columns[s.activeColumn]
      if (!col) return

      if (modKey && e.key === 'a') {
        e.preventDefault()
        const allNames = new Set(col.entries.map(n => n.name))
        setMultiSelect(prev => {
          const next = new Map(prev)
          next.set(s.activeColumn, allNames)
          return next
        })
        return
      }

      if (modKey && e.key === 'c') {
        e.preventDefault()
        s.handleCopy()
        return
      }

      if (modKey && e.key === 'x') {
        e.preventDefault()
        s.handleCut()
        return
      }

      if (modKey && e.key === 'v') {
        e.preventDefault()
        s.handlePaste(col.path)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        s.handleDelete()
        return
      }

      if (e.key === 'F2') {
        e.preventDefault()
        s.handleRenameStart()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const entries = s.getSelectedEntries(s.activeColumn)
        if (entries.length === 1) {
          s.handleNavigate(s.activeColumn, entries[0])
        }
        return
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const entries = col.entries
        if (entries.length === 0) return
        const currentName = col.selected
        const currentIdx = currentName ? entries.findIndex(n => n.name === currentName) : -1
        let nextIdx: number
        if (e.key === 'ArrowUp') {
          nextIdx = currentIdx <= 0 ? entries.length - 1 : currentIdx - 1
        } else {
          nextIdx = currentIdx >= entries.length - 1 ? 0 : currentIdx + 1
        }
        const nextEntry = entries[nextIdx]
        s.clearMultiSelect()
        setSelectAnchor({ col: s.activeColumn, name: nextEntry.name })
        setColumns(prev => {
          const updated = prev.slice(0, s.activeColumn + 1)
          updated[s.activeColumn] = { ...updated[s.activeColumn], selected: nextEntry.name }
          return updated
        })
        setSelectedNode(nextEntry)
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (s.activeColumn > 0) {
          setActiveColumn(s.activeColumn - 1)
          s.clearMultiSelect()
        }
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const entries = s.getSelectedEntries(s.activeColumn)
        if (entries.length === 1 && entries[0].is_dir) {
          s.handleNavigate(s.activeColumn, entries[0])
        }
        return
      }
    }

    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [])

  // Build current path from columns
  const currentPath = columns.length > 0 ? columns[columns.length - 1].path : '/'

  return (
    <AppLayout
      sidebar={
        <AppSidebar width={180}>
          <SectionHeader
            title="存储源"
            actions={
              <>
                <button
                  type="button"
                  className="vos-btn-reset text-[var(--vos-text-tertiary)]"
                  onClick={reload}
                  title="刷新"
                >
                  <RefreshCw size={11} />
                </button>
                <button
                  type="button"
                  className="vos-btn-reset text-[var(--vos-accent-primary)]"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={13} />
                </button>
              </>
            }
          />

          {(() => {
            const localMounts = mounts.filter(m => m.kind === 'local')
            const networkMounts = mounts.filter(m => ['sftp', 'ftp', 'webdav', 'smb'].includes(m.kind))
            const objectMounts = mounts.filter(m => m.kind === 's3')

            const renderMount = (m: VfsMount) => {
              const KindIcon = kindMeta[m.kind]?.icon ?? HardDrive
              const isActive = selectedMount === m.id
              const fuseStatus = m.local_mount?.enabled ? localMountStatuses[m.id] : undefined
              const isFuseMounted = fuseStatus?.mounted === true
              const isLoading = mountOpLoading[m.id] === true

              const handleFuseToggle = async () => {
                setMountOpLoading(prev => ({ ...prev, [m.id]: true }))
                try {
                  if (isFuseMounted) {
                    await vfsApi.localUnmountVfs(m.id)
                    setLocalMountStatuses(prev => ({
                      ...prev,
                      [m.id]: { mounted: false, mount_point: null, error: null }
                    }))
                  } else {
                    const res = await vfsApi.localMountVfs(m.id)
                    if (res.data?.error) {
                      if (
                        res.data.error.includes('FUSE') ||
                        res.data.error.includes('macFUSE') ||
                        res.data.error.includes('libfuse')
                      ) {
                        openWindow('dependency-manager')
                      }
                    }
                    setLocalMountStatuses(prev => ({ ...prev, [m.id]: res.data }))
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : '挂载操作失败'
                  if (msg.includes('FUSE') || msg.includes('macFUSE') || msg.includes('libfuse')) {
                    openWindow('dependency-manager')
                  }
                  setLocalMountStatuses(prev => ({
                    ...prev,
                    [m.id]: { mounted: false, mount_point: null, error: msg }
                  }))
                } finally {
                  setMountOpLoading(prev => ({ ...prev, [m.id]: false }))
                }
              }

              const handleMountContextMenu = (e: React.MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                const items: import('@/shell/ContextMenu/store').ContextMenuItems = [
                  {
                    id: 'mount-settings',
                    label: '设置',
                    action: () => setEditingMount(m)
                  }
                ]
                // Mount/unmount option (only when local_mount is enabled)
                if (m.local_mount?.enabled) {
                  items.push({
                    id: 'mount-toggle',
                    label: isFuseMounted ? '取消挂载' : '挂载到本机',
                    action: handleFuseToggle
                  })
                }
                // "Open in Finder" — available for local mounts or remotely mounted sources
                if (m.kind === 'local' || m.local_mount?.enabled) {
                  items.push({
                    id: 'mount-open-finder',
                    label: '在 Finder 中打开',
                    action: async () => {
                      // Local mounts can always be opened
                      if (m.kind !== 'local' && !isFuseMounted) {
                        const backend = m.local_mount?.backend || 'fuse'
                        // Only FUSE requires external dependency pre-check
                        if (backend === 'fuse') {
                          try {
                            const checkRes = await vfsApi.checkFuse()
                            if (!checkRes.data?.available) {
                              openWindow('dependency-manager')
                              return
                            }
                          } catch (_) {
                            openWindow('dependency-manager')
                            return
                          }
                        }
                        // fileprovider auto-installs VentoFS.app during mount
                        // webdav has no external dependency

                        // Mount
                        setMountOpLoading(prev => ({ ...prev, [m.id]: true }))
                        try {
                          const res = await vfsApi.localMountVfs(m.id)
                          if (res.data?.error) return
                          setLocalMountStatuses(prev => ({ ...prev, [m.id]: res.data }))
                        } catch (err) {
                          console.error('Mount failed:', err)
                          return
                        } finally {
                          setMountOpLoading(prev => ({ ...prev, [m.id]: false }))
                        }
                      }
                      // Open in Finder
                      try {
                        await vfsApi.openInFinder(m.id)
                      } catch (e) {
                        console.error('Open in Finder failed:', e)
                      }
                    }
                  })
                }
                items.push({ type: 'separator' as const })
                // Enable/disable toggle (not for local kind)
                if (m.kind !== 'local') {
                  items.push({
                    id: 'mount-toggle-enabled',
                    label: m.local_mount?.enabled ? '禁用本地挂载' : '启用本地挂载',
                    action: async () => {
                      const newEnabled = !m.local_mount?.enabled
                      const mountPath = m.local_mount?.mount_point || `~/mnt/${m.name}`
                      try {
                        await vfsApi.updateVfsMount(m.id, {
                          name: m.name,
                          kind: m.kind,
                          root: m.root,
                          connection_id: m.connection_id,
                          group: m.group,
                          local_mount: { enabled: newEnabled, mount_point: mountPath }
                        })
                        reload()
                      } catch (err) {
                        console.error('Toggle mount enabled failed:', err)
                      }
                    }
                  })
                }
                items.push({ type: 'separator' as const })
                items.push({
                  id: 'mount-delete',
                  label: '删除',
                  danger: true,
                  action: () => {
                    setConfirmState({
                      visible: true,
                      message: `确认删除存储源「${m.name}」？此操作不可恢复。`,
                      onConfirm: async () => {
                        setConfirmState(s => ({ ...s, visible: false }))
                        await deleteMount(m.id)
                      }
                    })
                  }
                })
                showContextMenu(e.clientX, e.clientY, items)
              }

              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  className={`flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer group rounded my-[1px] mx-1 ${isActive ? 'bg-[var(--vos-accent-primary)] text-white' : 'bg-transparent text-[var(--vos-text-primary)]'}`}
                  onClick={() => selectMount(m.id)}
                  onContextMenu={handleMountContextMenu}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') selectMount(m.id)
                  }}
                >
                  <KindIcon
                    size={13}
                    className="shrink-0"
                    style={{ color: isActive ? '#fff' : 'var(--vos-text-tertiary)' }}
                  />
                  <span className="flex-1 truncate">{m.name}</span>
                  {m.local_mount?.enabled && (
                    <span
                      className="flex-shrink-0 flex items-center gap-0.5"
                      title={
                        isLoading
                          ? '操作中…'
                          : fuseStatus?.error
                            ? `挂载失败: ${fuseStatus.error}`
                            : isFuseMounted
                              ? `已挂载到 ${fuseStatus?.mount_point ?? ''}`
                              : '未挂载'
                      }
                    >
                      <span
                        className="w-[6px] h-[6px] rounded-full shrink-0"
                        style={{
                          background: fuseStatus?.error
                            ? 'var(--vos-accent-danger, #ef4444)'
                            : isFuseMounted
                              ? 'var(--vos-accent-success, #22c55e)'
                              : isActive
                                ? 'rgba(255,255,255,0.3)'
                                : 'var(--vos-text-tertiary)'
                        }}
                      />
                      {isLoading ? (
                        <Spinner size={11} color={isActive ? '#fff' : 'var(--vos-text-tertiary)'} />
                      ) : isFuseMounted ? (
                        <Link size={11} style={{ color: isActive ? '#fff' : 'var(--vos-accent-success, #22c55e)' }} />
                      ) : (
                        <Unlink
                          size={11}
                          style={{ color: isActive ? 'rgba(255,255,255,0.5)' : 'var(--vos-text-tertiary)' }}
                        />
                      )}
                    </span>
                  )}
                </div>
              )
            }

            const renderGroup = (label: string, items: VfsMount[]) => {
              if (items.length === 0) return null
              return (
                <div key={label}>
                  <div className="px-3 pt-2 pb-0.5 text-[10px] font-medium tracking-wide uppercase text-[var(--vos-text-tertiary)]">
                    {label}
                  </div>
                  {items.map(renderMount)}
                </div>
              )
            }

            if (mounts.length === 0) {
              return (
                <div className="flex-1 flex items-center justify-center text-xs text-[var(--vos-text-tertiary)]">
                  无存储源
                </div>
              )
            }

            return (
              <>
                {renderGroup('本地存储', localMounts)}
                {renderGroup('网络存储', networkMounts)}
                {renderGroup('对象存储', objectMounts)}
              </>
            )
          })()}
        </AppSidebar>
      }
      overlay={
        <>
          {showForm && (
            <MountForm
              onClose={() => setShowForm(false)}
              onCreated={m => {
                setMounts(p => [...p, m])
                setShowForm(false)
                reload()
              }}
            />
          )}

          {editingMount && (
            <MountForm
              mountToEdit={editingMount}
              onClose={() => setEditingMount(null)}
              onUpdated={async m => {
                setMounts(p => p.map(x => (x.id === m.id ? m : x)))
                setEditingMount(null)
                // Auto-mount if local_mount was just enabled
                if (m.local_mount?.enabled && !localMountStatuses[m.id]?.mounted) {
                  try {
                    const res = await vfsApi.localMountVfs(m.id)
                    setLocalMountStatuses(s => ({ ...s, [m.id]: res.data }))
                  } catch (e) {
                    console.error('Auto-mount after edit failed:', e)
                  }
                }
                reload()
              }}
            />
          )}


          {showExplorerSettings && (
            <ExplorerSettingsSheet
              mounts={mounts.map(m => ({ id: m.id, name: m.name }))}
              showHidden={showHidden}
              onShowHiddenChange={next => {
                setShowHidden(next)
                showHiddenRef.current = next
                storage.setJSON('preferences', { showHidden: next })
              }}
              onClose={() => setShowExplorerSettings(false)}
            />
          )}
          {/* New folder overlay */}
          {newFolderState.visible && (
            <div className="vos-modal-overlay">
              <div className="vos-modal-panel w-[320px]">
                <div className="text-sm font-medium">新建文件夹</div>
                <input
                  autoFocus
                  className="vos-input"
                  placeholder="文件夹名称"
                  value={newFolderState.name}
                  onChange={e => setNewFolderState(prev => ({ ...prev, name: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleNewFolder()
                    if (e.key === 'Escape') setNewFolderState({ visible: false, colPath: '', name: '' })
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-ghost"
                    onClick={() => setNewFolderState({ visible: false, colPath: '', name: '' })}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-primary"
                    style={{ opacity: newFolderState.name.trim() ? 1 : 0.5 }}
                    disabled={!newFolderState.name.trim()}
                    onClick={handleNewFolder}
                  >
                    创建
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* New file overlay */}
          {newFileState.visible && (
            <div className="vos-modal-overlay">
              <div className="vos-modal-panel w-[320px]">
                <div className="text-sm font-medium">新建文件</div>
                <input
                  autoFocus
                  className="vos-input"
                  placeholder="文件名称（如 notes.txt）"
                  value={newFileState.name}
                  onChange={e => setNewFileState(prev => ({ ...prev, name: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleNewFile()
                    if (e.key === 'Escape') setNewFileState({ visible: false, dirPath: '', name: '' })
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-ghost"
                    onClick={() => setNewFileState({ visible: false, dirPath: '', name: '' })}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-primary"
                    style={{ opacity: newFileState.name.trim() ? 1 : 0.5 }}
                    disabled={!newFileState.name.trim()}
                    onClick={handleNewFile}
                  >
                    创建
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirm dialog */}
          <SharedConfirmDialog
            open={confirmState.visible}
            onClose={() => setConfirmState(s => ({ ...s, visible: false }))}
            onConfirm={confirmState.onConfirm}
            title="确认操作"
            danger
          >
            {confirmState.message}
          </SharedConfirmDialog>

          {/* Open-with dialog */}
          {openWithState.visible && openWithState.node && selectedMount && (
            <div
              className="vos-modal-overlay"
              onClick={() => setOpenWithState({ visible: false, node: null, apps: [], showAll: false })}
            >
              <div className="vos-modal-panel w-[300px]" onClick={e => e.stopPropagation()}>
                <div className="text-sm font-medium">打开方式</div>
                <div className="text-xs truncate text-[var(--vos-text-tertiary)]">{openWithState.node.name}</div>
                <div className="flex flex-col gap-1">
                  {(openWithState.showAll
                    ? [
                        ...openWithState.apps,
                        ...getAlwaysOpenWithApps().filter(a => !openWithState.apps.find(x => x.id === a.id))
                      ]
                    : openWithState.apps
                  ).map(app => (
                    <button
                      key={app.id}
                      type="button"
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer border-none text-left transition-colors bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-primary)]"
                      onClick={() => {
                        const n = openWithState.node!
                        const ext = getFileExt(n.name)
                        // Auto-register as default if none set
                        if (ext && !useFileDefaultsStore.getState().getDefault(ext)) {
                          useFileDefaultsStore.getState().setDefault(ext, app.id)
                        }
                        setOpenWithState({ visible: false, node: null, apps: [], showAll: false })
                        openWindow(app.id, { appState: { mountId: selectedMount, node: n } })
                      }}
                    >
                      <div className="w-7 h-7 shrink-0 rounded-[7px] overflow-hidden">{app.icon}</div>
                      <span className="text-xs font-medium">{app.name}</span>
                    </button>
                  ))}
                  {/* File viewer is always available */}
                  <button
                    type="button"
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded cursor-pointer border-none text-left transition-colors bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-primary)]"
                    onClick={() => {
                      const n = openWithState.node!
                      const ext = getFileExt(n.name)
                      if (ext && !useFileDefaultsStore.getState().getDefault(ext)) {
                        useFileDefaultsStore.getState().setDefault(ext, 'file-viewer')
                      }
                      setOpenWithState({ visible: false, node: null, apps: [], showAll: false })
                      handleOpenViewer(selectedMount, n)
                    }}
                  >
                    <div
                      className="vos-flex-center w-[28px] h-[28px] shrink-0 rounded-[7px]"
                      style={{
                        background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
                      }}
                    >
                      <FileIcon size={14} className="text-white" />
                    </div>
                    <span className="text-xs font-medium">文件查看器</span>
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  {!openWithState.showAll ? (
                    <button
                      type="button"
                      className="vos-btn vos-btn-sm vos-btn-ghost"
                      onClick={() => setOpenWithState(s => ({ ...s, showAll: true }))}
                    >
                      其它应用...
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-ghost"
                    onClick={() => setOpenWithState({ visible: false, node: null, apps: [], showAll: false })}
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Set default open-with dialog */}
          {defaultOpenState.visible && defaultOpenState.node && selectedMount && (
            <div className="vos-modal-overlay" onClick={() => setDefaultOpenState(s => ({ ...s, visible: false }))}>
              <div className="vos-modal-panel w-[360px]" onClick={e => e.stopPropagation()}>
                <div className="text-sm font-medium">设置默认打开方式</div>
                <div className="text-xs text-[var(--vos-text-tertiary)]">
                  为 <strong>.{defaultOpenState.ext}</strong> 文件选择默认应用
                </div>
                <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto">
                  {/* File viewer option */}
                  <button
                    type="button"
                    className="flex items-center gap-2 px-3 py-2 rounded text-xs cursor-pointer border-none text-left bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-primary)]"
                    onClick={() => {
                      const n = defaultOpenState.node!
                      const ext = defaultOpenState.ext
                      const also = defaultOpenState.alsoOpenFile
                      useFileDefaultsStore.getState().setDefault(ext, 'file-viewer')
                      setDefaultOpenState(s => ({ ...s, visible: false }))
                      if (also) handleOpenViewer(selectedMount, n)
                    }}
                  >
                    <span className="font-medium">文件查看器</span>
                    <span className="text-[var(--vos-text-tertiary)]">预览</span>
                  </button>
                  {defaultOpenState.apps.map(app => (
                    <button
                      key={app.id}
                      type="button"
                      className="flex items-center gap-2 px-3 py-2 rounded text-xs cursor-pointer border-none text-left bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-primary)]"
                      onClick={() => {
                        const n = defaultOpenState.node!
                        const ext = defaultOpenState.ext
                        const also = defaultOpenState.alsoOpenFile
                        useFileDefaultsStore.getState().setDefault(ext, app.id)
                        setDefaultOpenState(s => ({ ...s, visible: false }))
                        if (also) openWindow(app.id, { appState: { mountId: selectedMount, node: n } })
                      }}
                    >
                      <span className="font-medium">{app.name}</span>
                      <span className="text-[var(--vos-text-tertiary)]">
                        {app.associationType === 'preview' ? '预览' : '编辑'}
                      </span>
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-[var(--vos-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={defaultOpenState.alsoOpenFile}
                    onChange={e => setDefaultOpenState(s => ({ ...s, alsoOpenFile: e.target.checked }))}
                  />
                  同时打开该文件
                </label>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-ghost"
                    onClick={() => setDefaultOpenState(s => ({ ...s, visible: false }))}
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Compress dialog */}
          {compressState.visible && (
            <div className="vos-modal-overlay" onClick={() => setCompressState(s => ({ ...s, visible: false }))}>
              <div className="vos-modal-panel w-[380px]" onClick={e => e.stopPropagation()}>
                <div className="text-sm font-medium">压缩文件</div>
                <div className="text-xs text-[var(--vos-text-tertiary)]">压缩 {compressState.items.length} 个项目</div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--vos-text-secondary)]">文件名</label>
                    <input
                      className="vos-input text-xs"
                      value={compressState.archiveName}
                      onChange={e => setCompressState(s => ({ ...s, archiveName: e.target.value }))}
                      placeholder="archive"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--vos-text-secondary)]">格式</label>
                    <FormSelect
                      className="text-xs"
                      wrapperClassName="w-full"
                      value={compressState.format}
                      onChange={e => setCompressState(s => ({ ...s, format: e.target.value }))}
                    >
                      <option value="zip">ZIP</option>
                      <option value="tar.gz">TAR.GZ</option>
                      <option value="7z">7Z</option>
                    </FormSelect>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--vos-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={compressState.encrypt}
                      onChange={e => setCompressState(s => ({ ...s, encrypt: e.target.checked }))}
                    />
                    加密压缩
                  </label>
                  {compressState.encrypt && (
                    <div className="flex flex-col gap-2">
                      <input
                        type="password"
                        className="vos-input text-xs"
                        placeholder="输入密码"
                        value={compressState.password}
                        onChange={e => setCompressState(s => ({ ...s, password: e.target.value }))}
                      />
                      <input
                        type="password"
                        className="vos-input text-xs"
                        placeholder="确认密码"
                        value={compressState.confirmPassword}
                        onChange={e => setCompressState(s => ({ ...s, confirmPassword: e.target.value }))}
                      />
                      {compressState.password &&
                        compressState.confirmPassword &&
                        compressState.password !== compressState.confirmPassword && (
                          <div className="text-xs text-[var(--vos-accent-danger)]">密码不一致</div>
                        )}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-ghost"
                    onClick={() => setCompressState(s => ({ ...s, visible: false }))}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-primary"
                    disabled={
                      !compressState.archiveName.trim() ||
                      (compressState.encrypt &&
                        (!compressState.password || compressState.password !== compressState.confirmPassword))
                    }
                    onClick={async () => {
                      if (compressState.items.length === 0) return
                      const mId = compressState.items[0].mountId
                      const paths = compressState.items.map(i => i.node.path)
                      const parentDir = paths[0].substring(0, paths[0].lastIndexOf('/')) || '/'
                      const destPath = `${parentDir}/${compressState.archiveName}.${compressState.format}`
                      try {
                        await request('POST', `/api/vfs/mounts/${encodeURIComponent(mId)}/archive/compress`, {
                          paths,
                          dest_path: destPath,
                          format: compressState.format,
                          password: compressState.encrypt ? compressState.password : undefined
                        })
                        setCompressState(s => ({ ...s, visible: false }))
                        // Refresh the column that contains the items
                        refreshColumn(activeColumn)
                      } catch (err) {
                        console.error('Compress failed:', err)
                      }
                    }}
                  >
                    压缩
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hidden file input for upload */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files) handleUpload(e.target.files)
              e.target.value = ''
            }}
          />

          {/* Extract password dialog */}
          {extractPasswordState.visible && (
            <div className="vos-modal-overlay" onClick={() => setExtractPasswordState(s => ({ ...s, visible: false }))}>
              <div className="vos-modal-panel w-[340px]" onClick={e => e.stopPropagation()}>
                <div className="text-sm font-medium">解压需要密码</div>
                <div className="text-xs text-[var(--vos-text-tertiary)]">该压缩文件已加密，请输入密码后解压</div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[var(--vos-text-secondary)]">解压密码</label>
                  <input
                    type="password"
                    className="vos-input text-xs"
                    placeholder="输入密码"
                    autoFocus
                    value={extractPasswordState.password}
                    onChange={e => setExtractPasswordState(s => ({ ...s, password: e.target.value }))}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && extractPasswordState.password) {
                        const { mountId, archivePath, destDir, colIdx, password } = extractPasswordState
                        setExtractPasswordState(s => ({ ...s, visible: false }))
                        try {
                          await request('POST', `/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/extract`, {
                            archive_path: archivePath,
                            dest_dir: destDir,
                            password
                          })
                          refreshColumn(colIdx)
                        } catch (err) {
                          console.error('Extract failed:', err)
                        }
                      }
                      if (e.key === 'Escape') setExtractPasswordState(s => ({ ...s, visible: false }))
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-ghost"
                    onClick={() => setExtractPasswordState(s => ({ ...s, visible: false }))}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-primary"
                    disabled={!extractPasswordState.password}
                    onClick={async () => {
                      const { mountId, archivePath, destDir, colIdx, password } = extractPasswordState
                      setExtractPasswordState(s => ({ ...s, visible: false }))
                      try {
                        await request('POST', `/api/vfs/mounts/${encodeURIComponent(mountId)}/archive/extract`, {
                          archive_path: archivePath,
                          dest_dir: destDir,
                          password
                        })
                        refreshColumn(colIdx)
                      } catch (err) {
                        console.error('Extract failed:', err)
                      }
                    }}
                  >
                    解压
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Properties dialog */}
          {propertiesState.visible && propertiesState.node && (
            <div className="vos-modal-overlay" onClick={() => setPropertiesState({ visible: false, node: null })}>
              <div className="vos-modal-panel w-[380px]" onClick={e => e.stopPropagation()}>
                <div className="text-sm font-medium mb-3">属性</div>
                <div className="flex flex-col gap-2 text-xs">
                  {/* Icon + Name */}
                  <div
                    className="flex items-center gap-3 pb-2"
                    style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
                  >
                    {propertiesState.node.is_dir ? (
                      <FolderOpen size={28} className="text-[var(--vos-accent-primary)] shrink-0" />
                    ) : (
                      (() => {
                        const iconInfo = getFileIconByName(propertiesState.node.name)
                        const IconComp = iconInfo.icon
                        return <IconComp size={28} className="shrink-0" style={{ color: iconInfo.color }} />
                      })()
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate text-[var(--vos-text-primary)]">
                        {propertiesState.node.name}
                      </div>
                      <div style={{ color: 'var(--vos-text-tertiary)' }}>
                        {propertiesState.node.is_dir
                          ? '目录'
                          : getFileExt(propertiesState.node.name).toUpperCase() || '文件'}
                      </div>
                    </div>
                  </div>

                  {/* Basic info */}
                  <div
                    className="flex flex-col gap-1.5 py-1"
                    style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
                  >
                    <div className="flex justify-between">
                      <span className="text-[var(--vos-text-tertiary)]">名称</span>
                      <span className="text-right max-w-[60%] truncate text-[var(--vos-text-primary)]">
                        {propertiesState.node.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--vos-text-tertiary)' }}>路径</span>
                      <span
                        className="text-right max-w-[60%] truncate"
                        title={propertiesState.node.path}
                        style={{ color: 'var(--vos-text-primary)' }}
                      >
                        {propertiesState.node.path}
                      </span>
                    </div>
                    {!propertiesState.node.is_dir && propertiesState.node.size != null && (
                      <div className="flex justify-between">
                        <span className="text-[var(--vos-text-tertiary)]">大小</span>
                        <span className="text-[var(--vos-text-primary)]">{fmtSize(propertiesState.node.size)}</span>
                      </div>
                    )}
                    {propertiesState.node.modified && (
                      <div className="flex justify-between">
                        <span className="text-[var(--vos-text-tertiary)]">修改时间</span>
                        <span className="text-[var(--vos-text-primary)]">
                          {new Date(propertiesState.node.modified).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Permissions */}
                  {propertiesState.node.permissions && (
                    <div
                      className="flex flex-col gap-1.5 py-1"
                      style={{ borderBottom: '0.5px solid var(--vos-border-subtle)' }}
                    >
                      <div className="flex justify-between">
                        <span style={{ color: 'var(--vos-text-tertiary)' }}>权限</span>
                        <span
                          style={{ color: 'var(--vos-text-primary)', fontFamily: 'var(--vos-font-mono, monospace)' }}
                        >
                          {propertiesState.node.permissions}
                        </span>
                      </div>
                      {/* Parse rwx permissions for display */}
                      {(() => {
                        const perm = propertiesState.node.permissions!
                        // Unix permission string like "rwxr-xr-x" or "-rw-r--r--"
                        const permStr = perm.length >= 9 ? perm.slice(-9) : perm
                        const ownerPerm = permStr.slice(0, 3)
                        const groupPerm = permStr.slice(3, 6)
                        const otherPerm = permStr.slice(6, 9)
                        const describe = (p: string) => {
                          const parts: string[] = []
                          if (p[0] === 'r') parts.push('读取')
                          if (p[1] === 'w') parts.push('写入')
                          if (p[2] === 'x' || p[2] === 's' || p[2] === 't') parts.push('执行')
                          return parts.length > 0 ? parts.join('、') : '无'
                        }
                        return (
                          <>
                            <div className="flex justify-between">
                              <span className="text-[var(--vos-text-tertiary)]">所有者权限</span>
                              <span className="text-[var(--vos-text-primary)]">{describe(ownerPerm)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--vos-text-tertiary)]">组权限</span>
                              <span className="text-[var(--vos-text-primary)]">{describe(groupPerm)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--vos-text-tertiary)]">其他权限</span>
                              <span className="text-[var(--vos-text-primary)]">{describe(otherPerm)}</span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}

                  {/* Default open-with app (files only) */}
                  {!propertiesState.node.is_dir &&
                    (() => {
                      const fileExt = getFileExt(propertiesState.node.name)
                      const defaultAppId = useFileDefaultsStore.getState().getDefault(fileExt)
                      const defaultApp = defaultAppId ? getApp(defaultAppId) : null
                      const associatedApps = getAppsForFile(fileExt)
                      return (
                        <div className="flex flex-col gap-1.5 py-1">
                          <div className="flex justify-between items-center">
                            <span style={{ color: 'var(--vos-text-tertiary)' }}>打开方式</span>
                            <span style={{ color: 'var(--vos-text-primary)' }}>
                              {defaultApp?.name ?? (associatedApps.length > 0 ? associatedApps[0].name : '文件查看器')}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                </div>
                <div className="flex justify-end mt-3">
                  <button
                    type="button"
                    className="vos-btn vos-btn-sm vos-btn-primary"
                    onClick={() => setPropertiesState({ visible: false, node: null })}
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      }
    >
      <div ref={containerRef} className="flex flex-col h-full outline-none" tabIndex={-1}>
        {selectedMount ? (
          <>
            {/* Path bar / Menubar */}
            <div className="flex items-center gap-2 h-8 px-3 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]">
              {/* Back button */}
              <button
                type="button"
                className="vos-btn-reset text-[var(--vos-text-primary)] disabled:text-[var(--vos-text-tertiary)]"
                disabled={columns.length <= 1}
                onClick={() => {
                  if (columns.length > 1) {
                    setColumns(prev => {
                      const updated = prev.slice(0, -1)
                      if (updated.length > 0) {
                        updated[updated.length - 1] = { ...updated[updated.length - 1], selected: undefined }
                      }
                      return updated
                    })
                    setPreview(null)
                    setSelectedNode(null)
                    setActiveColumn(Math.max(0, activeColumn - 1))
                  }
                }}
              >
                <ChevronLeft size={14} />
              </button>
              {/* Breadcrumb path */}
              <div className="flex-1 flex items-center gap-0.5 overflow-hidden text-xs text-[var(--vos-text-secondary)]">
                {(() => {
                  const segments = currentPath.split('/').filter(Boolean)
                  return (
                    <>
                      <button
                        type="button"
                        className="border-none bg-transparent cursor-pointer p-0 text-xs hover:underline text-[var(--vos-text-secondary)]"
                        onClick={() => {
                          if (columns.length > 1) {
                            setColumns(prev => {
                              const newCols = prev.slice(0, 1)
                              newCols[0] = { ...newCols[0], selected: undefined }
                              return newCols
                            })
                            setActiveColumn(0)
                            setPreview(null)
                            setSelectedNode(null)
                          }
                        }}
                      >
                        /
                      </button>
                      {segments.map((seg, i) => {
                        const segPath = `/${segments.slice(0, i + 1).join('/')}`
                        const isLast = i === segments.length - 1
                        const targetColIdx = i + 1
                        return (
                          <span key={segPath} className="flex items-center gap-0.5">
                            <ChevronRight size={10} className="opacity-40 shrink-0" />
                            <button
                              type="button"
                              className={`border-none bg-transparent cursor-pointer p-0 text-xs truncate max-w-[120px] ${isLast ? 'text-[var(--vos-text-primary)] font-medium' : 'text-[var(--vos-text-secondary)] font-normal'}`}
                              onClick={() => {
                                if (isLast) return
                                if (targetColIdx < columns.length) {
                                  setColumns(prev => {
                                    const sliced = prev.slice(0, targetColIdx + 1)
                                    sliced[sliced.length - 1] = { ...sliced[sliced.length - 1], selected: undefined }
                                    return sliced
                                  })
                                  setActiveColumn(targetColIdx)
                                  setPreview(null)
                                  setSelectedNode(null)
                                }
                              }}
                            >
                              {seg}
                            </button>
                          </span>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
              <button
                type="button"
                className="vos-btn-reset text-[var(--vos-accent-primary)]"
                onClick={async () => {
                  if (!selectedMount || columns.length === 0) return
                  const lastCol = columns[columns.length - 1]
                  const entries = await loadColumn(selectedMount, lastCol.path)
                  setColumns(prev => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { ...updated[updated.length - 1], entries }
                    return updated
                  })
                }}
              >
                <RefreshCw size={12} />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Column view */}
              <ColumnView
                mountId={selectedMount}
                columns={columns}
                multiSelect={multiSelect}
                activeColumn={activeColumn}
                renamingPath={renamingPath}
                renameValue={renameValue}
                scrollTrigger={scrollTrigger}
                onMoveFile={handleMoveFile}
                onExternalFileDrop={(files, targetPath) => handleUpload(files, targetPath)}
                onItemClick={handleItemClick}
                onItemDoubleClick={handleItemDoubleClick}
                onItemContextMenu={handleItemContextMenu}
                onColumnContextMenu={handleColumnContextMenu}
                onRenameChange={setRenameValue}
                onRenameConfirm={handleRenameConfirm}
                onRenameCancel={() => setRenamingPath(null)}
                onRubberBandSelect={handleRubberBandSelect}
              />

              {/* Info / preview panel */}
              <FileInfoPanel
                mountId={selectedMount}
                preview={preview}
                node={selectedNode}
                onClose={() => {
                  setSelectedNode(null)
                  setPreview(null)
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FolderOpen size={48} className="text-[var(--vos-text-tertiary)] mx-auto mb-3" />
              <div className="text-sm text-[var(--vos-text-secondary)]">资源管理器</div>
              <div className="text-xs mt-1 text-[var(--vos-text-tertiary)]">选择左侧存储源浏览文件</div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
