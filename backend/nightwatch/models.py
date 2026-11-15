"""Pinned detection models. Each job records the model it must run with; the worker loads exactly that file
and refuses anything whose SHA-256 differs. Weights are the official Ultralytics release assets."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

ASSET_URL = 'https://github.com/ultralytics/assets/releases/download/v8.3.0/{name}.pt'
RUNTIME = 'u8.4.213-t2.15.0'  # ultralytics / torch versions the results were produced with

CATALOG = {
    'yolo11n': {'label': 'YOLO11n', 'sha256': '0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1',
                'max_mb': 20, 'note': 'Fastest, lowest recall in the dark'},
    'yolo11s': {'label': 'YOLO11s', 'sha256': '85a76fe86dd8afe384648546b56a7a78580c7cb7b404fc595f97969322d502d5',
                'max_mb': 40, 'note': 'Balanced'},
    'yolo11m': {'label': 'YOLO11m', 'sha256': 'd5ffc1a674953a08e11a8d21e022781b1b23a19b730afc309290bd9fb5305b95',
                'max_mb': 80, 'note': 'Most accurate; best for low light; ~4x slower than nano on CPU'},
}


def version(name):
    return f'{name}-{RUNTIME}'


def name_from_version(model_version):
    return str(model_version).split('-')[0]


def label(name):
    return f"{CATALOG[name]['label']} + ByteTrack"


def models_dir(settings):
    return Path(settings.models_dir) if settings.models_dir else Path(settings.model_path).parent


def fetch(name, destination):
    """Download one official artifact and verify size and SHA-256 before writing it."""
    spec = CATALOG[name]
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    limit = spec['max_mb'] * 1024 * 1024
    with urlopen(ASSET_URL.format(name=name), timeout=300) as response:
        data = response.read(limit + 1)
    if len(data) > limit or hashlib.sha256(data).hexdigest() != spec['sha256']:
        raise ValueError(f'Official {name} artifact failed integrity verification')
    tmp = destination.with_suffix('.part')
    tmp.write_bytes(data)
    tmp.replace(destination)
    return destination


def ensure(name, settings):
    """Path to verified weights for `name`, downloading them once if missing."""
    if name not in CATALOG:
        raise ValueError(f'Model {name} is not in the pinned catalog')
    path = models_dir(settings) / f'{name}.pt'
    if not path.is_file():
        fetch(name, path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != CATALOG[name]['sha256']:
        raise ValueError(f'{path} does not match the pinned {name} checksum')
    return path
