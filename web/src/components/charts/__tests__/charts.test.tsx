import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { BarChart, GaugeChart, LineChart } from '../index'
import type { BarItem, ChartSeries } from '../types'

describe('LineChart', () => {
  test('renders with data series', () => {
    const series: ChartSeries[] = [
      { id: 'cpu', label: 'CPU', color: '#4fc3f7', data: [10, 20, 30, 40, 50] },
    ]
    const { container } = render(<LineChart data={series} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  test('renders with empty data', () => {
    const { container } = render(<LineChart data={[]} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  test('renders with multiple series', () => {
    const series: ChartSeries[] = [
      { id: 'cpu', label: 'CPU', color: '#4fc3f7', data: [10, 20, 30] },
      { id: 'mem', label: 'Memory', color: '#81c784', data: [40, 50, 60] },
    ]
    const { container } = render(<LineChart data={series} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  test('respects maxPoints', () => {
    const series: ChartSeries[] = [
      { id: 'cpu', label: 'CPU', color: '#4fc3f7', data: Array.from({ length: 100 }, (_, i) => i) },
    ]
    const { container } = render(<LineChart data={series} maxPoints={30} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('GaugeChart', () => {
  test('renders with value', () => {
    const { container } = render(<GaugeChart value={65} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  test('renders with custom label', () => {
    render(<GaugeChart value={42} label="CPU" />)
    expect(screen.getByText('CPU')).toBeTruthy()
  })

  test('renders with custom format', () => {
    render(<GaugeChart value={42} formatValue={v => `${v}%`} />)
    expect(screen.getByText('42%')).toBeTruthy()
  })

  test('clamps value to max', () => {
    const { container } = render(<GaugeChart value={150} max={100} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('BarChart', () => {
  test('renders with items', () => {
    const items: BarItem[] = [
      { label: '/dev/sda1', value: 50, max: 100 },
      { label: '/dev/sdb1', value: 80, max: 200 },
    ]
    render(<BarChart items={items} />)
    expect(screen.getByText('/dev/sda1')).toBeTruthy()
    expect(screen.getByText('/dev/sdb1')).toBeTruthy()
  })

  test('renders with empty items', () => {
    const { container } = render(<BarChart items={[]} />)
    expect(container).toBeTruthy()
  })

  test('renders with custom format', () => {
    const items: BarItem[] = [
      { label: 'Disk', value: 50, max: 100 },
    ]
    render(<BarChart items={items} formatValue={v => `${v} GB`} />)
    expect(screen.getByText('Disk')).toBeTruthy()
  })
})
