import { useState } from 'react'
import { K8sExecTerminal } from './K8sExecTerminal'

interface Props {
  clusterId: string
  namespace: string
  podName: string
  container?: string
}

export function ShellPanel({ clusterId, namespace, podName, container }: Props) {
  const [activeContainer, setActiveContainer] = useState(container || '')
  const [shell, setShell] = useState('/bin/sh')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 h-8 px-3 text-[11px] border-b-[0.5px] border-b-[var(--vos-border-subtle)] bg-[var(--vos-bg-surface)] flex-shrink-0">
        <span className="text-[var(--vos-text-tertiary)]">Container:</span>
        <input
          type="text"
          className="bg-transparent border-[0.5px] border-[var(--vos-border-subtle)] rounded px-1 py-0.5 text-[var(--vos-text-primary)] w-[120px]"
          value={activeContainer}
          onChange={e => setActiveContainer(e.target.value)}
          placeholder="default"
        />
        <span className="text-[var(--vos-text-tertiary)]">Shell:</span>
        <input
          type="text"
          className="bg-transparent border-[0.5px] border-[var(--vos-border-subtle)] rounded px-1 py-0.5 text-[var(--vos-text-primary)] w-[120px]"
          value={shell}
          onChange={e => setShell(e.target.value)}
          list="shell-options"
        />
        <datalist id="shell-options">
          <option value="/bin/sh" />
          <option value="/bin/bash" />
          <option value="/bin/zsh" />
        </datalist>
      </div>
      <K8sExecTerminal
        clusterId={clusterId}
        namespace={namespace}
        podName={podName}
        container={activeContainer || undefined}
        shell={shell}
      />
    </div>
  )
}
