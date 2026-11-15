import hashlib
import json

def idempotency_key(video_id, version, config):
    value = {k:v for k,v in config.items() if k != 'reprocess'}
    return hashlib.sha256(json.dumps([str(video_id), version, value], sort_keys=True).encode()).hexdigest()

def needs_review(detections, floor=0.4, threshold=0.75):
    return any(floor <= d['confidence'] < threshold for d in detections)

def summarize(frames, use_case):
    accepted = [d for f in frames for d in f['detections_json'] if d['accepted']]
    per_condition = {}
    for f in frames:
        stat = per_condition.setdefault(f['visibility_condition'], {'frames':0,'detections':0,'review_frames':0})
        stat['frames'] += 1
        stat['detections'] += sum(d['accepted'] for d in f['detections_json'])
        stat['review_frames'] += int(f['review_required'])
    return dict(total_frames=len(frames), frames_with_detections=sum(any(d['accepted'] for d in f['detections_json']) for f in frames),
                total_detections=len(accepted), average_confidence=sum(d['confidence'] for d in accepted)/len(accepted) if accepted else None,
                miss_rate=None, review_candidate_count=sum(f['review_required'] for f in frames),
                affected_use_case=use_case, metrics_json={'by_condition':per_condition,'ground_truth_available':False},
                summary=f"{len(frames)} sampled condition-frames; {len(accepted)} detections met the configured threshold. "
                        'Counts are object observations, not unique people. Miss rate is unavailable without ground truth. '
                        'The use case is user-selected, not inferred. Prototype evaluation; not safety-certified; does not replace rescuers. '
                        'Results depend on the uploaded footage and model.')
