import { ArrowUpRight, Cpu, ScanEye, Video } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../common/StatusBadge'
import { footageStatusTone, humanLabels, humanTone } from '../../lib/footage'
import type { InvestigationReport } from '../reports/reportModel'
import { timeAgo } from './ActivityFeed'

interface InvestigationCardProps {
  report: InvestigationReport
  now: number
}

export function InvestigationCard({ report, now }: InvestigationCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const { footage } = report
  const active = footage.status === 'Processing'

  return (
    <motion.article
      className="cc-investigation-card"
      layout={!shouldReduceMotion}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0, y: -5 }}
      whileHover={shouldReduceMotion ? undefined : { borderColor: 'rgba(0, 229, 255, 0.24)' }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
    >
      <Link
        className="cc-investigation-link"
        to="/vision-studio"
        state={{ footageId: footage.id, origin: 'Command Center' }}
        aria-label={`Open ${report.name} in Vision Studio`}
      >
        <div className="cc-investigation-card-heading">
          <div className="cc-investigation-title-wrap">
            <span className="cc-investigation-id">{footage.id.slice(0, 8)}</span>
            <h3>{report.name}</h3>
          </div>
          {report.humans ? (
            <StatusBadge tone={humanTone[report.humans]}>{humanLabels[report.humans]}</StatusBadge>
          ) : (
            <StatusBadge tone={footageStatusTone[footage.status]} pulse={active}>{footage.status}</StatusBadge>
          )}
        </div>

        <div className="cc-investigation-meta">
          <span className="cc-category-label">{report.sourceLabel}</span>
        </div>
        <div className="cc-investigation-source" title={footage.fileName}>
          {footage.kind === 'recording' ? <Cpu size={12} aria-hidden="true" /> : <Video size={12} aria-hidden="true" />}
          <span>{footage.kind === 'recording' ? footage.source : footage.fileName}</span>
        </div>

        {active && (
          <div className="cc-progress-row">
            <span className="cc-progress-track is-indeterminate" role="progressbar" aria-label={`${report.name} processing`}>
              <span className="cc-progress-value" />
            </span>
            <span className="cc-progress-label">Worker</span>
          </div>
        )}

        <div className="cc-investigation-footer">
          <span>
            <ScanEye size={13} aria-hidden="true" />
            {report.observations === null ? 'No results yet' : `${report.observations} observations`}
          </span>
          <span>
            <ArrowUpRight size={12} aria-hidden="true" />
            {timeAgo(report.openedAt, now)}
          </span>
        </div>
      </Link>
    </motion.article>
  )
}
