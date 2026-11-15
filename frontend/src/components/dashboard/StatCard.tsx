import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion, type Variants } from 'motion/react'

export interface DashboardMetric {
  id: string
  label: string
  value: string
  detail: string
  accent: 'cyan' | 'purple' | 'amber' | 'pink'
  Icon: LucideIcon
}

interface StatCardProps {
  metric: DashboardMetric
  variants: Variants
}

export function StatCard({ metric, variants }: StatCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const { Icon } = metric

  return (
    <motion.article
      className={`cc-stat-card cc-stat-card--${metric.accent}`}
      variants={variants}
      whileHover={shouldReduceMotion ? undefined : { y: -3 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="cc-stat-card-top">
        <span className="cc-stat-icon">
          <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <span className="cc-stat-detail">{metric.detail}</span>
      </div>
      <div className="cc-stat-value">{metric.value}</div>
      <div className="cc-stat-label">{metric.label}</div>
      <span className="cc-stat-accent" aria-hidden="true" />
    </motion.article>
  )
}
