"""Download only the pinned official YOLO artifact and verify it before use."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

MODEL_URL = 'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt'
MODEL_SHA256 = '0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1'

def fetch(destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(MODEL_URL, timeout=120) as response:
        data = response.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != MODEL_SHA256:
        raise ValueError('Official model artifact failed integrity verification')
    destination.write_bytes(data)

if __name__ == '__main__':
    import sys
    fetch(sys.argv[1])
