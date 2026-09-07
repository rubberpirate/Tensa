import React from 'react';
import type { CodecProfile } from '../types';
import { Phone, Radio, Wifi, Zap } from 'lucide-react';

interface CodecToggleProps {
  selectedCodec: CodecProfile;
  onSelectCodec: (codec: CodecProfile) => void;
}

export const CodecToggle: React.FC<CodecToggleProps> = ({ selectedCodec, onSelectCodec }) => {
  const codecs: { id: CodecProfile; name: string; desc: string; band: string; icon: React.ReactNode }[] = [
    {
      id: 'raw',
      name: 'Direct PCM',
      desc: '16 kHz studio uncompressed',
      band: '0 - 8000 Hz',
      icon: <Zap size={14} />,
    },
    {
      id: 'g711_ulaw',
      name: 'G.711 μ-law',
      desc: 'US/JP PSTN 8kHz companded',
      band: '300 - 3400 Hz',
      icon: <Phone size={14} />,
    },
    {
      id: 'g711_alaw',
      name: 'G.711 A-law',
      desc: 'EU/IN PSTN 8kHz companded',
      band: '300 - 3400 Hz',
      icon: <Phone size={14} />,
    },
    {
      id: 'amr_nb',
      name: 'AMR Narrowband',
      desc: '2G/3G Cellular GSM bandpass',
      band: '300 - 3400 Hz',
      icon: <Radio size={14} />,
    },
    {
      id: 'g722',
      name: 'G.722 HD Voice',
      desc: 'VoLTE & SIP wideband',
      band: '50 - 7000 Hz',
      icon: <Wifi size={14} />,
    },
    {
      id: 'voip_jitter',
      name: 'VoIP Packet Loss',
      desc: '5% burst loss simulation',
      band: 'Frame drops',
      icon: <Radio size={14} />,
    },
  ];

  return (
    <div
      className="clean-card"
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Carrier Codec Robustness
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Test detection resilience against telecom bandpass filters and loss
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
          Acoustic Transcoding
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
        }}
      >
        {codecs.map((c) => {
          const isSelected = selectedCodec === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelectCodec(c.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                background: isSelected ? 'var(--color-primary-light)' : '#ffffff',
                boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: isSelected ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                    {c.icon}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: isSelected ? 'var(--color-primary-text)' : 'var(--text-primary)',
                    }}
                  >
                    {c.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: isSelected ? 'var(--color-primary-text)' : 'var(--text-muted)',
                    background: isSelected ? 'var(--color-primary-border)' : 'var(--bg-card-subtle)',
                    padding: '2px 5px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  {c.band}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: isSelected ? 'var(--color-primary-text)' : 'var(--text-secondary)' }}>
                {c.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
