/**
 * Tests for the Checkbox component
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { Checkbox } from '../Checkbox'

describe('Checkbox', () => {
  test('renders unchecked by default', () => {
    render(<Checkbox checked={false} onChange={() => {}} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
  })

  test('renders checked state', () => {
    render(<Checkbox checked={true} onChange={() => {}} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox.getAttribute('aria-checked')).toBe('true')
    // Check icon should be visible
    const svg = checkbox.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  test('renders indeterminate state', () => {
    render(<Checkbox checked={false} indeterminate={true} onChange={() => {}} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox.getAttribute('aria-checked')).toBe('mixed')
    // Dash icon should be visible
    const svg = checkbox.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  test('calls onChange when clicked', () => {
    const handleChange = vi.fn()
    render(<Checkbox checked={false} onChange={handleChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(handleChange).toHaveBeenCalledWith(true)
  })

  test('calls onChange with toggled value when checked', () => {
    const handleChange = vi.fn()
    render(<Checkbox checked={true} onChange={handleChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(handleChange).toHaveBeenCalledWith(false)
  })

  test('does not call onChange when disabled', () => {
    const handleChange = vi.fn()
    render(<Checkbox checked={false} onChange={handleChange} disabled />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(handleChange).not.toHaveBeenCalled()
  })

  test('calls onChange on Space keydown', () => {
    const handleChange = vi.fn()
    render(<Checkbox checked={false} onChange={handleChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.keyDown(checkbox, { key: ' ' })
    expect(handleChange).toHaveBeenCalledWith(true)
  })

  test('calls onChange on Enter keydown', () => {
    const handleChange = vi.fn()
    render(<Checkbox checked={false} onChange={handleChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.keyDown(checkbox, { key: 'Enter' })
    expect(handleChange).toHaveBeenCalledWith(true)
  })

  test('renders label when provided', () => {
    render(<Checkbox checked={false} onChange={() => {}} label="Enable option" />)
    expect(screen.getByText('Enable option')).toBeTruthy()
  })

  test('does not render label when not provided', () => {
    const { container } = render(<Checkbox checked={false} onChange={() => {}} />)
    const spans = container.querySelectorAll('span')
    expect(spans.length).toBe(0)
  })

  test('disabled checkbox has not-allowed cursor', () => {
    const { container } = render(<Checkbox checked={false} onChange={() => {}} disabled />)
    const label = container.querySelector('label')
    expect(label?.style.cursor).toBe('not-allowed')
  })

  test('disabled checkbox has reduced opacity', () => {
    const { container } = render(<Checkbox checked={false} onChange={() => {}} disabled />)
    const label = container.querySelector('label')
    expect(label?.style.opacity).toBe('0.5')
  })

  test('applies custom style', () => {
    const { container } = render(
      <Checkbox checked={false} onChange={() => {}} style={{ marginTop: '8px' }} />
    )
    const label = container.querySelector('label')
    expect(label?.style.marginTop).toBe('8px')
  })

  test('applies custom className', () => {
    const { container } = render(
      <Checkbox checked={false} onChange={() => {}} className="my-checkbox" />
    )
    const label = container.querySelector('label')
    expect(label?.classList.contains('my-checkbox')).toBe(true)
  })

  test('does not call onChange on non-Space/Enter keys', () => {
    const handleChange = vi.fn()
    render(<Checkbox checked={false} onChange={handleChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.keyDown(checkbox, { key: 'Tab' })
    expect(handleChange).not.toHaveBeenCalled()
  })
})
