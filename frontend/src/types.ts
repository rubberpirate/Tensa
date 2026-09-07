export type ThreatLevel = 'GREEN' | 'AMBER' | 'RED';

export interface MetricsBreakdown {
  s_fast: number;
  phase_inconsistency: number;
  bicoherence_deficit: number;
  pitch_jitter_anomaly: number;
  respiration_cadence_score: number;
  spectral_rolloff_anomaly: number;
  s_deep: number | null;
  context_boost: number;
}

export interface RiskEvent {
  call_id: string;
  timestamp_ms: number;
  composite_risk_score: number;
  threat_level: ThreatLevel;
  action_recommended: string;
  metrics_breakdown: MetricsBreakdown;
  context_reasons: string[];
  bayesian_log_odds: number;
  bayesian_window_count: number;
  tier1_latency_ms?: number;
  tier2_latency_ms?: number | null;
}

export interface CallContextState {
  transactionAmountINR: number;
  callerChannel: 'REGISTERED_SIP' | 'UNREGISTERED_VOIP';
  isOffHours: boolean;
  detectedKeywords: string[];
}

export type CodecProfile =
  | 'raw'
  | 'g711_ulaw'
  | 'g711_alaw'
  | 'amr_nb'
  | 'g722'
  | 'voip_jitter';

export interface SessionSummary {
  completedAt: number;
  durationSeconds: number;
  windowCount: number;
  meanScore: number;
  peakScore: number;
  minScore: number;
  meanMetrics: MetricsBreakdown;
  threatLevel: ThreatLevel;
  actionRecommended: string;
  sourceType: string;
  sourceName: string;
  completedNaturally: boolean;
}
