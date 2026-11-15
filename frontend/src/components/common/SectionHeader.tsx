import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  titleId?: string
  eyebrow?: string
  action?: ReactNode
}

export function SectionHeader({ title, titleId, eyebrow, action }: SectionHeaderProps) {
  return (
    <div className="cc-section-header">
      <div className="cc-section-heading">
        {eyebrow && <span className="cc-section-eyebrow">{eyebrow}</span>}
        <h2 id={titleId}>{title}</h2>
      </div>
      {action && <div className="cc-section-action">{action}</div>}
    </div>
  )
}
