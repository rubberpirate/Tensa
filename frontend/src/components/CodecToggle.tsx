import React from 'react';
import type { CodecProfile } from '../types';
import { Phone, Radio, Wifi, Zap, Activity } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

interface CodecToggleProps {
  selectedCodec: CodecProfile;
  onSelectCodec: (codec: CodecProfile) => void;
  compact?: boolean;
}

export const CodecToggle: React.FC<CodecToggleProps> = ({
  selectedCodec,
  onSelectCodec,
  compact = false,
}) => {
  const codecs: {
    id: CodecProfile;
    name: string;
    desc: string;
    band: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'raw',
      name: 'Direct PCM',
      desc: '16 kHz studio uncompressed',
      band: '0 - 8000 Hz',
      icon: <Zap className="w-3.5 h-3.5" />,
    },
    {
      id: 'g711_ulaw',
      name: 'G.711 μ-law',
      desc: 'US/JP PSTN 8kHz companded',
      band: '300 - 3400 Hz',
      icon: <Phone className="w-3.5 h-3.5" />,
    },
    {
      id: 'g711_alaw',
      name: 'G.711 A-law',
      desc: 'EU/IN PSTN 8kHz companded',
      band: '300 - 3400 Hz',
      icon: <Phone className="w-3.5 h-3.5" />,
    },
    {
      id: 'amr_nb',
      name: 'AMR Narrowband',
      desc: '2G/3G Cellular GSM bandpass',
      band: '300 - 3400 Hz',
      icon: <Radio className="w-3.5 h-3.5" />,
    },
    {
      id: 'g722',
      name: 'G.722 HD Voice',
      desc: 'VoLTE & SIP wideband',
      band: '50 - 7000 Hz',
      icon: <Wifi className="w-3.5 h-3.5" />,
    },
    {
      id: 'voip_jitter',
      name: 'VoIP Packet Loss',
      desc: '5% burst loss simulation',
      band: 'Frame drops',
      icon: <Activity className="w-3.5 h-3.5" />,
    },
  ];

  if (compact) {
    return (
      <div className="flex items-center gap-1 overflow-x-auto py-1">
        {codecs.map((c) => {
          const isSelected = selectedCodec === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelectCodec(c.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all shrink-0 cursor-pointer border',
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              )}
              title={`${c.name}: ${c.desc} (${c.band})`}
            >
              {c.icon}
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <Card className="bg-white border-slate-200/80 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between p-5 sm:p-6 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 border border-slate-200/60 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Carrier Codec Robustness
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] font-normal py-0 text-slate-600 bg-slate-50 border-slate-200">
                Acoustic Transcoding
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Evaluate neural defense resilience against telephony bandpass filters, companding, and packet loss
            </CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="hidden sm:inline-flex text-[11px] font-mono">
          Active: {codecs.find((c) => c.id === selectedCodec)?.name}
        </Badge>
      </CardHeader>
      <CardContent className="p-5 sm:p-6 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {codecs.map((c) => {
            const isSelected = selectedCodec === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelectCodec(c.id)}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-lg text-left transition-all cursor-pointer border select-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 text-blue-900 shadow-xs ring-1 ring-blue-500/20'
                    : 'bg-slate-50/60 border-slate-200/80 text-slate-700 hover:bg-white hover:border-slate-300 shadow-2xs'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={isSelected ? 'text-blue-600' : 'text-slate-500'}>
                    {c.icon}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] font-mono px-1.5 py-0.5 rounded font-medium',
                      isSelected
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-200/70 text-slate-600'
                    )}
                  >
                    {c.band}
                  </span>
                </div>
                <div className="font-bold text-xs leading-tight mt-1">{c.name}</div>
                <div className="text-[10px] text-slate-500 leading-snug line-clamp-2 mt-0.5">
                  {c.desc}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
