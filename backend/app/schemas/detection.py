"""
detection.py — Pydantic Schemas for Single-Clip Audio Detection
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class DetectionResponse(BaseModel):
    """Result of /v1/detect/file single-file detection."""
    prediction: Literal["REAL", "FAKE"] = Field(..., description="Acoustic prediction verdict")
    prob_fake: float = Field(..., ge=0.0, le=1.0, description="Probability that the voice is cloned / synthetic")
    prob_real: float = Field(..., ge=0.0, le=1.0, description="Probability that the voice is genuine human")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Verdict confidence score max(prob_fake, prob_real)")
    latency_ms: float = Field(..., ge=0.0, description="Inference latency in milliseconds")
    audio_duration_s: float = Field(..., ge=0.0, description="Duration of processed audio in seconds")
    dpdp_note: str = Field(
        default="Audio was processed in volatile RAM only. Zero bytes retained.",
        description="DPDP Act 2023 §8 compliance confirmation",
    )
