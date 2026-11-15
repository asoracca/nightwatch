import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Camera,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  FileVideo2,
  Filter,
  HardDrive,
  LayoutGrid,
  List,
  Loader2,
  Search,
  Server,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionHeader } from '../components/common/SectionHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { FootageDetailsModal } from '../components/data-vault/FootageDetailsModal'
import { formatDuration, formatFileSize, formatUploadDate } from '../components/data-vault/formatters'
import { UploadFootageModal } from '../components/data-vault/UploadFootageModal'
import { VideoThumbnail } from '../components/data-vault/VideoThumbnail'
import { apiConfigured, USE_CASES } from '../lib/api'
import { capitalize, footageStatuses, footageStatusTone, humanLabels, humanStatus, humanTone, type Footage, type FootageStatus } from '../lib/footage'
import { useWorkspace } from '../lib/workspace'
import './CommandCenter.css'
import './DataVault.css'

type ViewMode = 'grid' | 'list'
type SortMode = 'newest' | 'oldest' | 'largest' | 'smallest'

const ALL_SOURCES = 'All sources'
const ARDUINO = 'Arduino capture'
const ALL_STATUSES = 'All statuses'
const sourceFilters = [ALL_SOURCES, ...USE_CASES.map(capitalize), ARDUINO]
const sortModes: SortMode[] = ['newest', 'oldest', 'largest', 'smallest']

const metricConfig = [
  { id: 'videos', label: 'Total footage', accent: 'cyan', Icon: Video },
  { id: 'storage', label: 'Total storage', accent: 'purple', Icon: HardDrive },
  { id: 'analyzed', label: 'Analyzed', accent: 'amber', Icon: Archive },
  { id: 'pending', label: 'Awaiting results', accent: 'pink', Icon: Clock3 },
] as const

function readSearch(state: unknown) {
  return typeof state === 'object' && state !== null && 'search' in state && typeof state.search === 'string'
    ? state.search
    : ''
}

export default function DataVault() {
  const shouldReduceMotion = useReducedMotion() ?? false
  const navigate = useNavigate()
  const location = useLocation()
  const { footage, videos, recordings, apiOnline, investigations } = useWorkspace()
  const [search, setSearch] = useState(() => readSearch(location.state))
  const [source, setSource] = useState(ALL_SOURCES)
  const [status, setStatus] = useState<FootageStatus | typeof ALL_STATUSES>(ALL_STATUSES)
  const [sort, setSort] = useState<SortMode>('newest')
  const [view, setView] = useState<ViewMode>('grid')
  const [uploadOpen, setUploadOpen] = useState(
    () =>
      apiConfigured &&
      typeof location.state === 'object' &&
      location.state !== null &&
      'openUpload' in location.state &&
      location.state.openUpload === true,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // A search from the top bar arrives as router state; apply it and clear the state.
  useEffect(() => {
    const incoming = readSearch(location.state)
    if (location.state) {
      setSearch(incoming)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 7_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const filteredFootage = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return footage
      .filter((item) => {
        const matchesSearch =
          !query ||
          [item.title, item.fileName, item.deviceId ?? '', item.id].some((field) => field.toLocaleLowerCase().includes(query))
        const matchesSource = source === ALL_SOURCES || item.categoryLabel === source
        const matchesStatus = status === ALL_STATUSES || item.status === status
        return matchesSearch && matchesSource && matchesStatus
      })
      .sort((a, b) => {
        if (sort === 'newest') return Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)
        if (sort === 'oldest') return Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt)
        if (sort === 'largest') return b.fileSizeBytes - a.fileSizeBytes
        return a.fileSizeBytes - b.fileSizeBytes
      })
  }, [footage, search, sort, source, status])

  const selectedFootage = footage.find((item) => item.id === selectedId) ?? null
  const totalStorage = footage.reduce((total, item) => total + item.fileSizeBytes, 0)
  const analyzedCount = footage.filter((item) => item.status === 'Analyzed').length
  const humansCount = footage.filter((item) => humanStatus(item, investigations) === 'humans_found').length
  const pendingCount = footage.filter((item) => ['Uploaded', 'Processing', 'Pending'].includes(item.status)).length
  const hasFilters = search.trim() !== '' || source !== ALL_SOURCES || status !== ALL_STATUSES || sort !== 'newest'
  const loading = (apiConfigured && !videos.loaded) || !recordings.loaded

  const metrics = [
    { ...metricConfig[0], value: String(footage.length).padStart(2, '0'), detail: `${videos.data.length} uploads · ${recordings.data.length} Arduino` },
    { ...metricConfig[1], value: formatFileSize(totalStorage), detail: 'Original files in private storage' },
    { ...metricConfig[2], value: String(analyzedCount).padStart(2, '0'), detail: `${humansCount} with humans found` },
    { ...metricConfig[3], value: String(pendingCount).padStart(2, '0'), detail: 'Queued, processing or unprocessed' },
  ]

  const metricContainerVariants: Variants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: shouldReduceMotion ? 0 : 0.06, delayChildren: shouldReduceMotion ? 0 : 0.04 },
    },
  }
  const metricItemVariants: Variants = {
    hidden: { opacity: shouldReduceMotion ? 1 : 0, y: shouldReduceMotion ? 0 : 10 },
    visible: { opacity: 1, y: 0, transition: { duration: shouldReduceMotion ? 0 : 0.28, ease: 'easeOut' } },
  }

  function clearFilters() {
    setSearch('')
    setSource(ALL_SOURCES)
    setStatus(ALL_STATUSES)
    setSort('newest')
  }

  function investigate(item: Footage) {
    navigate('/vision-studio', { state: { footageId: item.id, origin: 'Data Vault' } })
  }

  const statusBadge = (item: Footage) => {
    const human = humanStatus(item, investigations)
    return human ? (
      <StatusBadge tone={humanTone[human]}>{humanLabels[human]}</StatusBadge>
    ) : (
      <StatusBadge tone={footageStatusTone[item.status]} pulse={item.status === 'Processing'}>{item.status}</StatusBadge>
    )
  }

  return (
    <motion.main
      className="content-area dv-content"
      id="main-content"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: 'easeOut' }}
    >
      <header className="dv-page-header">
        <div className="dv-page-copy">
          <div className="content-eyebrow">
            <span className="eyebrow-marker" aria-hidden="true" />
            Evidence repository · private storage
          </div>
          <h1 className="content-heading">Data Vault</h1>
          <p className="content-description">
            Your uploaded footage and Arduino recordings, with verification and processing state. Only you can see
            these records.
          </p>
        </div>
        <div className="dv-page-actions">
          <StatusBadge tone={apiOnline ? 'positive' : apiOnline === false ? 'pink' : 'muted'}>
            <Server size={12} aria-hidden="true" />
            API · {!apiConfigured ? 'not configured' : apiOnline === null ? 'checking' : apiOnline ? 'online' : 'unreachable'}
          </StatusBadge>
          <button
            className="cc-button cc-button--primary dv-upload-trigger"
            type="button"
            disabled={!apiConfigured}
            onClick={() => setUploadOpen(true)}
          >
            <Upload size={15} aria-hidden="true" />
            Upload footage
          </button>
        </div>
      </header>

      {videos.error && <p className="nw-inline-error" role="alert">Uploads: {videos.error}</p>}
      {recordings.error && (
        <p className="nw-inline-note" role="status">Arduino recordings unavailable: {recordings.error}</p>
      )}

      <motion.section
        className="dv-metrics"
        aria-label="Storage overview"
        variants={metricContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {metrics.map(({ id, label, value, detail, accent, Icon }) => (
          <motion.article className={`dv-metric dv-metric--${accent}`} key={id} variants={metricItemVariants}>
            <div className="dv-metric-top">
              <span>{label}</span>
              <Icon size={15} aria-hidden="true" />
            </div>
            <strong>{value}</strong>
            <span className="dv-metric-detail">{detail}</span>
          </motion.article>
        ))}
      </motion.section>

      <div className="dv-workspace">
        <section className="dv-panel dv-library-panel" aria-labelledby="dv-library-heading">
          <SectionHeader
            eyebrow="Footage index · live"
            title="Video library"
            titleId="dv-library-heading"
            action={
              <span className="dv-result-count">
                {filteredFootage.length} <span>of {footage.length} records</span>
              </span>
            }
          />

          <div className="dv-toolbar">
            <label className="dv-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search footage by name or device</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search by name or device…"
              />
              {search && (
                <button type="button" aria-label="Clear video search" onClick={() => setSearch('')}>
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </label>
            <label className="dv-filter-select">
              <span className="sr-only">Filter by use case or source</span>
              <select value={source} onChange={(event) => setSource(event.currentTarget.value)}>
                {sourceFilters.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="dv-filter-select">
              <span className="sr-only">Filter by processing status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.currentTarget.value as FootageStatus | typeof ALL_STATUSES)}
              >
                <option value={ALL_STATUSES}>{ALL_STATUSES}</option>
                {footageStatuses.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="dv-filter-select dv-sort-select">
              <span className="sr-only">Sort footage</span>
              <select
                value={sort}
                onChange={(event) => {
                  const value = event.currentTarget.value as SortMode
                  if (sortModes.includes(value)) setSort(value)
                }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="largest">Largest file</option>
                <option value="smallest">Smallest file</option>
              </select>
              {sort === 'largest' || sort === 'smallest' ? (
                <ArrowDownWideNarrow className="dv-sort-icon" size={13} aria-hidden="true" />
              ) : (
                <ArrowUpWideNarrow className="dv-sort-icon" size={13} aria-hidden="true" />
              )}
            </label>
            <button className="dv-clear-filters" type="button" disabled={!hasFilters} onClick={clearFilters}>
              <Filter size={13} aria-hidden="true" />
              Clear
            </button>
            <div className="dv-view-toggle" role="group" aria-label="Video library view">
              <button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                <LayoutGrid size={15} aria-hidden="true" />
              </button>
              <button type="button" aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                <List size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="dv-results-meta" aria-live="polite">
            <span>
              Showing <strong>{filteredFootage.length}</strong> {filteredFootage.length === 1 ? 'record' : 'records'}
              {search.trim() ? <> matching <strong>“{search.trim()}”</strong></> : null}
            </span>
            {hasFilters && <button type="button" onClick={clearFilters}>Reset search & filters</button>}
          </div>

          {loading && footage.length === 0 ? (
            <div className="dv-empty-state">
              <span className="dv-empty-icon"><Loader2 className="dv-spin" size={19} aria-hidden="true" /></span>
              <h3>Loading your footage…</h3>
            </div>
          ) : footage.length === 0 ? (
            <div className="dv-empty-state">
              <span className="dv-empty-icon"><Upload size={19} aria-hidden="true" /></span>
              <h3>No footage yet</h3>
              <p>Upload a short MP4, MOV or WebM clip (up to 50 MiB and 120 seconds) to run your first evaluation.</p>
              <button
                className="cc-button cc-button--primary"
                type="button"
                disabled={!apiConfigured}
                onClick={() => setUploadOpen(true)}
              >
                <Upload size={15} aria-hidden="true" /> Upload footage
              </button>
            </div>
          ) : filteredFootage.length === 0 ? (
            <div className="dv-empty-state">
              <span className="dv-empty-icon"><Search size={19} aria-hidden="true" /></span>
              <h3>No footage matches these filters</h3>
              <p>Try a different name, source, or processing state.</p>
              <button className="cc-button cc-button--quiet" type="button" onClick={clearFilters}>Clear filters</button>
            </div>
          ) : view === 'grid' ? (
            <motion.div className="dv-video-grid" role="list" layout transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}>
              <AnimatePresence mode="popLayout" initial={false}>
                {filteredFootage.map((item) => (
                  <motion.article
                    className="dv-video-card"
                    key={item.id}
                    role="listitem"
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
                    whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: 'easeOut' }}
                  >
                    <button
                      className="dv-video-card-button"
                      type="button"
                      aria-label={`View details for ${item.title}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <VideoThumbnail footage={item} />
                      <span className="dv-card-body">
                        <span className="dv-card-title-row">
                          <span className="dv-card-title">{item.title}</span>
                          {statusBadge(item)}
                        </span>
                        <span className="dv-card-category">{item.categoryLabel}</span>
                        <span className="dv-card-meta">
                          <span><Clock3 size={12} aria-hidden="true" />{formatDuration(item.durationSeconds)}</span>
                          <span><HardDrive size={12} aria-hidden="true" />{item.fileSizeBytes ? formatFileSize(item.fileSizeBytes) : '—'}</span>
                        </span>
                        <span className="dv-card-footer">
                          <span>
                            {item.kind === 'recording' ? <Cpu size={12} aria-hidden="true" /> : <Camera size={12} aria-hidden="true" />}
                            {item.deviceId ?? 'Upload'}
                          </span>
                          <span>{formatUploadDate(item.uploadedAt)}</span>
                        </span>
                      </span>
                    </button>
                  </motion.article>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div className="dv-video-list" role="list" layout transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}>
              <div className="dv-list-head" aria-hidden="true">
                <span>Footage</span><span>Source</span><span>Duration</span>
                <span>Size</span><span>Uploaded</span><span>Status</span>
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                {filteredFootage.map((item) => (
                  <motion.article
                    className="dv-list-row"
                    key={item.id}
                    role="listitem"
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
                  >
                    <button
                      className="dv-list-footage"
                      type="button"
                      aria-label={`View details for ${item.title}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <VideoThumbnail footage={item} compact />
                      <span className="dv-list-title-wrap">
                        <span className="dv-list-title">{item.title}</span>
                        <span className="dv-list-source">{item.deviceId ?? 'Upload'} · {item.fileName}</span>
                      </span>
                    </button>
                    <span className="dv-list-cell" data-label="Source">{item.categoryLabel}</span>
                    <span className="dv-list-cell" data-label="Duration">{formatDuration(item.durationSeconds)}</span>
                    <span className="dv-list-cell" data-label="Size">{item.fileSizeBytes ? formatFileSize(item.fileSizeBytes) : '—'}</span>
                    <span className="dv-list-cell" data-label="Uploaded">{formatUploadDate(item.uploadedAt)}</span>
                    <span className="dv-list-cell dv-list-status" data-label="Status">{statusBadge(item)}</span>
                  </motion.article>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </section>

        <aside className="dv-aside" aria-label="Repository status">
          <section className="dv-panel dv-databricks-panel" aria-labelledby="dv-pipeline-heading">
            <SectionHeader
              eyebrow="Processing pipeline"
              title="Services"
              titleId="dv-pipeline-heading"
              action={
                <StatusBadge tone={apiOnline ? 'positive' : apiOnline === false ? 'pink' : 'muted'}>
                  {apiOnline ? 'Online' : apiOnline === false ? 'Degraded' : 'Checking'}
                </StatusBadge>
              }
            />
            <p className="dv-integration-intro">
              Uploads are verified by the API and analysed by the worker. Arduino recordings are processed by the local
              recordings watcher.
            </p>
            <dl className="dv-integration-list">
              <div>
                <dt><Server size={13} aria-hidden="true" /> NightWatch API</dt>
                <dd>{!apiConfigured ? 'Not configured' : apiOnline === null ? 'Checking…' : apiOnline ? 'Reachable' : 'Unreachable'}</dd>
              </div>
              <div>
                <dt><Database size={13} aria-hidden="true" /> Uploads</dt>
                <dd>{videos.error ? 'Error' : `${videos.data.length} records`}</dd>
              </div>
              <div>
                <dt><Cpu size={13} aria-hidden="true" /> Arduino recordings</dt>
                <dd>{recordings.error ? 'Unavailable' : `${recordings.data.length} records`}</dd>
              </div>
              <div>
                <dt><CheckCircle2 size={13} aria-hidden="true" /> Processing now</dt>
                <dd>{footage.filter((item) => item.status === 'Processing').length}</dd>
              </div>
            </dl>
            <div className="dv-integration-footnote">
              <span className="dv-connection-light" data-state={apiOnline ? 'online' : 'offline'} aria-hidden="true" />
              The worker must be running for queued jobs to start
            </div>
          </section>

          <section className="dv-panel dv-schema-panel" aria-labelledby="dv-schema-heading">
            <SectionHeader
              eyebrow="Repository model"
              title="Evidence layers"
              titleId="dv-schema-heading"
              action={<span className="dv-schema-mark">SUPABASE</span>}
            />
            <ul className="dv-schema-list">
              <li><span>01</span> videos <small>Upload metadata + SHA-256</small></li>
              <li><span>02</span> Private storage <small>Originals and frames</small></li>
              <li><span>03</span> video_frames <small>Detections per condition</small></li>
              <li><span>04</span> review_decisions <small>Append-only reviews</small></li>
              <li><span>05</span> recording_results <small>Arduino + sensor fusion</small></li>
            </ul>
            <p className="dv-schema-note">Every row is protected by row-level security on your account.</p>
          </section>

          <section className="dv-panel dv-local-note">
            <span className="dv-local-note-icon"><FileVideo2 size={15} aria-hidden="true" /></span>
            <div>
              <strong>Upload limits</strong>
              <p>MP4, MOV or WebM · 50 MiB · 120 seconds · up to 3840 × 2160. Uploading the same file twice reuses it.</p>
            </div>
          </section>
        </aside>
      </div>

      <footer className="dv-page-footer">
        <span>NightWatch · Data Vault</span>
        <span>Prototype evaluation · not safety-certified · results depend on the uploaded footage and model</span>
      </footer>

      <AnimatePresence>
        {uploadOpen && (
          <UploadFootageModal
            onClose={() => setUploadOpen(false)}
            onFinished={(summary) => {
              setUploadOpen(false)
              setNotice(summary)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedFootage && (
          <FootageDetailsModal
            footage={selectedFootage}
            onClose={() => setSelectedId(null)}
            onInvestigate={() => investigate(selectedFootage)}
            onDeleted={(message) => {
              setSelectedId(null)
              setNotice(message)
            }}
            onReinvestigated={(message) => {
              setSelectedId(null)
              setNotice(message)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            className="dv-toast"
            role="status"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: 6 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
          >
            <span className="dv-toast-mark"><CheckCircle2 size={14} aria-hidden="true" /></span>
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}>
              <X size={14} aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  )
}
