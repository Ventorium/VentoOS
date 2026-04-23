import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'toolbar' | 'toolbar-primary' | 'toolbar-danger'
type ButtonSize = 'md' | 'sm' | 'xs'
type IconButtonVariant = 'default' | 'ghost' | 'toolbar' | 'danger'
type IconButtonSize = 'md' | 'sm'

const buttonVariantClass: Record<ButtonVariant, string> = {
  default: '',
  primary: 'vos-btn-primary',
  danger: 'vos-btn-danger',
  ghost: 'vos-btn-ghost',
  toolbar: 'vos-btn-toolbar',
  'toolbar-primary': 'vos-btn-toolbar-primary',
  'toolbar-danger': 'vos-btn-toolbar-danger'
}

const buttonSizeClass: Record<ButtonSize, string> = {
  md: '',
  sm: 'vos-btn-sm',
  xs: 'vos-btn-xs'
}

const iconButtonVariantClass: Record<IconButtonVariant, string> = {
  default: '',
  ghost: 'vos-icon-btn-ghost',
  toolbar: 'vos-icon-btn-toolbar',
  danger: 'vos-icon-btn-danger'
}

const iconButtonSizeClass: Record<IconButtonSize, string> = {
  md: '',
  sm: 'vos-icon-btn-sm'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  className,
  type,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`vos-btn ${buttonVariantClass[variant]} ${buttonSizeClass[size]} ${fullWidth ? 'w-full justify-center' : ''} ${className ?? ''}`.trim()}
      {...props}
    >
      {leadingIcon ? <span aria-hidden="true" className="vos-btn-icon">{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span aria-hidden="true" className="vos-btn-icon">{trailingIcon}</span> : null}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant
  size?: IconButtonSize
  icon: ReactNode
  'aria-label': string
}

export function IconButton({
  variant = 'default',
  size = 'md',
  icon,
  className,
  type,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`vos-icon-btn ${iconButtonVariantClass[variant]} ${iconButtonSizeClass[size]} ${className ?? ''}`.trim()}
      {...props}
    >
      <span aria-hidden="true" className="vos-btn-icon">{icon}</span>
    </button>
  )
}