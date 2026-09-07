"""
endpoints.py — REST API Endpoints
"""

from __future__ import annotations

import io
import time

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.models.tier2_engine import get_tier2_engine
from app.core.config import settings

router = APIRouter(prefix="/v1")


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "service": "Tensa Voice Integrity Engine",
        "timestamp": int(time.time()),
    }


@router.post("/detect/file")
async def detect_file(file: UploadFile = File(...)):
    """
    Single-file voice cloning detection endpoint.
    Accepts WAV, MP3, FLAC. Returns prediction, scores, and latency.
    Does NOT store the uploaded audio (DPDP Act 2023 compliance).
    """
    import librosa
    import soundfile as sf

    # Read uploaded bytes into memory only (no disk write)
    audio_bytes = await file.read()
    audio_buffer = io.BytesIO(audio_bytes)

    try:
        audio, sr = librosa.load(audio_buffer, sr=16000, mono=True)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Audio decode failed: {e}")
    finally:
        # Explicitly clear bytes from memory after decoding
        del audio_bytes

    engine = get_tier2_engine()
    if not engine._loaded:
        raise HTTPException(status_code=503, detail="Model not loaded yet. Retry in a moment.")

    result = await engine.evaluate(audio, s_fast=1.0)  # force Tier-2 for REST endpoint
    if result is None:
        raise HTTPException(status_code=503, detail="Inference engine unavailable")

    return JSONResponse({
        "prediction": result.prediction,
        "prob_fake": round(result.prob_fake, 4),
        "prob_real": round(result.prob_real, 4),
        "confidence": round(result.confidence, 4),
        "latency_ms": round(result.latency_ms, 2),
        "audio_duration_s": round(len(audio) / 16000, 2),
        "dpdp_note": "Audio was processed in volatile RAM only. Zero bytes retained.",
    })


@router.get("/config")
async def get_config():
    """Return current risk thresholds and latency budget configuration."""
    return {
        "risk_thresholds": {
            "green_max": settings.risk_green_max,
            "amber_max": settings.risk_amber_max,
        },
        "window_ms": settings.window_ms,
        "hop_ms": settings.hop_ms,
        "sample_rate": settings.sample_rate,
        "bayesian_decay_lambda": settings.bayesian_decay_lambda,
        "latency_budgets_ms": {
            "tier1_dsp": settings.budget_tier1_ms,
            "tier2_neural": settings.budget_tier2_ms,
            "total": settings.budget_total_ms,
        },
    }
