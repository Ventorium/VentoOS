import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button, IconButton } from '../Button'
import { FormField } from '../FormField'

describe('Button', () => {
  it('renders primary button with icon and default type', () => {
    render(<Button variant="primary" leadingIcon={<span data-testid="leading">+</span>}>Create</Button>)

    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('vos-btn-primary')
    expect(button).toHaveAttribute('type', 'button')
    expect(screen.getByTestId('leading')).toBeInTheDocument()
  })

  it('calls onClick for icon button', () => {
    const onClick = vi.fn()
    render(<IconButton aria-label="Refresh" variant="toolbar" icon={<span>R</span>} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onClick).toHaveBeenCalled()
  })
})

describe('FormField', () => {
  it('renders label, required marker, hint and error', () => {
    render(
      <FormField label="Host" htmlFor="host" required hint="输入服务器地址" error="必填项">
        <input id="host" />
      </FormField>
    )

    const input = screen.getByRole('textbox')
    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
    expect(screen.getByText('输入服务器地址')).toBeInTheDocument()
    expect(screen.getByText('必填项')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-describedby')
  })
})