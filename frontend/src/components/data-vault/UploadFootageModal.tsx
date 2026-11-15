import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertCircle, Check, CloudUpload, FileVideo2, Loader2, Trash2, Upload, X } from 'lucide-react'
import { sfx } from '../../audio/sfx'
import { apiConfigured, CONDITIONS, USE_CASES, validateUpload, type UseCase } from '../../lib/api'
import { capitalize } from '../../lib/footage'
import { useWorkspace, type UploadStage } from '../../lib/workspace'
import { formatFileSize } from './formatters'

interface UploadFootageModalProps {
  onClose: () => void
  /** Called once all files finished (successfully or not) with a short summary. */
  onFinished: (summary: string, firstVideoId: string | null) => void
}

type ItemState = 'waiting' | 'working' | 'done' | 'error'

interface UploadItem {
  key: string
  file: File
  state: ItemState
  stage?: UploadStage
  percent?: number
  message?: string
}

const stageLabels: Record<UploadStage, string> = {
  hashing: 'Computing SHA-256',
  reserving: 'Reserving upload',
  uploading: 'Uploading',
  verifying: 'Server verifying size, hash and container',
  queueing: 'Queueing analysis',
  done: 'Done',
}

const fileKey = (file: File) => `${file.name}\u0000${file.size}\u0000${file.lastModified}`

export function UploadFootageModal({ onClose, onFinished }: UploadFootageModalProps) {
  const { uploadVideo } = useWorkspace()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion() ?? false
  const [items, setItems] = useState<UploadItem[]>([])
  const [useCase, setUseCase] = useState<UseCase>(USE_CASES[0])
  const [allConditions, setAllConditions] = useState(true)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (error) sfx.play('alert')
  }, [error])

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    if (incoming.length === 0) {
      setError('Choose at least one MP4, MOV or WebM video.')
      return
    }
    const problems: string[] = []
    const seen = new Set(items.map((item) => item.key))
    const additions: UploadItem[] = []
    for (const file of incoming) {
      const problem = validateUpload(file)
      if (problem) {
        problems.push(problem)
        continue
      }
      const key = fileKey(file)
      if (seen.has(key)) continue
      seen.add(key)
      additions.push({ key, file, state: 'waiting' })
    }
    setError(problems.join(' '))
    setItems((current) => [...current, ...additions])
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) addFiles(event.currentTarget.files)
    event.currentTarget.value = ''
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (!isUploading) addFiles(event.dataTransfer.files)
  }

  function patch(key: string, update: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...update } : item)))
  }

  async function startUpload() {
    const queue = items.filter((item) => item.state === 'waiting' || item.state === 'error')
    if (queue.length === 0 || isUploading) return
    setError('')
    setIsUploading(true)
    sfx.play('processing')
    const conditions = allConditions ? [...CONDITIONS] : (['clear'] as const).slice()
    let ok = 0
    let duplicates = 0
    let failed = 0
    let firstVideoId: string | null = null

    // Sequential: each file is hashed in memory, so parallel uploads would multiply memory use.
    for (const item of queue) {
      patch(item.key, { state: 'working', stage: 'hashing', percent: undefined, message: undefined })
      try {
        const result = await uploadVideo(item.file, useCase, conditions, ({ stage, percent }) =>
          patch(item.key, { stage, percent }),
        )
        ok += 1
        if (result.duplicate) duplicates += 1
        firstVideoId ??= result.video.id
        patch(item.key, {
          state: 'done',
          stage: 'done',
          message: result.duplicate
            ? result.queued
              ? 'Already uploaded · analysis queued'
              : 'Already in your vault · not reprocessed'
            : 'Verified · analysis queued',
        })
      } catch (caught) {
        failed += 1
        patch(item.key, { state: 'error', message: caught instanceof Error ? caught.message : 'Upload failed' })
      }
    }

    setIsUploading(false)
    if (failed === 0) {
      sfx.play('complete')
      const parts = [`${ok} ${ok === 1 ? 'video' : 'videos'} verified`]
      if (duplicates) parts.push(`${duplicates} already in your vault`)
      onFinished(`${parts.join(' · ')}. Analysis results refresh automatically.`, firstVideoId)
    } else {
      setError(`${failed} of ${queue.length} uploads failed. Fix the issue and choose “Retry failed”.`)
    }
  }

  const pending = items.filter((item) => item.state === 'waiting' || item.state === 'error').length
  const hasErrors = items.some((item) => item.state === 'error')

  return (
    <motion.dialog
      ref={dialogRef}
      className="dv-dialog"
      aria-labelledby="dv-upload-title"
      aria-describedby="dv-upload-description"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
      onCancel={(event) => {
        event.preventDefault()
        if (!isUploading) onClose()
      }}
      onClick={(event) => {
        if (!isUploading && event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        className="dv-dialog-card dv-upload-dialog-card"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0, y: 7, scale: 0.99 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
      >
        <header className="dv-dialog-header">
          <div className="dv-dialog-title-group">
            <span className="dv-dialog-icon"><CloudUpload size={18} aria-hidden="true" /></span>
            <div>
              <span className="cc-section-eyebrow">PRIVATE STORAGE · VERIFIED UPLOAD</span>
              <h2 id="dv-upload-title">Upload footage</h2>
            </div>
          </div>
          <button
            className="cc-modal-close"
            type="button"
            aria-label="Close upload dialog"
            disabled={isUploading}
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <p className="dv-dialog-description" id="dv-upload-description">
          Videos go to your private storage. The server checks size, SHA-256 and container before queueing analysis.
          Uploading the same file again reuses the existing record.
        </p>

        {!apiConfigured && (
          <p className="nw-inline-error" role="alert">
            Uploads are disabled: set <code>API_URL</code> in the repository-root <code>.env</code>.
          </p>
        )}

        <label
          className={`dv-dropzone${isDragging ? ' dv-dropzone--active' : ''}${isUploading ? ' dv-dropzone--disabled' : ''}`}
          htmlFor="dv-file-input"
          onDragOver={(event) => {
            event.preventDefault()
            if (!isUploading) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            id="dv-file-input"
            className="dv-file-input"
            type="file"
            multiple
            aria-label="Choose video files"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            disabled={isUploading || !apiConfigured}
            onChange={handleFileChange}
          />
          <span className="dv-dropzone-icon"><Upload size={18} aria-hidden="true" /></span>
          <span className="dv-dropzone-title">Drop video files here</span>
          <span className="dv-dropzone-hint">or browse · MP4, MOV, WebM · up to 50 MiB and 120 s each</span>
        </label>

        <label className="dv-field">
          <span>Use case <small className="dv-field-aside">your choice; the system does not infer it</small></span>
          <select
            value={useCase}
            disabled={isUploading}
            onChange={(event) => setUseCase(event.currentTarget.value as UseCase)}
          >
            {USE_CASES.map((item) => (
              <option key={item} value={item}>{capitalize(item)}</option>
            ))}
          </select>
        </label>

        <label className="dv-check">
          <input
            type="checkbox"
            checked={allConditions}
            disabled={isUploading}
            onChange={(event) => setAllConditions(event.currentTarget.checked)}
          />
          <span>
            Compare all four visibility conditions
            <small>Clear, low light, fog and blur use the same sampling schedule. Off: clear only.</small>
          </span>
        </label>

        <div className="dv-file-list-heading">
          <strong>Selected files</strong>
          <span>{items.length} {items.length === 1 ? 'file' : 'files'}</span>
        </div>
        <div className="dv-selected-files" aria-live="polite">
          {items.length === 0 ? (
            <p className="dv-empty-files">No files selected yet.</p>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.div
                  className={`dv-selected-file dv-selected-file--${item.state}`}
                  key={item.key}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.16 }}
                >
                  {item.state === 'working' ? (
                    <Loader2 className="dv-spin" size={16} aria-hidden="true" />
                  ) : item.state === 'done' ? (
                    <Check size={16} aria-hidden="true" />
                  ) : item.state === 'error' ? (
                    <AlertCircle size={16} aria-hidden="true" />
                  ) : (
                    <FileVideo2 size={16} aria-hidden="true" />
                  )}
                  <span className="dv-selected-file-name" title={item.file.name}>
                    {item.file.name}
                    {(item.state === 'working' || item.message) && (
                      <small className="dv-selected-file-status">
                        {item.state === 'working' && item.stage
                          ? `${stageLabels[item.stage]}${item.stage === 'uploading' && item.percent !== undefined ? ` · ${item.percent}%` : '…'}`
                          : item.message}
                      </small>
                    )}
                  </span>
                  <span className="dv-selected-file-size">{formatFileSize(item.file.size)}</span>
                  <button
                    className="dv-remove-file"
                    type="button"
                    aria-label={`Remove ${item.file.name}`}
                    disabled={isUploading || item.state === 'working'}
                    onClick={() => {
                      setItems((current) => current.filter((entry) => entry.key !== item.key))
                      inputRef.current?.focus()
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                  {item.state === 'working' && item.stage === 'uploading' && (
                    <span className="dv-file-progress" aria-hidden="true">
                      <span style={{ width: `${item.percent ?? 0}%` }} />
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {error && <p className="dv-form-error" role="alert">{error}</p>}

        <footer className="dv-dialog-actions">
          <button className="cc-button cc-button--quiet" type="button" disabled={isUploading} onClick={onClose}>
            {items.some((item) => item.state === 'done') ? 'Close' : 'Cancel'}
          </button>
          <button
            className="cc-button cc-button--primary"
            type="button"
            disabled={pending === 0 || isUploading || !apiConfigured}
            onClick={startUpload}
          >
            <Upload size={15} aria-hidden="true" />
            {isUploading ? 'Uploading…' : hasErrors ? 'Retry failed' : `Upload & analyze${pending > 1 ? ` (${pending})` : ''}`}
          </button>
        </footer>
      </motion.div>
    </motion.dialog>
  )
}
