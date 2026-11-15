import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, Check, FileCode2, FileText, Loader2, RotateCcw, ScanEye, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ReinvestigatePanel } from '../common/ReinvestigatePanel'
import { StatusBadge } from '../common/StatusBadge'
import { formatDuration } from '../data-vault/formatters'
import { EvidenceReport } from '../vision-studio/EvidenceReport'
import { FindingsPanel } from '../vision-studio/FindingsPanel'
import { RecordingVerdict } from '../vision-studio/RecordingVerdict'
import { useAuth } from '../../lib/auth'
import { getRecordingResult, type RecordingResultDetail } from '../../lib/recordings'
import { downloadFile, reportSlug, reportToData } from './exportReports'
import { formatReportDate, type InvestigationReport } from './reportModel'
import { reportStatusTone } from './tones'

interface ReportDetailModalProps {
  report: InvestigationReport
  onClose: () => void
}

export function ReportDetailModal({ report, onClose }: ReportDetailModalProps) {
  const reduceMotion = useReducedMotion() ?? false
  const navigate = useNavigate()
  const { token } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [exportMessage, setExportMessage] = useState('')
  const [reinvestigating, setReinvestigating] = useState(false)
  const [recordingDetail, setRecordingDetail] = useState<RecordingResultDetail | null>(null)

  // Recordings: load the full published result (per-condition summary, clips, sensor timeline).
  useEffect(() => {
    if (report.kind !== 'recording' || !report.result) return
    let active = true
    getRecordingResult(report.id)
      .then((detail) => active && setRecordingDetail(detail))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [report.id, report.kind, report.result])

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  useEffect(() => {
    if (!exportMessage) return
    const timer = window.setTimeout(() => setExportMessage(''), 5_000)
    return () => window.clearTimeout(timer)
  }, [exportMessage])

  function exportJson() {
    downloadFile(`${reportSlug(report)}.json`, JSON.stringify(reportToData(report), null, 2), 'application/json')
    setExportMessage('Report data downloaded as JSON.')
  }

  function openInVisionStudio() {
    navigate('/vision-studio', { state: { footageId: report.id, origin: 'Reports' } })
  }

  return (
    <motion.dialog
      ref={dialogRef}
      className="dv-dialog rp-dialog"
      aria-labelledby="rp-detail-title"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        className="dv-dialog-card rp-dialog-card"
        initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
      >
        <header className="rp-detail-header">
          <div className="dv-dialog-title-group">
            <span className="dv-dialog-icon"><FileText size={18} aria-hidden="true" /></span>
            <div>
              <span className="cc-section-eyebrow">
                {report.kind === 'recording' ? 'Arduino recording report' : 'Investigation report'} · {report.id.slice(0, 8)}
              </span>
              <h2 id="rp-detail-title">{report.name}</h2>
              <div className="rp-detail-sub">
                <StatusBadge tone={reportStatusTone[report.status]} pulse={report.status === 'Processing'}>{report.status}</StatusBadge>
                <span>{report.sourceLabel}</span>
                <span>{formatReportDate(report.openedAt)}</span>
                <span>{formatDuration(report.footage.durationSeconds)}</span>
              </div>
            </div>
          </div>
          <button className="cc-modal-close" type="button" aria-label="Close report" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="rp-detail-toolbar">
          <div className="rp-detail-actions">
            {(report.status === 'Completed' || report.status === 'Failed') && (
              <button className="cc-button cc-button--quiet" type="button" disabled={reinvestigating} onClick={() => setReinvestigating(true)}>
                <RotateCcw size={14} aria-hidden="true" />
                Reinvestigate
              </button>
            )}
            <button className="cc-button cc-button--quiet" type="button" onClick={openInVisionStudio}>
              <ScanEye size={14} aria-hidden="true" />
              Open in Vision Studio
            </button>
            <button className="cc-button cc-button--primary" type="button" onClick={exportJson}>
              <FileCode2 size={14} aria-hidden="true" />
              Export JSON
            </button>
          </div>
        </div>

        <div className="rp-export-status" role="status">
          <AnimatePresence>
            {exportMessage && (
              <motion.span
                initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.16 }}
              >
                <Check size={13} aria-hidden="true" /> {exportMessage}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {reinvestigating && (
          <ReinvestigatePanel
            footage={report.footage}
            onCancel={() => setReinvestigating(false)}
            onQueued={(message) => {
              setReinvestigating(false)
              setExportMessage(message)
            }}
          />
        )}

        <div className="rp-tab-panel rp-live-report">
          {report.status === 'Completed' && (
            <FindingsPanel
              findings={report.kind === 'upload' ? report.findings : recordingDetail?.summary?.findings}
              onJump={(condition, frameNumber) =>
                navigate('/vision-studio', { state: { footageId: report.id, origin: 'Reports', jump: { condition, frameNumber } } })
              }
            />
          )}
          {report.status === 'Failed' && (
            <div className="rp-alert rp-alert--failed" role="note">
              <AlertTriangle size={15} aria-hidden="true" />
              <span><strong>Processing failed.</strong> {report.errorMessage ?? 'No error message was stored.'}</span>
            </div>
          )}
          {(report.status === 'Processing' || report.status === 'Pending') && (
            <div className="rp-alert rp-alert--processing" role="note">
              <Loader2 size={15} aria-hidden="true" />
              <span><strong>No final report yet.</strong> {report.summary}</span>
            </div>
          )}

          {report.kind === 'upload' ? (
            <>
              {report.investigation && (
                <section className="rp-section" aria-labelledby="rp-summary-heading">
                  <span className="cc-section-eyebrow">Stored summary</span>
                  <h3 id="rp-summary-heading">Assessment</h3>
                  <p className="rp-summary">{report.investigation.summary}</p>
                </section>
              )}
              <EvidenceReport videoId={report.id} token={token} investigation={report.investigation} />
            </>
          ) : (
            <RecordingVerdict result={recordingDetail ?? report.result} />
          )}
        </div>
      </motion.div>
    </motion.dialog>
  )
}
