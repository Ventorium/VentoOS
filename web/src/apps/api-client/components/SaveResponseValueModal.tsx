import { useEffect, useState } from 'react'
import { Checkbox, FormInput, FormSelect, Modal } from '@/components/ui'
import { useApiClientStore } from '../store'

const CREATE_NEW_ENVIRONMENT = '__create_new__'

export default function SaveResponseValueModal({
  open,
  initialValue,
  initialKey = 'TOKEN',
  onClose
}: {
  open: boolean
  initialValue: string
  initialKey?: string
  onClose: () => void
}) {
  const environments = useApiClientStore(s => s.environments)
  const activeEnvironmentId = useApiClientStore(s => s.activeEnvironmentId)
  const createEnvironment = useApiClientStore(s => s.createEnvironment)
  const saveEnvironmentVariable = useApiClientStore(s => s.saveEnvironmentVariable)

  const [environmentId, setEnvironmentId] = useState<string>(activeEnvironmentId ?? CREATE_NEW_ENVIRONMENT)
  const [environmentName, setEnvironmentName] = useState('')
  const [variableKey, setVariableKey] = useState(initialKey)
  const [secret, setSecret] = useState(true)

  useEffect(() => {
    if (!open) {
      return
    }

    setEnvironmentId(activeEnvironmentId ?? (environments[0]?.id ?? CREATE_NEW_ENVIRONMENT))
    setEnvironmentName('')
    setVariableKey(initialKey)
    setSecret(initialKey.toLowerCase().includes('token'))
  }, [activeEnvironmentId, environments, initialKey, open])

  const needsEnvironmentName = environments.length === 0 || environmentId === CREATE_NEW_ENVIRONMENT
  const canSave = variableKey.trim().length > 0 && initialValue.trim().length > 0 && (!needsEnvironmentName || environmentName.trim())

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save Response Value to Environment"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded text-xs"
            style={{ background: 'var(--vos-bg-tertiary)', color: 'var(--vos-text-secondary)' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded text-xs"
            style={{
              background: 'var(--vos-accent-primary)',
              color: 'white',
              opacity: canSave ? 1 : 0.5
            }}
            disabled={!canSave}
            onClick={async () => {
              let targetEnvironmentId = environmentId

              if (needsEnvironmentName) {
                const created = await createEnvironment({ name: environmentName.trim() })
                if (!created) {
                  return
                }
                targetEnvironmentId = created.id
              }

              const saved = await saveEnvironmentVariable({
                environmentId: targetEnvironmentId,
                key: variableKey.trim(),
                value: initialValue,
                secret
              })
              if (!saved) {
                return
              }

              onClose()
            }}
          >
            Save to environment
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-xs">
        <label className="flex flex-col gap-1.5">
          <span style={{ color: 'var(--vos-text-tertiary)' }}>Value</span>
          <FormInput value={initialValue} readOnly />
        </label>

        {environments.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Target environment</span>
            <FormSelect value={environmentId} onChange={event => setEnvironmentId(event.target.value)}>
              {environments.map(environment => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
              <option value={CREATE_NEW_ENVIRONMENT}>Create new environment...</option>
            </FormSelect>
          </label>
        ) : null}

        {needsEnvironmentName ? (
          <label className="flex flex-col gap-1.5">
            <span style={{ color: 'var(--vos-text-tertiary)' }}>Environment name</span>
            <FormInput
              value={environmentName}
              placeholder="e.g. Development"
              onChange={event => setEnvironmentName(event.target.value)}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span style={{ color: 'var(--vos-text-tertiary)' }}>Variable key</span>
          <FormInput value={variableKey} onChange={event => setVariableKey(event.target.value)} placeholder="TOKEN" />
        </label>

        <Checkbox checked={secret} onChange={setSecret} label="Treat as secret" />
      </div>
    </Modal>
  )
}