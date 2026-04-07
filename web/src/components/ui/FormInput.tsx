import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

type InputSize = 'md' | 'sm'

const sizeClass: Record<InputSize, string> = {
  md: '',
  sm: 'vos-input-sm'
}

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize
}

export function FormInput({ inputSize = 'sm', className, ...props }: FormInputProps) {
  return <input className={`vos-input ${sizeClass[inputSize]} ${className ?? ''}`} {...props} />
}

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: InputSize
}

export function FormSelect({ inputSize = 'sm', className, children, ...props }: FormSelectProps) {
  return (
    <select className={`vos-input ${sizeClass[inputSize]} ${className ?? ''}`} {...props}>
      {children}
    </select>
  )
}

export interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  inputSize?: InputSize
}

export function FormTextarea({ inputSize = 'sm', className, ...props }: FormTextareaProps) {
  return <textarea className={`vos-input ${sizeClass[inputSize]} ${className ?? ''}`} {...props} />
}
