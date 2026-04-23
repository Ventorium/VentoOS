import { Globe } from 'lucide-react'
import { DropdownSelect } from '@/components/ui'
import { useApiClientStore } from '../store'

const NO_ENVIRONMENT = '__none__'

export default function EnvironmentSelector() {
  const environments = useApiClientStore(s => s.environments)
  const activeEnvironmentId = useApiClientStore(s => s.activeEnvironmentId)
  const setActiveEnvironment = useApiClientStore(s => s.setActiveEnvironment)

  const options = [
    { value: NO_ENVIRONMENT, label: 'No Environment' },
    ...environments.map(env => ({
      value: env.id,
      label: env.name,
      meta: env.isGlobal ? (
        <span className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
          Global
        </span>
      ) : undefined
    }))
  ]

  return (
    <DropdownSelect
      className="min-w-[148px] max-w-[180px]"
      align="right"
      value={activeEnvironmentId ?? NO_ENVIRONMENT}
      options={options}
      triggerIcon={<Globe size={12} />}
      placeholder="No Environment"
      onChange={value => setActiveEnvironment(value === NO_ENVIRONMENT ? null : value)}
      renderTriggerContent={option => <span className="truncate">{option?.label ?? 'No Environment'}</span>}
      renderOption={(option, selected) => (
        <>
          <span
            className="flex items-center gap-2 min-w-0 flex-1"
            style={{ color: selected ? 'var(--vos-accent-primary)' : 'var(--vos-text-secondary)' }}
          >
            <span className="truncate">{option.label}</span>
          </span>
          {option.meta}
        </>
      )}
    />
  )
}
