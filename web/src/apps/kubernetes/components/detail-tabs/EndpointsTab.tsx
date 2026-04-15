import type { K8sResource } from '../../types'

interface Props {
  resource: K8sResource
}

export function EndpointsTab({ resource }: Props) {
  const raw = resource.raw as Record<string, unknown> | undefined
  const spec = (raw?.spec as Record<string, unknown> | undefined) ?? {}
  const status = (raw?.status as Record<string, unknown> | undefined) ?? {}

  const ports = (spec.ports as Array<Record<string, unknown>> | undefined) ?? []
  const externalIPs = (spec.externalIPs as string[] | undefined) ?? []
  const loadBalancer = (status.loadBalancer as Record<string, unknown> | undefined) ?? {}
  const ingress = (loadBalancer.ingress as Array<Record<string, string>> | undefined) ?? []
  const selector = (spec.selector as Record<string, string> | undefined) ?? {}

  const entries = [
    { key: 'Cluster IP', value: (spec.clusterIP as string) ?? '—' },
    { key: 'Type', value: (spec.type as string) ?? 'ClusterIP' },
    {
      key: 'External IPs',
      value: externalIPs.length > 0 ? externalIPs.join(', ') : ingress.map(i => i.ip || i.hostname).join(', ') || '—',
    },
    { key: 'Session Affinity', value: (spec.sessionAffinity as string) ?? 'None' },
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

      {ports.length > 0 && (
        <div>
          <div className="text-[var(--vos-text-tertiary)] mb-1">Ports</div>
          <div className="space-y-1">
            {ports.map((p, i) => (
              <div
                key={i}
                className="flex p-1.5 rounded border-[0.5px] border-[var(--vos-border-subtle)] bg-[var(--vos-bg-item-hover)]"
              >
                <span className="w-20 text-[var(--vos-text-secondary)]">{String(p.name || '—')}</span>
                <span className="w-16 font-mono text-[var(--vos-text-primary)]">{String(p.port)}</span>
                <span className="w-16 text-[var(--vos-text-secondary)]">{String(p.protocol || 'TCP')}</span>
                <span className="flex-1 font-mono text-[var(--vos-text-secondary)]">target: {String(p.targetPort || p.port)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(selector).length > 0 && (
        <div>
          <div className="text-[var(--vos-text-tertiary)] mb-1">Selector</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(selector).map(([k, v]) => (
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
    </div>
  )
}
