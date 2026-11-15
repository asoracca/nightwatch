from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    frontend_origin: str = 'http://localhost:3000'
    model_path: str = '/models/yolo11n.pt'
    model_version: str = 'yolo11n-u8.4.213-t2.15.0'
    model_sha256: str = ''
    max_video_bytes: int = 52428800
    max_video_seconds: int = 120
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

@lru_cache
def settings():
    return Settings()
