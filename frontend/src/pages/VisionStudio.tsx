import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Info, Plus, ScanEye, ShieldCheck, Workflow, X, XCircle } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '../components/common/SectionHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { formatPreciseTime, type EvidenceFrame, type RunStatus } from '../components/vision-studio/analysis'
import {
  DEFAULT_RUN,
  DetectionConfigPanel,
  type DisplaySettings,
  type RunSettings,
} from '../components/vision-studio/DetectionConfigPanel'
import { DetectionResults } from '../components/vision-studio/DetectionResults'
import { EvidenceReport } from '../components/vision-studio/EvidenceReport'
import { FindingsPanel } from '../components/vision-studio/FindingsPanel'
import { FootageSelector } from '../components/vision-studio/FootageSelector'
import { PipelineStages } from '../components/vision-studio/PipelineStages'
import { RecordingVerdict } from '../components/vision-studio/RecordingVerdict'
import {
  loadStoredFootageId,
  readFootageHandoff,
  storeFootageId,
  type FootageOrigin,
} from '../components/vision-studio/selectedFootage'
import { DeviceLinkForm, SensorReadings } from '../components/vision-studio/SensorReadings'
import { SourcePlayback } from '../components/vision-studio/SourcePlayback'
import { EvidenceTimeline, SurveillanceFrame } from '../components/vision-studio/SurveillanceFrame'
import { useRecordingEvidence, useUploadEvidence } from '../components/vision-studio/useEvidence'
import { sfx } from '../audio/sfx'
import { api, apiConfigured, CONDITIONS, MODELS, type AssistantCitation, type Condition, type ModelName } from '../lib/api'
import { useAuth } from '../lib/auth'
import { conditionLabels, humanLabels, humanTone } from '../lib/footage'
import { useWorkspace } from '../lib/workspace'
import './CommandCenter.css'
import './DataVault.css'
import './VisionStudio.css'

/** Model a run used: explicit field, else derived from its version string (e.g. yolo11n-u8...). */
function modelOf(config: { model?: string; model_version?: string } | undefined): ModelName {
  const name = config?.model ?? config?.model_version?.split('-')[0]
  return name && name in MODELS ? (name as ModelName) : DEFAULT_RUN.model
}

const DEFAULT_DISPLAY: DisplaySettings = { minConfidence: 0.4, showTracks: true, reviewOnly: false }

export default function VisionStudio() {
  const reduceMotion = useReducedMotion() ?? false
  const location = useLocation()
  const navigate = useNavigate()
  const { token } = useAuth()
  const { footage: allFootage, investigations, devices, refreshVideos } = useWorkspace()

  const [initial] = useState(() => readFootageHandoff(location.state))
  const [footageId, setFootageId] = useState<string | null>(() => initial?.footageId ?? loadStoredFootageId())
  const [origin, setOrigin] = useState<FootageOrigin | null>(initial?.origin ?? null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [condition, setCondition] = useState<Condition>('clear')
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY)
  const [run, setRun] = useState<RunSettings>(DEFAULT_RUN)
  const [frameIndex, setFrameIndex] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [pendingJump, setPendingJump] = useState<{ condition: Condition; frameNumber: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  // Hand-offs from other pages (Data Vault, Reports, alerts) arrive as router state.
  useEffect(() => {
    const handoff = readFootageHandoff(location.state)
    if (handoff) {
      setFootageId(handoff.footageId)
      setOrigin(handoff.origin)
      if (handoff.jump) {
        setPendingJump(handoff.jump)
        setCondition(handoff.jump.condition)
      }
    }
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  // Block bodies on purpose: an effect must return nothing or a cleanup function. Chromium's
  // window.scrollTo() returns a Promise, which React would try to call as cleanup and crash the page.
  useEffect(() => {
    storeFootageId(footageId)
  }, [footageId])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 6_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const footage = allFootage.find((item) => item.id === footageId) ?? null
  const isUpload = footage?.kind === 'upload'
  const isRecording = footage?.kind === 'recording'
  const video = footage?.video ?? null

  const upload = useUploadEvidence(isUpload ? footage.id : null, token, condition, display.reviewOnly, refreshVideos)
  const recording = useRecordingEvidence(isRecording ? footage.id : null, condition)
  const job = upload.status?.job ?? null
  const frames = useMemo<EvidenceFrame[]>(
    () => (isUpload ? upload.frames : isRecording ? recording.frames : []),
    [isRecording, isUpload, recording.frames, upload.frames],
  )
  const framesLoading = isUpload ? upload.framesLoading : recording.loading
  const investigation = isUpload ? investigations[footage.id] : undefined
  const recordingResult = recording.detail ?? footage?.recording?.result ?? null
  const findings = isUpload ? investigation?.metrics_json?.findings : isRecording ? recording.detail?.summary?.findings : undefined

  const runStatus: RunStatus = isUpload
    ? !job
      ? 'idle'
      : job.status === 'queued'
        ? 'queued'
        : job.status === 'processing'
          ? 'running'
          : job.status === 'completed'
            ? 'complete'
            : 'failed'
    : isRecording && recordingResult
      ? recordingResult.status === 'completed'
        ? 'complete'
        : 'failed'
      : 'idle'

  // Conditions that actually have results, so tabs never point at empty data.
  const availableConditions: Condition[] = useMemo(() => {
    if (isUpload) return job?.config?.conditions?.length ? CONDITIONS.filter((c) => job.config.conditions.includes(c)) : ['clear']
    if (isRecording && recording.detail) {
      const present = new Set(recording.detail.frames.map((frame) => frame.visibility_condition))
      return CONDITIONS.filter((c) => present.has(c))
    }
    return ['clear']
  }, [isRecording, isUpload, job, recording.detail])

  useEffect(() => {
    if (!availableConditions.includes(condition)) setCondition(availableConditions[0] ?? 'clear')
  }, [availableConditions, condition])

  // Show the settings of the run being inspected.
  const configSource = isUpload ? job?.config : recording.detail?.config
  const configKey = isUpload ? job?.id : recording.detail?.id
  useEffect(() => {
    if (!configSource) return
    setRun({
      samplingFps: configSource.sampling_fps ?? DEFAULT_RUN.samplingFps,
      threshold: configSource.threshold ?? DEFAULT_RUN.threshold,
      reviewFloor: configSource.review_floor ?? DEFAULT_RUN.reviewFloor,
      conditions: configSource.conditions?.length ? configSource.conditions : DEFAULT_RUN.conditions,
      sensorAssist: configSource.sensor_assist ?? DEFAULT_RUN.sensorAssist,
      model: modelOf(configSource),
    })
    // Only when a different run is loaded, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey])

  // New footage or condition: back to the first frame.
  useEffect(() => {
    setFrameIndex(0)
    setSelectedKey(null)
  }, [footageId, condition, display.reviewOnly])

  // Jump to a cited frame once its condition's frames are loaded.
  useEffect(() => {
    if (!pendingJump || pendingJump.condition !== condition) return
    const index = frames.findIndex((frame) => frame.frameNumber === pendingJump.frameNumber)
    if (index >= 0) {
      setFrameIndex(index)
      setPendingJump(null)
    } else if (!framesLoading) {
      setPendingJump(null)
    }
  }, [condition, frames, framesLoading, pendingJump])

  const safeIndex = Math.min(frameIndex, Math.max(0, frames.length - 1))
  const currentFrame = frames[safeIndex] ?? null
  const timestamp = currentFrame?.timestampSec ?? null

  const sensorSecond = useMemo(() => {
    if (!isRecording || timestamp === null) return null
    return recording.detail?.sensor_timeline?.find((s) => s.second === Math.floor(timestamp)) ?? null
  }, [isRecording, recording.detail, timestamp])

  const nearestEvent = useMemo(() => {
    if (!isUpload || timestamp === null) return null
    let best = null
    let bestGap = 2.0001
    for (const event of upload.events) {
      if (event.video_timestamp_seconds == null) continue
      const gap = Math.abs(event.video_timestamp_seconds - timestamp)
      if (gap < bestGap) {
        best = event
        bestGap = gap
      }
    }
    return best
  }, [isUpload, timestamp, upload.events])

  function selectFootage(id: string) {
    setSelectorOpen(false)
    if (id === footageId) return
    setFootageId(id)
    setOrigin(null)
    setDisplay((current) => ({ ...current, reviewOnly: false }))
    setError('')
  }

  async function runAnalysis() {
    if (!footage || !isUpload) return
    setBusy(true)
    setError('')
    try {
      await api(`/videos/${footage.id}/process`, token, {
        sampling_fps: run.samplingFps,
        threshold: run.threshold,
        review_floor: run.reviewFloor,
        conditions: run.conditions,
        sensor_assist: run.sensorAssist,
        model: run.model,
        // Only an explicit user action reprocesses; the backend otherwise returns the existing job.
        ...(job ? { reprocess: true } : {}),
      })
      sfx.play('processing')
      await Promise.all([upload.refreshStatus(), refreshVideos()])
      setNotice(job ? 'Reinvestigation queued as a new attempt.' : 'Analysis queued. Keep the worker running.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start analysis')
    } finally {
      setBusy(false)
    }
  }

  async function verifyUpload() {
    if (!footage) return
    setBusy(true)
    setError('')
    try {
      await api(`/videos/${footage.id}/upload-complete`, token, {})
      await refreshVideos()
      setNotice('Upload verified. Choose settings and run the analysis.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  async function review(frame: EvidenceFrame, decision: 'confirmed' | 'dismissed') {
    if (!frame.id) return
    setBusy(true)
    setError('')
    try {
      await api(`/frames/${frame.id}/reviews`, token, { decision, note: reviewNote.trim().slice(0, 1000) })
      upload.updateFrame(frame.key, { reviewStatus: decision })
      setReviewNote('')
      setNotice(`Review recorded as ${decision}. The original model confidence is preserved.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Review failed')
    } finally {
      setBusy(false)
    }
  }

  function jumpTo(target: Condition, frameNumber: number) {
    setDisplay((current) => ({ ...current, reviewOnly: false }))
    setPendingJump({ condition: target, frameNumber })
    setCondition(target)
  }

  function cite(citation: AssistantCitation) {
    jumpTo(citation.condition, citation.frame_number)
  }

  function selectDetection(key: string, index?: number) {
    if (index !== undefined) setFrameIndex(index)
    setSelectedKey((current) => (current === key ? null : key))
  }

  const conditionCounts: Partial<Record<Condition, number>> = isUpload
    ? Object.fromEntries(
        Object.entries(investigation?.metrics_json?.by_condition ?? {}).map(([c, stats]) => [c, stats?.detections ?? 0]),
      )
    : isRecording && recording.detail
      ? CONDITIONS.reduce<Partial<Record<Condition, number>>>((acc, c) => {
          acc[c] = recording.detail!.frames
            .filter((frame) => frame.visibility_condition === c)
            .reduce((sum, frame) => sum + frame.detections_json.filter((d) => d.accepted).length, 0)
          return acc
        }, {})
      : {}

  const emptyMessage = !footage
    ? ''
    : isUpload
      ? !video?.upload_verified
        ? 'Verify the upload before analysis.'
        : !job
          ? 'Run an analysis to sample frames and detect objects.'
          : job.status === 'queued'
            ? 'Queued. The worker claims jobs in order.'
            : job.status === 'processing'
              ? 'The worker is processing this video. Keep it running.'
              : job.status === 'failed'
                ? job.error_message || video.error_message || 'Processing failed.'
                : framesLoading
                  ? 'Loading frames…'
                  : display.reviewOnly
                    ? 'No frames pending review in this condition.'
                    : 'No frames stored for this condition.'
      : recording.loading
        ? 'Loading recording results…'
        : !recordingResult
          ? 'This recording has not been processed yet.'
          : recordingResult.status === 'failed'
            ? recordingResult.error_message || 'Processing failed.'
            : 'No frames for this condition.'

  const recordingStartMs = footage?.recording
    ? Date.parse(footage.recording.recorded_at)
    : video?.recording_started_at
      ? Date.parse(video.recording_started_at)
      : null

  const canRun = Boolean(isUpload && apiConfigured && video?.upload_verified && run.conditions.length > 0)
  const disabledReason = !apiConfigured
    ? 'Set API_URL in the root .env to enable analysis.'
    : isUpload && !video?.upload_verified
      ? 'Verify the upload first.'
      : ''

  return (
    <motion.main
      className="content-area vs-content"
      id="main-content"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}
    >
      <header className="vs-page-header">
        <div className="vs-page-copy">
          <div className="content-eyebrow">
            <span className="eyebrow-marker" aria-hidden="true" />
            Visual intelligence · detection under degraded visibility
          </div>
          <h1 className="content-heading">Vision Studio</h1>
          <p className="content-description">
            Inspect stored detections and tracks frame by frame across clear, low-light, fog and blur conditions. Every
            result comes from your footage and the pinned model.
          </p>
        </div>
        <div className="vs-page-actions">
          <div className="vs-system-status" aria-label="System status">
            <span className="vs-system-chip">
              <ScanEye size={13} aria-hidden="true" />
              <span>
                <small>Vision worker</small>
                <strong>
                  {runStatus === 'running' ? 'Processing' : runStatus === 'queued' ? 'Job queued' : 'Idle'}
                </strong>
              </span>
              <i className={`vs-system-light${runStatus === 'running' ? ' is-active' : ''}`} aria-hidden="true" />
            </span>
            <span className="vs-system-chip">
              <Workflow size={13} aria-hidden="true" />
              <span>
                <small>Job</small>
                <strong>{job ? `Attempt ${job.attempt} · ${job.status}` : isRecording ? 'Recordings processor' : 'None yet'}</strong>
              </span>
              <i className={`vs-system-light vs-system-light--purple${runStatus === 'queued' ? ' is-active' : ''}`} aria-hidden="true" />
            </span>
          </div>
          <button className="cc-button cc-button--primary vs-new-analysis" type="button" onClick={() => setSelectorOpen(true)}>
            <Plus size={15} aria-hidden="true" />
            Choose footage
          </button>
        </div>
      </header>

      {error && (
        <p className="nw-inline-error" role="alert">
          {error} <button type="button" className="nw-inline-dismiss" onClick={() => setError('')}>Dismiss</button>
        </p>
      )}
      {upload.statusError && <p className="nw-inline-error" role="alert">Status: {upload.statusError}</p>}
      {(upload.framesError || recording.error) && (
        <p className="nw-inline-error" role="alert">{upload.framesError || recording.error}</p>
      )}

      <div className="vs-layout">
        <div className="vs-main-column">
          <FootageSelector
            footage={footage}
            options={allFootage}
            open={selectorOpen}
            origin={origin}
            onOpenChange={setSelectorOpen}
            onSelect={(item) => selectFootage(item.id)}
          />

          <section className="cc-panel vs-panel vs-workspace-panel" aria-labelledby="vs-workspace-heading">
            <SectionHeader
              eyebrow="Main vision workspace"
              title={footage ? `${footage.deviceId ?? 'Upload'} · evidence review` : 'Vision workspace'}
              titleId="vs-workspace-heading"
              action={
                footage ? (
                  <span className="vs-workspace-badges">
                    {findings && <StatusBadge tone={humanTone[findings.headline]}>{humanLabels[findings.headline]}</StatusBadge>}
                    <StatusBadge tone={condition === 'clear' ? 'muted' : 'amber'}>{conditionLabels[condition]}</StatusBadge>
                    <StatusBadge tone="purple">{frames.length} frames</StatusBadge>
                  </span>
                ) : undefined
              }
            />

            {footage ? (
              <>
                {availableConditions.length > 1 && (
                  <div className="vs-condition-tabs" role="tablist" aria-label="Visibility condition">
                    {availableConditions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="tab"
                        aria-selected={item === condition}
                        onClick={() => setCondition(item)}
                      >
                        {conditionLabels[item]}
                        {conditionCounts[item] !== undefined && <span>{conditionCounts[item]}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {isUpload && !video?.upload_verified && (
                  <div className="vs-inline-action">
                    <span>This upload has not been verified by the server yet.</span>
                    <button className="cc-button cc-button--quiet" type="button" disabled={busy} onClick={verifyUpload}>
                      <ShieldCheck size={14} aria-hidden="true" /> Verify upload
                    </button>
                  </div>
                )}

                <SurveillanceFrame
                  frame={currentFrame}
                  sourceWidth={video?.width ?? footage.recording?.width ?? null}
                  sourceHeight={video?.height ?? footage.recording?.height ?? null}
                  minConfidence={display.minConfidence}
                  showTracks={display.showTracks}
                  selectedKey={selectedKey}
                  runStatus={runStatus}
                  sourceLabel={footage.categoryLabel}
                  deviceLabel={footage.deviceId ?? 'UPLOAD'}
                  recordingStartMs={recordingStartMs}
                  emptyMessage={emptyMessage}
                  onSelectDetection={(key) => selectDetection(key)}
                />
                <EvidenceTimeline
                  frames={frames}
                  durationSec={footage.durationSeconds ?? 0}
                  frameIndex={safeIndex}
                  minConfidence={display.minConfidence}
                  onSelectFrame={(index) => {
                    setFrameIndex(Math.max(0, Math.min(frames.length - 1, index)))
                    setSelectedKey(null)
                  }}
                />

                {currentFrame?.reviewRequired && currentFrame.id && (
                  <div className="vs-review-bar" role="group" aria-label="Review this frame">
                    <span>
                      <strong>Review candidate</strong>
                      {currentFrame.reviewReason ?? 'Observation in the review band'} · status{' '}
                      <em>{currentFrame.reviewStatus}</em>
                    </span>
                    <input
                      className="vs-review-note"
                      type="text"
                      maxLength={1000}
                      placeholder="Optional note for the review record"
                      aria-label="Review note"
                      value={reviewNote}
                      disabled={busy}
                      onChange={(event) => setReviewNote(event.currentTarget.value)}
                    />
                    <button
                      className="cc-button cc-button--quiet"
                      type="button"
                      disabled={busy || currentFrame.reviewStatus === 'confirmed'}
                      onClick={() => review(currentFrame, 'confirmed')}
                    >
                      <CheckCircle2 size={14} aria-hidden="true" /> Confirm
                    </button>
                    <button
                      className="cc-button cc-button--quiet"
                      type="button"
                      disabled={busy || currentFrame.reviewStatus === 'dismissed'}
                      onClick={() => review(currentFrame, 'dismissed')}
                    >
                      <XCircle size={14} aria-hidden="true" /> Dismiss
                    </button>
                  </div>
                )}

                <SourcePlayback
                  token={token}
                  videoId={isUpload && video?.upload_verified ? footage.id : null}
                  clipPath={isRecording ? (recording.detail?.annotated_clips?.[condition] ?? null) : null}
                  condition={condition}
                  timestampSec={timestamp}
                />

                <div className={`vs-run-progress${runStatus === 'running' || runStatus === 'queued' || framesLoading ? '' : ' is-idle'}`}>
                  <span>
                    {runStatus === 'queued'
                      ? 'Waiting for the worker'
                      : runStatus === 'running'
                        ? 'Worker processing'
                        : framesLoading
                          ? `Loading frames · ${frames.length} so far`
                          : currentFrame
                            ? `${currentFrame.modelVersion ?? 'model'} · ${currentFrame.inferenceMs?.toFixed(0) ?? '—'} ms inference · ${formatPreciseTime(currentFrame.timestampSec)}`
                            : 'Ready'}
                  </span>
                  <div className={`vs-run-progress-track${runStatus === 'running' || runStatus === 'queued' || framesLoading ? ' is-indeterminate' : ''}`}>
                    <span style={{ transform: `scaleX(${runStatus === 'complete' && !framesLoading ? 1 : 0.35})` }} />
                  </div>
                </div>
              </>
            ) : (
              <div className="vs-empty vs-workspace-empty">
                <span className="vs-empty-icon"><ScanEye size={22} aria-hidden="true" /></span>
                <strong>Select footage to open the vision workspace</strong>
                <p>Frames, detection overlays and the evidence timeline appear once a clip is chosen.</p>
                <button className="cc-button cc-button--primary" type="button" onClick={() => setSelectorOpen(true)}>
                  Select footage
                </button>
              </div>
            )}
          </section>

          <DetectionResults
            frames={frames}
            condition={condition}
            minConfidence={display.minConfidence}
            threshold={configSource?.threshold ?? null}
            runStatus={runStatus}
            loading={framesLoading}
            selectedKey={selectedKey}
            onSelect={selectDetection}
          />
        </div>

        <aside className="vs-side-column" aria-label="Analysis controls and pipeline activity">
          {footage && <FindingsPanel findings={findings} onJump={jumpTo} />}
          <DetectionConfigPanel
            mode={isRecording ? 'recording' : 'upload'}
            run={run}
            onRunChange={(patch) => setRun((current) => ({ ...current, ...patch }))}
            display={display}
            onDisplayChange={(patch) => setDisplay((current) => ({ ...current, ...patch }))}
            runStatus={runStatus}
            hasPreviousJob={Boolean(job)}
            canRun={canRun}
            disabledReason={footage ? disabledReason : 'Select footage to enable the analysis.'}
            busy={busy}
            modelVersion={currentFrame?.modelVersion ?? video?.model_version ?? recordingResult?.model_version ?? null}
            onRun={runAnalysis}
          />
          {isRecording ? (
            <RecordingVerdict result={recordingResult} />
          ) : isUpload ? (
            <EvidenceReport videoId={footage.id} token={token} investigation={investigation} onCite={cite} />
          ) : null}
          <PipelineStages
            runStatus={runStatus}
            video={video}
            job={job}
            investigation={investigation}
            recording={footage?.recording ?? null}
            recordingResult={recording.detail}
          />
          <SensorReadings
            mode={isRecording ? 'recording' : isUpload ? 'upload' : 'none'}
            timestampSec={timestamp}
            second={sensorSecond}
            event={nearestEvent}
            footer={
              isUpload && video?.upload_verified && !video.device_id ? (
                <DeviceLinkForm
                  videoId={footage.id}
                  token={token}
                  devices={devices.data}
                  onLinked={() => {
                    refreshVideos()
                    upload.reloadFrames()
                  }}
                />
              ) : isUpload && video?.device_id ? (
                <p className="cc-panel-footnote">Linked to {video.device_id}.</p>
              ) : undefined
            }
          />
        </aside>
      </div>

      <footer className="vs-page-footer">
        <span>NightWatch · Vision Studio</span>
        <span>
          <Info size={12} aria-hidden="true" /> Prototype evaluation · not safety-certified · does not replace rescuers
        </span>
      </footer>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="cc-toast"
            role="status"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <span className="cc-toast-icon"><ScanEye size={14} aria-hidden="true" /></span>
            <span>{notice}</span>
            <button type="button" className="vs-toast-close" aria-label="Dismiss notice" onClick={() => setNotice('')}>
              <X size={14} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  )
}
