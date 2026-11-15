import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Volume1, Volume2, VolumeX } from 'lucide-react'
import { sfx } from './sfx'
import { useSfxPrefs } from './useSfxPrefs'

/** Topbar sound control: a speaker button opening a small panel with on/off and volume. */
export function SoundControl() {
  const prefs = useSfxPrefs()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const sliderId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const Icon = !prefs.enabled ? VolumeX : prefs.volume < 0.5 ? Volume1 : Volume2

  const toggle = () => {
    const next = !prefs.enabled
    sfx.setEnabled(next)
    // Audible confirmation that sound is now on.
    if (next) sfx.play('complete')
  }

  return (
    <div className="sound-control" ref={wrapRef}>
      <button
        className="icon-button sound-button"
        type="button"
        data-sfx="none"
        data-enabled={prefs.enabled}
        aria-label={`Sound effects: ${prefs.enabled ? 'on' : 'off'}`}
        aria-expanded={open}
        aria-controls={panelId}
        title={`Sound effects: ${prefs.enabled ? 'on' : 'off'}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon aria-hidden="true" />
      </button>

      {open && (
        <div className="sound-panel" id={panelId} role="group" aria-label="Sound effects">
          <div className="sound-panel-row">
            <span className="sound-panel-title">
              Sound effects
              <small>{prefs.enabled ? 'Interface audio on' : 'Muted'}</small>
            </span>
            <button
              className="sound-switch"
              type="button"
              role="switch"
              data-sfx="none"
              aria-checked={prefs.enabled}
              aria-label="Sound effects"
              onClick={toggle}
            >
              <span aria-hidden="true" />
            </button>
          </div>
          <label className="sound-volume" htmlFor={sliderId}>
            <span>Volume</span>
            <output>{Math.round(prefs.volume * 100)}</output>
          </label>
          <input
            id={sliderId}
            className="sound-slider"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.volume * 100)}
            disabled={!prefs.enabled}
            onChange={(event) => sfx.setVolume(Number(event.target.value) / 100)}
            // Preview the level once the user lets go.
            onPointerUp={() => sfx.play('click')}
            onKeyUp={(event) => {
              if (event.key.startsWith('Arrow')) sfx.play('click')
            }}
            style={{ '--fill': `${Math.round(prefs.volume * 100)}%` } as CSSProperties}
          />
        </div>
      )}
    </div>
  )
}
