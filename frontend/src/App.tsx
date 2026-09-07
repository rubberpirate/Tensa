import React, { useState, useEffect, useRef } from 'react';
import type { RiskEvent, CallContextState, CodecProfile } from './types';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/LandingPage';
import { RiskGauge } from './components/RiskGauge';
import { AudioOscilloscope } from './components/AudioOscilloscope';
import { ExplainabilityRadar } from './components/ExplainabilityRadar';
import { BankingTerminal } from './components/BankingTerminal';
import { CodecToggle } from './components/CodecToggle';
import { CallMetadataPanel } from './components/CallMetadataPanel';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioStream } from './hooks/useAudioStream';
import { Mic, Play, Square, Upload, Radio, Sparkles, ArrowLeft } from 'lucide-react';
import './App.css';

export const App: React.FC = () => {
  // Simple, robust client-side routing
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname === '/soc' ? '/soc' : '/';
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname === '/soc' ? '/soc' : '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

  // Setup WebSocket connection to backend
  const { isConnected, lastRiskEvent, sendAudioChunk } = useWebSocket({
    context,
    codec: selectedCodec,
    callId,
  });

  // Setup Web Audio Stream
  const {
    isPlaying,
    sourceType,
    analyser,
    playAudioFile,
    startMic,
    stopAll,
  } = useAudioStream({
    onChunk: (chunk) => {
      sendAudioChunk(chunk);
    },
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize live backend risk events
  useEffect(() => {
    if (lastRiskEvent) {
      setLocalRiskEvent(lastRiskEvent);
      setWindowCount(lastRiskEvent.bayesian_window_count || ((w: number) => w + 1));
    }
  }, [lastRiskEvent]);

  // Real-time call duration timer
  useEffect(() => {
    let timer: number | null = null;
    if (isPlaying) {
      timer = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying]);

  const handleCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      playAudioFile(url, 'custom');
    }
  };

  const getSourceLabel = () => {
    switch (sourceType) {
      case 'mic':
        return 'Live Microphone (Active Stream)';
      case 'sample_genuine':
        return 'Genuine Call Sample (output.wav)';
      case 'sample_fake':
        return 'Synthetic Attack Sample (samp.mp3)';
      case 'custom':
        return 'Custom Audio File Stream';
      default:
        return 'Ready / Idle';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Global Navigation */}
      <Navigation currentPath={currentPath} onNavigate={navigateTo} />

      {/* Main View Router */}
      {currentPath === '/' ? (
        <LandingPage onLaunchDemo={() => navigateTo('/soc')} />
      ) : (
        /* Live SOC Detection Workbench */
        <main className="app-container py-6">
          {/* Breadcrumb / Top Bar in SOC */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateTo('/')}
                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
                title="Back to Landing Page"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    Live Detection SOC Workbench
                  </h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    Real-Time Pipeline
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Interactive real-time audio analysis, biometric risk scoring, and banking interceptor
                </p>
              </div>
            </div>

            {/* Connection Status Indicator */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-xs">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span>{isConnected ? 'Backend Stream Synchronized (FastAPI / PyTorch)' : 'Connecting to Voice Integrity Engine...'}</span>
              </div>
            </div>
          </div>

          {/* Audio Source Control Bar */}
          <section className="clean-card p-4 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Live Mic Button */}
              <button
                onClick={isPlaying && sourceType === 'mic' ? stopAll : startMic}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer ${
                  sourceType === 'mic'
                    ? 'bg-blue-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{sourceType === 'mic' ? 'Mute Live Mic' : 'Live Microphone'}</span>
              </button>

              {/* Genuine Audio Preset */}
              <button
                onClick={() => playAudioFile('/output.wav', 'sample_genuine')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  sourceType === 'sample_genuine'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Genuine Call (output.wav)</span>
              </button>

              {/* Synthetic Voice Clone Preset */}
              <button
                onClick={() => playAudioFile('/samp.mp3', 'sample_fake')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sourceType === 'sample_fake'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Deepfake Voice Clone (samp.mp3)</span>
              </button>

              {/* Custom File Upload */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleCustomUpload}
                accept="audio/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Audio</span>
              </button>

              {isPlaying && (
                <button
                  onClick={stopAll}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  <span>Stop</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Radio className={`w-3.5 h-3.5 ${isPlaying ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className={isPlaying ? 'text-blue-700 font-semibold' : 'text-slate-500'}>
                {getSourceLabel()}
              </span>
            </div>
          </section>

          {/* Main Threat Dashboard Grid */}
          <div className="dashboard-grid-top">
            {/* Left: Central Risk Gauge */}
            <RiskGauge
              score={localRiskEvent.composite_risk_score}
              threatLevel={localRiskEvent.threat_level}
              actionRecommended={localRiskEvent.action_recommended}
            />

            {/* Right: Oscilloscope + Metadata Telemetry */}
            <div className="flex flex-col gap-5">
              <AudioOscilloscope
                analyserNode={analyser}
                isPlaying={isPlaying}
                threatLevel={localRiskEvent.threat_level}
                audioSourceLabel={getSourceLabel()}
              />

              <CallMetadataPanel
                callId={localRiskEvent.call_id || callId}
                durationSeconds={callDuration}
                bayesianWindowCount={windowCount}
                tier1LatencyMs={localRiskEvent.tier1_latency_ms ?? 0.0}
                tier2LatencyMs={localRiskEvent.tier2_latency_ms ?? null}
                isConnected={isConnected}
              />
            </div>
          </div>

          {/* Forensic Explainability & Banking Interceptor Grid */}
          <div className="dashboard-grid-bottom">
            {/* 6-Axis Forensic Radar */}
            <ExplainabilityRadar metrics={localRiskEvent.metrics_breakdown} />

            {/* Banking Fraud Interceptor Terminal */}
            <BankingTerminal
              threatLevel={localRiskEvent.threat_level}
              compositeScore={localRiskEvent.composite_risk_score}
              actionRecommended={localRiskEvent.action_recommended}
              context={context}
              onUpdateContext={(newCtx) => setContext((prev) => ({ ...prev, ...newCtx }))}
            />
          </div>

          {/* Telecom Codec Degradation Testing */}
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
