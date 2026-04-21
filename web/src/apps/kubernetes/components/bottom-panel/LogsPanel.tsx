import { useState } from 'react'
import { K8sLogStream } from './K8sLogStream'

interface Props {
  clusterId: string
  namespace: string
  podName: string
  container?: string
}

export function LogsPanel({ clusterId, namespace, podName, container }: Props) {
  const [activeContainer, setActiveContainer] = useState(container || '')
  const [follow, setFollow] = useState(true)
  const [tailLines, setTailLines] = useState(200)

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
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />
          <span className="text-[var(--vos-text-secondary)]">Follow</span>
        </label>
        <select
          className="bg-[var(--vos-bg-input)] border-[0.5px] border-[var(--vos-border-subtle)] rounded px-1 py-0.5 text-[var(--vos-text-primary)]"
          value={tailLines}
          onChange={e => setTailLines(Number(e.target.value))}
        >
          <option value={100}>100 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
          <option value={1000}>1000 lines</option>
        </select>
      </div>
      <K8sLogStream
        clusterId={clusterId}
        namespace={namespace}
        podName={podName}
        container={activeContainer || undefined}
        follow={follow}
        tailLines={tailLines}
      />
    </div>
  )
}
