import React from 'react';
import { Radio, Zap, Cpu, CheckCircle2, WifiOff } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

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
      icon: <Radio className="w-4 h-4 text-blue-600" />,
      label: 'Call Session',
      value: `#${callId.slice(0, 10)}`,
      detail: `${formatTime(durationSeconds)} elapsed • ${bayesianWindowCount} windows`,
      iconBg: 'bg-blue-50 border-blue-100',
      badge: 'Active Call',
      badgeVariant: 'info' as const,
    },
    {
      icon: <Zap className="w-4 h-4 text-sky-600" />,
      label: 'Processing Latency',
      value: tier1LatencyMs > 0 ? `${tier1LatencyMs.toFixed(1)} ms` : 'Idle (<40ms budget)',
      detail: tier2LatencyMs ? `Deep GPU: ${tier2LatencyMs.toFixed(1)}ms` : 'Real-time DSP stream',
      iconBg: 'bg-sky-50 border-sky-100',
      badge: tier1LatencyMs > 0 ? `${tier1LatencyMs.toFixed(0)}ms Tier-1` : '<40ms',
      badgeVariant: 'secondary' as const,
    },
    {
      icon: <Cpu className="w-4 h-4 text-indigo-600" />,
      label: 'Inference Pipeline',
      value: tier2LatencyMs ? 'Dual-Tier Active' : tier1LatencyMs > 0 ? 'Tier-1 Acoustic DSP' : 'Pipeline Ready',
      detail: 'Continuous frame evaluation',
      iconBg: 'bg-indigo-50 border-indigo-100',
      badge: 'PyTorch / DSP',
      badgeVariant: 'secondary' as const,
    },
    {
      icon: isConnected ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      ) : (
        <WifiOff className="w-4 h-4 text-slate-400" />
      ),
      label: 'Engine Connection',
      value: isConnected ? 'FastAPI Synchronized' : 'Engine Standby',
      detail: isConnected ? 'WebSocket streaming active' : 'Awaiting socket connection',
      iconBg: isConnected ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-100 border-slate-200',
      badge: isConnected ? 'Online' : 'Offline',
      badgeVariant: isConnected ? ('success' as const) : ('outline' as const),
    },
  ];

  return (
    <Card className="p-0 bg-white border-slate-200/80 shadow-xs rounded-xl overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        {metrics.map((item, idx) => (
          <div
            key={idx}
            className="p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                {item.icon}
                <span>{item.label}</span>
              </span>
              <Badge variant={item.badgeVariant} className="text-[10px] px-2 py-0 font-medium">
                {item.badge}
              </Badge>
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900 font-mono tracking-tight block truncate">
                {item.value}
              </span>
              <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                {item.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
