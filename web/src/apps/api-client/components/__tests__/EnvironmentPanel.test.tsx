import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EnvironmentPanel from '../EnvironmentPanel'
import { useApiClientStore } from '../../store'
import type { Environment } from '../../types'

const TEST_ENVIRONMENTS: Environment[] = [
  {
    id: 'env-1',
    name: 'Primary',
    variables: [
      {
        key: 'TOKEN',
        initialValue: 'token-a',
        currentValue: 'token-a',
        enabled: true,
        secret: true
      }
    ],
    isGlobal: false,
    sortOrder: 0,
    createdAt: '2026-04-22T00:00:00Z',
    updatedAt: '2026-04-22T00:00:00Z'
  },
  {
    id: 'env-2',
    name: 'Secondary',
    variables: [
      {
        key: 'TOKEN',
        initialValue: 'token-b',
        currentValue: 'token-b',
        enabled: true,
        secret: false
      }
    ],
    isGlobal: false,
    sortOrder: 1,
    createdAt: '2026-04-22T00:00:00Z',
    updatedAt: '2026-04-22T00:00:00Z'
  }
]

describe('EnvironmentPanel', () => {
  beforeEach(() => {
    useApiClientStore.setState(state => ({
      ...state,
      environments: TEST_ENVIRONMENTS,
      activeEnvironmentId: 'env-1'
    }))
  })

  it('resets variable row state when switching environments and exposes active state', () => {
    render(
      <EnvironmentPanel composerOpen={false} onComposerClose={vi.fn()} onComposerOpen={vi.fn()} />
    )

    const variableInput = screen.getByPlaceholderText('Variable value') as HTMLInputElement
    expect(variableInput.value).toBe('token-a')

    fireEvent.change(variableInput, { target: { value: 'edited-local' } })
    expect(variableInput.value).toBe('edited-local')

    const secondaryButton = screen.getByRole('button', { name: /Secondary/i })
    fireEvent.click(secondaryButton)

    expect(secondaryButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByPlaceholderText('Variable value')).toHaveValue('token-b')
  })
})