import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Camera, Clock3, Cpu, FileVideo2, Fingerprint, HardDrive, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
import { ReinvestigatePanel } from '../common/ReinvestigatePanel'
import { StatusBadge } from '../common/StatusBadge'
import { api, type Video } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { footageStatusTone, humanLabels, humanStatus, humanTone, percent, type Footage } from '../../lib/footage'
import { getRecordingResult, signResultMedia, verdictLabels, type RecordingResultDetail } from '../../lib/recordings'
import { useWorkspace } from '../../lib/workspace'
import { formatDuration, formatFileSize, formatUploadDateTime } from './formatters'
import { VideoThumbnail } from './VideoThumbnail'

interface FootageDetailsModalProps {
  footage: Footage
  onClose: () => void
  onInvestigate: () => void
  /** Called after the footage was permanently deleted. */
  onDeleted: (message: string) => void
  /** Called after a reinvestigation was queued. */
  onReinvestigated: (message: string) => void
}

export function FootageDetailsModal({ footage, onClose, onInvestigate, onDeleted, onReinvestigated }: FootageDetailsModalProps) {
  const { token } = useAuth()
  const { investigations, refreshVideos } = useWorkspace()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const shouldReduceMotion = useReducedMotion() ?? false
  const [detail, setDetail] = useState<Video | null>(null)
  const [recordingDetail, setRecordingDetail] = useState<RecordingResultDetail | null>(null)
  const [clipUrl, setClipUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reinvestigating, setReinvestigating] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  // Fetch signed media once per open; signed URLs expire after 15 minutes and are never logged.
  const verified = footage.video?.upload_verified ?? false
  useEffect(() => {
    let active = true
    setLoadError('')
    if (footage.kind === 'upload') {
      if (!verified) return
      api<Video>(`/videos/${footage.id}`, token)
        .then((video) => active && setDetail(video))
        .catch((error: Error) => active && setLoadError(error.message))
    } else {
      getRecordingResult(footage.id)
        .then(async (result) => {
          if (!active) return
          setRecordingDetail(result)
          const clip = result?.annotated_clips?.clear
          if (clip) {
            const urls = await signResultMedia([clip])
            if (active) setClipUrl(urls.get(clip) ?? null)
          }
        })
        .catch((error: Error) => active && setLoadError(error.message))
    }
    return () => {
      active = false
    }
  }, [footage.id, footage.kind, token, verified])

  async function verifyUpload() {
    setBusy(true)
    setActionMessage('')
    try {
      await api(`/videos/${footage.id}/upload-complete`, token, {})
      await refreshVideos()
      setActionMessage('Upload verified. Open it in Vision Studio to start analysis.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteFootage() {
    setBusy(true)
    setActionMessage('')
    try {
      const result = await api<{ deleted: boolean; frames_removed: number }>(`/videos/${footage.id}`, token, undefined, 'DELETE')
      await refreshVideos()
      onDeleted(`${footage.title} deleted with ${result.frames_removed} stored frames, results and reviews.`)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Delete failed')
      setConfirmDelete(false)
    } finally {
      setBusy(false)
    }
  }

  // Uploads: verified and not mid-run. Recordings: once the processor has published a result.
  const canReinvestigate =
    footage.kind === 'upload'
      ? Boolean(footage.video?.upload_verified) && footage.status !== 'Processing'
      : footage.status === 'Analyzed' || footage.status === 'Failed'

  const video = detail ?? footage.video
  const human = humanStatus(footage, investigations)
  const investigation = footage.kind === 'upload' ? investigations[footage.id] : undefined
  const result = recordingDetail ?? footage.recording?.result ?? null
  const playbackUrl = footage.kind === 'upload' ? detail?.playback_url : clipUrl
  const width = video?.width ?? footage.recording?.width
  const height = video?.height ?? footage.recording?.height
  const fps = video?.fps ?? footage.recording?.fps

  return (
    <motion.dialog
      ref={dialogRef}
      className="dv-dialog"
      aria-labelledby="dv-details-title"
      aria-describedby="dv-details-description"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        className="dv-dialog-card dv-details-dialog-card"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0, y: 7, scale: 0.99 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
      >
        <header className="dv-dialog-header">
          <div className="dv-dialog-title-group">
            <span className="dv-dialog-icon">
              {footage.kind === 'recording' ? <Cpu size={18} aria-hidden="true" /> : <FileVideo2 size={18} aria-hidden="true" />}
            </span>
            <div>
              <span className="cc-section-eyebrow">
                {footage.kind === 'recording' ? 'ARDUINO RECORDING' : 'UPLOADED FOOTAGE'} · {footage.id.slice(0, 8)}
              </span>
              <h2 id="dv-details-title">{footage.title}</h2>
            </div>
          </div>
          <button className="cc-modal-close" type="button" aria-label="Close footage details" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <p className="dv-dialog-description" id="dv-details-description">
          {footage.kind === 'recording'
            ? 'Captured by your Arduino camera and processed with its sensor readings. Playback shows the annotated clear-condition clip.'
            : 'Private signed playback; the link expires after 15 minutes.'}
        </p>

        <div className="dv-preview-frame">
          {playbackUrl ? (
            <video
              className="dv-local-preview"
              src={playbackUrl}
              controls
              playsInline
              preload="metadata"
              aria-label={`Playback of ${footage.title}`}
            />
          ) : (
            <>
              <VideoThumbnail footage={footage} />
              <span className="dv-preview-note">
                {loadError
                  ? loadError
                  : footage.kind === 'upload' && !verified
                    ? 'Playback is available after the upload is verified'
                    : footage.kind === 'recording' && !result
                      ? 'No annotated clip yet: the recording has not been processed'
                      : 'Loading playback…'}
              </span>
            </>
          )}
        </div>

        <div className="dv-details-heading">
          <div>
            <span className="cc-section-eyebrow">RECORD METADATA</span>
            <h3>{footage.fileName}</h3>
          </div>
          <StatusBadge tone={footageStatusTone[footage.status]} pulse={footage.status === 'Processing'}>
            {footage.status}
          </StatusBadge>
        </div>

        {footage.errorMessage && <p className="nw-inline-error" role="alert">{footage.errorMessage}</p>}

        <dl className="dv-metadata-grid">
          <div>
            <dt><HardDrive size={12} aria-hidden="true" /> File size</dt>
            <dd>{footage.fileSizeBytes ? formatFileSize(footage.fileSizeBytes) : 'Unknown'}</dd>
          </div>
          <div>
            <dt><Clock3 size={12} aria-hidden="true" /> Duration</dt>
            <dd>{formatDuration(footage.durationSeconds)}</dd>
          </div>
          <div>
            <dt><FileVideo2 size={12} aria-hidden="true" /> {footage.kind === 'recording' ? 'Source' : 'Use case'}</dt>
            <dd>{footage.categoryLabel}</dd>
          </div>
          <div>
            <dt><Camera size={12} aria-hidden="true" /> Resolution</dt>
            <dd>{width && height ? `${width} × ${height}${fps ? ` · ${Math.round(fps)} fps` : ''}` : 'Measured after verification'}</dd>
          </div>
          {footage.kind === 'upload' && video && (
            <div>
              <dt><ShieldCheck size={12} aria-hidden="true" /> Upload</dt>
              <dd>{video.upload_verified ? 'Verified by server' : 'Not verified'}</dd>
            </div>
          )}
          {footage.deviceId && (
            <div>
              <dt><Fingerprint size={12} aria-hidden="true" /> Device</dt>
              <dd>{footage.deviceId}</dd>
            </div>
          )}
          <div className="dv-metadata-wide">
            <dt>{footage.kind === 'recording' ? 'Recorded' : 'Uploaded'}</dt>
            <dd>{formatUploadDateTime(footage.recording?.recorded_at ?? footage.uploadedAt)}</dd>
          </div>
          {footage.kind === 'upload' && video && (
            <>
              <div>
                <dt>Processing started</dt>
                <dd>{video.processing_started_at ? formatUploadDateTime(video.processing_started_at) : '—'}</dd>
              </div>
              <div>
                <dt>Processing finished</dt>
                <dd>{video.processing_finished_at ? formatUploadDateTime(video.processing_finished_at) : '—'}</dd>
              </div>
              <div className="dv-metadata-wide">
                <dt>Model</dt>
                <dd className="dv-mono-break">{video.model_name ? `${video.model_name} · ${video.model_version}` : 'Not analysed yet'}</dd>
              </div>
              {video.content_sha256 && (
                <div className="dv-metadata-wide">
                  <dt><Fingerprint size={12} aria-hidden="true" /> SHA-256</dt>
                  <dd className="dv-mono-break">{video.content_sha256}</dd>
                </div>
              )}
              {video.recording_started_at && (
                <div className="dv-metadata-wide">
                  <dt>Capture interval start</dt>
                  <dd>{formatUploadDateTime(video.recording_started_at)}</dd>
                </div>
              )}
            </>
          )}
        </dl>

        <section className="dv-analysis-note" aria-labelledby="dv-analysis-heading">
          <span className="cc-section-eyebrow">ANALYSIS</span>
          {footage.kind === 'upload' ? (
            <>
              <h3 id="dv-analysis-heading">
                {investigation?.metrics_json?.findings?.headline_text ?? (investigation ? 'Stored investigation' : 'No completed analysis')}
                {human && <StatusBadge tone={humanTone[human]}>{humanLabels[human]}</StatusBadge>}
              </h3>
              {investigation?.metrics_json?.findings && <p>{investigation.metrics_json.findings.detail}</p>}
              <p>
                {investigation
                  ? `${investigation.total_detections} accepted observations across ${investigation.total_frames} condition-frames · mean confidence ${percent(investigation.average_confidence, 1)} · ${investigation.review_candidate_count} review candidates.`
                  : footage.status === 'Processing'
                    ? 'The worker is processing this video. Results appear when the job completes.'
                    : footage.status === 'Unverified'
                      ? 'Verify the upload, then start analysis from Vision Studio.'
                      : 'Open Vision Studio to start or inspect an analysis.'}
              </p>
            </>
          ) : result ? (
            <>
              <h3 id="dv-analysis-heading">
                {result.verdict ? verdictLabels[result.verdict] : result.status === 'failed' ? 'Processing failed' : 'Processed'}
                {result.review_priority && <StatusBadge tone={result.review_priority === 'high' ? 'pink' : result.review_priority === 'medium' ? 'amber' : 'muted'}>{result.review_priority} priority</StatusBadge>}
              </h3>
              <p>
                {result.total_detections ?? 0} accepted detections · fused person score {percent(result.person_score)} · model-only
                person max {percent(result.max_person_confidence)}
              </p>
              {result.reasons.length > 0 && (
                <ul className="dv-reasons">
                  {result.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              )}
            </>
          ) : (
            <>
              <h3 id="dv-analysis-heading">Waiting for the recording processor</h3>
              <p>Results appear once <code>python -m nightwatch.recordings --watch</code> publishes them.</p>
            </>
          )}
        </section>

        {actionMessage && <p className="nw-inline-note" role="status">{actionMessage}</p>}

        {reinvestigating && (
          <ReinvestigatePanel footage={footage} onCancel={() => setReinvestigating(false)} onQueued={onReinvestigated} />
        )}

        {confirmDelete && (
          <div className="dv-delete-confirm" role="alertdialog" aria-labelledby="dv-delete-title">
            <strong id="dv-delete-title">Delete “{footage.title}” permanently?</strong>
            <p>
              This removes the original video, every sampled frame, all analysis results, experiment runs and review
              decisions. Linked sensor events are kept but unlinked. This cannot be undone.
            </p>
            <div>
              <button className="cc-button cc-button--quiet" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Keep footage
              </button>
              <button className="cc-button dv-danger" type="button" disabled={busy} onClick={deleteFootage}>
                <Trash2 size={14} aria-hidden="true" /> {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        )}

        <footer className="dv-dialog-actions">
          {canReinvestigate && !reinvestigating && !confirmDelete && (
            <button className="cc-button cc-button--quiet" type="button" disabled={busy} onClick={() => setReinvestigating(true)}>
              <RotateCcw size={14} aria-hidden="true" /> Reinvestigate
            </button>
          )}
          {footage.kind === 'upload' && !confirmDelete && (
            <button
              className="cc-button cc-button--quiet dv-delete-trigger"
              type="button"
              disabled={busy || footage.status === 'Processing'}
              title={footage.status === 'Processing' ? 'Wait for processing to finish before deleting' : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          )}
          <button className="cc-button cc-button--quiet" type="button" onClick={onClose}>
            Close details
          </button>
          {footage.kind === 'upload' && footage.status === 'Unverified' && (
            <button className="cc-button cc-button--quiet" type="button" disabled={busy} onClick={verifyUpload}>
              <ShieldCheck size={15} aria-hidden="true" /> {busy ? 'Verifying…' : 'Verify upload'}
            </button>
          )}
          <button className="cc-button cc-button--primary" type="button" onClick={onInvestigate}>
            Investigate footage <ArrowRight size={15} aria-hidden="true" />
          </button>
        </footer>
      </motion.div>
    </motion.dialog>
  )
}
