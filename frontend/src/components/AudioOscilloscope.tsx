import React, { useEffect, useRef, useState } from 'react';
import type { ThreatLevel } from '../types';
import { Waves, BarChart3, Layers } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { TabsList, TabsTrigger } from './ui/tabs';

interface AudioOscilloscopeProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
  threatLevel: ThreatLevel;
  audioSourceLabel: string;
}

type SpectrogramMode = 'dual' | 'waterfall' | 'bars';

// Precomputed 256-color heat palette for fast GPU-backed spectrogram rendering
// Palette: Deep Void (#0a0f1d) -> Electric Cyan (#06b6d4) -> Sonic Violet (#8b5cf6) -> Fiery Amber (#f59e0b) -> Hot White (#ffffff)
const COLOR_LUT: [number, number, number][] = (() => {
  const lut: [number, number, number][] = [];
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = 0, g = 0, b = 0;
    if (t < 0.2) {
      const k = t / 0.2;
      r = Math.round(10 + k * 15);
      g = Math.round(15 + k * 25);
      b = Math.round(29 + k * 70);
    } else if (t < 0.45) {
      const k = (t - 0.2) / 0.25;
      r = Math.round(25 + k * 20);
      g = Math.round(40 + k * 140);
      b = Math.round(99 + k * 115);
    } else if (t < 0.7) {
      const k = (t - 0.45) / 0.25;
      r = Math.round(45 + k * 150);
      g = Math.round(180 - k * 70);
      b = Math.round(214 + k * 30);
    } else if (t < 0.9) {
      const k = (t - 0.7) / 0.2;
      r = Math.round(195 + k * 55);
      g = Math.round(110 + k * 45);
      b = Math.round(244 - k * 230);
    } else {
      const k = (t - 0.9) / 0.1;
      r = 255;
      g = Math.round(155 + k * 100);
      b = Math.round(14 + k * 241);
    }
    lut.push([r, g, b]);
  }
  return lut;
})();

export const AudioOscilloscope: React.FC<AudioOscilloscopeProps> = ({
  analyserNode,
  isPlaying,
  threatLevel,
  audioSourceLabel,
}) => {
  const [mode, setMode] = useState<SpectrogramMode>('dual');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Smoothing buffers for fluid, studio-grade movement
  const smoothedBarsRef = useRef<Float32Array>(new Float32Array(48));
  const peakBarsRef = useRef<Float32Array>(new Float32Array(48));
  const dominantFreqRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create persistent offscreen canvas for the rolling 2D spectrogram waterfall
    if (!waterfallCanvasRef.current) {
      const wf = document.createElement('canvas');
      wf.width = 700;
      wf.height = 140;
      const wfCtx = wf.getContext('2d');
      if (wfCtx) {
        wfCtx.fillStyle = '#090d16';
        wfCtx.fillRect(0, 0, wf.width, wf.height);
      }
      waterfallCanvasRef.current = wf;
    }
    const wfCanvas = waterfallCanvasRef.current;
    const wfCtx = wfCanvas?.getContext('2d');

    const fftBins = analyserNode ? analyserNode.frequencyBinCount : 256;
    const freqData = new Uint8Array(fftBins);

    // Number of display bands for the top EQ
    const NUM_BARS = 48;

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      // Base canvas background
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, width, height);

      // Fetch live frequency data if streaming
      if (analyserNode && isPlaying) {
        analyserNode.getByteFrequencyData(freqData);

        // Find dominant vocal fundamental frequency
        let maxVal = 0;
        let maxIndex = 0;
        for (let i = 1; i < Math.min(60, freqData.length); i++) {
          if (freqData[i] > maxVal) {
            maxVal = freqData[i];
            maxIndex = i;
          }
        }
        // At 16kHz, each bin is 16000 / 512 = 31.25 Hz
        const freqHz = Math.round(maxIndex * 31.25);
        if (freqHz > 60 && freqHz < 3500) {
          dominantFreqRef.current = Math.round(dominantFreqRef.current * 0.85 + freqHz * 0.15);
        }
      } else {
        // Idle gentle breathing frequency floor
        const t = Date.now() * 0.003;
        for (let i = 0; i < freqData.length; i++) {
          const base = Math.sin(t + i * 0.15) * 6 + 10;
          freqData[i] = Math.max(0, Math.round(base));
        }
      }

      // ─── 1. Rolling Spectrogram Waterfall ──────────────────────────────────
      if (wfCtx && (mode === 'dual' || mode === 'waterfall')) {
        const wfW = wfCanvas.width;
        const wfH = wfCanvas.height;

        // Shift existing history 2 pixels left
        const scrollStep = isPlaying ? 2 : 1;
        wfCtx.drawImage(wfCanvas, scrollStep, 0, wfW - scrollStep, wfH, 0, 0, wfW - scrollStep, wfH);

        // Paint the new vertical frequency slice at the right edge
        const colX = wfW - scrollStep;
        const imgData = wfCtx.createImageData(scrollStep, wfH);

        // Map FFT bins to Y pixels (logarithmic/perceptual mapping to emphasize vocal range 200-3400Hz)
        for (let y = 0; y < wfH; y++) {
          // Invert y: y=0 is top (high freq), y=wfH-1 is bottom (low freq)
          const normalizedY = 1.0 - y / wfH;
          // Logarithmic warp
          const binIndex = Math.min(
            fftBins - 1,
            Math.floor(Math.pow(normalizedY, 1.6) * (fftBins * 0.85))
          );
          const rawVal = freqData[binIndex] || 0;

          // Apply slight boost for subtle vocal harmonics
          const boostedVal = Math.min(255, Math.floor(Math.pow(rawVal / 255, 0.85) * 255));
          const [r, g, b] = COLOR_LUT[boostedVal];

          for (let sx = 0; sx < scrollStep; sx++) {
            const pixelIdx = (y * scrollStep + sx) * 4;
            imgData.data[pixelIdx] = r;
            imgData.data[pixelIdx + 1] = g;
            imgData.data[pixelIdx + 2] = b;
            imgData.data[pixelIdx + 3] = 255;
          }
        }
        wfCtx.putImageData(imgData, colX, 0);
      }

      // ─── 2. Render Output to Viewport ──────────────────────────────────────
      const leftMargin = 45; // Space for frequency labels
      const plotWidth = width - leftMargin;

      if (mode === 'dual') {
        const eqHeight = 60;
        const wfTop = eqHeight + 8;
        const wfHeight = height - wfTop - 18;

        // Draw Top EQ Bars (Smoothed 48-Band Spectrum)
        renderEqBars(ctx, leftMargin, 4, plotWidth, eqHeight, freqData, NUM_BARS, threatLevel, isPlaying);

        // Draw Bottom Spectrogram Waterfall
        if (wfCanvas) {
          ctx.drawImage(wfCanvas, 0, 0, wfCanvas.width, wfCanvas.height, leftMargin, wfTop, plotWidth, wfHeight);
        }

        // Draw frequency ruler on left margin
        renderFrequencyRuler(ctx, leftMargin, wfTop, wfHeight);

        // Draw subtle time ruler at bottom
        renderTimeRuler(ctx, leftMargin, height - 14, plotWidth);

      } else if (mode === 'waterfall') {
        const wfTop = 6;
        const wfHeight = height - wfTop - 20;

        if (wfCanvas) {
          ctx.drawImage(wfCanvas, 0, 0, wfCanvas.width, wfCanvas.height, leftMargin, wfTop, plotWidth, wfHeight);
        }
        renderFrequencyRuler(ctx, leftMargin, wfTop, wfHeight);
        renderTimeRuler(ctx, leftMargin, height - 16, plotWidth);

      } else if (mode === 'bars') {
        const eqHeight = height - 26;
        renderEqBars(ctx, leftMargin, 8, plotWidth, eqHeight, freqData, 64, threatLevel, isPlaying);
        renderFrequencyRuler(ctx, leftMargin, 8, eqHeight);
        renderTimeRuler(ctx, leftMargin, height - 14, plotWidth);
      }
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyserNode, isPlaying, threatLevel, mode]);

  // Smooth EQ Bars Renderer with Peak Hold and Frequency Gradient
  const renderEqBars = (
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    w: number,
    h: number,
    freqData: Uint8Array,
    numBars: number,
    threat: ThreatLevel,
    active: boolean
  ) => {
    // Subtle background area
    ctx.fillStyle = '#0f1422';
    ctx.fillRect(x0, y0, w, h);

    // Subtle horizontal EQ gridlines (-12dB, -24dB, -36dB)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let r = 0.25; r < 1.0; r += 0.25) {
      const gy = y0 + h * r;
      ctx.beginPath();
      ctx.moveTo(x0, gy);
      ctx.lineTo(x0 + w, gy);
      ctx.stroke();
    }

    const barWidth = Math.max(2, (w / numBars) - 1.5);
    const smoothed = smoothedBarsRef.current;
    const peaks = peakBarsRef.current;

    for (let i = 0; i < numBars; i++) {
      // Map bar index to frequency bins logarithmically
      const binIdx = Math.min(
        freqData.length - 1,
        Math.floor(Math.pow(i / numBars, 1.5) * (freqData.length * 0.8))
      );
      const rawMag = (freqData[binIdx] || 0) / 255.0;

      // Silky smooth Exponential Moving Average (EMA) - stops erratic fluctuating waves
      const smoothFactor = active ? 0.22 : 0.1;
      smoothed[i] = smoothed[i] * (1 - smoothFactor) + rawMag * smoothFactor;

      // Peak hold calculation
      if (smoothed[i] >= peaks[i]) {
        peaks[i] = smoothed[i];
      } else {
        peaks[i] = Math.max(0, peaks[i] * 0.965);
      }

      const barHeight = Math.max(2, smoothed[i] * (h - 6));
      const bx = x0 + i * (barWidth + 1.5);
      const by = y0 + h - barHeight;

      // Color gradient based on frequency band and threat
      let fillCol = '#38bdf8'; // Mid Cyan
      if (threat === 'RED') {
        fillCol = i > numBars * 0.5 ? '#ef4444' : '#f97316';
      } else if (threat === 'AMBER') {
        fillCol = i > numBars * 0.5 ? '#f59e0b' : '#38bdf8';
      } else {
        if (i < numBars * 0.25) fillCol = '#3b82f6'; // Deep Voice Fundament
        else if (i < numBars * 0.65) fillCol = '#06b6d4'; // Vocal Formants
        else fillCol = '#a855f7'; // Upper Harmonics
      }

      ctx.fillStyle = fillCol;
      ctx.fillRect(bx, by, barWidth, barHeight);

      // Peak cap line
      const peakY = y0 + h - Math.max(2, peaks[i] * (h - 6));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, peakY - 1, barWidth, 1.5);
    }
  };

  // Frequency Scale Ruler on Left Margin (0 to 8kHz)
  const renderFrequencyRuler = (
    ctx: CanvasRenderingContext2D,
    xRight: number,
    y0: number,
    h: number
  ) => {
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const markers = [
      { label: '8k', relY: 0.05 },
      { label: '4k', relY: 0.3 },
      { label: '2k', relY: 0.55 },
      { label: '1k', relY: 0.75 },
      { label: '300', relY: 0.92 },
    ];

    markers.forEach((m) => {
      const my = y0 + h * m.relY;
      ctx.fillText(m.label, xRight - 6, my);

      // Subtle notch
      ctx.fillStyle = '#334155';
      ctx.fillRect(xRight - 4, my, 4, 1);
      ctx.fillStyle = '#64748b';
    });
  };

  // Time Ruler at Bottom of Waterfall
  const renderTimeRuler = (
    ctx: CanvasRenderingContext2D,
    x0: number,
    y: number,
    w: number
  ) => {
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const times = [
      { label: '-4.0s', xRel: 0.05 },
      { label: '-3.0s', xRel: 0.28 },
      { label: '-2.0s', xRel: 0.52 },
      { label: '-1.0s', xRel: 0.76 },
      { label: 'LIVE', xRel: 0.96 },
    ];

    times.forEach((t) => {
      const tx = x0 + w * t.xRel;
      if (t.label === 'LIVE') {
        ctx.fillStyle = isPlaying ? '#38bdf8' : '#64748b';
      } else {
        ctx.fillStyle = '#475569';
      }
      ctx.fillText(t.label, tx, y);
    });
  };

  return (
    <Card className="p-4 sm:p-5 flex flex-col justify-between gap-3 h-full bg-white border-slate-200/80 shadow-xs">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 border border-slate-200/60 flex items-center justify-center shrink-0">
            <Waves className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Forensic Acoustic Spectrogram
              </h3>
              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] py-0 font-mono">
                0 - 8000 Hz FFT
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Multi-band energy waterfall & vocal formant harmonic density
            </p>
          </div>
        </div>

        {/* View Mode Switcher & Source Badge */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Tabs List for View Modes */}
          <TabsList className="bg-slate-100 border-slate-200/80 h-8 p-0.5">
            <TabsTrigger
              active={mode === 'dual'}
              onClick={() => setMode('dual')}
              title="Dual: Spectrum EQ + Scrolling Spectrogram"
            >
              <Layers className="w-3 h-3 mr-1" />
              <span>Dual</span>
            </TabsTrigger>
            <TabsTrigger
              active={mode === 'waterfall'}
              onClick={() => setMode('waterfall')}
              title="2D Rolling Spectrogram Waterfall"
            >
              <Waves className="w-3 h-3 mr-1" />
              <span>Waterfall</span>
            </TabsTrigger>
            <TabsTrigger
              active={mode === 'bars'}
              onClick={() => setMode('bars')}
              title="Multi-Band Spectrum EQ"
            >
              <BarChart3 className="w-3 h-3 mr-1" />
              <span>Spectrum</span>
            </TabsTrigger>
          </TabsList>

          {/* Active Status Badge */}
          <Badge
            variant="outline"
            className={
              isPlaying
                ? 'bg-blue-50 text-blue-700 border-blue-200 font-mono text-[11px] py-1'
                : 'bg-slate-50 text-slate-600 border-slate-200 font-mono text-[11px] py-1'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isPlaying ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{audioSourceLabel}</span>
          </Badge>
        </div>
      </div>

      {/* Main High-Res Spectrogram Canvas */}
      <div className="w-full h-[220px] rounded-lg overflow-hidden bg-[#090d16] border border-slate-800 relative shadow-inner">
        <canvas
          ref={canvasRef}
          width={880}
          height={220}
          className="w-full h-full block"
        />
      </div>

      {/* Acoustic Telemetry Sub-bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-xs">
        {/* Color Palette Key */}
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          <span className="font-semibold text-slate-800">Energy Intensity:</span>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#0a1e3a]" />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#06b6d4]" />
            <span>Mid</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#8b5cf6]" />
            <span>Formants</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#f59e0b]" />
            <span>Harmonics</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-[2px] bg-[#ef4444]" />
            <span>Artifacts</span>
          </div>
        </div>

        {/* Live Acoustic Feature Metrics */}
        <div className="flex items-center gap-3.5 text-[11px] font-mono">
          <span className="text-slate-500">
            Fundamental F0:{' '}
            <strong className={isPlaying ? 'text-blue-600 font-bold' : 'text-slate-700 font-bold'}>
              {isPlaying && dominantFreqRef.current > 0 ? `${dominantFreqRef.current} Hz` : '—'}
            </strong>
          </span>
          <span className="text-slate-500">
            Nyquist: <strong className="text-slate-700 font-bold">8.0 kHz</strong>
          </span>
          <span className="text-slate-500">
            Temporal Smoothing: <strong className="text-blue-600 font-bold">EMA 85%</strong>
          </span>
        </div>
      </div>
    </Card>
  );
};

export default AudioOscilloscope;
