/**
 * Checkbox — Custom styled checkbox component
 *
 * Used throughout the app to replace native checkbox inputs
 * with a consistent, themed look.
 */

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  indeterminate?: boolean
  label?: string
  disabled?: boolean
  style?: React.CSSProperties
  className?: string
}

export function Checkbox({ checked, onChange, indeterminate, label, disabled, style, className }: CheckboxProps) {
  const isChecked = indeterminate ? false : checked

  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the div inside acts as the control
    <label
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
        ...style
      }}
    >
      <div
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        tabIndex={disabled ? -1 : 0}
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `1.5px solid ${checked || indeterminate ? '#1668dc' : '#555'}`,
          background: checked || indeterminate ? '#1668dc' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
          boxSizing: 'border-box'
        }}
        onClick={() => {
          if (!disabled) onChange(!checked)
        }}
        onKeyDown={e => {
          if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
            e.preventDefault()
            onChange(!checked)
          }
        }}
      >
        {indeterminate ? (
          <svg width="8" height="2" viewBox="0 0 8 2" fill="none" aria-hidden="true">
            <path d="M1 1H7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : isChecked ? (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </div>
      {label && (
        <span className="text-[13px] text-[var(--vos-text-primary)] leading-[1]">{label}</span>
      )}
    </label>
  )
}
