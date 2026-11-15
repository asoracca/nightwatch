import type { StatusTone } from '../common/StatusBadge'
import type { ReportStatus } from './reportModel'

export const reportStatusTone: Record<ReportStatus, StatusTone> = {
  Completed: 'cyan',
  Processing: 'purple',
  Pending: 'muted',
  Failed: 'pink',
}
