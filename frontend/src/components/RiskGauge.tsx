import React, { useState, useEffect, useRef } from 'react';
import type { ThreatLevel, SessionSummary } from '../types';
import { ShieldAlert, AlertTriangle, Cpu, UserCheck, CheckCircle2, Shield, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface RiskGaugeProps {
  score: number; // 0.0 to 1.0 (AI synthetic probability)
  threatLevel: ThreatLevel;
  actionRecommended: string;
  isCompleted?: boolean;
  sessionSummary?: SessionSummary | null;
}

// 5 clean, quiet calibration ticks at 0%, 25%, 50%, 75%, 100%
const TICKS = (() => {
  const radius = 92;
  const cx = 120, cy = 120;
  const startAngle = 150;
  const sweepAngle = 240;
  const numTicks = 4;
  const list: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (let i = 0; i <= numTicks; i++) {
    const fraction = i / numTicks;
    const angleDeg = startAngle + fraction * sweepAngle;
    const rad = (angleDeg * Math.PI) / 180;
    const rOuter = radius + 9;
    const rInner = rOuter - 5;

    list.push({
      x1: +(cx + rOuter * Math.cos(rad)).toFixed(1),
      y1: +(cy + rOuter * Math.sin(rad)).toFixed(1),
      x2: +(cx + rInner * Math.cos(rad)).toFixed(1),
      y2: +(cy + rInner * Math.sin(rad)).toFixed(1),
    });
  }
  return list;
})();

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  threatLevel,
  actionRecommended,
  isCompleted = false,
  sessionSummary = null,
}) => {
  const isSessionMean = isCompleted && sessionSummary !== null;
  const effectiveScore = isSessionMean ? sessionSummary.meanScore : score;
  const effectiveThreat = isSessionMean ? sessionSummary.threatLevel : threatLevel;
  const effectiveAction = isSessionMean ? sessionSummary.actionRecommended : actionRecommended;

  // Target AI percentage
  const targetPercentage = Math.round(Math.min(1.0, Math.max(0.0, effectiveScore)) * 100);
  const peakPercentage = isSessionMean
    ? Math.round(Math.min(1.0, Math.max(0.0, sessionSummary.peakScore)) * 100)
    : targetPercentage;

  // Smooth synchronized animation for number, arc and bar
  const [displayNumber, setDisplayNumber] = useState(targetPercentage);
  const animRef = useRef<number | null>(null);
  const currentNumRef = useRef(targetPercentage);

  useEffect(() => {
    const startNum = currentNumRef.current;
    const endNum = targetPercentage;
    if (startNum === endNum) return;

    const duration = 250; // smooth 250ms ease
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Clean cubic ease-out
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const val = Math.round(startNum + (endNum - startNum) * easeOut);
      currentNumRef.current = val;
      setDisplayNumber(val);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [targetPercentage]);

  // Derived human percentage based on smoothly animated displayNumber
  const humanPercentage = 100 - displayNumber;

  // SVG Gauge calculations (240 deg arc on 240x240 box)
  const radius = 92;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * (240 / 360);
  const strokeDashoffset = arcLength - arcLength * (displayNumber / 100);

  const getTheme = () => {
    switch (effectiveThreat) {
      case 'RED':
        return {
          primary: '#dc2626',
          badgeVariant: 'destructive' as const,
          label: isSessionMean
            ? 'AI Synthetic Voice Clone'
            : 'AI Synthetic Clone Detected',
          subtext: isSessionMean
            ? `Mean AI confidence of ${displayNumber}% across ${sessionSummary?.windowCount || 0} evaluated audio frames`
            : 'Deep neural vocoder synthesis artifacts identified and confirmed',
          icon: <ShieldAlert className="w-4 h-4 text-rose-600" />,
        };
      case 'AMBER':
        return {
          primary: '#d97706',
          badgeVariant: 'warning' as const,
          label: isSessionMean
            ? 'Suspicious Vocal Anomalies'
            : 'Suspicious Anomalies',
          subtext: isSessionMean
            ? `Acoustic inconsistencies flagged (Mean: ${displayNumber}%, Peak: ${peakPercentage}%)`
            : 'Phase boundary discontinuity & vocoder cues flagged',
          icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
        };
      case 'GREEN':
      default:
        return {
          primary: '#16a34a',
          badgeVariant: 'success' as const,
          label: isSessionMean
            ? 'Authentic Human Voice'
            : 'Authentic Human Voice Verified',
          subtext: isSessionMean
            ? `Natural human micro-tremor verified across full ${sessionSummary?.durationSeconds.toFixed(1) || 0}s duration`
            : 'Natural biological respiration & micro-jitter confirmed',
          icon: <UserCheck className="w-4 h-4 text-emerald-600" />,
        };
    }
  };

  const theme = getTheme();

  return (
    <Card className="flex flex-col justify-between h-full bg-white border-slate-200/80 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between p-5 sm:p-6 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <CardTitle className="text-sm sm:text-base font-bold tracking-tight text-slate-900">
              {isSessionMean ? 'Overall Mean AI Detection %' : 'AI Voice Detection %'}
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-slate-500 mt-1">
            {isSessionMean
              ? `Audited across ${sessionSummary.durationSeconds.toFixed(1)}s audio duration (${sessionSummary.windowCount} windows)`
              : 'Neural & acoustic clone probability analysis'}
          </CardDescription>
        </div>

        {isSessionMean ? (
          <Badge variant="success" className="shrink-0 text-xs px-2.5 py-1 gap-1.5 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Completed Audit
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 text-xs px-2.5 py-1 gap-1.5 font-mono text-slate-600 bg-slate-50 border-slate-200">
            <Cpu className="w-3.5 h-3.5 text-blue-600" />
            AI Detector
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex flex-col items-center justify-between flex-1 p-5 sm:p-6 pt-2">
        {/* Minimal Precision Circular Meter */}
        <div className="relative w-[240px] h-[180px] flex justify-center mt-2">
          <svg width="240" height="240" viewBox="0 0 240 240" className="overflow-visible">
            {/* Subtle perimeter tick marks */}
            <g opacity="0.4">
              {TICKS.map((t, i) => (
                <line
                  key={i}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              ))}
            </g>

            {/* Background track */}
            <circle
              cx="120"
              cy="120"
              r={radius}
              fill="none"
              stroke="#f1f5f9"
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(150 120 120)"
            />

            {/* Active meter arc (Driven in lockstep with displayNumber) */}
            <circle
              cx="120"
              cy="120"
              r={radius}
              fill="none"
              stroke={theme.primary}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(150 120 120)"
              style={{ transition: 'stroke 0.25s ease' }}
            />
          </svg>

          {/* Center Readout */}
          <div className="absolute top-[36px] flex flex-col items-center justify-center select-none pointer-events-none">
            <div
              className="text-3xl font-extrabold font-mono tracking-tight leading-none"
              style={{ color: theme.primary }}
            >
              {displayNumber}
              <span className="text-lg font-bold ml-0.5">%</span>
            </div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mt-1.5 px-2 py-0.5 rounded bg-slate-100/90 border border-slate-200/80">
              {isSessionMean ? 'Overall Mean AI Score' : 'AI Generated'}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-1.5">
              <Activity className="w-3 h-3 text-slate-400" />
              <span>Human Likelihood: <strong className="text-slate-800 font-mono font-semibold">{humanPercentage}%</strong></span>
            </div>
            {isSessionMean && (
              <span className="mt-1.5 text-[10px] font-mono font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs">
                Peak Spike: {peakPercentage}%
              </span>
            )}
          </div>
        </div>

        {/* Minimal Progress Bar */}
        <div className="w-full mt-3 flex flex-col gap-1.5 px-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: theme.primary }}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: theme.primary }}
              />
              <span>AI Clone: <strong className="font-mono">{displayNumber}%</strong></span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-500 text-xs">
              <span>Human: <strong className="font-mono text-slate-700">{humanPercentage}%</strong></span>
            </span>
          </div>

          {/* Clean minimal progress bar */}
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden relative">
            <div
              className="h-full rounded-full"
              style={{
                width: `${displayNumber}%`,
                backgroundColor: theme.primary,
              }}
            />
          </div>
        </div>

        {/* Threat Level Badge & Forensic Subtext */}
        <div className="flex flex-col items-center gap-1 w-full mt-4">
          <Badge
            variant={theme.badgeVariant}
            className="px-4 py-1.5 text-xs font-bold gap-2 shadow-xs select-none rounded-lg"
          >
            {theme.icon}
            <span>{theme.label}</span>
          </Badge>
          <span className="text-xs text-slate-500 text-center px-4 leading-normal mt-1 max-w-[340px]">
            {theme.subtext}
          </span>
        </div>

        {/* Enforced Security Policy Footer */}
        <div className="mt-4 w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
            {isSessionMean ? 'Final Policy' : 'Enforced Policy'}
          </span>
          <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-800 shadow-2xs">
            {effectiveAction}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default RiskGauge;
