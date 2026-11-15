'use client';
import type { Frame } from '../lib/client';
export function FrameViewer({frame, confidence}: {frame: Frame; confidence: number}) {
  return <section>
    <div className="frame">
      {/* Signed private Storage URLs; native image preserves exact overlay geometry. */}
      <img src={frame.image_url} alt={`Sample ${frame.frame_number}, ${frame.visibility_condition}, ${frame.timestamp_seconds.toFixed(2)} seconds`} />
      {frame.detections_json.filter(d => d.confidence >= confidence).map((d,i) =>
        <div key={i} className={`box ${d.accepted ? 'accepted' : 'uncertain'}`} style={{left:`${d.bbox[0]*100}%`,top:`${d.bbox[1]*100}%`,width:`${(d.bbox[2]-d.bbox[0])*100}%`,height:`${(d.bbox[3]-d.bbox[1])*100}%`}}>
          <span>{d.label} {(d.confidence*100).toFixed(1)}% · {d.track_id === null ? 'untracked' : `#${d.track_id}`}</span>
        </div>)}
    </div>
    <p>Sample {frame.frame_number} · {frame.timestamp_seconds.toFixed(2)}s · {frame.visibility_condition}</p>
    <p className="muted">{frame.review_reason || 'No observations in the review band.'} {frame.review_required ? `Review: ${frame.review_status}.` : ''}</p>
    <details><summary>Model provenance and observations</summary><p>{frame.model_version}</p>
      <ul>{frame.detections_json.map((d,i)=><li key={i}>{d.label}: {(d.confidence*100).toFixed(1)}%, track {d.track_id ?? 'unassigned'}, {d.accepted ? 'accepted' : 'review candidate'}</li>)}</ul>
      {!frame.detections_json.length && <p>No detections reported. This does not establish that the scene is empty.</p>}
    </details>
  </section>;
}
