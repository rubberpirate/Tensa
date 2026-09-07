"""
detection.py — Single-File Audio Voice Cloning Detection Endpoint
"""

from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.core.exceptions import ModelInferenceError, ModelNotReadyError
from app.dependencies import AudioProcessorDep, Tier2EngineDep
from app.schemas.detection import DetectionResponse

router = APIRouter()


@router.post(
    "/detect/file",
    response_model=DetectionResponse,
    summary="Detect Voice Cloning from Audio File",
    description=(
        "Accepts WAV, MP3, FLAC, or OGG audio files. Evaluates voice authenticity "
        "via FP16 Wav2Vec2 neural inference. Operates in volatile RAM with zero disk persistence."
    ),
    responses={
        200: {"description": "Acoustic authenticity verdict and confidence score"},
        422: {"description": "Audio decoding error or unsupported format"},
        503: {"description": "Neural inference engine is warming up"},
    },
)
async def detect_file(
    file: UploadFile = File(..., description="Acoustic audio file (WAV, MP3, FLAC)"),
    audio_processor: AudioProcessorDep = None,
    tier2_engine: Tier2EngineDep = None,
) -> DetectionResponse:
    # 1. Read bytes into memory
    raw_bytes = await file.read()

    try:
        # 2. Decode and normalize to 16kHz mono in volatile memory
        audio, duration_s = audio_processor.decode_and_resample(raw_bytes, target_sr=16000)
    finally:
        # Explicit zeroing / deletion of incoming byte payload for DPDP compliance
        del raw_bytes

    # 3. Verify engine readiness
    if not tier2_engine.is_loaded:
        raise ModelNotReadyError()

    # 4. Perform FP16 neural inference (forced s_fast=1.0 for single file evaluation)
    result = await tier2_engine.evaluate(audio, s_fast=1.0)
    if result is None:
        raise ModelInferenceError("Inference engine could not process the audio window.")

    return DetectionResponse(
        prediction=result.prediction,
        prob_fake=round(result.prob_fake, 4),
        prob_real=round(result.prob_real, 4),
        confidence=round(result.confidence, 4),
        latency_ms=round(result.latency_ms, 2),
        audio_duration_s=round(duration_s, 2),
    )
