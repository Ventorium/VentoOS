import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SummaryTab } from '../components/detail-tabs/SummaryTab'

describe('SummaryTab', () => {
  it('renders resource properties', () => {
    const resource = {
      name: 'nginx-pod',
      namespace: 'default',
      kind: 'pod' as const,
      status: 'Running',
      age: '2d',
      labels: { app: 'nginx', env: 'prod' }
    }
    render(<SummaryTab resource={resource} />)
    expect(screen.getByText('nginx-pod')).toBeTruthy()
    expect(screen.getByText('default')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('2d')).toBeTruthy()
    expect(screen.getByText('app=nginx')).toBeTruthy()
    expect(screen.getByText('env=prod')).toBeTruthy()
  })

  it('renders dash for missing fields', () => {
    const resource = {
      name: 'minimal',
      kind: 'configmap' as const
    }
    render(<SummaryTab resource={resource} />)
    const dashes = screen.getAllTextBy ? [] : screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })
})
