"""
dependencies.py — FastAPI Dependency Injection Providers
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.core.config import TensaConfig, settings
from app.models.tier2_engine import Tier2Engine, get_tier2_engine as _get_tier2_engine
from app.services.audio_processor import AudioProcessor, get_audio_processor as _get_audio_processor
from app.services.session_manager import SessionManager, get_session_manager as _get_session_manager


@lru_cache()
def get_settings() -> TensaConfig:
    """Return application settings singleton."""
    return settings


def get_tier2_engine() -> Tier2Engine:
    """Return shared Tier-2 neural engine."""
    return _get_tier2_engine()


def get_session_manager() -> SessionManager:
    """Return active call session registry."""
    return _get_session_manager()


def get_audio_processor() -> AudioProcessor:
    """Return in-memory audio decoding & resampling service."""
    return _get_audio_processor()


# Type aliases for clean endpoint signatures
SettingsDep = Annotated[TensaConfig, Depends(get_settings)]
Tier2EngineDep = Annotated[Tier2Engine, Depends(get_tier2_engine)]
SessionManagerDep = Annotated[SessionManager, Depends(get_session_manager)]
AudioProcessorDep = Annotated[AudioProcessor, Depends(get_audio_processor)]
