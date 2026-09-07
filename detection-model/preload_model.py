"""
Model Preloader Daemon — Project Tensa

Loads PyTorch model weights once in advance and keeps them preloaded in memory.
Exposes a lightweight local IPC socket server for detect.py to reuse the preloaded weights.

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

# Ensure detection-model directory is in sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from detect import _get_pytorch_engine

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

    def start(self) -> None:
        print("--> Loading PyTorch model weights into memory...", flush=True)
        t0 = time.perf_counter()
        self.engine = _get_pytorch_engine()
        load_time_ms = (time.perf_counter() - t0) * 1000.0
        print(f"--> Model loaded successfully in {load_time_ms:.1f} ms.", flush=True)
        print(f"--> Target Device: {self.engine.device}", flush=True)

        server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        try:
            server_sock.bind((self.host, self.port))
            server_sock.listen(5)
            print(f"--> Model Loader daemon is running and listening on {self.host}:{self.port}...", flush=True)
            print("--> Run `python detect.py <audio_file>` to perform high-speed inference without reloading.\n", flush=True)

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


def main():
    parser = argparse.ArgumentParser(description="Tensa Model Preloader Daemon")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Port number (default: 50000)")
    args = parser.parse_args()

    server = PreloadServer(host=args.host, port=args.port)
    server.start()


if __name__ == "__main__":
    main()
