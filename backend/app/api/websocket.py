"""
websocket.py — Compatibility Layer for Legacy WebSocket Imports
"""

from app.api.v1.endpoints.stream import stream_audio_ws
from app.services.session_manager import CallSession, get_session_manager

# Expose session map for legacy direct access
_sessions = get_session_manager()._sessions

__all__ = ["CallSession", "_sessions", "stream_audio_ws"]
