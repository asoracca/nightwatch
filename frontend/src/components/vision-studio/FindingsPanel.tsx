import { Crosshair, ShieldQuestion, UserCheck, UserX } from 'lucide-react'
import { SectionHeader } from '../common/SectionHeader'
import { StatusBadge } from '../common/StatusBadge'
import { CONDITIONS, type ClassFindings, type Condition, type Findings } from '../../lib/api'
import { conditionLabels, humanTone } from '../../lib/footage'

const icons = { humans_found: UserCheck, possible_humans: ShieldQuestion, no_humans_found: UserX }

const pct = (value: number) => `${Math.round(value * 100)}%`
const seconds = (value: number) => `${value.toFixed(1)} s`
const span = ([a, b]: [number, number]) => (a === b ? seconds(a) : `${a.toFixed(1)}–${b.toFixed(1)} s`)

interface FindingsPanelProps {
  findings: Findings | null | undefined
  /** Jump to a frame (condition + sample number) in the vision workspace. */
  onJump?: (condition: Condition, frameNumber: number) => void
  compact?: boolean
}

function ClassTable({ stats }: { stats: ClassFindings }) {
  const rows = CONDITIONS.filter((c) => stats.by_condition[c])
  return (
    <table className="vs-compare-table">
      <caption>Per condition · accepted / review-band observations</caption>
      <thead>
        <tr>
          <th scope="col">Condition</th><th scope="col">Accepted</th><th scope="col">Review</th><th scope="col">Frames</th>
          <th scope="col">Tracks</th><th scope="col">Best</th><th scope="col">Seen</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const s = stats.by_condition[c]!
          return (
            <tr key={c}>
              <th scope="row">{conditionLabels[c]}</th>
              <td>{s.accepted}</td>
              <td>{s.review}</td>
              <td>{s.frames}</td>
              <td>{s.tracks}</td>
              <td>{pct(s.max_confidence)}</td>
              <td>{span([s.first_seen_s, s.last_seen_s])}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function FindingsPanel({ findings, onJump, compact = false }: FindingsPanelProps) {
  if (!findings) {
    return (
      <section className="cc-panel vs-panel vs-findings" aria-labelledby="vs-findings-heading">
        <SectionHeader eyebrow="Findings" title="What was found" titleId="vs-findings-heading" />
        <p className="cc-panel-footnote">Findings appear when an analysis completes. Older runs: reinvestigate to add them.</p>
      </section>
    )
  }
  const Icon = icons[findings.headline]
  const people = findings.people
  const others = findings.objects.filter((o) => o.label !== 'person')

  return (
    <section className="cc-panel vs-panel vs-findings" aria-labelledby="vs-findings-heading">
      <SectionHeader
        eyebrow="Findings · all conditions"
        title="What was found"
        titleId="vs-findings-heading"
        action={<StatusBadge tone={humanTone[findings.headline]}>{findings.headline_text}</StatusBadge>}
      />
      <div className={`vs-headline vs-headline--${findings.headline}`} role="status">
        <Icon size={26} aria-hidden="true" />
        <div>
          <strong>{findings.headline_text}</strong>
          <p>{findings.detail}</p>
        </div>
      </div>

      {people && (
        <div className="vs-findings-block">
          <span className="vs-field-label">People</span>
          <dl className="vs-report-stats vs-report-stats--3">
            <div><dt>Accepted observations</dt><dd>{people.accepted}</dd></div>
            <div><dt>Review-band observations</dt><dd>{people.review}</dd></div>
            <div><dt>Max tracks in one condition</dt><dd>{people.max_tracks}</dd></div>
            <div><dt>Best confidence</dt><dd>{pct(people.max_confidence)}{people.max_model_confidence !== people.max_confidence ? ` (model ${pct(people.max_model_confidence)})` : ''}</dd></div>
            <div><dt>First · last seen</dt><dd>{seconds(people.first_seen_s)} · {seconds(people.last_seen_s)}</dd></div>
            <div><dt>Sensor-assisted</dt><dd>{people.sensor_assisted}</dd></div>
          </dl>
          <p className="vs-findings-line">
            <strong>Visible at:</strong> {people.segments.map(span).join(', ')}
          </p>
          <button
            type="button"
            className="cc-button cc-button--quiet vs-findings-jump"
            disabled={!onJump}
            onClick={() => onJump?.(people.best.condition, people.best.frame_number)}
          >
            <Crosshair size={13} aria-hidden="true" />
            Best evidence: {conditionLabels[people.best.condition]} · {seconds(people.best.timestamp_seconds)} · {pct(people.best.confidence)}
            {people.best.track_id !== null ? ` · track #${people.best.track_id}` : ''}
          </button>
          {!compact && <ClassTable stats={people} />}
        </div>
      )}

      {others.length > 0 && (
        <div className="vs-findings-block">
          <span className="vs-field-label">Other objects</span>
          <div className="vs-table-scroll">
            <table className="vs-compare-table">
              <thead>
                <tr>
                  <th scope="col">Object</th><th scope="col">Accepted</th><th scope="col">Review</th><th scope="col">Best</th>
                  <th scope="col">Conditions</th><th scope="col">Seen</th><th scope="col" aria-label="Jump" />
                </tr>
              </thead>
              <tbody>
                {others.map((o) => (
                  <tr key={o.label}>
                    <th scope="row">{o.label}</th>
                    <td>{o.accepted}</td>
                    <td>{o.review}</td>
                    <td>{pct(o.max_confidence)}</td>
                    <td>{o.conditions.map((c) => conditionLabels[c]).join(', ')}</td>
                    <td>{o.segments.slice(0, 3).map(span).join(', ')}{o.segments.length > 3 ? '…' : ''}</td>
                    <td>
                      {onJump && (
                        <button type="button" className="vs-link-button" onClick={() => onJump(o.best.condition, o.best.frame_number)}>
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="cc-panel-footnote">
        Accepted ≥ {pct(findings.thresholds.accepted)}; review band {pct(findings.thresholds.review_floor)}–{pct(findings.thresholds.accepted)}.
        Track IDs are per condition and are not unique people. No detection never proves absence.
      </p>
    </section>
  )
}
