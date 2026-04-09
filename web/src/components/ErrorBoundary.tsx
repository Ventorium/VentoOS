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
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: 12,
          padding: 32,
          color: 'var(--vos-text-secondary)',
          textAlign: 'center'
        }}
      >
        <AlertTriangle size={36} color="var(--vos-accent-warning)" />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--vos-text-primary)' }}>应用发生错误</div>
        <div style={{ fontSize: 12, maxWidth: 360, lineHeight: 1.5 }}>{this.state.error?.message ?? '未知错误'}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 14px',
              fontSize: 12,
              border: '1px solid var(--vos-border-primary)',
              borderRadius: 6,
              background: 'var(--vos-bg-secondary)',
              color: 'var(--vos-text-primary)',
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={12} />
            重试
          </button>
          <button
            type="button"
            onClick={this.handleOpenLogCenter}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 14px',
              fontSize: 12,
              border: '1px solid var(--vos-border-primary)',
              borderRadius: 6,
              background: 'var(--vos-bg-secondary)',
              color: 'var(--vos-text-primary)',
              cursor: 'pointer'
            }}
          >
            <ScrollText size={12} />
            查看日志
          </button>
        </div>
      </div>
    )
  }
}
