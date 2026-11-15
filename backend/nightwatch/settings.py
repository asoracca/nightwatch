from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV = Path(__file__).resolve().parents[2] / '.env'

class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    frontend_origin: str = 'http://localhost:3000'
    model_path: str = '/models/yolo11n.pt'
    model_version: str = 'yolo11n-u8.4.213-t2.15.0'
    model_sha256: str = ''
    # Model used when a job does not name one (see models.CATALOG). Weights live in models_dir.
    default_model: str = 'yolo11m'
    models_dir: str = ''
    # CPU threads for inference; 0 = all cores.
    inference_threads: int = 0
    max_video_bytes: int = 52428800
    max_video_seconds: int = 120
    recordings_bucket: str = ''
    # One configuration file for the whole repository (backend, worker, scripts and the Vite frontend).
    # Real environment variables (Docker/Render) take precedence; a missing file is ignored.
    model_config = SettingsConfigDict(env_file=ROOT_ENV, extra='ignore')

@lru_cache
def settings():
    return Settings()
