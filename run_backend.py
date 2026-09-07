#!/usr/bin/env python3
"""
Convenience launcher from project root.
Runs backend/run.py.
"""
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))

from run import main

if __name__ == "__main__":
    main()
