// One report row per piece of footage, derived from stored investigations and recording results.
import type { Findings, Investigation } from '../../lib/api'
import { humanStatus, type Footage, type HumanStatus } from '../../lib/footage'
import type { FusionVerdict, RecordingResultSummary, ReviewPriority } from '../../lib/recordings'

export const reportStatuses = ['Completed', 'Processing', 'Pending', 'Failed'] as const
export type ReportStatus = (typeof reportStatuses)[number]

export interface InvestigationReport {
  id: string
  name: string
  kind: Footage['kind']
  sourceLabel: string
  openedAt: string
  status: ReportStatus
  /** Accepted observations across all conditions; null until results exist. */
  observations: number | null
  /** Mean confidence of accepted observations (0–1). */
  confidence: number | null
  reviewCandidates: number | null
  totalFrames: number | null
  priority: ReviewPriority | null
  verdict: FusionVerdict | null
  summary: string
  errorMessage: string | null
  /** Humans found / possible / none, once analysed. */
  humans: HumanStatus | null
  findings: Findings | null
  footage: Footage
  investigation: Investigation | null
  result: RecordingResultSummary | null
}

function statusOf(footage: Footage): ReportStatus {
  if (footage.status === 'Analyzed') return 'Completed'
  if (footage.status === 'Processing') return 'Processing'
  if (footage.status === 'Failed') return 'Failed'
  return 'Pending'
}

export function buildReport(footage: Footage, investigations: Record<string, Investigation | null>): InvestigationReport {
  const status = statusOf(footage)
  const base = {
    id: footage.id,
    name: footage.title,
    kind: footage.kind,
    sourceLabel: footage.categoryLabel,
    openedAt: footage.recording?.recorded_at ?? footage.uploadedAt,
    status,
    errorMessage: footage.errorMessage,
    humans: humanStatus(footage, investigations),
    footage,
  }

  if (footage.kind === 'recording') {
    const result = footage.recording?.result ?? null
    const done = result?.status === 'completed'
    return {
      ...base,
      observations: done ? (result.total_detections ?? 0) : null,
      confidence: done ? result.average_confidence : null,
      reviewCandidates: done ? (result.review_candidate_count ?? 0) : null,
      totalFrames: done ? result.total_frames : null,
      priority: result?.review_priority ?? null,
      verdict: result?.verdict ?? null,
      summary: result?.reasons?.[0] ?? (result ? 'Processed without notable findings.' : 'Waiting for the recordings processor.'),
      investigation: null,
      result,
      findings: null,
    }
  }

  const investigation = investigations[footage.id] ?? null
  return {
    ...base,
    observations: investigation?.total_detections ?? null,
    confidence: investigation?.average_confidence ?? null,
    reviewCandidates: investigation?.review_candidate_count ?? null,
    totalFrames: investigation?.total_frames ?? null,
    priority: null,
    verdict: null,
    summary:
      investigation?.summary ??
      (status === 'Completed'
        ? 'Loading stored investigation…'
        : status === 'Failed'
          ? footage.errorMessage || 'Processing failed.'
          : status === 'Processing'
            ? 'The worker is processing this video.'
            : 'No completed analysis yet.'),
    investigation,
    result: null,
    findings: investigation?.metrics_json?.findings ?? null,
  }
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const dayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
const timeOnlyFormatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

function safe(iso: string, format: Intl.DateTimeFormat) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : format.format(date)
}

export const formatDay = (iso: string) => safe(iso, dayFormatter)
export const formatTime = (iso: string) => safe(iso, timeOnlyFormatter)
export const formatReportDate = (iso: string) => safe(iso, dateTimeFormatter)
