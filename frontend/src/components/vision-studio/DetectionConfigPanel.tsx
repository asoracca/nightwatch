import { useId, type CSSProperties } from 'react'
import { CloudFog, Cpu, Eye, Play, Radar, RotateCcw, Route, SlidersHorizontal, Sparkles, Timer } from 'lucide-react'
import { SectionHeader } from '../common/SectionHeader'
import { StatusBadge } from '../common/StatusBadge'
import { MODELS, type Condition, type ModelName } from '../../lib/api'
import { conditionLabels } from '../../lib/footage'
import type { RunStatus } from './analysis'

/** Mirrors backend ProcessConfig: 0.5 ≤ fps ≤ 10, 0.40 ≤ threshold ≤ 1, 0.10 ≤ floor ≤ 0.75, floor < threshold. */
export interface RunSettings {
  samplingFps: number
  threshold: number
  reviewFloor: number
  conditions: Condition[]
  /** Distance, movement and thermal readings adjust person scores before ByteTrack. */
  sensorAssist: boolean
  model: ModelName
}

export interface DisplaySettings {
  minConfidence: number
  showTracks: boolean
  reviewOnly: boolean
}

export const DEFAULT_RUN: RunSettings = {
  samplingFps: 5,
  threshold: 0.75,
  reviewFloor: 0.4,
  conditions: ['clear', 'low_light', 'fog', 'blurry'],
  sensorAssist: true,
  model: 'yolo11m',
}

const fpsOptions = [1, 2, 5, 10]
const degradations: Condition[] = ['low_light', 'fog', 'blurry']

interface DetectionConfigPanelProps {
  mode: 'upload' | 'recording'
  run: RunSettings
  onRunChange: (patch: Partial<RunSettings>) => void
  display: DisplaySettings
  onDisplayChange: (patch: Partial<DisplaySettings>) => void
  runStatus: RunStatus
  /** A previous job exists, so starting again is an explicit reprocess. */
  hasPreviousJob: boolean
  canRun: boolean
  disabledReason: string
  busy: boolean
  modelVersion: string | null
  onRun: () => void
}

interface ToggleProps {
  label: string
  detail: string
  checked: boolean
  disabled?: boolean
  icon: typeof Route
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, detail, checked, disabled = false, icon: Icon, onChange }: ToggleProps) {
  const id = useId()
  return (
    <div className="vs-toggle-row">
      <span className="vs-toggle-icon" aria-hidden="true"><Icon size={14} /></span>
      <span className="vs-toggle-copy">
        <label htmlFor={id}>{label}</label>
        <span>{detail}</span>
      </span>
      <button
        id={id}
        className="vs-switch"
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="vs-switch-thumb" />
      </button>
    </div>
  )
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

export function DetectionConfigPanel({
  mode,
  run,
  onRunChange,
  display,
  onDisplayChange,
  runStatus,
  hasPreviousJob,
  canRun,
  disabledReason,
  busy,
  modelVersion,
  onRun,
}: DetectionConfigPanelProps) {
  const thresholdId = useId()
  const floorId = useId()
  const displayId = useId()
  const active = runStatus === 'queued' || runStatus === 'running'
  const locked = active || busy || mode === 'recording'
  const frames = (seconds: number) => Math.ceil(seconds * run.samplingFps) * run.conditions.length

  return (
    <section className="cc-panel vs-panel vs-config-panel" aria-labelledby="vs-config-heading">
      <SectionHeader
        eyebrow={mode === 'recording' ? 'Stored processor settings' : 'Pipeline parameters'}
        title="Detection configuration"
        titleId="vs-config-heading"
        action={<SlidersHorizontal size={15} className="vs-header-icon" aria-hidden="true" />}
      />

      <fieldset className="vs-field vs-fieldset" disabled={locked}>
        <legend className="vs-field-label"><Cpu size={12} aria-hidden="true" /> Detection model · + ByteTrack</legend>
        <div className="vs-model-options">
          {(Object.keys(MODELS) as ModelName[]).map((name) => (
            <label key={name} className={`vs-model-option${run.model === name ? ' is-selected' : ''}`}>
              <input type="radio" name="vs-model" value={name} checked={run.model === name} onChange={() => onRunChange({ model: name })} />
              <span className="vs-model-name">
                {MODELS[name].label}
                {run.model === name && modelVersion && <StatusBadge tone="cyan">{modelVersion.split(':')[0]}</StatusBadge>}
              </span>
              <span className="vs-model-detail">{MODELS[name].note}</span>
            </label>
          ))}
        </div>
        <p className="vs-field-hint">Official weights pinned by SHA-256; the worker downloads and verifies them on first use.</p>
      </fieldset>

      <fieldset className="vs-field vs-fieldset" disabled={locked}>
        <legend className="vs-field-label"><Timer size={12} aria-hidden="true" /> Frame sampling</legend>
        <div className="vs-segmented" role="radiogroup" aria-label="Sampled frames per second">
          {fpsOptions.map((fps) => (
            <button
              key={fps}
              type="button"
              role="radio"
              aria-checked={run.samplingFps === fps}
              onClick={() => onRunChange({ samplingFps: fps })}
            >
              {fps} fps
            </button>
          ))}
        </div>
        <p className="vs-field-hint">
          {mode === 'recording'
            ? 'Set when the recordings processor ran.'
            : `≈ ${frames(60).toLocaleString()} condition-frames per minute of footage. All conditions share one schedule.`}
        </p>
      </fieldset>

      <fieldset className="vs-field vs-fieldset" disabled={locked}>
        <div className="vs-field-row">
          <label className="vs-field-label" htmlFor={thresholdId}>Accepted threshold</label>
          <output className="vs-threshold-value" htmlFor={thresholdId}>{pct(run.threshold)}</output>
        </div>
        <input
          id={thresholdId}
          className="vs-range"
          type="range"
          min={40}
          max={100}
          step={1}
          value={Math.round(run.threshold * 100)}
          style={{ '--vs-range-fill': `${((run.threshold * 100 - 40) / 60) * 100}%` } as CSSProperties}
          onChange={(event) => {
            const threshold = Number(event.currentTarget.value) / 100
            onRunChange({ threshold, reviewFloor: Math.min(run.reviewFloor, Math.min(0.75, threshold - 0.01)) })
          }}
        />
        <div className="vs-field-row">
          <label className="vs-field-label" htmlFor={floorId}>Review floor</label>
          <output className="vs-threshold-value" htmlFor={floorId}>{pct(run.reviewFloor)}</output>
        </div>
        <input
          id={floorId}
          className="vs-range"
          type="range"
          min={10}
          max={Math.min(75, Math.round(run.threshold * 100) - 1)}
          step={1}
          value={Math.round(run.reviewFloor * 100)}
          style={{ '--vs-range-fill': `${((run.reviewFloor * 100 - 10) / 65) * 100}%` } as CSSProperties}
          onChange={(event) => onRunChange({ reviewFloor: Number(event.currentTarget.value) / 100 })}
        />
        <p className="vs-field-hint">
          ≥ {pct(run.threshold)} counts as accepted; {pct(run.reviewFloor)}–{pct(run.threshold)} is kept as a review
          candidate.
        </p>
      </fieldset>

      <fieldset className="vs-field vs-fieldset" disabled={locked}>
        <legend className="vs-field-label"><CloudFog size={12} aria-hidden="true" /> Visibility conditions</legend>
        <ToggleRow label="Clear" detail="Original footage · always included" checked disabled icon={Eye} onChange={() => undefined} />
        {degradations.map((condition) => (
          <ToggleRow
            key={condition}
            label={conditionLabels[condition]}
            detail="Synthetic, controlled degradation"
            checked={run.conditions.includes(condition)}
            icon={Sparkles}
            onChange={(on) =>
              onRunChange({
                conditions: on
                  ? [...run.conditions, condition]
                  : run.conditions.filter((item) => item !== condition),
              })
            }
          />
        ))}
      </fieldset>

      <fieldset className="vs-field vs-fieldset" disabled={locked}>
        <legend className="vs-field-label"><Radar size={12} aria-hidden="true" /> Sensor fusion</legend>
        <ToggleRow
          label="Sensor-assisted tracking"
          detail="Distance, movement and thermal readings adjust person scores before ByteTrack"
          checked={run.sensorAssist}
          icon={Radar}
          onChange={(sensorAssist) => onRunChange({ sensorAssist })}
        />
        <p className="vs-field-hint">
          {mode === 'recording'
            ? 'Arduino recordings carry one reading per second. Boosts: distance +0.15, scene motion +0.10, camera shake / humidity / heat +0.05 each, capped at +0.25. Raw model scores are kept.'
            : 'Needs sensor data: link the video to a device (Sensor readings panel). Without readings, results are unchanged. Raw model scores are always kept.'}
        </p>
      </fieldset>

      <div className="vs-field">
        <span className="vs-field-label"><Eye size={12} aria-hidden="true" /> Display</span>
        <div className="vs-field-row">
          <label className="vs-field-label" htmlFor={displayId}>Minimum shown confidence</label>
          <output className="vs-threshold-value" htmlFor={displayId}>{pct(display.minConfidence)}</output>
        </div>
        <input
          id={displayId}
          className="vs-range"
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(display.minConfidence * 100)}
          style={{ '--vs-range-fill': `${((display.minConfidence * 100 - 10) / 90) * 100}%` } as CSSProperties}
          onChange={(event) => onDisplayChange({ minConfidence: Number(event.currentTarget.value) / 100 })}
        />
        <ToggleRow
          label="Track IDs"
          detail="Label boxes with ByteTrack IDs"
          checked={display.showTracks}
          icon={Route}
          onChange={(showTracks) => onDisplayChange({ showTracks })}
        />
        {mode === 'upload' && (
          <ToggleRow
            label="Pending review only"
            detail="Frames with an unreviewed review-band observation"
            checked={display.reviewOnly}
            icon={SlidersHorizontal}
            onChange={(reviewOnly) => onDisplayChange({ reviewOnly })}
          />
        )}
        <p className="vs-field-hint">Display settings never change stored results.</p>
      </div>

      {mode === 'upload' && (
        <div className="vs-run-row">
          <button
            className="cc-button cc-button--primary vs-run-button"
            type="button"
            disabled={!canRun || active || busy}
            onClick={onRun}
          >
            {hasPreviousJob ? <RotateCcw size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {active ? (runStatus === 'queued' ? 'Queued…' : 'Processing…') : hasPreviousJob ? 'Reinvestigate with these settings' : 'Run analysis'}
          </button>
          {hasPreviousJob && !active && (
            <p className="vs-field-hint">Reinvestigating creates a new attempt; earlier results and reviews stay stored.</p>
          )}
          {!canRun && disabledReason && <p className="vs-field-hint">{disabledReason}</p>}
        </div>
      )}
    </section>
  )
}
