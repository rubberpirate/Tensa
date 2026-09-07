import React from 'react';
import { Radio, Zap, Cpu, CheckCircle2 } from 'lucide-react';

interface CallMetadataPanelProps {
  callId: string;
  durationSeconds: number;
  bayesianWindowCount: number;
  tier1LatencyMs: number;
  tier2LatencyMs: number | null;
  isConnected: boolean;
}

export const CallMetadataPanel: React.FC<CallMetadataPanelProps> = ({
  callId,
  durationSeconds,
  bayesianWindowCount,
  tier1LatencyMs,
  tier2LatencyMs,
  isConnected,
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const metrics = [
    {
      icon: <Radio size={18} color="var(--color-primary)" />,
      label: 'Call Session',
      value: `ID: ${callId.slice(0, 10)}`,
      detail: `${formatTime(durationSeconds)} • ${bayesianWindowCount} windows`,
      iconBg: 'var(--color-primary-light)',
    },
    {
      icon: <Zap size={18} color="#0284c7" />,
      label: 'Processing Latency',
      value: tier1LatencyMs > 0 ? `${tier1LatencyMs.toFixed(1)} ms` : 'Idle (<40ms budget)',
      detail: tier2LatencyMs ? `Deep GPU: ${tier2LatencyMs.toFixed(1)}ms` : 'Real-time DSP stream',
      iconBg: '#f0f9ff',
    },
    {
      icon: <Cpu size={18} color="#4f46e5" />,
      label: 'Inference Pipeline',
      value: tier2LatencyMs ? 'Dual-Tier Active' : (tier1LatencyMs > 0 ? 'Tier-1 Acoustic DSP' : 'Pipeline Ready'),
      detail: 'Continuous frame evaluation',
      iconBg: '#eef2ff',
    },
    {
      icon: <CheckCircle2 size={18} color={isConnected ? 'var(--color-safe)' : 'var(--text-muted)'} />,
      label: 'Engine Connection',
      value: isConnected ? 'Live Backend Connected' : 'Engine Standby',
      detail: isConnected ? 'FastAPI & PyTorch WebSocket' : 'Awaiting backend connection',
      iconBg: isConnected ? 'var(--color-safe-bg)' : 'var(--bg-card-subtle)',
    },
  ];

  return (
    <div
      className="clean-card"
      style={{
        padding: '16px 20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
      }}
    >
      {metrics.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: 'var(--radius-sm)',
              background: item.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {item.icon}
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
              {item.label}
            </div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.value}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {item.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
