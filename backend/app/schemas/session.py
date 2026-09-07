"""
session.py — Pydantic Schemas for WebSocket Session Messages & Protocol
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


class CallMetadata(BaseModel):
    """Metadata payload attached to session initiation or context updates."""
    transaction_value_inr: float = Field(0.0, description="Transaction wire amount in INR")
    is_off_hours: bool = Field(False, description="Whether call takes place during off-hours (10pm–7am IST)")
    codec: str = Field("raw", description="Active telecom codec simulation profile")
    detected_keywords: list[str] = Field(default_factory=list, description="Keywords spotted in audio telemetry")


class SessionInitData(BaseModel):
    """Data payload for session_init event."""
    call_id: Optional[str] = Field(None, description="Unique call identifier")
    call_channel: str = Field("unknown", description="Caller channel type (enterprise_sip, unregistered_voip, etc.)")
    caller_number: str = Field("", description="Phone number or SIP URI")
    enrolled_target_id: Optional[str] = Field(None, description="Target voiceprint ID for speaker verification")
    metadata: CallMetadata = Field(default_factory=CallMetadata)


class SessionInitMessage(BaseModel):
    """Client-to-server: initialize new call session."""
    event: Literal["session_init"]
    data: SessionInitData = Field(default_factory=SessionInitData)


class ContextUpdateData(BaseModel):
    """Data payload for context_update event."""
    call_id: Optional[str] = None
    call_channel: Optional[str] = None
    caller_number: Optional[str] = None
    metadata: CallMetadata = Field(default_factory=CallMetadata)


class ContextUpdateMessage(BaseModel):
    """Client-to-server: update active call session context."""
    event: Literal["context_update", "codec_update"]
    data: ContextUpdateData = Field(default_factory=ContextUpdateData)


class SessionEndMessage(BaseModel):
    """Client-to-server: signal call termination."""
    event: Literal["session_end"]


# ── Server-to-Client Control Messages ──────────────────────────────────

class SessionReadyResponse(BaseModel):
    event: Literal["session_ready"] = "session_ready"
    call_id: str
    message: str = "Tensa streaming active. Send 250ms PCM chunks."


class ContextUpdatedResponse(BaseModel):
    event: Literal["context_updated"] = "context_updated"
    call_id: str
    codec: str
    status: Literal["ok"] = "ok"


class SessionClosedResponse(BaseModel):
    event: Literal["session_closed"] = "session_closed"


class WebSocketErrorResponse(BaseModel):
    event: Literal["error"] = "error"
    message: str
