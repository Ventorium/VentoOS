import { ChevronDown } from 'lucide-react'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

type InputSize = 'md' | 'sm'
type SelectVariant = 'default' | 'toolbar' | 'minimal'

const sizeClass: Record<InputSize, string> = {
  md: '',
  sm: 'vos-input-sm'
}

const selectVariantClass: Record<SelectVariant, string> = {
  default: '',
  toolbar: 'vos-select-toolbar',
  minimal: 'vos-select-minimal'
}

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize
}

export function FormInput({ inputSize = 'sm', className, ...props }: FormInputProps) {
  return <input className={`vos-input ${sizeClass[inputSize]} ${className ?? ''}`} {...props} />
}

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: InputSize
  variant?: SelectVariant
  wrapperClassName?: string
}

export function FormSelect({
  inputSize = 'sm',
  variant = 'default',
  wrapperClassName,
  className,
  children,
  ...props
}: FormSelectProps) {
  return (
    <div className={`vos-select-wrap ${wrapperClassName ?? ''}`} data-variant={variant}>
      <select className={`vos-input vos-select ${sizeClass[inputSize]} ${selectVariantClass[variant]} ${className ?? ''}`} {...props}>
        {children}
      </select>
      <ChevronDown size={14} className="vos-select-arrow" />
    </div>
  )
}

export interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  inputSize?: InputSize
}

export function FormTextarea({ inputSize = 'sm', className, ...props }: FormTextareaProps) {
  return <textarea className={`vos-input ${sizeClass[inputSize]} ${className ?? ''}`} {...props} />
}
