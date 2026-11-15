import { sfx } from '../../audio/sfx'
import type { InvestigationReport } from './reportModel'

/** Exports are built in the browser from data already loaded; nothing is sent anywhere. Signed URLs are never included. */

export function downloadFile(fileName: string, content: string, type: string) {
  sfx.play('complete')
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  // Neutralize spreadsheet formulas and quote when needed.
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

const pct = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 10)

export function historyToCsv(reports: InvestigationReport[]) {
  const header = [
    'ID', 'Name', 'Source', 'Kind', 'Opened (UTC)', 'Status', 'Humans', 'Person seen at', 'Best person confidence (%)',
    'Condition-frames', 'Accepted observations',
    'Mean confidence (%)', 'Review candidates', 'Miss rate', 'Fusion verdict', 'Review priority',
  ]
  const rows = reports.map((r) => [
    r.id, r.name, r.sourceLabel, r.kind, r.openedAt, r.status, r.humans ?? '',
    r.findings?.people ? r.findings.people.segments.map(([a, b]) => (a === b ? `${a}s` : `${a}-${b}s`)).join(' ') : '',
    r.findings?.people ? pct(r.findings.people.max_confidence) : null,
    r.totalFrames, r.observations,
    pct(r.confidence), r.reviewCandidates,
    r.kind === 'upload' && r.investigation ? (r.investigation.miss_rate === null ? 'unmeasured' : r.investigation.miss_rate) : null,
    r.verdict, r.priority,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export function reportToData(report: InvestigationReport) {
  const { footage, investigation, result } = report
  return {
    notice:
      'NightWatch prototype evaluation. Not safety-certified; does not replace rescuers. Counts are object observations, not unique people. Miss rate is null without annotated ground truth.',
    id: report.id,
    name: report.name,
    kind: report.kind,
    source: report.sourceLabel,
    opened_at: report.openedAt,
    status: report.status,
    humans: report.humans,
    findings: report.findings ?? report.investigation?.metrics_json?.findings ?? null,
    footage: {
      file_name: footage.fileName,
      duration_seconds: footage.durationSeconds,
      size_bytes: footage.fileSizeBytes,
      device_id: footage.deviceId,
      use_case: footage.useCase,
      model_version: footage.video?.model_version ?? result?.model_version ?? null,
    },
    investigation: investigation
      ? {
          job_id: investigation.job_id,
          total_frames: investigation.total_frames,
          frames_with_detections: investigation.frames_with_detections,
          total_detections: investigation.total_detections,
          average_confidence: investigation.average_confidence,
          miss_rate: investigation.miss_rate,
          review_candidate_count: investigation.review_candidate_count,
          by_condition: investigation.metrics_json?.by_condition ?? {},
          summary: investigation.summary,
          completed_at: investigation.completed_at,
        }
      : null,
    recording_result: result
      ? {
          status: result.status,
          verdict: result.verdict,
          person_score: result.person_score,
          max_person_confidence: result.max_person_confidence,
          review_priority: result.review_priority,
          reasons: result.reasons,
          environment: result.environment,
          label_counts: result.label_counts,
          total_frames: result.total_frames,
          total_detections: result.total_detections,
          average_confidence: result.average_confidence,
          processed_at: result.processed_at,
        }
      : null,
  }
}

export function reportSlug(report: InvestigationReport) {
  const name = report.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `nightwatch-${name || 'report'}-${report.id.slice(0, 8)}`
}
