import { useState, useRef, useCallback, useEffect } from 'react';

export interface PlaybackStats {
  duration: number;
  sourceName: string;
  sourceType: 'idle' | 'mic' | 'sample_genuine' | 'sample_fake' | 'custom';
  completedNaturally: boolean;
}

interface UseAudioStreamProps {
  onChunk: (pcmBytes: ArrayBuffer) => void;
  onPlaybackComplete?: (stats: PlaybackStats) => void;
}

export const useAudioStream = ({ onChunk, onPlaybackComplete }: UseAudioStreamProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceType, setSourceType] = useState<'idle' | 'mic' | 'sample_genuine' | 'sample_fake' | 'custom'>('idle');
  const [activeFileName, setActiveFileName] = useState<string>('');
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<number | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  const onPlaybackCompleteRef = useRef(onPlaybackComplete);
  onPlaybackCompleteRef.current = onPlaybackComplete;

  const isPlayingRef = useRef(false);
  const activeDurationRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const activeSourceNameRef = useRef<string>('');
  const activeSourceTypeRef = useRef<'idle' | 'mic' | 'sample_genuine' | 'sample_fake' | 'custom'>('idle');

  // Initialize AudioContext on user interaction
  const initAudioContext = useCallback(() => {
    let ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.8;
      analyserRef.current = an;
      setAnalyser(an);
    }

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    return { ctx, an: analyserRef.current! };
  }, []);

  const cleanupNodes = useCallback(() => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        if ('stop' in sourceNodeRef.current) {
          (sourceNodeRef.current as AudioBufferSourceNode).stop();
        }
        sourceNodeRef.current.disconnect();
      } catch (_) {}
      sourceNodeRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (_) {}
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      mediaStreamRef.current = null;
    }
  }, []);

  const stopAll = useCallback(
    (userInitiated = false) => {
      const wasPlaying = isPlayingRef.current;
      const dur =
        activeDurationRef.current > 0
          ? activeDurationRef.current
          : playbackStartTimeRef.current > 0
          ? (Date.now() - playbackStartTimeRef.current) / 1000
          : 0;
      const sName = activeSourceNameRef.current;
      const sType = activeSourceTypeRef.current;

      cleanupNodes();

      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsLoading(false);
      setSourceType('idle');

      if (userInitiated && wasPlaying && onPlaybackCompleteRef.current) {
        onPlaybackCompleteRef.current({
          duration: Math.max(0.5, dur),
          sourceName: sName || 'Audio Stream',
          sourceType: sType,
          completedNaturally: false,
        });
      }
    },
    [cleanupNodes]
  );

  // Play and stream any audio source (URL string or uploaded File)
  const playAudio = useCallback(
    async (source: string | File, type: 'sample_genuine' | 'sample_fake' | 'custom', customName?: string) => {
      stopAll(false);
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const { ctx, an } = initAudioContext();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        let arrayBuffer: ArrayBuffer;
        let displayName = customName || '';

        if (source instanceof File) {
          displayName = source.name;
          arrayBuffer = await source.arrayBuffer();
        } else {
          const res = await fetch(source);
          if (!res.ok) throw new Error(`Could not load preset audio file (${res.status})`);
          arrayBuffer = await res.arrayBuffer();
          if (!displayName) {
            displayName = source.split('/').pop() || 'Preset Audio';
          }
        }

        // Decode audio data in browser memory (supports all WAV formats: 16/24/32-bit float, MP3, etc.)
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

        // Resample natively to pristine 16kHz mono using browser OfflineAudioContext
        const targetRate = 16000;
        const targetLength = Math.ceil(audioBuffer.duration * targetRate);
        const offlineCtx = new OfflineAudioContext(1, targetLength, targetRate);
        const offlineSource = offlineCtx.createBufferSource();
        offlineSource.buffer = audioBuffer;
        offlineSource.connect(offlineCtx.destination);
        offlineSource.start(0);

        const resampled = await offlineCtx.startRendering();
        const pcmFloat32 = resampled.getChannelData(0);

        // Prepare live audio playback for user listening via AudioBufferSourceNode
        const bufferSource = ctx.createBufferSource();
        bufferSource.buffer = audioBuffer;
        sourceNodeRef.current = bufferSource;

        bufferSource.connect(an);
        an.connect(ctx.destination);

        // Real-time chunking: 4000 samples @ 16kHz = 250ms frame (8000 bytes Int16)
        const hopSamples = 4000;
        let sampleOffset = 0;
        const totalSamples = pcmFloat32.length;

        const sendChunk = () => {
          if (sampleOffset >= totalSamples) return;
          const end = Math.min(sampleOffset + hopSamples, totalSamples);
          const chunkLen = end - sampleOffset;
          const pcm16 = new Int16Array(chunkLen);
          for (let i = 0; i < chunkLen; i++) {
            const s = Math.max(-1, Math.min(1, pcmFloat32[sampleOffset + i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          sampleOffset = end;
          onChunkRef.current(pcm16.buffer);
        };

        // Send first chunk immediately
        sendChunk();

        // Stream consecutive 250ms chunks in real time
        const interval = window.setInterval(() => {
          if (sampleOffset >= totalSamples) {
            clearInterval(interval);
          } else {
            sendChunk();
          }
        }, 250);
        chunkIntervalRef.current = interval;

        // Set state and tracking refs
        activeDurationRef.current = audioBuffer.duration;
        playbackStartTimeRef.current = Date.now();
        activeSourceNameRef.current = displayName;
        activeSourceTypeRef.current = type;
        isPlayingRef.current = true;

        setTotalDuration(audioBuffer.duration);
        setIsPlaying(true);
        setIsLoading(false);
        setSourceType(type);
        setActiveFileName(displayName);

        bufferSource.onended = () => {
          const finalDuration = activeDurationRef.current;
          const finalName = activeSourceNameRef.current;
          const finalType = activeSourceTypeRef.current;

          cleanupNodes();
          setIsPlaying(false);
          isPlayingRef.current = false;
          setIsLoading(false);
          setSourceType('idle');

          if (onPlaybackCompleteRef.current) {
            onPlaybackCompleteRef.current({
              duration: finalDuration,
              sourceName: finalName,
              sourceType: finalType,
              completedNaturally: true,
            });
          }
        };

        bufferSource.start(0);
      } catch (err: any) {
        console.error('Audio playback or decoding failed:', err);
        cleanupNodes();
        setIsPlaying(false);
        isPlayingRef.current = false;
        setIsLoading(false);
        setErrorMessage(
          err?.message || 'Could not decode this audio file. Please ensure it is a valid .wav, .mp3, or .flac file.'
        );
      }
    },
    [initAudioContext, cleanupNodes, stopAll]
  );

  // Start live microphone capture
  const startMic = useCallback(async () => {
    stopAll(false);
    setIsLoading(true);
    setErrorMessage(null);

    const { ctx, an } = initAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
        },
      });
      mediaStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const outputData = e.outputBuffer.getChannelData(0);
        outputData.fill(0);

        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onChunkRef.current(pcm16.buffer);
      };

      // Signal chain: Mic -> Analyser (Visualization only, no output to speakers)
      source.connect(an);
      source.connect(processor);
      processor.connect(ctx.destination);

      activeDurationRef.current = 0;
      playbackStartTimeRef.current = Date.now();
      activeSourceNameRef.current = 'Live Microphone Stream';
      activeSourceTypeRef.current = 'mic';
      isPlayingRef.current = true;

      setIsPlaying(true);
      setIsLoading(false);
      setSourceType('mic');
      setActiveFileName('Live Microphone Stream');
      setTotalDuration(0);
    } catch (err: any) {
      console.error('Microphone access denied or failed:', err);
      cleanupNodes();
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsLoading(false);
      setErrorMessage(err?.message || 'Microphone access denied or unavailable.');
    }
  }, [initAudioContext, cleanupNodes, stopAll]);

  useEffect(() => {
    return () => {
      cleanupNodes();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.close();
        } catch (_) {}
      }
    };
  }, [cleanupNodes]);

  return {
    isPlaying,
    isLoading,
    sourceType,
    activeFileName,
    totalDuration,
    errorMessage,
    clearError: () => setErrorMessage(null),
    analyser,
    playAudio,
    startMic,
    stopAll: () => stopAll(true),
  };
};
