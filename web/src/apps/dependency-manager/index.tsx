/**
 * Dependency Manager — checks and installs system-level dependencies
 */
import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AppComponentProps } from '@/kernel'
import { type Dependency, depsApi } from './api'

type InstallState = 'idle' | 'installing' | 'success' | 'error'

export default function DependencyManager(_props: AppComponentProps) {
  const [deps, setDeps] = useState<Dependency[]>([])
  const [loading, setLoading] = useState(true)
  const [installStates, setInstallStates] = useState<Record<string, InstallState>>({})
  const [installOutputs, setInstallOutputs] = useState<Record<string, string>>({})

  const loadDeps = useCallback(async () => {
    setLoading(true)
    try {
      const res = await depsApi.list()
      if (res.ok) setDeps(res.data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDeps()
  }, [loadDeps])

  const handleInstall = useCallback(async (id: string) => {
    setInstallStates(prev => ({ ...prev, [id]: 'installing' }))
    setInstallOutputs(prev => ({ ...prev, [id]: '' }))
    try {
      const res = await depsApi.install(id)
      if (res.ok) {
        setInstallStates(prev => ({ ...prev, [id]: res.data.success ? 'success' : 'error' }))
        setInstallOutputs(prev => ({ ...prev, [id]: res.data.output }))
        // Update the dep in list
        setDeps(prev => prev.map(d => (d.id === id ? res.data.dependency : d)))
      } else {
        setInstallStates(prev => ({ ...prev, [id]: 'error' }))
        setInstallOutputs(prev => ({ ...prev, [id]: res.error ?? '安装失败' }))
      }
    } catch (e) {
      setInstallStates(prev => ({ ...prev, [id]: 'error' }))
      setInstallOutputs(prev => ({
        ...prev,
        [id]: e instanceof Error ? e.message : '安装失败'
      }))
    }
  }, [])

  const allInstalled = deps.length === 0 || deps.every(d => d.installed)
  const hasUninstalled = deps.length > 0 && deps.some(d => !d.installed)

  return (
    <div className="flex flex-col h-full bg-[var(--vos-bg-window)]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-[var(--vos-accent-primary)]" />
          <span className="text-sm font-medium text-[var(--vos-text-primary)]">
            系统依赖管理
          </span>
        </div>
        <button
          type="button"
          onClick={loadDeps}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-[var(--vos-bg-input)] border-[0.5px] border-solid border-[var(--vos-border-default)] text-[var(--vos-text-secondary)] cursor-pointer disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          刷新检测
        </button>
      </div>

      {/* Status summary */}
      <div
        className="px-5 py-3 flex items-center gap-2 border-b-[0.5px] border-b-solid border-b-[var(--vos-border-subtle)]"
        style={{
          background: hasUninstalled
            ? 'color-mix(in srgb, var(--vos-accent-warning) 8%, transparent)'
            : 'color-mix(in srgb, var(--vos-accent-success) 8%, transparent)'
        }}
      >
        {hasUninstalled ? (
          <>
            <AlertTriangle size={16} className="text-[var(--vos-accent-warning)]" />
            <span className="text-xs text-[var(--vos-accent-warning)]">
              部分依赖未安装，某些功能可能不可用
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 size={16} className="text-[var(--vos-accent-success)]" />
            <span className="text-xs text-[var(--vos-accent-success)]">
              所有依赖已安装
            </span>
          </>
        )}
      </div>

      {/* Dependency list */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {loading && deps.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-[var(--vos-text-tertiary)]" />
          </div>
        ) : deps.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2
              size={28}
              className="text-[var(--vos-accent-success)] opacity-60 mx-auto mb-2"
            />
            <p className="text-xs text-[var(--vos-text-tertiary)]">
              当前平台无需额外依赖
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {deps.map(dep => (
              <DepCard
                key={dep.id}
                dep={dep}
                installState={installStates[dep.id] ?? 'idle'}
                installOutput={installOutputs[dep.id]}
                onInstall={() => handleInstall(dep.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DepCard({
  dep,
  installState,
  installOutput,
  onInstall
}: {
  dep: Dependency
  installState: InstallState
  installOutput?: string
  onInstall: () => void
}) {
  const [showOutput, setShowOutput] = useState(false)

  return (
    <div className="rounded-lg p-4 bg-[var(--vos-bg-surface)] border-[0.5px] border-solid border-[var(--vos-border-subtle)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[var(--vos-text-primary)]">
              {dep.name}
            </span>
            {dep.installed ? (
              <span
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--vos-accent-success)_15%,transparent)] text-[var(--vos-accent-success)]"
              >
                <CheckCircle2 size={10} /> 已安装
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--vos-accent-warning)_15%,transparent)] text-[var(--vos-accent-warning)]"
              >
                <AlertTriangle size={10} /> 未安装
              </span>
            )}
          </div>
          <p className="text-xs mb-2 text-[var(--vos-text-secondary)]">
            {dep.description}
          </p>
          {dep.install_command && (
            <code
              className="text-[10px] px-2 py-0.5 rounded block bg-[var(--vos-bg-input)] text-[var(--vos-text-tertiary)] font-mono"
            >
              {dep.install_command}
            </code>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {dep.homepage && (
            <a
              href={dep.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-7 h-7 rounded-md bg-[var(--vos-bg-input)] border-[0.5px] border-solid border-[var(--vos-border-default)] text-[var(--vos-text-tertiary)]"
              title="访问主页"
            >
              <ExternalLink size={12} />
            </a>
          )}
          {!dep.installed && (
            <button
              type="button"
              onClick={onInstall}
              disabled={installState === 'installing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--vos-accent-primary)] text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            >
              {installState === 'installing' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {installState === 'installing' ? '安装中...' : '安装'}
            </button>
          )}
        </div>
      </div>

      {/* Install output */}
      {installOutput && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowOutput(!showOutput)}
            className="text-[10px] underline text-[var(--vos-text-tertiary)]"
          >
            {showOutput ? '隐藏输出' : '查看输出'}
          </button>
          {showOutput && (
            <pre
              className="mt-1 p-2 rounded text-[10px] max-h-32 overflow-auto bg-[var(--vos-bg-input)] text-[var(--vos-text-secondary)] font-mono whitespace-pre-wrap break-all"
            >
              {installOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
