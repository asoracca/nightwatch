"""Download pinned official YOLO artifacts and verify them before use.

  python -m nightwatch.fetch_model <destination.pt> [yolo11n|yolo11s|yolo11m]   (default: yolo11n)
"""
from .models import CATALOG, fetch

MODEL_SHA256 = CATALOG['yolo11n']['sha256']  # kept for callers that pinned the nano checksum

if __name__ == '__main__':
    import sys
    name = sys.argv[2] if len(sys.argv) > 2 else 'yolo11n'
    fetch(name, sys.argv[1])
