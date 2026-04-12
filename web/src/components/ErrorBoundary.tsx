/**
 * ErrorBoundary — Catches render errors in app windows.
 *
 * Displays a friendly error state with the option to open the Log Center.
 */

import { AlertTriangle, RotateCcw, ScrollText } from 'lucide-react'
import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'
import { createLogger } from '@/infra/logger'
import { openWindow } from '@/kernel'

const logger = createLogger('ErrorBoundary')

interface Props {
  /** App ID for display purposes */
  appId?: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(`App "${this.props.appId ?? 'unknown'}" crashed: ${error.message}`, {
      stack: error.stack,
      componentStack: info.componentStack
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleOpenLogCenter = () => {
    openWindow('log-center')
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div
        className="flex flex-col items-center justify-center flex-1 gap-3 p-8 text-[var(--vos-text-secondary)] text-center"
      >
        <AlertTriangle size={36} color="var(--vos-accent-warning)" />
        <div className="text-sm font-semibold text-[var(--vos-text-primary)]">应用发生错误</div>
        <div className="text-xs max-w-[360px] leading-[1.5]">{this.state.error?.message ?? '未知错误'}</div>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1 px-[14px] py-1.5 text-xs border border-solid border-[var(--vos-border-primary)] rounded-[6px] bg-[var(--vos-bg-secondary)] text-[var(--vos-text-primary)] cursor-pointer"
          >
            <RotateCcw size={12} />
            重试
          </button>
          <button
            type="button"
            onClick={this.handleOpenLogCenter}
            className="inline-flex items-center gap-1 px-[14px] py-1.5 text-xs border border-solid border-[var(--vos-border-primary)] rounded-[6px] bg-[var(--vos-bg-secondary)] text-[var(--vos-text-primary)] cursor-pointer"
          >
            <ScrollText size={12} />
            查看日志
          </button>
        </div>
      </div>
    )
  }
}
