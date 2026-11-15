import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  Search,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { SectionHeader } from '../components/common/SectionHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { downloadFile, historyToCsv, reportToData } from '../components/reports/exportReports'
import { ExperimentRuns } from '../components/reports/ExperimentRuns'
import { ReportDetailModal } from '../components/reports/ReportDetailModal'
import { buildReport, formatDay, formatTime, reportStatuses, type ReportStatus } from '../components/reports/reportModel'
import { reportStatusTone } from '../components/reports/tones'
import { priorityTone } from '../components/vision-studio/RecordingVerdict'
import { humanLabels, humanTone, type HumanStatus } from '../lib/footage'
import { useWorkspace } from '../lib/workspace'
import './CommandCenter.css'
import './DataVault.css'
import './VisionStudio.css'
import './Reports.css'

type SortMode = 'newest' | 'oldest' | 'most' | 'fewest'

const sortLabels: Record<SortMode, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  most: 'Most observations',
  fewest: 'Fewest observations',
}

function isSortMode(value: string): value is SortMode {
  return value in sortLabels
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export default function Reports() {
  const reduceMotion = useReducedMotion() ?? false
  const { footage, investigations } = useWorkspace()
  const [search, setSearch] = useState('')
  const [sources, setSources] = useState<string[]>([])
  const [statuses, setStatuses] = useState<ReportStatus[]>([])
  const [humans, setHumans] = useState<HumanStatus[]>([])
  const [sort, setSort] = useState<SortMode>('newest')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const exportRef = useRef<HTMLDivElement>(null)

  const reports = useMemo(() => footage.map((item) => buildReport(item, investigations)), [footage, investigations])
  const sourceOptions = useMemo(() => [...new Set(reports.map((r) => r.sourceLabel))].sort(), [reports])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 6_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!exportOpen) return
    function onPointer(event: PointerEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return reports
      .filter((report) => {
        const matchesSearch =
          !query ||
          [report.id, report.name, report.sourceLabel, report.footage.deviceId ?? ''].some((field) =>
            field.toLocaleLowerCase().includes(query),
          )
        const matchesSource = sources.length === 0 || sources.includes(report.sourceLabel)
        const matchesStatus = statuses.length === 0 || statuses.includes(report.status)
        const matchesHumans = humans.length === 0 || (report.humans !== null && humans.includes(report.humans))
        return matchesSearch && matchesSource && matchesStatus && matchesHumans
      })
      .sort((a, b) => {
        if (sort === 'newest') return Date.parse(b.openedAt) - Date.parse(a.openedAt)
        if (sort === 'oldest') return Date.parse(a.openedAt) - Date.parse(b.openedAt)
        if (sort === 'most') return (b.observations ?? -1) - (a.observations ?? -1)
        return (a.observations ?? Infinity) - (b.observations ?? Infinity)
      })
  }, [humans, reports, search, sort, sources, statuses])

  const selected = reports.find((report) => report.id === selectedId) ?? null
  const completed = reports.filter((r) => r.status === 'Completed')
  const reviewTotal = completed.reduce((sum, r) => sum + (r.reviewCandidates ?? 0), 0)
  const withConfidence = completed.filter((r) => r.confidence !== null)
  const meanConfidence = withConfidence.length
    ? withConfidence.reduce((sum, r) => sum + (r.confidence ?? 0), 0) / withConfidence.length
    : null
  const hasFilters = search.trim() !== '' || sources.length > 0 || statuses.length > 0 || humans.length > 0 || sort !== 'newest'
  const attention = reports
    .filter((r) => r.status === 'Failed' || r.status === 'Processing' || r.priority === 'high' || (r.reviewCandidates ?? 0) > 0)
    .sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt))
    .slice(0, 8)
  const maxSource = Math.max(1, ...sourceOptions.map((s) => reports.filter((r) => r.sourceLabel === s).length))

  const metrics = [
    { id: 'total', label: 'Total reports', value: String(reports.length).padStart(2, '0'), detail: `${reports.filter((r) => r.humans === 'humans_found').length} with humans found`, accent: 'cyan', Icon: FileText },
    { id: 'completed', label: 'Completed', value: String(completed.length).padStart(2, '0'), detail: 'Stored results available', accent: 'purple', Icon: CheckCircle2 },
    { id: 'review', label: 'Review candidates', value: String(reviewTotal).padStart(2, '0'), detail: 'Condition-frames in the review band', accent: 'amber', Icon: AlertTriangle },
    { id: 'confidence', label: 'Mean confidence', value: meanConfidence === null ? '—' : `${(meanConfidence * 100).toFixed(1)}%`, detail: 'Accepted observations, completed reports', accent: 'pink', Icon: Gauge },
  ] as const

  const containerVariants: Variants = {
    hidden: { opacity: 1 },
    visible: { opacity: 1, transition: { staggerChildren: reduceMotion ? 0 : 0.06, delayChildren: reduceMotion ? 0 : 0.04 } },
  }
  const itemVariants: Variants = {
    hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 10 },
    visible: { opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : 0.28, ease: 'easeOut' } },
  }

  function clearFilters() {
    setSearch('')
    setSources([])
    setStatuses([])
    setHumans([])
    setSort('newest')
  }

  function exportHistory(format: 'csv' | 'json') {
    setExportOpen(false)
    if (filtered.length === 0) {
      setNotice('Nothing to export: no reports match the current filters.')
      return
    }
    const stamp = new Date().toISOString().slice(0, 10)
    if (format === 'csv') {
      downloadFile(`nightwatch-reports-${stamp}.csv`, historyToCsv(filtered), 'text/csv')
    } else {
      downloadFile(`nightwatch-reports-${stamp}.json`, JSON.stringify(filtered.map(reportToData), null, 2), 'application/json')
    }
    setNotice(`${filtered.length} ${filtered.length === 1 ? 'report' : 'reports'} exported as ${format.toUpperCase()}.`)
  }

  return (
    <motion.main
      className="content-area rp-content"
      id="main-content"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}
    >
      <header className="rp-page-header">
        <div className="rp-page-copy">
          <div className="content-eyebrow">
            <span className="eyebrow-marker" aria-hidden="true" />
            Reports & intelligence · stored evidence
          </div>
          <h1 className="content-heading">Reports & Intelligence</h1>
          <p className="content-description">
            One report per video or Arduino recording, built from stored aggregates, review candidates and sensor-fusion
            verdicts. Counts are observations, not unique people.
          </p>
        </div>
        <div className="rp-export" ref={exportRef}>
          <button
            className="cc-button cc-button--primary"
            type="button"
            aria-expanded={exportOpen}
            aria-controls="rp-export-menu"
            onClick={() => setExportOpen((open) => !open)}
          >
            <Download size={15} aria-hidden="true" />
            Export
            <ChevronDown size={14} aria-hidden="true" className={exportOpen ? 'vs-chevron is-open' : 'vs-chevron'} />
          </button>
          <AnimatePresence>
            {exportOpen && (
              <motion.div
                id="rp-export-menu"
                className="rp-export-menu"
                role="group"
                aria-label="Export options"
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
              >
                <span className="rp-export-caption">{filtered.length} reports in current view</span>
                <button type="button" onClick={() => exportHistory('csv')}>
                  <FileSpreadsheet size={15} aria-hidden="true" />
                  <span><strong>History as CSV</strong><small>One row per report</small></span>
                </button>
                <button type="button" onClick={() => exportHistory('json')}>
                  <FileCode2 size={15} aria-hidden="true" />
                  <span><strong>Full reports as JSON</strong><small>Aggregates, per-condition counts, verdicts</small></span>
                </button>
                <span className="rp-export-caption">Exports never include signed media links</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <motion.section className="dv-metrics" aria-label="Report overview" variants={containerVariants} initial="hidden" animate="visible">
        {metrics.map(({ id, label, value, detail, accent, Icon }) => (
          <motion.article className={`dv-metric dv-metric--${accent}`} key={id} variants={itemVariants}>
            <div className="dv-metric-top">
              <span>{label}</span>
              <Icon size={15} aria-hidden="true" />
            </div>
            <strong>{value}</strong>
            <span className="dv-metric-detail">{detail}</span>
          </motion.article>
        ))}
      </motion.section>

      <div className="rp-workspace">
        <section className="cc-panel rp-history-panel" aria-labelledby="rp-history-heading">
          <SectionHeader
            eyebrow="Case history · live"
            title="Investigation history"
            titleId="rp-history-heading"
            action={
              <span className="dv-result-count">
                {filtered.length} <span>of {reports.length} reports</span>
              </span>
            }
          />

          <div className="rp-toolbar">
            <label className="dv-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search reports</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search by name, ID, source or device…"
              />
              {search && (
                <button type="button" aria-label="Clear search" onClick={() => setSearch('')}>
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </label>
            <label className="dv-filter-select rp-sort">
              <span className="sr-only">Sort reports</span>
              <select
                value={sort}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  if (isSortMode(value)) setSort(value)
                }}
              >
                {(Object.keys(sortLabels) as SortMode[]).map((mode) => (
                  <option key={mode} value={mode}>{sortLabels[mode]}</option>
                ))}
              </select>
            </label>
            <button className="dv-clear-filters" type="button" disabled={!hasFilters} onClick={clearFilters}>
              <Filter size={13} aria-hidden="true" />
              Clear
            </button>
          </div>

          <div className="rp-filter-rows">
            {sourceOptions.length > 0 && (
              <div className="rp-filter-row" role="group" aria-label="Filter by source">
                <span className="rp-filter-label">Source</span>
                {sourceOptions.map((source) => (
                  <button
                    key={source}
                    type="button"
                    className="rp-chip"
                    aria-pressed={sources.includes(source)}
                    onClick={() => setSources((current) => toggle(current, source))}
                  >
                    {source}
                    <span className="rp-chip-count">{reports.filter((r) => r.sourceLabel === source).length}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="rp-filter-row" role="group" aria-label="Filter by people found">
              <span className="rp-filter-label">People</span>
              {(Object.keys(humanLabels) as HumanStatus[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rp-chip"
                  aria-pressed={humans.includes(value)}
                  onClick={() => setHumans((current) => toggle(current, value))}
                >
                  {humanLabels[value]}
                  <span className="rp-chip-count">{reports.filter((r) => r.humans === value).length}</span>
                </button>
              ))}
            </div>
            <div className="rp-filter-row" role="group" aria-label="Filter by status">
              <span className="rp-filter-label">Status</span>
              {reportStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`rp-chip rp-chip--${status.toLowerCase()}`}
                  aria-pressed={statuses.includes(status)}
                  onClick={() => setStatuses((current) => toggle(current, status))}
                >
                  <i aria-hidden="true" />
                  {status}
                  <span className="rp-chip-count">{reports.filter((r) => r.status === status).length}</span>
                </button>
              ))}
            </div>
          </div>

          {reports.length === 0 ? (
            <div className="dv-empty-state">
              <span className="dv-empty-icon"><FileText size={19} aria-hidden="true" /></span>
              <h3>No reports yet</h3>
              <p>Reports appear here for every uploaded video and Arduino recording.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="dv-empty-state">
              <span className="dv-empty-icon"><Search size={19} aria-hidden="true" /></span>
              <h3>No reports match</h3>
              <p>Try a different search, source, or status.</p>
              <button className="cc-button cc-button--quiet" type="button" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : (
            <div className="rp-table" role="list" aria-label="Reports">
              <div className="rp-table-head" aria-hidden="true">
                <span>Investigation</span><span>Source</span><span>Opened</span><span>Status</span>
                <span>Observations</span><span>Confidence</span><span>Review</span><span />
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map((report) => (
                  <motion.div
                    role="listitem"
                    key={report.id}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
                  >
                    <button
                      type="button"
                      className="rp-row"
                      aria-label={`Open report ${report.name}, ${report.status}`}
                      onClick={() => setSelectedId(report.id)}
                    >
                      <span className="rp-row-main">
                        <span className="rp-row-id">{report.id.slice(0, 8)}</span>
                        <strong>{report.name}</strong>
                        {report.humans && (
                          <span className="rp-row-humans">
                            <StatusBadge tone={humanTone[report.humans]}>{humanLabels[report.humans]}</StatusBadge>
                          </span>
                        )}
                        <span className="rp-row-source">{report.footage.deviceId ?? report.footage.fileName}</span>
                      </span>
                      <span className="rp-cell" data-label="Source">{report.sourceLabel}</span>
                      <span className="rp-cell rp-mono" data-label="Opened">
                        <span className="rp-date">
                          {formatDay(report.openedAt)}
                          <small>{formatTime(report.openedAt)}</small>
                        </span>
                      </span>
                      <span className="rp-cell" data-label="Status">
                        <StatusBadge tone={reportStatusTone[report.status]} pulse={report.status === 'Processing'}>{report.status}</StatusBadge>
                      </span>
                      <span className="rp-cell rp-objects" data-label="Observations">
                        <strong>{report.observations ?? '—'}</strong>
                      </span>
                      <span className="rp-cell rp-confidence" data-label="Confidence">
                        <span className="rp-bar"><span style={{ transform: `scaleX(${report.confidence ?? 0})` }} /></span>
                        <span className="rp-mono">{report.confidence === null ? '—' : `${Math.round(report.confidence * 100)}%`}</span>
                      </span>
                      <span className="rp-cell" data-label="Review">
                        {report.priority ? (
                          <StatusBadge tone={priorityTone[report.priority]}>{report.priority}</StatusBadge>
                        ) : report.reviewCandidates ? (
                          <StatusBadge tone="amber">{report.reviewCandidates} frames</StatusBadge>
                        ) : (
                          <StatusBadge tone="muted">{report.reviewCandidates === 0 ? 'None' : '—'}</StatusBadge>
                        )}
                      </span>
                      <ChevronRight className="rp-row-chevron" size={16} aria-hidden="true" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        <aside className="rp-aside" aria-label="Report insights">
          <section className="cc-panel" aria-labelledby="rp-attention-heading">
            <SectionHeader
              eyebrow="Analyst queue"
              title="Needs attention"
              titleId="rp-attention-heading"
              action={<span className="cc-small-count">{String(attention.length).padStart(2, '0')}</span>}
            />
            {attention.length === 0 ? (
              <p className="cc-panel-footnote">Nothing needs attention right now.</p>
            ) : (
              <ul className="rp-attention-list">
                {attention.map((report) => {
                  const mark = report.status === 'Failed' ? 'failed' : report.status === 'Processing' ? 'processing' : 'needs-review'
                  return (
                    <li key={report.id}>
                      <button type="button" className="rp-attention" onClick={() => setSelectedId(report.id)}>
                        <span className={`rp-attention-mark rp-attention-mark--${mark}`} aria-hidden="true" />
                        <span className="rp-attention-copy">
                          <strong>{report.name}</strong>
                          <span>
                            {report.status === 'Failed'
                              ? report.errorMessage || 'Processing failed'
                              : report.status === 'Processing'
                                ? 'Worker processing'
                                : report.priority === 'high'
                                  ? 'High review priority from sensor fusion'
                                  : `${report.reviewCandidates} review-candidate frames`}
                          </span>
                        </span>
                        <StatusBadge tone={reportStatusTone[report.status]}>{report.status}</StatusBadge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="cc-panel" aria-labelledby="rp-category-heading">
            <SectionHeader eyebrow="Distribution" title="Reports by source" titleId="rp-category-heading" />
            {sourceOptions.length === 0 ? (
              <p className="cc-panel-footnote">No reports yet.</p>
            ) : (
              <ul className="rp-category-list">
                {sourceOptions.map((source) => {
                  const items = reports.filter((r) => r.sourceLabel === source)
                  const observations = items.reduce((sum, r) => sum + (r.observations ?? 0), 0)
                  const active = sources.includes(source)
                  return (
                    <li key={source}>
                      <button
                        type="button"
                        className={`rp-category${active ? ' is-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => setSources((current) => toggle(current, source))}
                      >
                        <span className="rp-category-top">
                          <strong>{source}</strong>
                          <span>{items.length} reports · {observations} observations</span>
                        </span>
                        <span className="rp-bar rp-bar--thick">
                          <motion.span
                            initial={reduceMotion ? false : { scaleX: 0 }}
                            animate={{ scaleX: items.length / maxSource }}
                            transition={{ duration: reduceMotion ? 0 : 0.5, ease: 'easeOut' }}
                          />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="cc-panel-footnote">Use cases are chosen by the uploader, never inferred.</p>
          </section>
        </aside>
      </div>

      <ExperimentRuns
        investigations={investigations}
        titles={Object.fromEntries(footage.map((item) => [item.id, item.title]))}
      />

      <footer className="vs-page-footer">
        <span>NightWatch · Reports & Intelligence</span>
        <span>Prototype evaluation · miss rate is unmeasured without annotated ground truth</span>
      </footer>

      <AnimatePresence>
        {selected && <ReportDetailModal key={selected.id} report={selected} onClose={() => setSelectedId(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="cc-toast rp-toast"
            role="status"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <span className="cc-toast-icon"><Download size={14} aria-hidden="true" /></span>
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
