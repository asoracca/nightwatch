import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, Check, ChevronDown, Clock3, Database, FileVideo2, Tag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusBadge } from '../common/StatusBadge'
import { formatDuration } from '../data-vault/formatters'
import { VideoThumbnail } from '../data-vault/VideoThumbnail'
import { footageStatusTone, type Footage } from '../../lib/footage'
import type { FootageOrigin } from './selectedFootage'

interface FootageSelectorProps {
  footage: Footage | null
  options: Footage[]
  open: boolean
  origin: FootageOrigin | null
  onOpenChange: (open: boolean) => void
  onSelect: (item: Footage) => void
}

export function FootageSelector({
  footage,
  options,
  open,
  origin,
  onOpenChange,
  onSelect,
}: FootageSelectorProps) {
  const reduceMotion = useReducedMotion() ?? false
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }
    function onPointer(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [onOpenChange, open])

  return (
    <section className="cc-panel vs-panel vs-footage-panel" aria-labelledby="vs-footage-heading">
      <div className="vs-footage-wrap" ref={wrapRef}>
        {footage ? (
          <div className="vs-footage-selected">
            <div className="vs-footage-thumb">
              <VideoThumbnail footage={footage} compact />
            </div>
            <div className="vs-footage-copy">
              <div className="vs-footage-eyebrow">
                <span className="cc-section-eyebrow">
                  {origin ? `Selected from ${origin}` : 'Selected footage'}
                </span>
                <StatusBadge tone={footageStatusTone[footage.status]} pulse={footage.status === 'Processing'}>
                  {footage.status}
                </StatusBadge>
              </div>
              <h2 id="vs-footage-heading">{footage.title}</h2>
              <div className="vs-footage-meta">
                <span><Tag size={12} aria-hidden="true" />{footage.categoryLabel}</span>
                <span><Clock3 size={12} aria-hidden="true" />{formatDuration(footage.durationSeconds)}</span>
                <span><Camera size={12} aria-hidden="true" />{footage.source}</span>
                <span className="vs-footage-file"><FileVideo2 size={12} aria-hidden="true" />{footage.fileName}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="vs-footage-empty">
            <span className="vs-empty-icon"><FileVideo2 size={18} aria-hidden="true" /></span>
            <div>
              <h2 id="vs-footage-heading">No footage selected</h2>
              <p>Choose one of your videos or Arduino recordings, or open it from the Data Vault with “Investigate”.</p>
            </div>
          </div>
        )}

        <div className="vs-footage-actions">
          <Link className="cc-button cc-button--quiet vs-vault-link" to="/data-vault">
            <Database size={14} aria-hidden="true" />
            Data Vault
          </Link>
          <button
            ref={triggerRef}
            className={`cc-button ${footage ? 'cc-button--quiet' : 'cc-button--primary'} vs-footage-trigger`}
            type="button"
            aria-expanded={open}
            aria-controls="vs-footage-menu"
            onClick={() => onOpenChange(!open)}
          >
            {footage ? 'Change footage' : 'Select footage'}
            <ChevronDown size={14} aria-hidden="true" className={open ? 'vs-chevron is-open' : 'vs-chevron'} />
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              id="vs-footage-menu"
              className="vs-footage-menu"
              role="group"
              aria-label="Your footage"
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: 'easeOut' }}
            >
              <div className="vs-footage-menu-head">
                <span>Your footage</span>
                <span>{options.length} {options.length === 1 ? 'item' : 'items'}</span>
              </div>
              {options.length === 0 && (
                <p className="vs-footage-menu-empty">No footage yet. Upload a video in the Data Vault.</p>
              )}
              <ul>
                {options.map((item) => {
                  const selected = item.id === footage?.id
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`vs-footage-option${selected ? ' is-selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => onSelect(item)}
                      >
                        <VideoThumbnail footage={item} compact />
                        <span className="vs-footage-option-copy">
                          <strong>{item.title}</strong>
                          <span>{item.categoryLabel} · {formatDuration(item.durationSeconds)}</span>
                        </span>
                        <StatusBadge tone={footageStatusTone[item.status]}>{item.status}</StatusBadge>
                        <span className="vs-footage-option-check" aria-hidden="true">
                          {selected && <Check size={14} />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
