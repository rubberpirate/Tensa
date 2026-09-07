import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { RiskEvent, CallContextState, CodecProfile, SessionSummary, MetricsBreakdown, ThreatLevel } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAudioStream, type PlaybackStats } from '../hooks/useAudioStream';
import { playDtmfTone, startRingbackTone, startIncomingRingtone } from '../lib/dtmfTones';
import {
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneIncoming,
  Delete,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Grid,
  Pause,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  User,
  Upload,
  Activity,
  Sliders,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Bot,
  Headphones,
  MessageSquareQuote,
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { cn } from '../lib/utils';
import { useDialerBackend } from '../hooks/useDialerBackend';

type PhoneScreenState = 'keypad' | 'outgoing_ringing' | 'incoming' | 'connected' | 'summary';

interface PhoneDialerProps {
  onOpenSoc?: () => void;
}

export const PhoneDialer: React.FC<PhoneDialerProps> = ({ onOpenSoc }) => {
  // Dial pad number buffer
  const [phoneNumber, setPhoneNumber] = useState<string>('+1 (800) 555-0199');
  const [screenState, setScreenState] = useState<PhoneScreenState>('keypad');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [isOnHold, setIsOnHold] = useState<boolean>(false);
  const [showInCallKeypad, setShowInCallKeypad] = useState<boolean>(false);
  const [showForensicDetails, setShowForensicDetails] = useState<boolean>(false);
  const [audioSourcePreset, setAudioSourcePreset] = useState<'sample_fake' | 'sample_genuine' | 'mic' | 'custom'>('sample_fake');
  const [callerName, setCallerName] = useState<string>('Suspected Bank Impersonator');
  const [callDuration, setCallDuration] = useState<number>(0);
  const [selectedCodec, setSelectedCodec] = useState<CodecProfile>('raw');

  // Time display in phone status bar
  const [currentTime, setCurrentTime] = useState<string>('09:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Preset audio configs
  const PRESET_CALLS = useMemo(
    () => [
      {
        id: 'sample_fake',
        type: 'sample_fake' as const,
        name: 'Suspected Bank Impersonator',
        number: '+1 (800) 555-0199',
        audioUrl: '/samp.mp3',
        description: 'AI Voice Clone deepfake scam attack',
        badge: 'AI Attack Scenario',
      },
      {
        id: 'sample_genuine',
        type: 'sample_genuine' as const,
        name: 'Verified Customer (Human)',
        number: '+91 98765 43210',
        audioUrl: '/output.wav',
        description: 'Authentic human voice recording',
        badge: 'Genuine Scenario',
      },
      {
        id: 'mic',
        type: 'mic' as const,
        name: 'Live Microphone Test',
        number: 'MIC-INPUT',
        audioUrl: '',
        description: 'Analyze your own live spoken voice',
        badge: 'Live Voice',
      },
    ],
    []
  );

  // Call Context for risk engine
  const [callContext] = useState<CallContextState>({
    transactionAmountINR: 250000,
    callerChannel: 'UNREGISTERED_VOIP',
    isOffHours: false,
    detectedKeywords: [],
  });

  const [callId, setCallId] = useState<string>(() => `call-${Math.floor(Math.random() * 900000 + 100000)}`);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const sessionHistoryRef = useRef<Array<{ score: number; metrics: MetricsBreakdown; timestamp: number }>>([]);
  const isPlayingRef = useRef(false);
  const lastRiskEventRef = useRef<RiskEvent | null>(null);

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

  // WebSocket connection for streaming audio detection
  const { isConnected, sendAudioChunk, lastRiskEvent } = useWebSocket({
    context: callContext,
    codec: selectedCodec,
    callId,
    enabled: true,
  });

  // Dialer Backend (Gemini 3.5 Transcribe Live & Gemini 3.5 Flash Lite)
  const [aiInterventionMode, setAiInterventionMode] = useState<'undecided' | 'handling_to_ai' | 'listening'>('undecided');
  const aiInterventionModeRef = useRef(aiInterventionMode);
  aiInterventionModeRef.current = aiInterventionMode;

  const {
    isDialerConnected,
    liveTranscript,
    liveModel,
    aiSummary,
    isSummarizing,
    connectLiveSession,
    disconnectLiveSession,
    sendAudioChunk: sendDialerAudioChunk,
    fetchSummary,
    resetDialerState,
  } = useDialerBackend();

  const liveTranscriptRef = useRef(liveTranscript);
  liveTranscriptRef.current = liveTranscript;

  // Handle Playback completion
  const handlePlaybackComplete = (stats: PlaybackStats) => {
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
          ? 'BLOCK_SYNTHETIC_CALLER'
          : threatLevel === 'AMBER'
          ? 'STEP_UP_VOICE_VERIFICATION'
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

      // If handled to AI, trigger Gemini 3.5 Flash Lite summary
      if (aiInterventionModeRef.current === 'handling_to_ai') {
        fetchSummary(liveTranscriptRef.current, {
          callerName,
          phoneNumber,
          aiScore: meanScore,
        });
      }

      setScreenState('summary');
    }, 300);
  };

  // Audio Stream Hook
  const {
    isPlaying,
    analyser,
    playAudio,
    startMic,
    stopAll,
  } = useAudioStream({
    onChunk: (chunk) => {
      sendAudioChunk(chunk);
      if (aiInterventionModeRef.current === 'handling_to_ai') {
        sendDialerAudioChunk(chunk);
      }
    },
    onPlaybackComplete: handlePlaybackComplete,
  });

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Synchronize incoming risk events from active stream
  useEffect(() => {
    if (lastRiskEvent) {
      lastRiskEventRef.current = lastRiskEvent;
      setLocalRiskEvent(lastRiskEvent);
      if (isPlayingRef.current) {
        sessionHistoryRef.current.push({
          score: lastRiskEvent.composite_risk_score,
          metrics: lastRiskEvent.metrics_breakdown,
          timestamp: lastRiskEvent.timestamp_ms || Date.now(),
        });
      }
    }
  }, [lastRiskEvent]);

  // Fallback detection trigger for standalone testing when Python engine is offline
  useEffect(() => {
    if (screenState === 'connected' && isPlaying && !isConnected && audioSourcePreset === 'sample_fake') {
      const simTimer = setTimeout(() => {
        const simulatedEvent: RiskEvent = {
          call_id: callId,
          timestamp_ms: Date.now(),
          composite_risk_score: 0.94,
          threat_level: 'RED',
          action_recommended: 'BLOCK_SYNTHETIC_CALLER',
          metrics_breakdown: {
            s_fast: 0.94,
            phase_inconsistency: 0.88,
            bicoherence_deficit: 0.91,
            pitch_jitter_anomaly: 0.89,
            respiration_cadence_score: 0.95,
            spectral_rolloff_anomaly: 0.86,
            s_deep: 0.96,
            context_boost: 0.15,
          },
          context_reasons: ['Synthetic vocoder artifacts detected', 'Absence of micro-respiration'],
          bayesian_log_odds: 4.2,
          bayesian_window_count: 6,
          tier1_latency_ms: 8.4,
          tier2_latency_ms: 18.2,
        };
        lastRiskEventRef.current = simulatedEvent;
        setLocalRiskEvent(simulatedEvent);
        sessionHistoryRef.current.push({
          score: 0.94,
          metrics: simulatedEvent.metrics_breakdown,
          timestamp: Date.now(),
        });
      }, 1500);
      return () => clearTimeout(simTimer);
    }
  }, [screenState, isPlaying, isConnected, audioSourcePreset, callId]);

  // Call duration counter
  useEffect(() => {
    let timer: number | null = null;
    if (screenState === 'connected') {
      timer = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [screenState]);

  // Ringing sounds reference
  const stopToneRef = useRef<(() => void) | null>(null);

  const cleanupTones = () => {
    if (stopToneRef.current) {
      stopToneRef.current();
      stopToneRef.current = null;
    }
  };

  useEffect(() => {
    return () => cleanupTones();
  }, []);

  // Custom audio upload file ref
  const customFileInputRef = useRef<HTMLInputElement | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);

  // Handle dial key press
  const handleKeyPress = (key: string) => {
    playDtmfTone(key, 80, soundEnabled);
    if (phoneNumber.length < 20) {
      setPhoneNumber((prev) => prev + key);
    }
  };

  // Handle backspace
  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  // Select Preset Scenario
  const handleSelectPreset = (preset: (typeof PRESET_CALLS)[number]) => {
    setAudioSourcePreset(preset.type);
    setPhoneNumber(preset.number);
    setCallerName(preset.name);
  };

  // Delegation handlers
  const handleDelegateToAi = () => {
    setAiInterventionMode('handling_to_ai');
    connectLiveSession(callId);
  };

  const handleListenToCall = () => {
    setAiInterventionMode('listening');
  };

  // Start Outgoing Call
  const handleStartOutgoingCall = () => {
    cleanupTones();
    resetDialerState();
    setAiInterventionMode('undecided');
    setSessionSummary(null);
    sessionHistoryRef.current = [];
    setCallDuration(0);
    setCallId(`call-${Math.floor(Math.random() * 900000 + 100000)}`);
    setScreenState('outgoing_ringing');

    stopToneRef.current = startRingbackTone(soundEnabled);

    // Auto answer after 2.5 seconds to simulate receiver picking up phone
    const ringTimeout = window.setTimeout(() => {
      cleanupTones();
      startActiveCallStream();
    }, 2500);

    return () => clearTimeout(ringTimeout);
  };

  // Trigger Incoming Call Simulation
  const handleSimulateIncomingCall = () => {
    cleanupTones();
    resetDialerState();
    setAiInterventionMode('undecided');
    setSessionSummary(null);
    sessionHistoryRef.current = [];
    setCallDuration(0);
    setCallId(`call-${Math.floor(Math.random() * 900000 + 100000)}`);
    setScreenState('incoming');

    stopToneRef.current = startIncomingRingtone(soundEnabled);
  };

  // Receiver accepts phone call
  const handleAcceptIncomingCall = () => {
    cleanupTones();
    startActiveCallStream();
  };

  // Receiver declines incoming call
  const handleDeclineIncomingCall = () => {
    cleanupTones();
    setScreenState('keypad');
  };

  // Begin active audio streaming once call is answered
  const startActiveCallStream = () => {
    setScreenState('connected');

    if (audioSourcePreset === 'mic') {
      startMic();
    } else if (audioSourcePreset === 'custom' && customFile) {
      playAudio(customFile, 'custom', customFile.name);
    } else if (audioSourcePreset === 'sample_genuine') {
      playAudio('/output.wav', 'sample_genuine', 'output.wav');
    } else {
      // Default: synthetic attack sample
      playAudio('/samp.mp3', 'sample_fake', 'samp.mp3');
    }
  };

  // Hang up active call
  const handleEndCall = () => {
    cleanupTones();
    stopAll();
    if (aiInterventionModeRef.current === 'handling_to_ai') {
      fetchSummary(liveTranscriptRef.current, {
        callerName,
        phoneNumber,
        aiScore: localRiskEvent.composite_risk_score,
      });
    }
    setScreenState('summary');
  };

  // Reset to keypad
  const handleResetToKeypad = () => {
    cleanupTones();
    stopAll();
    disconnectLiveSession();
    resetDialerState();
    setAiInterventionMode('undecided');
    setSessionSummary(null);
    setCallDuration(0);
    setScreenState('keypad');
  };

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Live mini waveform visualizer inside phone
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (screenState !== 'connected' || !analyser || !canvasRef.current) return;

    let animId: number;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Clean monochrome flat audio bars
      const barCount = 14;
      const barWidth = Math.floor(canvas.width / barCount) - 3;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] || 0;
        const percent = value / 255;
        const barHeight = Math.max(3, percent * (canvas.height - 4));
        const x = i * (barWidth + 3) + 2;
        const y = canvas.height - barHeight;

        // Clean solid neutral or alert bar color
        if (localRiskEvent.threat_level === 'RED') {
          ctx.fillStyle = '#ef4444';
        } else if (localRiskEvent.threat_level === 'AMBER') {
          ctx.fillStyle = '#f59e0b';
        } else {
          ctx.fillStyle = '#22c55e';
        }

        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    draw();

    return () => cancelAnimationFrame(animId);
  }, [screenState, analyser, localRiskEvent.threat_level]);

  // Standard Keypad layout definition
  const KEYPAD_BUTTONS = [
    { key: '1', sub: ' ' },
    { key: '2', sub: 'ABC' },
    { key: '3', sub: 'DEF' },
    { key: '4', sub: 'GHI' },
    { key: '5', sub: 'JKL' },
    { key: '6', sub: 'MNO' },
    { key: '7', sub: 'PQRS' },
    { key: '8', sub: 'TUV' },
    { key: '9', sub: 'WXYZ' },
    { key: '*', sub: ' ' },
    { key: '0', sub: '+' },
    { key: '#', sub: ' ' },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto py-6 px-4">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Mobile Phone Call Simulator
            </h1>
            <Badge variant="outline" className="text-[10px] font-mono py-0 text-zinc-600 bg-zinc-50 border-zinc-300">
              Zero Gradient • Flat UI
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] py-0">
              WebSocket Real-Time
            </Badge>
          </div>
          <p className="text-xs text-zinc-600 mt-0.5">
            Simulate realistic mobile phone dialer calls and detect AI voice clones instantly upon call pickup.
          </p>
        </div>

        {/* Global Controls & Status */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-8 px-2.5 text-xs font-medium text-zinc-700 border-zinc-300 bg-white"
            title={soundEnabled ? 'Mute dialer & ring tones' : 'Unmute dialer & ring tones'}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5 mr-1 text-zinc-700" />
                <span>Audio FX On</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                <span>Audio FX Off</span>
              </>
            )}
          </Button>

          {onOpenSoc && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSoc}
              className="h-8 px-3 text-xs font-semibold text-zinc-800 border-zinc-300 bg-white hover:bg-zinc-100"
            >
              <Activity className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
              <span>Open Cyber SOC</span>
              <ExternalLink className="w-3 h-3 ml-1 text-zinc-400" />
            </Button>
          )}
        </div>
      </div>

      {/* Main 2-Column Layout: Mobile Device Mockup (Left) + Simulator Controller & Telemetry (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* =========================================================================
            LEFT: Realistic Mobile Phone Device (Strictly Flat, No Gradients)
           ========================================================================= */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[360px] bg-zinc-950 text-white rounded-[44px] p-3.5 shadow-md border-2 border-zinc-800 select-none relative">
            {/* Phone Bezel Interior Screen */}
            <div className="w-full bg-zinc-900 rounded-[34px] overflow-hidden flex flex-col h-[670px] relative border border-zinc-800/80">
              {/* Phone Status Bar */}
              <div className="pt-3 px-6 pb-2 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span>{currentTime}</span>

                {/* Speaker Earpiece / Dynamic Island */}
                <div className="w-20 h-4 bg-zinc-950 rounded-full flex items-center justify-center border border-zinc-800">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 mr-1.5" />
                  <div className="w-8 h-1 rounded-full bg-zinc-800" />
                </div>

                <div className="flex items-center gap-1.5 text-[10px]">
                  <span>5G</span>
                  <div className="w-4 h-2 border border-zinc-400 rounded-xs p-0.5 flex items-center">
                    <div className="h-full w-3 bg-zinc-300 rounded-2xs" />
                  </div>
                </div>
              </div>

              {/* -------------------------------------------------------------------
                  SCREEN 1: KEYPAD DIALER VIEW
                 ------------------------------------------------------------------- */}
              {screenState === 'keypad' && (
                <div className="flex-1 flex flex-col justify-between px-5 pt-3 pb-6">
                  {/* Top Caller / Dialing Number Display */}
                  <div className="text-center pt-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-1">
                      {callerName}
                    </div>
                    <div className="min-h-[44px] flex items-center justify-center px-2">
                      <span className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white break-all">
                        {phoneNumber || ' '}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {audioSourcePreset === 'sample_fake'
                        ? 'Pre-loaded: Synthetic Deepfake Voice'
                        : audioSourcePreset === 'sample_genuine'
                        ? 'Pre-loaded: Authentic Human Voice'
                        : audioSourcePreset === 'mic'
                        ? 'Live Microphone Input'
                        : 'Custom Uploaded Audio'}
                    </p>
                  </div>

                  {/* 3x4 Standard Dial Pad Key Grid */}
                  <div className="grid grid-cols-3 gap-3.5 my-auto max-w-[280px] mx-auto w-full">
                    {KEYPAD_BUTTONS.map((b) => (
                      <button
                        key={b.key}
                        onClick={() => handleKeyPress(b.key)}
                        className="w-16 h-16 rounded-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 transition-colors flex flex-col items-center justify-center mx-auto border border-zinc-700/60 focus:outline-none"
                      >
                        <span className="text-2xl font-semibold leading-none text-white">
                          {b.key}
                        </span>
                        <span className="text-[9px] font-mono tracking-widest text-zinc-400 mt-0.5 leading-none">
                          {b.sub}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Bottom Action Row: Call Button & Backspace */}
                  <div className="grid grid-cols-3 items-center max-w-[280px] mx-auto w-full pt-1">
                    <div />
                    {/* Primary Green Call Button */}
                    <button
                      onClick={handleStartOutgoingCall}
                      className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors flex items-center justify-center mx-auto text-white border-0 cursor-pointer shadow-xs focus:outline-none"
                      title="Place Phone Call"
                    >
                      <Phone className="w-7 h-7" />
                    </button>

                    {/* Backspace Button */}
                    <div className="flex justify-center">
                      {phoneNumber.length > 0 && (
                        <button
                          onClick={handleBackspace}
                          className="w-11 h-11 rounded-full bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 transition-colors flex items-center justify-center text-zinc-300 border border-zinc-700 focus:outline-none"
                          title="Delete digit"
                        >
                          <Delete className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------------
                  SCREEN 2: OUTGOING CALL RINGING VIEW
                 ------------------------------------------------------------------- */}
              {screenState === 'outgoing_ringing' && (
                <div className="flex-1 flex flex-col justify-between items-center px-6 py-10 text-center">
                  <div className="pt-4">
                    <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center mx-auto mb-4 text-zinc-400">
                      <User className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">{callerName}</h2>
                    <p className="text-xs font-mono text-zinc-400 mt-1">{phoneNumber}</p>
                    <div className="inline-flex items-center gap-2 mt-4 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span>Calling & Ringing...</span>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-500 max-w-[220px]">
                    Waiting for receiver to answer phone call...
                  </p>

                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={handleEndCall}
                      className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-colors flex items-center justify-center text-white border-0 shadow-xs cursor-pointer"
                      title="End Call"
                    >
                      <PhoneOff className="w-7 h-7" />
                    </button>
                    <span className="text-[11px] font-mono text-zinc-400">End Call</span>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------------
                  SCREEN 3: INCOMING CALL VIEW (Accept / Decline)
                 ------------------------------------------------------------------- */}
              {screenState === 'incoming' && (
                <div className="flex-1 flex flex-col justify-between items-center px-6 py-10 text-center">
                  <div className="pt-4">
                    <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center mx-auto mb-4 text-zinc-400">
                      <PhoneIncoming className="w-10 h-10 text-blue-400 animate-bounce" />
                    </div>
                    <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 mb-1">
                      Incoming Phone Call
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight">{callerName}</h2>
                    <p className="text-xs font-mono text-zinc-400 mt-1">{phoneNumber}</p>
                    <div className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-0.5 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-400 border border-zinc-700">
                      <span>Source:</span>
                      <strong className="text-zinc-200">
                        {audioSourcePreset === 'sample_fake' ? 'Deepfake Voice Clone' : 'Genuine Voice'}
                      </strong>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 animate-pulse">
                    Accept call to initiate live AI voice defense scan
                  </p>

                  {/* Accept / Decline Action Buttons */}
                  <div className="flex items-center justify-center gap-10 w-full pt-4">
                    {/* Decline Call (Red) */}
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={handleDeclineIncomingCall}
                        className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-colors flex items-center justify-center text-white border-0 shadow-xs cursor-pointer"
                        title="Decline Call"
                      >
                        <PhoneOff className="w-7 h-7" />
                      </button>
                      <span className="text-xs font-medium text-zinc-300">Decline</span>
                    </div>

                    {/* Accept Call (Green) */}
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={handleAcceptIncomingCall}
                        className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors flex items-center justify-center text-white border-0 shadow-xs cursor-pointer"
                        title="Accept Call"
                      >
                        <PhoneCall className="w-7 h-7" />
                      </button>
                      <span className="text-xs font-medium text-zinc-300">Accept</span>
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------------
                  SCREEN 4: CONNECTED IN-CALL VIEW (Live AI Voice Defense)
                 ------------------------------------------------------------------- */}
              {screenState === 'connected' && (
                <div className="flex-1 flex flex-col justify-between px-5 py-4">
                  {/* Top Caller & Active Duration */}
                  <div className="text-center pt-1">
                    <div className="text-lg font-bold text-white tracking-tight leading-snug">
                      {callerName}
                    </div>
                    <div className="text-xs font-mono text-zinc-400">{phoneNumber}</div>
                    <div className="text-sm font-mono text-zinc-300 mt-1 font-semibold">
                      {formatTime(callDuration)}
                    </div>
                  </div>

                  {/* =============================================================
                      PROJECT TENSA: IN-CALL REAL-TIME AI VOICE DETECTOR PILL
                     ============================================================= */}
                  <div className="my-auto py-2">
                    <div
                      className={cn(
                        'p-3.5 rounded-xl border text-left transition-all',
                        localRiskEvent.threat_level === 'RED'
                          ? 'bg-rose-950/80 border-rose-800 text-rose-100'
                          : localRiskEvent.threat_level === 'AMBER'
                          ? 'bg-amber-950/80 border-amber-800 text-amber-100'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-100'
                      )}
                    >
                      {/* Security Header */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                        <div className="flex items-center gap-1.5">
                          {localRiskEvent.threat_level === 'RED' ? (
                            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                          ) : localRiskEvent.threat_level === 'AMBER' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                          <span className="text-[11px] font-bold tracking-tight uppercase">
                            Tensa Voice Sentinel
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-zinc-300 border border-white/5">
                          Tier-1 + Tier-2
                        </span>
                      </div>

                      {/* Real-Time Detection Result */}
                      <div className="pt-2.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[11px] font-mono text-zinc-400">
                            Caller Voice Classification:
                          </span>
                          <span className="text-sm font-bold font-mono">
                            {Math.round(localRiskEvent.composite_risk_score * 100)}% AI
                          </span>
                        </div>

                        {/* Status Message */}
                        <div className="mt-1">
                          {localRiskEvent.threat_level === 'RED' ? (
                            <div className="text-xs font-bold text-rose-300 flex items-center gap-1">
                              <span>SYNTHETIC AI VOICE CLONE DETECTED</span>
                            </div>
                          ) : localRiskEvent.threat_level === 'AMBER' ? (
                            <div className="text-xs font-bold text-amber-300 flex items-center gap-1">
                              <span>SUSPICIOUS VOCAL INCONSISTENCIES</span>
                            </div>
                          ) : (
                            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                              <span>AUTHENTIC HUMAN VOICE VERIFIED</span>
                            </div>
                          )}
                        </div>

                        {/* Recommendation Note */}
                        <p className="text-[10px] text-zinc-400 mt-1 leading-tight">
                          Action:{' '}
                          <strong className="text-zinc-200 font-mono">
                            {localRiskEvent.action_recommended || 'MONITORING_STREAM'}
                          </strong>
                        </p>
                      </div>

                      {/* Mini Live Audio Visualizer Spectrum */}
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-zinc-400">
                          Acoustic Stream:
                        </span>
                        <canvas
                          ref={canvasRef}
                          width={140}
                          height={20}
                          className="bg-black/30 rounded border border-white/5"
                        />
                      </div>
                    </div>

                    {/* =============================================================
                        USER INTERVENTION CHOICE WHEN AI IS DETECTED
                       ============================================================= */}
                    {(localRiskEvent.threat_level === 'RED' || localRiskEvent.composite_risk_score >= 0.7) &&
                      aiInterventionMode === 'undecided' && (
                        <div className="mt-3 p-3.5 rounded-xl bg-gradient-to-b from-rose-950/95 to-zinc-950 border border-rose-500/50 text-left shadow-lg animate-in fade-in duration-300">
                          <div className="flex items-center gap-1.5 text-rose-300 mb-1.5">
                            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">
                              AI Voice Clone Detected!
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-300 leading-snug mb-3">
                            Synthetic voice identified. Choose how you would like to handle this call:
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={handleDelegateToAi}
                              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] border border-indigo-400/40 shadow-xs transition-transform active:scale-95 cursor-pointer"
                            >
                              <Bot className="w-4 h-4 mb-1 text-indigo-200" />
                              <span>Handle Call to AI</span>
                              <span className="text-[8px] font-normal text-indigo-200 mt-0.5">Gemini Sentinel</span>
                            </button>
                            <button
                              onClick={handleListenToCall}
                              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-[11px] border border-zinc-600 shadow-xs transition-transform active:scale-95 cursor-pointer"
                            >
                              <Headphones className="w-4 h-4 mb-1 text-zinc-300" />
                              <span>Listen to Call</span>
                              <span className="text-[8px] font-normal text-zinc-400 mt-0.5">Passive Monitor</span>
                            </button>
                          </div>
                        </div>
                      )}

                    {/* Passive Listening Mode Pill */}
                    {aiInterventionMode === 'listening' && (
                      <div className="mt-2 px-3 py-1 rounded-lg bg-blue-950/60 border border-blue-800/40 text-center flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] text-blue-300 font-medium">
                          <Headphones className="w-3 h-3 text-blue-400" />
                          <span>Passive Monitoring Active</span>
                        </div>
                        <button
                          onClick={handleDelegateToAi}
                          className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                        >
                          Delegate to AI
                        </button>
                      </div>
                    )}
                  </div>

                  {/* =============================================================
                      AI SENTINEL ACTIVE VIEW (When user chose "Handle to AI")
                     ============================================================= */}
                  {aiInterventionMode === 'handling_to_ai' ? (
                    <div className="my-1 flex-1 flex flex-col justify-between">
                      {/* AI Sentinel Header Badge */}
                      <div className="p-2.5 rounded-lg bg-indigo-950/80 border border-indigo-500/50 text-left mb-2 shadow-inner">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[11px]">
                            <Bot className="w-4 h-4 text-indigo-400 animate-bounce" />
                            <span>AI SENTINEL ENGAGED</span>
                          </div>
                          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-indigo-900 text-indigo-200 border border-indigo-400/40">
                            Gemini 3.5 Live
                          </span>
                        </div>
                        <p className="text-[10px] text-indigo-200/80 mt-1 leading-tight">
                          Call handed over to AI defense agent. Uploading audio chunks for real-time transcription.
                        </p>
                      </div>

                      {/* Live Audio Streaming & Real-Time Transcription Container */}
                      <div className="flex-1 min-h-[140px] max-h-[180px] overflow-y-auto p-2.5 rounded-lg bg-black/60 border border-zinc-700/80 text-left font-mono flex flex-col">
                        <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-zinc-800 text-[9px] text-zinc-400">
                          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            Live Speech-to-Text
                          </span>
                          <span className="text-zinc-400 font-mono">Gemini 3.5 Transcribe</span>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-1.5 text-zinc-200 text-[11px] leading-relaxed">
                          {liveTranscript ? (
                            <p className="whitespace-pre-wrap text-emerald-300/90">{liveTranscript}</p>
                          ) : (
                            <p className="text-zinc-500 italic text-[10px] animate-pulse">
                              Transcribing incoming caller audio chunks in real-time...
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Bar for AI Handled Mode */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-zinc-800">
                        <button
                          onClick={() => setAiInterventionMode('listening')}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-[10px] border border-zinc-700 transition-colors cursor-pointer"
                        >
                          Take Back Call
                        </button>
                        <button
                          onClick={handleEndCall}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] shadow-sm transition-colors cursor-pointer"
                        >
                          End & Summarize
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Standard In-Call 6-Button Grid */
                    <div className="grid grid-cols-3 gap-3 max-w-[260px] mx-auto w-full pt-1">
                      {/* Mute */}
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={cn(
                          'w-14 h-14 rounded-full flex flex-col items-center justify-center mx-auto transition-colors border focus:outline-none',
                          isMuted
                            ? 'bg-white text-zinc-900 border-white'
                            : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                        )}
                      >
                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        <span className="text-[8px] font-medium mt-0.5">Mute</span>
                      </button>

                      {/* In-Call Keypad */}
                      <button
                        onClick={() => setShowInCallKeypad(!showInCallKeypad)}
                        className={cn(
                          'w-14 h-14 rounded-full flex flex-col items-center justify-center mx-auto transition-colors border focus:outline-none',
                          showInCallKeypad
                            ? 'bg-white text-zinc-900 border-white'
                            : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                        )}
                      >
                        <Grid className="w-5 h-5" />
                        <span className="text-[8px] font-medium mt-0.5">Keypad</span>
                      </button>

                      {/* Speaker */}
                      <button
                        onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                        className={cn(
                          'w-14 h-14 rounded-full flex flex-col items-center justify-center mx-auto transition-colors border focus:outline-none',
                          isSpeakerOn
                            ? 'bg-white text-zinc-900 border-white'
                            : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                        )}
                      >
                        <Volume2 className="w-5 h-5" />
                        <span className="text-[8px] font-medium mt-0.5">Speaker</span>
                      </button>

                      {/* Add Call */}
                      <button
                        className="w-14 h-14 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 flex flex-col items-center justify-center mx-auto cursor-not-allowed opacity-60"
                        disabled
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-[8px] font-medium mt-0.5">Add</span>
                      </button>

                      {/* Hold */}
                      <button
                        onClick={() => setIsOnHold(!isOnHold)}
                        className={cn(
                          'w-14 h-14 rounded-full flex flex-col items-center justify-center mx-auto transition-colors border focus:outline-none',
                          isOnHold
                            ? 'bg-white text-zinc-900 border-white'
                            : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                        )}
                      >
                        <Pause className="w-5 h-5" />
                        <span className="text-[8px] font-medium mt-0.5">Hold</span>
                      </button>

                      {/* Inspect Telemetry */}
                      <button
                        onClick={() => setShowForensicDetails(!showForensicDetails)}
                        className={cn(
                          'w-14 h-14 rounded-full flex flex-col items-center justify-center mx-auto transition-colors border focus:outline-none',
                          showForensicDetails
                            ? 'bg-white text-zinc-900 border-white'
                            : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                        )}
                      >
                        <Shield className="w-5 h-5" />
                        <span className="text-[8px] font-medium mt-0.5">Inspect</span>
                      </button>
                    </div>
                  )}

                  {/* End Call Button */}
                  <div className="flex justify-center pt-3 pb-1">
                    <button
                      onClick={handleEndCall}
                      className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 transition-colors flex items-center justify-center text-white border-0 shadow-xs cursor-pointer focus:outline-none"
                      title="Hang up call"
                    >
                      <PhoneOff className="w-7 h-7" />
                    </button>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------------
                  SCREEN 5: CALL SUMMARY VIEW (Post-Call Forensic Verdict)
                 ------------------------------------------------------------------- */}
              {screenState === 'summary' && (
                <div className="flex-1 flex flex-col justify-between px-6 py-6 text-center">
                  <div className="pt-2">
                    <div
                      className={cn(
                        'w-16 h-16 rounded-full border-2 flex items-center justify-center mx-auto mb-3',
                        sessionSummary?.threatLevel === 'RED'
                          ? 'bg-rose-950 border-rose-600 text-rose-400'
                          : sessionSummary?.threatLevel === 'AMBER'
                          ? 'bg-amber-950 border-amber-600 text-amber-400'
                          : 'bg-emerald-950 border-emerald-600 text-emerald-400'
                      )}
                    >
                      {sessionSummary?.threatLevel === 'RED' ? (
                        <ShieldAlert className="w-8 h-8" />
                      ) : sessionSummary?.threatLevel === 'AMBER' ? (
                        <AlertTriangle className="w-8 h-8" />
                      ) : (
                        <ShieldCheck className="w-8 h-8" />
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                      Call Terminated
                    </div>
                    <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
                      {sessionSummary?.threatLevel === 'RED'
                        ? 'Synthetic AI Clone Blocked'
                        : sessionSummary?.threatLevel === 'AMBER'
                        ? 'Suspicious Call Terminated'
                        : 'Authentic Caller Verified'}
                    </h2>
                    <p className="text-xs font-mono text-zinc-400 mt-1">
                      Duration: {formatTime(Math.round(sessionSummary?.durationSeconds || callDuration))}
                    </p>

                    {/* Summary KPI Grid inside phone */}
                    <div className="grid grid-cols-2 gap-2 mt-3 text-left">
                      <div className="p-2 rounded-lg bg-zinc-800/80 border border-zinc-700">
                        <span className="text-[9px] font-mono text-zinc-400 uppercase block">
                          Mean AI Score
                        </span>
                        <span className="text-base font-bold font-mono text-white">
                          {Math.round((sessionSummary?.meanScore || localRiskEvent.composite_risk_score) * 100)}%
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-zinc-800/80 border border-zinc-700">
                        <span className="text-[9px] font-mono text-zinc-400 uppercase block">
                          Human Baseline
                        </span>
                        <span className="text-base font-bold font-mono text-white">
                          {100 - Math.round((sessionSummary?.meanScore || localRiskEvent.composite_risk_score) * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* =============================================================
                        GEMINI 3.5 FLASH LITE SUMMARY CARD (When Handled to AI)
                       ============================================================= */}
                    {aiInterventionMode === 'handling_to_ai' && (
                      <div className="mt-3 p-3 rounded-lg bg-indigo-950/80 border border-indigo-500/50 text-left">
                        <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-indigo-500/30">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            Gemini 3.5 Flash Lite Summary
                          </span>
                          <span className="text-[8px] font-mono px-1 rounded bg-indigo-900 text-indigo-200">
                            Ultra-Crisp
                          </span>
                        </div>

                        {isSummarizing ? (
                          <div className="py-2 text-center text-indigo-300 text-[10px] font-mono animate-pulse">
                            Gemini 3.5 Flash Lite analyzing transcript...
                          </div>
                        ) : aiSummary ? (
                          <div className="space-y-1.5 text-[10px]">
                            <div>
                              <span className="font-bold text-white block text-[11px]">
                                {aiSummary.summary.headline}
                              </span>
                              <span className="text-indigo-200 block text-[9px] mt-0.5">
                                Persona: <strong className="text-zinc-100">{aiSummary.summary.callerPersona}</strong>
                              </span>
                            </div>
                            <div className="p-1.5 rounded bg-black/40 border border-indigo-500/20 text-zinc-300 text-[9px]">
                              <p><strong>Solicited:</strong> {aiSummary.summary.infoSolicited}</p>
                              <p className="text-rose-300 mt-0.5"><strong>Action:</strong> {aiSummary.summary.actionRecommended}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[9px] text-zinc-400">
                            Summary will generate upon final transcript evaluation.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Redial & Action Buttons */}
                  <div className="flex flex-col gap-2 pt-4">
                    <Button
                      onClick={handleResetToKeypad}
                      className="w-full h-10 bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs border border-zinc-700 gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Return to Dialer Keypad</span>
                    </Button>

                    {onOpenSoc && (
                      <Button
                        variant="outline"
                        onClick={onOpenSoc}
                        className="w-full h-10 bg-transparent hover:bg-zinc-800 text-zinc-300 font-medium text-xs border border-zinc-700 gap-1.5"
                      >
                        <Activity className="w-3.5 h-3.5 text-blue-400" />
                        <span>Inspect Full Forensic Log in SOC</span>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Home Indicator Bar */}
              <div className="pb-2 pt-1 flex justify-center">
                <div className="w-28 h-1 bg-zinc-700 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            RIGHT: SIMULATOR CONTROLLER & REAL-TIME FORENSIC TELEMETRY (Clean Flat)
           ========================================================================= */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Card 1: Call Scenario & Audio Ingestion Setup */}
          <Card className="p-5 bg-white border border-zinc-300 rounded-xl shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-zinc-700" />
                <h3 className="text-sm font-bold text-zinc-900 tracking-tight">
                  Call Setup & Attack Scenarios
                </h3>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono text-zinc-600 bg-zinc-50 border-zinc-300">
                {isConnected ? 'Backend Synchronized' : 'Connecting to Engine...'}
              </Badge>
            </div>

            <p className="text-xs text-zinc-600 mt-2.5">
              Select who is placing or receiving the phone call. When the call is accepted, Tensa feeds
              the voice stream into Tier-1 DSP and Tier-2 Neural deepfake analysis.
            </p>

            {/* Scenario Preset Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              {PRESET_CALLS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors cursor-pointer focus:outline-none',
                    audioSourcePreset === preset.type
                      ? 'bg-zinc-100 border-zinc-900 ring-1 ring-zinc-900'
                      : 'bg-white border-zinc-200 hover:border-zinc-400'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono uppercase font-bold text-zinc-500">
                      {preset.badge}
                    </span>
                    {preset.type === 'sample_fake' ? (
                      <Sparkles className="w-3.5 h-3.5 text-zinc-800" />
                    ) : preset.type === 'sample_genuine' ? (
                      <User className="w-3.5 h-3.5 text-zinc-800" />
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-zinc-800" />
                    )}
                  </div>
                  <div className="text-xs font-bold text-zinc-900 truncate">{preset.name}</div>
                  <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{preset.description}</p>
                </button>
              ))}
            </div>

            {/* Custom Audio File Upload Option */}
            <div className="mt-3 pt-3 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={customFileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setCustomFile(f);
                      setAudioSourcePreset('custom');
                      setCallerName(`Uploaded: ${f.name}`);
                      setPhoneNumber('+1 (CUSTOM-AUDIO)');
                    }
                  }}
                  accept="audio/*,.wav,.mp3,.ogg,.flac"
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => customFileInputRef.current?.click()}
                  className="h-8 text-xs font-medium border-zinc-300 bg-white hover:bg-zinc-100 gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 text-zinc-600" />
                  <span>
                    {customFile ? `Selected: ${customFile.name.slice(0, 18)}…` : 'Upload Custom Audio'}
                  </span>
                </Button>
              </div>

              {/* Codec Selection */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                <span className="text-[11px] font-mono">Telephony Codec:</span>
                <select
                  value={selectedCodec}
                  onChange={(e) => setSelectedCodec(e.target.value as CodecProfile)}
                  className="h-8 px-2 text-xs font-mono bg-white border border-zinc-300 rounded text-zinc-900 focus:outline-none"
                >
                  <option value="raw">Raw 16kHz PCM (Pristine)</option>
                  <option value="g711_ulaw">G.711 u-law (PSTN Landline)</option>
                  <option value="amr_nb">AMR-NB (Cellular 2G/3G/4G)</option>
                  <option value="g722">G.722 (HD Voice / VoIP)</option>
                  <option value="voip_jitter">VoIP Packet Jitter & Loss</option>
                </select>
              </div>
            </div>

            {/* Action Bar: Outgoing vs Incoming Call Simulator */}
            <div className="mt-4 pt-4 border-t border-zinc-200 flex flex-wrap items-center gap-3">
              <Button
                onClick={handleStartOutgoingCall}
                disabled={screenState === 'connected' || screenState === 'outgoing_ringing'}
                className="h-9 px-4 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white gap-2"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>Place Outgoing Call</span>
              </Button>

              <Button
                variant="outline"
                onClick={handleSimulateIncomingCall}
                disabled={screenState === 'connected' || screenState === 'incoming'}
                className="h-9 px-4 text-xs font-bold border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-900 gap-2"
              >
                <PhoneIncoming className="w-3.5 h-3.5 text-blue-600" />
                <span>Simulate Incoming Call (Scam Alert)</span>
              </Button>

              {screenState === 'connected' && (
                <Button
                  variant="destructive"
                  onClick={handleEndCall}
                  className="h-9 px-4 text-xs font-bold gap-2 ml-auto"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Hang Up Active Call</span>
                </Button>
              )}
            </div>
          </Card>

          {/* Card 2: Live In-Call Forensic Inspection Deck */}
          <Card className="p-5 bg-white border border-zinc-300 rounded-xl shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-zinc-700" />
                <h3 className="text-sm font-bold text-zinc-900 tracking-tight">
                  Real-Time Voice Clone Detection Telemetry
                </h3>
              </div>
              <Badge
                variant={
                  localRiskEvent.threat_level === 'RED'
                    ? 'destructive'
                    : localRiskEvent.threat_level === 'AMBER'
                    ? 'warning'
                    : 'success'
                }
                className="text-[10px] font-mono py-0 font-bold"
              >
                {localRiskEvent.threat_level} ALERT
              </Badge>
            </div>

            {/* Metric Strips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">
                  Composite Threat
                </span>
                <span className="text-xl font-bold font-mono text-zinc-900">
                  {Math.round(localRiskEvent.composite_risk_score * 100)}%
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  AI clone likelihood
                </span>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">
                  Tier-1 DSP Latency
                </span>
                <span className="text-xl font-bold font-mono text-zinc-900">
                  {localRiskEvent.tier1_latency_ms ? `${localRiskEvent.tier1_latency_ms.toFixed(1)}ms` : '<14ms'}
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Vectorized heuristics
                </span>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">
                  Phase Inconsistency
                </span>
                <span className="text-xl font-bold font-mono text-zinc-900">
                  {Math.round((localRiskEvent.metrics_breakdown?.phase_inconsistency || 0) * 100)}%
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Neural vocoder artifact
                </span>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                <span className="text-[10px] font-mono text-zinc-500 uppercase block">
                  Respiration Inhalation
                </span>
                <span className="text-xl font-bold font-mono text-zinc-900">
                  {Math.round((localRiskEvent.metrics_breakdown?.respiration_cadence_score || 0) * 100)}%
                </span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">
                  Biological breath absence
                </span>
              </div>
            </div>

            {/* Forensic Detail Breakdown Drawer */}
            <div className="mt-4 pt-3 border-t border-zinc-200">
              <button
                onClick={() => setShowForensicDetails(!showForensicDetails)}
                className="w-full flex items-center justify-between text-xs font-semibold text-zinc-700 hover:text-zinc-900 py-1"
              >
                <span>Diagnostic Metrics (Bicoherence, Pitch Jitter, Spectral Flatness)</span>
                {showForensicDetails ? (
                  <ChevronUp className="w-4 h-4 text-zinc-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                )}
              </button>

              {showForensicDetails && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-2 border-t border-zinc-100 text-xs">
                  <div className="p-2.5 bg-zinc-50 rounded border border-zinc-200">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Higher-Order Bispectrum:
                    </span>
                    <span className="font-bold font-mono text-zinc-800">
                      {((localRiskEvent.metrics_breakdown?.bicoherence_deficit || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="p-2.5 bg-zinc-50 rounded border border-zinc-200">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Micro-Pitch Jitter Deficit:
                    </span>
                    <span className="font-bold font-mono text-zinc-800">
                      {((localRiskEvent.metrics_breakdown?.pitch_jitter_anomaly || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="p-2.5 bg-zinc-50 rounded border border-zinc-200">
                    <span className="text-[10px] font-mono text-zinc-500 block">
                      Spectral Rolloff Flatness:
                    </span>
                    <span className="font-bold font-mono text-zinc-800">
                      {((localRiskEvent.metrics_breakdown?.spectral_rolloff_anomaly || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* =========================================================================
              Card 3: Gemini AI Defense Sentinel & Live Transcription Feed
             ========================================================================= */}
          <Card className="p-5 bg-white border border-zinc-300 rounded-xl shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-zinc-900 tracking-tight">
                  Gemini AI Call Sentinel & Live Transcription
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono',
                    isDialerConnected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : 'bg-zinc-50 text-zinc-500 border-zinc-300'
                  )}
                >
                  {isDialerConnected ? 'WS Connected' : 'Dialer Ready'}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono',
                    aiInterventionMode === 'handling_to_ai'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold'
                      : 'bg-zinc-50 text-zinc-600 border-zinc-300'
                  )}
                >
                  {aiInterventionMode === 'handling_to_ai'
                    ? 'AI Sentinel Active'
                    : aiInterventionMode === 'listening'
                    ? 'Passive Listener'
                    : 'Monitoring'}
                </Badge>
              </div>
            </div>

            <div className="mt-3">
              {/* Models Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500">Live Speech Model:</span>
                  <span className="font-mono font-bold text-indigo-900 text-[11px]">
                    {liveModel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-500">Summarization Model:</span>
                  <span className="font-mono font-bold text-indigo-900 text-[11px]">
                    Gemini 3.5 Flash Lite
                  </span>
                </div>
              </div>

              {/* Live Streaming Transcript */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                    <MessageSquareQuote className="w-3.5 h-3.5 text-zinc-600" />
                    Live Audio Transcription Feed
                  </span>
                  {aiInterventionMode === 'handling_to_ai' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Streaming Chunks via Node.js
                    </span>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-zinc-900 text-zinc-200 font-mono text-xs min-h-[90px] max-h-[140px] overflow-y-auto leading-relaxed border border-zinc-800">
                  {liveTranscript ? (
                    <p className="whitespace-pre-wrap">{liveTranscript}</p>
                  ) : (
                    <p className="text-zinc-500 italic text-[11px]">
                      {aiInterventionMode === 'handling_to_ai'
                        ? 'Connecting stream to Gemini Live API and receiving transcription deltas...'
                        : 'Transcripts will appear here when an AI call is detected and handed over to AI defense.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Gemini 3.5 Flash Lite Summary Section */}
              {aiSummary && (
                <div className="mt-4 p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-indigo-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                        Gemini 3.5 Flash Lite — Call Forensic Summary
                      </h4>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-mono bg-white text-indigo-800 border-indigo-300">
                      {aiSummary.modelUsed}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="text-sm font-bold text-zinc-900">
                      {aiSummary.summary.headline}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-white border border-indigo-100">
                        <span className="text-[10px] font-mono text-zinc-500 block">Claimed Identity:</span>
                        <span className="font-semibold text-zinc-900">{aiSummary.summary.callerPersona}</span>
                      </div>
                      <div className="p-2 rounded bg-white border border-indigo-100">
                        <span className="text-[10px] font-mono text-zinc-500 block">Information Solicited:</span>
                        <span className="font-semibold text-rose-700">{aiSummary.summary.infoSolicited}</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-white border border-indigo-100 text-xs">
                      <span className="text-[10px] font-mono text-zinc-500 block mb-1">Key Findings:</span>
                      <ul className="list-disc list-inside space-y-1 text-zinc-700">
                        {aiSummary.summary.bulletPoints?.map((bp, idx) => (
                          <li key={idx}>{bp}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <span className="text-[10px] font-mono font-bold text-rose-700 uppercase block">Action Directive:</span>
                        <span className="font-medium text-rose-900">{aiSummary.summary.actionRecommended}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
