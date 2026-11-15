import hashlib
import sys
from pathlib import Path
if len(sys.argv)!=2:raise SystemExit('Usage: python model_checksum.py /path/to/model.pt')
p=Path(sys.argv[1])
if not p.is_file():raise SystemExit('Model file not found')
print(hashlib.sha256(p.read_bytes()).hexdigest())
