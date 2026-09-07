import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { RiskEvent, CallContextState, CodecProfile, SessionSummary, MetricsBreakdown, ThreatLevel } from './types';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/LandingPage';
import { RiskGauge } from './components/RiskGauge';
import { AudioOscilloscope } from './components/AudioOscilloscope';
import { ExplainabilityRadar } from './components/ExplainabilityRadar';
import { BankingTerminal } from './components/BankingTerminal';
import { CodecToggle } from './components/CodecToggle';
import { CallMetadataPanel } from './components/CallMetadataPanel';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioStream, type PlaybackStats } from './hooks/useAudioStream';
import {
  Mic,
  Play,
  Square,
  Upload,
  Radio,
  Sparkles,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Card } from './components/ui/card';
import { Separator } from './components/ui/separator';
import { cn } from './lib/utils';
import './App.css';

const normalizePath = (pathname: string, hash: string): string => {
  const cleanPath = pathname.toLowerCase().replace(/\/+$/, '');
  const cleanHash = hash.toLowerCase().replace(/^#\/?/, '');
  if (cleanPath === '/soc' || cleanHash === 'soc') {
    return '/soc';
  }
  return '/';
};

export const App: React.FC = () => {
  // Resilient client-side routing supporting /soc, /soc/, #soc, #/soc
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return normalizePath(window.location.pathname, window.location.hash);
    }
    return '/';
  });

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(normalizePath(window.location.pathname, window.location.hash));
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Call Context State
  const [context, setContext] = useState<CallContextState>({
    transactionAmountINR: 500000,
    callerChannel: 'REGISTERED_SIP',
    isOffHours: false,
    detectedKeywords: [],
  });

  // Codec selection
  const [selectedCodec, setSelectedCodec] = useState<CodecProfile>('raw');

  // Streaming Call State
  const [callId] = useState<string>(() => `call-${Math.floor(Math.random() * 900000 + 100000)}`);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [windowCount, setWindowCount] = useState<number>(0);

  // Completed Session Summary state (Overall Rating across complete audio duration)
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const sessionHistoryRef = useRef<Array<{ score: number; metrics: MetricsBreakdown; timestamp: number }>>([]);
  const isPlayingRef = useRef(false);
  const lastRiskEventRef = useRef<RiskEvent | null>(null);

  // Real initial state (idle / ready for streaming from backend)
  const [localRiskEvent, setLocalRiskEvent] = useState<RiskEvent>({
    call_id: callId,
    timestamp_ms: 0,
    composite_risk_score: 0.0,
    threat_level: 'GREEN',
    action_recommended: 'NORMAL',
    metrics_breakdown: {
      s_fast: 0.0,
      phase_inconsistency: 0.0,
      bicoherence_deficit: 0.0,
      pitch_jitter_anomaly: 0.0,
      respiration_cadence_score: 0.0,
      spectral_rolloff_anomaly: 0.0,
      s_deep: null,
      context_boost: 0.0,
    },
    context_reasons: [],
    bayesian_log_odds: 0.0,
    bayesian_window_count: 0,
    tier1_latency_ms: 0.0,
    tier2_latency_ms: null,
  });

  // Setup WebSocket connection to backend (active when in SOC view)
  const { isConnected, connectionStatus, lastRiskEvent, sendAudioChunk, reconnect } = useWebSocket({
    context,
    codec: selectedCodec,
    callId,
    enabled: currentPath === '/soc',
  });

  const handlePlaybackComplete = useCallback(
    (stats: PlaybackStats) => {
      // Delay slightly so any trailing WebSocket chunk update is flushed and added
      setTimeout(() => {
        const history = sessionHistoryRef.current;
        const fallbackEvent = lastRiskEventRef.current || localRiskEvent;
        const samples =
          history.length > 0
            ? history
            : [
                {
                  score: fallbackEvent.composite_risk_score,
                  metrics: fallbackEvent.metrics_breakdown,
                  timestamp: Date.now(),
                },
              ];

        const scores = samples.map((s) => s.score);
        const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const peakScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        const count = samples.length;

        const meanMetrics: MetricsBreakdown = {
          s_fast: samples.reduce((acc, s) => acc + (s.metrics.s_fast || 0), 0) / count,
          phase_inconsistency: samples.reduce((acc, s) => acc + (s.metrics.phase_inconsistency || 0), 0) / count,
          bicoherence_deficit: samples.reduce((acc, s) => acc + (s.metrics.bicoherence_deficit || 0), 0) / count,
          pitch_jitter_anomaly: samples.reduce((acc, s) => acc + (s.metrics.pitch_jitter_anomaly || 0), 0) / count,
          respiration_cadence_score: samples.reduce((acc, s) => acc + (s.metrics.respiration_cadence_score || 0), 0) / count,
          spectral_rolloff_anomaly: samples.reduce((acc, s) => acc + (s.metrics.spectral_rolloff_anomaly || 0), 0) / count,
          s_deep: samples.some((s) => s.metrics.s_deep !== null)
            ? samples.filter((s) => s.metrics.s_deep !== null).reduce((acc, s) => acc + (s.metrics.s_deep as number), 0) /
              samples.filter((s) => s.metrics.s_deep !== null).length
            : null,
          context_boost: samples.reduce((acc, s) => acc + (s.metrics.context_boost || 0), 0) / count,
        };

        const threatLevel: ThreatLevel =
          meanScore >= 0.7 ? 'RED' : meanScore >= 0.35 ? 'AMBER' : 'GREEN';

        const actionRecommended =
          threatLevel === 'RED'
            ? 'CRITICAL_BLOCK_TRANSACTION'
            : threatLevel === 'AMBER'
            ? 'STEP_UP_VOICE_CHALLENGE'
            : 'ALLOW_VERIFIED_HUMAN';

        setSessionSummary({
          completedAt: Date.now(),
          durationSeconds: stats.duration,
          windowCount: count,
          meanScore,
          peakScore,
          minScore,
          meanMetrics,
          threatLevel,
          actionRecommended,
          sourceType: stats.sourceType,
          sourceName: stats.sourceName,
          completedNaturally: stats.completedNaturally,
        });
      }, 350);
    },
    [localRiskEvent]
  );

  // Setup Web Audio Stream with browser-native decoding & 16kHz resampling
  const {
    isPlaying,
    isLoading,
    sourceType,
    activeFileName,
    errorMessage,
    clearError,
    analyser,
    playAudio,
    startMic,
    stopAll,
  } = useAudioStream({
    onChunk: (chunk) => {
      sendAudioChunk(chunk);
    },
    onPlaybackComplete: handlePlaybackComplete,
  });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize live backend risk events and collect historical window frames
  useEffect(() => {
    if (lastRiskEvent) {
      lastRiskEventRef.current = lastRiskEvent;
      setLocalRiskEvent(lastRiskEvent);
      setWindowCount(lastRiskEvent.bayesian_window_count || ((w: number) => w + 1));
      if (isPlayingRef.current) {
        sessionHistoryRef.current.push({
          score: lastRiskEvent.composite_risk_score,
          metrics: lastRiskEvent.metrics_breakdown,
          timestamp: lastRiskEvent.timestamp_ms || Date.now(),
        });
      }
    }
  }, [lastRiskEvent]);

  // Real-time call duration timer (preserves final duration on stop/completion)
  useEffect(() => {
    let timer: number | null = null;
    if (isPlaying) {
      timer = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying]);

  const triggerPlayAudio = (
    source: string | File,
    type: 'sample_genuine' | 'sample_fake' | 'custom',
    customName?: string
  ) => {
    setSessionSummary(null);
    sessionHistoryRef.current = [];
    setCallDuration(0);
    playAudio(source, type, customName);
  };

  const triggerStartMic = () => {
    setSessionSummary(null);
    sessionHistoryRef.current = [];
    setCallDuration(0);
    startMic();
  };

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      triggerPlayAudio(file, 'custom', file.name);
    }
    // Reset file input value so re-selecting the exact same file fires onChange every time
    e.target.value = '';
  };

  const getSourceLabel = () => {
    if (isLoading) {
      return 'Decoding & Resampling Audio...';
    }
    switch (sourceType) {
      case 'mic':
        return 'Live Microphone (Active Stream)';
      case 'sample_genuine':
        return `Genuine Call Sample (${activeFileName || 'output.wav'})`;
      case 'sample_fake':
        return `Synthetic Attack Sample (${activeFileName || 'samp.mp3'})`;
      case 'custom':
        return `Custom Audio Stream: ${activeFileName || 'Uploaded File'}`;
      default:
        return 'Ready / Idle';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Global Navigation */}
      <Navigation
        currentPath={currentPath}
        onNavigate={navigateTo}
        isConnected={isConnected}
      />

      {/* Main View Router */}
      {currentPath === '/' ? (
        <LandingPage onLaunchDemo={() => navigateTo('/soc')} />
      ) : (
        /* Live SOC Detection Workbench */
        <main className="app-container py-6">
          {/* Breadcrumb / Top Bar in SOC */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateTo('/')}
                title="Back to Landing Page"
                className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900 gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Overview</span>
              </Button>
              <Separator orientation="vertical" className="h-4 hidden sm:block" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    Live SOC Detection Workbench
                  </h1>
                  <Badge variant="outline" className="text-[10px] font-mono py-0 text-slate-600 bg-slate-50 border-slate-200 hidden sm:inline-flex">
                    Real-Time Pipeline
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-[10px] py-0 hidden sm:inline-flex">
                    #{callId}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Interactive real-time audio analysis, biometric risk scoring, and banking interceptor
                </p>
              </div>
            </div>

            {/* Connection Status Indicator */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white border border-slate-200/80 text-xs font-medium text-slate-600 shadow-2xs">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected
                      ? 'bg-emerald-500 animate-pulse'
                      : connectionStatus === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-red-400'
                  }`}
                />
                <span className="text-[11px] font-mono">
                  {isConnected
                    ? 'FastAPI / PyTorch Synchronized'
                    : connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Engine Offline'}
                </span>
                {!isConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={reconnect}
                    className="h-5 px-1.5 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200"
                    title="Retry connection"
                  >
                    <RefreshCw className="w-2.5 h-2.5 mr-1" />
                    <span>Reconnect</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Error Banner if audio file decoding fails */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearError}
                className="h-6 text-[11px] text-rose-700 hover:bg-rose-100"
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Audio Ingestion & Playback Command Bar */}
          <Card className="p-2 sm:p-2.5 bg-white border-slate-200/80 shadow-xs flex flex-wrap justify-between items-center gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Live Mic Button */}
              <Button
                variant={sourceType === 'mic' ? 'destructive' : 'outline'}
                size="sm"
                onClick={isPlaying && sourceType === 'mic' ? stopAll : triggerStartMic}
                disabled={isLoading}
                className="gap-1.5 h-8 text-xs font-medium shadow-2xs"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{sourceType === 'mic' ? 'Mute Mic' : 'Live Microphone'}</span>
                {sourceType === 'mic' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                )}
              </Button>

              <Separator orientation="vertical" className="h-5 mx-0.5 hidden sm:block" />

              {/* Genuine Audio Preset */}
              <Button
                variant={sourceType === 'sample_genuine' ? 'default' : 'outline'}
                size="sm"
                onClick={() => triggerPlayAudio('/output.wav', 'sample_genuine', 'output.wav')}
                disabled={isLoading}
                className="gap-1.5 h-8 text-xs font-medium shadow-2xs"
              >
                <Play className="w-3 h-3 text-emerald-600" />
                <span>Genuine Call (output.wav)</span>
              </Button>

              {/* Synthetic Voice Clone Preset */}
              <Button
                variant={sourceType === 'sample_fake' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => triggerPlayAudio('/samp.mp3', 'sample_fake', 'samp.mp3')}
                disabled={isLoading}
                className="gap-1.5 h-8 text-xs font-medium shadow-2xs"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Deepfake Voice Clone (samp.mp3)</span>
              </Button>

              {/* Custom File Upload */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleCustomUpload}
                accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac"
                className="hidden"
              />
              <Button
                variant={sourceType === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="gap-1.5 h-8 text-xs font-medium shadow-2xs"
                title="Upload audio file (.wav, .mp3, .flac)"
              >
                <Upload className="w-3 h-3 text-slate-500" />
                <span>
                  {isLoading
                    ? 'Decoding...'
                    : sourceType === 'custom' && activeFileName
                    ? `File: ${activeFileName.length > 18 ? activeFileName.slice(0, 16) + '…' : activeFileName}`
                    : 'Upload Audio'}
                </span>
              </Button>

              {isPlaying && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={stopAll}
                  className="gap-1.5 h-8 text-xs font-medium ml-1 shadow-xs"
                >
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </Button>
              )}
            </div>

            {/* Active Signal Source Indicator */}
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  isPlaying
                    ? 'bg-blue-50/60 text-blue-700 border-blue-200/80 text-xs py-1 gap-1.5 font-medium shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 text-xs py-1 gap-1.5 font-medium shadow-2xs'
                }
              >
                <Radio className={`w-3.5 h-3.5 ${isPlaying ? 'text-blue-600 animate-pulse' : 'text-slate-400'}`} />
                <span>{getSourceLabel()}</span>
              </Badge>
            </div>
          </Card>

          {/* Call Session & Engine Telemetry KPI Strip */}
          <CallMetadataPanel
            callId={localRiskEvent.call_id || callId}
            durationSeconds={sessionSummary ? Math.round(sessionSummary.durationSeconds) : callDuration}
            bayesianWindowCount={sessionSummary ? sessionSummary.windowCount : windowCount}
            tier1LatencyMs={localRiskEvent.tier1_latency_ms ?? 0.0}
            tier2LatencyMs={localRiskEvent.tier2_latency_ms ?? null}
            isConnected={isConnected}
          />

          {/* Audio Stream Completed — Overall Voice Authenticity Rating Report Card */}
          {sessionSummary && (
            <Card className="p-5 bg-white border border-slate-200/90 shadow-xs rounded-xl transition-all">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-lg flex items-center justify-center shrink-0 border',
                      sessionSummary.threatLevel === 'RED'
                        ? 'bg-rose-50 text-rose-600 border-rose-200'
                        : sessionSummary.threatLevel === 'AMBER'
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                    )}
                  >
                    {sessionSummary.threatLevel === 'RED' ? (
                      <ShieldAlert className="w-5 h-5" />
                    ) : sessionSummary.threatLevel === 'AMBER' ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                        Audio Playback Completed — Overall Rating Report
                      </h2>
                      <Badge
                        variant={
                          sessionSummary.threatLevel === 'RED'
                            ? 'destructive'
                            : sessionSummary.threatLevel === 'AMBER'
                            ? 'warning'
                            : 'success'
                        }
                        className="text-[10px] uppercase font-bold"
                      >
                        {sessionSummary.threatLevel === 'RED'
                          ? 'AI Synthetic Voice Clone'
                          : sessionSummary.threatLevel === 'AMBER'
                          ? 'Suspicious Vocal Anomalies'
                          : 'Authentic Human Voice'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Analyzed audio:{' '}
                      <strong className="text-slate-700 font-semibold">{sessionSummary.sourceName}</strong> • Full
                      Duration:{' '}
                      <strong className="text-slate-700 font-semibold">
                        {sessionSummary.durationSeconds.toFixed(1)}s
                      </strong>{' '}
                      • Processed Windows:{' '}
                      <strong className="text-slate-700 font-semibold">{sessionSummary.windowCount}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (sessionSummary.sourceName === 'samp.mp3') {
                        triggerPlayAudio('/samp.mp3', 'sample_fake', 'samp.mp3');
                      } else if (sessionSummary.sourceName === 'output.wav') {
                        triggerPlayAudio('/output.wav', 'sample_genuine', 'output.wav');
                      } else {
                        setSessionSummary(null);
                      }
                    }}
                    className="gap-1.5 h-8 text-xs font-semibold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Replay Audio</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSessionSummary(null)}
                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                    title="Dismiss report card"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* 4 KPI summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {/* Mean AI Detection */}
                <div className="p-3.5 rounded-lg bg-slate-50/60 border border-slate-200/80 hover:bg-slate-50 transition-colors">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Overall Mean AI Detection
                  </span>
                  <div
                    className={cn(
                      'text-2xl font-extrabold font-mono tracking-tight',
                      sessionSummary.threatLevel === 'RED'
                        ? 'text-rose-600'
                        : sessionSummary.threatLevel === 'AMBER'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    )}
                  >
                    {Math.round(sessionSummary.meanScore * 100)}%
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Full audio duration mean
                  </span>
                </div>

                {/* Peak AI Spike */}
                <div className="p-3.5 rounded-lg bg-slate-50/60 border border-slate-200/80 hover:bg-slate-50 transition-colors">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Peak Anomaly Spike
                  </span>
                  <div className="text-2xl font-extrabold font-mono text-slate-900 tracking-tight">
                    {Math.round(sessionSummary.peakScore * 100)}%
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Highest window confidence
                  </span>
                </div>

                {/* Human Authenticity Baseline */}
                <div className="p-3.5 rounded-lg bg-slate-50/60 border border-slate-200/80 hover:bg-slate-50 transition-colors">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Authentic Human Baseline
                  </span>
                  <div className="text-2xl font-extrabold font-mono text-slate-900 tracking-tight">
                    {100 - Math.round(sessionSummary.meanScore * 100)}%
                  </div>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Biological voice likelihood
                  </span>
                </div>

                {/* Enforced Banking Policy */}
                <div className="p-3.5 rounded-lg bg-slate-50/60 border border-slate-200/80 hover:bg-slate-50 transition-colors">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Final Enforced Policy
                  </span>
                  <div className="text-xs font-bold font-mono text-slate-800 break-words mt-1">
                    {sessionSummary.actionRecommended}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {sessionSummary.threatLevel === 'RED'
                      ? 'Automatic transaction intercept'
                      : sessionSummary.threatLevel === 'AMBER'
                      ? 'Step-up voice biometric challenge'
                      : 'Immediate clearance approved'}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Master 2-Column Responsive Workspace Grid (Left 360px Decision & Enforcement / Right 1fr Forensic Lab) */}
          <div className="soc-workspace-grid">
            {/* Row 1, Col 1 (Left 360px): Central AI Voice Detection % Gauge */}
            <RiskGauge
              score={localRiskEvent.composite_risk_score}
              threatLevel={localRiskEvent.threat_level}
              actionRecommended={localRiskEvent.action_recommended}
              isCompleted={sessionSummary !== null}
              sessionSummary={sessionSummary}
            />

            {/* Row 1, Col 2 (Right 1fr): Studio-Grade Forensic Acoustic Spectrogram & Waterfall */}
            <AudioOscilloscope
              analyserNode={analyser}
              isPlaying={isPlaying}
              threatLevel={sessionSummary ? sessionSummary.threatLevel : localRiskEvent.threat_level}
              audioSourceLabel={getSourceLabel()}
            />

            {/* Row 2, Col 1 (Left 360px): Core Banking Fraud Interceptor Terminal */}
            <BankingTerminal
              threatLevel={sessionSummary ? sessionSummary.threatLevel : localRiskEvent.threat_level}
              compositeScore={sessionSummary ? sessionSummary.meanScore : localRiskEvent.composite_risk_score}
              actionRecommended={sessionSummary ? sessionSummary.actionRecommended : localRiskEvent.action_recommended}
              context={context}
              onUpdateContext={(newCtx) => setContext((prev) => ({ ...prev, ...newCtx }))}
            />

            {/* Row 2, Col 2 (Right 1fr): 6-Axis Explainable Forensic Radar & Feature Decomposition */}
            <ExplainabilityRadar
              metrics={sessionSummary ? sessionSummary.meanMetrics : localRiskEvent.metrics_breakdown}
              isSessionMean={sessionSummary !== null}
            />
          </div>

          {/* Telecom Carrier Codec Robustness Testing Panel */}
          <CodecToggle
            selectedCodec={selectedCodec}
            onSelectCodec={(codec) => setSelectedCodec(codec)}
          />
        </main>
      )}
    </div>
  );
};

export default App;
