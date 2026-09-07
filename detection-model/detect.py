"""
Project Tensa — Unified High-Performance Voice Detection Engine

Combines:
  1. CUDA FP16 Tensor Core acceleration + optional torch.compile() (~12ms latency).
  2. Scipy polyphase rational resampler (10x faster than librosa).
  3. Sliding-window inference with Exponential Moving Average (EMA) smoothing and hysteresis.
  4. Audio Silence & Empty Audio Detection (RMS + dBFS thresholding) to avoid false triggers on silence.
  5. DPDP-compliant in-memory array inference (detect_array) for zero-disk streaming.
  6. Built-in ONNX export & INT8 Dynamic Quantization setup for lightweight edge CPU inference.
  7. Integration with Wav2Vec2StreamingDetector for real-time 250ms chunk streaming.
"""

from __future__ import annotations

import argparse
import collections
import os
import pickle
import socket
import struct
import sys
import time
from collections import deque
from pathlib import Path
from typing import Deque, Dict, List, Literal, Optional, Tuple, Union

StatusType = Literal["ai", "human", "unknown"]

HF_REPO_ID = "garystafford/wav2vec2-deepfake-voice-detector"
LOCAL_DIR = Path(__file__).resolve().parent
LOCAL_WEIGHTS = LOCAL_DIR / "model.safetensors"
LOCAL_ONNX = LOCAL_DIR / "model.onnx"
LOCAL_ONNX_INT8 = LOCAL_DIR / "model_int8.onnx"

AUDIO_SAMPLE_RATE = 16000
WINDOW_SECONDS = 3.0
STRIDE_SECONDS = 1.0
WINDOW_SAMPLES = int(AUDIO_SAMPLE_RATE * WINDOW_SECONDS)  # 48,000 samples
STRIDE_SAMPLES = int(AUDIO_SAMPLE_RATE * STRIDE_SECONDS)  # 16,000 samples

# Aggregation & Hysteresis Thresholds
AI_THRESHOLD = 0.65
HUMAN_THRESHOLD = 0.35
EMA_ALPHA = 0.4
AI_CONFIRMATIONS = 2
HUMAN_CONFIRMATIONS = 2

# Silence Detection Thresholds
SILENCE_DB_THRESHOLD = -45.0  # Chunks below -45 dBFS are considered empty/silent
MIN_RMS_THRESHOLD = 0.001


# ---------------------------------------------------------------------------
# Silence & Empty Audio Detector
# ---------------------------------------------------------------------------

class AudioSilenceDetector:
    """
    Detects empty or silent audio chunks based on RMS energy and decibel level (dBFS).
    Optionally utilizes webrtcvad if installed in the environment.
    """

    def __init__(self, silence_db_threshold: float = SILENCE_DB_THRESHOLD, min_rms_threshold: float = MIN_RMS_THRESHOLD):
        self.silence_db_threshold = silence_db_threshold
        self.min_rms_threshold = min_rms_threshold

        try:
            import webrtcvad
            self.webrtcvad = webrtcvad.Vad(1)
        except ImportError:
            self.webrtcvad = None

    def is_empty(self, audio_chunk: np.ndarray, sample_rate: int = AUDIO_SAMPLE_RATE) -> Tuple[bool, float]:
        """
        Returns (is_empty: bool, dbfs_level: float).
        audio_chunk is assumed to be float32 1D numpy array in [-1.0, 1.0].
        """
        import numpy as np
        if len(audio_chunk) == 0:
            return True, -100.0

        # Calculate Root Mean Square (RMS) energy
        rms = float(np.sqrt(np.mean(np.square(audio_chunk))))
        if rms < 1e-7:
            return True, -100.0

        # Convert RMS to dBFS
        dbfs = float(20.0 * np.log10(rms))

        # Primary check: energy below threshold
        if dbfs < self.silence_db_threshold or rms < self.min_rms_threshold:
            return True, dbfs

        # Optional WebRTC VAD check if webrtcvad package is available
        if self.webrtcvad is not None:
            pcm_data = (audio_chunk * 32767.0).clip(-32768, 32767).astype(np.int16).tobytes()
            frame_size = int(sample_rate * 0.03) * 2  # 30ms frame in bytes (2 bytes/sample)
            has_speech = False
            for offset in range(0, len(pcm_data) - frame_size, frame_size):
                frame = pcm_data[offset : offset + frame_size]
                if self.webrtcvad.is_speech(frame, sample_rate):
                    has_speech = True
                    break
            if not has_speech:
                return True, dbfs

        return False, dbfs


def get_audio_durations(audio_16khz: np.ndarray, silence_detector: AudioSilenceDetector, frame_sec: float = 0.1) -> Tuple[float, float, float]:
    """
    Calculates (total_duration, active_duration, trimmed_silence_duration) in seconds.
    """
    total_sec = len(audio_16khz) / AUDIO_SAMPLE_RATE
    if total_sec == 0:
        return 0.0, 0.0, 0.0

    frame_samples = int(AUDIO_SAMPLE_RATE * frame_sec)
    if frame_samples == 0:
        return total_sec, total_sec, 0.0

    num_frames = len(audio_16khz) // frame_samples
    active_frames = 0
    for i in range(num_frames):
        frame = audio_16khz[i * frame_samples : (i + 1) * frame_samples]
        is_empty, _ = silence_detector.is_empty(frame)
        if not is_empty:
            active_frames += 1

    active_sec = active_frames * frame_sec
    active_sec = min(active_sec, total_sec)
    trimmed_sec = max(0.0, total_sec - active_sec)
    return total_sec, active_sec, trimmed_sec


# ---------------------------------------------------------------------------
# Audio Resampler (Scipy Polyphase — 10x faster than librosa)
# ---------------------------------------------------------------------------

class AudioResampler:
    """Fast rational polyphase resampler to 16kHz float32 mono."""

    def __init__(self, target_sample_rate: int = AUDIO_SAMPLE_RATE):
        self.target_sample_rate = target_sample_rate

    def resample(self, audio_array: np.ndarray, source_sample_rate: int) -> np.ndarray:
        import numpy as np
        from scipy import signal
        if len(audio_array) == 0:
            return np.array([], dtype=np.float32)

        # Convert stereo to mono
        if audio_array.ndim > 1:
            audio_array = np.mean(audio_array, axis=1)

        audio_array = audio_array.astype(np.float32)
        if source_sample_rate == self.target_sample_rate:
            return audio_array

        gcd = np.gcd(int(source_sample_rate), int(self.target_sample_rate))
        up = int(self.target_sample_rate // gcd)
        down = int(source_sample_rate // gcd)
        resampled = signal.resample_poly(audio_array, up, down)
        return resampled.astype(np.float32)


# ---------------------------------------------------------------------------
# Decision Engine (Rolling EMA & Hysteresis State Machine)
# ---------------------------------------------------------------------------

class DecisionEngine:
    """Rolling EMA probability aggregator and hysteresis state machine."""

    def __init__(
        self,
        ema_alpha: float = EMA_ALPHA,
        ai_threshold: float = AI_THRESHOLD,
        human_threshold: float = HUMAN_THRESHOLD,
        ai_confirmations: int = AI_CONFIRMATIONS,
        human_confirmations: int = HUMAN_CONFIRMATIONS,
    ):
        self.ema_alpha = ema_alpha
        self.ai_threshold = ai_threshold
        self.human_threshold = human_threshold
        self.ai_confirmations = ai_confirmations
        self.human_confirmations = human_confirmations

        self.ema_score: float = 0.5
        self.history: Deque[float] = deque(maxlen=20)
        self.current_status: StatusType = "unknown"
        self.consecutive_ai_count: int = 0
        self.consecutive_human_count: int = 0
        self.total_predictions: int = 0

    def update(self, raw_ai_score: float) -> Tuple[StatusType, float]:
        self.total_predictions += 1
        self.history.append(raw_ai_score)

        if self.total_predictions == 1:
            self.ema_score = raw_ai_score
        else:
            self.ema_score = self.ema_alpha * raw_ai_score + (1.0 - self.ema_alpha) * self.ema_score

        if self.ema_score >= self.ai_threshold:
            self.consecutive_ai_count += 1
            self.consecutive_human_count = 0
        elif self.ema_score <= self.human_threshold:
            self.consecutive_human_count += 1
            self.consecutive_ai_count = 0
        else:
            self.consecutive_ai_count = 0
            self.consecutive_human_count = 0

        if self.consecutive_ai_count >= self.ai_confirmations:
            self.current_status = "ai"
        elif self.consecutive_human_count >= self.human_confirmations:
            self.current_status = "human"
        else:
            if self.consecutive_ai_count == 0 and self.consecutive_human_count == 0:
                self.current_status = "unknown"

        return self.current_status, round(self.ema_score, 4)


# ---------------------------------------------------------------------------
# PyTorch Inference Engine (CUDA FP16 Tensor Cores + torch.compile)
# ---------------------------------------------------------------------------

class PyTorchInferenceEngine:
    """High-speed PyTorch backend utilizing FP16 Tensor Cores on CUDA."""

    def __init__(self, use_compile: bool = False):
        import torch
        import numpy as np
        from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

        source = str(LOCAL_DIR) if LOCAL_WEIGHTS.exists() else HF_REPO_ID
        local_only = LOCAL_WEIGHTS.exists()

        self.feature_extractor = AutoFeatureExtractor.from_pretrained(
            source, local_files_only=local_only
        )
        self.model = AutoModelForAudioClassification.from_pretrained(
            source, local_files_only=local_only
        )
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        # FP16 Tensor Core acceleration on CUDA
        if self.device == "cuda":
            self.model = self.model.half()

        # Optional torch.compile (requires Triton C toolchain)
        if use_compile and hasattr(torch, "compile"):
            try:
                self.model = torch.compile(self.model, dynamic=True)
            except Exception:
                pass

        self.model = self.model.to(self.device)
        self.model.eval()

    def predict(self, audio_chunk: np.ndarray) -> Tuple[float, float]:
        import torch
        import numpy as np
        start = time.perf_counter()

        # Normalize to [-1, 1]
        peak = np.abs(audio_chunk).max()
        if peak > 0:
            audio_chunk = audio_chunk / peak

        inputs = self.feature_extractor(
            audio_chunk,
            sampling_rate=AUDIO_SAMPLE_RATE,
            return_tensors="pt",
            padding=True,
        )

        if self.device == "cuda" and next(self.model.parameters()).dtype == torch.float16:
            inputs = {
                k: (v.to(self.device, dtype=torch.float16) if v.is_floating_point() else v.to(self.device))
                for k, v in inputs.items()
            }
        else:
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits.float(), dim=-1)[0]

        ai_probability = float(probs[1].item())
        latency_ms = (time.perf_counter() - start) * 1000.0
        return ai_probability, latency_ms

    def predict_batch(self, chunks: List[np.ndarray]) -> List[Tuple[float, float]]:
        import torch
        import numpy as np
        if not chunks:
            return []

        start = time.perf_counter()

        normalized_chunks = []
        for chunk in chunks:
            peak = np.abs(chunk).max()
            if peak > 0:
                normalized_chunks.append(chunk / peak)
            else:
                normalized_chunks.append(chunk)

        inputs = self.feature_extractor(
            normalized_chunks,
            sampling_rate=AUDIO_SAMPLE_RATE,
            return_tensors="pt",
            padding=True,
        )

        if self.device == "cuda" and next(self.model.parameters()).dtype == torch.float16:
            inputs = {
                k: (v.to(self.device, dtype=torch.float16) if v.is_floating_point() else v.to(self.device))
                for k, v in inputs.items()
            }
        else:
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits.float(), dim=-1)

        total_latency_ms = (time.perf_counter() - start) * 1000.0
        per_chunk_latency_ms = total_latency_ms / len(chunks)

        results = []
        for p in probs:
            ai_prob = float(p[1].item())
            results.append((ai_prob, per_chunk_latency_ms))

        return results


# ---------------------------------------------------------------------------
# ONNX Runtime Inference Engine (Supports FP32 and INT8 Dynamic Quantization)
# ---------------------------------------------------------------------------

class ONNXInferenceEngine:
    """High-performance ONNX Runtime backend for lightweight edge / CPU inference."""

    def __init__(self, onnx_path: Union[str, Path] = LOCAL_ONNX):
        if ort is None:
            raise ImportError("onnxruntime is not installed. Install via: pip install onnxruntime")

        onnx_path = Path(onnx_path)
        if not onnx_path.exists():
            raise FileNotFoundError(f"ONNX model file not found at: {onnx_path}")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        opts.inter_op_num_threads = 1
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        available = ort.get_available_providers()
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if "CUDAExecutionProvider" in available else ["CPUExecutionProvider"]
        self.session = ort.InferenceSession(str(onnx_path), opts, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

        source = str(LOCAL_DIR) if (LOCAL_DIR / "preprocessor_config.json").exists() else HF_REPO_ID
        try:
            self.feature_extractor = AutoFeatureExtractor.from_pretrained(source)
        except Exception:
            self.feature_extractor = None

    def predict(self, audio_chunk: np.ndarray) -> Tuple[float, float]:
        start = time.perf_counter()
        audio_flat = audio_chunk.flatten().astype(np.float32)

        if self.feature_extractor is not None:
            processed = self.feature_extractor(
                audio_flat,
                sampling_rate=AUDIO_SAMPLE_RATE,
                return_tensors="np",
            )
            input_tensor = processed.input_values.astype(np.float32)
        else:
            mean = np.mean(audio_flat)
            std = np.std(audio_flat)
            normalized = (audio_flat - mean) / (std + 1e-7)
            input_tensor = np.expand_dims(normalized, axis=0).astype(np.float32)

        outputs = self.session.run([self.output_name], {self.input_name: input_tensor})
        latency_ms = (time.perf_counter() - start) * 1000.0

        logits = outputs[0][0]
        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / np.sum(exp_logits)
        ai_probability = float(probs[1]) if len(probs) >= 2 else float(1.0 / (1.0 + np.exp(-logits[0])))
        return ai_probability, latency_ms


# ---------------------------------------------------------------------------
# Global Shared PyTorch Model Cache (for fast in-memory array inference)
# ---------------------------------------------------------------------------

_global_pytorch_engine: Optional[PyTorchInferenceEngine] = None
_global_resampler: Optional[AudioResampler] = None
_global_silence_detector: Optional[AudioSilenceDetector] = None


def send_ipc_msg(sock: socket.socket, data: any) -> None:
    payload = pickle.dumps(data, protocol=pickle.HIGHEST_PROTOCOL)
    sock.sendall(struct.pack("!I", len(payload)) + payload)


def recv_ipc_msg(sock: socket.socket) -> any:
    raw_len = sock.recv(4)
    if not raw_len or len(raw_len) < 4:
        return None
    msg_len = struct.unpack("!I", raw_len)[0]
    data = bytearray()
    while len(data) < msg_len:
        packet = sock.recv(min(65536, msg_len - len(data)))
        if not packet:
            return None
        data.extend(packet)
    return pickle.loads(bytes(data))


class PreloadedEngineClient:
    """Client proxy for communicating with the model preloader daemon."""

    def __init__(self, host: str = "127.0.0.1", port: int = 50000):
        self.host = host
        self.port = port
        self.sock: Optional[socket.socket] = None

    def connect(self) -> bool:
        if self.sock is not None:
            return True
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect((self.host, self.port))
            send_ipc_msg(sock, {"cmd": "ping"})
            resp = recv_ipc_msg(sock)
            if resp and resp.get("status") == "ok":
                sock.settimeout(60.0)
                self.sock = sock
                return True
            sock.close()
            return False
        except (ConnectionRefusedError, socket.timeout, OSError):
            return False

    def predict(self, audio_chunk: np.ndarray) -> Tuple[float, float]:
        if not self.connect():
            raise RuntimeError("Preloaded model server disconnected")
        try:
            send_ipc_msg(self.sock, {"cmd": "predict", "audio_chunk": audio_chunk})
            resp = recv_ipc_msg(self.sock)
            if resp and resp.get("status") == "ok":
                return resp["result"]
            raise RuntimeError(f"Preloaded server error: {resp}")
        except (ConnectionResetError, BrokenPipeError, OSError):
            self.sock = None
            raise

    def close(self) -> None:
        if self.sock is not None:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    def stream_file(
        self,
        audio_path: str,
        window_seconds: float = WINDOW_SECONDS,
        stride_seconds: float = STRIDE_SECONDS,
        direct: bool = False,
    ) -> dict:
        if not self.connect():
            raise RuntimeError("Preloaded model server disconnected")
        try:
            send_ipc_msg(
                self.sock,
                {
                    "cmd": "stream_file",
                    "audio_path": os.path.abspath(audio_path),
                    "window_seconds": window_seconds,
                    "stride_seconds": stride_seconds,
                    "direct": direct,
                },
            )

            header = recv_ipc_msg(self.sock)
            if not header or header.get("status") != "ok":
                raise RuntimeError(f"Preloaded server error: {header}")

            total_sec = header["total_duration_sec"]
            sr = header["sample_rate"]

            print(f"--> Reading audio: {audio_path}", flush=True)
            print(f"--> Duration: {total_sec:.2f}s | Sample Rate: {sr} Hz -> {AUDIO_SAMPLE_RATE} Hz", flush=True)
            print("--> Reusing preloaded model weights from memory.", flush=True)

            if direct:
                res = recv_ipc_msg(self.sock)
                print()
                print(f"File:        {audio_path}")
                print(f"Prediction:  {res['prediction']}")
                print(f"Real:        {res['prob_real']:.2%}")
                print(f"Fake:        {res['prob_fake']:.2%}")
                print(f"Confidence:  {res['confidence']:.2%}")
                print(f"Latency:     {res['latency_ms']:.1f} ms")
                return res

            print("\n" + "-" * 75, flush=True)
            print(f"{'Time Window':<16} | {'Raw AI Score':<14} | {'EMA Score':<12} | {'Latency':<10} | {'Status':<8}", flush=True)
            print("-" * 75, flush=True)

            while True:
                msg = recv_ipc_msg(self.sock)
                if not msg:
                    break
                msg_type = msg.get("type")
                if msg_type == "window":
                    raw_str = f"{msg['raw_ai_score']:.2%}" if msg['raw_ai_score'] is not None else "[EMPTY/SILENT]"
                    ema_str = f"{msg['ema_score']:.2%}"
                    lat_str = f"{msg['latency_ms']:.1f}ms"
                    stat_str = msg['status'].upper()
                    print(f"{msg['window']:<16} | {raw_str:<14} | {ema_str:<12} | {lat_str:<10} | {stat_str:<8}", flush=True)
                elif msg_type == "end":
                    print("-" * 75 + "\n", flush=True)
                    active_pct = (msg['active_duration_sec'] / msg['total_duration_sec'] * 100.0) if msg['total_duration_sec'] > 0 else 0.0

                    print(f"File:                      {audio_path}")
                    print(f"Original Audio Duration:   {msg['total_duration_sec']:.2f}s")
                    print(f"Active (Processed) Audio:  {msg['active_duration_sec']:.2f}s ({active_pct:.1f}%)")
                    print(f"Final Call Status:         {msg['status']} ({msg['prediction']})")
                    print(f"Final Smoothed AI Score:   {msg['prob_fake']:.2%}")
                    print(f"Final Human/Real Score:    {msg['prob_real']:.2%}")
                    print(f"Total Processing Time:     {msg['latency_ms']:.1f} ms", flush=True)
                    return msg
        except (ConnectionResetError, BrokenPipeError, OSError):
            self.sock = None
            raise


def _get_preloaded_client(host: str = "127.0.0.1", port: int = 50000) -> Optional[PreloadedEngineClient]:
    client = PreloadedEngineClient(host=host, port=port)
    if client.connect():
        return client
    return None


def _get_pytorch_engine(use_compile: bool = False) -> PyTorchInferenceEngine:
    global _global_pytorch_engine
    if _global_pytorch_engine is None:
        _global_pytorch_engine = PyTorchInferenceEngine(use_compile=use_compile)
    return _global_pytorch_engine


def _get_resampler() -> AudioResampler:
    global _global_resampler
    if _global_resampler is None:
        _global_resampler = AudioResampler(target_sample_rate=AUDIO_SAMPLE_RATE)
    return _global_resampler


def _get_silence_detector() -> AudioSilenceDetector:
    global _global_silence_detector
    if _global_silence_detector is None:
        _global_silence_detector = AudioSilenceDetector()
    return _global_silence_detector


# ---------------------------------------------------------------------------
# Public In-Memory Array Inference (DPDP-Compliant: No Disk I/O)
# ---------------------------------------------------------------------------

def detect_array(audio_array: np.ndarray, sample_rate: int = AUDIO_SAMPLE_RATE) -> dict:
    """
    Run high-speed inference on a raw Float32 numpy array without touching disk.
    DPDP / privacy compliant for real-time streaming architectures.

    Args:
        audio_array: Float32 numpy array, shape (N,).
        sample_rate: Audio sample rate (polyphase-resampled to 16kHz if different).

    Returns:
        dict with keys: prediction, prob_real, prob_fake, confidence, latency_ms
    """
    preloaded = _get_preloaded_client()
    engine = preloaded if preloaded is not None else _get_pytorch_engine()
    resampler = _get_resampler()

    try:
        if sample_rate != AUDIO_SAMPLE_RATE:
            audio_array = resampler.resample(audio_array, source_sample_rate=sample_rate)

        ai_prob, latency_ms = engine.predict(audio_array)
        real_prob = 1.0 - ai_prob
        prediction = "FAKE" if ai_prob >= 0.5 else "REAL"

        return {
            "prediction": prediction,
            "prob_real": real_prob,
            "prob_fake": ai_prob,
            "confidence": max(ai_prob, real_prob),
            "latency_ms": latency_ms,
        }
    finally:
        if isinstance(engine, PreloadedEngineClient):
            engine.close()


# ---------------------------------------------------------------------------
# File-Based Inference with Sliding Window, Silence Check & EMA Smoothing
# ---------------------------------------------------------------------------

def detect(
    audio_path: str,
    use_onnx: bool = False,
    use_streaming: bool = False,
    use_compile: bool = False,
    window_seconds: float = WINDOW_SECONDS,
    stride_seconds: float = STRIDE_SECONDS,
    direct: bool = False,
) -> dict:
    """
    Analyze an audio file path.

    Modes:
      - Default: Sliding window (3.0s window, 1.0s stride) with silence detection & EMA smoothing.
      - direct: Single full-clip array inference without windowing.
      - use_streaming: 250ms streaming simulation with CNN cache via Wav2Vec2StreamingDetector.
      - use_onnx: High-speed INT8 / FP32 ONNX Runtime inference.
    """
    if not os.path.exists(audio_path):
        print(f"Error: Audio file not found: {audio_path}")
        sys.exit(1)

    # Fast path: Real-Time Socket IPC Streaming from Preloaded Daemon
    if not use_onnx and not use_streaming:
        preloaded_client = _get_preloaded_client()
        if preloaded_client is not None:
            try:
                return preloaded_client.stream_file(
                    audio_path=audio_path,
                    window_seconds=window_seconds,
                    stride_seconds=stride_seconds,
                    direct=direct,
                )
            finally:
                preloaded_client.close()

    import soundfile as sf
    import numpy as np

    audio_data, sr = sf.read(audio_path, dtype="float32")
    resampler = _get_resampler()
    audio_16k = resampler.resample(audio_data, source_sample_rate=sr)
    duration_sec = len(audio_16k) / AUDIO_SAMPLE_RATE

    print(f"--> Reading audio: {audio_path}")
    print(f"--> Duration: {duration_sec:.2f}s | Sample Rate: {sr} Hz -> {AUDIO_SAMPLE_RATE} Hz")

    # Streaming mode via Wav2Vec2StreamingDetector
    if use_streaming:
        try:
            from model_runner import Wav2Vec2StreamingDetector
            detector = Wav2Vec2StreamingDetector()
            detector.load()
            result = detector.detect_array(audio_16k, sample_rate=AUDIO_SAMPLE_RATE)
            print()
            print(f"File:        {audio_path}")
            print(f"Prediction:  {result.prediction}")
            print(f"Real:        {result.prob_real:.2%}")
            print(f"Fake:        {result.prob_fake:.2%}")
            print(f"Confidence:  {result.confidence:.2%}")
            print(f"Latency:     {result.latency_ms:.1f} ms")
            return {
                "prediction": result.prediction,
                "prob_real": result.prob_real,
                "prob_fake": result.prob_fake,
                "confidence": result.confidence,
                "latency_ms": result.latency_ms,
            }
        except ImportError:
            print("[Warning] model_runner not available, falling back to sliding window.")

    # Direct single-pass mode
    if direct:
        res = detect_array(audio_16k, sample_rate=AUDIO_SAMPLE_RATE)
        print()
        print(f"File:        {audio_path}")
        print(f"Prediction:  {res['prediction']}")
        print(f"Real:        {res['prob_real']:.2%}")
        print(f"Fake:        {res['prob_fake']:.2%}")
        print(f"Confidence:  {res['confidence']:.2%}")
        print(f"Latency:     {res['latency_ms']:.1f} ms")
        return res

    # Initialize Engine (ONNX or PyTorch FP16)
    if use_onnx:
        if LOCAL_ONNX_INT8.exists():
            onnx_path = LOCAL_ONNX_INT8
        elif LOCAL_ONNX.exists():
            onnx_path = LOCAL_ONNX
        else:
            print(f"Error: ONNX model files not found in {LOCAL_DIR}")
            print("Tip: Run 'python detect.py --setup' to generate INT8 quantized ONNX models.")
            sys.exit(1)
        engine = ONNXInferenceEngine(onnx_path=onnx_path)
    else:
        preloaded_client = _get_preloaded_client()
        if preloaded_client is not None:
            print("--> Reusing preloaded model weights from memory.")
            engine = preloaded_client
        else:
            engine = _get_pytorch_engine(use_compile=use_compile)

    try:
        decision_engine = DecisionEngine()
        silence_detector = _get_silence_detector()
        win_samples = int(window_seconds * AUDIO_SAMPLE_RATE)
        hop_samples = int(stride_seconds * AUDIO_SAMPLE_RATE)

        # Pad if shorter than window
        if len(audio_16k) < win_samples:
            padded = np.zeros(win_samples, dtype=np.float32)
            padded[: len(audio_16k)] = audio_16k
            audio_16k = padded

        total_chunks = 0
        silent_chunks = 0
        active_chunks = 0

        start_idx = 0
        print("\n" + "-" * 75)
        print(f"{'Time Window':<16} | {'Raw AI Score':<14} | {'EMA Score':<12} | {'Latency':<10} | {'Status':<8}")
        print("-" * 75)

        window_results = []
        t_start_all = time.perf_counter()

        while start_idx + win_samples <= len(audio_16k):
            total_chunks += 1
            chunk = audio_16k[start_idx : start_idx + win_samples]

            t_win_start = start_idx / AUDIO_SAMPLE_RATE
            t_win_end = (start_idx + win_samples) / AUDIO_SAMPLE_RATE
            window_str = f"{t_win_start:.1f}s - {t_win_end:.1f}s"

            # Check if 3-second chunk is empty / silent before running model
            is_empty, dbfs = silence_detector.is_empty(chunk)
            if is_empty:
                silent_chunks += 1
                print(f"{window_str:<16} | {'[EMPTY/SILENT]':<14} | {decision_engine.ema_score:<12.2%} | {'0.0ms':<8} | {'SILENT':<8}")
                window_results.append({
                    "window": window_str,
                    "raw_ai_score": None,
                    "ema_score": decision_engine.ema_score,
                    "latency_ms": 0.0,
                    "status": "SILENT",
                })
                start_idx += hop_samples
                continue

            active_chunks += 1
            raw_ai_score, latency_ms = engine.predict(chunk)
            status, ema_score = decision_engine.update(raw_ai_score)

            print(f"{window_str:<16} | {raw_ai_score:<14.2%} | {ema_score:<12.2%} | {latency_ms:<8.1f}ms | {status.upper():<8}")
            window_results.append({
                "window": window_str,
                "raw_ai_score": raw_ai_score,
                "ema_score": ema_score,
                "latency_ms": latency_ms,
                "status": status,
            })
            start_idx += hop_samples

        total_latency_ms = (time.perf_counter() - t_start_all) * 1000.0
        print("-" * 75 + "\n")

        status_label = decision_engine.current_status.upper()
        if status_label == "UNKNOWN":
            status_label = "AI" if decision_engine.ema_score >= AI_THRESHOLD else ("HUMAN" if decision_engine.ema_score <= HUMAN_THRESHOLD else "UNCERTAIN")

        total_sec, active_sec, trimmed_sec = get_audio_durations(audio_16k, silence_detector)
        active_pct = (active_sec / total_sec * 100.0) if total_sec > 0 else 0.0

        final_prediction = "FAKE" if decision_engine.ema_score >= 0.5 else "REAL"
        prob_fake = decision_engine.ema_score
        prob_real = 1.0 - prob_fake

        print(f"File:                      {audio_path}")
        print(f"Original Audio Duration:   {total_sec:.2f}s")
        print(f"Active (Processed) Audio:  {active_sec:.2f}s ({active_pct:.1f}%)")
        print(f"Final Call Status:         {status_label} ({final_prediction})")
        print(f"Final Smoothed AI Score:   {prob_fake:.2%}")
        print(f"Final Human/Real Score:    {prob_real:.2%}")
        print(f"Total Processing Time:     {total_latency_ms:.1f} ms")

        return {
            "prediction": final_prediction,
            "prob_real": prob_real,
            "prob_fake": prob_fake,
            "confidence": max(prob_fake, prob_real),
            "status": status_label,
            "ema_score": prob_fake,
            "latency_ms": total_latency_ms,
            "active_duration_sec": active_sec,
            "total_duration_sec": total_sec,
            "windows": window_results,
        }
    finally:
        if isinstance(engine, PreloadedEngineClient):
            engine.close()


# ---------------------------------------------------------------------------
# Automated Setup: ONNX Export & INT8 Dynamic Quantization
# ---------------------------------------------------------------------------

def setup_and_quantize() -> bool:
    """
    Automated script to export Hugging Face / local weights to ONNX
    and generate the INT8 quantized model (model_int8.onnx).
    """
    print("=" * 65)
    print(" TENSA AI VOICE DETECTOR - ONNX EXPORT & QUANTIZATION SETUP")
    print("=" * 65)

    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        import onnx
    except ImportError:
        print("\nError: 'onnx' or 'onnxruntime' is not installed.")
        print("Run: pip install onnx onnxruntime")
        return False

    model_source = str(LOCAL_DIR) if LOCAL_WEIGHTS.exists() else HF_REPO_ID
    print(f"\n[1/3] Loading base model from: {model_source}")
    extractor = AutoFeatureExtractor.from_pretrained(model_source)
    model = AutoModelForAudioClassification.from_pretrained(model_source)
    model.eval()

    print(f"[2/3] Exporting to ONNX FP32: {LOCAL_ONNX.name}...")
    dummy_input = torch.randn(1, WINDOW_SAMPLES, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy_input,
        str(LOCAL_ONNX),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input_values"],
        output_names=["logits"],
        dynamic_axes={
            "input_values": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"},
        },
    )
    extractor.save_pretrained(str(LOCAL_DIR))
    print(f"      Successfully exported FP32 model: {LOCAL_ONNX.name}")

    print(f"[3/3] Performing INT8 Dynamic Quantization: {LOCAL_ONNX_INT8.name}...")
    original_infer_shapes_path = onnx.shape_inference.infer_shapes_path

    def safe_infer_shapes_path(in_path, out_path, *args, **kwargs):
        try:
            return original_infer_shapes_path(in_path, out_path, *args, **kwargs)
        except Exception:
            import shutil
            shutil.copyfile(in_path, out_path)

    onnx.shape_inference.infer_shapes_path = safe_infer_shapes_path

    try:
        quantize_dynamic(
            model_input=str(LOCAL_ONNX),
            model_output=str(LOCAL_ONNX_INT8),
            op_types_to_quantize=["MatMul"],
            weight_type=QuantType.QUInt8,
            extra_options={
                "MatMulConstBOnly": True,
                "DefaultTensorType": onnx.TensorProto.FLOAT,
            },
        )
    finally:
        onnx.shape_inference.infer_shapes_path = original_infer_shapes_path

    print(f"      Successfully generated INT8 quantized model: {LOCAL_ONNX_INT8.name}")

    fp32_size = LOCAL_ONNX.stat().st_size / (1024 * 1024)
    int8_size = LOCAL_ONNX_INT8.stat().st_size / (1024 * 1024)
    print("\n" + "=" * 65)
    print("Model Compression Summary:")
    print(f" - FP32 ONNX Size:  {fp32_size:.1f} MB")
    print(f" - INT8 ONNX Size:  {int8_size:.1f} MB ({(1.0 - int8_size/fp32_size):.1%} reduction)")
    print("=" * 65)
    print("Done! You can now run inference with: python detect.py <audio_file> --onnx\n")
    return True


# ---------------------------------------------------------------------------
# CLI Entrypoint
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Tensa Deepfake Voice Detection")
    parser.add_argument("audio_file", nargs="?", help="Path to input audio file (.wav, .mp3, .flac)")
    parser.add_argument("--onnx", action="store_true", help="Use ONNX Runtime / INT8 quantized engine")
    parser.add_argument("--stream", action="store_true", help="Simulate 250ms streaming chunks with CNN caching")
    parser.add_argument("--direct", action="store_true", help="Run direct single-pass array inference")
    parser.add_argument("--setup", action="store_true", help="Export to ONNX FP32 and build INT8 quantized model")
    parser.add_argument("--compile", action="store_true", help="Enable torch.compile (requires Triton C toolchain)")
    parser.add_argument("--window", type=float, default=WINDOW_SECONDS, help="Sliding window size in seconds (default: 3.0)")
    parser.add_argument("--stride", type=float, default=STRIDE_SECONDS, help="Sliding window stride in seconds (default: 1.0)")
    args = parser.parse_args()

    if args.setup:
        setup_and_quantize()
        return

    if not args.audio_file:
        parser.print_help()
        sys.exit(1)

    detect(
        audio_path=args.audio_file,
        use_onnx=args.onnx,
        use_streaming=args.stream,
        use_compile=args.compile,
        window_seconds=args.window,
        stride_seconds=args.stride,
        direct=args.direct,
    )


if __name__ == "__main__":
    main()
