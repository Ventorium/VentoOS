import { Children, cloneElement, isValidElement, useId } from 'react'
import type { HTMLAttributes, ReactElement, ReactNode } from 'react'

export interface FormRowProps extends HTMLAttributes<HTMLDivElement> {}

export function FormRow({ className, ...props }: FormRowProps) {
  return <div className={`vos-form-row ${className ?? ''}`.trim()} {...props} />
}

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  labelClassName?: string
  contentClassName?: string
}

export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  labelClassName,
  contentClassName,
  className,
  children,
  ...props
}: FormFieldProps) {
  const fieldKey = useId()
  const hintId = hint ? `${fieldKey}-hint` : undefined
  const errorId = error ? `${fieldKey}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const canDescribeChild = describedBy && Children.count(children) === 1 && isValidElement(children)

  const content = canDescribeChild
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': [children.props['aria-describedby'], describedBy].filter(Boolean).join(' ')
      })
    : children

  return (
    <FormRow className={className} {...props}>
      {label ? (
        <label htmlFor={htmlFor} className={`vos-form-label ${labelClassName ?? ''}`.trim()}>
          {label}
          {required ? <span className="vos-form-required"> *</span> : null}
        </label>
      ) : null}
      <div className={`vos-form-field-content ${contentClassName ?? ''}`.trim()}>{content}</div>
      {hint ? <div id={hintId} className="vos-form-hint">{hint}</div> : null}
      {error ? <div id={errorId} className="vos-form-error">{error}</div> : null}
    </FormRow>
  )
}