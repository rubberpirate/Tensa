"""
Model Preloader Daemon — Project Tensa

Loads PyTorch model weights into memory, pre-warms CUDA/CPU kernel dispatch,
and preloads audio resampling & silence detection.

All audio reading, polyphase resampling, silence checks, and real-time streaming inference
are performed directly in memory on this daemon for zero-wait latency.

Usage:
    python preload_model.py
"""

from __future__ import annotations

import argparse
import os
import pickle
import socket
import struct
import sys
import time
from pathlib import Path
from typing import List, Tuple

import numpy as np
import soundfile as sf

# Ensure detection-model directory is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from detect import (
    _get_pytorch_engine,
    _get_resampler,
    _get_silence_detector,
    get_audio_durations,
    AUDIO_SAMPLE_RATE,
    WINDOW_SECONDS,
    STRIDE_SECONDS,
    AI_THRESHOLD,
    HUMAN_THRESHOLD,
    DecisionEngine,
)

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 50000


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


class PreloadServer:
    def __init__(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
        self.host = host
        self.port = port
        self.engine = None
        self.resampler = None
        self.silence_detector = None

    def start(self) -> None:
        print("--> Loading PyTorch model weights & preprocessing components into memory...", flush=True)
        t0 = time.perf_counter()
        
        self.engine = _get_pytorch_engine()
        self.resampler = _get_resampler()
        self.silence_detector = _get_silence_detector()

        # Warm up PyTorch model execution with a dummy tensor forward pass
        dummy_chunk = np.zeros(AUDIO_SAMPLE_RATE * 3, dtype=np.float32)
        _ = self.engine.predict(dummy_chunk)

        load_time_ms = (time.perf_counter() - t0) * 1000.0
        print(f"--> Model & preprocessors preloaded and warmed up successfully in {load_time_ms:.1f} ms.", flush=True)
        print(f"--> Target Device: {self.engine.device}", flush=True)

        server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        try:
            server_sock.bind((self.host, self.port))
            server_sock.listen(5)
            print(f"--> Model Loader daemon is running and listening on {self.host}:{self.port}...", flush=True)
            print("--> Run `python detect.py <audio_file>` for instant real-time streaming inference.\n", flush=True)

            while True:
                conn, _ = server_sock.accept()
                try:
                    while True:
                        req = recv_ipc_msg(conn)
                        if req is None:
                            break
                        cmd = req.get("cmd")
                        if cmd == "ping":
                            send_ipc_msg(conn, {"status": "ok", "message": "pong"})
                        elif cmd == "predict":
                            audio_chunk = req.get("audio_chunk")
                            if audio_chunk is None:
                                send_ipc_msg(conn, {"status": "error", "error": "No audio chunk provided"})
                            else:
                                ai_prob, latency_ms = self.engine.predict(audio_chunk)
                                send_ipc_msg(conn, {"status": "ok", "result": (ai_prob, latency_ms)})
                        elif cmd == "stream_file" or cmd == "detect_file":
                            self.process_stream_request(conn, req)
                            break
                        else:
                            send_ipc_msg(conn, {"status": "error", "error": f"Unknown command: {cmd}"})
                except (ConnectionResetError, BrokenPipeError):
                    pass
                finally:
                    conn.close()
        except KeyboardInterrupt:
            print("\n--> Shutting down Model Loader daemon.")
        finally:
            server_sock.close()

    def process_stream_request(self, conn: socket.socket, req: dict) -> None:
        audio_path = req.get("audio_path")
        window_seconds = req.get("window_seconds", WINDOW_SECONDS)
        stride_seconds = req.get("stride_seconds", STRIDE_SECONDS)
        direct = req.get("direct", False)

        if not audio_path or not os.path.exists(audio_path):
            send_ipc_msg(conn, {"status": "error", "error": f"Audio file not found: {audio_path}"})
            return

        t_start_all = time.perf_counter()

        audio_data, sr = sf.read(audio_path, dtype="float32")
        audio_16k = self.resampler.resample(audio_data, source_sample_rate=sr)
        total_sec = len(audio_16k) / AUDIO_SAMPLE_RATE

        # Stream header frame immediately
        send_ipc_msg(
            conn,
            {
                "status": "ok",
                "type": "header",
                "total_duration_sec": total_sec,
                "sample_rate": sr,
            },
        )

        if direct:
            ai_prob, latency_ms = self.engine.predict(audio_16k)
            real_prob = 1.0 - ai_prob
            prediction = "FAKE" if ai_prob >= 0.5 else "REAL"
            send_ipc_msg(
                conn,
                {
                    "type": "direct_result",
                    "prediction": prediction,
                    "prob_real": real_prob,
                    "prob_fake": ai_prob,
                    "confidence": max(ai_prob, real_prob),
                    "latency_ms": latency_ms,
                },
            )
            return

        win_samples = int(window_seconds * AUDIO_SAMPLE_RATE)
        hop_samples = int(stride_seconds * AUDIO_SAMPLE_RATE)

        if len(audio_16k) < win_samples:
            padded = np.zeros(win_samples, dtype=np.float32)
            padded[: len(audio_16k)] = audio_16k
            audio_16k = padded

        start_idx = 0
        decision_engine = DecisionEngine()
        window_results = []

        while start_idx + win_samples <= len(audio_16k):
            chunk = audio_16k[start_idx : start_idx + win_samples]
            t_win_start = start_idx / AUDIO_SAMPLE_RATE
            t_win_end = (start_idx + win_samples) / AUDIO_SAMPLE_RATE
            window_str = f"{t_win_start:.1f}s - {t_win_end:.1f}s"

            is_empty, dbfs = self.silence_detector.is_empty(chunk)
            if is_empty:
                frame = {
                    "type": "window",
                    "window": window_str,
                    "raw_ai_score": None,
                    "ema_score": decision_engine.ema_score,
                    "latency_ms": 0.0,
                    "status": "SILENT",
                }
            else:
                raw_ai_score, latency_ms = self.engine.predict(chunk)
                status, ema_score = decision_engine.update(raw_ai_score)
                frame = {
                    "type": "window",
                    "window": window_str,
                    "raw_ai_score": raw_ai_score,
                    "ema_score": ema_score,
                    "latency_ms": latency_ms,
                    "status": status,
                }

            window_results.append(frame)
            send_ipc_msg(conn, frame)
            start_idx += hop_samples

        total_latency_ms = (time.perf_counter() - t_start_all) * 1000.0

        status_label = decision_engine.current_status.upper()
        if status_label == "UNKNOWN":
            status_label = "AI" if decision_engine.ema_score >= AI_THRESHOLD else ("HUMAN" if decision_engine.ema_score <= HUMAN_THRESHOLD else "UNCERTAIN")

        total_sec, active_sec, trimmed_sec = get_audio_durations(audio_16k, self.silence_detector)

        final_prediction = "FAKE" if decision_engine.ema_score >= 0.5 else "REAL"
        prob_fake = decision_engine.ema_score
        prob_real = 1.0 - prob_fake

        # Stream final end summary frame
        send_ipc_msg(
            conn,
            {
                "type": "end",
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
            },
        )


def main():
    parser = argparse.ArgumentParser(description="Tensa Model Preloader Daemon")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port number (default: 50000)")
    args = parser.parse_args()

    server = PreloadServer(host=args.host, port=args.port)
    server.start()


if __name__ == "__main__":
    main()
