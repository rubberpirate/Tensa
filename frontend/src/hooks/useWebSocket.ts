import { useState, useEffect, useRef, useCallback } from 'react';
import type { RiskEvent, CallContextState, CodecProfile } from '../types';

interface UseWebSocketProps {
  url?: string;
  context: CallContextState;
  codec: CodecProfile;
  callId?: string;
}

export const useWebSocket = ({
  url = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8000/v1/stream/detect`
    : 'ws://localhost:8000/v1/stream/detect',
  context,
  codec,
  callId = `call-${Date.now().toString().slice(-6)}`,
}: UseWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastRiskEvent, setLastRiskEvent] = useState<RiskEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const contextRef = useRef(context);
  contextRef.current = context;
  const codecRef = useRef(codec);
  codecRef.current = codec;

  const connect = useCallback(() => {
    try {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
        return;
      }

      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        // Send initial session init
        ws.send(
          JSON.stringify({
            event: 'session_init',
            data: {
              call_id: callId,
              call_channel: contextRef.current.callerChannel === 'REGISTERED_SIP' ? 'enterprise_sip' : 'unregistered_voip',
              caller_number: '+919876543210',
              metadata: {
                transaction_value_inr: contextRef.current.transactionAmountINR,
                is_off_hours: contextRef.current.isOffHours,
                codec: codecRef.current,
              },
            },
          })
        );
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data);
            const eventData = parsed.data || parsed;

            if (
              parsed.event === 'risk_update' ||
              parsed.type === 'risk_update' ||
              eventData.composite_risk_score !== undefined
            ) {
              setLastRiskEvent({
                call_id: eventData.call_id || callId,
                timestamp_ms: eventData.timestamp_ms || 0,
                composite_risk_score: eventData.composite_risk_score ?? 0,
                threat_level: eventData.threat_level ?? 'GREEN',
                action_recommended: eventData.action_recommended ?? 'NORMAL',
                metrics_breakdown: {
                  s_fast: eventData.metrics_breakdown?.s_fast ?? eventData.composite_risk_score ?? 0,
                  phase_inconsistency: eventData.metrics_breakdown?.phase_inconsistency ?? 0,
                  bicoherence_deficit: eventData.metrics_breakdown?.bicoherence_deficit ?? 0,
                  pitch_jitter_anomaly: eventData.metrics_breakdown?.pitch_jitter_anomaly ?? 0,
                  respiration_cadence_score: eventData.metrics_breakdown?.respiration_cadence_score ?? 0,
                  spectral_rolloff_anomaly: eventData.metrics_breakdown?.spectral_rolloff_anomaly ?? 0,
                  s_deep: eventData.metrics_breakdown?.s_deep ?? null,
                  context_boost: eventData.metrics_breakdown?.context_boost ?? 0,
                },
                context_reasons: eventData.context_reasons || [],
                bayesian_log_odds: eventData.bayesian_log_odds ?? 0,
                bayesian_window_count: eventData.window_count || eventData.bayesian_window_count || 0,
                tier1_latency_ms: eventData.tier1_latency_ms,
                tier2_latency_ms: eventData.tier2_latency_ms,
              });
            }
          } catch (e) {
            console.error('Failed to parse WebSocket JSON from backend:', e);
          }
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Try reconnecting in 2.5 seconds
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        setIsConnected(false);
      };
    } catch (err) {
      console.warn('WebSocket connection error, will retry:', err);
    }
  }, [url, callId]);

  // Connect on mount or callId/url change
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {}
      }
    };
  }, [connect]);

  // Send live context and codec changes dynamically over existing WebSocket
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          event: 'context_update',
          data: {
            call_id: callId,
            call_channel: context.callerChannel === 'REGISTERED_SIP' ? 'enterprise_sip' : 'unregistered_voip',
            metadata: {
              transaction_value_inr: context.transactionAmountINR,
              is_off_hours: context.isOffHours,
              codec: codec,
            },
          },
        })
      );
    }
  }, [context, codec, callId]);

  // Send binary audio PCM chunk directly to backend
  const sendAudioChunk = useCallback((pcmBytes: ArrayBuffer) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBytes);
    }
  }, []);

  return {
    isConnected,
    lastRiskEvent,
    sendAudioChunk,
  };
};
