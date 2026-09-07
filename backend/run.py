#!/usr/bin/env python3
"""
run.py — CLI Launcher for Tensa FastAPI Backend

Usage:
    python backend/run.py
    python backend/run.py --reload
    python backend/run.py --host 127.0.0.1 --port 8000 --reload
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# ── Automatically configure search paths ───────────────────────────────
CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent
DETECTION_MODEL_DIR = REPO_ROOT / "detection-model"

for p in (CURRENT_DIR, DETECTION_MODEL_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Project Tensa — Voice Cloning Detection Backend",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--host", default="0.0.0.0", help="Network host interface to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    parser.add_argument("--reload", action="store_true", help="Enable hot reloading for active development")
    parser.add_argument("--workers", type=int, default=1, help="Number of worker processes (production)")
    parser.add_argument("--log-level", default="info", choices=["debug", "info", "warning", "error"], help="Logging verbosity")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    import uvicorn

    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  🛡️  Starting Tensa Voice Integrity API")
    print(f"  📍 Host: http://{args.host}:{args.port}")
    print(f"  📖 Docs: http://{args.host}:{args.port}/docs")
    print(f"  🔌 WS:   ws://{args.host}:{args.port}/v1/stream/detect")
    print(f"  🔄 Mode: {'Hot-Reload (Dev)' if args.reload else f'{args.workers} Worker(s)'}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=args.workers if not args.reload else None,
        log_level=args.log_level,
    )


if __name__ == "__main__":
    main()
