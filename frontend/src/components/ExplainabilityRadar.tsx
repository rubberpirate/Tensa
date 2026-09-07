import React from 'react';
import type { MetricsBreakdown } from '../types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Radar } from 'lucide-react';

interface ExplainabilityRadarProps {
  metrics: MetricsBreakdown;
  isSessionMean?: boolean;
}

export const ExplainabilityRadar: React.FC<ExplainabilityRadarProps> = ({
  metrics,
  isSessionMean = false,
}) => {
  const axes = [
    {
      key: 'bicoherence',
      label: 'Bispectrum Deficit',
      value: metrics.bicoherence_deficit,
      desc: 'Non-linear phase coupling failure in vocoders',
      weight: '30%',
    },
    {
      key: 'phase',
      label: 'Phase Inconsistency',
      value: metrics.phase_inconsistency,
      desc: 'STFT inversion boundary discontinuity',
      weight: '25%',
    },
    {
      key: 'jitter',
      label: 'Micro-Pitch Anomaly',
      value: metrics.pitch_jitter_anomaly,
      desc: 'Absence of natural vocal cord micro-tremor',
      weight: '20%',
    },
    {
      key: 'spectral',
      label: 'Spectral Flatness',
      value: metrics.spectral_rolloff_anomaly,
      desc: 'High-frequency energy cutoff artifacts',
      weight: '15%',
    },
    {
      key: 'respiration',
      label: 'Respiration Cadence',
      value: metrics.respiration_cadence_score,
      desc: 'Absence of biological breath inhalation pauses',
      weight: '10%',
    },
    {
      key: 'neural',
      label: 'Neural Classifier',
      value: metrics.s_deep !== null ? metrics.s_deep : metrics.s_fast,
      desc: 'Transformer acoustic model prediction',
      weight: 'Tier-2',
    },
  ];

  // SVG Radar calculations
  const size = 230;
  const center = size / 2;
  const radius = 82;
  const numAxes = axes.length;
  const rings = [0.25, 0.5, 0.75, 1.0];

  const avgValue = axes.reduce((acc, a) => acc + a.value, 0) / axes.length;
  const isHighRisk = avgValue > 0.5 || axes.some((a) => a.value > 0.75);
  const isElevated = avgValue > 0.3 || axes.some((a) => a.value > 0.5);

  const themeColor = isHighRisk ? '#dc2626' : isElevated ? '#d97706' : '#2563eb';
  const fillColor = isHighRisk
    ? 'rgba(220, 38, 38, 0.16)'
    : isElevated
    ? 'rgba(217, 119, 6, 0.16)'
    : 'rgba(37, 99, 235, 0.14)';

  const points = axes
    .map((axis, i) => {
      const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
      const r = radius * Math.min(1.0, Math.max(0.08, axis.value));
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Card className="flex flex-col justify-between h-full bg-white border-slate-200/80 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between p-5 sm:p-6 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 border border-slate-200/60 flex items-center justify-center shrink-0">
            <Radar className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
              Forensic Acoustic Decomposition
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              {isSessionMean
                ? 'Mean feature vector averaged over complete call duration'
                : '6-axis explainable biometric artifact decomposition'}
            </CardDescription>
          </div>
        </div>
        <Badge
          variant={isSessionMean ? 'success' : 'outline'}
          className="shrink-0 text-[11px] font-medium"
        >
          {isSessionMean ? 'Session Fingerprint' : 'Acoustic Vector'}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col justify-center flex-1 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-[210px_1fr] gap-5 items-center">
          {/* Radar Chart */}
          <div className="flex justify-center relative py-1">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              {/* Concentric rings */}
              {rings.map((ring, idx) => (
                <polygon
                  key={idx}
                  points={axes
                    .map((_, i) => {
                      const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
                      const r = radius * ring;
                      const x = center + r * Math.cos(angle);
                      const y = center + r * Math.sin(angle);
                      return `${x},${y}`;
                    })
                    .join(' ')}
                  fill={idx === rings.length - 1 ? '#f8fafc' : 'none'}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray={idx < rings.length - 1 ? '3 3' : 'none'}
                />
              ))}

              {/* Radial axes */}
              {axes.map((_, i) => {
                const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
                const x = center + radius * Math.cos(angle);
                const y = center + radius * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1={center}
                    y1={center}
                    x2={x}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Radar Data Polygon */}
              <polygon
                points={points}
                fill={fillColor}
                stroke={themeColor}
                strokeWidth="2"
                className="transition-all duration-300 ease-out"
              />

              {/* Data Point Dots */}
              {axes.map((axis, i) => {
                const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
                const r = radius * Math.min(1.0, Math.max(0.08, axis.value));
                const x = center + r * Math.cos(angle);
                const y = center + r * Math.sin(angle);
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill={themeColor}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="transition-all duration-300"
                  />
                );
              })}
            </svg>
          </div>

          {/* Breakdown Progress Bars */}
          <div className="flex flex-col gap-2.5">
            {axes.map((axis) => {
              const pct = Math.round(axis.value * 100);
              const isHigh = axis.value > 0.65;
              const isMed = axis.value > 0.35;
              const barColor = isHigh ? 'bg-rose-600' : isMed ? 'bg-amber-500' : 'bg-blue-600';
              const textColor = isHigh ? 'text-rose-600' : isMed ? 'text-amber-600' : 'text-blue-600';

              return (
                <div key={axis.key} className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-slate-800 text-[11px] truncate">
                        {axis.label}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({axis.weight})
                      </span>
                    </div>
                    <span className={`font-mono font-bold text-[11px] ${textColor}`}>
                      {pct}%
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExplainabilityRadar;
