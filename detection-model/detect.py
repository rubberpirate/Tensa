"""
Project Tensa — Enhanced detect.py
Supports both CLI (disk-based) and in-memory array inference.
Automatically uses FP16 on CUDA for lower latency.
"""

from __future__ import annotations

import os
import sys
import time
import torch
import numpy as np
import librosa

from transformers import (
    AutoModelForAudioClassification,
    AutoFeatureExtractor,
)

HF_REPO_ID = "garystafford/wav2vec2-deepfake-voice-detector"
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Model loading — prefer local weights, fallback to Hugging Face Hub
# ---------------------------------------------------------------------------

_model = None
_feature_extractor = None
_device = None


def _load_model():
    global _model, _feature_extractor, _device

    local_weights_path = os.path.join(LOCAL_DIR, "model.safetensors")
    if os.path.exists(local_weights_path):
        model_source = LOCAL_DIR
        local_only = True
        print(f"[Tensa] Loading model from local directory: {LOCAL_DIR}", flush=True)
    else:
        model_source = HF_REPO_ID
        local_only = False
        print(f"[Tensa] Local weights not found — downloading from: {HF_REPO_ID}", flush=True)

    _feature_extractor = AutoFeatureExtractor.from_pretrained(
        model_source,
        local_files_only=local_only,
    )

    _model = AutoModelForAudioClassification.from_pretrained(
        model_source,
        local_files_only=local_only,
    )

    _device = "cuda" if torch.cuda.is_available() else "cpu"

    # FP16 on CUDA: 2x memory bandwidth, Tensor Core acceleration
    if _device == "cuda":
        _model = _model.half()  # FP16
        print(f"[Tensa] Using FP16 on {torch.cuda.get_device_name(0)}", flush=True)
    else:
        print("[Tensa] CUDA not available — using CPU (FP32)", flush=True)

    # torch.compile() for kernel fusion (PyTorch 2.x)
    try:
        _model = torch.compile(_model, dynamic=True)
        print("[Tensa] torch.compile() applied (dynamic=True)", flush=True)
    except Exception as e:
        print(f"[Tensa] torch.compile() skipped: {e}", flush=True)

    _model = _model.to(_device)
    _model.eval()
    print("[Tensa] Model ready.", flush=True)


def _ensure_loaded():
    if _model is None:
        _load_model()


# ---------------------------------------------------------------------------
# In-memory array inference (DPDP-compliant: no disk I/O)
# ---------------------------------------------------------------------------

def detect_array(audio_array: np.ndarray, sample_rate: int = 16000) -> dict:
    """
    Run inference on a raw Float32 numpy array without touching disk.

    Args:
        audio_array: Float32 numpy array, shape (N,), expected at sample_rate Hz.
        sample_rate: Audio sample rate (will resample to 16kHz if different).

    Returns:
        dict with keys: prediction, prob_real, prob_fake, confidence, latency_ms
    """
    _ensure_loaded()

    # Resample if needed
    if sample_rate != 16000:
        audio_array = librosa.resample(audio_array, orig_sr=sample_rate, target_sr=16000)

    # Normalise to [-1, 1]
    peak = np.abs(audio_array).max()
    if peak > 0:
        audio_array = audio_array / peak

    inputs = _feature_extractor(
        audio_array,
        sampling_rate=16000,
        return_tensors="pt",
        padding=True,
    )

    # Cast floating-point inputs to FP16 when model is half-precision
    if _device == "cuda" and next(_model.parameters()).dtype == torch.float16:
        inputs = {
            k: (v.to(_device, dtype=torch.float16) if v.is_floating_point() else v.to(_device))
            for k, v in inputs.items()
        }
    else:
        inputs = {k: v.to(_device) for k, v in inputs.items()}

    t0 = time.perf_counter()
    with torch.no_grad():
        outputs = _model(**inputs)
        probabilities = torch.softmax(outputs.logits.float(), dim=-1)[0]
    latency_ms = (time.perf_counter() - t0) * 1000

    prob_real = probabilities[0].item()
    prob_fake = probabilities[1].item()
    prediction = "FAKE" if prob_fake > 0.5 else "REAL"

    return {
        "prediction": prediction,
        "prob_real": prob_real,
        "prob_fake": prob_fake,
        "confidence": max(prob_real, prob_fake),
        "latency_ms": latency_ms,
    }


# ---------------------------------------------------------------------------
# File-based inference (CLI / testing convenience)
# ---------------------------------------------------------------------------

def detect(audio_path: str) -> dict:
    """
    Detect from an audio file path. Resamples to 16kHz internally.
    Returns the same dict as detect_array().
    """
    audio, sr = librosa.load(audio_path, sr=16000, mono=True)
    result = detect_array(audio, sample_rate=16000)

    print()
    print(f"File:        {audio_path}")
    print(f"Prediction:  {result['prediction']}")
    print(f"Real:        {result['prob_real']:.2%}")
    print(f"Fake:        {result['prob_fake']:.2%}")
    print(f"Confidence:  {result['confidence']:.2%}")
    print(f"Latency:     {result['latency_ms']:.1f} ms")

    return result


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python detect.py <audio_file>")
        sys.exit(1)

    detect(sys.argv[1])
