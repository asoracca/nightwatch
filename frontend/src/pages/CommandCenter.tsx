import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Cpu,
  Database,
  KeyRound,
  Plus,
  Radio,
  ScanEye,
  Server,
  Workflow,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { Link, useNavigate } from 'react-router-dom'
import { SectionHeader } from '../components/common/SectionHeader'
import { StatusBadge, type StatusTone } from '../components/common/StatusBadge'
import { ActivityFeed, timeAgo, type ActivityItem } from '../components/dashboard/ActivityFeed'
import { DeviceNetwork } from '../components/dashboard/DeviceNetwork'
import { InvestigationCard } from '../components/dashboard/InvestigationCard'
import { StatCard, type DashboardMetric } from '../components/dashboard/StatCard'
import { VisibilityImpact } from '../components/dashboard/VisibilityImpact'
import { buildReport } from '../components/reports/reportModel'
import { apiConfigured, type Investigation } from '../lib/api'
import { useAuth } from '../lib/auth'
import { humanStatus } from '../lib/footage'
import { verdictLabels } from '../lib/recordings'
import { useWorkspace } from '../lib/workspace'
import './CommandCenter.css'
import './DataVault.css'

function getGreeting(hour: number, name: string) {
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `Good ${part}, ${name}.`
}

export default function CommandCenter() {
  const shouldReduceMotion = useReducedMotion() ?? false
  const navigate = useNavigate()
  const { displayName } = useAuth()
  const { footage, investigations, devices, events, recordings, videos, apiOnline } = useWorkspace()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  // Relative times only need minute precision; avoid re-rendering lists every second.
  const minute = Math.floor(now.getTime() / 60_000) * 60_000

  const reports = useMemo(() => footage.map((item) => buildReport(item, investigations)), [footage, investigations])
  const completedInvestigations = useMemo(
    () => Object.values(investigations).filter((value): value is Investigation => value !== null),
    [investigations],
  )

  const analyzed = footage.filter((item) => item.status === 'Analyzed').length
  const processing = footage.filter((item) => item.status === 'Processing').length
  const observations = reports.reduce((sum, report) => sum + (report.observations ?? 0), 0)
  const highPriority = reports.filter((report) => report.priority === 'high').length
  const humansFound = footage.filter((item) => humanStatus(item, investigations) === 'humans_found').length
  const humansPossible = footage.filter((item) => humanStatus(item, investigations) === 'possible_humans').length
  const enabledDevices = devices.data.filter((device) => device.enabled)
  const recentDeviceIds = new Set(
    events.data.filter((event) => minute - Date.parse(event.event_time) < 10 * 60_000).map((event) => event.device_id),
  )
  const onlineDevices = enabledDevices.filter((device) => recentDeviceIds.has(device.device_id)).length

  const metrics: DashboardMetric[] = [
    { id: 'footage', label: 'Footage analyzed', value: `${analyzed} / ${footage.length}`, detail: `${processing} processing now`, accent: 'cyan', Icon: ScanEye },
    { id: 'observations', label: 'Accepted observations', value: observations.toLocaleString(), detail: 'Not unique people', accent: 'purple', Icon: Activity },
    { id: 'devices', label: 'Devices online', value: `${onlineDevices} / ${enabledDevices.length}`, detail: 'Event in the last 10 min', accent: 'amber', Icon: Radio },
    { id: 'humans', label: 'Footage with humans found', value: String(humansFound).padStart(2, '0'), detail: `${humansPossible} possible · ${highPriority} high-priority recordings`, accent: 'pink', Icon: Workflow },
  ]

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = []
    for (const item of footage) {
      if (item.kind === 'upload' && item.video) {
        const v = item.video
        items.push({ id: `${v.id}:u`, kind: 'upload', title: 'Footage uploaded', text: v.original_filename, at: v.uploaded_at, state: v.upload_verified ? 'Complete' : 'Queued', footageId: v.id })
        if (v.status === 'processing' && v.processing_started_at) {
          items.push({ id: `${v.id}:p`, kind: 'upload', title: 'Worker processing', text: v.original_filename, at: v.processing_started_at, state: 'Working', footageId: v.id })
        }
        if (v.processing_finished_at && (v.status === 'completed' || v.status === 'failed')) {
          const investigation = investigations[v.id]
          items.push({
            id: `${v.id}:f`,
            kind: v.status === 'failed' ? 'failure' : 'result',
            title: v.status === 'failed' ? 'Analysis failed' : 'Analysis complete',
            text: v.status === 'failed' ? v.error_message ?? v.original_filename : `${v.original_filename}${investigation ? ` · ${investigation.total_detections} observations` : ''}`,
            at: v.processing_finished_at,
            state: 'Complete',
            footageId: v.id,
          })
        }
      } else if (item.recording) {
        const r = item.recording
        items.push({ id: `${r.id}:r`, kind: 'recording', title: 'Arduino recording', text: `${r.device_id} uploaded a clip`, at: r.uploaded_at, state: r.result ? 'Complete' : 'Queued', footageId: r.id })
        if (r.result) {
          items.push({
            id: `${r.id}:v`,
            kind: r.result.status === 'failed' ? 'failure' : 'result',
            title: r.result.status === 'failed' ? 'Recording failed' : 'Recording processed',
            text: r.result.verdict ? `${verdictLabels[r.result.verdict]} · ${r.result.review_priority} priority` : r.result.error_message ?? 'Processed',
            at: r.result.processed_at,
            state: 'Complete',
            footageId: r.id,
          })
        }
      }
    }
    for (const event of events.data.slice(0, 15)) {
      const data = event.sensor_data_json ?? {}
      const readings = [
        data.distance_cm != null ? `${data.distance_cm} cm` : '',
        data.temperature_c != null ? `${data.temperature_c} °C` : '',
        data.motion ? 'motion' : '',
      ].filter(Boolean)
      items.push({
        id: `e:${event.id}`,
        kind: 'device',
        title: event.event_type.replaceAll('_', ' '),
        text: `${event.device_id}${readings.length ? ` · ${readings.join(' · ')}` : ''}`,
        at: event.event_time,
        state: 'Complete',
        footageId: event.linked_video_id ?? undefined,
      })
    }
    return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 8)
  }, [events.data, footage, investigations])

  const attention = reports
    .filter((report) => report.status === 'Processing' || report.priority === 'high' || report.status === 'Failed' || (report.reviewCandidates ?? 0) > 0)
    .slice(0, 4)
  const recentReports = attention.length ? attention : reports.slice(0, 4)

  const lastEvent = events.data[0]
  const integrations: { name: string; detail: string; state: string; tone: StatusTone; Icon: typeof Server }[] = [
    { name: 'Supabase Auth', detail: 'Signed in · session refreshes automatically', state: 'Online', tone: 'positive', Icon: KeyRound },
    {
      name: 'NightWatch API',
      detail: apiConfigured ? 'Uploads, jobs, frames and reviews' : 'Set API_URL in .env',
      state: !apiConfigured ? 'Not configured' : apiOnline === null ? 'Checking' : apiOnline ? 'Online' : 'Unreachable',
      tone: !apiConfigured ? 'muted' : apiOnline ? 'positive' : apiOnline === false ? 'pink' : 'muted',
      Icon: Server,
    },
    {
      name: 'Database',
      detail: videos.error || recordings.error ? 'Some records unavailable' : `${videos.data.length} uploads · ${recordings.data.length} recordings`,
      state: videos.error ? 'Error' : 'Online',
      tone: videos.error ? 'pink' : 'positive',
      Icon: Database,
    },
    {
      name: 'Arduino ingest',
      detail: lastEvent ? `Last event ${timeAgo(lastEvent.event_time, minute)}` : 'No events received yet',
      state: lastEvent ? 'Receiving' : 'Idle',
      tone: lastEvent ? 'cyan' : 'muted',
      Icon: Cpu,
    },
  ]

  const metricContainerVariants: Variants = {
    hidden: { opacity: 1 },
    visible: { opacity: 1, transition: { staggerChildren: shouldReduceMotion ? 0 : 0.07, delayChildren: shouldReduceMotion ? 0 : 0.05 } },
  }
  const metricCardVariants: Variants = {
    hidden: { opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: { duration: shouldReduceMotion ? 0 : 0.3, ease: 'easeOut' } },
  }

  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).format(now)
  const timeLabel = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now)

  return (
    <main className="content-area cc-content" id="main-content">
      <header className="cc-welcome">
        <div className="cc-welcome-copy">
          <div className="content-eyebrow">
            <span className="eyebrow-marker" aria-hidden="true" />
            NightWatch Command Center
          </div>
          <h1 className="cc-welcome-title">{getGreeting(now.getHours(), displayName)}</h1>
          <p className="cc-welcome-description">
            What does the model miss in the dark? Your footage, analyses and sensor devices at a glance.
          </p>
        </div>

        <div className="cc-welcome-actions">
          <div className="cc-clock" aria-label={`Local time ${timeLabel} on ${dateLabel}`}>
            <span className="cc-clock-date"><CalendarDays size={13} aria-hidden="true" />{dateLabel}</span>
            <span className="cc-clock-time"><Clock3 size={13} aria-hidden="true" />{timeLabel}</span>
          </div>
          <StatusBadge tone="amber">Prototype · not safety-certified</StatusBadge>
          <button
            className="cc-button cc-button--primary cc-new-investigation"
            type="button"
            disabled={!apiConfigured}
            onClick={() => navigate('/data-vault', { state: { openUpload: true } })}
          >
            <Plus size={16} aria-hidden="true" />
            New investigation
          </button>
        </div>
      </header>

      <motion.div className="cc-metrics-grid" role="group" variants={metricContainerVariants} initial="hidden" animate="visible" aria-label="Overview">
        {metrics.map((metric) => (
          <StatCard key={metric.id} metric={metric} variants={metricCardVariants} />
        ))}
      </motion.div>

      <div className="cc-command-grid">
        <div className="cc-main-column">
          <section className="cc-panel cc-monitoring-panel" aria-labelledby="cc-monitoring-heading">
            <SectionHeader
              eyebrow="Detection under degraded visibility"
              title="Visibility impact"
              titleId="cc-monitoring-heading"
              action={<span className="cc-map-layer-count"><ScanEye size={13} aria-hidden="true" />{completedInvestigations.length} analyses</span>}
            />
            <VisibilityImpact investigations={completedInvestigations} />
          </section>

          <section className="cc-panel cc-activity-panel" aria-labelledby="cc-activity-heading">
            <SectionHeader
              eyebrow="Uploads, results and device events"
              title="Recent activity"
              titleId="cc-activity-heading"
              action={<StatusBadge tone="purple"><Activity size={12} aria-hidden="true" />Live</StatusBadge>}
            />
            <ActivityFeed activities={activities} now={minute} />
          </section>
        </div>

        <aside className="cc-right-column" aria-label="Operations overview">
          <section className="cc-panel cc-investigations-panel" aria-labelledby="cc-investigations-heading">
            <SectionHeader
              eyebrow={attention.length ? 'Attention queue' : 'Most recent'}
              title={attention.length ? 'Needs attention' : 'Recent investigations'}
              titleId="cc-investigations-heading"
              action={<Link className="cc-text-link" to="/reports">View all <ArrowUpRight size={13} aria-hidden="true" /></Link>}
            />
            <div className="cc-investigations-list">
              {recentReports.length === 0 ? (
                <p className="cc-panel-footnote">No footage yet. Start a new investigation by uploading a clip.</p>
              ) : (
                <AnimatePresence initial={false}>
                  {recentReports.map((report) => <InvestigationCard key={report.id} report={report} now={minute} />)}
                </AnimatePresence>
              )}
            </div>
          </section>

          <section className="cc-panel cc-sensors-panel" aria-labelledby="cc-sensors-heading">
            <SectionHeader
              eyebrow="Arduino devices"
              title="Sensor network"
              titleId="cc-sensors-heading"
              action={<span className="cc-small-count">{String(enabledDevices.length).padStart(2, '0')} ACTIVE</span>}
            />
            <DeviceNetwork now={minute} />
          </section>

          <section className="cc-panel cc-integrations-panel" aria-labelledby="cc-integrations-heading">
            <SectionHeader
              eyebrow="Service layer"
              title="System integrations"
              titleId="cc-integrations-heading"
              action={<span className="cc-small-count">LIVE</span>}
            />
            <ul className="cc-integration-list">
              {integrations.map(({ name, detail, state, tone, Icon }) => (
                <li className="cc-integration-row" key={name}>
                  <span className="cc-integration-icon"><Icon size={15} aria-hidden="true" /></span>
                  <span className="cc-integration-copy">
                    <strong>{name}</strong>
                    <span>{detail}</span>
                  </span>
                  <StatusBadge tone={tone}>{state}</StatusBadge>
                </li>
              ))}
            </ul>
            <Link className="cc-integration-note" to="/data-vault">
              Open the Data Vault <ChevronRight size={13} aria-hidden="true" />
            </Link>
          </section>
        </aside>
      </div>

      <footer className="cc-page-footer">
        <span>NightWatch · Command Center</span>
        <span>Prototype evaluation · does not replace rescuers · results depend on the uploaded footage and model</span>
      </footer>
    </main>
  )
}
