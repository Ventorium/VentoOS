import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { DropdownSelect } from '../DropdownSelect'

describe('DropdownSelect', () => {
  test('renders selected option in trigger', () => {
    render(
      <DropdownSelect
        value="post"
        options={[
          { value: 'get', label: 'GET' },
          { value: 'post', label: 'POST' }
        ]}
        onChange={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: /post/i })).toBeTruthy()
  })

  test('opens menu and selects option', () => {
    const handleChange = vi.fn()

    render(
      <DropdownSelect
        value="get"
        options={[
          { value: 'get', label: 'GET' },
          { value: 'post', label: 'POST' }
        ]}
        onChange={handleChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /get/i }))
    fireEvent.click(screen.getByRole('option', { name: /post/i }))

    expect(handleChange).toHaveBeenCalledWith('post')
  })

  test('supports keyboard navigation and selection', () => {
    const handleChange = vi.fn()

    render(
      <DropdownSelect
        value="get"
        options={[
          { value: 'get', label: 'GET' },
          { value: 'post', label: 'POST' },
          { value: 'delete', label: 'DELETE' }
        ]}
        onChange={handleChange}
      />
    )

    const trigger = screen.getByRole('button', { name: /get/i })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' })

    expect(handleChange).toHaveBeenCalledWith('post')
  })
})