import { Camera, Cpu, Video } from 'lucide-react'
import type { Footage } from '../../lib/footage'

interface VideoThumbnailProps {
  footage: Footage
  compact?: boolean
}

/** Stylized placeholder: footage is private, so no frame is fetched just to draw a card. */
export function VideoThumbnail({ footage, compact = false }: VideoThumbnailProps) {
  const isRecording = footage.kind === 'recording'

  return (
    <span
      className={`dv-thumbnail dv-thumbnail--${footage.theme}${compact ? ' dv-thumbnail--compact' : ''}`}
      aria-hidden="true"
    >
      <span className="dv-thumbnail-grid" />
      <svg className="dv-thumbnail-scene" viewBox="0 0 360 180" fill="none">
        <path className="dv-scene-water" d="M0 119h360v61H0z" />
        <path className="dv-scene-horizon" d="M0 118h360" />
        <path className="dv-scene-building" d="M49 117V71h42v46m9 0V52h58v65m17 0V78h52v39m17 0V61h69v56" />
        <path className="dv-scene-windows" d="M61 84h8m15 0h8m27-16h10m16 0h10m-36 17h10m16 0h10m34 8h10m16 0h10m28-21h11m16 0h11m-38 17h11m16 0h11" />
        <path className="dv-scene-route" d="M22 150c48-23 76-13 117-6 55 10 92-17 153-19 24-1 43 2 62 8" />
        <circle className="dv-scene-target" cx="237" cy="106" r="13" />
        <circle className="dv-scene-target-core" cx="237" cy="106" r="3" />
      </svg>
      <span className="dv-thumbnail-topline">
        <span>
          {isRecording ? <Cpu size={11} /> : <Camera size={11} />} {footage.deviceId ?? 'UPLOAD'}
        </span>
        <span className="dv-thumbnail-record"><i /> {footage.status.toUpperCase()}</span>
      </span>
      <span className="dv-thumbnail-bottomline">
        <span>{isRecording ? 'ARDUINO FEED' : footage.categoryLabel.toUpperCase()}</span>
        <Video size={13} />
      </span>
    </span>
  )
}
