import type { K8sResource } from '../../types'

interface Props {
  resource: K8sResource
}

export function SummaryTab({ resource }: Props) {
  const entries = [
    { key: 'Name', value: resource.name },
    { key: 'Namespace', value: resource.namespace ?? '—' },
    { key: 'Kind', value: resource.kind },
    { key: 'Status', value: resource.status ?? '—' },
    { key: 'Age', value: resource.age ?? '—' },
  ]

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-2">
        {entries.map(({ key, value }) => (
          <div key={key} className="flex">
            <span className="w-28 text-[var(--vos-text-tertiary)] shrink-0">{key}</span>
            <span className="flex-1 text-[var(--vos-text-primary)] break-all">{value}</span>
          </div>
        ))}
      </div>

      {resource.labels && Object.keys(resource.labels).length > 0 && (
        <div>
          <div className="text-[var(--vos-text-tertiary)] mb-1">Labels</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(resource.labels).map(([k, v]) => (
              <span
                key={k}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
              >
                {k}={v}
              </span>
            ))}
          </div>
        </div>
      )}

      {resource.annotations && Object.keys(resource.annotations).length > 0 && (
        <div>
          <div className="text-[var(--vos-text-tertiary)] mb-1">Annotations</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(resource.annotations).map(([k, v]) => (
              <span
                key={k}
                className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--vos-bg-item-hover)] text-[var(--vos-text-secondary)]"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
