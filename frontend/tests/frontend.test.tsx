import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { uploadContentType, uploadFilename, validateUpload, type Investigation, type Video } from '../src/lib/api'
import { fromRecording, fromVideo, humanStatus } from '../src/lib/footage'
import { FindingsPanel } from '../src/components/vision-studio/FindingsPanel'
import type { Recording } from '../src/lib/recordings'
import { DetectionResults } from '../src/components/vision-studio/DetectionResults'
import { detectionState, fromApiFrame } from '../src/components/vision-studio/analysis'
import { ConditionComparison } from '../src/components/vision-studio/EvidenceReport'
import { buildReport } from '../src/components/reports/reportModel'
import { historyToCsv } from '../src/components/reports/exportReports'

afterEach(cleanup)

const video = (overrides: Partial<Video> = {}): Video => ({
  id: '00000000-0000-4000-8000-000000000001',
  original_filename: 'night-clip.mp4',
  status: 'uploaded',
  use_case: 'search and rescue',
  upload_verified: true,
  expected_bytes: 1_000_000,
  content_sha256: 'a'.repeat(64),
  uploaded_at: '2026-11-15T10:00:00Z',
  duration_seconds: 12,
  fps: 30,
  width: 1280,
  height: 720,
  processing_started_at: null,
  processing_finished_at: null,
  error_message: null,
  model_name: null,
  model_version: null,
  device_id: null,
  recording_started_at: null,
  ...overrides,
})

const investigation: Investigation = {
  id: 'inv',
  video_id: video().id,
  job_id: '00000000-0000-4000-8000-0000000000aa',
  total_frames: 120,
  frames_with_detections: 40,
  total_detections: 90,
  average_confidence: 0.83,
  miss_rate: null,
  review_candidate_count: 7,
  affected_use_case: 'search and rescue',
  summary: 'Stored summary.',
  metrics_json: {
    by_condition: {
      clear: { frames: 60, detections: 60, review_frames: 2 },
      fog: { frames: 60, detections: 30, review_frames: 5 },
    },
  },
  processing_status: 'completed',
  created_at: '2026-11-15T10:05:00Z',
  completed_at: '2026-11-15T10:05:00Z',
}

describe('sign-in gate', () => {
  it('explains missing Supabase configuration instead of showing data', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('SUPABASE_URL')
    expect(screen.queryByText(/Command Center/)).not.toBeInTheDocument()
  })
})

describe('upload validation mirrors the backend contract', () => {
  const file = (name: string, size = 10) => new File([new Uint8Array(size)], name)

  it('accepts MP4, MOV and WebM and derives the MIME type from the extension', () => {
    expect(uploadContentType('a.mp4')).toBe('video/mp4')
    expect(uploadContentType('a.MOV')).toBe('video/quicktime')
    expect(uploadContentType('a.webm')).toBe('video/webm')
    expect(uploadContentType('a.avi')).toBeNull()
  })

  it('lowercases the extension because the backend pattern is case-sensitive', () => {
    expect(uploadFilename('CLIP.MP4')).toBe('CLIP.mp4')
    expect(uploadFilename('My.Clip.Mov')).toBe('My.Clip.mov')
  })

  it('rejects unsupported, empty and oversized files', () => {
    expect(validateUpload(file('ok.mp4'))).toBe('')
    expect(validateUpload(file('clip.mkv'))).toMatch(/MP4, MOV or WebM/)
    expect(validateUpload(file('empty.mp4', 0))).toMatch(/empty/)
    expect(validateUpload({ name: 'big.mp4', size: 52_428_801 } as File)).toMatch(/50 MiB/)
  })
})

describe('footage status mapping', () => {
  it('maps backend states to display states', () => {
    expect(fromVideo(video({ upload_verified: false })).status).toBe('Unverified')
    expect(fromVideo(video()).status).toBe('Uploaded')
    expect(fromVideo(video({ status: 'processing' })).status).toBe('Processing')
    expect(fromVideo(video({ status: 'completed' })).status).toBe('Analyzed')
    expect(fromVideo(video({ status: 'failed', upload_verified: false })).status).toBe('Failed')
  })

  it('marks unprocessed Arduino recordings as pending', () => {
    const recording: Recording = {
      id: 'r1',
      device_id: 'nightwatch-device-001',
      recorded_at: '2026-11-15T07:44:18Z',
      uploaded_at: '2026-11-15T07:45:00Z',
      duration_seconds: 10,
      width: 640,
      height: 480,
      fps: 15,
      file_size_bytes: 2048,
      result: null,
    }
    const item = fromRecording(recording)
    expect(item.status).toBe('Pending')
    expect(item.kind).toBe('recording')
    expect(item.categoryLabel).toBe('Arduino capture')
  })
})

describe('evidence wording', () => {
  it('does not describe no detections as proof of an empty scene', () => {
    const frame = fromApiFrame({
      id: 'f1',
      video_id: 'v',
      job_id: 'j',
      frame_number: 0,
      timestamp_seconds: 0,
      visibility_condition: 'clear',
      detections_json: [],
      inference_time_ms: 12,
      review_required: false,
      review_reason: null,
      review_status: 'pending',
      model_name: 'yolo11n',
      model_version: 'unit-test-only',
      image_url: '/fixture.jpg',
    })
    render(
      <DetectionResults
        frames={[frame]}
        condition="clear"
        minConfidence={0.4}
        threshold={0.75}
        runStatus="complete"
        loading={false}
        selectedKey={null}
        onSelect={() => undefined}
      />,
    )
    expect(screen.getByText(/does not establish/)).toBeInTheDocument()
  })

  it('separates accepted, review-band and hidden observations', () => {
    const detection = { label: 'person', bbox: [0, 0, 1, 1] as [number, number, number, number], track_id: 1 }
    expect(detectionState({ ...detection, confidence: 0.9, accepted: true }, 0.4)).toBe('Accepted')
    expect(detectionState({ ...detection, confidence: 0.5, accepted: false }, 0.4)).toBe('Review')
    expect(detectionState({ ...detection, confidence: 0.5, accepted: false }, 0.6)).toBe('Hidden')
  })

  it('uses the sensor-fused score for display and keeps the model score', () => {
    const rescued = {
      label: 'person',
      bbox: [0.4, 0.4, 0.6, 0.9] as [number, number, number, number],
      track_id: 3,
      confidence: 0.3,
      fused_confidence: 0.55,
      sensor_reasons: ['distance sensor: object at 900 mm in the beam area (+0.15)'],
      accepted: false,
    }
    expect(detectionState(rescued, 0.4)).toBe('Review')
    expect(detectionState({ ...rescued, fused_confidence: null, sensor_reasons: [] }, 0.4)).toBe('Hidden')
  })

  it('shows clear-versus-degraded change as descriptive counts', () => {
    render(<ConditionComparison investigation={investigation} />)
    expect(screen.getByText(/not ground-truth recall/)).toBeInTheDocument()
    expect(screen.getByText('-50%')).toBeInTheDocument()
  })
})

describe('human findings', () => {
  const findings = {
    version: 'findings-v1',
    headline: 'humans_found' as const,
    headline_text: 'Humans found',
    detail: 'Person seen at 2.0–3.4 s; best 76%.',
    humans_found: true,
    people: {
      accepted: 1, review: 2, frames: 3, conditions: ['clear' as const], max_tracks: 1, max_confidence: 0.76,
      max_model_confidence: 0.76, sensor_assisted: 0, first_seen_s: 2, last_seen_s: 3.4, segments: [[2, 3.4]] as [number, number][],
      best: { condition: 'clear' as const, frame_number: 15, timestamp_seconds: 3, confidence: 0.76, model_confidence: 0.76, track_id: 4, bbox: null },
      by_condition: { clear: { accepted: 1, review: 2, frames: 3, tracks: 1, max_confidence: 0.76, first_seen_s: 2, last_seen_s: 3.4 } },
    },
    objects: [],
    thresholds: { accepted: 0.75, review_floor: 0.4 },
  }

  it('takes the headline from stored findings and recording verdicts', () => {
    const analysed = fromVideo(video({ status: 'completed' }))
    const withFindings = { ...investigation, metrics_json: { ...investigation.metrics_json, findings } }
    expect(humanStatus(analysed, { [analysed.id]: withFindings })).toBe('humans_found')
    expect(humanStatus(fromVideo(video()), {})).toBeNull()
  })

  it('shows the headline, when people were visible and the best evidence', () => {
    let jumped: [string, number] | null = null
    render(<FindingsPanel findings={findings} onJump={(c, n) => (jumped = [c, n])} />)
    expect(screen.getByRole('status')).toHaveTextContent('Humans found')
    expect(screen.getByText(/Visible at:/).parentElement).toHaveTextContent('2.0–3.4 s')
    screen.getByRole('button', { name: /Best evidence/ }).click()
    expect(jumped).toEqual(['clear', 15])
  })
})

describe('reports', () => {
  it('builds a report from the stored investigation and keeps miss rate unmeasured', () => {
    const report = buildReport(fromVideo(video({ status: 'completed' })), { [video().id]: investigation })
    expect(report.status).toBe('Completed')
    expect(report.observations).toBe(90)
    expect(report.reviewCandidates).toBe(7)
    expect(historyToCsv([report])).toContain('unmeasured')
  })

  it('neutralizes spreadsheet formulas in exported CSV', () => {
    const report = buildReport(fromVideo(video({ original_filename: '=HYPERLINK(1).mp4' })), {})
    expect(historyToCsv([report])).toContain("'=HYPERLINK(1)")
  })
})
