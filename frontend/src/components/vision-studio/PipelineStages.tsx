import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CloudUpload, Cpu, Database, Radar, ShieldCheck, Workflow, X, type LucideIcon } from 'lucide-react'
import { SectionHeader } from '../common/SectionHeader'
import { StatusBadge } from '../common/StatusBadge'
import type { Investigation, Job, Video } from '../../lib/api'
import { conditionLabels } from '../../lib/footage'
import { verdictLabels, type Recording, type RecordingResultDetail } from '../../lib/recordings'
import type { RunStatus } from './analysis'

type StageState = 'Waiting' | 'Working' | 'Complete' | 'Failed'

interface Stage {
  id: string
  name: string
  role: string
  state: StageState
  Icon: LucideIcon
}

interface LogEntry {
  id: string
  at: string
  source: string
  text: string
}

const stateTone = { Waiting: 'muted', Working: 'cyan', Complete: 'purple', Failed: 'pink' } as const

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatTime(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '--:--:--' : timeFormatter.format(date)
}

function uploadPipeline(video: Video, job: Job | null, investigation: Investigation | null | undefined) {
  const failed = job?.status === 'failed' || video.status === 'failed'
  const stages: Stage[] = [
    {
      id: 'verify',
      name: 'Upload verified',
      role: 'Server re-hashes the stored bytes and probes the container',
      state: video.upload_verified ? 'Complete' : failed && !job ? 'Failed' : 'Waiting',
      Icon: ShieldCheck,
    },
    {
      id: 'queue',
      name: 'Job queued',
      role: 'Idempotent job; retries return the existing one',
      state: !job ? 'Waiting' : 'Complete',
      Icon: CloudUpload,
    },
    {
      id: 'worker',
      name: 'Worker inference',
      role: 'FFmpeg sampling, YOLO11n and ByteTrack per condition',
      state: !job || job.status === 'queued' ? 'Waiting' : job.status === 'processing' ? 'Working' : job.status === 'failed' ? 'Failed' : 'Complete',
      Icon: Cpu,
    },
    {
      id: 'store',
      name: 'Results stored',
      role: 'Frames, detections and aggregates written to Supabase',
      state: job?.status === 'completed' ? 'Complete' : job?.status === 'failed' ? 'Failed' : 'Waiting',
      Icon: Database,
    },
  ]
  if (job?.status === 'queued') stages[1].state = 'Working'

  const log: LogEntry[] = [
    { id: 'u', at: video.uploaded_at, source: 'API', text: `Upload reserved for ${video.original_filename}` },
  ]
  if (video.upload_verified) {
    const dims = video.width && video.height ? `, ${video.width}×${video.height}` : ''
    const length = video.duration_seconds ? `${video.duration_seconds.toFixed(1)} s` : 'duration measured'
    log.push({ id: 'v', at: video.uploaded_at, source: 'API', text: `Size, SHA-256 and container verified (${length}${dims})` })
  }
  if (job) {
    const conditions = (job.config.conditions ?? []).map((c) => conditionLabels[c]).join(', ')
    log.push({
      id: 'q',
      at: job.created_at,
      source: 'Queue',
      text: `Attempt ${job.attempt} queued · ${job.config.sampling_fps ?? 5} fps · threshold ${Math.round((job.config.threshold ?? 0.75) * 100)}% · ${conditions}${job.config.sensor_assist === false ? ' · sensors off' : ' · sensor-assisted'}`,
    })
    if (job.started_at) log.push({ id: 's', at: job.started_at, source: 'Worker', text: 'Worker claimed the job and started sampling' })
    if (job.status === 'processing' && job.heartbeat_at) {
      log.push({ id: 'h', at: job.heartbeat_at, source: 'Worker', text: 'Heartbeat received · still processing' })
    }
    if (job.finished_at) {
      log.push({
        id: 'f',
        at: job.finished_at,
        source: job.status === 'failed' ? 'Error' : 'Store',
        text:
          job.status === 'failed'
            ? `Failed: ${job.error_message ?? video.error_message ?? 'see status'}`
            : investigation
              ? `Stored ${investigation.total_frames} condition-frames · ${investigation.total_detections} accepted observations`
              : 'Results stored',
      })
    }
  }
  return { stages, log }
}

function recordingPipeline(recording: Recording, result: RecordingResultDetail | null) {
  const processed = result?.status === 'completed'
  const failed = result?.status === 'failed'
  const stages: Stage[] = [
    { id: 'rec', name: 'Captured', role: 'Arduino camera and Modulino sensors', state: 'Complete', Icon: Radar },
    { id: 'up', name: 'Uploaded by device', role: 'Video plus one sensor reading per second', state: 'Complete', Icon: CloudUpload },
    {
      id: 'det',
      name: 'YOLO11n + ByteTrack',
      role: 'Run by the local recordings processor',
      state: processed ? 'Complete' : failed ? 'Failed' : 'Waiting',
      Icon: Cpu,
    },
    {
      id: 'fuse',
      name: 'Sensor fusion',
      role: 'Rules-based corroboration; heuristics, not measured accuracy',
      state: processed && result?.verdict ? 'Complete' : failed ? 'Failed' : 'Waiting',
      Icon: Workflow,
    },
  ]
  const log: LogEntry[] = [
    { id: 'r', at: recording.recorded_at, source: 'Device', text: `Recorded by ${recording.device_id}` },
    { id: 'u', at: recording.uploaded_at, source: 'Device', text: 'Video and sensor series uploaded' },
  ]
  if (result) {
    log.push({
      id: 'p',
      at: result.processed_at,
      source: failed ? 'Error' : 'Processor',
      text: failed
        ? `Failed: ${result.error_message ?? 'unknown error'}`
        : `Processed ${result.total_frames ?? 0} condition-frames · ${result.total_detections ?? 0} accepted detections`,
    })
    if (result.verdict) {
      log.push({ id: 'v', at: result.processed_at, source: 'Fusion', text: `Verdict: ${verdictLabels[result.verdict]} (${result.review_priority} priority)` })
    }
  }
  return { stages, log }
}

interface PipelineStagesProps {
  runStatus: RunStatus
  video?: Video | null
  job?: Job | null
  investigation?: Investigation | null
  recording?: Recording | null
  recordingResult?: RecordingResultDetail | null
}

export function PipelineStages({ runStatus, video, job, investigation, recording, recordingResult }: PipelineStagesProps) {
  const reduceMotion = useReducedMotion() ?? false
  const pipeline = video
    ? uploadPipeline(video, job ?? null, investigation)
    : recording
      ? recordingPipeline(recording, recordingResult ?? null)
      : null
  const log = pipeline ? [...pipeline.log].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) : []

  return (
    <section className="cc-panel vs-panel vs-agents-panel" aria-labelledby="vs-agents-heading">
      <SectionHeader
        eyebrow="Processing pipeline · live"
        title="Pipeline activity"
        titleId="vs-agents-heading"
        action={
          <StatusBadge
            tone={runStatus === 'running' || runStatus === 'queued' ? 'cyan' : runStatus === 'complete' ? 'purple' : runStatus === 'failed' ? 'pink' : 'muted'}
            pulse={runStatus === 'running'}
          >
            <Workflow size={12} aria-hidden="true" />
            {runStatus === 'running' ? 'Processing' : runStatus === 'queued' ? 'Queued' : runStatus === 'complete' ? 'Complete' : runStatus === 'failed' ? 'Failed' : 'Idle'}
          </StatusBadge>
        }
      />

      {!pipeline ? (
        <p className="vs-agent-log-empty">Select footage to see its processing history.</p>
      ) : (
        <>
          <ol className="vs-agent-steps">
            {pipeline.stages.map((stage, index) => (
              <li key={stage.id} className={`vs-agent-step vs-agent-step--${stage.state === 'Failed' ? 'waiting' : stage.state.toLowerCase()}${stage.state === 'Failed' ? ' is-failed' : ''}`}>
                <span className="vs-agent-node" aria-hidden="true">
                  {stage.state === 'Complete' ? <Check size={13} /> : stage.state === 'Failed' ? <X size={13} /> : <stage.Icon size={13} />}
                </span>
                <div className="vs-agent-body">
                  <div className="vs-agent-title-row">
                    <strong>
                      <span className="vs-agent-index">{String(index + 1).padStart(2, '0')}</span>
                      {stage.name}
                    </strong>
                    <StatusBadge tone={stateTone[stage.state]} pulse={stage.state === 'Working'}>{stage.state}</StatusBadge>
                  </div>
                  <p>{stage.role}</p>
                  <div className="vs-agent-meter" aria-hidden="true">
                    <motion.span
                      initial={false}
                      animate={{ scaleX: stage.state === 'Complete' || stage.state === 'Failed' ? 1 : stage.state === 'Working' ? 0.5 : 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="vs-agent-log" aria-live="polite" aria-relevant="additions">
            <div className="vs-agent-log-head">
              <span>Event log</span>
              <span>{log.length} events</span>
            </div>
            <ul>
              <AnimatePresence initial={false}>
                {log.map((entry) => (
                  <motion.li
                    key={entry.id}
                    initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  >
                    <span className="vs-log-time">{formatTime(entry.at)}</span>
                    <span className={`vs-log-agent vs-log-agent--${entry.source === 'Error' ? 'error' : 'vision'}`}>{entry.source}</span>
                    <span className="vs-log-text">{entry.text}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
