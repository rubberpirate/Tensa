"""
endpoints.py — Compatibility Re-export for Legacy Imports
"""

from app.api.v1.router import api_v1_router as router

__all__ = ["router"]
