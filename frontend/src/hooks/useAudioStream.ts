import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioStreamProps {
  onChunk: (pcmBytes: ArrayBuffer) => void;
}

export const useAudioStream = ({ onChunk }: UseAudioStreamProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [sourceType, setSourceType] = useState<'idle' | 'mic' | 'sample_genuine' | 'sample_fake' | 'custom'>('idle');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Initialize AudioContext on user interaction
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: 16000 });
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      audioContextRef.current = ctx;
      setAnalyser(an);
      return { ctx, an };
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return { ctx: audioContextRef.current, an: analyser! };
  };

  const stopAll = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    setIsPlaying(false);
    setSourceType('idle');
  }, []);

  // Play an audio file (sample or uploaded) and stream chunks
  const playAudioFile = useCallback((url: string, type: 'sample_genuine' | 'sample_fake' | 'custom') => {
    stopAll();
    const { ctx, an } = initAudioContext();

    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audioElementRef.current = audio;

    const source = ctx.createMediaElementSource(audio);
    sourceNodeRef.current = source;

    // Buffer chunking (250ms = 4000 samples at 16kHz)
    const bufferSize = 4096;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32Array to 16-bit PCM ArrayBuffer
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      onChunk(pcm16.buffer);
    };

    source.connect(an);
    an.connect(processor);
    processor.connect(ctx.destination);
    source.connect(ctx.destination); // For listening

    audio.onended = () => {
      stopAll();
    };

    audio.play()
      .then(() => {
        setIsPlaying(true);
        setSourceType(type);
      })
      .catch((err) => {
        console.error('Audio playback failed:', err);
        stopAll();
      });
  }, [onChunk, stopAll]);

  // Start live microphone capture
  const startMic = useCallback(async () => {
    stopAll();
    const { ctx, an } = initAudioContext();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
        },
      });

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onChunk(pcm16.buffer);
      };

      source.connect(an);
      an.connect(processor);
      processor.connect(ctx.destination);

      setIsPlaying(true);
      setSourceType('mic');
    } catch (err) {
      console.error('Microphone access denied or failed:', err);
      stopAll();
    }
  }, [onChunk, stopAll]);

  useEffect(() => {
    return () => {
      stopAll();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopAll]);

  return {
    isPlaying,
    sourceType,
    analyser,
    playAudioFile,
    startMic,
    stopAll,
  };
};
