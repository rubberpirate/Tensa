# Project Tensa — AI Voice Detection Model

Wav2Vec2 fine-tuned audio classification engine with **CUDA FP16 Tensor Core acceleration**, **polyphase rational resampling**, **sliding window EMA hysteresis smoothing**, and **real-time streaming with CNN encoder caching**.

---

## Features

- **Blazing Fast**: Uses FP16 half-precision on NVIDIA Tensor Cores with optional `torch.compile` kernel fusion (~12–35ms latency).
- **Fast Resampling**: Scipy rational polyphase resampling (`signal.resample_poly`), 10x faster than librosa.
- **Sliding-Window Inference**: Evaluates audio in overlapping 3.0s windows (1.0s stride) with an Exponential Moving Average (EMA, $\alpha=0.4$) and 2-step hysteresis state machine.
- **Privacy & DPDP Compliant**: Direct in-memory Float32 array inference (`detect_array`) with zero disk writes.
- **Live Streaming Support**: Integrates with `model_runner.Wav2Vec2StreamingDetector` for 250ms streaming chunk ingestion with 83% CNN feature cache reuse.
- **Quantization Support**: Built-in automated export to ONNX FP32 and INT8 Dynamic Quantization (`model_int8.onnx`), compressing model from ~1.2 GB to ~300 MB for edge CPU deployments.

---

## Quick Start

### 1. Environment Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install torch transformers soundfile scipy onnx onnxruntime
```

### 2. Run Inference on Audio Files

#### Standard Sliding-Window Mode (Default)
Breaks file into 3.0s windows with EMA smoothing and prints window-by-window scores:
```bash
python detect.py path/to/audio.wav
```

#### Real-Time Streaming Simulation (250ms chunks + CNN cache)
Simulates live streaming chunk ingestion using the 2-tier streaming detector:
```bash
python detect.py path/to/audio.wav --stream
```

#### Direct Single-Pass Mode
Runs direct in-memory array inference without sliding windows:
```bash
python detect.py path/to/audio.wav --direct
```

#### High-Speed ONNX / INT8 Quantized Mode
Runs inference via ONNX Runtime using quantized weights:
```bash
python detect.py path/to/audio.wav --onnx
```

---

### 3. Automated Model Setup (ONNX & INT8 Quantization)
To generate the INT8 quantized model (`model_int8.onnx`):
```bash
python detect.py --setup
```

---

## Python API Usage

### In-Memory Array Inference (Zero Disk I/O)
```python
import numpy as np
from detect import detect_array

# Float32 audio array at 16kHz
audio_chunk = np.random.randn(16000).astype(np.float32)
result = detect_array(audio_chunk, sample_rate=16000)

print(result["prediction"])  # "REAL" or "FAKE"
print(result["prob_fake"])   # 0.0 to 1.0
print(result["latency_ms"])  # ~12ms on GPU
```

### Streaming 250ms Chunk Ingestion
```python
from model_runner import Wav2Vec2StreamingDetector

detector = Wav2Vec2StreamingDetector()
detector.load()

# Ingest 250ms PCM chunks in real time
for chunk in audio_stream_250ms:
    result = detector.push_chunk(chunk)
    print(f"Risk: {result.prob_fake:.2%} | Latency: {result.latency_ms:.1f}ms | Cached: {result.cache_tokens_reused}")
```
