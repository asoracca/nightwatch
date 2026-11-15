import type { ReactNode } from 'react'

export type StatusTone =
  | 'cyan'
  | 'purple'
  | 'amber'
  | 'pink'
  | 'positive'
  | 'muted'

interface StatusBadgeProps {
  children: ReactNode
  tone?: StatusTone
  pulse?: boolean
}

export function StatusBadge({
  children,
  tone = 'muted',
  pulse = false,
}: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span
        className={`status-badge-dot${pulse ? ' status-badge-dot--pulse' : ''}`}
        aria-hidden="true"
      />
      {children}
    </span>
  )
}
