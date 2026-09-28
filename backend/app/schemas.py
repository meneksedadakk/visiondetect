"""API'nin disariya verdigi veri sekilleri."""

from typing import List

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class ModelResponse(BaseModel):
    model: str
    device: str
    loaded: bool
    status: str
    last_error: str = ""


class ClassResponse(BaseModel):
    class_id: int
    class_name: str


class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    x1: int
    y1: int
    x2: int
    y2: int


class ImageDetectionResponse(BaseModel):
    frame_width: int = Field(gt=0)
    frame_height: int = Field(gt=0)
    inference_ms: float = Field(ge=0.0)
    detections: List[Detection]
