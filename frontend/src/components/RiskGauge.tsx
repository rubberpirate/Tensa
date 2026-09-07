import React from 'react';
import type { ThreatLevel } from '../types';
import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';

interface RiskGaugeProps {
  score: number; // 0.0 to 1.0
  threatLevel: ThreatLevel;
  actionRecommended: string;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  threatLevel,
  actionRecommended,
}) => {
  const percentage = Math.round(score * 100);

  // SVG Gauge calculations (240 deg arc)
  const radius = 86;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * (240 / 360);
  const strokeDashoffset = arcLength - arcLength * Math.min(1.0, Math.max(0.0, score));

  const getTheme = () => {
    switch (threatLevel) {
      case 'RED':
        return {
          stroke: 'var(--color-danger)',
          bg: 'var(--color-danger-bg)',
          border: 'var(--color-danger-border)',
          text: 'var(--color-danger-text)',
          label: 'Synthetic Voice Clone',
          icon: <ShieldAlert size={16} color="var(--color-danger)" />,
        };
      case 'AMBER':
        return {
          stroke: 'var(--color-warn)',
          bg: 'var(--color-warn-bg)',
          border: 'var(--color-warn-border)',
          text: 'var(--color-warn-text)',
          label: 'Suspicious Acoustic Pattern',
          icon: <AlertTriangle size={16} color="var(--color-warn)" />,
        };
      case 'GREEN':
      default:
        return {
          stroke: 'var(--color-primary)',
          bg: 'var(--color-primary-light)',
          border: 'var(--color-primary-border)',
          text: 'var(--color-primary-text)',
          label: 'Authentic Human Voice',
          icon: <ShieldCheck size={16} color="var(--color-primary)" />,
        };
    }
  };

  const theme = getTheme();

  return (
    <div
      className="clean-card"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Threat Probability
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Real-time composite biometric risk
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
          Live Evaluation
        </span>
      </div>

      {/* Circular Meter */}
      <div style={{ position: 'relative', width: '210px', height: '165px', display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
        <svg width="210" height="210" viewBox="0 0 210 210" style={{ transform: 'rotate(150deg)' }}>
          {/* Background track */}
          <circle
            cx="105"
            cy="105"
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Active meter arc */}
          <circle
            cx="105"
            cy="105"
            r={radius}
            fill="none"
            stroke={theme.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.3s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease',
            }}
          />
        </svg>

        {/* Center Readout */}
        <div
          style={{
            position: 'absolute',
            top: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: '44px',
              fontWeight: 700,
              lineHeight: 1,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            {percentage}
            <span style={{ fontSize: '20px', fontWeight: 500, color: theme.stroke, marginLeft: '2px' }}>%</span>
          </div>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              marginTop: '4px',
              letterSpacing: '0.02em',
            }}
          >
            Risk Score
          </span>
        </div>
      </div>

      {/* Threat Level Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          background: theme.bg,
          border: `1px solid ${theme.border}`,
          marginTop: '4px',
        }}
      >
        {theme.icon}
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: theme.text,
          }}
        >
          {theme.label}
        </span>
      </div>

      {/* Action Recommended Footer */}
      <div
        style={{
          marginTop: '18px',
          width: '100%',
          padding: '10px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-card-subtle)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Policy Action</span>
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: theme.text,
            background: theme.bg,
            padding: '2px 8px',
            borderRadius: 'var(--radius-xs)',
            border: `1px solid ${theme.border}`,
          }}
        >
          {actionRecommended}
        </span>
      </div>
    </div>
  );
};
