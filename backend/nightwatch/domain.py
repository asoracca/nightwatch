import hashlib
import json
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator

USE_CASES = ['search and rescue', 'fire and smoke response', 'floods and natural disasters',
             'collapsed buildings', 'cave and underground rescue', 'maritime rescue and fog',
             'dangerous industrial inspection', 'remote drone inspection', 'war-zone or inaccessible environments']
Condition = Literal['clear', 'low_light', 'fog', 'blurry']

class Upload(BaseModel):
    filename: str = Field(min_length=1, max_length=200, pattern=r'^[^/\\]+\.(mp4|mov|webm)$')
    content_type: Literal['video/mp4', 'video/quicktime', 'video/webm']
    size_bytes: int = Field(gt=0, le=52428800)
    sha256: str = Field(pattern=r'^[a-f0-9]{64}$')
    use_case: str

    @model_validator(mode='after')
    def validate_use_case(self):
        if self.use_case not in USE_CASES:
            raise ValueError('Unsupported use case')
        expected = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'}
        if not self.filename.endswith(tuple(k for k,v in expected.items() if v == self.content_type)):
            raise ValueError('Extension and MIME type must agree')
        return self

class ProcessConfig(BaseModel):
    sampling_fps: float = Field(default=5, ge=0.5, le=10)
    threshold: float = Field(default=0.75, ge=0.4, le=1)
    review_floor: float = Field(default=0.40, ge=0.1, le=0.75)
    conditions: list[Condition] = Field(default_factory=lambda: ['clear'], min_length=1, max_length=4)
    reprocess: bool = False

    @model_validator(mode='after')
    def check(self):
        if self.review_floor >= self.threshold:
            raise ValueError('Review floor must be below detection threshold')
        self.conditions = sorted(set(self.conditions) | {'clear'})
        return self

class Detection(BaseModel):
    class_id: int = Field(ge=0)
    label: str
    confidence: float = Field(ge=0, le=1)
    bbox: list[float] = Field(min_length=4, max_length=4)
    track_id: Optional[int] = Field(default=None, ge=0)
    accepted: bool

    @model_validator(mode='after')
    def box(self):
        x1,y1,x2,y2 = self.bbox
        if not (0 <= x1 <= x2 <= 1 and 0 <= y1 <= y2 <= 1):
            raise ValueError('Bounding box must be normalized xyxy')
        return self

class Review(BaseModel):
    decision: Literal['confirmed', 'dismissed']
    note: str = Field(default='', max_length=1000)

class AssistantRequest(BaseModel):
    topic: Literal['summary', 'flags', 'comparison'] = 'summary'

from .metrics import idempotency_key, needs_review, summarize
