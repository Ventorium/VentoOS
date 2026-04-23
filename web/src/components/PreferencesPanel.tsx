import type { ReactNode } from 'react'
import {
  AppPreferencesSheet,
  PreferenceGroup as AppPreferenceGroup,
  PreferenceInput,
  PreferenceRow,
  PreferenceSection,
  PreferenceToggle
} from './AppPreferences'
import { FormSelect } from '@/components/ui'

interface PreferenceItem {
  id: string
  label: string
  description?: string
  type: 'switch' | 'select' | 'number' | 'text'
  value: unknown
  onChange: (value: unknown) => void
  options?: { label: string; value: string | number }[]
  min?: number
  max?: number
  step?: number
  suffix?: string
}

interface PreferenceGroup {
  id: string
  title: string
  items: PreferenceItem[]
}

interface PreferencesPanelProps {
  title: string
  groups: PreferenceGroup[]
  onClose: () => void
}

function resolveAppName(title: string) {
  const normalized = title.replace(/\s*偏好设置$/, '').trim()
  return normalized || title
}

function renderControl(item: PreferenceItem): ReactNode {
  if (item.type === 'switch') {
    return <PreferenceToggle checked={Boolean(item.value)} onChange={value => item.onChange(value)} label={item.label} />
  }

  if (item.type === 'select') {
    return (
      <FormSelect
        value={String(item.value ?? '')}
        onChange={e => {
          const opt = item.options?.find(option => String(option.value) === e.target.value)
          item.onChange(opt?.value ?? e.target.value)
        }}
        variant="toolbar"
        className="text-xs"
        wrapperClassName="min-w-[132px]"
      >
        {item.options?.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </FormSelect>
    )
  }

  if (item.type === 'number') {
    return (
      <div className="flex items-center gap-2">
        <PreferenceInput
          type="number"
          value={Number(item.value ?? 0)}
          min={item.min}
          max={item.max}
          step={item.step ?? 1}
          onChange={e => item.onChange(Number(e.target.value))}
          className="w-20 px-[8px] py-[5px] text-xs text-right bg-[var(--vos-bg-input)]"
        />
        {item.suffix && <span className="text-[11px] text-[var(--vos-text-tertiary)]">{item.suffix}</span>}
      </div>
    )
  }

  return (
    <PreferenceInput
      type="text"
      value={String(item.value ?? '')}
      onChange={e => item.onChange(e.target.value)}
      className="w-[160px] px-[8px] py-[5px] text-xs bg-[var(--vos-bg-input)]"
    />
  )
}

function LegacyGroupContent({ group }: { group: PreferenceGroup }) {
  return (
    <PreferenceSection title={group.title}>
      <AppPreferenceGroup>
        <div className="flex flex-col gap-2">
          {group.items.map(item => (
            <PreferenceRow key={item.id} label={item.label} description={item.description}>
              {renderControl(item)}
            </PreferenceRow>
          ))}
        </div>
      </AppPreferenceGroup>
    </PreferenceSection>
  )
}

export type { PreferenceGroup, PreferenceItem, PreferencesPanelProps }

export default function PreferencesPanel({ title, groups, onClose }: PreferencesPanelProps) {
  if (groups.length === 0) return null

  return (
    <AppPreferencesSheet
      open={true}
      onClose={onClose}
      appName={resolveAppName(title)}
      defaultCategory={groups[0]?.id}
      categories={groups.map(group => ({
        id: group.id,
        label: group.title,
        content: <LegacyGroupContent group={group} />
      }))}
    />
  )
}
