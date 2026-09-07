import { useState, useEffect, useRef, useCallback } from 'react';
import type { RiskEvent, CallContextState, CodecProfile } from '../types';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface UseWebSocketProps {
  url?: string;
  context: CallContextState;
  codec: CodecProfile;
  callId?: string;
  enabled?: boolean;
}

const resolveDefaultWsUrls = (): string[] => {
  if (typeof window === 'undefined') {
    return ['ws://localhost:8000/v1/stream/detect'];
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const hostname = window.location.hostname;

  // Primary: Vite proxy on current host (e.g. ws://localhost:5173/v1/stream/detect)
  // Secondary: Direct backend port 8000 fallback (e.g. ws://localhost:8000/v1/stream/detect)
  const proxyUrl = `${proto}//${host}/v1/stream/detect`;
  const directUrl = `${proto}//${hostname}:8000/v1/stream/detect`;

  return proxyUrl !== directUrl ? [proxyUrl, directUrl] : [proxyUrl];
};

export const useWebSocket = ({
  url,
  context,
  codec,
  callId = `call-${Date.now().toString().slice(-6)}`,
  enabled = true,
}: UseWebSocketProps) => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastRiskEvent, setLastRiskEvent] = useState<RiskEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  const disposedRef = useRef<boolean>(false);
  const activeUrlIndexRef = useRef<number>(0);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const callIdRef = useRef(callId);
  callIdRef.current = callId;
  const contextRef = useRef(context);
  contextRef.current = context;
  const codecRef = useRef(codec);
  codecRef.current = codec;
  const customUrlRef = useRef(url);
  customUrlRef.current = url;

  const cleanupSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;

      // Nullify all callbacks so closed sockets never mutate state or trigger reconnects
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;

      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.close(1000, 'Normal closure');
        } catch (_) {}
      } else if (ws.readyState === WebSocket.CONNECTING) {
        // Defer close to avoid browser "WebSocket closed before connection established" console error
        ws.onopen = () => {
          try {
            ws.close(1000, 'Unmounted during handshake');
          } catch (_) {}
        };
      }
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current || disposedRef.current) {
      return;
    }

    // Don't connect if already connecting or open
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.CONNECTING ||
        wsRef.current.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    cleanupSocket();
    setConnectionStatus('connecting');

    const urls = customUrlRef.current ? [customUrlRef.current] : resolveDefaultWsUrls();
    const targetUrl = urls[activeUrlIndexRef.current % urls.length];

    try {
      const ws = new WebSocket(targetUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposedRef.current || wsRef.current !== ws) {
          try {
            ws.close(1000, 'Handshake abandoned');
          } catch (_) {}
          return;
        }

        setConnectionStatus('connected');
        retryCountRef.current = 0;

        // Dispatch initial session initialization
        ws.send(
          JSON.stringify({
            event: 'session_init',
            data: {
              call_id: callIdRef.current,
              call_channel:
                contextRef.current.callerChannel === 'REGISTERED_SIP'
                  ? 'enterprise_sip'
                  : 'unregistered_voip',
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
        if (disposedRef.current || wsRef.current !== ws) return;

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
                call_id: eventData.call_id || callIdRef.current,
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
        if (disposedRef.current) return;
        setConnectionStatus('disconnected');

        // Rotate to fallback URL if multiple URLs configured
        const currentUrls = customUrlRef.current ? [customUrlRef.current] : resolveDefaultWsUrls();
        activeUrlIndexRef.current = (activeUrlIndexRef.current + 1) % currentUrls.length;

        // Exponential backoff: 1.5s, 3s, max 5s
        const backoffMs = Math.min(1500 * Math.pow(1.5, retryCountRef.current), 5000);
        retryCountRef.current += 1;

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (!disposedRef.current && enabledRef.current) {
            connect();
          }
        }, backoffMs);
      };

      ws.onerror = () => {
        if (disposedRef.current) return;
        setConnectionStatus('disconnected');
      };
    } catch (err) {
      console.warn('WebSocket connection error, will retry:', err);
      setConnectionStatus('disconnected');
    }
  }, [cleanupSocket]);

  // Handle connection lifecycle
  useEffect(() => {
    disposedRef.current = false;
    enabledRef.current = enabled;

    if (enabled) {
      connect();
    } else {
      cleanupSocket();
      setConnectionStatus('disconnected');
    }

    return () => {
      disposedRef.current = true;
      cleanupSocket();
    };
  }, [enabled, connect, cleanupSocket]);

  // Send live context and codec changes dynamically over existing WebSocket
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          event: 'context_update',
          data: {
            call_id: callId,
            call_channel:
              context.callerChannel === 'REGISTERED_SIP'
                ? 'enterprise_sip'
                : 'unregistered_voip',
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

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    activeUrlIndexRef.current = 0;
    connect();
  }, [connect]);

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    lastRiskEvent,
    sendAudioChunk,
    reconnect,
  };
};
