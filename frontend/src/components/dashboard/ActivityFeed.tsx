import { AlertTriangle, Check, Cpu, Radio, Upload, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

export type ActivityKind = 'upload' | 'result' | 'failure' | 'device' | 'recording'
export type ActivityState = 'Complete' | 'Working' | 'Queued'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  title: string
  text: string
  at: string
  state: ActivityState
  /** Footage to open in Vision Studio. */
  footageId?: string
}

const icons: Record<ActivityKind, LucideIcon> = {
  upload: Upload,
  result: Check,
  failure: AlertTriangle,
  device: Radio,
  recording: Cpu,
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000)
  if (!Number.isFinite(seconds)) return '—'
  const abs = Math.abs(seconds)
  if (abs < 60) return relative.format(seconds, 'second')
  if (abs < 3_600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3_600), 'hour')
  return relative.format(Math.round(seconds / 86_400), 'day')
}

export function ActivityFeed({ activities, now }: { activities: ActivityItem[]; now: number }) {
  if (activities.length === 0) {
    return <p className="cc-panel-footnote">No activity yet. Upload footage or connect an Arduino to get started.</p>
  }
  return (
    <ol className="cc-activity-list">
      {activities.map((activity) => {
        const Icon = icons[activity.kind]
        const body = (
          <>
            <span className={`cc-agent-icon cc-agent-icon--${activity.state.toLowerCase()}${activity.kind === 'failure' ? ' is-failure' : ''}`}>
              <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
            </span>
            <div className="cc-activity-copy">
              <div className="cc-activity-meta">
                <strong>{activity.title}</strong>
                <span>{timeAgo(activity.at, now)}</span>
              </div>
              <p>{activity.text}</p>
            </div>
            <span className="cc-activity-state" aria-label={activity.state}>
              <span className="sr-only">{activity.state}</span>
              {activity.state === 'Complete' ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <span className={`status-badge-dot${activity.state === 'Working' ? ' status-badge-dot--pulse' : ''}`} aria-hidden="true" />
              )}
            </span>
          </>
        )
        return (
          <li className="cc-activity-item" key={activity.id}>
            {activity.footageId ? (
              <Link className="cc-activity-link" to="/vision-studio" state={{ footageId: activity.footageId, origin: 'Command Center' }}>
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ol>
  )
}
