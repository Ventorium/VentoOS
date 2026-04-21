import type { K8sResource, K8sResourceKind, ResourceColumn } from '../../../types'

function getRaw(resource: K8sResource): Record<string, unknown> | undefined {
  return resource.raw as Record<string, unknown> | undefined
}

function getPointer(resource: K8sResource, path: string): unknown {
  const raw = getRaw(resource)
  if (!raw) return undefined
  const parts = path.split('/').filter(Boolean)
  let curr: unknown = raw
  for (const part of parts) {
    if (curr && typeof curr === 'object') {
      curr = (curr as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return curr
}

const ageCol: ResourceColumn = {
  key: 'age',
  header: 'Age',
  width: 80,
  render: r => <span className="text-[var(--vos-text-tertiary)]">{r.age ?? '—'}</span>
}

const statusBadge = (status?: string) => {
  const s = status ?? '—'
  const isGood = ['Running', 'Active', 'Available', 'Bound', 'Ready'].includes(s)
  const isWarn = ['Pending', 'Progressing', 'Terminating'].includes(s)
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px]"
      style={{
        background: isGood
          ? 'rgba(var(--vos-accent-success-rgb, 34 197 94), 0.15)'
          : isWarn
            ? 'rgba(var(--vos-accent-warning-rgb, 204 169 0), 0.15)'
            : 'rgba(var(--vos-accent-danger-rgb, 239 68 68), 0.15)',
        color: isGood ? 'var(--vos-accent-success)' : isWarn ? 'var(--vos-accent-warning)' : 'var(--vos-accent-danger)'
      }}
    >
      {s}
    </span>
  )
}

export function getColumnsForKind(kind: K8sResourceKind): ResourceColumn[] {
  const nameCol: ResourceColumn = {
    key: 'name',
    header: 'Name',
    render: r => (
      <span className="font-mono text-[var(--vos-accent-primary)] truncate" title={r.name}>
        {r.name}
      </span>
    )
  }

  const nsCol: ResourceColumn = {
    key: 'namespace',
    header: 'Namespace',
    width: 100,
    render: r => (
      <span className="text-[var(--vos-text-secondary)] truncate" title={r.namespace}>
        {r.namespace ?? '—'}
      </span>
    )
  }

  const statusCol: ResourceColumn = {
    key: 'status',
    header: 'Status',
    width: 90,
    render: r => statusBadge(r.status)
  }

  switch (kind) {
    case 'pod':
      return [
        nameCol,
        nsCol,
        statusCol,
        {
          key: 'restarts',
          header: 'Restarts',
          width: 70,
          render: r => {
            const containerStatuses = (getPointer(r, '/status/containerStatuses') as unknown[] | undefined) ?? []
            const restarts = containerStatuses.reduce((sum, c: unknown) => {
              return sum + ((c as Record<string, number>)?.restartCount ?? 0)
            }, 0)
            return <span className="text-[var(--vos-text-secondary)]">{restarts}</span>
          }
        },
        {
          key: 'node',
          header: 'Node',
          width: 120,
          render: r => (
            <span
              className="text-[var(--vos-text-secondary)] truncate"
              title={String(getPointer(r, '/spec/nodeName') ?? '')}
            >
              {String(getPointer(r, '/spec/nodeName') ?? '—')}
            </span>
          )
        },
        ageCol
      ]

    case 'deployment':
      return [
        nameCol,
        nsCol,
        {
          key: 'replicas',
          header: 'Replicas',
          width: 80,
          render: r => {
            const ready = Number(getPointer(r, '/status/readyReplicas') ?? 0)
            const total = Number(getPointer(r, '/spec/replicas') ?? 0)
            return <span className="text-[var(--vos-text-secondary)]">{`${ready}/${total}`}</span>
          }
        },
        {
          key: 'up-to-date',
          header: 'Up-to-date',
          width: 80,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">
              {Number(getPointer(r, '/status/updatedReplicas') ?? 0)}
            </span>
          )
        },
        {
          key: 'available',
          header: 'Available',
          width: 80,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">
              {Number(getPointer(r, '/status/availableReplicas') ?? 0)}
            </span>
          )
        },
        ageCol
      ]

    case 'statefulset':
      return [
        nameCol,
        nsCol,
        {
          key: 'replicas',
          header: 'Replicas',
          width: 80,
          render: r => {
            const ready = Number(getPointer(r, '/status/readyReplicas') ?? 0)
            const total = Number(getPointer(r, '/spec/replicas') ?? 0)
            return <span className="text-[var(--vos-text-secondary)]">{`${ready}/${total}`}</span>
          }
        },
        ageCol
      ]

    case 'daemonset':
      return [
        nameCol,
        nsCol,
        {
          key: 'desired',
          header: 'Desired',
          width: 70,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">
              {Number(getPointer(r, '/status/desiredNumberScheduled') ?? 0)}
            </span>
          )
        },
        {
          key: 'current',
          header: 'Current',
          width: 70,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">
              {Number(getPointer(r, '/status/currentNumberScheduled') ?? 0)}
            </span>
          )
        },
        {
          key: 'ready',
          header: 'Ready',
          width: 70,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">
              {Number(getPointer(r, '/status/numberReady') ?? 0)}
            </span>
          )
        },
        ageCol
      ]

    case 'job':
      return [
        nameCol,
        nsCol,
        {
          key: 'completions',
          header: 'Completions',
          width: 90,
          render: r => {
            const succeeded = Number(getPointer(r, '/status/succeeded') ?? 0)
            const total = Number(getPointer(r, '/spec/completions') ?? 1)
            return <span className="text-[var(--vos-text-secondary)]">{`${succeeded}/${total}`}</span>
          }
        },
        {
          key: 'duration',
          header: 'Duration',
          width: 90,
          render: r => {
            const duration = String(getPointer(r, '/status/completionTime') ?? '')
            return <span className="text-[var(--vos-text-tertiary)]">{duration ? 'Completed' : 'Running'}</span>
          }
        },
        ageCol
      ]

    case 'cronjob':
      return [
        nameCol,
        nsCol,
        {
          key: 'schedule',
          header: 'Schedule',
          width: 120,
          render: r => (
            <span
              className="text-[var(--vos-text-secondary)] truncate"
              title={String(getPointer(r, '/spec/schedule') ?? '')}
            >
              {String(getPointer(r, '/spec/schedule') ?? '—')}
            </span>
          )
        },
        {
          key: 'suspend',
          header: 'Suspend',
          width: 70,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">
              {getPointer(r, '/spec/suspend') === true ? 'True' : 'False'}
            </span>
          )
        },
        ageCol
      ]

    case 'service':
      return [
        nameCol,
        nsCol,
        {
          key: 'type',
          header: 'Type',
          width: 100,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">
              {String(getPointer(r, '/spec/type') ?? 'ClusterIP')}
            </span>
          )
        },
        {
          key: 'cluster-ip',
          header: 'Cluster IP',
          width: 110,
          render: r => (
            <span className="font-mono text-[var(--vos-text-secondary)]">
              {String(getPointer(r, '/spec/clusterIP') ?? '—')}
            </span>
          )
        },
        {
          key: 'ports',
          header: 'Ports',
          width: 120,
          render: r => {
            const ports = (getPointer(r, '/spec/ports') as unknown[] | undefined) ?? []
            const text = ports
              .map(
                (p: unknown) =>
                  `${(p as Record<string, number>)?.port ?? ''}/${String((p as Record<string, string>)?.protocol ?? 'TCP')}`
              )
              .join(', ')
            return (
              <span className="text-[var(--vos-text-secondary)] truncate" title={text}>
                {text || '—'}
              </span>
            )
          }
        },
        ageCol
      ]

    case 'ingress':
      return [
        nameCol,
        nsCol,
        {
          key: 'hosts',
          header: 'Hosts',
          width: 140,
          render: r => {
            const rules = (getPointer(r, '/spec/rules') as unknown[] | undefined) ?? []
            const hosts = rules.map((rule: unknown) => (rule as Record<string, string>)?.host ?? '').join(', ')
            return (
              <span className="text-[var(--vos-text-secondary)] truncate" title={hosts}>
                {hosts || '—'}
              </span>
            )
          }
        },
        ageCol
      ]

    case 'configmap':
      return [
        nameCol,
        nsCol,
        {
          key: 'keys',
          header: 'Keys',
          width: 60,
          render: r => {
            const data = Object.keys((getPointer(r, '/data') as Record<string, unknown> | undefined) ?? {})
            return <span className="text-[var(--vos-text-secondary)]">{data.length}</span>
          }
        },
        ageCol
      ]

    case 'secret':
      return [
        nameCol,
        nsCol,
        {
          key: 'type',
          header: 'Type',
          width: 120,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">{String(getPointer(r, '/type') ?? 'Opaque')}</span>
          )
        },
        {
          key: 'keys',
          header: 'Keys',
          width: 60,
          render: r => {
            const data = Object.keys((getPointer(r, '/data') as Record<string, unknown> | undefined) ?? {})
            return <span className="text-[var(--vos-text-secondary)]">{data.length}</span>
          }
        },
        ageCol
      ]

    case 'persistentvolumeclaim':
      return [
        nameCol,
        nsCol,
        statusCol,
        {
          key: 'volume',
          header: 'Volume',
          width: 120,
          render: r => (
            <span
              className="font-mono text-[var(--vos-text-secondary)] truncate"
              title={String(getPointer(r, '/spec/volumeName') ?? '')}
            >
              {String(getPointer(r, '/spec/volumeName') ?? '—')}
            </span>
          )
        },
        {
          key: 'capacity',
          header: 'Capacity',
          width: 90,
          render: r => {
            const cap = (getPointer(r, '/status/capacity/storage') as string | undefined) ?? '—'
            return <span className="text-[var(--vos-text-secondary)]">{cap}</span>
          }
        },
        {
          key: 'storage-class',
          header: 'StorageClass',
          width: 110,
          render: r => (
            <span
              className="text-[var(--vos-text-secondary)] truncate"
              title={String(getPointer(r, '/spec/storageClassName') ?? '')}
            >
              {String(getPointer(r, '/spec/storageClassName') ?? '—')}
            </span>
          )
        },
        ageCol
      ]

    case 'persistentvolume':
      return [
        nameCol,
        {
          key: 'capacity',
          header: 'Capacity',
          width: 90,
          render: r => {
            const cap = (getPointer(r, '/spec/capacity/storage') as string | undefined) ?? '—'
            return <span className="text-[var(--vos-text-secondary)]">{cap}</span>
          }
        },
        {
          key: 'access-modes',
          header: 'Access Modes',
          width: 110,
          render: r => {
            const modes = (getPointer(r, '/spec/accessModes') as string[] | undefined) ?? []
            return (
              <span className="text-[var(--vos-text-secondary)] truncate" title={modes.join(', ')}>
                {modes.join(', ') || '—'}
              </span>
            )
          }
        },
        statusCol,
        {
          key: 'storage-class',
          header: 'StorageClass',
          width: 110,
          render: r => (
            <span
              className="text-[var(--vos-text-secondary)] truncate"
              title={String(getPointer(r, '/spec/storageClassName') ?? '')}
            >
              {String(getPointer(r, '/spec/storageClassName') ?? '—')}
            </span>
          )
        },
        ageCol
      ]

    case 'storageclass':
      return [
        nameCol,
        {
          key: 'provisioner',
          header: 'Provisioner',
          width: 160,
          render: r => (
            <span
              className="text-[var(--vos-text-secondary)] truncate"
              title={String(getPointer(r, '/provisioner') ?? '')}
            >
              {String(getPointer(r, '/provisioner') ?? '—')}
            </span>
          )
        },
        {
          key: 'reclaim-policy',
          header: 'Reclaim Policy',
          width: 110,
          render: r => (
            <span className="text-[var(--vos-text-secondary)]">{String(getPointer(r, '/reclaimPolicy') ?? '—')}</span>
          )
        },
        ageCol
      ]

    case 'node':
      return [
        nameCol,
        {
          key: 'roles',
          header: 'Roles',
          width: 120,
          render: r => {
            const labels = (getPointer(r, '/metadata/labels') as Record<string, string> | undefined) ?? {}
            const roles = Object.keys(labels)
              .filter(k => k.startsWith('node-role.kubernetes.io/'))
              .map(k => k.replace('node-role.kubernetes.io/', ''))
            return (
              <span className="text-[var(--vos-text-secondary)] truncate" title={roles.join(', ')}>
                {roles.join(', ') || '<none>'}
              </span>
            )
          }
        },
        {
          key: 'version',
          header: 'Version',
          width: 120,
          render: r => (
            <span
              className="text-[var(--vos-text-secondary)] truncate"
              title={String(getPointer(r, '/status/nodeInfo/kubeletVersion') ?? '')}
            >
              {String(getPointer(r, '/status/nodeInfo/kubeletVersion') ?? '—')}
            </span>
          )
        },
        statusCol,
        ageCol
      ]

    case 'namespace':
      return [nameCol, statusCol, ageCol]

    case 'replicaset':
      return [
        nameCol,
        nsCol,
        {
          key: 'replicas',
          header: 'Replicas',
          width: 80,
          render: r => {
            const ready = Number(getPointer(r, '/status/readyReplicas') ?? 0)
            const total = Number(getPointer(r, '/spec/replicas') ?? 0)
            return <span className="text-[var(--vos-text-secondary)]">{`${ready}/${total}`}</span>
          }
        },
        ageCol
      ]

    default:
      return [nameCol, nsCol, statusCol, ageCol]
  }
}
