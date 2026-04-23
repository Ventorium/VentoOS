import { Globe, Plus, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, FormInput } from '@/components/ui'
import { useApiClientStore } from '../store'
import type { EnvironmentVariable } from '../types'

function VariableRow({
  variable,
  onSave
}: {
  variable: EnvironmentVariable
  onSave: (value: string, secret: boolean) => Promise<void>
}) {
  const [value, setValue] = useState(variable.currentValue)
  const [secret, setSecret] = useState(Boolean(variable.secret))

  useEffect(() => {
    setValue(variable.currentValue)
    setSecret(Boolean(variable.secret))
  }, [variable.currentValue, variable.secret])

  return (
    <div
      className="grid gap-2 px-3 py-2"
      style={{
        gridTemplateColumns: 'minmax(0, 92px) minmax(0, 1fr) auto',
        borderBottom: '1px solid var(--vos-border-subtle)'
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold" style={{ color: 'var(--vos-text-primary)' }}>
          {variable.key}
        </div>
        <div className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
          {secret ? 'Secret' : 'Plain text'}
        </div>
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <FormInput
          type={secret ? 'password' : 'text'}
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder="Variable value"
        />
        <Checkbox checked={secret} onChange={setSecret} label="Secret" />
      </div>

      <Button variant="toolbar" size="xs" className="self-start" leadingIcon={<Save size={11} />} onClick={() => onSave(value, secret)}>
        Save
      </Button>
    </div>
  )
}

export default function EnvironmentPanel({
  composerOpen,
  onComposerClose,
  onComposerOpen
}: {
  composerOpen: boolean
  onComposerClose: () => void
  onComposerOpen: () => void
}) {
  const environments = useApiClientStore(s => s.environments)
  const activeEnvironmentId = useApiClientStore(s => s.activeEnvironmentId)
  const setActiveEnvironment = useApiClientStore(s => s.setActiveEnvironment)
  const createEnvironment = useApiClientStore(s => s.createEnvironment)
  const saveEnvironmentVariable = useApiClientStore(s => s.saveEnvironmentVariable)

  const [newEnvironmentName, setNewEnvironmentName] = useState('')
  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState('')
  const [draftSecret, setDraftSecret] = useState(false)

  const activeEnvironment = useMemo(
    () => environments.find(environment => environment.id === activeEnvironmentId) ?? null,
    [activeEnvironmentId, environments]
  )

  const canCreateEnvironment = newEnvironmentName.trim().length > 0
  const canSaveDraft = activeEnvironment && draftKey.trim() && draftValue.trim()

  return (
    <div className="flex flex-col h-full">
      {composerOpen && (
        <div className="p-3 flex flex-col gap-2" style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--vos-text-tertiary)' }}>
            New Environment
          </div>
          <FormInput
            value={newEnvironmentName}
            placeholder="Environment name"
            onChange={event => setNewEnvironmentName(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="toolbar-primary"
              size="xs"
              disabled={!canCreateEnvironment}
              onClick={async () => {
                const created = await createEnvironment({ name: newEnvironmentName.trim() })
                if (!created) {
                  return
                }
                setNewEnvironmentName('')
                onComposerClose()
              }}
            >
              Create
            </Button>
            <Button
              variant="toolbar"
              size="xs"
              onClick={() => {
                setNewEnvironmentName('')
                onComposerClose()
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="p-2 flex flex-col gap-1" style={{ borderBottom: '1px solid var(--vos-border-subtle)' }}>
        {environments.length === 0 && !composerOpen ? (
          <Button
            variant="toolbar"
            size="sm"
            fullWidth
            leadingIcon={<Plus size={14} />}
            onClick={() => {
              setNewEnvironmentName('')
              onComposerOpen()
            }}
          >
            Create your first environment
          </Button>
        ) : null}

        {environments.map(environment => {
          const isActive = environment.id === activeEnvironmentId
          return (
            <button
              key={environment.id}
              type="button"
              className="flex items-center gap-2 px-2.5 py-2 rounded text-left"
              aria-pressed={isActive}
              style={{
                background: isActive ? 'var(--vos-bg-tertiary)' : 'transparent',
                color: isActive ? 'var(--vos-text-primary)' : 'var(--vos-text-secondary)'
              }}
              onClick={() => setActiveEnvironment(environment.id)}
            >
              <Globe size={13} style={{ color: 'var(--vos-text-tertiary)' }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{environment.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--vos-text-tertiary)' }}>
                  {environment.variables.length} vars{environment.isGlobal ? ' · Global' : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {activeEnvironment ? (
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--vos-text-tertiary)' }}>
            {activeEnvironment.name} Variables
          </div>

          {activeEnvironment.variables.length === 0 ? (
            <div className="px-3 py-5 text-xs text-center" style={{ color: 'var(--vos-text-tertiary)' }}>
              No variables yet. Add one below or save a response value into this environment.
            </div>
          ) : (
            activeEnvironment.variables.map(variable => (
              <VariableRow
                key={`${activeEnvironment.id}:${variable.key}`}
                variable={variable}
                onSave={async (value, secret) => {
                  await saveEnvironmentVariable({
                    environmentId: activeEnvironment.id,
                    key: variable.key,
                    value,
                    secret
                  })
                }}
              />
            ))
          )}

          <div className="p-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--vos-border-subtle)' }}>
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--vos-text-tertiary)' }}>
              Add Variable
            </div>
            <FormInput value={draftKey} placeholder="Key e.g. TOKEN" onChange={event => setDraftKey(event.target.value)} />
            <FormInput
              type={draftSecret ? 'password' : 'text'}
              value={draftValue}
              placeholder="Value"
              onChange={event => setDraftValue(event.target.value)}
            />
            <Checkbox checked={draftSecret} onChange={setDraftSecret} label="Secret" />
            <Button
              variant="toolbar-primary"
              size="sm"
              className="self-start"
              leadingIcon={<Plus size={12} />}
              disabled={!canSaveDraft}
              onClick={async () => {
                if (!activeEnvironment || !draftKey.trim() || !draftValue.trim()) {
                  return
                }
                const saved = await saveEnvironmentVariable({
                  environmentId: activeEnvironment.id,
                  key: draftKey.trim(),
                  value: draftValue,
                  secret: draftSecret
                })
                if (!saved) {
                  return
                }
                setDraftKey('')
                setDraftValue('')
                setDraftSecret(false)
              }}
            >
              Add variable
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-4 text-center text-xs" style={{ color: 'var(--vos-text-tertiary)' }}>
          Select an environment to inspect and add variables.
        </div>
      )}
    </div>
  )
}