import json
import math
import subprocess
from pathlib import Path

def probe(path, max_seconds=120):
    try:
        r = subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],
                           capture_output=True,check=True,timeout=30)
        data = json.loads(r.stdout)
        stream = next(s for s in data['streams'] if s['codec_type']=='video')
        duration = float(data['format']['duration'])
        # Some AVI/MJPEG files report avg_frame_rate as 0/0; fall back to r_frame_rate.
        rates = [stream.get(k,'0/0') for k in ('avg_frame_rate','r_frame_rate')]
        fps = next(n/d for n,d in (map(float,r.split('/')) for r in rates) if n and d)
        width,height = int(stream['width']),int(stream['height'])
        formats = set(data['format']['format_name'].split(','))
        if not formats.intersection({'mov','mp4','matroska','webm','avi'}):
            raise ValueError()
        if not all(math.isfinite(x) for x in [duration,fps]) or not (0 < duration <= max_seconds and 0 < fps <= 240 and 0 < width <= 3840 and 0 < height <= 2160):
            raise ValueError()
        return {'duration_seconds':duration,'fps':fps,'width':width,'height':height}
    except (subprocess.SubprocessError,KeyError,ValueError,StopIteration,ZeroDivisionError):
        raise ValueError('Invalid, empty, unsupported, or oversized-duration video')
    except FileNotFoundError:
        raise ValueError('FFmpeg/ffprobe is not installed on the processing server')

def extract(path, directory, fps, duration):
    directory = Path(directory)
    directory.mkdir(parents=True,exist_ok=True)
    subprocess.run(['ffmpeg','-nostdin','-v','error','-xerror','-i',str(path),'-an','-t',str(duration),
                    '-vf',f"fps={fps}:start_time=0,scale=960:540:force_original_aspect_ratio=decrease",'-q:v','3',
                    '-frames:v',str(math.ceil(duration*fps)),str(directory/'%06d.jpg')],check=True,timeout=180)
    paths = sorted(directory.glob('*.jpg'))
    if not paths:
        raise ValueError('Video contains no decodable frames')
    return [(i,i/fps,p) for i,p in enumerate(paths)]

def visibility(frame, condition):
    import cv2
    import numpy as np
    if condition == 'clear':
        return frame
    if condition == 'low_light':
        return np.clip(frame.astype(np.float32)*0.25,0,255).astype(np.uint8)
    if condition == 'fog':
        return cv2.addWeighted(frame,0.45,np.full_like(frame,230),0.55,0)
    if condition == 'blurry':
        return cv2.GaussianBlur(frame,(21,21),6)
    raise ValueError('Unknown visibility condition')
