"""
contextual.py — Contextual Risk Booster

Adds enterprise telemetry-based risk adjustments on top of acoustic scores:
  • Transaction value (wire transfer amount)
  • Caller channel type (unregistered VoIP vs registered enterprise SIP)
  • Time-of-day (off-hours emergency call urgency manipulation)
  • Keyword spotting signals (financial keywords detected in call metadata)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from app.core.config import settings


class CallerChannelType(str, Enum):
    ENTERPRISE_SIP = "enterprise_sip"           # Registered corp PBX — low risk
    REGISTERED_VOIP = "registered_voip"         # Cloud VoIP (Zoom/Teams) — low risk
    UNREGISTERED_VOIP = "unregistered_voip"     # Anonymous VoIP — +0.15 booster
    PSTN_MOBILE = "pstn_mobile"                 # Regular mobile/landline — neutral
    UNKNOWN = "unknown"


@dataclass
class CallContext:
    """Metadata about the current call passed with the WebSocket session init."""
    call_id: str = ""
    caller_number: str = ""
    caller_channel: CallerChannelType = CallerChannelType.UNKNOWN
    transaction_value_inr: float = 0.0
    is_off_hours: bool = False                  # set True if call arrives 10pm–7am IST
    financial_keyword_detected: bool = False    # set True if NLP keyword spotter fires
    enrolled_target_id: Optional[str] = None   # CXO voiceprint ID (if enrolled)
    extra_tags: dict = field(default_factory=dict)


@dataclass
class ContextBoosterResult:
    total_boost: float
    reasons: list[str]


def compute_context_boost(ctx: CallContext) -> ContextBoosterResult:
    """
    Compute the contextual risk additive boost C_context ∈ [0.0, 0.65].
    This is added directly to the raw composite risk score R(t).
    """
    boost = 0.0
    reasons: list[str] = []

    # ── Channel type ─────────────────────────────────────────────────
    if ctx.caller_channel == CallerChannelType.UNREGISTERED_VOIP:
        boost += settings.context_booster_unregistered_voip
        reasons.append(f"Unregistered VoIP caller (+{settings.context_booster_unregistered_voip:.0%})")

    # ── Off-hours ────────────────────────────────────────────────────
    if ctx.is_off_hours:
        boost += settings.context_booster_off_hours
        reasons.append(f"Off-hours emergency call (+{settings.context_booster_off_hours:.0%})")

    # ── Financial keyword ────────────────────────────────────────────
    if ctx.financial_keyword_detected:
        boost += settings.context_booster_financial_keyword
        reasons.append(f"Financial keyword detected (RTGS/OTP/wire) (+{settings.context_booster_financial_keyword:.0%})")

    # ── Transaction value ────────────────────────────────────────────
    amt = ctx.transaction_value_inr
    if amt >= settings.context_very_high_value_threshold_inr:
        boost += settings.context_booster_very_high_value
        reasons.append(
            f"Very high-value transaction ₹{amt:,.0f} "
            f"(+{settings.context_booster_very_high_value:.0%})"
        )
    elif amt >= settings.context_high_value_threshold_inr:
        boost += settings.context_booster_high_value
        reasons.append(
            f"High-value transaction ₹{amt:,.0f} "
            f"(+{settings.context_booster_high_value:.0%})"
        )

    return ContextBoosterResult(
        total_boost=min(boost, 0.65),  # cap total boost at 0.65
        reasons=reasons,
    )
