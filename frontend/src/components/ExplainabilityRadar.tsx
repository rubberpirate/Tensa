import React from 'react';
import type { MetricsBreakdown } from '../types';

interface ExplainabilityRadarProps {
  metrics: MetricsBreakdown;
}

export const ExplainabilityRadar: React.FC<ExplainabilityRadarProps> = ({ metrics }) => {
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
  const size = 250;
  const center = size / 2;
  const radius = 90;
  const numAxes = axes.length;
  const rings = [0.25, 0.5, 0.75, 1.0];

  const avgValue = axes.reduce((acc, a) => acc + a.value, 0) / axes.length;
  const isHighRisk = avgValue > 0.5 || axes.some(a => a.value > 0.75);
  const isElevated = avgValue > 0.3 || axes.some(a => a.value > 0.5);

  const themeColor = isHighRisk
    ? 'var(--color-danger)'
    : isElevated
    ? 'var(--color-warn)'
    : 'var(--color-primary)';

  const fillColor = isHighRisk
    ? 'rgba(220, 38, 38, 0.15)'
    : isElevated
    ? 'rgba(217, 119, 6, 0.15)'
    : 'rgba(37, 99, 235, 0.12)';

  const points = axes.map((axis, i) => {
    const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
    const r = radius * Math.min(1.0, Math.max(0.08, axis.value));
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div
      className="clean-card"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Forensic Acoustic Breakdown
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            6-axis explainable signal decomposition
          </p>
        </div>
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-xs)',
            background: 'var(--bg-card-subtle)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          Acoustic Features
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 250px) 1fr', gap: '24px', alignItems: 'center' }}>
        {/* Radar Chart */}
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Concentric rings */}
            {rings.map((ring, idx) => (
              <polygon
                key={idx}
                points={axes.map((_, i) => {
                  const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
                  const r = radius * ring;
                  const x = center + r * Math.cos(angle);
                  const y = center + r * Math.sin(angle);
                  return `${x},${y}`;
                }).join(' ')}
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
              style={{
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
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
                  style={{ transition: 'all 0.3s ease' }}
                />
              );
            })}
          </svg>
        </div>

        {/* Breakdown Progress Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {axes.map((axis) => {
            const pct = Math.round(axis.value * 100);
            const isHigh = axis.value > 0.65;
            const isMed = axis.value > 0.35;
            const barColor = isHigh
              ? 'var(--color-danger)'
              : isMed
              ? 'var(--color-warn)'
              : 'var(--color-primary)';

            return (
              <div key={axis.key} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {axis.label}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      ({axis.weight})
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: barColor }}>
                    {pct}%
                  </span>
                </div>

                <div
                  style={{
                    height: '6px',
                    width: '100%',
                    background: '#f1f5f9',
                    borderRadius: 'var(--radius-full)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: '100%',
                      transform: `scaleX(${Math.min(1, Math.max(0, axis.value))})`,
                      transformOrigin: 'left',
                      background: barColor,
                      borderRadius: 'var(--radius-full)',
                      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
