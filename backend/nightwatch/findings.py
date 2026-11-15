"""Human-readable findings from stored frames: is a person present, when, how confidently, under which
conditions, plus the same statistics for every other object class. Standard library only.

Headline (people only, across all conditions):
  humans_found     a person reached the accepted threshold (decision score) in at least one frame
  possible_humans  a person appeared only in the review band [review_floor, threshold)
  no_humans_found  no person at or above the review floor. This never establishes that nobody was there.

Decision score = sensor-fused confidence when sensors contributed, else the model confidence.
Track IDs are per condition and job, so `max_tracks` is the most distinct IDs in any one condition:
an upper-bound style indicator, not a count of unique people.
"""
from collections import defaultdict

from .metrics import decision_score

VERSION = 'findings-v1'
PERSON = 'person'
CONDITION_ORDER = ('clear', 'low_light', 'fog', 'blurry')
HEADLINES = {
    'humans_found': 'Humans found',
    'possible_humans': 'Possible human detected: needs review',
    'no_humans_found': 'No humans found',
}


def _segments(times, gap):
    """Merge sorted timestamps into [start, end] runs where neighbours are at most `gap` apart."""
    runs = []
    for t in sorted(set(times)):
        if runs and t - runs[-1][1] <= gap:
            runs[-1][1] = t
        else:
            runs.append([t, t])
    return [[round(a, 2), round(b, 2)] for a, b in runs]


def _class_stats(entries, threshold, gap):
    """entries: (condition, frame_number, timestamp, detection) for one label."""
    accepted = [e for e in entries if decision_score(e[3]) >= threshold]
    review = [e for e in entries if decision_score(e[3]) < threshold]
    best = max(entries, key=lambda e: decision_score(e[3]))
    tracks = defaultdict(set)
    for condition, _, _, d in entries:
        if d.get('track_id') is not None:
            tracks[condition].add(d['track_id'])
    by_condition = {}
    for condition in CONDITION_ORDER:
        mine = [e for e in entries if e[0] == condition]
        if not mine:
            continue
        top = max(mine, key=lambda e: decision_score(e[3]))
        by_condition[condition] = {
            'accepted': sum(decision_score(e[3]) >= threshold for e in mine),
            'review': sum(decision_score(e[3]) < threshold for e in mine),
            'frames': len({e[1] for e in mine}),
            'tracks': len(tracks[condition]),
            'max_confidence': round(decision_score(top[3]), 4),
            'first_seen_s': round(min(e[2] for e in mine), 2),
            'last_seen_s': round(max(e[2] for e in mine), 2),
        }
    return {
        'accepted': len(accepted),
        'review': len(review),
        'frames': len({(e[0], e[1]) for e in entries}),
        'conditions': [c for c in CONDITION_ORDER if c in by_condition],
        'max_tracks': max((len(ids) for ids in tracks.values()), default=0),
        'max_confidence': round(decision_score(best[3]), 4),
        'max_model_confidence': round(max(e[3]['confidence'] for e in entries), 4),
        'sensor_assisted': sum(1 for e in entries if e[3].get('sensor_reasons')),
        'first_seen_s': round(min(e[2] for e in entries), 2),
        'last_seen_s': round(max(e[2] for e in entries), 2),
        'segments': _segments([e[2] for e in entries], gap),
        'best': {'condition': best[0], 'frame_number': best[1], 'timestamp_seconds': round(best[2], 2),
                 'confidence': round(decision_score(best[3]), 4), 'model_confidence': round(best[3]['confidence'], 4),
                 'track_id': best[3].get('track_id'), 'bbox': best[3].get('bbox')},
        'by_condition': by_condition,
    }


def _span(segments):
    parts = [f'{a:.1f} s' if a == b else f'{a:.1f}–{b:.1f} s' for a, b in segments[:4]]
    return ', '.join(parts) + (f' (+{len(segments) - 4} more)' if len(segments) > 4 else '')


def findings(frames, threshold, review_floor, sampling_fps=5):
    """frames: rows with visibility_condition, frame_number, timestamp_seconds and detections_json."""
    gap = 1.5 / max(sampling_fps, 0.1) + 1e-6
    per_label = defaultdict(list)
    for f in frames:
        for d in f.get('detections_json') or []:
            if decision_score(d) >= review_floor:
                per_label[d['label']].append((f['visibility_condition'], f['frame_number'], f['timestamp_seconds'], d))

    labels = {label: _class_stats(entries, threshold, gap) for label, entries in per_label.items()}
    ordered = sorted(labels.items(), key=lambda kv: (kv[0] != PERSON, -kv[1]['accepted'], -kv[1]['max_confidence']))
    people = labels.get(PERSON)

    if people and people['accepted']:
        headline = 'humans_found'
    elif people:
        headline = 'possible_humans'
    else:
        headline = 'no_humans_found'

    if people:
        conditions = ', '.join(
            f"{c.replace('_', ' ')} {round(people['by_condition'][c]['max_confidence'] * 100)}%" for c in people['conditions'])
        detail = (f"Person seen at {_span(people['segments'])}; best {round(people['best']['confidence'] * 100)}% "
                  f"({people['best']['condition'].replace('_', ' ')}, {people['best']['timestamp_seconds']:.1f} s). "
                  f"By condition: {conditions}. Up to {people['max_tracks']} track ID(s) in one condition; "
                  'tracks are not unique people.')
        missed = [c for c in CONDITION_ORDER if c in {f['visibility_condition'] for f in frames} and c not in people['conditions']]
        if missed:
            detail += ' No person detected under: ' + ', '.join(c.replace('_', ' ') for c in missed) + '.'
    else:
        detail = ('No person at or above the review floor in any condition. '
                  'This does not establish that nobody was present.')
    others = [f"{label} ×{s['accepted']}" for label, s in ordered if label != PERSON and s['accepted']]
    if others:
        detail += ' Other accepted objects: ' + ', '.join(others) + '.'

    return {
        'version': VERSION,
        'headline': headline,
        'headline_text': HEADLINES[headline],
        'detail': detail,
        'humans_found': headline == 'humans_found',
        'people': people,
        'objects': [{'label': label, **stats} for label, stats in ordered],
        'thresholds': {'accepted': threshold, 'review_floor': review_floor},
    }
